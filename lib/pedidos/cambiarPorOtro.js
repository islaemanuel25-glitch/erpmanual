// lib/pedidos/cambiarPorOtro.js
//
// "CAMBIAR POR OTRO" EN PREPARAR PEDIDO (2026-11-03), LO QUE DECIDE LA HOJA.
//
// El local pidió un producto con muchas variantes (Poett Verde), el depósito no
// lo tiene pero tiene otro (Poett Rosa). En la hoja se escanea —o se escribe—
// el que va, y esto decide qué se leyó y qué se manda a `detalle/editar`:
//
//   · OTRO producto del catálogo del depósito: "Va este", con la cantidad que
//     va —por defecto la pedida, en la unidad del producto que va— y
//     `reemplazoProductoId`;
//   · el MISMO que pidieron: es "Va completo", sin marca de reemplazo;
//   · un código que no está en ningún producto: se avisa y no se sigue. Nunca
//     se vincula el código a nada;
//   · un texto escrito que no es un código exacto y encontró productos: la
//     lista, para elegir.
//
// Qué código tiene un producto es `coincideCodigo` (el de unidad, el de caja y
// el propio), con la misma regla de ceros del GTIN que el escáner del POS.
//
// Puro: lo leen la hoja (`components/pos-transferencias/HojaCambiarPorOtro.jsx`)
// y los candados.

import { coincideCodigo } from "@/lib/pos-ventas/lecturaEscaner";
import { elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { loPedido } from "./revisionDeLinea.js";
import { enUnidades, pidioEnUnidades, sePesa } from "./preparacionDelPedido.js";
import { numeroEscrito, textoDeKilos } from "./preparacionEscritorio.js";

export { TEXTO_REEMPLAZO } from "./preparacionDelPedido.js";

export const LEIDO = Object.freeze({
  OTRO: "otro",
  MISMO: "mismo",
  DESCONOCIDO: "desconocido",
  VARIOS: "varios",
});

export const TITULO_CAMBIAR = "Cambiar por otro";
export const TEXTO_CAMBIAR = "Cambiar";
export const TEXTO_DESHACER_CAMBIO = "Deshacer cambio";
export const PLACEHOLDER_CAMBIAR = "Escaneá el que vas a mandar";
export const TEXTO_CODIGO_DESCONOCIDO = "Este código no está cargado en ningún producto";
export const TEXTO_ES_EL_MISMO = "✓ Es el mismo que pidieron";
export const TEXTO_MANDAR_ESTE = "Mandar este en lugar del pedido";
export const TEXTO_CANTIDAD_QUE_VA = "Cantidad que va";

/** "Va este: Poett Rosa". */
export const textoVaEste = (p) => `Va este: ${p?.nombre ?? ""}`;

/** "Pidió: Poett Verde · 2 PACK x6", arriba de la hoja y en el renglón cambiado. */
export const textoPidioProducto = (nombre, cantidad) => (cantidad ? `Pidió: ${nombre} · ${cantidad}` : `Pidió: ${nombre}`);

/** El producto, como lo manda `buscarProductos`, se guarda por kilo en el depósito. */
export function vaPorKilo(p) {
  return elDepositoCuentaPorKilo({
    unidad_medida: p?.unidadMedida,
    modoCompraProveedor: p?.modoCompraProveedor,
    pesoReferenciaKg: p?.pesoReferenciaKg,
    modoVentaDeposito: p?.modoVentaDeposito,
    pesoEsFijo: p?.pesoEsFijo,
  });
}

/** Lo que se eligió de la lista, o lo que se leyó: el mismo producto, u otro. */
export function loElegido(linea, p) {
  return p?.baseId === linea?.baseId ? { tipo: LEIDO.MISMO } : { tipo: LEIDO.OTRO, producto: p };
}

/**
 * Qué se leyó, con lo que contestó `buscarProductos` para ese texto en el
 * catálogo del depósito que prepara.
 */
export function queEsLoLeido(linea, items, texto) {
  const t = String(texto ?? "").trim();
  const lista = items || [];
  const exacto = lista.find((p) => coincideCodigo(p, t, { gtin: true }));
  if (exacto) return loElegido(linea, exacto);
  // Escrito a mano, por nombre: los que encontró, para elegir. Un número que no
  // es el código de nada es un código desconocido, aunque se parezca a otros.
  if (lista.length > 0 && !/^\d+$/.test(t)) return { tipo: LEIDO.VARIOS, items: lista };
  return { tipo: LEIDO.DESCONOCIDO };
}

/**
 * Con qué arranca "Cantidad que va", y en qué unidad: la pedida, en la unidad
 * del producto que va. Pedido en bultos y el que va viene de a más de uno: los
 * mismos bultos. Si no, en unidades sueltas —lo pedido llevado a unidades—.
 * Un producto que solo sale por bulto lo rechaza `enviar` nombrándolo, como
 * cualquier renglón: `buscarProductos` no manda el modo de envío.
 * Por kilo: los kilos pedidos si se pidieron kilos; si no, vacío, hay que pesar.
 *
 * @returns {{ porKilo: boolean, unidad: "BULTO"|"UNIDAD", factorPack: number, valor: string }}
 */
export function cantidadInicial(linea, p) {
  const factorPack = Math.max(1, Number(p?.factorPack || 1));
  if (vaPorKilo(p)) {
    const enKilos = sePesa(linea) && !pidioEnUnidades(linea);
    return { porKilo: true, unidad: "UNIDAD", factorPack: 1, valor: enKilos ? textoDeKilos(linea.sugerido) : "" };
  }
  const pedido = loPedido(linea);
  if (pedido.unidad === "BULTO" && factorPack > 1) {
    return { porKilo: false, unidad: "BULTO", factorPack, valor: String(pedido.cantidad) };
  }
  return { porKilo: false, unidad: "UNIDAD", factorPack, valor: String(enUnidades(pedido.cantidad, pedido.unidad, pedido.factorPack)) };
}

/** El rótulo del campo, en la escala en que se escribe. */
export function rotuloDeLaCantidad(inicial) {
  if (inicial.porKilo) return "Kilos";
  return inicial.unidad === "BULTO" ? `Bultos de ${inicial.factorPack} u` : "Unidades";
}

/**
 * Lo que manda "Mandar este en lugar del pedido" a `detalle/editar`, o `null`
 * si lo escrito no es una cantidad mayor que 0.
 */
export function cuerpoDelCambio(p, inicial, texto) {
  const n = numeroEscrito(texto, { decimales: inicial.porKilo });
  if (n == null || n <= 0) return null;
  return { preparado: n, unidadPreparada: inicial.unidad, reemplazoProductoId: p.productoLocalId };
}
