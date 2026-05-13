/**
 * Helper para búsqueda fuzzy de productos existentes.
 *
 * Tolera errores de transcripción por voz (ej. "brama" → BRAHMA, "acotar" → COTAR)
 * y typos manuales. Aplica solo cuando la búsqueda LIKE devuelve pocos resultados
 * o cuando el caller solicita explícitamente fromVoice.
 *
 * NO debe usarse en flujos de CREACIÓN/EDICIÓN de producto: este helper compara
 * contra el catálogo existente y NO sugiere ni inventa nombres.
 */

/**
 * Normaliza una cadena para comparación fuzzy:
 *  - lowercase
 *  - sin acentos (Unicode NFD + remove diacritics)
 *  - sin caracteres no-alfanuméricos (los reemplaza por espacio)
 *  - colapsa espacios múltiples
 */
export function normalizarTexto(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Distancia Levenshtein clásica con early-exit por maxDistance.
 * Si supera maxDistance en algún punto, retorna maxDistance+1 (evita work inútil).
 *
 * @param {string} a
 * @param {string} b
 * @param {number} maxDistance umbral; default Infinity
 * @returns {number} distancia entre a y b (0 si idénticos)
 */
export function levenshtein(a, b, maxDistance = Infinity) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const m = a.length;
  const n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let minRow = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < minRow) minRow = curr[j];
    }
    if (minRow > maxDistance) return maxDistance + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * Score fuzzy de query vs nombre (ambos ya normalizados).
 * Estrategia:
 *   1. Si query está contenida en nombre → 0 (match parcial perfecto)
 *   2. Levenshtein query vs cada palabra del nombre → mínimo (mejor match)
 *
 * @returns {number} 0 = perfecto, maxDistance+1 = no aplica
 */
export function scoreFuzzyProducto(queryNorm, nombreNorm, opts = {}) {
  const maxDistance = opts.maxDistance ?? 3;
  if (!queryNorm || !nombreNorm) return maxDistance + 1;
  if (queryNorm.length < 3) return maxDistance + 1;
  if (nombreNorm.includes(queryNorm)) return 0;

  const palabras = nombreNorm.split(/\s+/);
  let best = maxDistance + 1;
  for (const w of palabras) {
    if (!w || w.length < 3) continue;
    // Distancia local proporcional a la longitud mínima entre query y palabra:
    // así "xyz" no matchea "25l" con distancia 3, pero "brama" sí matchea "brahma".
    const minLen = Math.min(queryNorm.length, w.length);
    const localMax = Math.min(maxDistance, Math.max(1, Math.floor(minLen * 0.4)));
    const d = levenshtein(queryNorm, w, localMax);
    if (d <= localMax && d < best) best = d;
    if (best === 0) return 0;
  }
  return best;
}

/**
 * Rankea una lista de items por similitud fuzzy a query. Devuelve los items
 * que tienen score <= maxDistance, ordenados ascendente.
 *
 * @param {Array} items
 * @param {string} query texto sin normalizar
 * @param {Object} opts
 *   - getNombre(item): función para extraer el nombre comparable
 *   - getCodigo(item): opcional, extrae código de barras (match exacto → score 0)
 *   - maxDistance: umbral (default 2; para voz suele usarse 3)
 * @returns {Array<{item, score}>}
 */
export function rankearFuzzy(items, query, opts = {}) {
  const getNombre = opts.getNombre || ((i) => i?.nombre || "");
  const getCodigo = opts.getCodigo || (() => null);
  const maxDistance = opts.maxDistance ?? 2;

  const queryNorm = normalizarTexto(query);
  if (!queryNorm) return [];
  const queryLowerRaw = String(query).toLowerCase();

  const out = [];
  for (const item of items) {
    const codigo = getCodigo(item);
    if (codigo && String(codigo).toLowerCase() === queryLowerRaw) {
      out.push({ item, score: 0 });
      continue;
    }
    const nombreNorm = normalizarTexto(getNombre(item));
    const score = scoreFuzzyProducto(queryNorm, nombreNorm, { maxDistance });
    if (score <= maxDistance) {
      out.push({ item, score });
    }
  }

  out.sort((a, b) => a.score - b.score);
  return out;
}
