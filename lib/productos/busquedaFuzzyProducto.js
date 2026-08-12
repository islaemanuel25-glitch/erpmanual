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
 * Normaliza el retorno de getCodigo a un array de strings lowercase no vacíos.
 * getCodigo puede devolver string | string[] | null | undefined — esto cubre
 * productos con uno o varios códigos de barra (ej. codigo_barra + secundario).
 */
function normalizarCodigos(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const c of arr) {
    if (c == null) continue;
    const s = String(c).toLowerCase();
    if (s) out.push(s);
  }
  return out;
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
 * Genera variantes razonables de una query de voz para compararlas todas
 * contra el catálogo y quedarse con el mejor match. La voz suele agregar
 * sonidos espurios al inicio ("acotar" en lugar de "COTAR") o concatenar
 * artículos ("la cotar" en lugar de "leche cotar").
 *
 * Reglas:
 *  - Siempre incluye la query normalizada.
 *  - Si arranca con vocal y tiene >=5 chars, agrega la query SIN la primera letra.
 *  - Si la query tiene varias palabras, agrega cada palabra >=3 chars por separado.
 *
 * Devuelve siempre normalizadas (lowercase / sin acentos).
 *
 * @param {string} query texto crudo (puede tener mayúsculas, acentos, símbolos)
 * @returns {string[]} variantes únicas, sin vacíos
 */
export function generarVariantesQuery(query) {
  const q = normalizarTexto(query);
  if (!q || q.length < 3) return q ? [q] : [];

  const variantes = new Set([q]);

  if (q.length >= 5 && /^[aeiou]/.test(q)) {
    variantes.add(q.slice(1));
  }

  const palabras = q.split(/\s+/);
  if (palabras.length > 1) {
    for (const w of palabras) {
      if (w.length >= 3) variantes.add(w);
    }
  }

  return Array.from(variantes).filter((v) => v && v.length >= 3);
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

  // Matches LITERALES con fracciones: así "leche" vs "Leche Cotar" (0.1) le gana
  // a "leche" vs "Cusenier Dulce De Leche" (0.4) en el ranking. Antes ambos
  // daban 0 y empataban — el primero por id ganaba y "Leche Cotar" se perdía.
  const palabras = nombreNorm.split(/\s+/);
  if (nombreNorm === queryNorm) return 0;
  if (nombreNorm.startsWith(queryNorm)) return 0.1;
  if (palabras.some((w) => w === queryNorm)) return 0.2;
  if (palabras.some((w) => w.startsWith(queryNorm))) return 0.3;
  if (nombreNorm.includes(queryNorm)) return 0.4;

  // Sin match literal: Levenshtein contra palabras (≥3 chars).
  // Distancia local proporcional a la longitud mínima entre query y palabra:
  // así "xyz" no matchea "25l" con distancia 3, pero "brama" sí matchea "brahma".
  let best = maxDistance + 1;
  for (const w of palabras) {
    if (!w || w.length < 3) continue;
    const minLen = Math.min(queryNorm.length, w.length);
    const localMax = Math.min(maxDistance, Math.max(1, Math.floor(minLen * 0.4)));
    const d = levenshtein(queryNorm, w, localMax);
    if (d <= localMax && d < best) best = d;
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

  const variantes = generarVariantesQuery(query);
  if (variantes.length === 0) return [];
  const queryLowerRaw = String(query).toLowerCase();

  const out = [];
  for (const item of items) {
    const codigos = normalizarCodigos(getCodigo(item));
    if (codigos.some((c) => c === queryLowerRaw)) {
      out.push({ item, score: 0 });
      continue;
    }
    const nombreNorm = normalizarTexto(getNombre(item));
    let best = maxDistance + 1;
    for (const v of variantes) {
      const s = scoreFuzzyProducto(v, nombreNorm, { maxDistance });
      if (s < best) best = s;
      if (best === 0) break;
    }
    if (best <= maxDistance) {
      out.push({ item, score: best });
    }
  }

  out.sort((a, b) => a.score - b.score);
  return out;
}

/**
 * Rankea items por coincidencia LITERAL — substring / inicio de palabra.
 * Pensado para búsqueda manual: si el usuario escribió "leche", el helper
 * SOLO devuelve productos que contengan "leche" en algún campo, ordenados
 * por relevancia (exacto > startsWith > palabra empieza con > contains).
 * NO usa Levenshtein ni variantes — escribir mal acá significa no encontrar.
 *
 * @param {Array} items catálogo (no hace SQL — lo carga el caller)
 * @param {string} query texto crudo (lo normaliza adentro)
 * @param {Object} opts
 *   - getNombre(item): extrae el nombre comparable
 *   - getCodigo(item): opcional, código de barras (match exacto → score 0)
 * @returns {Array<{item, score}>} 0..4, ordenado ascendente
 */
export function rankearLiteral(items, query, opts = {}) {
  const getNombre = opts.getNombre || ((i) => i?.nombre || "");
  const getCodigo = opts.getCodigo || (() => null);

  const queryNorm = normalizarTexto(query);
  if (!queryNorm) return [];
  const queryLowerRaw = String(query).toLowerCase();

  const out = [];
  for (const item of items) {
    const codigos = normalizarCodigos(getCodigo(item));
    if (codigos.some((c) => c === queryLowerRaw)) {
      out.push({ item, score: 0 });
      continue;
    }
    const nombreNorm = normalizarTexto(getNombre(item));
    if (!nombreNorm) continue;

    let score = -1;
    if (nombreNorm === queryNorm) {
      score = 1;
    } else if (nombreNorm.startsWith(queryNorm)) {
      score = 2;
    } else {
      const palabras = nombreNorm.split(/\s+/);
      if (palabras.some((w) => w.startsWith(queryNorm))) {
        score = 3;
      } else if (nombreNorm.includes(queryNorm)) {
        score = 4;
      }
    }
    if (score >= 0) out.push({ item, score });
  }

  out.sort((a, b) => a.score - b.score);
  return out;
}

/**
 * RANKEA POR PALABRAS SUELTAS, no por la frase entera.
 *
 * ── POR QUÉ HIZO FALTA ─────────────────────────────────────────────────────
 *
 * `rankearLiteral` compara la CONSULTA COMPLETA contra el nombre: igual,
 * empieza con, alguna palabra empieza con, o contiene. Sirve cuando quien
 * escribe teclea un pedazo del nombre.
 *
 * No sirve para conciliar una factura, donde los dos textos son NOMBRES
 * DISTINTOS DEL MISMO PRODUCTO. "CHESTERFIELD 10 CONV" contra "Chester 10" no
 * es igual, no empieza igual, ninguna palabra del nombre empieza con la frase
 * entera, y no la contiene. Literal: cero.
 *
 * Y sin literal queda solo el fuzzy, que rankea por distancia sobre la frase
 * completa y ahí "CHESTERFIELD 10 CONV" se parece más a "Lucky 20 convertible
 * xl" que a "Chester 10". Medido sobre las 21 líneas reales de la factura de
 * Mauro contra su pedido: el literal acertaba 2, y dos líneas no traían NINGÚN
 * candidato.
 *
 * ── CÓMO PUNTÚA ───────────────────────────────────────────────────────────
 *
 * Palabra por palabra. Cada palabra de la consulta que aparece ENTERA en el
 * nombre suma 2; la que es prefijo de una palabra del nombre —o al revés, que
 * es el caso "chester"/"chesterfield"— suma 1.
 *
 * A igual puntaje gana el nombre MÁS CORTO: entre "Marlboro 20 Crafted Box" y
 * "Marlboro 20 Crafted Uva Box" para una factura que no dice uva, el que no
 * agrega palabras es el más probable.
 *
 * Con las mismas 21 líneas: las 21 traen candidatos y el primero es el correcto
 * en casi todas —CHESTERFIELD 10 → Chester 10, M.CRAFTED 20 BOX CORAL →
 * Marlboro 20 crafted coral box—.
 *
 * `score` mantiene la convención de los otros: MENOR ES MEJOR.
 */
export function rankearPorPalabras(items, query, opts = {}) {
  const getNombre = opts.getNombre || ((i) => i?.nombre || "");
  const palabras = normalizarTexto(query).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];

  const out = [];
  for (const item of items) {
    const delNombre = normalizarTexto(getNombre(item)).split(/\s+/).filter(Boolean);
    if (!delNombre.length) continue;

    let puntos = 0;
    for (const p of palabras) {
      if (delNombre.includes(p)) { puntos += 2; continue; }
      if (delNombre.some((w) => w.startsWith(p) || p.startsWith(w))) puntos += 1;
    }
    if (puntos <= 0) continue;
    out.push({ item, score: -puntos, puntos, cobertura: puntos / (palabras.length * 2) });
  }

  out.sort((a, b) => b.puntos - a.puntos || getNombre(a.item).length - getNombre(b.item).length);
  return out;
}

/**
 * Resuelve una query de voz contra el catálogo: rankea productos reales y,
 * cuando la query original no aparece literal en el ganador, extrae la
 * palabra del nombre real que más se le parece. Esa palabra es la
 * "queryInterpretada" — el término real del catálogo que el sistema cree
 * que el usuario quiso decir. Si el ganador tiene la query como substring
 * directo, no devuelve queryInterpretada.
 *
 * @param {Array} items catálogo (no hace SQL — lo carga el caller)
 * @param {string} query texto crudo de voz
 * @param {Object} opts mismas opciones que rankearFuzzy
 * @returns {{ rankings: Array<{item, score}>, queryInterpretada: string | null }}
 */
export function resolverContraCatalogo(items, query, opts = {}) {
  const rankings = rankearFuzzy(items, query, opts);
  if (rankings.length === 0) {
    return { rankings, queryInterpretada: null };
  }

  const getNombre = opts.getNombre || ((i) => i?.nombre || "");
  const queryNorm = normalizarTexto(query);
  if (!queryNorm) return { rankings, queryInterpretada: null };

  const top = rankings[0];
  const nombreTopNorm = normalizarTexto(getNombre(top.item));

  // Si la query original aparece literal en el nombre ganador, no hay
  // reinterpretación: el usuario dijo bien o el LIKE clásico habría andado.
  if (nombreTopNorm.includes(queryNorm)) {
    return { rankings, queryInterpretada: null };
  }

  // Buscar la palabra del nombre que más se parece a alguna variante de la
  // query. Esa es la palabra real del catálogo que probablemente quiso decir.
  const variantes = generarVariantesQuery(query);
  const palabrasNombre = nombreTopNorm.split(/\s+/).filter((w) => w.length >= 3);
  let mejorPalabra = null;
  let mejorScore = Infinity;
  for (const w of palabrasNombre) {
    for (const v of variantes) {
      const minLen = Math.min(v.length, w.length);
      const cap = Math.min(3, Math.max(1, Math.floor(minLen * 0.4)));
      const d = levenshtein(v, w, cap);
      if (d <= cap && d < mejorScore) {
        mejorScore = d;
        mejorPalabra = w;
      }
    }
  }

  return { rankings, queryInterpretada: mejorPalabra };
}
