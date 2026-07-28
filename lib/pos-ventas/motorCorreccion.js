// lib/pos-ventas/motorCorreccion.js
//
// MOTOR PURO de corrección COMPLETA de ventas (Fase B, Checkpoint B1). Sin
// Prisma: recibe el estado original (con el consumo físico CONGELADO) y el
// estado corregido (líneas comerciales nuevas), y produce:
//   · clasificación de líneas (preservadas / modificadas / agregadas / eliminadas)
//   · reversión + reaplicación → DELTA NETO de stock por productoLocalId
//   · validación de stock final (respeta allowNegativeStock)
//   · diff de productos / pagos / cliente / totales
//   · bloqueos de líneas legacy cuyo consumo original NO se puede reconstruir
//
// Modelo de reemplazo quirúrgico: una línea PRESERVADA (misma identidad, cantidad
// y precio que el original) NO se revierte ni se reaplica — su stock queda igual.
// Solo las MODIFICADAS y ELIMINADAS se revierten; las MODIFICADAS y AGREGADAS se
// reaplican. Así, una línea legacy ambigua solo bloquea si se la toca.
//
//   deltaStock[pl] = Σ retorno(revert: modificadas+eliminadas)
//                  − Σ consumo(reapply: modificadas+agregadas)
//   stockDespués = stockActual + deltaStock   (stockActual ya refleja el consumo original)

import { planConsumoVenta } from "../combos/planConsumoVenta.js";
import { round2 } from "./pagos.js";

function round3(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}
const casiIgual = (a, b, eps = 0.001) => Math.abs(Number(a) - Number(b)) < eps;

// --- Reconstrucción del consumo físico de UNA línea original ----------------
// Para líneas CONGELADAS (nuevas) usa cantidadStock. Para LEGACY (cantidadStock
// null) reconstruye de forma DETERMINÍSTICA cuando la evidencia lo permite, o
// marca AMBIGUA (requiere confirmación manual) si hay >1 interpretación válida.
//
// El `det` viene ENRIQUECIDO por el server (lib/pos-ventas/correccionCompletaServer):
//   esDeposito, reconFactorPack, reconModoEnvio, reconCostoBulto,
//   reconEsPiezaFiambre, productoLocalIdResuelto, modalidadConfirmada.
//
// Comparación monetaria ROBUSTA en centavos enteros (no igualdad de float).
const TOL_CENT = 1; // tolerancia por el redondeo de costoBulto/factor a 2 decimales
const centavos = (n) => Math.round((Number(n) || 0) * 100);

// Modalidades de venta válidas en depósito según modo_envio (con factor>1).
function modalidadesValidasDeposito(modoEnvio) {
  if (modoEnvio === "SOLO_BULTO") return ["BULTO"];
  if (modoEnvio === "SOLO_UNIDAD") return ["UNIDAD"];
  return ["BULTO", "UNIDAD"]; // MIXTO / null → ambas posibles
}
// cantidadStock física según la modalidad comercial.
function cantidadStockDe(modalidad, cantidad, factor) {
  return modalidad === "BULTO" ? round3(cantidad * factor) : round3(cantidad);
}
function opcionesModalidad(validas, factor, cantidad, matched) {
  return validas.map((m) => ({
    modalidad: m,
    cantidadStock: cantidadStockDe(m, cantidad, factor),
    coincideCosto: matched.includes(m),
    label: m === "BULTO" ? `Bulto (×${factor} = ${cantidadStockDe("BULTO", cantidad, factor)} u)` : `Unidad (${round3(cantidad)} u)`,
  }));
}

export function reconstruirConsumoOriginal(det) {
  if (det.esServicio) return { consumo: [], ambigua: false, reconstruccion: "SERVICIO" };

  const componentes = det.componentes || [];
  const esCombo = componentes.length > 0 || det.esCombo === true;
  if (esCombo) {
    if (componentes.length === 0) return { ambigua: true, motivo: "combo_sin_componentes_congelados" };
    const consumo = [];
    for (const c of componentes) {
      if (c.productoLocalId == null) return { ambigua: true, motivo: "combo_componente_sin_productolocal" };
      consumo.push({ productoLocalId: c.productoLocalId, cantidad: round3(c.cantidad) });
    }
    return { consumo, ambigua: false, reconstruccion: "COMBO" };
  }

  // NORMAL ya CONGELADO (venta nueva): consumo exacto.
  if (det.cantidadStock != null && det.productoLocalId != null) {
    return { consumo: [{ productoLocalId: det.productoLocalId, cantidad: round3(det.cantidadStock) }], ambigua: false, reconstruccion: "CONGELADO" };
  }

  // ----- LEGACY (cantidadStock == null): reconstruir -----
  const pl = det.productoLocalId ?? det.productoLocalIdResuelto ?? null;
  if (pl == null) return { ambigua: true, motivo: "sin_producto_local" };
  const cantidad = round3(det.cantidad);

  // Local (no depósito): la escala de stock == cantidad comercial (config-independiente).
  if (!det.esDeposito) return { consumo: [{ productoLocalId: pl, cantidad }], ambigua: false, reconstruccion: "AUTO_LOCAL", modalidad: "UNIDAD" };

  // Depósito PIEZA fiambre → escala en piezas == cantidad.
  if (det.reconEsPiezaFiambre) return { consumo: [{ productoLocalId: pl, cantidad }], ambigua: false, reconstruccion: "AUTO_PIEZA", modalidad: "PIEZA" };

  const factor = Math.max(1, Number(det.reconFactorPack) || 1);
  // Depósito sin pack (factor<=1) → escala == cantidad.
  if (factor <= 1) return { consumo: [{ productoLocalId: pl, cantidad }], ambigua: false, reconstruccion: "AUTO_SIN_PACK", modalidad: "UNIDAD" };

  // Depósito con factor>1: modalidades válidas según modo_envio.
  const validas = modalidadesValidasDeposito(det.reconModoEnvio);

  // Escala inferida por el precioCosto CONGELADO (evidencia): bulto vs unidad.
  const costoBulto = Number(det.reconCostoBulto);
  const tieneCosto = Number.isFinite(costoBulto) && costoBulto > 0;
  const matched = [];
  if (tieneCosto) {
    const fC = centavos(det.precioCosto), bC = centavos(costoBulto), uC = centavos(costoBulto / factor);
    if (Math.abs(fC - bC) <= TOL_CENT) matched.push("BULTO");
    if (Math.abs(fC - uC) <= TOL_CENT) matched.push("UNIDAD");
  }

  // Modalidad CONFIRMADA manualmente por el admin (override explícito).
  if (det.modalidadConfirmada) {
    const m = det.modalidadConfirmada;
    if (!validas.includes(m)) {
      return { ambigua: true, motivo: "modalidad_invalida_para_producto", modalidadesPosibles: opcionesModalidad(validas, factor, cantidad, matched) };
    }
    return { consumo: [{ productoLocalId: pl, cantidad: cantidadStockDe(m, cantidad, factor) }], ambigua: false, reconstruccion: "MANUAL", modalidad: m };
  }

  // Auto: candidatas = válidas por modo_envio ∩ (matcheadas por costo, si hay evidencia).
  const candidatas = validas.filter((m) => matched.length === 0 || matched.includes(m));
  if (candidatas.length === 1) {
    const m = candidatas[0];
    const reconstruccion = matched.includes(m) ? "AUTO_COSTO" : "AUTO_MODO_ENVIO";
    return { consumo: [{ productoLocalId: pl, cantidad: cantidadStockDe(m, cantidad, factor) }], ambigua: false, reconstruccion, modalidad: m };
  }

  // AMBIGUA → confirmación manual. Nunca inventar.
  const recomList = matched.filter((m) => validas.includes(m));
  const recomendada = recomList.length === 1 ? recomList[0] : null;
  let motivo;
  if (candidatas.length === 0) motivo = "contradiccion_costo_modo_envio";
  else if (matched.length >= 2) motivo = "coincidencia_doble";
  else if (tieneCosto && matched.length === 0) motivo = "drift_costo_sin_coincidencia";
  else motivo = "modalidad_indeterminada";
  return { ambigua: true, motivo, modalidadesPosibles: opcionesModalidad(validas, factor, cantidad, matched), recomendada };
}

// Identidad comercial de una línea corregida (para matchear con su original).
function identidadCorregida(l) {
  const pl = l.tipo === "COMBO" ? l.comboProductoLocalId : l.productoLocalId;
  return { baseId: l.productoBaseId, pl, cantidad: Number(l.cantidad), precio: Number(l.precio) };
}

// --- Clasificación de líneas por origenDetalleId ----------------------------
export function clasificarLineas(originalDetalles, corregidoLineas) {
  const origById = new Map(originalDetalles.map((d) => [d.id, d]));
  const referenciados = new Set();
  const preservadas = [], modificadas = [], agregadas = [];

  for (const l of corregidoLineas) {
    const oid = l.origenDetalleId ?? null;
    if (oid != null && origById.has(oid)) {
      referenciados.add(oid);
      const orig = origById.get(oid);
      const id = identidadCorregida(l);
      const mismaIdentidad =
        Number(orig.productoBaseId) === Number(id.baseId) &&
        casiIgual(orig.cantidad, id.cantidad) &&
        casiIgual(orig.precio, id.precio);
      if (mismaIdentidad) preservadas.push({ linea: l, original: orig });
      else modificadas.push({ linea: l, original: orig });
    } else {
      agregadas.push({ linea: l });
    }
  }
  const eliminadas = originalDetalles
    .filter((d) => !referenciados.has(d.id))
    .map((original) => ({ original }));

  return { preservadas, modificadas, agregadas, eliminadas };
}

// Convierte el consumo consolidado de planConsumoVenta a Map pl→qty.
function consumoDePlan(lineas, esDeposito) {
  const { consumoFisicoConsolidado } = planConsumoVenta({ lineas, esDeposito });
  const m = new Map();
  for (const e of consumoFisicoConsolidado) m.set(e.productoLocalId, round3(e.cantidad));
  return m;
}

// --- Delta neto de stock ----------------------------------------------------
// revertLineas: originales a revertir (modificadas + eliminadas) → suman retorno.
// reaplicarLineas: corregidas a reaplicar (modificadas + agregadas) → restan consumo.
export function calcularDeltaStock({ revertDetalles, reaplicarLineas, esDeposito }) {
  const delta = new Map(); // pl → cantidad a SUMAR a StockLocal
  const bloqueos = [];

  const add = (pl, q) => delta.set(pl, round3((delta.get(pl) || 0) + q));

  // Retorno (reversión): reconstruye el consumo congelado; bloquea si ambiguo.
  for (const det of revertDetalles) {
    const r = reconstruirConsumoOriginal(det);
    if (r.ambigua) {
      bloqueos.push({
        tipo: "legacy_no_reconstruible", detalleId: det.id, nombre: det.nombre, motivo: r.motivo,
        modalidadesPosibles: r.modalidadesPosibles || null, recomendada: r.recomendada || null,
      });
      continue;
    }
    for (const c of r.consumo) add(c.productoLocalId, c.cantidad); // devuelve stock
  }

  // Consumo (reaplicación): plan de consumo de las líneas nuevas/modificadas.
  const consumoNuevo = consumoDePlan(reaplicarLineas, esDeposito);
  for (const [pl, q] of consumoNuevo.entries()) add(pl, -q); // descuenta stock

  return { delta, bloqueos };
}

// --- Validación de stock final ----------------------------------------------
export function validarStockFinal({ delta, stockActual = {}, allowNegative = false }) {
  const permite = typeof allowNegative === "function" ? allowNegative : () => allowNegative === true;
  const filas = [];
  const insuficientes = [];
  for (const [pl, d] of delta.entries()) {
    if (casiIgual(d, 0)) continue; // sin efecto neto
    const antes = Number(stockActual[pl] ?? 0);
    const despues = round3(antes + d);
    const insuficiente = despues < 0 && !permite(pl);
    const fila = { productoLocalId: pl, delta: round3(d), stockAntes: round3(antes), stockDespues: despues, insuficiente };
    filas.push(fila);
    if (insuficiente) insuficientes.push(fila);
  }
  filas.sort((a, b) => a.productoLocalId - b.productoLocalId); // orden estable
  return { filas, insuficientes };
}

// --- Diff de productos ------------------------------------------------------
export function construirDiffProductos(clas) {
  const linea = (l, orig) => ({
    origenDetalleId: l?.origenDetalleId ?? orig?.id ?? null,
    productoBaseId: (l?.productoBaseId ?? orig?.productoBaseId) ?? null,
    nombre: l?.nombre ?? orig?.nombre ?? null,
  });
  return {
    agregadas: clas.agregadas.map(({ linea: l }) => ({
      ...linea(l, null), cantidad: Number(l.cantidad), precio: round2(l.precio), subtotal: round2(Number(l.precio) * Number(l.cantidad)),
    })),
    eliminadas: clas.eliminadas.map(({ original: o }) => ({
      ...linea(null, o), cantidad: Number(o.cantidad), precio: round2(o.precio), subtotal: round2(o.subtotal ?? Number(o.precio) * Number(o.cantidad)),
    })),
    modificadas: clas.modificadas.map(({ linea: l, original: o }) => ({
      ...linea(l, o),
      cantidadAntes: Number(o.cantidad), cantidadDespues: Number(l.cantidad),
      precioAntes: round2(o.precio), precioDespues: round2(l.precio),
      subtotalAntes: round2(o.subtotal ?? Number(o.precio) * Number(o.cantidad)),
      subtotalDespues: round2(Number(l.precio) * Number(l.cantidad)),
    })),
  };
}

// --- Diff de pagos ----------------------------------------------------------
export function construirDiffPagos(pagosAntes = [], pagosDespues = []) {
  const mapa = (arr) => {
    const m = new Map();
    for (const p of arr) m.set(String(p.medio).toUpperCase(), round2((m.get(String(p.medio).toUpperCase()) || 0) + Number(p.monto)));
    return m;
  };
  const a = mapa(pagosAntes), b = mapa(pagosDespues);
  const medios = new Set([...a.keys(), ...b.keys()]);
  const out = [];
  for (const medio of medios) {
    const montoAntes = a.get(medio) || 0, montoDespues = b.get(medio) || 0;
    if (!casiIgual(montoAntes, montoDespues)) out.push({ medio, montoAntes, montoDespues });
  }
  return out.sort((x, y) => x.medio.localeCompare(y.medio));
}

// --- Totales ----------------------------------------------------------------
export function calcularTotales(corregidoLineas, { descuento = 0 } = {}) {
  const bruto = corregidoLineas.reduce((acc, l) => acc + Number(l.precio) * Number(l.cantidad), 0);
  const total = round2(bruto - Number(descuento || 0));
  return { bruto: round2(bruto), descuento: round2(descuento || 0), total };
}

// --- Orquestador ------------------------------------------------------------
// Devuelve la evaluación completa (usada por revisar y por corregir para validar).
export function evaluarCorreccion({
  original,           // { detalles:[...], pagos:[...], clienteId, total, esFiado }
  corregido,          // { lineas:[...], pagos:[...], clienteId, descuento }
  esDeposito = false,
  stockActual = {},
  allowNegative = false,
} = {}) {
  const clas = clasificarLineas(original.detalles || [], corregido.lineas || []);

  const revertDetalles = [...clas.modificadas.map((x) => x.original), ...clas.eliminadas.map((x) => x.original)];
  const reaplicarLineas = [...clas.modificadas.map((x) => x.linea), ...clas.agregadas.map((x) => x.linea)];

  const { delta, bloqueos } = calcularDeltaStock({ revertDetalles, reaplicarLineas, esDeposito });
  const { filas, insuficientes } = validarStockFinal({ delta, stockActual, allowNegative });

  const diffProductos = construirDiffProductos(clas);
  const diffPagos = construirDiffPagos(original.pagos, corregido.pagos);
  const cambioCliente = (original.clienteId ?? null) !== (corregido.clienteId ?? null)
    ? { antes: original.clienteId ?? null, despues: corregido.clienteId ?? null } : null;

  const totales = calcularTotales(corregido.lineas || [], { descuento: corregido.descuento });
  const totalAnterior = round2(original.total ?? 0);
  const totalNuevo = totales.total;
  const diferencia = round2(totalNuevo - totalAnterior);

  // Validación de suma de pagos == total nuevo (fail-closed si no cuadra).
  const sumaPagos = round2((corregido.pagos || []).reduce((a, p) => a + Number(p.monto), 0));
  const pagosCuadran = casiIgual(sumaPagos, totalNuevo);

  const advertencias = [];
  if (!pagosCuadran) advertencias.push({ tipo: "pagos_no_cuadran", detalle: `Σ pagos ${sumaPagos} ≠ total ${totalNuevo}` });
  if (insuficientes.length) advertencias.push({ tipo: "stock_insuficiente", productos: insuficientes.map((f) => f.productoLocalId) });

  const sinCambios =
    clas.modificadas.length === 0 && clas.agregadas.length === 0 && clas.eliminadas.length === 0 &&
    diffPagos.length === 0 && !cambioCliente;

  const puedeConfirmar = bloqueos.length === 0 && insuficientes.length === 0 && pagosCuadran && !sinCambios;

  return {
    ok: bloqueos.length === 0,
    bloqueos,
    clasificacion: {
      preservadas: clas.preservadas.length,
      modificadas: clas.modificadas.length,
      agregadas: clas.agregadas.length,
      eliminadas: clas.eliminadas.length,
    },
    deltaStock: filas,
    stockInsuficiente: insuficientes,
    diffProductos,
    diffPagos,
    cambioCliente,
    totales: { totalAnterior, totalNuevo, diferencia },
    pagos: { sumaPagos, cuadran: pagosCuadran },
    advertencias,
    sinCambios,
    puedeConfirmar,
  };
}
