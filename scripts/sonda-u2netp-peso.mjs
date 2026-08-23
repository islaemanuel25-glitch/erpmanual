// SONDA: ¿CUÁNTO BAJA DE VERDAD UN TELÉFONO LA PRIMERA VEZ QUE QUITA UN FONDO?
//
// ── POR QUÉ EL 7,7 MB QUE ESTABA ESCRITO NO ERA EL TOTAL ──────────────────
//
// Ese número son los dos BINARIOS —el modelo y el `.wasm`— medidos con `stat` y
// `gzip -9` sobre los archivos del repo. Es correcto y está incompleto: el
// import dinámico de `onnxruntime-web` también trae JavaScript, y ese JavaScript
// el navegador lo tiene que bajar igual. Contar solo los binarios subestima la
// primera carga, que es exactamente el número con el que se decidió adoptar el
// motor.
//
// ── LO QUE SE MIDE, Y CON QUÉ ─────────────────────────────────────────────
//
// Resource Timing, que es lo que el navegador dice que bajó de verdad:
//
//   · `transferSize` — bytes que viajaron, con cabeceras y ya comprimidos. Es
//     el número que le importa a alguien con datos móviles.
//   · `encodedBodySize` — el cuerpo comprimido, sin cabeceras.
//   · `decodedBodySize` — lo que ocupa una vez descomprimido.
//
// Se separa en tres cubetas, porque mezclarlas es lo que llevó al número viejo:
//
//   · RECURSOS DE IA — el `.onnx` y el `.wasm`, o sea `/modelos/u2netp/`.
//   · JS DEL RUNTIME — los trozos de JavaScript que aparecen recién cuando se
//     toca una foto. Se identifican por diferencia: se fotografía qué recursos
//     hay ANTES de meter la imagen y se mira qué apareció DESPUÉS.
//   · TODO LO DEMÁS — lo que ya estaba, que no lo provoca quitar el fondo.
//
// ── Y DESPUÉS, LA SEGUNDA VEZ ─────────────────────────────────────────────
//
// Con el caché caliente se recarga y se vuelve a recortar. Lo que vuelva por red
// ahí es el costo recurrente. El de los binarios tiene que ser CERO, porque los
// tiene la Cache API; el del JS no necesariamente, porque de eso se ocupa la
// caché HTTP del navegador y no nosotros. Los dos números se informan por
// separado en vez de sumarlos, que es lo que haría perder el dato.
//
// Uso:
//   node scripts/sonda-u2netp-peso.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>
//
// OJO CON EL SERVIDOR DE DESARROLLO: `next dev` no comprime y parte el JS en
// muchos más trozos que el build de producción. Para un número que se parezca al
// del teléfono hay que medir contra `next build && next start`. La sonda avisa
// contra cuál está midiendo y lo escribe en la salida.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9255"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-u2netp-peso"));
const SALIDA = arg("salida", null);

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });

let ws, sessionId, id = 0;
const pending = new Map();
const send = (metodo, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method: metodo, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

async function esperarA(expresion, cuantoMs = 90000, cada = 500) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {}
    await sleep(cada);
  }
  return false;
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=390,844",
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  process.exit(1);
};

const PINTA = `(x, y) => (x >= 20 && x <= 39 && y >= 20 && y <= 39) ? [30, 60, 180] : [240, 240, 240]`;

const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

/**
 * Los recursos que hay ahora, con su peso. `transferSize` en 0 con un cuerpo
 * presente significa que salió de la caché del navegador y no viajó.
 */
const recursos = () =>
  evaluar(
    `JSON.stringify(performance.getEntriesByType("resource").map((e) => ({
       url: e.name,
       transfer: e.transferSize || 0,
       encoded: e.encodedBodySize || 0,
       decoded: e.decodedBodySize || 0,
     })))`
  );

function sumar(lista) {
  return lista.reduce(
    (a, r) => ({
      transfer: a.transfer + r.transfer,
      encoded: a.encoded + r.encoded,
      decoded: a.decoded + r.decoded,
      n: a.n + 1,
    }),
    { transfer: 0, encoded: 0, decoded: 0, n: 0 }
  );
}

const esIA = (url) => url.includes("/modelos/u2netp/");
const esJS = (url) => /\.m?js(\?|$)/.test(url) || url.includes("/_next/static/chunks/");

console.log(`\n── PESO REAL DE LA PRIMERA VEZ QUE SE QUITA UN FONDO ─────────────\n`);
console.log(`  base: ${BASE}`);
console.log(`  perfil limpio: ${PERFIL}\n`);

const informe = { base: BASE };

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__respaldos = 0;
      const _warn = console.warn;
      console.warn = (...a) => {
        try { if (String(a[0] || "").includes("[quitarFondo]")) window.__respaldos++; } catch {}
        return _warn.apply(console, a);
      };
      // El buffer por defecto son 250 entradas y una pantalla de Next las llena.
      try { performance.setResourceTimingBufferSize(1000); } catch {}
      window.__pintar = async (n, pinta) => {
        const c = document.createElement("canvas");
        c.width = n; c.height = n;
        const ctx = c.getContext("2d");
        const img = ctx.createImageData(n, n);
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const col = pinta(x, y);
            const o = (y * n + x) * 4;
            img.data[o] = col[0]; img.data[o+1] = col[1]; img.data[o+2] = col[2]; img.data[o+3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const b = await new Promise((r) => c.toBlob(r, "image/png"));
        return new File([b], "caso.png", { type: "image/png" });
      };
    `,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  const idProducto = await evaluar(
    `fetch("/api/productos/listar?page=1&pageSize=1", { credentials: "include" })
       .then((r) => r.json()).then((j) => (j.items || [])[0]?.id ?? null)`,
    true
  );
  if (!idProducto) morir("no hay ningún producto en estos datos");
  console.log(`  producto de prueba: ${idProducto}\n`);

  // ── PRIMERA CARGA ────────────────────────────────────────────────────────
  await navegar(`${BASE}/modulos/productos/editar/${idProducto}`);
  if (!(await esperarA(`Boolean(document.querySelector('input[type="file"][accept="image/*"]'))`, 30000))) {
    morir("la ficha no dibujó la carga de foto");
  }

  // LA FOTO DE ANTES. Sin esto no hay forma de saber qué JS lo trajo quitar el
  // fondo y qué JS ya estaba: sumar todo el JS de la página diría cualquier cosa.
  const antes = JSON.parse(await recursos());
  const urlsAntes = new Set(antes.map((r) => r.url));
  console.log(`  la pantalla, antes de tocar nada: ${antes.length} recursos, ${mb(sumar(antes).transfer)} transferidos\n`);

  await evaluar(
    `(async () => {
       const inp = document.querySelector('input[type="file"][accept="image/*"]');
       const f = await window.__pintar(60, ${PINTA});
       const dt = new DataTransfer();
       dt.items.add(f);
       inp.files = dt.files;
       inp.dispatchEvent(new Event("change", { bubbles: true }));
       return true;
     })()`,
    true
  );
  if (!(await esperarA(`Boolean(document.querySelector('[data-foto-vista-sin-fondo]'))`, 300000))) {
    morir("no salió el recorte: sin recorte no hay nada que medir");
  }
  const respaldos = await evaluar(`window.__respaldos || 0`);
  if (respaldos > 0) {
    morir(`cayó al motor por bordes (${respaldos}): estaría midiendo el peso de NO usar u2netp`);
  }

  const despues = JSON.parse(await recursos());
  const nuevos = despues.filter((r) => !urlsAntes.has(r.url));

  const ia = nuevos.filter((r) => esIA(r.url));
  const js = nuevos.filter((r) => esJS(r.url) && !esIA(r.url));
  const otros = nuevos.filter((r) => !esIA(r.url) && !esJS(r.url));

  const sIA = sumar(ia);
  const sJS = sumar(js);
  const sOtros = sumar(otros);
  const sTodo = sumar(nuevos);

  console.log("── PRIMERA VEZ · lo que apareció al quitar el fondo ───────────────\n");
  console.log(`  recursos de IA        ${String(sIA.n).padStart(3)} archivos   ${mb(sIA.transfer).padStart(10)} transferidos   ${mb(sIA.decoded)} sin comprimir`);
  for (const r of ia) console.log(`      ${new URL(r.url).pathname}  ${mb(r.transfer)}`);
  console.log(`  JS del runtime        ${String(sJS.n).padStart(3)} archivos   ${mb(sJS.transfer).padStart(10)} transferidos   ${mb(sJS.decoded)} sin comprimir`);
  for (const r of js) console.log(`      ${new URL(r.url).pathname}  ${kb(r.transfer)}`);
  if (sOtros.n) {
    console.log(`  otros                 ${String(sOtros.n).padStart(3)} archivos   ${mb(sOtros.transfer).padStart(10)} transferidos`);
    for (const r of otros) console.log(`      ${new URL(r.url).pathname}  ${kb(r.transfer)}`);
  }
  console.log(`  ${"─".repeat(62)}`);
  console.log(`  TOTAL DE PRIMERA UTILIZACIÓN        ${mb(sTodo.transfer).padStart(10)} transferidos\n`);

  informe.primera = {
    ia: sIA, js: sJS, otros: sOtros, total: sTodo,
    archivosIA: ia.map((r) => ({ url: new URL(r.url).pathname, transfer: r.transfer, decoded: r.decoded })),
    archivosJS: js.map((r) => ({ url: new URL(r.url).pathname, transfer: r.transfer, decoded: r.decoded })),
  };

  // ── SEGUNDA CARGA, CON EL CACHÉ CALIENTE ─────────────────────────────────
  await navegar(`${BASE}/modulos/productos/editar/${idProducto}`);
  await esperarA(`Boolean(document.querySelector('input[type="file"][accept="image/*"]'))`, 30000);
  await evaluar(
    `(async () => {
       const inp = document.querySelector('input[type="file"][accept="image/*"]');
       const f = await window.__pintar(60, ${PINTA});
       const dt = new DataTransfer();
       dt.items.add(f);
       inp.files = dt.files;
       inp.dispatchEvent(new Event("change", { bubbles: true }));
       return true;
     })()`,
    true
  );
  if (!(await esperarA(`Boolean(document.querySelector('[data-foto-vista-sin-fondo]'))`, 180000))) {
    morir("en la segunda visita no salió ningún recorte");
  }
  const respaldos2 = await evaluar(`window.__respaldos || 0`);

  const seg = JSON.parse(await recursos());
  const segIA = seg.filter((r) => esIA(r.url));
  const segJS = seg.filter((r) => esJS(r.url));
  const sSegIA = sumar(segIA);
  const sSegJS = sumar(segJS);
  const sSegTodo = sumar(seg);

  console.log("── SEGUNDA VEZ · página recargada, caché caliente ─────────────────\n");
  console.log(`  respaldos: ${respaldos2}  (tiene que ser 0: si no, esto mide el motor de bordes)`);
  console.log(`  recursos de IA        ${String(sSegIA.n).padStart(3)} pedidos    ${mb(sSegIA.transfer).padStart(10)} transferidos`);
  console.log(`  JS                    ${String(sSegJS.n).padStart(3)} pedidos    ${mb(sSegJS.transfer).padStart(10)} transferidos`);
  console.log(`  ${"─".repeat(62)}`);
  console.log(`  TOTAL QUE VUELVE POR RED            ${mb(sSegTodo.transfer).padStart(10)} transferidos\n`);

  informe.segunda = { ia: sSegIA, js: sSegJS, total: sSegTodo, respaldos: respaldos2 };

  if (SALIDA) {
    fs.writeFileSync(SALIDA, JSON.stringify(informe, null, 2));
    console.log(`  informe escrito en ${SALIDA}\n`);
  }
} catch (e) {
  morir(e?.message || String(e));
} finally {
  try { edge.kill(); } catch {}
}

console.log("VERDE · medido. Los números de arriba son de ESTE servidor; para el número");
console.log("        del teléfono hay que medir contra un build de producción.");
process.exit(0);
