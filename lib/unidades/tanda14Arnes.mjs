// LOS CASOS DE LA TANDA 14 DE LA REGLA ÚNICA DE UNIDADES: LA CORRECCIÓN DE UNA
// VENTA DEL POS.
//
// Lo comparten los candados de `motorCorreccion` y `correccionCompletaServer`.
// Cada grilla se corrió con el código ANTERIOR a la tanda 14 (2026-11-05), dos
// veces seguidas e idénticas, y cada candado guarda la huella SHA-256 de su
// grilla.
//
// Las fichas son las de `posVentaConLaPieza.productos.json` (tanda 8): pack de
// 12, sueltas, kilo, fiambre por pieza, el maní 1881 con su ficha real y el kilo
// con pack. La base es un doble que contesta lo que piden
// `cargarMapsProductos` y `resolverLineasCorregidas`, con sus mismos campos.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { reconstruirConsumoOriginal, calcularDeltaStock, clasificarLineas } from "../pos-ventas/motorCorreccion.js";
import { resolverLineasCorregidas } from "../pos-ventas/correccionCompletaServer.js";

export const huella = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const P = JSON.parse(readFileSync(new URL("./posVentaConLaPieza.productos.json", import.meta.url), "utf8"));
export const BASES = Object.fromEntries(Object.entries(P).filter(([k]) => k.startsWith("base_")).map(([k, v]) => [k.slice(5), v]));

/** La reconstrucción del consumo de una venta vieja, en todas las combinaciones de la grilla. */
export function reconstrucciones() {
  const out = {};
  for (const esDeposito of [false, true]) for (const factor of [1, 2, 12, 24]) for (const modoEnvio of [null, "MIXTO", "SOLO_BULTO", "SOLO_UNIDAD"]) for (const [precioCosto, costoBulto] of [[38400, 38400], [3200, 38400], [3200.01, 38400], [1480, 1480], [100, 38400], [null, null]]) for (const confirmada of [null, "BULTO", "UNIDAD"]) for (const pieza of [false, true]) {
    const det = { id: 1, productoLocalId: 11, cantidad: 3, esDeposito, reconFactorPack: factor, reconModoEnvio: modoEnvio, precioCosto, reconCostoBulto: costoBulto, modalidadConfirmada: confirmada, reconEsPiezaFiambre: pieza };
    out[`${esDeposito}|${factor}|${modoEnvio}|${precioCosto}|${costoBulto}|${confirmada}|${pieza}`] = reconstruirConsumoOriginal(det);
  }
  return out;
}

const dbDe = () => ({
  productoBase: {
    findMany: async ({ where }) =>
      where.id.in.map((id) => Object.values(BASES).find((b) => b.id === id)).filter(Boolean).map((b) => ({ ...b, modalidad: "NORMAL", recargoServicioDefaultPct: null })),
  },
  productoLocal: {
    findMany: async ({ where }) =>
      where.baseId.in.map((baseId) => ({
        id: baseId * 10, baseId, activo: true, recargoServicioPct: null,
        precio_venta_suelto: baseId === 102 ? 900 : null,
        precio_costo: Object.values(BASES).find((b) => b.id === baseId)?.precio_costo ?? null,
      })),
  },
});

/** Las líneas del editor de la corrección, resueltas como en el servidor. */
export async function lineasCorregidas() {
  const out = {};
  for (const esDeposito of [false, true]) for (const [k, base] of Object.entries(BASES)) for (const precioCosto of [undefined, null, 3200, 0, -1]) for (const modo of ["NORMAL", "UNIDAD_REMANENTE"]) {
    const l = { origenDetalleId: 5, productoBaseId: base.id, cantidad: 3, precio: 1000, precioCosto, modoVentaLinea: modo };
    try {
      out[`${esDeposito}|${k}|${precioCosto}|${modo}`] = await resolverLineasCorregidas(dbDe(), { localId: 1, esDeposito, lineasEditor: [l] });
    } catch (e) {
      out[`${esDeposito}|${k}|${precioCosto}|${modo}`] = `LANZA: ${e.message}`;
    }
  }
  return out;
}

/**
 * Una venta corregida: el pack de 12 pasa de 2 a 3 bultos (cambio de cantidad)
 * y el maní se cambia por el fiambre por pieza (cambio de producto). Lo que
 * devuelve y descuenta de stock, en el depósito y en un local.
 */
export async function ventaCorregida() {
  const out = {};
  for (const esDeposito of [true, false]) {
    const original = [
      { id: 1, productoBaseId: 101, productoLocalId: 1010, nombre: "Gaseosa x12", cantidad: 2, cantidadStock: null, precio: 50000, precioCosto: 38400, esDeposito, reconFactorPack: 12, reconModoEnvio: null, reconCostoBulto: 38400 },
      { id: 2, productoBaseId: 1881, productoLocalId: 18810, nombre: "MANI", cantidad: 3, cantidadStock: null, precio: 10000, precioCosto: 6000, esDeposito, reconFactorPack: 2, reconModoEnvio: "SOLO_UNIDAD", reconCostoBulto: 3000, reconEsPiezaFiambre: esDeposito },
    ];
    const editor = [
      { origenDetalleId: 1, productoBaseId: 101, cantidad: 3, precio: 50000, precioCosto: 38400, modoVentaLinea: "NORMAL" },
      { origenDetalleId: 2, productoBaseId: 104, cantidad: 2, precio: 45500, modoVentaLinea: "NORMAL" },
    ];
    const lineas = await resolverLineasCorregidas(dbDe(), { localId: 1, esDeposito, lineasEditor: editor });
    const clas = clasificarLineas(original, lineas);
    const revert = [...clas.modificadas.map((m) => m.original ?? m.orig ?? m), ...(clas.eliminadas || [])].filter((d) => d && d.id != null);
    const reaplicar = [...clas.modificadas.map((m) => m.corregida ?? m.linea ?? m), ...clas.agregadas].filter((x) => x && x.tipo);
    const { delta, bloqueos } = calcularDeltaStock({ revertDetalles: revert.length ? revert : original, reaplicarLineas: reaplicar.length ? reaplicar : lineas, esDeposito });
    out[esDeposito ? "deposito" : "local"] = { lineas, clas: Object.fromEntries(Object.entries(clas).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])), delta: [...delta.entries()], bloqueos };
  }
  return out;
}
