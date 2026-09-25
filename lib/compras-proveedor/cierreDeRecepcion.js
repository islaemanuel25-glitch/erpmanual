// QUÉ HAY QUE DECIR ANTES DE CERRAR UNA RECEPCIÓN.
//
// ── EL DEFECTO QUE LO TRAJO, MEDIDO ───────────────────────────────────────
//
// El pedido 232 se cerró con 24 líneas y las 24 entraron al stock con la
// cantidad PEDIDA. Nueve de ellas no las trajo ningún comprobante —nadie las
// vio, no hay papel que las respalde— y metieron 620 unidades valorizadas en
// $1.263.705,60. El sistema no preguntó: asumió que había llegado todo.
//
// Eso inventa mercadería, y el error no se ve nunca: el stock queda más alto de
// lo que entró, y la diferencia recién aparece cuando alguien cuenta el
// depósito.
//
// ── LA REGLA ──────────────────────────────────────────────────────────────
//
// Una línea que ningún comprobante trajo puede haber llegado sin papel o no
// haber llegado. Son dos cosas distintas y NO se pueden deducir: hay que
// preguntarlas. Lo que no llegó no entra al stock.
//
// Y lo que queda a medias —renglones sin mirar, precios sin contestar, líneas
// sin vincular— se DICE antes de cerrar. Que se pueda cerrar igual es decisión
// de Emanuel; que se cierre sin que la pantalla lo haya dicho, no.
//
// ── POR QUÉ EL AVISO CUENTA Y NO BLOQUEA ──────────────────────────────────
//
// Un bloqueo sobre "faltan 3 precios por contestar" no hace que alguien los
// conteste: hace que alguien invente una respuesta para poder cerrar, y esa
// respuesta escribe un costo. El aviso que cuenta deja la decisión donde está
// la información —la persona que tiene el papel en la mano— y deja registrado
// que se dijo.
//
// La excepción son las líneas sin comprobante, y por eso ésas SÍ piden una
// respuesta por línea: ahí no hay nada que interpretar mal, la pregunta es
// "¿llegó o no llegó?" y la respuesta por omisión es la segura —no llegó—,
// porque meter al stock algo que nadie vio es el daño que esta tanda arregla.
//
// Módulo puro: sin React y sin Prisma.

import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  estadoDeLinea,
  hayQueDecidirElPrecio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
// Un solo criterio de "cuántos productos hay acá", compartido con la pantalla
// del pedido recibido y con la cuenta de la ganancia.
import { cuantosProductos } from "@/lib/compras-proveedor/loQueEntro";
// La MISMA regla que usa la hoja de Corregir para decir "Ya decidido": una
// decisión vale para una fila solo si sus dos precios son los de esa fila.
import { DECISION_DE_PRECIO, decisionVigente } from "@/lib/compras-proveedor/decisionDePrecio";

/** Lo que una línea sin comprobante puede haber hecho. */
export const LLEGADA = Object.freeze({
  /** Llegó sin papel: entra con lo pedido, que es lo único que se sabe. */
  LLEGO: "LLEGO",
  /** No llegó: no entra al stock. Es la respuesta por omisión. */
  NO_LLEGO: "NO_LLEGO",
});

const esNumero = (v) => {
  if (v === null || v === undefined || v === "") return false;
  return Number.isFinite(Number(v));
};

/**
 * EL RESUMEN QUE LA PANTALLA TIENE QUE DECIR ANTES DE CERRAR.
 *
 * @param filas           las del comprobante, como las arma `filasDeConciliacion`
 * @param sinComprobante  las líneas del pedido que ningún comprobante trajo
 * @param llegadas        `{ [pedidoDetalleId]: LLEGADA }` lo contestado hasta ahora
 */
export function resumenDelCierre({ filas = [], sinComprobante = [], llegadas = {} } = {}) {
  const lista = Array.isArray(filas) ? filas : [];
  const huerfanas = Array.isArray(sinComprobante) ? sinComprobante : [];

  const sinRevisar = lista.filter((f) => f?.revisada !== true).length;
  const preciosSinContestar = lista.filter((f) => hayQueDecidirElPrecio(f)).length;
  const sinVincular = lista.filter((f) => estadoDeLinea(f) === ESTADO_LINEA.SIN_VINCULAR).length;

  // Las huérfanas se cuentan por lo que se contestó. Sin respuesta, NO LLEGÓ:
  // el default es el que no inventa mercadería.
  const contestadas = huerfanas.filter((d) => llegadas?.[d?.pedidoDetalleId] === LLEGADA.LLEGO
    || llegadas?.[d?.pedidoDetalleId] === LLEGADA.NO_LLEGO).length;
  const llegaron = huerfanas.filter((d) => llegadas?.[d?.pedidoDetalleId] === LLEGADA.LLEGO);

  return {
    renglones: lista.length,
    /** Cuántos PRODUCTOS distintos trae el papel, que es lo que dice el texto. */
    productos: cuantosProductos(lista),
    sinRevisar,
    preciosSinContestar,
    sinVincular,
    sinComprobante: huerfanas.length,
    contestadas,
    llegaron: llegaron.length,
    noLlegaron: huerfanas.length - llegaron.length,
    /** Cuántas unidades del pedido entrarían por las que se dijo que llegaron. */
    unidadesQueEntran: llegaron.reduce((a, d) => a + (Number(d?.cantidadPedida) || 0), 0),
  };
}

/** ¿Hay algo que decir antes de cerrar? */
export function hayQueAvisar(r) {
  if (!r) return false;
  return r.sinComprobante > 0 || r.sinRevisar > 0 || r.preciosSinContestar > 0 || r.sinVincular > 0;
}

/** Lo que queda a medias, en una frase y sin adornos. `null` si no queda nada. */
//
// `sinPapel`: el pedido llegó sin factura y los productos son los del PEDIDO.
// Decir "del papel" ahí nombra algo que no existe.
export function textoDeLoQueQueda(r, { sinPapel = false } = {}) {
  if (!r) return null;
  const partes = [];
  if (r.sinRevisar > 0) partes.push(`${r.sinRevisar} sin mirar`);
  if (r.preciosSinContestar > 0) partes.push(`${r.preciosSinContestar} con el precio sin contestar`);
  if (r.sinVincular > 0) partes.push(`${r.sinVincular} sin vincular`);
  if (!partes.length) return null;
  // El número que lleva la palabra "productos" al lado cuenta productos, con el
  // criterio de `cuantosProductos`: dos renglones del mismo producto son uno.
  // Lo que sigue —"3 sin mirar"— se cuenta por renglón, que es lo que se mira,
  // y por eso no lleva esa palabra.
  const deDonde = sinPapel ? "del pedido" : "del papel";
  const cabeza =
    r.productos === 1 ? `Del único producto ${deDonde}` : `De los ${r.productos} productos ${deDonde}`;
  return `${cabeza}: ${partes.join(" · ")}.`;
}

/**
 * LO QUE SE LE MANDA AL SERVIDOR PARA CADA LÍNEA SIN COMPROBANTE.
 *
 * Explícito y por línea: la que llegó entra con lo pedido —que es el único
 * número que existe, porque no hay papel que diga otra cosa— y la que no llegó
 * entra en CERO. Sin esto el servidor completaba con la cantidad pedida y
 * metía al stock lo que nadie vio.
 */
export function recibidosDeLasHuerfanas({ sinComprobante = [], llegadas = {} } = {}) {
  const out = {};
  for (const d of Array.isArray(sinComprobante) ? sinComprobante : []) {
    const id = d?.pedidoDetalleId;
    if (id == null) continue;
    const llego = llegadas?.[id] === LLEGADA.LLEGO;
    out[id] = llego && esNumero(d?.cantidadPedida) ? Number(d.cantidadPedida) : 0;
  }
  return out;
}

/**
 * LO QUE SE LE MANDA AL SERVIDOR, ENTERO Y EXPLÍCITO.
 *
 * El servidor ya no completa lo que falta, así que esta función es la que dice
 * qué entra por cada línea del pedido. Tres fuentes, en este orden:
 *
 *   1. LO QUE LA PERSONA CONTÓ. Manda sobre todo lo demás: es alguien mirando
 *      la mercadería.
 *   2. LO QUE DICE EL PAPEL, para los renglones que un comprobante trajo y
 *      nadie contó. No es inventar: el proveedor afirma por escrito que mandó
 *      eso, y la cantidad va en la ESCALA DEL PEDIDO —los 80 del papel son 8
 *      bultos— que es la misma conversión que muestra la pantalla.
 *   3. LA RESPUESTA POR LÍNEA para las que ningún comprobante trajo: lo pedido
 *      si se dijo que llegó, CERO si no.
 *
 * Y las del papel se SUMAN por línea de pedido: dos renglones pueden traer el
 * mismo producto —las líneas 120 y 121 del comprobante 5 van las dos al detalle
 * 2565— y pisar en vez de sumar perdería uno de los dos.
 */
/**
 * LAS LÍNEAS CUYO COSTO EL CIERRE NO TOCA: LAS QUE LLEGARON SIN PAPEL.
 *
 * Sin factura no hay un costo nuevo que conocer: el de la línea es una copia
 * del catálogo tomada al armar el pedido. Escribirlo al recibir no agrega nada
 * cuando coinciden, y cuando no coinciden PISA lo más nuevo — por ejemplo el
 * costo que alguien acaba de corregir con el lápiz a editar producto, que es
 * justamente cómo se corrige un costo en un pedido sin factura.
 *
 * Va a `costosExcluidos` de la ruta de recibir, que es la exclusión que la
 * frontera de costo ya respeta siempre.
 *
 * ── Y LAS QUE ALGUIEN DECIDIÓ "DEJAR EL QUE TENÍA" ─────────────────────
 *
 * Con papel, la otra forma de no tocar el costo es la decisión explícita:
 * "Dejar el que tenía" significa recibir la mercadería y NO actualizar el
 * costo maestro desde esa línea. Sin esto, la decisión quedaba guardada y el
 * cierre igual intentaba escribir el costo de la línea: con el freno de
 * variación encendido eso era un 409 sin salida, porque la hoja ya no tenía
 * nada más que ofrecer.
 *
 * La decisión se lee con `decisionVigente` y no con la última guardada para
 * el producto: vale solo si el precio del papel y el costo de la línea son los
 * mismos sobre los que se decidió. Una decisión vieja, tomada contra otros
 * números, no excluye nada. Y es por LÍNEA: otra línea del mismo pedido sigue
 * pasando por el freno.
 *
 * @returns ids de línea del pedido.
 */
export function costosQueNoSeTocan(filas = []) {
  const ids = (Array.isArray(filas) ? filas : [])
    .filter((f) => f?.pedidoDetalleId != null)
    .filter(
      (f) => f?.sinPapel === true || decisionVigente(f)?.decision === DECISION_DE_PRECIO.DEJA_EL_MIO
    )
    .map((f) => f.pedidoDetalleId);
  // Dos renglones del papel pueden apuntar a la misma línea del pedido.
  return [...new Set(ids)];
}

export function recibidosDelCierre({
  filas = [],
  sinComprobante = [],
  llegadas = {},
  contados = {},
} = {}) {
  const delPapel = {};
  for (const f of Array.isArray(filas) ? filas : []) {
    const id = f?.pedidoDetalleId;
    if (id == null) continue;
    const cantidad = Number(cantidadEnEscalaDelPedido(f));
    if (!Number.isFinite(cantidad)) continue;
    delPapel[id] = (delPapel[id] ?? 0) + cantidad;
  }

  const out = { ...delPapel };
  // Lo contado por una persona pisa lo que dice el papel, y solo donde lo hay.
  for (const [id, valor] of Object.entries(contados || {})) {
    if (esNumero(valor)) out[id] = Number(valor);
  }
  return { ...out, ...recibidosDeLasHuerfanas({ sinComprobante, llegadas }) };
}
