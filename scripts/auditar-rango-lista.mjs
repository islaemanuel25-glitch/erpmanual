// scripts/auditar-rango-lista.mjs
//
// AUDITORÍA de las filas por revisar con el modelo de dos conciliaciones y el
// rango de aumento esperado. SOLO LECTURA: no escribe una sola fila.
//
//   node scripts/auditar-rango-lista.mjs <importacionId> [minPct] [maxPct]

import { PrismaClient } from "@prisma/client";

import { aplicarRecargo, round2, requiereConversionABulto } from "../lib/proveedores/listas/calculoCosto.js";
import { presentacionDeDescripcion, compatibilidadDePresentacion } from "../lib/proveedores/listas/presentacionDescripcion.js";
import { clasificarVariacion, recomendarHipotesis, ESTADO_VARIACION } from "../lib/proveedores/listas/rangoAumento.js";

const prisma = new PrismaClient();
const importacionId = Number(process.argv[2] ?? 3);
const minPct = Number(process.argv[3] ?? 8);
const maxPct = Number(process.argv[4] ?? 15);

const money = (n) =>
  n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n) => (n === null || n === undefined ? "—" : (n >= 0 ? "+" : "") + n.toFixed(1) + " %");

const cab = await prisma.importacionListaProveedor.findUnique({
  where: { id: importacionId },
  select: { id: true, estado: true, recargoPct: true },
});
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

/** Las hipótesis comercialmente válidas. UxBU no participa nunca. */
function hipotesisDe(f, b) {
  const um = String(f.unidadProveedor ?? "").toUpperCase();
  const conRecargo = aplicarRecargo(Number(f.precioConIva), recargoPct);
  const desc = presentacionDeDescripcion(f.descripcionProveedor);

  // DI y BU: el precio ya es el del envase que se cotiza. Multiplicador 1.
  if (um === "DI" || um === "BU") {
    return { desc, lista: [{ clave: "MISMA_PRESENTACION", multiplicador: 1, costoNuevo: round2(conRecargo) }] };
  }

  // UN: el precio es de una unidad comercial. Dos lecturas posibles.
  const lista = [{ clave: "UNIDAD", multiplicador: 1, costoNuevo: round2(conRecargo) }];

  // La cantidad del pack sale del ERP o de la descripción. NUNCA de UxBU.
  const candidatas = new Set();
  if (requiereConversionABulto(b) && Number.isInteger(b.factor_pack) && b.factor_pack > 1) candidatas.add(b.factor_pack);
  if (desc.cantidad !== null && desc.cantidad > 1) candidatas.add(desc.cantidad);

  for (const n of candidatas) {
    lista.push({
      clave: `PACK_${n}`,
      multiplicador: n,
      costoNuevo: round2(conRecargo * n),
      origenCantidad: n === b.factor_pack ? "factor_pack del ERP" : "descripción del proveedor",
    });
  }
  return { desc, lista };
}

const resumen = {
  unica: 0, ambigua: 0, revisar: 0, sinProducto: 0,
  recMisma: 0, recPack: 0, recUnidad: 0,
};
const porEstado = {};
const compat = { COINCIDEN: 0, DIFIEREN: 0, SIN_DATO: 0 };
const uxbuAlto = [];
const ejemplos = {};
const detalle = [];

for (const f of filas) {
  const b = f.productoBaseId ? porId.get(f.productoBaseId) : null;
  if (!b) { resumen.sinProducto++; continue; }

  const { desc, lista } = hipotesisDe(f, b);
  const r = recomendarHipotesis({ hipotesis: lista, costoActual: Number(b.precio_costo), minPct, maxPct });

  if (r.resultado === "RECOMENDADA") resumen.unica++;
  else if (r.resultado === "AMBIGUA") resumen.ambigua++;
  else resumen.revisar++;

  if (r.recomendada === "MISMA_PRESENTACION") resumen.recMisma++;
  else if (r.recomendada === "UNIDAD") resumen.recUnidad++;
  else if (r.recomendada) resumen.recPack++;

  const elegida = r.evaluadas.find((h) => h.clave === r.recomendada) ?? r.evaluadas[0];
  const clas = clasificarVariacion({ costoActual: Number(b.precio_costo), costoNuevo: elegida?.costoNuevo, minPct, maxPct });
  porEstado[clas.estado] = (porEstado[clas.estado] ?? 0) + 1;

  const c = compatibilidadDePresentacion({ cantidadDescripcion: desc.cantidad, factorPack: b.factor_pack });
  compat[c]++;

  // UxBU muy alto: la prueba de que ignorarlo es lo correcto.
  if (Number(f.unidadesPorBulto) >= 60) {
    uxbuAlto.push({ f, b, uxbu: f.unidadesPorBulto, elegida, clas, desc });
  }

  const fila = { f, b, desc, r, elegida, clas, compat: c };
  detalle.push(fila);
  const clave = `${r.resultado}_${clas.estado}`;
  if (!ejemplos[clave]) ejemplos[clave] = fila;
}

const linea = (x) => {
  const { f, b, desc, r, elegida, clas } = x;
  console.log(`  fila ${f.filaExcel} · ${f.descripcionProveedor}  [U.M. ${f.unidadProveedor} · UxBU ${f.unidadesPorBulto}]`);
  console.log(`     ERP: ${b.nombre} · factor_pack ${b.factor_pack ?? "—"} · costo actual ${money(b.precio_costo)}`);
  console.log(`     descripción: cantidad ${desc.cantidad ?? "—"}${desc.contenidoInterno ? `, contenido interno ${desc.contenidoInterno}` : ""}${desc.pesoTexto ? `, peso ${desc.pesoTexto}` : ""}`);
  for (const h of r.evaluadas) {
    const marca = h.clave === r.recomendada ? "→" : " ";
    console.log(`   ${marca} ${h.clave.padEnd(20)} ×${String(h.multiplicador).padEnd(4)} ${money(h.costoNuevo).padStart(14)}  ${pct(h.variacionPct).padStart(10)}  ${h.estado}${h.absurda ? "  (absurda)" : ""}`);
  }
  console.log(`     resultado: ${r.resultado}${r.recomendada ? ` · recomendada ${r.recomendada} · ${clas.estado}` : ""}`);
};

console.log(`IMPORTACIÓN ${cab.id} · recargo ${recargoPct} % · rango esperado ${minPct}–${maxPct} %`);
console.log(`filas por revisar: ${filas.length}\n`);

console.log("=== INTERPRETACIÓN ===");
console.log(`  con una única interpretación coherente: ${resumen.unica}`);
console.log(`     de las cuales, misma presentación:   ${resumen.recMisma}`);
console.log(`     de las cuales, precio unitario × pack: ${resumen.recPack}`);
console.log(`     de las cuales, precio unitario = unidad: ${resumen.recUnidad}`);
console.log(`  ambiguas (más de una razonable):        ${resumen.ambigua}`);
console.log(`  sin ninguna interpretación razonable:   ${resumen.revisar}`);

console.log("\n=== VARIACIÓN DE LA HIPÓTESIS RECOMENDADA ===");
const orden = ["ESPERADO", "AUMENTO_BAJO", "AUMENTO_ALTO", "SIN_AUMENTO", "DISMINUCION", "SIN_REFERENCIA"];
for (const e of orden) if (porEstado[e]) console.log(`  ${e.padEnd(16)} ${porEstado[e]}`);

console.log("\n=== CONCILIACIÓN DE PRESENTACIÓN (independiente del precio) ===");
console.log(`  la cantidad de la descripción coincide con factor_pack: ${compat.COINCIDEN}`);
console.log(`  difieren:                                               ${compat.DIFIEREN}`);
console.log(`  sin dato para comparar:                                 ${compat.SIN_DATO}`);

console.log("\n=== UxBU ALTO: la prueba de que hay que ignorarlo ===");
console.log(`  filas con UxBU 60 o más: ${uxbuAlto.length}`);
for (const x of uxbuAlto.slice(0, 4)) {
  const conUxbu = round2(aplicarRecargo(Number(x.f.precioConIva), recargoPct) * Number(x.f.unidadesPorBulto));
  console.log(`  fila ${x.f.filaExcel} · ${x.f.descripcionProveedor} · UxBU ${x.uxbu}`);
  console.log(`     usando UxBU daría ${money(conUxbu)} contra un costo actual de ${money(x.b.precio_costo)}`);
  console.log(`     la hipótesis recomendada da ${money(x.elegida?.costoNuevo)} (${pct(x.clas.variacionPct)})`);
}

console.log("\n=== CASOS DE VALIDACIÓN PEDIDOS ===");
for (const n of [167, 176, 308, 293]) {
  const x = detalle.find((d) => d.f.filaExcel === n);
  if (x) linea(x);
}
const mogul = detalle.find((d) => /MOGUL x ?1 ?Kg|MOGUL x1 Kg/i.test(d.f.descripcionProveedor)) ?? detalle.find((d) => /MOGUL x 500Grs/i.test(d.f.descripcionProveedor) && d.f.unidadProveedor === "UN");
if (mogul) linea(mogul);

console.log("\n=== UN EJEMPLO DE CADA GRUPO ===");
for (const [clave, x] of Object.entries(ejemplos)) {
  console.log(`\n--- ${clave} ---`);
  linea(x);
}

await prisma.$disconnect();
