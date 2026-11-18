// lib/productos/packDeLata.js
//
// EL PACK DE UNA LATA, EN EL ALTA DESDE EL PAPEL Y DESDE LA LISTA.
//
// ── EL CASO (2026-11-18) ──────────────────────────────────────────────────
//
// "BRAHMA FT LIMON CAN 4X6 473CC", $ 36.320,66 en el papel: una plancha de 24
// latas, 4 packs de 6. El alta proponía pack de 4 —el primer número del par— y
// la pregunta de precios ofrecía "Por la caja de 4" o "Por unidad": la plancha
// no estaba entre las opciones.
//
// La regla de Emanuel para las latas —el nombre dice CAN, LATA o LAT—: se
// manejan por PLANCHA ENTERA, y el pack de una lata solo puede ser 24, 16, 6
// o 4. Lo normal es la plancha: la de 473 cc viene por 24; la de 710 cc por
// 24 o por 16. Los packs sueltos de 6 o de 4 son la excepción.
//
//   · si el nombre trae "AxB" sin peso ni volumen (4X6, 6x4, 2X12), A×B;
//   · si no, la plancha: 24 para 473 cc y menos; para 710 cc, 24 salvo que el
//     papel o la lista digan 16;
//   · y si con eso el precio por lata es un disparate al lado de las otras
//     latas del mismo proveedor, la opción que da un precio por lata coherente.
//
// Módulo puro: sin React, sin Prisma y sin red. Lo usan las dos altas.

import { dosNumerosSinMedidaEnNombre } from "../proveedores/listas/presentacionDescripcion.js";

/** Los únicos packs que puede tener una lata, en el orden en que se ofrecen. */
export const OPCIONES_PACK_LATA = Object.freeze([24, 16, 6, 4]);

/** ¿Es una lata? El nombre dice CAN, LATA o LAT, como palabra. */
export function esLata(texto) {
  return /(?:^|[^a-z])(?:can|latas?|lat)(?![a-z])/i.test(String(texto ?? ""));
}

/** El volumen de la lata en cc, si el nombre lo dice ("473CC", "710 ml"), o null. */
export function volumenDeLaLataEnCc(texto) {
  const m = String(texto ?? "").match(/(\d{3,4})\s*(?:cc|ml)(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

/**
 * EL PACK QUE SE PROPONE PARA UNA LATA, o null si no es una lata.
 *
 * @param texto  el nombre del renglón o de la lista
 * @param dicho  lo que el papel o la lista dicen por su cuenta del bulto (el UxB
 *               del lector, el "por caja" de la lista): solo cuenta un 16 en la
 *               de 710 cc.
 */
export function packPropuestoDeLata({ texto, dicho = null } = {}) {
  if (!esLata(texto)) return null;
  const d = dosNumerosSinMedidaEnNombre(texto);
  if (d && d.a * d.b >= 2) return d.a * d.b;
  const cc = volumenDeLaLataEnCc(texto);
  if (cc !== null && cc >= 700 && Number(dicho) === 16) return 16;
  return 24;
}

/**
 * EL PRECIO POR LATA DE REFERENCIA DEL PROVEEDOR: la mediana del costo por lata
 * de sus latas cargadas (costo del pack ÷ pack), o null si no tiene ninguna.
 *
 * @param productos  `[{ nombre, factor_pack, precio_costo }]`, como los devuelve
 *                   `GET /api/compras-proveedor/productos`.
 */
export function precioPorLataDeReferencia(productos = []) {
  const porLata = (productos ?? [])
    .filter((p) => esLata(p?.nombre))
    .map((p) => Number(p?.precio_costo) / Number(p?.factor_pack))
    .filter((n) => Number.isFinite(n) && n > 0 && Number.isFinite(n))
    .sort((a, b) => a - b);
  if (!porLata.length) return null;
  const medio = Math.floor(porLata.length / 2);
  return porLata.length % 2 ? porLata[medio] : (porLata[medio - 1] + porLata[medio]) / 2;
}

/** Hasta cuántas veces arriba o abajo de la referencia el precio por lata es coherente. */
export const VECES_COHERENTE = 2;

/**
 * EL PACK DE LA LATA, CON EL PRECIO A LA VISTA.
 *
 * Si el precio por lata que sale con el propuesto está entre la mitad y el
 * doble de la referencia, queda el propuesto. Si no, la opción de
 * `OPCIONES_PACK_LATA` que deja el precio por lata más cerca de la referencia.
 * Sin precio o sin referencia, el propuesto.
 */
export function packDeLataCoherente({ propuesto, precioCaja, referenciaPorLata } = {}) {
  const precio = Number(precioCaja);
  const ref = Number(referenciaPorLata);
  if (!(Number(propuesto) > 0) || !(precio > 0) || !(ref > 0)) return propuesto ?? null;
  const distancia = (n) => Math.abs(Math.log(precio / n / ref));
  if (distancia(propuesto) <= Math.log(VECES_COHERENTE)) return propuesto;
  return OPCIONES_PACK_LATA.reduce((mejor, n) => (distancia(n) < distancia(mejor) ? n : mejor), OPCIONES_PACK_LATA[0]);
}
