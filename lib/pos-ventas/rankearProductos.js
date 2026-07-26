// lib/pos-ventas/rankearProductos.js
//
// Ranking por relevancia de resultados de búsqueda de productos. Compartido por
// el buscador del POS y el de componentes de combos (mismo criterio). Puro/testeable.
// Orden: código exacto (principal o secundario) → nombre exacto → empieza-con →
// palabra empieza-con → contiene → resto. Estable dentro de cada score.
export function rankearProductos(items, texto) {
  const q = (texto || "").trim().toLowerCase();
  if (!q) return items;
  const scoreOf = (p) => {
    const nombre = (p.nombre || "").toLowerCase();
    const codigo = (p.codigoBarra || "").toLowerCase();
    const codigoSec = (p.codigoBarraSecundario || "").toLowerCase();
    if (codigo === q || codigoSec === q) return 0; // código exacto (primario o secundario)
    if (nombre === q) return 1; // nombre exacto
    if (nombre.startsWith(q)) return 2; // nombre empieza con
    const palabras = nombre.split(/\s+/);
    if (palabras.some((w) => w.startsWith(q))) return 3; // alguna palabra empieza con
    if (nombre.includes(q)) return 4; // contiene
    return 5;
  };
  return [...items].sort((a, b) => scoreOf(a) - scoreOf(b));
}
