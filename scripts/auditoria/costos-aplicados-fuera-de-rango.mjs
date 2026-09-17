// scripts/auditoria/costos-aplicados-fuera-de-rango.mjs
//
// QUÉ COSTOS SE ESCRIBIERON FUERA DEL RANGO QUE EL PROVEEDOR TENÍA CONFIGURADO.
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// Hasta `27c70832` nada volvía a controlar el rango en el momento de aplicar. El
// estado de una fila se congela al conciliar, `clasificarLinea` nunca miró el
// rango, y la rama de las filas confirmadas se salteaba el cálculo entero. Con
// eso, una fila que quedó LISTO con un +1.008 % sobre un proveedor que aumenta
// entre 2 y 15 se aplicaba sin que nada preguntara.
//
// Desde `27c70832` eso no puede volver a pasar: aplicar revisa el rango fila por
// fila y rechaza todo lo que esté afuera y nadie haya elegido explícitamente.
// Pero LO QUE YA SE ESCRIBIÓ, se escribió. Este script lo busca.
//
// ── POR QUÉ UN SCRIPT Y NO UNA PANTALLA ────────────────────────────────────
//
// Porque es una pregunta de UNA vez, sobre el pasado, y la contesta quien
// despliega. Una pantalla para eso sería una pantalla que dentro de un mes no
// mira nadie y que hay que mantener igual.
//
// ── SOLO LECTURA, Y SE PUEDE COMPROBAR ─────────────────────────────────────
//
// Pide el cliente en nivel LECTURA, que es el único que la fábrica deja apuntar
// a un host que no sea local. Ese nivel es también lo que hace que este script
// PUEDA correr contra producción: los otros dos abortan si el host no es local.
//
// No hay una sola llamada de escritura acá adentro, ni transacciones. El candado
// de al lado lo afirma leyendo el fuente, así que agregar un `update` lo pone en
// rojo.
//
// ── QUÉ RANGO SE USA PARA JUZGAR ───────────────────────────────────────────
//
// El CONGELADO EN LA FILA, y recién si falta, el de la cabecera. Es el mismo
// orden que usa `rangoDeLaFila` en el motor: lo que se decidió con la fila manda
// sobre lo que el proveedor tenga configurado hoy. Sin eso, cambiarle el rango a
// un proveedor reescribiría el veredicto sobre decisiones viejas y el informe
// diría que se escribieron mal costos que en su momento estaban bien.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/auditoria/costos-aplicados-fuera-de-rango.mjs [--json] [--grupo N]

import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

const args = process.argv.slice(2);
const pide = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i > -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const COMO_JSON = args.includes("--json");
const GRUPO = Number(pide("grupo")) || null;

const numero = (v) => (v === null || v === undefined ? null : Number(v));

const plata = (v) =>
  Number.isFinite(Number(v))
    ? Number(v).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })
    : "—";

// Con coma decimal, como el resto del sistema. Un informe que dice "+99.5 %" al
// lado de una pantalla que dice "+99,5 %" obliga a mirar dos veces para
// confirmar que es el mismo número.
const porcentaje = (v) =>
  Number.isFinite(Number(v))
    ? `${Number(v) > 0 ? "+" : ""}${Number(v).toLocaleString("es-AR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} %`
    : "—";

/**
 * ¿Este porcentaje queda fuera del rango?
 *
 * Se escribe acá y no se importa del motor a propósito: el motor lo decide sobre
 * la fila entera —mirando confirmaciones, vínculos y aceptaciones— y lo que este
 * informe necesita es la pregunta desnuda, sobre el número que quedó guardado.
 * Importar `quedaFueraDelRango` traería toda esa lógica y el informe pasaría a
 * contestar otra cosa.
 *
 * Un cero no está afuera de nada: ése es un costo que no se movió.
 */
function fuera(pct, min, max) {
  if (min === null || max === null || pct === null) return false;
  if (pct === 0) return false;
  return pct < min || pct > max;
}

async function main() {
  const db = await crearClientePrisma({ nivel: LECTURA });

  // Las importaciones que escribieron algo. Una sin filas aplicadas no puede
  // haber escrito un costo, así que no se la mira.
  const importaciones = await db.importacionListaProveedor.findMany({
    where: {
      ...(GRUPO ? { grupoId: GRUPO } : {}),
      filas: { some: { aplicada: true } },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      grupoId: true,
      estado: true,
      archivoNombre: true,
      createdAt: true,
      conciliadaEn: true,
      aumentoEsperadoMinPct: true,
      aumentoEsperadoMaxPct: true,
      proveedor: { select: { id: true, nombre: true } },
    },
  });

  const informe = [];

  for (const imp of importaciones) {
    const minCab = numero(imp.aumentoEsperadoMinPct);
    const maxCab = numero(imp.aumentoEsperadoMaxPct);

    const filas = await db.importacionListaFila.findMany({
      where: { importacionId: imp.id, aplicada: true },
      orderBy: { filaExcel: "asc" },
      select: {
        id: true,
        filaExcel: true,
        codigoCrudo: true,
        descripcionProveedor: true,
        costoAnterior: true,
        costoAplicado: true,
        costoMaestroPropuesto: true,
        diferenciaPct: true,
        aumentoEsperadoMinPct: true,
        aumentoEsperadoMaxPct: true,
        fueraDeRangoAceptadaEn: true,
        aplicadaEn: true,
        productoBase: { select: { id: true, nombre: true } },
      },
    });

    const afuera = [];
    for (const f of filas) {
      // El rango de LA FILA gana; el de la cabecera es el respaldo.
      const min = numero(f.aumentoEsperadoMinPct) ?? minCab;
      const max = numero(f.aumentoEsperadoMaxPct) ?? maxCab;
      const pct = numero(f.diferenciaPct);
      if (!fuera(pct, min, max)) continue;
      afuera.push({
        filaId: f.id,
        filaExcel: f.filaExcel,
        productoBaseId: f.productoBase?.id ?? null,
        producto: f.productoBase?.nombre || f.descripcionProveedor || `código ${f.codigoCrudo}`,
        costoAnterior: numero(f.costoAnterior),
        // El que se ESCRIBIÓ, no el que se proponía: son distintos cuando alguien
        // cambió la lectura entre conciliar y aplicar, y lo que este informe
        // busca es lo que quedó en el producto.
        costoEscrito: numero(f.costoAplicado) ?? numero(f.costoMaestroPropuesto),
        variacionPct: pct,
        rango: { minPct: min, maxPct: max },
        // La marca que distingue "lo eligió una persona sabiendo" de "se coló".
        // Antes de 27c70832 la columna no existía, así que TODO lo viejo llega
        // en null: eso no prueba que nadie lo eligiera, prueba que no se sabe.
        loEligioUnaPersona: f.fueraDeRangoAceptadaEn !== null,
        aplicadaEn: f.aplicadaEn,
      });
    }

    if (afuera.length === 0) continue;

    informe.push({
      importacionId: imp.id,
      grupoId: imp.grupoId,
      proveedor: imp.proveedor?.nombre ?? `#${imp.proveedorId}`,
      archivo: imp.archivoNombre,
      estado: imp.estado,
      leidaEn: imp.conciliadaEn ?? imp.createdAt,
      rangoConfigurado: { minPct: minCab, maxPct: maxCab },
      aplicadas: filas.length,
      fueraDeRango: afuera.length,
      // Las elegidas a mano se cuentan aparte: son legítimas y no son el
      // problema que este informe busca.
      sinElegir: afuera.filter((x) => !x.loEligioUnaPersona).length,
      filas: afuera,
    });
  }

  await db.$disconnect();

  if (COMO_JSON) {
    console.log(JSON.stringify({ importaciones: informe }, null, 2));
    return;
  }

  imprimir(informe, importaciones.length);
}

function imprimir(informe, cuantasSeMiraron) {
  console.log("");
  console.log("COSTOS APLICADOS FUERA DEL RANGO CONFIGURADO");
  console.log("=".repeat(60));
  console.log(`Importaciones con costos escritos: ${cuantasSeMiraron}`);

  if (informe.length === 0) {
    console.log("");
    console.log("Ninguna escribió un costo fuera del rango. Nada que revisar.");
    console.log("");
    return;
  }

  const totalFilas = informe.reduce((a, x) => a + x.fueraDeRango, 0);
  const totalSinElegir = informe.reduce((a, x) => a + x.sinElegir, 0);
  console.log(`Con costos fuera de rango:         ${informe.length}`);
  console.log(`Costos fuera de rango:             ${totalFilas}`);
  console.log(`De ésos, que NADIE eligió:         ${totalSinElegir}`);
  console.log("");

  for (const imp of informe) {
    const r = imp.rangoConfigurado;
    console.log("-".repeat(60));
    console.log(
      `#${imp.importacionId} · ${imp.proveedor} · ${imp.archivo} · ${imp.estado}`
    );
    console.log(
      `  Rango configurado: ${porcentaje(r.minPct)} a ${porcentaje(r.maxPct)} · ` +
        `${imp.fueraDeRango} de ${imp.aplicadas} costos escritos quedaron afuera`
    );
    console.log("");
    for (const f of imp.filas) {
      const marca = f.loEligioUnaPersona ? "  [elegido a mano]" : "";
      console.log(`  · ${f.producto}${marca}`);
      console.log(
        `      ${plata(f.costoAnterior)} → ${plata(f.costoEscrito)}   ${porcentaje(f.variacionPct)}` +
          `   (esperaba ${porcentaje(f.rango.minPct)} a ${porcentaje(f.rango.maxPct)})`
      );
    }
    console.log("");
  }

  console.log("-".repeat(60));
  console.log("Este informe NO corrige nada: solo mira. Los costos que haya que");
  console.log("arreglar se arreglan desde la aplicación, producto por producto.");
  console.log("");
}

main().catch((e) => {
  console.error("Falló la auditoría:", e?.message ?? e);
  process.exit(1);
});
