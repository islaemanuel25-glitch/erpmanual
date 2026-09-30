// lib/stock/libro/explicacionDelValor.js
//
// ¿POR QUÉ CAMBIÓ EL VALOR DEL STOCK? El "movimiento físico" del Valor del Stock,
// partido por el ORIGEN REAL de cada movimiento del Libro de Stock. Puro: no
// conoce Prisma. La consulta agrupada vive en `valorDelStockServer.js`.
//
// ── NO SE ADIVINA NADA ───────────────────────────────────────────────────
//
// El origen lo declaró la operación que escribió `StockLocal`, dentro de su
// transacción (`declararOrigenDeStock`). Acá solo se traduce a una categoría
// que se entiende. La DIRECCIÓN no sale del origen sino del delta físico de cada
// movimiento: un ajuste, una recepción de transferencia en el origen o una
// corrección de venta pueden sumar o restar. `SIN_ORIGEN` no se reclasifica:
// va a "Sin clasificar" con su cantidad y su efecto, y así se sabe cuánto de
// la explicación es confiable.
//
// ── LA MISMA PLATA QUE EL MOVIMIENTO FÍSICO, AL CENTAVO ──────────────────
//
// El movimiento físico de una cadena en un día es
//
//   round(cierre × C) − round(apertura × C)
//
// con C el costo congelado del día (`valorizarCadena`). Los movimientos de ese
// día llegan agrupados por (origen, dirección) con su delta físico exacto en
// milésimas —la suma de los deltas es cierre − apertura, porque el libro es una
// cadena continua—. Cada grupo vale delta × C, y el redondeo se reparte así:
// cada grupo se redondea al centavo y la diferencia con el movimiento físico
// del día (a lo sumo unos centavos) se le asigna al grupo de mayor valor
// absoluto. Así la suma de las categorías es EXACTAMENTE el movimiento físico,
// por construcción, sin un segundo cálculo de costos. Si alguna vez la
// diferencia no fuera de centavos, la cadena no es continua y se informa.
//
// ── NO ES PLATA QUE ENTRÓ O SALIÓ ────────────────────────────────────────
//
// Una compra recibida aumenta el capital en mercadería aunque no se haya
// pagado. Esto explica el cambio del CAPITAL EN MERCADERÍA, no un flujo de
// dinero: los rótulos no dicen "gastado" ni "cobrado".

import { ORIGEN_STOCK, ORIGEN_ACTIVACION, SIN_ORIGEN } from "./libroStock.js";

export const DIRECCION = Object.freeze({ ENTRADA: "ENTRADA", SALIDA: "SALIDA" });

/** Las categorías que se muestran, en el orden en que se muestran. */
export const CATEGORIA = Object.freeze({
  COMPRAS: "COMPRAS",
  VENTAS: "VENTAS",
  TRANSFERENCIAS: "TRANSFERENCIAS",
  AJUSTES: "AJUSTES",
  ALTAS_Y_BAJAS: "ALTAS_Y_BAJAS",
  OTROS: "OTROS",
  SIN_CLASIFICAR: "SIN_CLASIFICAR",
});

export const ORDEN_DE_CATEGORIAS = Object.freeze([
  CATEGORIA.COMPRAS,
  CATEGORIA.VENTAS,
  CATEGORIA.TRANSFERENCIAS,
  CATEGORIA.AJUSTES,
  CATEGORIA.ALTAS_Y_BAJAS,
  CATEGORIA.OTROS,
  CATEGORIA.SIN_CLASIFICAR,
]);

/** Cómo se lee cada categoría, y cómo se leen sus dos direcciones. */
export const TEXTOS_DE_CATEGORIA = Object.freeze({
  [CATEGORIA.COMPRAS]: { rotulo: "Compras a proveedor", entradas: "recibidas", salidas: "salidas" },
  [CATEGORIA.VENTAS]: { rotulo: "Ventas", entradas: "devueltas por anulación o corrección", salidas: "vendidas" },
  [CATEGORIA.TRANSFERENCIAS]: { rotulo: "Transferencias", entradas: "recibidas o devueltas", salidas: "enviadas" },
  [CATEGORIA.AJUSTES]: { rotulo: "Ajustes de stock", entradas: "positivos", salidas: "negativos" },
  [CATEGORIA.ALTAS_Y_BAJAS]: { rotulo: "Altas, importaciones y bajas", entradas: "incorporadas", salidas: "retiradas" },
  [CATEGORIA.OTROS]: { rotulo: "Otros", entradas: "entradas", salidas: "salidas" },
  [CATEGORIA.SIN_CLASIFICAR]: { rotulo: "Sin clasificar", entradas: "entradas", salidas: "salidas" },
});

/**
 * ORIGEN → CATEGORÍA. Cada valor de `ORIGEN_STOCK` tiene que estar: un candado
 * se pone rojo si aparece uno nuevo sin clasificar acá. La dirección NO está en
 * esta tabla: sale del delta de cada movimiento.
 *
 *   COMPRA_PROVEEDOR           la recepción de un pedido (`recibir/[id]`).
 *   VENTA / CORRECCION_VENTA / ANULACION_VENTA   el POS; la anulación y la
 *                              corrección pueden devolver stock.
 *   TRANSFERENCIA_ENVIO / _RECEPCION / _CANCELACION   el envío descuenta el
 *                              origen; la recepción suma al destino y en el origen
 *                              devuelve —o descuenta— la diferencia; la
 *                              cancelación devuelve. El tránsito NO es stock
 *                              disponible: un movimiento que solo cambia
 *                              `enTransito` tiene delta físico cero y no entra.
 *   AJUSTE_MANUAL              sumar, restar o fijar desde Stock Locales.
 *   LIMITES_STOCK, ALTA_*, IMPORTACION_*, PROMOCION_A_DEPOSITO,
 *   HERENCIA_DEL_DEPOSITO, ELIMINACION_PRODUCTO   filas que nacen o mueren;
 *                              entran solo si cambian cantidad.
 *   RESET_OPERATIVO, ACTIVACION_DEL_LIBRO   otros.
 */
export const CATEGORIA_DEL_ORIGEN = Object.freeze({
  [ORIGEN_STOCK.COMPRA_PROVEEDOR]: CATEGORIA.COMPRAS,
  [ORIGEN_STOCK.VENTA]: CATEGORIA.VENTAS,
  [ORIGEN_STOCK.CORRECCION_VENTA]: CATEGORIA.VENTAS,
  [ORIGEN_STOCK.ANULACION_VENTA]: CATEGORIA.VENTAS,
  [ORIGEN_STOCK.TRANSFERENCIA_ENVIO]: CATEGORIA.TRANSFERENCIAS,
  [ORIGEN_STOCK.TRANSFERENCIA_RECEPCION]: CATEGORIA.TRANSFERENCIAS,
  [ORIGEN_STOCK.TRANSFERENCIA_CANCELACION]: CATEGORIA.TRANSFERENCIAS,
  [ORIGEN_STOCK.AJUSTE_MANUAL]: CATEGORIA.AJUSTES,
  [ORIGEN_STOCK.LIMITES_STOCK]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.ALTA_PRODUCTO]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.ALTA_PRODUCTO_DESDE_STOCK]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.ALTA_AL_LISTAR_STOCK]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.IMPORTACION_PRODUCTOS]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.IMPORTACION_STOCK]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.PROMOCION_A_DEPOSITO]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.HERENCIA_DEL_DEPOSITO]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.ELIMINACION_PRODUCTO]: CATEGORIA.ALTAS_Y_BAJAS,
  [ORIGEN_STOCK.RESET_OPERATIVO]: CATEGORIA.OTROS,
  [ORIGEN_ACTIVACION]: CATEGORIA.OTROS,
  [SIN_ORIGEN]: CATEGORIA.SIN_CLASIFICAR,
});

/**
 * La categoría de un origen. Un texto que no está en la tabla —un origen que
 * alguien escribió sin agregarlo acá— va a OTROS con su nombre visible en el
 * detalle, no a "Sin clasificar": sí tiene origen, lo que falta es la etiqueta.
 */
export const categoriaDelOrigen = (origen) => CATEGORIA_DEL_ORIGEN[origen] ?? CATEGORIA.OTROS;

/** Los orígenes de una categoría, para pedir su detalle. */
export function origenesDeLaCategoria(categoria) {
  return Object.entries(CATEGORIA_DEL_ORIGEN)
    .filter(([, c]) => c === categoria)
    .map(([o]) => o);
}

const redondear = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));

/**
 * EL MOVIMIENTO FÍSICO DE UNA CADENA EN UN DÍA, REPARTIDO POR GRUPO.
 *
 * @param {Array<{origen, direccion, delta:number, movimientos:number}>} grupos
 *   delta en milésimas, con signo.
 * @param {number} costo    el costo congelado del día (por unidad física).
 * @param {number} objetivo el movimiento físico del día en centavos.
 * @returns {{ partes: Array<{origen, direccion, centavos, movimientos}>, desvio: number }}
 *   `desvio` es lo que hubo que ajustar por redondeo: con una cadena continua
 *   es de centavos. La suma de `partes` es SIEMPRE `objetivo`.
 */
export function repartirMovimientoFisico(grupos, costo, objetivo) {
  const partes = grupos.map((g) => {
    const exacto = (g.delta * costo) / 10;
    return { origen: g.origen, direccion: g.direccion, movimientos: g.movimientos, exacto, centavos: redondear(exacto) };
  });
  const suma = partes.reduce((s, p) => s + p.centavos, 0);
  const desvio = objetivo - suma;
  if (desvio !== 0) {
    if (partes.length === 0) {
      // Cambió la cantidad sin ningún movimiento registrado ese día: no debería
      // pasar con el libro continuo. No se inventa un origen: va sin clasificar.
      partes.push({ origen: SIN_ORIGEN, direccion: objetivo > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA, movimientos: 0, exacto: 0, centavos: objetivo });
    } else {
      let mayor = partes[0];
      for (const p of partes) if (Math.abs(p.exacto) > Math.abs(mayor.exacto)) mayor = p;
      mayor.centavos += desvio;
    }
  }
  return { partes: partes.map(({ exacto, ...p }) => p), desvio };
}

/** Acumula partes en un mapa `origen|direccion` → { centavos, movimientos }. */
export function acumularPartes(mapa, partes) {
  for (const p of partes) {
    const k = `${p.origen}|${p.direccion}`;
    const a = mapa.get(k) ?? { origen: p.origen, direccion: p.direccion, centavos: 0, movimientos: 0 };
    a.centavos += p.centavos;
    a.movimientos += p.movimientos;
    mapa.set(k, a);
  }
  return mapa;
}

/**
 * LA EXPLICACIÓN DEL LOCAL: las partes de todas las cadenas COMPLETAS,
 * agrupadas por categoría. Las cadenas sin costo no están en el movimiento
 * físico del total, así que tampoco acá: la identidad es contra el mismo total.
 *
 * @param {Array<Map>} porCadena  el `porOrigen` de cada cadena completa.
 * @param {number} fisico         el movimiento físico del total, en centavos.
 */
export function explicacionDelMovimientoFisico(porCadena, fisico) {
  const porOrigen = new Map();
  for (const m of porCadena) acumularPartes(porOrigen, [...m.values()]);
  const categorias = new Map(ORDEN_DE_CATEGORIAS.map((c) => [c, { categoria: c, entradas: 0, salidas: 0, neto: 0, movimientosDeEntrada: 0, movimientosDeSalida: 0, origenes: new Set() }]));
  for (const p of porOrigen.values()) {
    const c = categorias.get(categoriaDelOrigen(p.origen));
    c.origenes.add(p.origen);
    if (p.direccion === DIRECCION.ENTRADA) {
      c.entradas += p.centavos;
      c.movimientosDeEntrada += p.movimientos;
    } else {
      c.salidas += p.centavos;
      c.movimientosDeSalida += p.movimientos;
    }
    c.neto += p.centavos;
  }
  const lista = [...categorias.values()].map((c) => ({ ...c, origenes: [...c.origenes].sort(), movimientos: c.movimientosDeEntrada + c.movimientosDeSalida }));
  const suma = lista.reduce((s, c) => s + c.neto, 0);
  const sin = categorias.get(CATEGORIA.SIN_CLASIFICAR);
  return {
    categorias: lista,
    total: suma,
    // La identidad, verificada y no supuesta.
    cuadra: suma === fisico,
    sinClasificar: { movimientos: sin.movimientosDeEntrada + sin.movimientosDeSalida, efecto: sin.neto },
  };
}
