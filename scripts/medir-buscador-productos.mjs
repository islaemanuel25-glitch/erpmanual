// MIDE DÓNDE ARRANCA EL BUSCADOR DE PRODUCTOS, a un ancho dado.
//
// ── PARA QUÉ ────────────────────────────────────────────────────────────────
//
// El pedido del carrusel único incluye una condición que solo se puede contestar
// con un número: **que el buscador no haya bajado más que con el carrusel
// original**. "Se ve parecido" no la contesta, y deducirla restando la altura de
// los puntitos tampoco: eso sería explicar una diferencia en vez de medirla.
//
// Este arnés hace UNA cosa: abrir `/modulos/productos`, esperar a que el bloque
// de cards esté dibujado, y devolver la coordenada del borde superior del campo
// de búsqueda. Se corre contra dos árboles —el de referencia y el nuevo— y los
// dos números se comparan.
//
// ── POR QUÉ UN ARNÉS APARTE Y NO UNA AFIRMACIÓN MÁS ────────────────────────
//
// Porque el número de referencia sale de un COMMIT VIEJO, donde la sonda del
// carrusel no existe y no se puede agregar sin reescribir la historia. Lo único
// que este archivo necesita del árbol que mide es la pantalla, así que corre
// igual contra cualquiera de los dos.
//
// Y por eso mismo no afirma nada: imprime el número. Quién lo compara contra qué
// es del que lo corre — un tope escrito acá sería una referencia que nadie
// eligió.
//
// Uso:
//   node scripts/medir-buscador-productos.mjs \
//     --base http://localhost:3214 --usuario <mail> --clave <clave-de-desarrollo>

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));
const PUERTO = Number(arg("puerto-cdp", "9245"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "medir-buscador"));
const ETIQUETA = arg("etiqueta", BASE);

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

const edge = spawn(
  arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--disable-gpu"],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`ROJO · no se pudo medir: ${motivo}`);
  process.exit(1);
};

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
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: true,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });
  await navegar(`${BASE}/modulos/productos`);

  // Se espera a que las CARDS estén dibujadas, no a que la página cargue: el
  // bloque llega con los contadores, y medir antes daría la posición sin bloque
  // —que es más arriba y sería un número halagador y falso—.
  let listo = false;
  for (let i = 0; i < 90; i++) {
    await sleep(200);
    listo = await evaluar(
      `!!document.querySelector("section [class*='overflow-x-auto'] button[aria-pressed]")`
    );
    if (listo) break;
  }
  if (!listo) morir("las cards nunca se dibujaron: el número no sería del bloque");
  await sleep(800);

  const medida = JSON.parse(await evaluar(`(() => {
    const campo = document.querySelector('input[type="search"], input[placeholder*="uscar"], input[placeholder*="ombre"]');
    const secciones = [...document.querySelectorAll("section")].filter(
      (s) => s.querySelector("[class*='overflow-x-auto']") && s.querySelector("button[aria-pressed]")
    );
    return JSON.stringify({
      y: campo ? Math.round(campo.getBoundingClientRect().top + window.scrollY) : null,
      carruseles: secciones.length,
      cards: document.querySelectorAll("section button[aria-pressed]").length,
      titulos: [...document.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    });
  })()`));

  if (medida.y === null) morir("no se encontró el campo de búsqueda");

  console.log(
    `${ETIQUETA}  ·  buscador y=${medida.y} px  ·  carruseles=${medida.carruseles}  ·  ` +
      `cards=${medida.cards}  ·  desborde=${medida.desborde}  ·  títulos=${medida.titulos.join(" | ")}`
  );
} catch (err) {
  morir(err?.message || String(err));
}
process.exit(0);
