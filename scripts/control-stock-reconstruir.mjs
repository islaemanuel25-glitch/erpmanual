// RECONSTRUIR LOS CONTEOS DE LOS CONTROLES DE STOCK ABIERTOS.
//
// Modo prueba —el de siempre, nivel LECTURA: no escribe nada—:
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs \
//     scripts/control-stock-reconstruir.mjs [--control <id>] [--detalle]
//
// Aplicar —nivel ESCRITURA: host local y NODE_ENV distinto de production—:
//
//   DATABASE_URL=postgresql://…/erpazul_al node --import ./scripts/alias-loader.mjs \
//     scripts/control-stock-reconstruir.mjs --aplicar [--control <id>]
//
// ── QUÉ HACE ────────────────────────────────────────────────────────────────
//
// Hasta el 2026-10-22 un conteo del control no guardaba el stock del sistema al
// contarlo, y cambiar el total movía el stock por la diferencia de totales. Por
// cada producto contado de un control ABIERTO, `reconstruirConteos`
// (`lib/stock/control/reconstruccionDeConteos.js`, la MISMA cuenta que la
// revisión de la pantalla) saca del Libro el stock al contar —el de apertura más
// lo que no es del control hasta el conteo vigente— y deja el stock en lo
// contado más lo que pasó después. La diferencia del producto queda en contado −
// stock al contar, y la fila vigente guarda ese stock en `sistemaAlContar`.
//
// Los que el Libro no alcanza a explicar —no encadena, falta el movimiento del
// conteo, la bitácora y el Libro no dicen lo mismo, o varios conteos que se
// sumaban— NO se tocan: se listan con su motivo. No se inventa nada.
//
// Idempotente: corregido un producto, su stock y lo que debería haber se mueven
// juntos con cada venta, así que una segunda corrida da todo "al día".
//
// ── EN PRODUCCIÓN NO CORRE ESTO ─────────────────────────────────────────────
//
// La imagen no trae `scripts/` y la fábrica no escribe fuera de un host local, a
// propósito. En producción la misma función la corre la aplicación: el panel
// "El stock no coincide con lo contado" del control abierto es el modo prueba,
// y su "Corregir todos" (`POST /api/stock_locales/control/revision` con
// `{ todos: true }`) la aplica. Esto es para una copia en la máquina de
// desarrollo.
//
// La corrección queda en la bitácora a nombre de quien abrió el control y con
// el grupo de su propia bitácora.

import { crearClientePrisma, ESCRITURA, LECTURA } from "./lib/clientePrisma.mjs";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const detalle = args.includes("--detalle") || aplicar;
const iControl = args.indexOf("--control");
const soloControl = iControl >= 0 ? Number(args[iControl + 1]) : null;
if (iControl >= 0 && !(Number.isInteger(soloControl) && soloControl > 0)) {
  console.error("--control necesita el id de un control.");
  process.exit(2);
}

const prisma = await crearClientePrisma({ nivel: aplicar ? ESCRITURA : LECTURA });
const { ESTADO_RECONSTRUCCION, reconstruirConteos } = await import("../lib/stock/control/reconstruccionDeConteos.js");

const num = (x) => (x == null ? "—" : String(x));

let fallo = false;
try {
  const controles = await prisma.controlStock.findMany({
    where: { estado: "ABIERTO", ...(soloControl ? { id: soloControl } : {}) },
    orderBy: { id: "asc" },
    include: { local: { select: { nombre: true } } },
  });
  console.log(aplicar ? "APLICANDO la reconstrucción." : "MODO PRUEBA: no se escribe nada.");
  if (!controles.length) console.log(soloControl ? `No hay un control abierto #${soloControl}.` : "No hay controles abiertos.");

  for (const control of controles) {
    console.log(`\n── Control #${control.id} · ${control.local?.nombre ?? `local ${control.localId}`} · abierto ${control.abiertoEn.toISOString()}`);
    const deLaBitacora = await prisma.auditoriaStock.findFirst({ where: { controlStockId: control.id }, select: { grupoId: true } });
    if (aplicar && !deLaBitacora) {
      console.log("  Sin bitácora: no hay conteos que corregir.");
      continue;
    }
    const r = await reconstruirConteos(prisma, {
      controlId: control.id,
      aplicar,
      userId: control.abiertoPorUsuarioId,
      grupoId: deLaBitacora?.grupoId ?? null,
    });
    if (!r.ok) {
      fallo = true;
      console.log(`  ✗ ${r.error}`);
      continue;
    }
    const s = r.resumen;
    const verbo = aplicar ? "" : " (los tocaría)";
    console.log(`  Productos contados: ${s.contados}`);
    console.log(`  Stock corregido${verbo}: ${s.ajustados}`);
    console.log(`  Solo se guarda el stock al contar, el stock ya daba${verbo}: ${s.marcados}`);
    console.log(`  Ya estaban al día: ${s.alDia}`);
    console.log(`  NO se pudieron reconstruir (no se tocan): ${s.noReconstruibles}`);
    for (const p of r.productos.filter((x) => x.estado === ESTADO_RECONSTRUCCION.NO_RECONSTRUIBLE)) {
      console.log(`    · #${p.productoLocalId} ${p.nombre}: ${p.motivo}`);
    }
    if (detalle) {
      for (const p of r.productos.filter((x) => x.estado === ESTADO_RECONSTRUCCION.AJUSTADO)) {
        console.log(
          `    ~ #${p.productoLocalId} ${p.nombre}: contado ${num(p.contado)} · sistema al contar ${num(p.sistemaAlContar)} · diferencia ${num(p.diferencia)} · stock ${num(p.actual)} → ${num(p.deberia)}`
        );
      }
    }
  }
} catch (e) {
  fallo = true;
  console.error(`✗ La reconstrucción se cayó: ${e?.stack || e}`);
} finally {
  await prisma.$disconnect();
}
process.exit(fallo ? 1 : 0);
