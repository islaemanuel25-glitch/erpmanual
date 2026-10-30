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
import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";

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

// ── UN CÓDIGO ESCANEADO O TIPEADO ───────────────────────────────────────────
//
// Las palabras significativas son de letras, así que un código de barras no
// puntúa. Medido contra Postgres el 2026-10-30: igual se encontraba, porque la
// ruta busca el código de barras con `contains`, pero no iba primero ni era
// exacto, y en todo el catálogo el código del proveedor no aparecía. Decisión
// de Emanuel: solo dígitos, seis o más → coincidencia EXACTA contra el código
// de barras, el secundario (el de la caja) y el código del proveedor, primero.

/** ¿Lo escrito es un código? Solo dígitos, seis o más. */
export function esBusquedaPorCodigo(search) {
  return /^\d{6,}$/.test(String(search ?? "").trim());
}

/** ¿El ítem tiene ESE código exacto: de barras, de la caja o del proveedor? */
export function coincideElCodigo(item, search) {
  const q = String(search ?? "").trim();
  if (!q) return false;
  if ([item?.codigo_barra, item?.codigo_barra_secundario].some((c) => String(c ?? "").trim() === q)) return true;
  return (item?.codigosInternos ?? []).some((c) => normalizarCodigo(c) === normalizarCodigo(q));
}

/** Los que tienen el código exacto primero; los demás detrás, como vinieron. */
export function ordenarPorCodigo(items, search) {
  const exactos = items.filter((i) => coincideElCodigo(i, search));
  return [...exactos, ...items.filter((i) => !exactos.includes(i))];
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
