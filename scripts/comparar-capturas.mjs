// scripts/comparar-capturas.mjs
//
// COMPARA DOS CAPTURAS Y SE NIEGA A COMPARAR LAS QUE NO SON COMPARABLES.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Desde que `medir-desborde.mjs` recorta al elemento objetivo, cada captura
// retrata una REGIÓN, no la pantalla. Y dos regiones distintas se comparan sin
// protestar: la resta da miles de píxeles y el que la lee la atribuye al cambio
// que estaba probando. Es la misma familia que el diagnóstico falso sobre una
// medición correcta que ya costó una tanda entera.
//
// Por eso cada captura sale con una ficha `.json` al lado que dice con qué
// selector, con qué margen y con qué recorte se sacó. Acá se leen las dos fichas
// ANTES de mirar un solo píxel, y si no coinciden la comparación no se hace.
//
// Sin ficha tampoco se compara: una foto sin ficha es de antes de que esto
// existiera, y no se sabe qué región retrató.
//
// Uso:
//   node scripts/comparar-capturas.mjs /tmp/antes/x.png /tmp/despues/x.png
//
// Códigos de salida:
//   0  idénticas
//   1  distintas (informa cuántos píxeles y dónde)
//   2  NO COMPARABLES: falta una ficha, o retratan regiones distintas

import fs from "node:fs";
import zlib from "node:zlib";

const [rutaA, rutaB] = process.argv.slice(2).filter((x) => !x.startsWith("--"));

if (!rutaA || !rutaB) {
  console.log("Uso: node scripts/comparar-capturas.mjs <antes.png> <despues.png>");
  process.exit(2);
}

// ── LAS FICHAS, PRIMERO ────────────────────────────────────────────────────

function leerFicha(ruta) {
  const f = `${ruta}.json`;
  if (!fs.existsSync(f)) {
    console.log(`SIN FICHA: ${f}`);
    console.log("  No se sabe qué región retrató esa captura, así que no se puede comparar.");
    console.log("  Sacala de nuevo con medir-desborde.mjs, que la escribe sola.");
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

const fichaA = leerFicha(rutaA);
const fichaB = leerFicha(rutaB);

// Lo que tiene que coincidir para que la resta signifique algo. El selector es
// el punto: si el antes se recortó por uno y el después por otro, la diferencia
// que salga no es del cambio, es del recorte.
const debenCoincidir = [
  ["selector", (f) => f.selector ?? "(pantalla entera)"],
  ["ancho de ventana", (f) => f.ancho],
  ["margen", (f) => f.margen ?? "(sin recorte al elemento)"],
  ["ancho del recorte", (f) => f.recorte?.width ?? "(sin recorte)"],
  ["alto del recorte", (f) => f.recorte?.height ?? "(sin recorte)"],
];

const discrepancias = debenCoincidir
  .map(([nombre, leer]) => [nombre, leer(fichaA), leer(fichaB)])
  .filter(([, a, b]) => String(a) !== String(b));

if (discrepancias.length) {
  console.log("NO COMPARABLES: las dos capturas no retratan la misma región.");
  for (const [nombre, a, b] of discrepancias) {
    console.log(`  ${nombre}: antes "${a}" — después "${b}"`);
  }
  console.log("  Cualquier diferencia de píxeles que saliera de acá sería del recorte, no del cambio.");
  process.exit(2);
}

// ── LOS BYTES ──────────────────────────────────────────────────────────────

const bytesA = fs.readFileSync(rutaA);
const bytesB = fs.readFileSync(rutaB);

console.log(`Recorte: ${fichaA.selector ?? "pantalla entera"} — ${fichaA.recorte?.width}x${fichaA.recorte?.height}px a ${fichaA.ancho} de ancho.`);

if (bytesA.equals(bytesB)) {
  console.log("IDÉNTICAS byte a byte. Cero píxeles de diferencia.");
  process.exit(0);
}

// ── LOS PÍXELES ────────────────────────────────────────────────────────────
//
// Bytes distintos no es lo mismo que píxeles distintos: dos PNG con el mismo
// contenido pueden comprimir distinto. Recién acá se decodifica.

/** Decodifica un PNG de 8 bits por canal, sin entrelazar. Es lo que saca CDP. */
function decodificar(buf, ruta) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${ruta} no es un PNG`);
  let pos = 8;
  let ancho = 0, alto = 0, canales = 0;
  const trozos = [];
  while (pos < buf.length) {
    const largo = buf.readUInt32BE(pos);
    const tipo = buf.toString("ascii", pos + 4, pos + 8);
    const datos = buf.subarray(pos + 8, pos + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      const profundidad = datos[8];
      const tipoColor = datos[9];
      const entrelazado = datos[12];
      if (profundidad !== 8) throw new Error(`${ruta}: ${profundidad} bits por canal, este lector sabe 8`);
      if (entrelazado !== 0) throw new Error(`${ruta}: entrelazado, este lector no sabe`);
      canales = { 0: 1, 2: 3, 4: 2, 6: 4 }[tipoColor];
      if (!canales) throw new Error(`${ruta}: tipo de color ${tipoColor}, este lector no sabe`);
    } else if (tipo === "IDAT") {
      trozos.push(datos);
    } else if (tipo === "IEND") {
      break;
    }
    pos += 12 + largo;
  }

  const crudo = zlib.inflateSync(Buffer.concat(trozos));
  const anchoFila = ancho * canales;
  const px = Buffer.alloc(alto * anchoFila);

  // Deshacer los filtros. Cada fila trae adelante su tipo de filtro, y todos
  // menos el 0 se calculan contra la fila anterior YA deshecha.
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (anchoFila + 1)];
    const entrada = y * (anchoFila + 1) + 1;
    const salida = y * anchoFila;
    for (let i = 0; i < anchoFila; i++) {
      const x = crudo[entrada + i];
      const a = i >= canales ? px[salida + i - canales] : 0;
      const b = y > 0 ? px[salida - anchoFila + i] : 0;
      const c = i >= canales && y > 0 ? px[salida - anchoFila + i - canales] : 0;
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`${ruta}: filtro ${filtro} en la fila ${y}`);
      px[salida + i] = v & 0xff;
    }
  }
  return { ancho, alto, canales, px };
}

const a = decodificar(bytesA, rutaA);
const b = decodificar(bytesB, rutaB);

if (a.ancho !== b.ancho || a.alto !== b.alto) {
  console.log(`NO COMPARABLES: la foto mide ${a.ancho}x${a.alto} y ${b.ancho}x${b.alto}.`);
  console.log("  Las fichas coincidían, así que esto es un desajuste del arnés: revisalo antes de seguir.");
  process.exit(2);
}

let distintos = 0;
let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
const filas = new Map();
for (let y = 0; y < a.alto; y++) {
  for (let x = 0; x < a.ancho; x++) {
    const i = (y * a.ancho + x) * a.canales;
    let igual = true;
    for (let c = 0; c < a.canales; c++) {
      if (a.px[i + c] !== b.px[i + c]) { igual = false; break; }
    }
    if (igual) continue;
    distintos++;
    filas.set(y, (filas.get(y) ?? 0) + 1);
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
}

if (distintos === 0) {
  console.log("IDÉNTICAS en píxeles (los bytes difieren: comprimieron distinto).");
  process.exit(0);
}

const total = a.ancho * a.alto;
console.log(`DISTINTAS: ${distintos} píxeles de ${total} (${((distintos / total) * 100).toFixed(2)} %).`);
console.log(`  la diferencia vive entre (${x0}, ${y0}) y (${x1}, ${y1}).`);

// Las filas más movidas dicen a qué ALTURA está la diferencia, que es lo que
// deja identificar qué bloque del formulario se movió sin abrir la imagen.
const peores = [...filas.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8);
console.log(`  filas con más diferencia: ${peores.map(([y, n]) => `y=${y} (${n}px)`).join(", ")}`);
process.exit(1);
