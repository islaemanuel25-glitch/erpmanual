// scripts/auditar-presentacion-lista.mjs
//
// AUDITORÍA de las filas por revisar con la regla de presentación.
//
// Solo lectura. No escribe nada, no confirma nada, no aplica nada. Para cada
// fila dice qué presentación cotiza el proveedor, qué relación sostiene el costo
// que el producto ya tiene, qué costo saldría de cada opción y si la fila queda
// en un rango creíble o hay que mirarla a mano.
//
//   node scripts/auditar-presentacion-lista.mjs <importacionId>

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

import {
  RELACION,
  TEXTO_BASE_PRECIO,
  basePrecioDeFila,
  relacionesPosibles,
  relacionImplicita,
  costoDeRelacion,
} from "../lib/proveedores/listas/confirmarPresentacion.js";

const prisma = await crearClientePrisma({ nivel: LECTURA });
const importacionId = Number(process.argv[2] ?? 3);

/** ¿La relación implícita respalda esta opción? Cerca de 1 o cerca de la cantidad. */
function respalda(relacion, implicita, unidades) {
  if (implicita === null) return false;
  if (relacion === RELACION.MISMA_PRESENTACION) return implicita >= 0.6 && implicita <= 1.6;
  if (!unidades) return false;
  return implicita >= unidades * 0.6 && implicita <= unidades * 1.6;
}

const money = (n) =>
  n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cab = await prisma.importacionListaProveedor.findUnique({
  where: { id: importacionId },
  select: { id: true, estado: true, recargoPct: true, totalFilas: true },
});
if (!cab) { console.error("no existe la importación", importacionId); process.exit(1); }
const recargoPct = Number(cab.recargoPct);

const filas = await prisma.importacionListaFila.findMany({
  where: { importacionId, estado: "FACTOR_DUDOSO" },
  orderBy: { filaExcel: "asc" },
});

const ids = [...new Set(filas.map((f) => f.productoBaseId).filter(Boolean))];
const bases = await prisma.productoBase.findMany({
  where: { id: { in: ids } },
  select: { id: true, nombre: true, precio_costo: true, unidad_medida: true, factor_pack: true, modoCompraProveedor: true },
});
const porId = new Map(bases.map((b) => [b.id, b]));

console.log(`IMPORTACIÓN ${cab.id} · ${cab.estado} · recargo ${recargoPct}%`);
console.log(`filas por revisar: ${filas.length}\n`);

const resumen = { conRespaldo: 0, ambigua: 0, sinRespaldo: 0, sinBase: 0, sinProducto: 0 };
const porBase = {};
const aMano = [];

for (const f of filas) {
  const b = f.productoBaseId ? porId.get(f.productoBaseId) : null;
  if (!b) { resumen.sinProducto++; continue; }

  const basePrecio = basePrecioDeFila(f);
  if (basePrecio === null) { resumen.sinBase++; continue; }
  porBase[basePrecio] = (porBase[basePrecio] ?? 0) + 1;

  const precio = Number(f.precioConIva);
  const implicita = relacionImplicita({ costoActual: b.precio_costo, precioConIva: precio, recargoPct });
  const unidades = b.factor_pack ?? null;
  const opciones = relacionesPosibles(f, b);

  const evaluadas = opciones.map((o) => ({
    relacion: o.relacion,
    costo: costoDeRelacion({ precioConIva: precio, recargoPct, relacion: o.relacion, unidades }),
    respaldada: respalda(o.relacion, implicita, unidades),
  }));

  const respaldadas = evaluadas.filter((x) => x.respaldada);
  if (respaldadas.length === 1) resumen.conRespaldo++;
  else if (respaldadas.length > 1) resumen.ambigua++;
  else {
    resumen.sinRespaldo++;
    aMano.push({ f, b, implicita, evaluadas, basePrecio });
  }
}

console.log("=== QUÉ COTIZA EL PROVEEDOR ===");
for (const [k, v] of Object.entries(porBase)) console.log(`  ${TEXTO_BASE_PRECIO[k]}: ${v} filas`);

console.log("\n=== CUÁNTAS QUEDAN RESUELTAS ===");
console.log(`  con una sola opción respaldada por el costo actual: ${resumen.conRespaldo}`);
console.log(`  con más de una opción respaldada (decide la persona): ${resumen.ambigua}`);
console.log(`  sin ninguna opción respaldada (hay que mirarlas):     ${resumen.sinRespaldo}`);
if (resumen.sinBase) console.log(`  sin base de precio legible (bloqueadas):            ${resumen.sinBase}`);
if (resumen.sinProducto) console.log(`  sin producto:                                      ${resumen.sinProducto}`);

console.log("\n=== LAS QUE NO CIERRAN CON NINGUNA OPCIÓN (primeras 15) ===");
console.log("Son las que hay que mirar a mano: ni el precio del envase ni el precio por unidad");
console.log("reproducen el costo que el producto tiene hoy.\n");
for (const x of aMano.slice(0, 15)) {
  console.log(`  fila ${x.f.filaExcel} · ${x.f.descripcionProveedor}`);
  console.log(`     proveedor: ${money(x.f.precioConIva)} por ${TEXTO_BASE_PRECIO[x.basePrecio]} · producto: ${x.b.nombre}`);
  console.log(`     costo hoy ${money(x.b.precio_costo)} · equivale a ${x.implicita ?? "—"} presentaciones · el ERP dice que agrupa ${x.b.factor_pack ?? "—"}`);
  for (const o of x.evaluadas) console.log(`     ${o.relacion} → ${money(o.costo)}`);
}
if (aMano.length > 15) console.log(`  … y ${aMano.length - 15} más`);

await prisma.$disconnect();
