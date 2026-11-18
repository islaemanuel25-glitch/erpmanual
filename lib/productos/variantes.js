// lib/productos/variantes.js
//
// LAS PALABRAS QUE DISTINGUEN UNA VARIANTE DE UN MISMO PRODUCTO.
//
// ── EL CASO (Dab, 2026-11-18) ─────────────────────────────────────────────
//
// El papel dice "GIGANTE LIMPIADOR CITRONELA 900CC" con el código 2530, y la
// lista de Dab tiene en el 2530 "GIGANTE LIMPIADOR LIMON 900CC". Dab usa el
// mismo código para los aromas de un producto. "Crear con los datos de la
// lista" ofrecía crear el Limón.
//
// Una variante es aroma, sabor o color: CITRONELA contra LIMON, CARNE contra
// POLLO, BLANCO contra NEGRO. Las palabras salen de los nombres reales de los
// códigos compartidos medidos ese día —RAMEN CUP CARNE / POLLO / POLLO
// PICANTE, TATIN TRIPLE BLANCO / NEGRO, GIGANTE LIMPIADOR MARINA / LIMON /
// CITRONELA— y de lo que las listas guardadas usan para distinguir variantes.
// Los nombres que solo cambian en una abreviatura o un error de tipeo
// ("TREMS" / "TREMB", "X 26GRS" / "X26G", "MINITORTA" / "MINITORTO") no son
// variantes: ninguna de sus diferencias está en esta lista.
//
// Módulo puro: sin React, sin Prisma y sin red.

/** La palabra como se compara: mayúsculas, sin acentos, solo letras. */
function limpia(palabra) {
  return String(palabra ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/** Abreviaturas que se escriben en los papeles, con la palabra que nombran. */
const ABREVIATURAS = Object.freeze({
  NEG: "NEGRO",
  BCO: "BLANCO",
  BCA: "BLANCO",
  BLAN: "BLANCO",
  FRUT: "FRUTILLA",
  CHOC: "CHOCOLATE",
  VAIN: "VAINILLA",
  DDL: "DULCEDELECHE",
});

/** Aromas, sabores y colores. Una palabra por variante, como la dice el papel. */
export const PALABRAS_DE_VARIANTE = Object.freeze(new Set([
  // Aromas
  "CITRONELA", "LAVANDA", "PINO", "MARINA", "FLORAL", "JAZMIN", "ROSAS", "VIOLETAS", "EUCALIPTO",
  "ALOE", "BEBE", "CITRICO", "CITRUS", "BRISA", "OCEANO", "PRIMAVERA",
  // Sabores
  "LIMON", "NARANJA", "MANDARINA", "POMELO", "LIMA", "FRUTILLA", "FRESA", "CEREZA", "UVA", "MANZANA",
  "PERA", "DURAZNO", "ANANA", "BANANA", "COCO", "SANDIA", "MELON", "MARACUYA", "MANGO", "FRAMBUESA",
  "ARANDANO", "MORA", "MORAS", "MENTA", "MENTOL", "CHOCOLATE", "VAINILLA", "DULCEDELECHE", "CAFE",
  "CARAMELO", "MIEL", "CANELA", "QUESO", "JAMON", "CEBOLLA", "CARNE", "POLLO", "PICANTE", "VERDURA",
  "TOMATE", "PROVENZAL", "TUTTI", "FRUTAL", "PISTACHO", "ALMENDRA", "AVELLANA", "MANI",
  // Colores, y los del vino
  "BLANCO", "NEGRO", "ROJO", "AZUL", "VERDE", "AMARILLO", "ROSA", "VIOLETA", "DORADO", "PLATEADO",
  "GRIS", "MARRON", "TINTO", "ROSADO",
]));

/** Las palabras de variante que dice un nombre, como `Set` (las abreviaturas, resueltas). */
export function palabrasDeVariante(texto) {
  const salida = new Set();
  for (const crudo of String(texto ?? "").split(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/)) {
    const p = limpia(crudo);
    const palabra = ABREVIATURAS[p] ?? p;
    if (PALABRAS_DE_VARIANTE.has(palabra)) salida.add(palabra);
  }
  // "DULCE DE LECHE" en tres palabras es una sola variante.
  if (/DULCE\s+DE\s+LECHE/.test(limpiaFrase(texto))) salida.add("DULCEDELECHE");
  return salida;
}

function limpiaFrase(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

/**
 * ¿LOS DOS NOMBRES SON VARIANTES DISTINTAS? Los dos dicen alguna variante y no
 * dicen las mismas: "CITRONELA" contra "LIMON", "POLLO PICANTE" contra
 * "POLLO", "NEG." contra "BLANCO".
 *
 * Que uno no diga ninguna NO es otra variante: los nombres llegan cortados
 * —"DON SATUR MAGDALENA…" en la lista de Dab es la de vainilla, "LADRILLOS MIX
 * FRUTA" en el papel es el "MIX FRUTAL"—, y la ausencia de la palabra no dice
 * que sea otro aroma. Medido sobre los códigos compartidos de las listas
 * guardadas y los papeles (2026-11-18).
 */
export function difierenEnVariante(a, b) {
  const va = palabrasDeVariante(a);
  const vb = palabrasDeVariante(b);
  if (!va.size || !vb.size) return false;
  for (const p of va) if (!vb.has(p)) return true;
  for (const p of vb) if (!va.has(p)) return true;
  return false;
}

/** Las palabras de variante que tiene `a` y `b` no, en el orden en que las dice `a`. */
export function variantesQueSoloTiene(a, b) {
  const vb = palabrasDeVariante(b);
  return [...palabrasDeVariante(a)].filter((p) => !vb.has(p));
}

/** "LIMON" → "Limón": como se dice la variante en una frase. */
const CON_ACENTO = Object.freeze({ LIMON: "Limón", JAZMIN: "Jazmín", MELON: "Melón", ANANA: "Ananá", JAMON: "Jamón", CAFE: "Café", MARRON: "Marrón", ARANDANO: "Arándano", OCEANO: "Océano", SANDIA: "Sandía", CITRICO: "Cítrico", MANI: "Maní", DULCEDELECHE: "Dulce de leche", BEBE: "Bebé", MARACUYA: "Maracuyá" });
export function nombreDeVariante(palabra) {
  const p = String(palabra ?? "");
  return CON_ACENTO[p] ?? (p ? p.charAt(0) + p.slice(1).toLowerCase() : "");
}
