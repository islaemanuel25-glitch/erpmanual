// Tests UNITARIOS PUROS del motor de corrección completa (Checkpoint B1).
// Sin DB, sin servidor. Verifica reversión+reaplicación, delta neto de stock,
// validación de stock final, diff y bloqueo de líneas legacy ambiguas.
// Uso: node scripts/unit-motor-correccion.mjs

import { evaluarCorreccion, reconstruirConsumoOriginal, clasificarLineas } from "../lib/pos-ventas/motorCorreccion.js";

let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };
const R3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

// Busca el delta de un productoLocalId en el resultado.
const deltaDe = (res, pl) => {
  const f = res.deltaStock.find((x) => x.productoLocalId === pl);
  return f ? f.delta : 0;
};

// --- Fábricas ---------------------------------------------------------------
// Original NORMAL congelado. cantidadStock por defecto = cantidad (local).
function oNormal(id, baseId, pl, cantidad, precio, { cantidadStock, servicio = false } = {}) {
  return {
    id, productoBaseId: baseId, nombre: `P${baseId}`, esServicio: servicio,
    productoLocalId: pl, cantidadStock: cantidadStock === undefined ? cantidad : cantidadStock,
    cantidad, precio, precioCosto: precio / 2, subtotal: precio * cantidad, componentes: [],
  };
}
// Original COMBO congelado (componentes con productoLocalId + cantidad ya escalada).
function oCombo(id, baseId, cantidad, precio, componentes) {
  return {
    id, productoBaseId: baseId, nombre: `Combo${baseId}`, esServicio: false,
    productoLocalId: null, cantidadStock: null, cantidad, precio, precioCosto: precio / 2,
    subtotal: precio * cantidad, componentes,
  };
}
// Corregida NORMAL (shape de planConsumoVenta).
function cNormal(baseId, pl, cantidad, precio, origenDetalleId = null, extra = {}) {
  return {
    tipo: "NORMAL", origenDetalleId, productoBaseId: baseId, productoLocalId: pl,
    cantidad, precio, costoUnitario: precio / 2, nombre: `P${baseId}`,
    baseStock: extra.baseStock || { factorPack: 1 }, modoVentaLinea: extra.modoVentaLinea || "NORMAL",
  };
}
function cCombo(baseId, comboPl, cantidad, precio, componentes, origenDetalleId = null) {
  return {
    tipo: "COMBO", origenDetalleId, productoBaseId: baseId, comboProductoLocalId: comboPl,
    cantidad, precio, costoUnitario: precio / 2, nombre: `Combo${baseId}`, componentes,
  };
}
function cServicio(baseId, precio, origenDetalleId = null) {
  return { tipo: "SERVICIO", origenDetalleId, productoBaseId: baseId, cantidad: 1, precio, costoUnitario: 0, nombre: `Serv${baseId}` };
}
// pagos que cuadran con un total en efectivo.
const pagoEfectivo = (t) => [{ medio: "EFECTIVO", monto: t }];

function evaluar({ orig, corr, esDeposito = false, stockActual = {}, allowNegative = false, totalOrig, pagosCorr, clienteAntes = 1, clienteDespues = 1, descuento = 0 }) {
  const totalCorr = (pagosCorr ? pagosCorr.reduce((a, p) => a + p.monto, 0) : corr.reduce((a, l) => a + l.precio * l.cantidad, 0) - descuento);
  return evaluarCorreccion({
    original: { detalles: orig, pagos: pagoEfectivo(totalOrig ?? orig.reduce((a, d) => a + d.subtotal, 0)), clienteId: clienteAntes, total: totalOrig ?? orig.reduce((a, d) => a + d.subtotal, 0), esFiado: false },
    corregido: { lineas: corr, pagos: pagosCorr || pagoEfectivo(totalCorr), clienteId: clienteDespues, descuento },
    esDeposito, stockActual, allowNegative,
  });
}

console.log("=== STOCK ===");

// 1) 10 → 8
{
  const orig = [oNormal(1, 10, 1, 10, 100)];
  const corr = [cNormal(10, 1, 8, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 0 } });
  ok("10→8: delta +2 (devuelve 2)", deltaDe(r, 1) === 2 && r.clasificacion.modificadas === 1);
}
// 2) 8 → 10
{
  const orig = [oNormal(1, 10, 1, 8, 100)];
  const corr = [cNormal(10, 1, 10, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 50 } });
  ok("8→10: delta -2 (consume 2 más)", deltaDe(r, 1) === -2);
}
// 3) agregar
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 2, 100, 1), cNormal(20, 2, 3, 50)];
  const r = evaluar({ orig, corr, stockActual: { 1: 0, 2: 10 } });
  ok("agregar: pl2 delta -3, pl1 sin cambio", deltaDe(r, 2) === -3 && deltaDe(r, 1) === 0 && r.clasificacion.agregadas === 1 && r.clasificacion.preservadas === 1);
}
// 4) eliminar
{
  const orig = [oNormal(1, 10, 1, 2, 100), oNormal(2, 20, 2, 3, 50)];
  const corr = [cNormal(10, 1, 2, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 0, 2: 0 } });
  ok("eliminar: pl2 delta +3 (devuelve)", deltaDe(r, 2) === 3 && r.clasificacion.eliminadas === 1);
}
// 5) reemplazar producto en una línea
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(20, 2, 2, 100, 1)]; // mismo origen, otro producto/pl
  const r = evaluar({ orig, corr, stockActual: { 1: 0, 2: 5 } });
  ok("reemplazar: pl1 +2 y pl2 -2", deltaDe(r, 1) === 2 && deltaDe(r, 2) === -2 && r.clasificacion.modificadas === 1);
}
// 6) mismo producto en varias líneas
{
  const orig = [oNormal(1, 10, 1, 3, 100), oNormal(2, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 5, 100, 1), cNormal(10, 1, 2, 100, 2)]; // modifica id1 a 5, id2 preservada
  const r = evaluar({ orig, corr, stockActual: { 1: 0 } });
  ok("varias líneas mismo pl: delta -2 consolidado", deltaDe(r, 1) === -2 && r.clasificacion.preservadas === 1 && r.clasificacion.modificadas === 1);
}
// 7) depósito bulto (factor 6)
{
  const bs = { factorPack: 6, modo_envio: "SOLO_BULTO", unidad_medida: "pack" };
  const orig = [oNormal(1, 10, 1, 1, 600, { cantidadStock: 6 })]; // 1 bulto = 6 u
  const corr = [cNormal(10, 1, 2, 600, 1, { baseStock: bs })]; // 2 bultos = 12 u
  const r = evaluar({ orig, corr, esDeposito: true, stockActual: { 1: 100 } });
  ok("depósito bulto: delta -6 (revert +6, reapply -12)", deltaDe(r, 1) === -6);
}
// 8) depósito unidad remanente
{
  const bs = { factorPack: 6, modo_envio: "SOLO_BULTO", unidad_medida: "pack" };
  const orig = [oNormal(1, 10, 1, 3, 100, { cantidadStock: 3 })];
  const corr = [cNormal(10, 1, 5, 100, 1, { baseStock: bs, modoVentaLinea: "UNIDAD_REMANENTE" })];
  const r = evaluar({ orig, corr, esDeposito: true, stockActual: { 1: 50 } });
  ok("depósito remanente: delta -2 (×1)", deltaDe(r, 1) === -2);
}
// 9) fiambre decimal (local)
{
  const orig = [oNormal(1, 10, 1, 0.5, 1000)];
  const corr = [cNormal(10, 1, 0.75, 1000, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 5 } });
  ok("fiambre decimal: delta -0.25", deltaDe(r, 1) === -0.25);
}
// 10) fiambre pieza (depósito PIEZA → ×1)
{
  const bs = { modoVentaDeposito: "PIEZA", pesoReferenciaKg: 3 };
  const orig = [oNormal(1, 10, 1, 4, 500, { cantidadStock: 4 })];
  const corr = [cNormal(10, 1, 6, 500, 1, { baseStock: bs })];
  const r = evaluar({ orig, corr, esDeposito: true, stockActual: { 1: 20 } });
  ok("fiambre pieza: delta -2 (×1)", deltaDe(r, 1) === -2);
}
// 11) combo
{
  const orig = [oCombo(1, 99, 1, 300, [{ productoBaseId: 20, productoLocalId: 2, cantidad: 2 }, { productoBaseId: 30, productoLocalId: 3, cantidad: 1 }])];
  const corr = [cCombo(99, 9, 2, 300, [{ productoLocalId: 2, productoBaseId: 20, cantidadPorCombo: 2, costoUnitario: 5 }, { productoLocalId: 3, productoBaseId: 30, cantidadPorCombo: 1, costoUnitario: 5 }], 1)];
  const r = evaluar({ orig, corr, stockActual: { 2: 100, 3: 100 } });
  ok("combo x1→x2: B(pl2) -2, D(pl3) -1", deltaDe(r, 2) === -2 && deltaDe(r, 3) === -1);
}
// 12) combo + componente suelto (consolidación sin doble consumo)
{
  const orig = [
    oCombo(1, 99, 1, 300, [{ productoBaseId: 20, productoLocalId: 2, cantidad: 2 }]),
    oNormal(2, 20, 2, 3, 50), // B suelto x3 en pl2
  ];
  const corr = [
    cCombo(99, 9, 2, 300, [{ productoLocalId: 2, productoBaseId: 20, cantidadPorCombo: 2, costoUnitario: 5 }], 1), // combo x2 → B4
    cNormal(20, 2, 5, 50, 2), // B suelto x5
  ];
  const r = evaluar({ orig, corr, stockActual: { 2: 100 } });
  // revert: combo B2 + suelto B3 = +5 ; reapply consolida B(4+5)=9 → -9 ; delta = -4
  ok("combo+suelto: pl2 delta -4 (consolidado, sin doble consumo)", deltaDe(r, 2) === -4);
}
// 13) servicio (sin stock)
{
  const orig = [oNormal(1, 10, null, 1, 5000, { servicio: true })];
  const corr = [cServicio(10, 6000, 1)];
  const r = evaluar({ orig, corr, stockActual: {} });
  ok("servicio: sin delta de stock", r.deltaStock.length === 0 && r.bloqueos.length === 0);
}
// 14) stock insuficiente
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 10, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 0 } }); // consume 8 más sobre 0
  ok("stock insuficiente: bloquea confirmar", r.stockInsuficiente.length === 1 && r.puedeConfirmar === false);
}
// 15) allowNegativeStock
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 10, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 0 }, allowNegative: true });
  ok("allowNegative: permite confirmar", r.stockInsuficiente.length === 0 && r.puedeConfirmar === true);
}
// 16) legacy GENUINAMENTE ambiguo bloqueado (si se toca): depósito MIXTO factor 2
//     con precioCosto que no coincide con bulto ni unidad → no reconstruible.
{
  const legAmbiguo = { ...oNormal(1, 10, 1, 2, 100, { cantidadStock: null }), esDeposito: true, reconFactorPack: 2, reconModoEnvio: "MIXTO", reconCostoBulto: 999 };
  const orig = [legAmbiguo]; // precioCosto=50 no matchea 999 ni 499.5 → ambiguo
  const corrTocada = [cNormal(10, 1, 3, 100, 1)]; // modifica → requiere revertir → ambigua
  const r1 = evaluar({ orig, corr: corrTocada, stockActual: { 1: 5 } });
  ok("legacy ambiguo tocado: bloqueo + no confirmar", r1.bloqueos.length === 1 && r1.bloqueos[0].detalleId === 1 && r1.puedeConfirmar === false);

  const corrPreservada = [cNormal(10, 1, 2, 100, 1), cNormal(20, 2, 1, 50)]; // legacy preservada, se agrega otra
  const r2 = evaluar({ orig, corr: corrPreservada, stockActual: { 1: 5, 2: 5 } });
  ok("legacy ambiguo preservado: NO bloquea", r2.bloqueos.length === 0 && deltaDe(r2, 2) === -1);
}

console.log("\n=== PAGOS / TOTALES ===");
// 17) mismo total
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 2, 100, 1)]; // idéntico → preservada, sin cambios
  const r = evaluar({ orig, corr, stockActual: { 1: 0 } });
  ok("mismo total: diferencia 0 y sinCambios", r.totales.diferencia === 0 && r.sinCambios === true && r.puedeConfirmar === false);
}
// 18) total menor (devolución)
{
  const orig = [oNormal(1, 10, 1, 10, 100)]; // total 1000
  const corr = [cNormal(10, 1, 8, 100, 1)]; // total 800
  const r = evaluar({ orig, corr, stockActual: { 1: 0 }, totalOrig: 1000, pagosCorr: [{ medio: "EFECTIVO", monto: 800 }] });
  ok("total menor: diferencia -200", r.totales.totalAnterior === 1000 && r.totales.totalNuevo === 800 && r.totales.diferencia === -200 && r.puedeConfirmar === true);
}
// 19) total mayor
{
  const orig = [oNormal(1, 10, 1, 8, 100)];
  const corr = [cNormal(10, 1, 10, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 50 }, totalOrig: 800, pagosCorr: [{ medio: "EFECTIVO", monto: 1000 }] });
  ok("total mayor: diferencia +200", r.totales.diferencia === 200 && r.puedeConfirmar === true);
}
// 20) pagos suma inválida
{
  const orig = [oNormal(1, 10, 1, 8, 100)];
  const corr = [cNormal(10, 1, 10, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 50 }, totalOrig: 800, pagosCorr: [{ medio: "EFECTIVO", monto: 999 }] });
  ok("pagos no cuadran: no confirmar", r.pagos.cuadran === false && r.puedeConfirmar === false);
}
// 21) mixto
{
  const orig = [oNormal(1, 10, 1, 8, 100)]; // total 800 efectivo
  const corr = [cNormal(10, 1, 8, 100, 1), cNormal(20, 2, 1, 200)]; // total 1000
  const r = evaluar({ orig, corr, stockActual: { 1: 0, 2: 5 }, totalOrig: 800, pagosCorr: [{ medio: "EFECTIVO", monto: 700 }, { medio: "DEBITO", monto: 300 }] });
  const dp = r.diffPagos;
  ok("mixto: cuadra + diffPagos EFECTIVO y DEBITO", r.pagos.cuadran === true && dp.some((x) => x.medio === "DEBITO" && x.montoDespues === 300) && dp.some((x) => x.medio === "EFECTIVO"));
}
// 22) cambio de cliente
{
  const orig = [oNormal(1, 10, 1, 2, 100)];
  const corr = [cNormal(10, 1, 3, 100, 1)];
  const r = evaluar({ orig, corr, stockActual: { 1: 5 }, clienteAntes: 1, clienteDespues: 7 });
  ok("cambio cliente: registrado", r.cambioCliente && r.cambioCliente.antes === 1 && r.cambioCliente.despues === 7);
}

console.log("\n=== reconstruirConsumoOriginal (unit) ===");
ok("normal congelado", reconstruirConsumoOriginal(oNormal(1, 1, 5, 2, 10, { cantidadStock: 2 })).consumo[0].cantidad === 2);
ok("normal legacy LOCAL → auto-reconstruye (cantidad)", reconstruirConsumoOriginal(oNormal(1, 1, 5, 2, 10, { cantidadStock: null })).reconstruccion === "AUTO_LOCAL");
ok("combo componentes → consumo", reconstruirConsumoOriginal(oCombo(1, 9, 1, 10, [{ productoBaseId: 2, productoLocalId: 5, cantidad: 3 }])).consumo[0].cantidad === 3);
ok("combo sin componentes → ambigua", reconstruirConsumoOriginal({ id: 1, nombre: "c", esServicio: false, componentes: [], esCombo: true, cantidadStock: null, productoLocalId: null }).ambigua === true);
ok("servicio → sin consumo", reconstruirConsumoOriginal(oNormal(1, 1, null, 1, 10, { servicio: true })).consumo.length === 0);

console.log("\n=== RECONSTRUCCIÓN LEGACY (consumo histórico) ===");
// det legacy enriquecido (cantidadStock null, con config de reconstrucción).
function legDet(o = {}) {
  return {
    id: o.id || 1, esServicio: false, componentes: [], cantidadStock: null,
    productoLocalId: null, productoLocalIdResuelto: o.pl ?? 5, cantidad: o.cantidad ?? 1,
    precioCosto: o.precioCosto, esDeposito: o.esDeposito ?? true,
    reconFactorPack: o.factor ?? 2, reconModoEnvio: o.modoEnvio ?? "SOLO_BULTO",
    reconCostoBulto: o.costoBulto ?? 82000, reconEsPiezaFiambre: o.pieza ?? false,
    modalidadConfirmada: o.modalidad ?? null,
  };
}
const R = (o) => reconstruirConsumoOriginal(legDet(o));

// #823 equivalente: depósito, factor 2, SOLO_BULTO, precioCosto 82000 == costoBulto → BULTO, cantidadStock 2
{
  const r = R({ esDeposito: true, factor: 2, modoEnvio: "SOLO_BULTO", cantidad: 1, precioCosto: 82000, costoBulto: 82000 });
  ok("#823: reconstruye BULTO, cantidadStock=2, no ambigua", !r.ambigua && r.modalidad === "BULTO" && r.consumo[0].cantidad === 2 && r.reconstruccion === "AUTO_COSTO", JSON.stringify(r));
}
// Decimal sin float: costoBulto 100 factor 3 → unidad 33.33
ok("costo unidad coincide (100/3=33.33) → UNIDAD", (() => { const r = R({ modoEnvio: "MIXTO", factor: 3, costoBulto: 100, precioCosto: 33.33, cantidad: 1 }); return !r.ambigua && r.modalidad === "UNIDAD" && r.consumo[0].cantidad === 1; })());
ok("costo bulto coincide (100) → BULTO (×3=3)", (() => { const r = R({ modoEnvio: "MIXTO", factor: 3, costoBulto: 100, precioCosto: 100, cantidad: 1 }); return !r.ambigua && r.modalidad === "BULTO" && r.consumo[0].cantidad === 3; })());
// MIXTO ninguna coincidencia (drift) → ambiguo
ok("MIXTO sin coincidencia de costo → ambiguo", R({ modoEnvio: "MIXTO", factor: 2, costoBulto: 82000, precioCosto: 999, cantidad: 1 }).ambigua === true);
// coincidencia doble (costos minúsculos donde bulto y unidad redondean igual) → ambiguo
ok("coincidencia doble → ambiguo", (() => { const r = R({ modoEnvio: "MIXTO", factor: 2, costoBulto: 0.01, precioCosto: 0.01, cantidad: 1 }); return r.ambigua && r.motivo === "coincidencia_doble"; })());
// drift factor_pack: precioCosto = costoBulto/2 pero factor actual 6 → no matchea ni bulto ni /6 → ambiguo
ok("drift factor_pack → ambiguo", R({ modoEnvio: "MIXTO", factor: 6, costoBulto: 120000, precioCosto: 60000, cantidad: 1 }).ambigua === true);
// SOLO_BULTO invalida UNIDAD: precioCosto matchea unidad (contradicción) → ambiguo
ok("SOLO_BULTO + costo de unidad (contradicción) → ambiguo", (() => { const r = R({ modoEnvio: "SOLO_BULTO", factor: 2, costoBulto: 82000, precioCosto: 41000, cantidad: 1 }); return r.ambigua && r.motivo === "contradiccion_costo_modo_envio"; })());
ok("SOLO_BULTO: manual UNIDAD → modalidad inválida", R({ modoEnvio: "SOLO_BULTO", factor: 2, costoBulto: 82000, precioCosto: 82000, modalidad: "UNIDAD" }).motivo === "modalidad_invalida_para_producto");
// SOLO_UNIDAD invalida BULTO: auto UNIDAD (cantidad), manual BULTO inválido
ok("SOLO_UNIDAD (factor>1) → auto UNIDAD (cantidad)", (() => { const r = R({ modoEnvio: "SOLO_UNIDAD", factor: 6, costoBulto: 60000, precioCosto: 10000, cantidad: 2 }); return !r.ambigua && r.modalidad === "UNIDAD" && r.consumo[0].cantidad === 2; })());
ok("SOLO_UNIDAD: manual BULTO → inválido", R({ modoEnvio: "SOLO_UNIDAD", factor: 6, costoBulto: 60000, precioCosto: 10000, modalidad: "BULTO" }).motivo === "modalidad_invalida_para_producto");
// modalidad manual válida (MIXTO ambiguo + admin elige BULTO) → cantidadStock ×factor
ok("manual BULTO válido → cantidadStock ×factor", (() => { const r = R({ modoEnvio: "MIXTO", factor: 2, costoBulto: 500, precioCosto: 999, cantidad: 3, modalidad: "BULTO" }); return !r.ambigua && r.modalidad === "BULTO" && r.consumo[0].cantidad === 6 && r.reconstruccion === "MANUAL"; })());
// local → AUTO_LOCAL cantidad
ok("local (no depósito) → AUTO_LOCAL cantidad", (() => { const r = R({ esDeposito: false, cantidad: 4 }); return !r.ambigua && r.reconstruccion === "AUTO_LOCAL" && r.consumo[0].cantidad === 4; })());
// depósito factor<=1 → AUTO_SIN_PACK
ok("depósito factor<=1 → AUTO_SIN_PACK", (() => { const r = R({ esDeposito: true, factor: 1, cantidad: 5, modoEnvio: "SOLO_BULTO", costoBulto: 100, precioCosto: 100 }); return !r.ambigua && r.reconstruccion === "AUTO_SIN_PACK" && r.consumo[0].cantidad === 5; })());
// sin ProductoLocal → ambiguo
ok("sin ProductoLocal → ambiguo sin_producto_local", (() => { const d = legDet({}); d.productoLocalIdResuelto = null; const r = reconstruirConsumoOriginal(d); return r.ambigua && r.motivo === "sin_producto_local"; })());
// congelado (nueva) → CONGELADO
ok("congelado (cantidadStock set) → CONGELADO", (() => { const d = legDet({}); d.cantidadStock = 7; d.productoLocalId = 5; const r = reconstruirConsumoOriginal(d); return !r.ambigua && r.reconstruccion === "CONGELADO" && r.consumo[0].cantidad === 7; })());

console.log(`\nRESULTADO MOTOR-CORRECCIÓN (B1): ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
