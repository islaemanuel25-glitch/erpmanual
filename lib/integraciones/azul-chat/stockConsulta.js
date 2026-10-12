// lib/integraciones/azul-chat/stockConsulta.js
//
// LA CAPACIDAD `stock_consulta`: CUÁNTO HAY DE UN PRODUCTO EN UN LOCAL, Y QUÉ
// PRODUCTOS ESTÁN POR DEBAJO DEL MÍNIMO (Tanda 8A). Esta parte es PURA: valida
// el pedido y arma la respuesta con lo que ya leyó stockConsultaServer.js.
//
// ── NINGÚN NÚMERO NUEVO ────────────────────────────────────────────────────
//
// Cada dato sale de la pieza que ya usa una pantalla del ERP:
//   · qué productos coinciden con el texto y en qué orden ......................
//     `buscarCatalogoLocal` (lib/productos/), el buscador de productos del ERP:
//     código de barras exacto primero y después nombre igual, que empieza,
//     palabra que empieza y que contiene (`rankearLiteral`), los 10 primeros;
//   · la fila de stock de cada producto —cantidad, mínimo, si los límites están
//     ajustados y si está faltante— ...........................................
//     `mapStockItemLocal` / `mapStockItemDeposito` (lib/stock/mapItem.js), los
//     mismos que arman cada fila de la pantalla Stock Locales;
//   · cómo se lee la cantidad y en qué unidad ..................................
//     `presentacionCantidadStock`, `getUnidadLocal` y `getUnidadDeposito`
//     (lib/stock/presentacion.js), que dibujan la tabla y la tarjeta móvil: en un
//     local la existencia en unidades (o kg), que es como vende el POS del local;
//     en el depósito un pack o cajón en "N bultos + M uds";
//   · qué es "bajo mínimo" ......................................................
//     la condición de la card "Bajo mínimo · reponer" (`condicionesSql`,
//     lib/stock/estadosDeStock.js), la misma que cuenta la pantalla.
//
// Lo único propio es el ORDEN de "bajo mínimo": por mayor faltante relativo,
// `(mínimo − cantidad) / mínimo`. Ordena, no se devuelve como número.
//
// ── LO QUE NO DEVUELVE ─────────────────────────────────────────────────────
//
// Ni costos, ni precios, ni valorizaciones: `mapStockItem*` los calcula para la
// pantalla y acá se descartan, campo por campo.

import { presentacionCantidadStock, getUnidadLocal, getUnidadDeposito } from "@/lib/stock/presentacion";
import { FUZZY_TOP_RESULTS } from "@/lib/productos/buscarCatalogoLocal";

export const VERSION_CONTRATO = 1;

export const MODOS = Object.freeze(["producto", "bajo_minimo"]);

export const LARGO_MINIMO_TEXTO = 2;
export const LARGO_MAXIMO_TEXTO = 60;

/** Las coincidencias de una búsqueda: las que devuelve el buscador del ERP. */
export const MAX_COINCIDENCIAS = FUZZY_TOP_RESULTS;

/** Los productos bajo mínimo que se listan; el total se informa aparte. */
export const MAX_BAJO_MINIMO = 50;

const rechazo = (codigo, error, status = 400) => ({ ok: false, status, codigo, error });

/**
 * Valida los parámetros. La puerta ya rechazó las claves que no son `modo` ni
 * `texto`; acá se valida su forma.
 *
 * @param {{modo?:unknown, texto?:unknown}} parametros
 */
export function resolverPedido(parametros) {
  const modo = parametros?.modo;
  if (!MODOS.includes(modo)) {
    return rechazo("PEDIDO_INVALIDO", "El modo tiene que ser producto o bajo_minimo.");
  }
  if (modo === "bajo_minimo") {
    if (parametros.texto !== undefined) {
      return rechazo("PEDIDO_INVALIDO", "bajo_minimo no lleva texto.");
    }
    return { ok: true, modo, texto: null };
  }
  const texto = typeof parametros.texto === "string" ? parametros.texto.trim() : null;
  if (texto === null || texto.length < LARGO_MINIMO_TEXTO || texto.length > LARGO_MAXIMO_TEXTO) {
    return rechazo(
      "PEDIDO_INVALIDO",
      `El texto tiene que tener entre ${LARGO_MINIMO_TEXTO} y ${LARGO_MAXIMO_TEXTO} caracteres.`
    );
  }
  return { ok: true, modo, texto };
}

/** Un decimal de la base como texto con la escala de su columna; null queda null. */
const decimal = (v, escala) => (v == null ? null : Number(v).toFixed(escala));

/**
 * Un producto como lo dice esta capacidad.
 *
 * @param {object} item el ítem de `mapStockItemLocal`/`mapStockItemDeposito`
 * @param {{cantidad:unknown, stockMin:unknown}|undefined} fila la fila CRUDA de
 *   `StockLocal` (para la cantidad y el mínimo con la escala de su columna, sin
 *   pasar por `Number`); sin fila, la existencia es cero como en la pantalla
 * @param {boolean} esDeposito
 */
export function productoDeStock(item, fila, esDeposito) {
  const conMinimo = item.limitesConfigurados === true && item.stockMin !== null;
  return {
    productoId: item.id,
    nombre: item.nombre,
    codigo: item.codigoBarra || null,
    // `StockLocal.cantidad` es Decimal(12,3) y `stockMin` Decimal(12,2).
    cantidad: decimal(fila?.cantidad ?? 0, 3),
    unidad: esDeposito ? getUnidadDeposito(item) : getUnidadLocal(item),
    equivalencia: presentacionCantidadStock(item, esDeposito).texto,
    stockMinimo: conMinimo ? decimal(fila?.stockMin, 2) : null,
    bajoMinimo: conMinimo ? item.faltante === true : null,
  };
}

/**
 * El orden de "bajo mínimo": mayor faltante relativo primero. Un mínimo en cero
 * o negativo con existencia por debajo —un negativo— va antes que cualquier
 * proporción. Empate: por nombre, como el listado; después por id.
 */
export function compararBajoMinimo(a, b) {
  const relativo = (x) => {
    const min = Number(x.stockMin);
    const cant = Number(x.stock);
    return min > 0 ? (min - cant) / min : Number.POSITIVE_INFINITY;
  };
  const ra = relativo(a);
  const rb = relativo(b);
  if (ra !== rb) return rb > ra ? 1 : -1;
  const n = String(a.nombre).localeCompare(String(b.nombre), "es");
  return n !== 0 ? n : a.id - b.id;
}

/**
 * La respuesta.
 *
 * @param {{local:{id:number,nombre:string,es_deposito:boolean}, grupoId:number,
 *          pedido:{modo:string,texto:string|null}, productos:Array, total:number,
 *          hayMas:boolean}} args
 */
export function armarStockConsulta({ local, grupoId, pedido, productos, total, hayMas }) {
  return {
    capacidad: "stock_consulta",
    version: VERSION_CONTRATO,
    local: { id: local.id, nombre: local.nombre, esDeposito: local.es_deposito === true },
    grupoId,
    modo: pedido.modo,
    texto: pedido.texto,
    productos,
    ...(pedido.modo === "bajo_minimo" ? { total } : {}),
    hayMas,
  };
}
