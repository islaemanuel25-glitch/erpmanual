// SONDA: ¿SE VE DÓNDE ESTÁ EL FOCO CUANDO SE NAVEGA CON TECLADO?
//
//   node scripts/sonda-foco-boton.mjs --base http://localhost:3111
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// `app/globals.css` tiene esto, para TODO botón de la aplicación:
//
//   button:focus { outline: none !important; box-shadow: none !important; }
//
// Y `styles/sunmi.css` tiene el anillo de foco del kit, SIN `!important`:
//
//   .sunmi-btn:focus-visible { box-shadow: 0 0 0 2px …; }
//
// Leyendo, el primero le gana al segundo y ningún botón mostraría dónde está el
// foco. Pero eso es un razonamiento de especificidad con `!important` y
// `:focus-visible` de por medio, que es exactamente donde uno se equivoca. Se
// mide.
//
// Se prueban tres: un `<button>` pelado, uno del kit —`sunmi-btn`—, y la tarjeta
// entera como botón, que es el patrón de `TarjetaOferta`. El foco se pone con
// `.focus()`, y además se comprueba `:focus-visible` con `matches`, porque un
// foco puesto por código no siempre lo activa.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Esta sonda INFORMA, no falla: lo que mide es el estado actual del repo, que ya
// se sabe que puede ser malo. Sale con 0 salvo que no pueda medir.

import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9229"));
const PERFIL = path.join(tmpdir(), "sonda-foco-boton");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, sessionId, id = 0;
const pending = new Map();
const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

const cerrar = () => { try { ws?.close(); } catch {} try { navegador.kill(); } catch {} };

function frenar(motivo) {
  console.error(`\nLA SONDA NO PUDO MEDIR: ${motivo}`);
  cerrar();
  process.exit(1);
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
  frenar("el navegador no respondió al puerto de depuración");
}

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const navegador = spawn(
  EDGE,
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"],
  { stdio: "ignore" }
);
process.on("exit", cerrar);
process.on("SIGINT", () => { cerrar(); process.exit(130); });

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
await send("Page.navigate", { url: `${BASE}/login` });

let lista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    lista = await evaluar(`document.readyState === "complete" && !!document.querySelector("button")`);
  } catch {}
  if (lista) break;
}
if (!lista) frenar("la página no llegó a tener un botón");

const CASOS = [
  { nombre: "<button> pelado", clases: "" },
  { nombre: "botón del kit (sunmi-btn)", clases: "sunmi-btn sunmi-btn-cyan" },
  { nombre: "tarjeta entera como botón (TarjetaOferta)", clases: "w-full text-left sunmi-panel rounded-lg p-3 flex flex-col gap-1.5" },
];

const medido = await evaluar(`(() => {
  const casos = ${JSON.stringify(CASOS)};
  const salida = [];
  for (const c of casos) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = c.clases;
    b.textContent = "foco";
    document.body.append(b);
    b.focus();
    const s = getComputedStyle(b);
    salida.push({
      nombre: c.nombre,
      enfocado: document.activeElement === b,
      focusVisible: (() => { try { return b.matches(":focus-visible"); } catch { return null; } })(),
      outline: s.outlineStyle + " " + s.outlineWidth + " " + s.outlineColor,
      boxShadow: s.boxShadow,
    });
    b.blur();
    b.remove();
  }
  return JSON.stringify(salida);
})()`);

console.log("\n  ══ foco visible ═══════════════════════════════════════════");
let sinSenal = 0;
for (const r of JSON.parse(medido)) {
  const hayAnillo = r.boxShadow !== "none" || !/none/.test(r.outline);
  if (!hayAnillo) sinSenal += 1;
  console.log(`  ${r.nombre}`);
  console.log(`     enfocado ${r.enfocado} · :focus-visible ${r.focusVisible}`);
  console.log(`     outline    ${r.outline}`);
  console.log(`     box-shadow ${r.boxShadow}`);
  console.log(`     ${hayAnillo ? "→ SE VE dónde está el foco" : "→ NO se ve dónde está el foco"}`);
}

console.log("");
if (sinSenal) {
  console.log(`  ${sinSenal} de 3 no muestran señal de foco.`);
  console.log("  Causa leída en la hoja: app/globals.css declara");
  console.log("    button:focus { outline: none !important; box-shadow: none !important }");
  console.log("  y el anillo del kit —.sunmi-btn:focus-visible— no lleva !important, así que pierde.");
} else {
  console.log("  Los tres muestran señal de foco.");
}

cerrar();
process.exit(0);
