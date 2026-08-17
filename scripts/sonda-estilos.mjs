// scripts/sonda-estilos.mjs
//
// LOS ESTILOS CALCULADOS DE UN ELEMENTO, PROPIEDAD POR PROPIEDAD.
//
// ── PARA QUÉ ────────────────────────────────────────────────────────────────
//
// Para partir una clase del kit en sub-clases y poder afirmar que el efecto
// quedó IDÉNTICO. No "se ve igual" ni "compila": las 340 y pico de propiedades
// que el navegador calcula, comparadas una por una entre el antes y el después.
//
// Es lo que le faltaba al arnés. `medir-desborde.mjs` fotografía, y una foto
// prueba que la pantalla no se movió en los píxeles que se ven; no prueba que
// `transition` o `cursor` sigan valiendo lo mismo, porque eso no sale en la foto.
//
// ── LA MITAD QUE NO SE PUEDE SALTEAR ────────────────────────────────────────
//
// **Dos listas de propiedades idénticas no prueban nada por sí solas.** Si el
// selector no matchea —porque la clase se escribió mal, porque la hoja no cargó,
// porque el elemento se inyectó en una página equivocada—, los dos lados dan el
// MISMO valor por defecto del navegador y la comparación sale perfecta.
//
// Por eso esta sonda mide SIEMPRE al menos dos clases y el que la usa tiene que
// pasarle un CONTROL que debe dar DISTINTO. Si el control no difiere, la corrida
// no vale y hay que decirlo — es la misma regla que el grep vacío del marcador de
// despliegue: un vacío solo significa algo si la misma búsqueda encuentra algo
// cuando tiene que encontrarlo.
//
// Uso:
//   node scripts/sonda-estilos.mjs --base http://localhost:3000 \
//     --clases "sunmi-btn-base" --clases "sunmi-btn-nucleo sunmi-btn-pad-y" \
//     --etiqueta button --salida /tmp/antes.json
//
// Cada `--clases` es una muestra. La salida es un JSON con una entrada por
// muestra; compararlas es trabajo de quien lo corre —o de `--comparar`, que
// resta dos archivos y dice qué propiedades difieren—.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i > -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : args.includes(`--${n}`) ? true : d;
};
const todos = (n) => args.map((a, i) => (a === `--${n}` ? args[i + 1] : null)).filter(Boolean);

// ── MODO COMPARAR: no necesita navegador ───────────────────────────────────
if (arg("comparar")) {
  const [a, b] = [arg("comparar"), args[args.indexOf("--comparar") + 2]];
  if (!b) {
    console.error("Uso: --comparar <antes.json> <despues.json>");
    process.exit(2);
  }
  const A = JSON.parse(fs.readFileSync(a, "utf8"));
  const B = JSON.parse(fs.readFileSync(b, "utf8"));
  const nombres = [...new Set([...Object.keys(A.muestras), ...Object.keys(B.muestras)])];
  let rojo = false;
  for (const n of nombres) {
    const x = A.muestras[n], y = B.muestras[n];
    if (!x || !y) { console.log(`  ${n}: solo está en uno de los dos archivos`); rojo = true; continue; }
    const props = [...new Set([...Object.keys(x), ...Object.keys(y)])].sort();
    const dif = props.filter((p) => x[p] !== y[p]);
    if (!dif.length) console.log(`  IDÉNTICO  "${n}"  (${props.length} propiedades)`);
    else {
      rojo = true;
      console.log(`  DIFIEREN  "${n}"  en ${dif.length} de ${props.length}:`);
      for (const p of dif.slice(0, 20)) console.log(`      ${p}: ${x[p]}  →  ${y[p]}`);
      if (dif.length > 20) console.log(`      … y ${dif.length - 20} más`);
    }
  }
  process.exit(rojo ? 1 : 0);
}

const BASE = arg("base", "http://localhost:3000");
const RUTA = arg("url", "/login");
const ETIQUETA = arg("etiqueta", "button");
const SALIDA = arg("salida", null);
const PUERTO = Number(arg("puerto-cdp", "9229"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), `sonda-estilos-edge-${PUERTO}`));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const MUESTRAS = todos("clases");

if (!MUESTRAS.length) {
  console.error("Falta al menos un --clases \"…\".");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, sessionId, id = 0;
const pendientes = new Map();

function send(method, params = {}, conSesion = true) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pendientes.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Edge no respondió al puerto ${PUERTO}`);
}

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=1366,900", "--no-first-run", "--no-default-browser-check", "--disable-gpu",
], { stdio: "ignore" });
const cerrar = () => { try { edge.kill(); } catch {} };
process.on("exit", cerrar);

ws = new WebSocket(await urlDepurador());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) {
    const p = pendientes.get(m.id);
    pendientes.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
sessionId = sid;
await send("Page.enable");
await send("Runtime.enable");

console.log(`sonda de estilos — ${BASE}${RUTA}`);
await send("Page.navigate", { url: String(BASE) + String(RUTA) });

// Se espera a que la hoja del kit esté puesta, no a que pase un tiempo. Sin CSS,
// todas las muestras dan el default del navegador y salen todas iguales.
let lista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    lista = await evaluar(`(() => {
      if (document.readyState !== "complete") return false;
      for (const h of document.styleSheets) {
        let r; try { r = h.cssRules; } catch { continue; }
        for (const x of r) if (x.selectorText && x.selectorText.includes(".sunmi-btn")) return true;
      }
      return false;
    })()`);
  } catch {}
  if (lista) break;
}
if (!lista) {
  console.log("ROJO · la hoja no tiene ninguna regla `.sunmi-btn`. No se mide nada:");
  console.log("  sin CSS todas las muestras darían el mismo default y saldrían idénticas.");
  cerrar();
  process.exit(1);
}

const medido = await evaluar(`(() => {
  const muestras = ${JSON.stringify(MUESTRAS)};
  const salida = {};
  for (const clases of muestras) {
    const el = document.createElement(${JSON.stringify(ETIQUETA)});
    el.className = clases;
    el.textContent = "Aa";
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const m = {};
    for (let i = 0; i < cs.length; i++) {
      const p = cs.item(i);
      m[p] = cs.getPropertyValue(p);
    }
    salida[clases] = m;
    el.remove();
  }
  return salida;
})()`);

const doc = { base: BASE, ruta: RUTA, etiqueta: ETIQUETA, muestras: medido };
const cuantas = Object.keys(medido).length;
const props = Object.keys(medido[MUESTRAS[0]]).length;
console.log(`  ${cuantas} muestras · ${props} propiedades cada una`);
for (const clases of MUESTRAS) {
  const m = medido[clases];
  console.log(`  "${clases}"`);
  // Longhands y no atajos: `getComputedStyle` enumera las longhands, así que
  // `m.padding` y `m["border-radius"]` salen `undefined` y se leen como "no lo
  // pone nadie" cuando en realidad la sonda estaba preguntando por el nombre
  // equivocado. Pasó en la primera corrida.
  console.log(
    `      min-height ${m["min-height"]} · display ${m.display} · align-items ${m["align-items"]}` +
      ` · padding ${m["padding-top"]} ${m["padding-right"]} ${m["padding-bottom"]} ${m["padding-left"]}` +
      ` · font ${m["font-size"]}/${m["font-weight"]} · radius ${m["border-top-left-radius"]} · cursor ${m.cursor}`
  );
}

if (SALIDA) {
  fs.mkdirSync(path.dirname(path.resolve(SALIDA)), { recursive: true });
  fs.writeFileSync(path.resolve(SALIDA), JSON.stringify(doc, null, 1));
  console.log(`  escrito en ${SALIDA}`);
}
cerrar();
process.exit(0);
