// lib/pedidos/preparacionDelPedido.js
//
// LO QUE LA PANTALLA DE PREPARAR UN PEDIDO DICE DE CADA LÍNEA, Y CÓMO FILTRA.
//
// Para el depósito en el celular (2026-10-22), con la misma mecánica que la
// recepción de una transferencia: una línea está PENDIENTE hasta que el
// depósito la decide; decidida, va COMPLETA (exactamente lo pedido) o CON
// CAMBIOS (otra cantidad, 0, o un producto que el local no pidió).
//
// Qué está decidido y cuánto viaja NO se decide acá: es
// `lib/pedidos/revisionDeLinea.js`, el mismo criterio que leen `enviar` y
// `solicitados`. Esto solo lo pone en palabras y lo cuenta.
//
// Puro: lo leen la pantalla y los candados.

import { estaRevisada, loPedido } from "./revisionDeLinea.js";
import { PRESENTACION, presentacionDeProducto, agrupa } from "@/lib/productos/presentacionDeProducto";
import { fmtCantidadDeEnvio, rotuloConSueltasCorto } from "@/lib/transferencias/presentacionEnvio";

export const ESTADO_PREPARACION = Object.freeze({
  PENDIENTE: "pendiente",
  COMPLETO: "completo",
  CON_CAMBIOS: "conCambios",
});

export const FILTRO_PREPARAR = Object.freeze({
  PENDIENTES: "pendientes",
  CON_CAMBIOS: "conCambios",
  PREPARADOS: "preparados",
  TODOS: "todos",
});

export const TEXTOS_FILTRO_PREPARAR = Object.freeze([
  [FILTRO_PREPARAR.PENDIENTES, "Pendientes"],
  [FILTRO_PREPARAR.CON_CAMBIOS, "Con cambios"],
  [FILTRO_PREPARAR.PREPARADOS, "Preparados"],
  [FILTRO_PREPARAR.TODOS, "Todos"],
]);

/** Una cantidad en unidades sueltas: un bulto son `factorPack` unidades. */
export function enUnidades(cantidad, unidad, factorPack) {
  const n = Number(cantidad || 0);
  return unidad === "BULTO" ? n * Math.max(1, Number(factorPack || 1)) : n;
}

/** El local no lo pidió: lo agregó el depósito. */
export const esAgregada = (l) => Number(l?.sugerido || 0) === 0;

// ── LOS PRODUCTOS POR PESO (2026-10-28) ──────────────────────────────────
//
// Regla de Emanuel: el local pide un producto por peso en kilos o en unidades;
// el depósito SIEMPRE lo carga en kilos, pesándolo. Lo preparado de esas líneas
// son kilos (`UNIDAD` de un producto en kg), y así viajan y mueven stock.

/** El depósito lo carga en kilos: `elDepositoCuentaPorKilo`, que lo dice la ruta. */
export const sePesa = (l) => l?.seCargaEnKilos === true;

/**
 * Lo pidió EN UNIDADES. La línea no guarda en qué lo pidió el local: su
 * pantalla le pone "UNIDAD" a todo y solo deja números enteros. Lo que sí está
 * es el producto: uno que se compra por pieza con su peso de referencia
 * (`esFiambre`, `esProductoFiambre`) se pide contando piezas —"2 salametros"—;
 * uno a granel, sin pieza, solo se puede pedir en kilos.
 */
export const pidioEnUnidades = (l) => sePesa(l) && l?.esFiambre === true && !esAgregada(l);

const unidadesPedidas = (l) => enUnidades(l.sugerido, l.unidadSugerida, l.factorPack);
const unidadesPreparadas = (l) => enUnidades(l.preparado, l.unidadPreparada || l.unidadSugerida, l.factorPack);

export function estadoDePreparacion(l) {
  if (!estaRevisada(l)) return ESTADO_PREPARACION.PENDIENTE;
  if (esAgregada(l)) return ESTADO_PREPARACION.CON_CAMBIOS;
  // Pedido en unidades y pesado: los kilos no se comparan con las unidades, y
  // cargar el peso no es un cambio. Mandar 0 sí.
  if (pidioEnUnidades(l)) return Number(l.preparado || 0) > 0 ? ESTADO_PREPARACION.COMPLETO : ESTADO_PREPARACION.CON_CAMBIOS;
  return unidadesPreparadas(l) === unidadesPedidas(l) ? ESTADO_PREPARACION.COMPLETO : ESTADO_PREPARACION.CON_CAMBIOS;
}

export function pasaFiltroPreparar(l, filtro) {
  const e = estadoDePreparacion(l);
  switch (filtro) {
    case FILTRO_PREPARAR.PENDIENTES:
      return e === ESTADO_PREPARACION.PENDIENTE;
    case FILTRO_PREPARAR.CON_CAMBIOS:
      return e === ESTADO_PREPARACION.CON_CAMBIOS;
    // "Preparados" son todas las decididas, con cambios o sin: es el "N" de
    // "N de M preparados" de arriba y de la barra.
    case FILTRO_PREPARAR.PREPARADOS:
      return e !== ESTADO_PREPARACION.PENDIENTE;
    default:
      return true;
  }
}

/** Cuántas hay de cada filtro. `preparados` es también el avance. */
export function conteoDePreparacion(lineas) {
  const ls = lineas || [];
  const de = (f) => ls.filter((l) => pasaFiltroPreparar(l, f)).length;
  return {
    [FILTRO_PREPARAR.PENDIENTES]: de(FILTRO_PREPARAR.PENDIENTES),
    [FILTRO_PREPARAR.CON_CAMBIOS]: de(FILTRO_PREPARAR.CON_CAMBIOS),
    [FILTRO_PREPARAR.PREPARADOS]: de(FILTRO_PREPARAR.PREPARADOS),
    [FILTRO_PREPARAR.TODOS]: ls.length,
  };
}

/**
 * Lo que pidió el local en su PRESENTACIÓN COMERCIAL, como la recepción dice lo
 * enviado: "2 PACK x24", "3 UNIDAD", "1,500 KG" (2026-10-23).
 *
 * Ninguna de las dos mitades se escribe acá:
 *   · en qué se cuenta el producto lo dice `presentacionDeProducto`, con la
 *     unidad en que el local pidió como `contadoEn` —es lo mismo que hace
 *     `enviar` para congelar en qué salió cada línea (`snapshotDeEnvioManual`)—;
 *   · el texto lo arma `rotuloConSueltasCorto`, la función que arma "2 PACK x10"
 *     en la tarjeta de la recepción.
 */
export function rotuloDeLoPedido(l) {
  // Un producto por peso pedido en unidades: "2 u", no "2,000 KG".
  if (pidioEnUnidades(l)) return `${fmtCantidadDeEnvio(l.sugerido, PRESENTACION.UNIDAD)} u`;
  const p = presentacionDeProducto({
    unidadMedida: l?.unidadMedida,
    factorPack: l?.factorPack,
    modoVentaDeposito: l?.modoVentaDeposito,
    pesoReferenciaKg: l?.pesoReferenciaKg,
    contadoEn: l?.unidadSugerida,
  });
  return rotuloConSueltasCorto({
    presentacion: p.presentacion,
    cantidad: Number(l?.sugerido || 0),
    sueltas: 0,
    factor: agrupa(p.presentacion) ? p.factor : null,
    pesoPiezaKg: p.pesoPiezaKg,
  });
}

/**
 * "Pidió 2 PACK x6": el de la hoja de corregir. Decía "Pidió 2 BULTO de 6 u"
 * mientras la tarjeta decía "2 PACK x6"; desde el 2026-10-23 es el mismo texto
 * de la tarjeta (`rotuloDeLoPedido`), así las dos dicen lo mismo.
 */
export function textoPidio(l) {
  return `Pidió ${rotuloDeLoPedido(l)}`;
}

/**
 * Las cantidades de una línea en la escala en que se dicen: en bultos si el
 * local pidió bultos y todo cae en bultos enteros; si no, en unidades, con
 * " u" cuando lo pedido era en bultos (para que no se lean como bultos).
 */
function escalaDeTexto(l, valores) {
  // Lo que se pesa se dice en kilos, con los tres decimales de la balanza.
  if (sePesa(l)) return valores.map((v) => `${fmtCantidadDeEnvio(v, PRESENTACION.KG)} KG`);
  const p = loPedido(l);
  if (p.unidad !== "BULTO") return valores.map((v) => String(v));
  if (valores.every((v) => v % p.factorPack === 0)) return valores.map((v) => String(v / p.factorPack));
  return valores.map((v) => `${v} u`);
}

/** Lo que va de una línea decidida, en su escala: "va 2". */
export function textoVa(l) {
  const [va] = escalaDeTexto(l, [unidadesPreparadas(l)]);
  return `va ${va}`;
}

/**
 * "No hay" (2026-10-28): lo pedido no está. Es lo mismo que decidir la línea en
 * 0 —`preparado: 0` en `detalle/editar`, revisada y sin viajar—, así que una
 * corregida a 0 también lo dice: es un solo hecho.
 */
export const TEXTO_NO_HAY = "No hay";

/**
 * La línea de acento de una línea con cambios: "Va 1 de 3 · faltan 2",
 * "No hay", "Agregado · va 1". `null` si no tiene cambios.
 */
export function textoDelCambio(l) {
  if (estadoDePreparacion(l) !== ESTADO_PREPARACION.CON_CAMBIOS) return null;
  if (esAgregada(l)) {
    const [va] = escalaDeTexto(l, [unidadesPreparadas(l)]);
    return `Agregado · va ${va}`;
  }
  const va = unidadesPreparadas(l);
  if (va === 0) return TEXTO_NO_HAY;
  const pedido = unidadesPedidas(l);
  const diferencia = Math.abs(pedido - va);
  const [tVa, tPedido, tDif] = escalaDeTexto(l, [va, pedido, diferencia]);
  return `Va ${tVa} de ${tPedido} · ${va < pedido ? "falta" : "sobra"} ${tDif}`;
}

/** Normaliza para buscar: sin mayúsculas ni tildes. */
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** La categoría de una línea, como la lista la agrupa. */
export const categoriaDe = (l) => (l?.categoriaNombre ? String(l.categoriaNombre).trim() : "Sin categoría");

/** Las categorías de las líneas, con cuántas tiene cada una, por nombre. */
export function categoriasDePreparacion(lineas) {
  const cuenta = new Map();
  for (const l of lineas || []) cuenta.set(categoriaDe(l), (cuenta.get(categoriaDe(l)) || 0) + 1);
  return [...cuenta.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** La línea cuyo código de barras es EXACTAMENTE este texto, o `null`. */
export function lineaPorCodigo(lineas, texto) {
  const t = String(texto || "").trim();
  if (!t) return null;
  return (lineas || []).find((l) => String(l.codigoBarra || "") === t) ?? null;
}

/**
 * Lo que se ve: el filtro de estado, la categoría y el texto (nombre o
 * código). Un CÓDIGO exacto —el lector lo escribe entero— deja solo ese
 * producto, esté en el estado que esté: escanear algo ya preparado y no verlo
 * porque el filtro dice "Pendientes" sería decir que no está.
 */
export function lineasVisibles(lineas, { filtro, categoria = null, texto = "" }) {
  const exacta = lineaPorCodigo(lineas, texto);
  if (exacta) return [exacta];
  const t = norm(texto);
  return (lineas || []).filter(
    (l) =>
      pasaFiltroPreparar(l, filtro) &&
      (categoria == null || categoriaDe(l) === categoria) &&
      (!t || norm(l.productoNombre).includes(t) || String(l.codigoBarra || "").includes(t))
  );
}
