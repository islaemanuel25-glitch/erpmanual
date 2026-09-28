// EL STOCK DIARIO DE UN LOCAL, MIRADO DESDE LA TERMINAL. SOLO LECTURA.
//
//   DATABASE_URL=… node --import ./scripts/alias-loader.mjs scripts/stock-diario.mjs \
//       --local <id> --dia YYYY-MM-DD [--hasta YYYY-MM-DD] [--producto <productoLocalId>] [--movimientos]
//
// Sin `--hasta` es un día; con `--hasta` es el período. Con `--producto` muestra
// esa cadena con el detalle de cada movimiento; sin él, todas las cadenas del
// local que existieron en el período y los totales. `--movimientos` agrega los
// movimientos del día del local entero.
//
// Todo se deriva de `MovimientoStock` al consultar
// (`lib/stock/libro/stockDiarioServer.js`): no escribe, no guarda fotos y no
// deja nada para después. "Hoy" lo decide PostgreSQL. Nivel LECTURA: la URL la
// pone el operador y la consulta corre en una transacción READ ONLY.

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: LECTURA });

const { PUNTO_CERO_PRODUCCION, EXISTENCIA, ErrorStockDiario } = await import("../lib/stock/libro/stockDiario.js");
const server = await import("../lib/stock/libro/stockDiarioServer.js");

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}
const bandera = (nombre) => process.argv.includes(`--${nombre}`);

const numero = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-AR", { maximumFractionDigits: 3 }));

/** Un saldo con su existencia: el número solo si existe. */
function saldo(e) {
  if (e.existencia === EXISTENCIA.EXISTE) return `${numero(e.cantidad)} (tránsito ${numero(e.enTransito)})${e.provisional ? " provisional" : ""}`;
  if (e.existencia === EXISTENCIA.NO_EXISTE) return "no existe";
  return `desconocida (${e.motivo})`;
}

function movido(m) {
  const partes = [];
  if (m.puntoDePartida) partes.push(`punto de partida ${numero(m.puntoDePartida)}`);
  if (m.entradas) partes.push(`+${numero(m.entradas)}`);
  if (m.salidas) partes.push(`−${numero(m.salidas)}`);
  if (m.apareceCon) partes.push(`aparece con ${numero(m.apareceCon)}`);
  if (m.desapareceCon) partes.push(`desaparece con ${numero(m.desapareceCon)}`);
  return partes.join(", ") || "sin cambios";
}

function lineaDeCadena(c) {
  const nombre = c.identidad?.nombre ?? "(sin identidad)";
  const marcas = [
    c.identidad?.productoEliminado ? "eliminado" : null,
    c.reinterpretada ? "UNIDAD REINTERPRETADA" : null,
    c.sinClasificar ? `${c.sinClasificar} sin clasificar` : null,
    c.cuadra && !(c.cuadra.cantidad && c.cuadra.enTransito) ? "NO CUADRA" : null,
  ].filter(Boolean);
  return [
    `  ${c.productoLocalId} ${nombre}${marcas.length ? ` [${marcas.join(", ")}]` : ""}`,
    `      apertura ${saldo(c.apertura)} → cierre ${saldo(c.cierre)}`,
    `      cantidad: ${movido(c.cantidad)} · tránsito: ${movido(c.enTransito)} · ${c.movimientos} movimientos`,
  ].join("\n");
}

function lineaDeMovimiento(m) {
  const d = m.cantidad.delta === null ? "" : ` (${m.cantidad.delta > 0 ? "+" : ""}${numero(m.cantidad.delta)})`;
  const t = m.enTransito.delta ? ` tránsito ${numero(m.enTransito.anterior)} → ${numero(m.enTransito.posterior)}` : "";
  return `    #${m.id} ${m.instante} ${m.efecto} cadena ${m.productoLocalId}: ${numero(m.cantidad.anterior)} → ${numero(m.cantidad.posterior)}${d}${t} · ${m.origenLegible}${m.origenRef ? ` ${m.origenRef}` : ""}`;
}

let codigo = 0;
try {
  const localId = Number(argumento("local"));
  const desde = argumento("dia");
  const hasta = argumento("hasta") ?? desde;
  const producto = argumento("producto");
  if (!localId || !desde) {
    console.error("Uso: --local <id> --dia YYYY-MM-DD [--hasta YYYY-MM-DD] [--producto <productoLocalId>] [--movimientos]");
    process.exit(2);
  }

  const pc = await server.puntoCeroDelLibro(prisma);
  console.log(`Punto cero del libro: ${pc ? `${pc.instante} (día ${pc.dia})` : "el libro está vacío"}`);
  if (pc && pc.instante !== PUNTO_CERO_PRODUCCION.instanteUTC) {
    console.log(`  (no es el de producción, ${PUNTO_CERO_PRODUCCION.instanteUTC}: esta base tiene su propio libro)`);
  }

  if (producto) {
    const r = await server.stockDeCadenaEnPeriodo(prisma, { localId, productoLocalId: Number(producto), desde, hasta });
    console.log(`Hoy: ${r.hoy} · período ${r.periodo.desde} a ${r.periodo.hasta} · ${r.periodo.estado}`);
    console.log(lineaDeCadena(r.cadena));
    for (const m of r.movimientos) console.log(lineaDeMovimiento(m));
    for (const x of r.cadena.reinterpretaciones) console.log(`    reinterpretación ${x.dia}: ${x.entidad} ${x.entidadId} ${x.campo} ${x.valorAnterior} → ${x.valorPosterior}`);
  } else {
    const r = await server.stockDelPeriodo(prisma, { localId, desde, hasta });
    console.log(`Hoy: ${r.hoy} · local ${localId} · período ${r.periodo.desde} a ${r.periodo.hasta} · ${r.periodo.estado}`);
    for (const c of r.cadenas) console.log(lineaDeCadena(c));
    const t = r.totales;
    if (!t) {
      console.log("Antes del punto cero el libro no sabe nada: no hay apertura, cierre ni movimientos que mostrar.");
    } else {
      console.log(`\n${t.cadenas} cadenas · ${t.movimientos} movimientos · ${t.sinClasificar} sin clasificar · ${t.reinterpretadas} con unidad reinterpretada`);
      for (const [clave, nombre] of [["cantidad", "Cantidad"], ["enTransito", "Tránsito"]]) {
        const x = t[clave];
        const total = (s) => (s.total === null ? `desconocida (${s.desconocidas} cadenas sin apertura)` : `${numero(s.total)} (${s.existen} existen, ${s.noExisten} no)`);
        console.log(`${nombre}: apertura ${total(x.apertura)} · cierre ${total(x.cierre)} · ${movido(x)}`);
      }
      if (bandera("movimientos") && desde === hasta) {
        console.log("\nMovimientos del día, por instante e id:");
        for (const m of await server.movimientosDelDia(prisma, { localId, dia: desde })) console.log(lineaDeMovimiento(m));
      }
    }
  }
} catch (err) {
  if (err instanceof ErrorStockDiario) {
    console.error(`${err.codigo}: ${err.message}`);
    codigo = 1;
  } else {
    console.error(`No se pudo consultar el Stock Diario: ${err?.message || err}`);
    codigo = 2;
  }
} finally {
  await prisma.$disconnect();
}
process.exit(codigo);
