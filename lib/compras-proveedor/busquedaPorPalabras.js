// lib/compras-proveedor/busquedaPorPalabras.js
//
// EL BUSCADOR DE "BUSCAR OTRO…" CON LA MISMA REGLA QUE LA SUGERENCIA.
//
// `/api/compras-proveedor/productos` buscaba la frase entera con `contains`:
// "PRITTY LIMON" no encontraba PRITTY 1L, porque el sabor no está en el nombre
// del producto, y borrando "LIMON" a mano aparecían todos los PRITTY (factura
// A 0016-00030115, 2026-10-29). La hoja escribe en el buscador las palabras del
// papel, así que esa frase entera no iba a encontrar nada casi nunca.
//
// Con `porPalabras` entra el producto que tiene AL MENOS UNA palabra
// significativa —la misma `palabrasSignificativas` de la sugerencia— y sale
// ordenado por `rankearPorPalabras`. Es un modo que pide solo la hoja: las
// pantallas de armar un pedido siguen buscando como siempre.
//
// Módulo puro: arma el `where` y ordena. La consulta la hace la ruta.

import { palabrasSignificativas, rankearPorPalabras } from "@/lib/proveedores/identidad/tokensDeProducto";

/**
 * Las condiciones sobre el NOMBRE para el `OR` de la búsqueda.
 *
 * Sin `porPalabras`, o si lo escrito no tiene ninguna palabra significativa
 * —un código, "1000"—, es la frase entera como siempre.
 */
export function condicionesDeNombre(search, { porPalabras = false } = {}) {
  const palabras = porPalabras ? palabrasSignificativas(search) : [];
  if (!palabras.length) return [{ nombre: { contains: search, mode: "insensitive" } }];
  // Cada palabra va normalizada y también como se escribió: `contains` no
  // ignora acentos, y "limon" sola no encontraría un "Limón".
  const escritas = String(search)
    .split(/\s+/)
    .filter((t) => palabrasSignificativas(t).length)
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""));
  return [...new Set([...palabras, ...escritas])].map((p) => ({ nombre: { contains: p, mode: "insensitive" } }));
}

/**
 * Los que coinciden por palabras primero, en el orden de `rankearPorPalabras`;
 * después, en el orden en que vinieron, los que entraron por otra cosa —código
 * interno, SKU, código de barras—.
 */
export function ordenarPorPalabras(items, search) {
  const rankeados = rankearPorPalabras(items, search).map((r) => r.item);
  const vistos = new Set(rankeados);
  return [...rankeados, ...items.filter((i) => !vistos.has(i))];
}
