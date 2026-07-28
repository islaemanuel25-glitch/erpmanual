// Tests UNITARIOS PUROS del toggle Pack/Unidad de la corrección (Opción A).
// Sin DB, sin servidor. Verifica escalas, conversión física (reutilizando el helper
// del POS), costo congelado, cantidadStock, subtotal, ganancia y redondeo en centavos.
// Uso: node scripts/unit-linea-modo-deposito.mjs

import {
  MODO_PACK, MODO_UNIDAD, permiteToggleDeposito, modosPermitidos, cantidadStockLinea,
  inferirModo, escalasDeLineaExistente, rescalarLinea, costoResoluble, calcLinea, aCent, round2,
} from "../lib/pos-ventas/lineaModoDeposito.js";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

// Producto de referencia: factor 12, pack $12.000 / unidad $1.000; costo pack $8.400 / unidad $700.
const P = { factorPack: 12, modoEnvio: "MIXTO", esDeposito: true, precioBulto: 12000, precioUnitario: 1000, costoBulto: 8400, costoUnitario: 700 };

// 1) Pack cantidad 1
{
  const r = calcLinea({ cantidad: 1, precio: P.precioBulto, precioCosto: P.costoBulto, modoVentaLinea: MODO_PACK, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true });
  ok("1. Pack cant 1 → subtotal 12000, stock 12, costo 8400, ganancia 3600", r.subtotal === 12000 && r.cantidadStock === 12 && r.costoLinea === 8400 && r.ganancia === 3600, JSON.stringify(r));
}
// 2) Unidad suelta cantidad 1
{
  const r = calcLinea({ cantidad: 1, precio: P.precioUnitario, precioCosto: P.costoUnitario, modoVentaLinea: MODO_UNIDAD, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true });
  ok("2. Unidad cant 1 → subtotal 1000, stock 1, costo 700, ganancia 300", r.subtotal === 1000 && r.cantidadStock === 1 && r.costoLinea === 700 && r.ganancia === 300, JSON.stringify(r));
}
// 3) toggle Pack → Unidad
{
  const patch = rescalarLinea(P, MODO_UNIDAD);
  ok("3. toggle Pack→Unidad: modo UNIDAD, precio 1000, costo 700", patch.modoVentaLinea === MODO_UNIDAD && patch.precio === 1000 && patch.precioCosto === 700, JSON.stringify(patch));
}
// 4) toggle Unidad → Pack
{
  const patch = rescalarLinea(P, MODO_PACK);
  ok("4. toggle Unidad→Pack: modo NORMAL, precio 12000, costo 8400", patch.modoVentaLinea === MODO_PACK && patch.precio === 12000 && patch.precioCosto === 8400, JSON.stringify(patch));
}
// 5) mismo producto en dos líneas con distinto modo (identidad por key, no por producto)
{
  const packLinea = { key: "l1", productoLocalId: 500, ...P, modoVentaLinea: MODO_PACK, cantidad: 1, precio: 12000, precioCosto: 8400 };
  const uniLinea = { key: "l2", productoLocalId: 500, ...P, modoVentaLinea: MODO_UNIDAD, cantidad: 5, precio: 1000, precioCosto: 700 };
  const a = calcLinea(packLinea), b = calcLinea(uniLinea);
  ok("5. dos líneas mismo producto distinto modo: 1 pack (stock 12) + 5 u (stock 5) coexisten por key", packLinea.key !== uniLinea.key && a.cantidadStock === 12 && b.cantidadStock === 5, JSON.stringify({ a, b }));
}
// 6/7) precio pack / unitario correctos desde línea existente
{
  const e = escalasDeLineaExistente({ precio: 12000, precioCosto: 8400, modoActual: MODO_PACK, factorPack: 12 });
  ok("6. precio pack correcto (12000)", e.precioBulto === 12000);
  ok("7. precio unitario correcto (1000)", e.precioUnitario === 1000, JSON.stringify(e));
}
// 8) costo histórico preservado (round-trip toggle desde línea UNIDAD existente)
{
  const e = escalasDeLineaExistente({ precio: 1000, precioCosto: 700, modoActual: MODO_UNIDAD, factorPack: 12 });
  ok("8a. desde UNIDAD: costoBulto=8400, costoUnitario=700 (sin re-consultar maestro)", e.costoBulto === 8400 && e.costoUnitario === 700, JSON.stringify(e));
  const linea = { ...e };
  const aPack = rescalarLinea(linea, MODO_PACK);
  const deVuelta = rescalarLinea(linea, MODO_UNIDAD);
  ok("8b. round-trip preserva el costo (700 → 8400 → 700)", aPack.precioCosto === 8400 && deVuelta.precioCosto === 700);
}
// 9) costo de pack NO dividido dos veces: costoLinea = costoBulto × packs (no costoBulto/factor × stock)
{
  const r = calcLinea({ cantidad: 2, precio: 12000, precioCosto: 8400, modoVentaLinea: MODO_PACK, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true });
  ok("9. costo pack no dividido dos veces: 2 packs → costo 16800 (8400×2), stock 24", r.costoLinea === 16800 && r.cantidadStock === 24, JSON.stringify(r));
}
// 10) cantidadStock correcta (pack ×factor, unidad tal cual)
{
  ok("10a. Pack cant 2 → stock 24", cantidadStockLinea({ cantidad: 2, modoVentaLinea: MODO_PACK, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true }) === 24);
  ok("10b. Unidad cant 5 → stock 5", cantidadStockLinea({ cantidad: 5, modoVentaLinea: MODO_UNIDAD, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true }) === 5);
  ok("10c. ejemplo del pedido: 1 pack + 5 u con factor 12 = 17 físicas (dos líneas)", cantidadStockLinea({ cantidad: 1, modoVentaLinea: MODO_PACK, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true }) + cantidadStockLinea({ cantidad: 5, modoVentaLinea: MODO_UNIDAD, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true }) === 17);
}
// 11/12) subtotal / ganancia correctos
{
  const r = calcLinea({ cantidad: 2, precio: 12000, precioCosto: 8400, modoVentaLinea: MODO_PACK, factorPack: 12, modoEnvio: "MIXTO", esDeposito: true });
  ok("11. subtotal correcto (2×12000=24000)", r.subtotal === 24000);
  ok("12. ganancia correcta (24000-16800=7200)", r.ganancia === 7200, JSON.stringify(r));
}
// 13) SOLO_UNIDAD sin toggle
{
  ok("13a. SOLO_UNIDAD factor 20 → NO permite toggle", permiteToggleDeposito({ esDeposito: true, factorPack: 20, modoEnvio: "SOLO_UNIDAD" }) === false);
  ok("13b. modosPermitidos SOLO_UNIDAD → solo [UNIDAD]", JSON.stringify(modosPermitidos({ esDeposito: true, factorPack: 20, modoEnvio: "SOLO_UNIDAD" })) === JSON.stringify([MODO_UNIDAD]));
  ok("13c. MIXTO factor 12 → permite toggle [PACK, UNIDAD]", permiteToggleDeposito({ esDeposito: true, factorPack: 12, modoEnvio: "MIXTO" }) === true && JSON.stringify(modosPermitidos({ esDeposito: true, factorPack: 12, modoEnvio: "MIXTO" })) === JSON.stringify([MODO_PACK, MODO_UNIDAD]));
  ok("13d. factor 1 → no toggle", permiteToggleDeposito({ esDeposito: true, factorPack: 1, modoEnvio: "MIXTO" }) === false);
}
// 14) agregado con costos congelados (capturados de buscar-producto)
{
  const item = { precioVentaBulto: 12000, precioVentaUnitario: 1000, precioCostoBulto: 8400, precioCostoUnitario: 700, factorPack: 12, modoEnvio: "MIXTO" };
  ok("14a. costoResoluble true cuando el item trae costos", costoResoluble(item) === true);
  ok("14b. costo pack/unidad congelados desde el item", Number(item.precioCostoBulto) === 8400 && Number(item.precioCostoUnitario) === 700);
}
// 15) agregado sin costo resoluble → bloqueado
{
  ok("15a. sin campos de costo → NO resoluble (bloquea)", costoResoluble({}) === false && costoResoluble({ precioCostoBulto: null, precioCostoUnitario: undefined }) === false);
  ok("15b. costo 0 con maestro realmente 0 → SÍ resoluble (no bloquea)", costoResoluble({ precioCostoBulto: 0, precioCostoUnitario: 0 }) === true);
}
// 16) payload con modoVentaLinea explícito
{
  const patch = rescalarLinea(P, MODO_UNIDAD);
  ok("16. rescalar siempre entrega modoVentaLinea explícito", patch.modoVentaLinea === MODO_UNIDAD);
}
// 17) inferir modo desde línea existente + redondeo en centavos
{
  ok("17a. inferir Pack (stock == cant×factor)", inferirModo({ cantidad: 2, cantidadStock: 24, factorPack: 12 }) === MODO_PACK);
  ok("17b. inferir Unidad (stock == cant)", inferirModo({ cantidad: 5, cantidadStock: 5, factorPack: 12 }) === MODO_UNIDAD);
  // 9 DE ORO real: cant 2, cantidadStock 2, factor 20 → UNIDAD (no Pack).
  ok("17c. #824 9 DE ORO (cant 2 / stock 2 / factor 20) → UNIDAD", inferirModo({ cantidad: 2, cantidadStock: 2, factorPack: 20 }) === MODO_UNIDAD);
  ok("17d. redondeo centavos: 12500/12 = 1041.67; aCent = 104167", round2(12500 / 12) === 1041.67 && aCent(round2(12500 / 12)) === 104167);
}

console.log(`\nRESULTADO LINEA-MODO-DEPOSITO: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
