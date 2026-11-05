// LOS CASOS DE LA TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: RECEPCIÓN Y COMPROBANTE.
//
// Lo comparten los candados de `estadoDeLineaFacturada`, `gananciaDelDeposito`,
// `laCantidadCuadraConElPrecio`, `comprobante/vinculo`, `cierreDeRecepcion`,
// `recibir/[id]` y `HojaCorregirLinea`. Cada grilla se corrió con el código
// ANTERIOR a la tanda 13 (2026-11-05), dos veces seguidas e idénticas, y cada
// candado guarda la huella SHA-256 de su grilla.
//
// ── DE DÓNDE SALE LA FORMA DE CADA FILA ────────────────────────────────────
//
// Las plantillas son las tres filas reales de la conciliación del pedido 362 de
// Arcor (`arcor362Filas.fixture.json`, de la ruta GET de producción). A cada una
// se le cambian el factor, la unidad y las cantidades de cada caso; el resto de
// sus campos queda como vino.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import * as E from "../compras-proveedor/estadoDeLineaFacturada.js";
import * as G from "../compras-proveedor/gananciaDelDeposito.js";
import { laCantidadCuadraConElPrecio } from "../compras-proveedor/laCantidadCuadraConElPrecio.js";
import { precioCuadra } from "../compras-proveedor/comprobante/vinculo.js";
import { recibidosDelCierre, sueltasDelCierre } from "../compras-proveedor/cierreDeRecepcion.js";

export const huella = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

const PLANTILLAS = JSON.parse(readFileSync(new URL("../compras-proveedor/arcor362Filas.fixture.json", import.meta.url), "utf8"));

/** Las fichas de la tanda, como las lleva una fila de la conciliación. */
export const FICHAS = {
  pack12: { factorPack: 12, esFiambre: false, porKilo: false, costo: 38400 },
  pack24: { factorPack: 24, esFiambre: false, porKilo: false, costo: 45600 },
  kilo: { factorPack: 1, esFiambre: false, porKilo: true, costo: 8000 },
  fiambrePieza: { factorPack: 1, esFiambre: true, porKilo: false, costo: 9000 },
  // La fila del maní lleva su `factor_pack` crudo, como lo arma `analisisDeComprobante`.
  mani1881: { factorPack: 2, esFiambre: true, porKilo: false, costo: 3000 },
};

const intentar = (f) => {
  try {
    const v = f();
    return v === undefined ? "∅" : v;
  } catch (e) {
    return `LANZA: ${e.message}`;
  }
};

/** Cada caso: plantilla × ficha × unidad del pedido × [cantidad, recibida, sueltas, físicas]. */
export function filas() {
  const out = [];
  for (const [p, plantilla] of PLANTILLAS.entries()) for (const [k, f] of Object.entries(FICHAS)) for (const unidadPedido of ["BULTO", "UNIDAD"]) for (const [cant, recibida, sueltas, fisicas] of [[3, 3, 0, null], [2.5, 2, 6, 30], [30, 25, 0, 25], [3, 0, 3, 3], [1, 1, 0, 12]]) {
    const costoLinea = unidadPedido === "UNIDAD" && f.factorPack > 1 ? f.costo / f.factorPack : f.costo;
    out.push([`${p}|${k}|${unidadPedido}|${cant}|${recibida}|${sueltas}|${fisicas}`, {
      ...plantilla, factorPack: f.factorPack, esFiambre: f.esFiambre, porKilo: f.porKilo, cantidadEnKilos: false,
      unidadPedido, unidad: unidadPedido, cantidad: cant, cantidadPedida: cant, cantidadRecibida: recibida, unidadesSueltas: sueltas,
      unidadesFisicas: fisicas, costoMaestroHoy: f.costo, costoCatalogo: f.costo, costoFactura: costoLinea * 1.023,
      importeDelPapel: costoLinea * 1.023 * cant, subtotal: costoLinea * 1.023 * cant, precio: costoLinea,
    }]);
  }
  return out;
}

// Las funciones que reciben una fila. `enUnidadesDeLaFila` nació en la tanda 13
// y no está en la grilla del código anterior; `bultoDeLaFila`, en la 16.
const NO_SON_DE_FILA = ["opcionesDeFiltro", "textoSiAceptaElSalto", "textoSiNoAceptaElSalto", "pasaFiltro", "enUnidadesDeLaFila", "bultoDeLaFila"];
const FUNCIONES_DE_FILA = Object.keys(E).filter((n) => typeof E[n] === "function" && !NO_SON_DE_FILA.includes(n));

export function estados() {
  const out = {};
  for (const [n, fila] of filas()) {
    out[n] = Object.fromEntries(FUNCIONES_DE_FILA.map((fn) => [fn, intentar(() => E[fn](fila))]));
    out[n].filtros = Object.fromEntries(Object.values(E.FILTRO).map((fl) => [fl, intentar(() => E.pasaFiltro(fila, fl))]));
  }
  out.opciones = intentar(() => E.opcionesDeFiltro(filas().map(([, f]) => f)));
  return out;
}

export function ganancias() {
  const out = {};
  for (const [n, fila] of filas()) out[n] = { valoriza: intentar(() => G.cuantoSeValoriza(fila)), fuera: intentar(() => G.motivoFueraDeLaCuenta(fila)) };
  for (const k of Object.keys(FICHAS)) {
    const delCaso = filas().filter(([n]) => n.split("|")[1] === k).map(([, f]) => f);
    const r = intentar(() => G.gananciaDelDeposito(delCaso));
    out[`total|${k}`] = r;
    out[`texto|${k}`] = intentar(() => G.textoDeLaCuenta(r));
  }
  return out;
}

export function cuadres() {
  const out = {};
  for (const [k, f] of Object.entries(FICHAS)) for (const unidad of ["BULTO", "UNIDAD"]) for (const [cantidad, fisicas, precioLinea, subtotal] of [[6, 120, 6136, 36817], [90, 3, 1300, 117000], [8, 48, 2300, 18400], [3, 36, 38400, 115200], [2.5, 30, 38400, 96000], [3, 3, 9000, 27000], [0, 0, 100, 0], [3, null, 100, 300]]) {
    for (const factorPack of [f.factorPack, 20, 24]) {
      out[`${k}|${unidad}|${cantidad}|${fisicas}|${precioLinea}|${subtotal}|${factorPack}`] = intentar(() => laCantidadCuadraConElPrecio({ subtotal, cantidad, fisicas, porKilo: f.porKilo && unidad === "UNIDAD", factorPack }));
    }
  }
  return out;
}

export function vinculos() {
  const out = {};
  for (const factorPack of [null, 1, 2, 6, 12, 24, "12"]) for (const [importe, cantidad] of [[38400, 1], [3200, 1], [116700, 30], [0, 1], [100, 0]]) for (const costo of [38400, 3200, 40140, 0]) for (const variacionPct of [null, 5, 20]) {
    out[`${factorPack}|${importe}|${cantidad}|${costo}|${variacionPct}`] = precioCuadra({ precio: { importe, cantidad }, linea: { precioCostoDelPedido: costo, factorPack }, variacionPct });
  }
  return out;
}

export function cierres() {
  const out = {};
  for (const [n, fila] of filas()) {
    const conId = [{ ...fila, pedidoDetalleId: 1 }];
    out[n] = intentar(() => ({ recibidos: recibidosDelCierre({ filas: conId }), sueltas: sueltasDelCierre({ filas: conId }) }));
  }
  return out;
}
