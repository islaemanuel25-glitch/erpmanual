// SONDA: QUÉ TIRA LA CONSOLA AL ABRIR UNA PANTALLA.
//
// Un "Application error: a client-side exception has occurred" no deja rastro
// en el log del servidor: la respuesta salió 200 y el que explotó fue el
// navegador. Esta sonda abre las URLs que se le den, escucha la consola y los
// errores no atrapados, y dice qué se rompió y dónde.
//
// Uso:
//   node --experimental-websocket scripts/sonda-consola.mjs \
//     --base https://operix.cloud --urls "/a,/b" --usuario x --clave y

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3111");
const URLS = (arg("urls", "/modulos/compras-proveedor/232")).split(",");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9341"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-consola"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo });
    console.log(`        ${detalle}`);
  }
};

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
  throw new Error("El navegador no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion, returnByValue: true, awaitPromise: esperaPromesa,
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

async function esperarA(expresion, cuantoMs = 60000, cada = 250) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try { if (await evaluar(expresion)) return true; } catch {}
    await sleep(cada);
  }
  return false;
}

const navegador = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=360,640", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

const problemas = [];

console.log(`\n── QUÉ DICE LA CONSOLA ───────────────────────────────────────────\n`);

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      return;
    }
    // Los eventos que importan: consola y excepciones sin atrapar.
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params?.type)) {
      const texto = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
      if (texto.trim()) problemas.push({ tipo: m.params.type, texto: texto.slice(0, 600) });
    }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params?.exceptionDetails;
      problemas.push({
        tipo: "excepcion",
        texto: (d?.exception?.description || d?.text || "").slice(0, 900),
      });
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });

  for (const u of URLS) {
    problemas.length = 0;
    await navegar(`${BASE}${u}`);
    await sleep(6000);
    const rota = await evaluar(`/Application error|client-side exception/i.test(document.body.innerText || "")`);
    const texto = await evaluar(`(document.body.innerText || "").slice(0, 120)`);
    console.log(`${rota ? "ROTA " : "OK   "} ${u}`);
    if (rota) console.log(`       pantalla: ${JSON.stringify(texto)}`);
    for (const p of problemas.slice(0, 4)) {
      console.log(`       [${p.tipo}] ${p.texto.split("\n").slice(0, 6).join(" | ")}`);
    }
  }
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
