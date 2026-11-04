// lib/productos/cambioDeEscala.js
//
// CARGAR, CAMBIAR O VACIAR LOS SUELTOS POR UNIDAD DE UN PRODUCTO (tercer nivel
// de empaque, tanda 9 — docs/roadmap/tercer-nivel-empaque.md, "trampa 2").
//
// `StockLocal.cantidad` cuenta el escalón más chico. Con 20 sueltos por unidad,
// 10 atados son 200; si la ficha guardara el 20 sin tocar el stock, esos 10
// pasarían a leerse como 10 cigarrillos. Por eso el dato no se guarda solo: en
// la MISMA transacción se reinterpretan todas las cantidades que están en la
// escala vieja —stock, tránsito, mínimo, máximo y las cantidades de los combos
// que lo usan— y el libro de stock deja la constancia (el trigger de
// `ProductoBase` escribe la `ReinterpretacionDeStock`; los movimientos de
// `StockLocal` quedan con el origen CAMBIO_DE_ESCALA).
//
// Vaciar el dato (volver a 1) es la misma operación al revés, con las mismas
// reglas. La conversión es UNA: `cantidadDeStockEnLaEscalaDeHoy`, la misma que
// usan las anulaciones y las correcciones para pasar una cantidad de la escala
// de entonces a la de hoy. No hay una cuenta propia acá.
//
// ── CUÁNDO NO SE DEJA ───────────────────────────────────────────────────────
//
//   · Con transferencias en camino: sus líneas congelaron el N de hoy y el
//     tránsito está contado con él. Recibirlas después de cambiarlo mezclaría
//     escalas.
//   · Con un control de stock abierto en una ubicación del producto: los
//     conteos ya cargados están en la escala de hoy, y terminar el control
//     pone en cero lo que nadie contó.
//   · Si alguna cantidad no da entera en la escala nueva (vaciar con 15 sueltos
//     abiertos, por ejemplo): no se inventa medio atado ni se redondea en
//     silencio. Se dice cuál es y se ajusta primero.
//   · En un producto por kilo o en un combo: el embudo no les da sueltos, así
//     que multiplicar su stock rompería lo que ya funciona.

import { cantidadDeStockEnLaEscalaDeHoy } from "../conversiones/stock.js";
import { declararOrigenDeStock, ORIGEN_STOCK } from "../stock/libro/libroStock.js";
import { declararOrigenDeCosto, ORIGEN_COSTO } from "../precios/origenDeCosto.js";
import { ESTADOS_PENDIENTES_DE_RECEPCION } from "../transferencias/criterioDeCuenta.js";

/**
 * Los estados de una transferencia que tienen mercadería en camino: los que
 * esperan recepción y los dos transitorios de las transacciones que la cierran
 * o la cancelan.
 */
export const ESTADOS_CON_TRANSITO = Object.freeze([...ESTADOS_PENDIENTES_DE_RECEPCION, "Confirmando", "Cancelando"]);

export const TEXTO_CAMBIO_DE_ESCALA = Object.freeze({
  INVALIDO: "Los sueltos por unidad tienen que ser un número entero mayor que 1, o quedar vacíos.",
  KG: "Un producto que se vende por kilo no se vende más chico: dejá vacíos los sueltos por unidad.",
  COMBO: "Un combo no tiene stock propio: los sueltos se cargan en los productos que lo componen.",
  transito: (n) =>
    `No se pueden cambiar los sueltos por unidad: el producto tiene ${n === 1 ? "una transferencia" : `${n} transferencias`} en camino, contada${n === 1 ? "" : "s"} con la escala de hoy. Esperá a que se reciba${n === 1 ? "" : "n"} o se cancele${n === 1 ? "" : "n"}.`,
  conteo: (locales) =>
    `No se pueden cambiar los sueltos por unidad: hay un control de stock abierto en ${locales}, con conteos cargados en la escala de hoy. Terminalo primero.`,
  noEntero: (que) =>
    `No se pueden cambiar los sueltos por unidad: ${que} no da un número entero en la escala nueva. Ajustalo primero.`,
});

/**
 * Lo que llegó del formulario. `undefined` = el cliente no lo maneja y no se
 * toca. Vacío, null o 1 = sin sueltos (null, que la columna lee como 1).
 *
 * @returns {{ sinCambio: true } | { ok: true, valor: number|null } | { ok: false, error: string }}
 */
export function interpretarSueltosPorUnidad(crudo) {
  if (crudo === undefined) return { sinCambio: true };
  if (crudo === null || String(crudo).trim() === "") return { ok: true, valor: null };
  const n = Number(crudo);
  if (n === 1) return { ok: true, valor: null };
  if (!Number.isInteger(n) || n < 1) return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.INVALIDO };
  return { ok: true, valor: n };
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * EL PLAN, sin tocar la base: cada cantidad en la escala nueva, o el motivo por
 * el que no se puede. Puro, para que el candado lo ejerza sin Postgres.
 *
 * @param {object} p
 * @param {number|null} p.anterior   los sueltos por unidad de hoy (null = 1).
 * @param {number|null} p.nuevo      los que se quieren guardar.
 * @param {Array<{id, local, cantidad, enTransito, stockMin, stockMax}>} p.stocks
 * @param {Array<{id, local, cantidad}>} p.componentes  `ComboComponente` del producto.
 * @returns {{ ok: true, stocks: Array<{id, data}>, componentes: Array<{id, cantidad}> }
 *         | { ok: false, error: string }}
 */
export function planDeReinterpretacion({ anterior, nuevo, stocks = [], componentes = [] }) {
  const convertir = (v) =>
    v === null || v === undefined
      ? null
      : Number(cantidadDeStockEnLaEscalaDeHoy({ cantidad: Number(v), sueltosAlMoverse: anterior, sueltosHoy: nuevo }));

  const planStocks = [];
  for (const s of stocks) {
    const data = {
      cantidad: convertir(num(s.cantidad) ?? 0),
      enTransito: convertir(num(s.enTransito) ?? 0),
      stockMin: convertir(num(s.stockMin)),
      stockMax: convertir(num(s.stockMax)),
    };
    const roto = [
      ["el stock", data.cantidad],
      ["el tránsito", data.enTransito],
      ["el mínimo", data.stockMin],
      ["el máximo", data.stockMax],
    ].find(([, v]) => v !== null && !Number.isInteger(v));
    if (roto) return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.noEntero(`${roto[0]} de ${s.local ?? "una ubicación"}`) };
    planStocks.push({ id: s.id, data });
  }

  const planComponentes = [];
  for (const c of componentes) {
    const cantidad = convertir(num(c.cantidad));
    if (!Number.isInteger(cantidad)) {
      return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.noEntero(`la cantidad que lleva un combo de ${c.local ?? "una ubicación"}`) };
    }
    planComponentes.push({ id: c.id, cantidad });
  }

  return { ok: true, stocks: planStocks, componentes: planComponentes };
}

/**
 * CAMBIA LOS SUELTOS POR UNIDAD Y REINTERPRETA TODO LO QUE ESTABA EN LA ESCALA
 * VIEJA, adentro de `tx`. Si no se puede, no escribe nada y devuelve el motivo.
 *
 * El nombre de la unidad y el del bulto NO pasan por acá: son rótulos y no
 * cambian ninguna cantidad (los guarda la ficha como cualquier otro campo).
 *
 * @param {object} tx  el cliente de una transacción interactiva de Prisma.
 * @param {object} p
 * @param {number} p.baseId
 * @param {number|null} p.nuevo  ya interpretado (`interpretarSueltosPorUnidad`).
 * @param {string} [p.unidadMedida]  la que va a quedar en la ficha, si cambia en
 *   el mismo guardado; si no, la de hoy.
 * @returns {Promise<{ ok: true, cambio: boolean, anterior?: number|null, nuevo?: number|null }
 *                  | { ok: false, error: string }>}
 */
export async function cambiarSueltosPorUnidad(tx, { baseId, nuevo, unidadMedida } = {}) {
  const base = await tx.productoBase.findUnique({
    where: { id: baseId },
    select: { id: true, sueltos_por_unidad: true, unidad_medida: true, es_combo: true },
  });
  if (!base) return { ok: false, error: "Producto no encontrado" };

  const anterior = base.sueltos_por_unidad ?? null;
  if (anterior === nuevo) return { ok: true, cambio: false };
  if (nuevo !== null && (unidadMedida ?? base.unidad_medida) === "kg") return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.KG };
  if (nuevo !== null && base.es_combo === true) return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.COMBO };

  const pls = await tx.productoLocal.findMany({ where: { baseId }, select: { id: true, localId: true } });
  const plIds = pls.map((p) => p.id);
  const localIds = [...new Set(pls.map((p) => p.localId))];

  const enCamino = await tx.transferenciaDetalle.findMany({
    where: { productoId: { in: plIds }, transferencia: { estado: { in: [...ESTADOS_CON_TRANSITO] } } },
    select: { transferenciaId: true },
    distinct: ["transferenciaId"],
  });
  if (enCamino.length > 0) return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.transito(enCamino.length) };

  const controles = await tx.controlStock.findMany({
    where: { estado: "ABIERTO", localId: { in: localIds } },
    select: { local: { select: { nombre: true } } },
  });
  if (controles.length > 0) {
    const nombres = [...new Set(controles.map((c) => c.local?.nombre).filter(Boolean))].join(", ");
    return { ok: false, error: TEXTO_CAMBIO_DE_ESCALA.conteo(nombres || "una ubicación del producto") };
  }

  const stocks = await tx.stockLocal.findMany({
    where: { productoId: { in: plIds } },
    select: { id: true, cantidad: true, enTransito: true, stockMin: true, stockMax: true, local: { select: { nombre: true } } },
    orderBy: { id: "asc" },
  });
  const componentes = await tx.comboComponente.findMany({
    where: { componenteProductoLocalId: { in: plIds } },
    select: { id: true, cantidad: true, comboPL: { select: { local: { select: { nombre: true } } } } },
    orderBy: { id: "asc" },
  });

  const plan = planDeReinterpretacion({
    anterior,
    nuevo,
    stocks: stocks.map((s) => ({ ...s, local: s.local?.nombre })),
    componentes: componentes.map((c) => ({ ...c, local: c.comboPL?.local?.nombre })),
  });
  if (!plan.ok) return plan;

  // Los orígenes van ANTES de la primera escritura: los leen el trigger de la
  // ficha (la reinterpretación y la versión del Libro de Costos) y el de
  // `StockLocal` (cada movimiento).
  await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.CAMBIO_DE_ESCALA, referencia: baseId });
  await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.CAMBIO_DE_ESCALA, referencia: String(baseId) });
  await tx.productoBase.update({ where: { id: baseId }, data: { sueltos_por_unidad: nuevo } });
  for (const s of plan.stocks) await tx.stockLocal.update({ where: { id: s.id }, data: s.data });
  for (const c of plan.componentes) await tx.comboComponente.update({ where: { id: c.id }, data: { cantidad: c.cantidad } });

  return { ok: true, cambio: true, anterior, nuevo };
}
