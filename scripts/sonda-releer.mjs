// SONDA: RELEER UN COMPROBANTE Y VER SI CIERRA.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Una lectura CUESTA: una llamada a la IA de la cuota diaria, y borra y vuelve
// a crear los renglones del comprobante. No es algo que se repita para probar.
// Cuando hace falta releer de verdad —porque cambió lo que se le pide al
// modelo— conviene hacerlo UNA vez, con el mismo pedido que manda el botón, y
// medir el resultado en el mismo acto.
//
// Esta sonda hace exactamente eso: toca "Leer de nuevo" por la API, con el
// origen declarado, y muestra qué quedó: el estado, la diferencia y los
// conceptos que leyó al pie.
//
// ── LO QUE NO HACE ────────────────────────────────────────────────────────
//
// No recibe el pedido, no toca costos y no reintenta. Una sola lectura por
// corrida, y si falla lo dice.
//
// Uso:
//   node --experimental-websocket scripts/sonda-releer.mjs \
//     --base https://operix.cloud --comprobante 17 --usuario x --clave y

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
const COMPROBANTE = Number(arg("comprobante", "0"));
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9371"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-releer"));

if (!USUARIO || !CLAVE || !COMPROBANTE) {
  console.error("Faltan --usuario, --clave o --comprobante.");
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

const navegador = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

console.log(`\n── RELEER EL COMPROBANTE ${COMPROBANTE} ──────────────────────────\n`);

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });

  console.log("  leyendo… (una llamada a la IA, puede tardar hasta 45 s)");

  // ── LA LECTURA CONTESTA UN TURNO, NO EL RESULTADO ────────────────────────
  //
  // Desde que cada lectura corre en su propio turno, el POST vuelve enseguida
  // con un número y el resultado se pide después. Sin esperarlo, esta sonda
  // informaría "ok" sobre una lectura que recién arrancó — o sea, verde sobre
  // nada.
  const r = await evaluar(
    `(async () => {
       const url = "/api/compras-proveedor/comprobantes/leer/${COMPROBANTE}";
       const a = await fetch(url, {
         method: "POST", credentials: "same-origin",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ origen: "BOTON" }),
       });
       let res = { status: a.status, cuerpo: await a.json().catch(() => null) };
       const turno = res.cuerpo && res.cuerpo.turno;
       if (res.cuerpo && res.cuerpo.leyendo && turno) {
         for (;;) {
           await new Promise((r) => setTimeout(r, 2000));
           const g = await fetch(url + "?turno=" + encodeURIComponent(turno), { cache: "no-store" });
           res = { status: g.status, cuerpo: await g.json().catch(() => null) };
           if (!res.cuerpo || !res.cuerpo.leyendo) break;
         }
       }
       return JSON.stringify(res);
     })()`,
    true
  );
  const res = JSON.parse(r);
  console.log(`  respuesta: ${res.status}`);
  console.log(`  ${JSON.stringify(res.cuerpo).slice(0, 700)}`);
  process.exit(res.cuerpo?.ok ? 0 : 1);
} catch (e) {
  console.error(`\nROJO · no se pudo releer: ${e?.message || e}`);
  process.exit(1);
}
