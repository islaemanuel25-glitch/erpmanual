// scripts/reconciliar-importacion-lista.mjs
//
// Vuelve a conciliar una importación YA GUARDADA con el motor actual, sin
// volver a subir el archivo.
//
// PARA QUÉ EXISTE
//
// El macheo evoluciona: se agregan vínculos a mano, se corrige el catálogo, o
// cambia la regla —como el fallback por sufijo numérico—. Una importación
// conciliada con la regla vieja quedaría mostrando "sin vincular" filas que hoy
// sí encuentran producto, y la única alternativa sería volver a subir el mismo
// Excel, que además chocaría contra el índice de archivo único.
//
// QUÉ TOCA Y QUÉ NO
//
// Toca las filas de la importación y los contadores de su cabecera. NO toca
// ProductoBase ni ProductoLocal: ni un costo, ni un precio de venta, ni un
// margen. Tampoco toca `aplicada` ni el historial de aplicación de una fila que
// ya se aplicó: reconciliar no deshace lo aplicado.
//
// Por defecto SIMULA. Para escribir hay que pasar --escribir explícitamente.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/reconciliar-importacion-lista.mjs --id 1 [--escribir]

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

import { cargarDatosDeConciliacion } from "../lib/proveedores/listas/cargaErp.js";
import { conciliarLista, TIPO_COINCIDENCIA, digitosDeSufijo } from "../lib/proveedores/listas/conciliarLista.js";
import { CONFIG_ARCOR } from "../lib/proveedores/listas/configuraciones/arcor.js";
import { filaAPersistir, contadoresDeCabecera, OPCIONES_TX } from "../lib/proveedores/listas/persistencia.js";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const args = process.argv.slice(2);
const ID = Number(args[args.indexOf("--id") + 1]);
const ESCRIBIR = args.includes("--escribir");

if (!Number.isInteger(ID) || ID <= 0) {
  console.error("Falta --id <importacionId>");
  process.exit(1);
}

/** Cuenta por tipo de coincidencia, separando los sufijos por longitud. */
function contarCoincidencias(filas) {
  const c = {
    exactas: 0, sinCeros: 0,
    sufijo8: 0, sufijo7: 0, sufijo6: 0, sufijo5: 0, sufijo4: 0,
    codigoBarra: 0, ambiguas: 0, sinVincular: 0,
    sugerenciasNombre: 0,
  };
  for (const f of filas) {
    const t = f.tipoCoincidencia;
    if (t === TIPO_COINCIDENCIA.CODIGO_INTERNO) c.exactas++;
    else if (t === TIPO_COINCIDENCIA.CODIGO_INTERNO_SIN_CEROS) c.sinCeros++;
    else if (t === TIPO_COINCIDENCIA.CODIGO_BARRA) c.codigoBarra++;
    else if (t === TIPO_COINCIDENCIA.AMBIGUA) c.ambiguas++;
    else if (t === TIPO_COINCIDENCIA.NINGUNA) c.sinVincular++;
    else {
      const d = digitosDeSufijo(t);
      if (d) c[`sufijo${d}`]++;
    }
    // Una sugerencia sin código de barras es la de NOMBRE: el código de barras
    // ya no sugiere, machea.
    if (f.sugerenciaProductoBaseId && !f.sugerenciaCodigoBarra) c.sugerenciasNombre++;
  }
  return c;
}

function contarEstados(filas) {
  const c = {};
  for (const f of filas) c[f.estado] = (c[f.estado] ?? 0) + 1;
  return c;
}

async function main() {
  const cab = await prisma.importacionListaProveedor.findUnique({
    where: { id: ID },
    include: { proveedor: { select: { id: true, nombre: true } } },
  });
  if (!cab) {
    console.error(`No existe la importación ${ID}.`);
    process.exit(1);
  }

  console.log(`\n=== RECONCILIAR importación ${ID} ===`);
  console.log(`proveedor : ${cab.proveedor.nombre}`);
  console.log(`archivo   : ${cab.archivoNombre}`);
  console.log(`estado    : ${cab.estado}`);
  console.log(`filas     : ${cab.totalFilas}`);
  console.log(`modo      : ${ESCRIBIR ? "ESCRIBIR" : "SIMULACIÓN (no escribe nada)"}`);

  if (cab.estado === "APLICADA") {
    console.error("\nLa importación ya fue APLICADA. Reconciliar una lista aplicada");
    console.error("cambiaría la explicación de costos que ya se escribieron. Se aborta.");
    process.exit(1);
  }

  const filasGuardadas = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID },
    orderBy: [{ hojaNombre: "asc" }, { filaExcel: "asc" }],
  });

  const antes = {
    coincidencias: contarCoincidencias(filasGuardadas),
    estados: contarEstados(filasGuardadas),
  };

  // Las filas vuelven a la forma que espera el motor. Los datos del PROVEEDOR
  // salen de lo guardado —el archivo ya no está— y los del ERP se releen frescos.
  const filasMotor = filasGuardadas.map((f) => ({
    filaExcel: f.filaExcel,
    hojaNombre: f.hojaNombre,
    codigoCrudo: f.codigoCrudo,
    codigoNormalizado: f.codigoNormalizado,
    codigoComparableSinCeros: f.codigoComparableSinCeros,
    codigoBarraProveedor: f.codigoBarraProveedor,
    descripcionProveedor: f.descripcionProveedor,
    categoriaCruda: f.categoriaCruda,
    unidadProveedor: f.unidadProveedor,
    unidadesPorBulto: f.unidadesPorBulto,
    precioConIva: Number(f.precioConIva),
    precioSinIva: f.precioSinIva === null ? null : Number(f.precioSinIva),
  }));

  const datos = await cargarDatosDeConciliacion(
    { grupoId: cab.grupoId, proveedorId: cab.proveedorId, localId: cab.localOperativoId },
    prisma
  );
  // Consulta directa en vez de lib/visibilidad: ese módulo importa el cliente
  // compartido y con él el interceptor de auditoría, que no resuelve fuera del
  // bundle de Next. Es un findFirst de una línea, no hay lógica que duplicar.
  const gd = await prisma.grupoDeposito.findFirst({ where: { grupoId: cab.grupoId }, select: { localId: true } });
  const depositoLocalId = gd?.localId ?? null;

  // El recargo que vale es el GUARDADO en la importación, no el default de la
  // configuración: la propuesta que el usuario vio se calculó con ese.
  const config = { ...CONFIG_ARCOR, recargoPct: Number(cab.recargoPct), umbralVariacionPct: Number(cab.umbralVariacionPct) };

  console.log(`
UNIVERSO: ${datos.diagnostico.productosDelProveedor} productos del ERP asociados a este proveedor`);
  console.log(`  por relación → principal ${datos.diagnostico.productosPorRelacion.principal}` +
    ` · secundario ${datos.diagnostico.productosPorRelacion.secundario}` +
    ` · terciario ${datos.diagnostico.productosPorRelacion.terciario}`);
  console.log(`  vínculos de código: ${datos.diagnostico.vinculosEnUniverso} dentro del universo, ` +
    `${datos.diagnostico.vinculosFueraDelUniverso} descartados por apuntar afuera`);

  const conciliacion = conciliarLista({
    filas: filasMotor,
    productos: datos.productos,
    codigosProveedor: datos.codigosProveedor,
    contexto: {
      grupoId: cab.grupoId,
      proveedorId: cab.proveedorId,
      operandoEnLocalId: cab.localOperativoId,
      depositoLocalId,
    },
    config,
  });

  const nuevas = conciliacion.filas.map(filaAPersistir);
  const despues = {
    coincidencias: contarCoincidencias(nuevas),
    estados: contarEstados(nuevas),
  };

  const linea = (k, a, b) => {
    const d = b - a;
    const signo = d > 0 ? `+${d}` : String(d);
    console.log(`  ${k.padEnd(22)} ${String(a).padStart(5)} → ${String(b).padStart(5)}  ${d === 0 ? "" : signo}`);
  };

  console.log("\n── COINCIDENCIAS ──");
  for (const k of ["exactas", "sinCeros", "sufijo8", "sufijo7", "sufijo6", "sufijo5", "sufijo4", "codigoBarra", "sugerenciasNombre", "ambiguas", "sinVincular"]) {
    linea(k, antes.coincidencias[k], despues.coincidencias[k]);
  }

  console.log("\n── ESTADOS ──");
  const estados = new Set([...Object.keys(antes.estados), ...Object.keys(despues.estados)]);
  for (const e of [...estados].sort()) {
    linea(e, antes.estados[e] ?? 0, despues.estados[e] ?? 0);
  }

  // Comprobación dura: reconciliar NO puede cambiar la cantidad de filas.
  if (nuevas.length !== filasGuardadas.length) {
    console.error(`\nABORTA: el motor devolvió ${nuevas.length} filas y había ${filasGuardadas.length}.`);
    process.exit(1);
  }

  const yaAplicadas = filasGuardadas.filter((f) => f.aplicada).length;
  if (yaAplicadas > 0) {
    console.log(`\nNota: ${yaAplicadas} filas ya aplicadas conservan su historial y su marca.`);
  }

  if (!ESCRIBIR) {
    console.log("\nSIMULACIÓN: no se escribió nada. Agregá --escribir para aplicar.");
    await prisma.$disconnect();
    return;
  }

  // ── Escritura ─────────────────────────────────────────────────────────────
  //
  // Una transacción. Solo filas y cabecera; ni una consulta de escritura contra
  // productos.
  const porClave = new Map(filasGuardadas.map((f) => [`${f.hojaNombre}|${f.filaExcel}`, f]));
  let actualizadas = 0;

  await prisma.$transaction(async (tx) => {
    for (const n of nuevas) {
      const vieja = porClave.get(`${n.hojaNombre}|${n.filaExcel}`);
      if (!vieja) continue;

      const data = {
        productoBaseId: n.productoBaseId,
        tipoCoincidencia: n.tipoCoincidencia,
        sufijoDigitos: n.sufijoDigitos,
        sugerenciaProductoBaseId: n.sugerenciaProductoBaseId,
        sugerenciaCodigoBarra: n.sugerenciaCodigoBarra,
        costoAnterior: n.costoAnterior,
        montoRecargo: n.montoRecargo,
        precioConRecargo: n.precioConRecargo,
        factorErp: n.factorErp,
        costoUnitarioCalculado: n.costoUnitarioCalculado,
        costoMaestroPropuesto: n.costoMaestroPropuesto,
        diferencia: n.diferencia,
        diferenciaPct: n.diferenciaPct,
        variacionAlta: n.variacionAlta,
        estado: n.estado,
        motivo: n.motivo,
        seleccionable: n.seleccionable,
      };

      // Una fila ya aplicada no vuelve atrás: conserva su marca, su costo
      // aplicado y su historial. Reconciliar explica, no deshace.
      if (vieja.aplicada) {
        delete data.estado;
        delete data.seleccionable;
      } else {
        // La selección se pierde: el estado pudo cambiar y arrastrar una marca
        // vieja haría que se aplique algo que el usuario no volvió a mirar.
        data.seleccionada = false;
      }

      await tx.importacionListaFila.update({ where: { id: vieja.id }, data });
      actualizadas++;
    }

    const contadores = contadoresDeCabecera(conciliacion);
    await tx.importacionListaProveedor.update({
      where: { id: ID },
      data: { ...contadores, conciliadaEn: new Date() },
    });
  }, { maxWait: 20000, timeout: 300000 });

  console.log(`\nESCRITO: ${actualizadas} filas actualizadas y contadores recalculados.`);
  console.log("No se tocó ningún costo ni precio de venta.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("\nERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
