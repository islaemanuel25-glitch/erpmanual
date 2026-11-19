// lib/compras-proveedor/comprobante/lecturaCorrida.js
//
// ¿EL PAPEL SE LEYÓ CORRIDO? LO DICE LA LISTA DEL PROVEEDOR.
//
// ── LOS DOS CASOS (2026-11-18 y 19) ─────────────────────────────────────────
//
// En el pedido 473 de Arcor la lectura le corrió los NOMBRES un renglón desde el
// 3313: el 3750 —ALFAJOR BYN NEGRO en la lista— llegó como "TATIN TRIPLE
// BLANCO", el 4053 como "TATIN TRIPLE NEGRO". En la factura 00614085 de Dab
// corrió los CÓDIGOS: el Citronela llegó con el 002530 del Limón, el Limón con
// el 002531 de la Marina, la Marina con el 002533 de la Lavandina. En los dos
// la suma cerraba al centavo —los importes no se movieron— y la puerta lo dio
// por bueno. Y en los dos, volver a leer la foto dio exactamente lo mismo.
//
// Lo que los delata es la lista: cada código tiene en ella un nombre, y en un
// papel corrido varios renglones seguidos dicen otro producto que el que la
// lista da para su código.
//
// Regla de Emanuel (2026-11-19): con DOS o más renglones así, el comprobante
// entero es "posible lectura corrida". Se relee solo antes de vincular nada, y
// si sigue corrido, ninguna línea se vincula sola: queda para revisar. Un solo
// renglón distinto no alcanza —un nombre abreviado o un producto que cambió de
// código pasan—, y tampoco prueba un código compartido (`codigoCompartido.js`).
//
// No es `filasCorridas.js`, que mira el PEDIDO (cantidades y precios que le
// calzan a la fila de al lado): éste mira la LISTA (el nombre de cada código).
// Son dos señales distintas del mismo defecto.
//
// "Dice otro producto" no es "no se escribe igual": el papel abrevia y la lista
// corta. Es una contradicción que ya sabe medir el motor: otra variante
// (`difierenEnVariante`: CITRONELA contra LIMON, NEG. contra BLANCO) o lo que
// `puntuarCandidato` marca como contradicción —otra marca, otro gramaje, otra
// presentación—. Callar no contradice: un nombre cortado no dice nada.

import { difierenEnVariante } from "@/lib/productos/variantes";
import { puntuarCandidato } from "@/lib/proveedores/identidad/motorCandidatos";
import { armarListaGuardada, cargarListaGuardada, nombreDeLaListaParaElCodigo } from "./listaGuardada";

/** Desde cuántos renglones un comprobante es "posible lectura corrida". */
export const MINIMO_RENGLONES_CORRIDOS = 2;

export const TEXTO_LECTURA_CORRIDA =
  "Posible lectura corrida: varios renglones dicen otro producto que el que la lista del proveedor da para su código. " +
  "Ninguno se vinculó solo: revisalos contra el papel.";

/** ¿El nombre leído dice otro producto que el de la lista para ese código? */
export function nombreQueContradiceLaLista(leido, deLaLista) {
  if (!String(leido ?? "").trim() || !String(deLaLista ?? "").trim()) return false;
  if (difierenEnVariante(leido, deLaLista)) return true;
  return puntuarCandidato(leido, deLaLista).contradice === true;
}

/**
 * LOS RENGLONES QUE CONTRADICEN A LA LISTA, y si el comprobante está corrido.
 *
 * @param lineas         los renglones: `{ orden, codigoProveedor, textoCrudo | descripcion, tipoRenglon | tipo }`
 * @param listaGuardada  la de `armarListaGuardada`; sin lista no hay con qué, y no está corrido
 * @returns `{ corrida, renglones: [{ orden, codigo, leido, deLaLista }] }`
 */
export function lecturaCorrida({ lineas = [], listaGuardada = null } = {}) {
  const renglones = [];
  for (const [i, l] of (lineas ?? []).entries()) {
    const tipo = l?.tipoRenglon ?? l?.tipo ?? "MERCADERIA";
    if (tipo && tipo !== "MERCADERIA") continue;
    const leido = l?.textoCrudo ?? l?.descripcion ?? null;
    const deLaLista = nombreDeLaListaParaElCodigo(listaGuardada, l?.codigoProveedor);
    if (nombreQueContradiceLaLista(leido, deLaLista)) {
      renglones.push({ orden: l?.orden ?? i + 1, codigo: l?.codigoProveedor ?? null, leido, deLaLista });
    }
  }
  return { corrida: renglones.length >= MINIMO_RENGLONES_CORRIDOS, renglones };
}

/**
 * ¿ESTE PAPEL, COMO ESTÁ GUARDADO, ES UNA POSIBLE LECTURA CORRIDA? Con la lista
 * guardada de su proveedor. Para `codigoCompartidoDeVerdad`, que no cuenta los
 * papeles corridos como documento.
 *
 * @param prisma  el cliente o una transacción
 */
export async function papelCorrido(prisma, { grupoId, comprobanteId } = {}) {
  const c = await prisma.comprobanteProveedor.findFirst({
    where: { id: Number(comprobanteId), grupoId },
    select: { proveedorId: true, lineas: { orderBy: { orden: "asc" }, select: { orden: true, codigoProveedor: true, textoCrudo: true, tipoRenglon: true } } },
  });
  if (!c) return false;
  const listaGuardada = armarListaGuardada((await cargarListaGuardada(prisma, { grupoId, proveedorId: c.proveedorId })) ?? {});
  return lecturaCorrida({ lineas: c.lineas, listaGuardada }).corrida;
}
