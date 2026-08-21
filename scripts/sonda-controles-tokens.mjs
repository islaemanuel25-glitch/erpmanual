// SONDA: los tokens semánticos de "Para revisar", medidos en los CATORCE temas.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El bloque de controles pinta su número y su borde con `--success-fg`,
// `--warning-fg` y `--danger-fg`, los tokens semánticos generales del ERP, sobre
// el fondo de tarjeta `--card-bg`.
//
// Esos cuatro tokens NO están definidos en los catorce temas: ocho los
// sobrescriben y cuatro —`sunmiDark` y su `:not([data-theme])`, `sunmiDarkCompact`,
// `sunmiGraphite` y `sunmiBlueClassic`— heredan los de `:root`, que están pensados
// para fondo oscuro. Que hereden no es un problema por sí solo; el problema sería
// que en alguno el número quede ilegible, y eso no se puede saber leyendo el CSS:
// hay que resolver las variables como las resuelve el navegador y medir.
//
// Es el mismo procedimiento con el que se derivó `--pos-warning` y
// `--card-elevacion`, y por el mismo motivo: un color que "se ve bien" en el tema
// que uno tiene puesto puede ser ilegible en otro, y nadie abre los catorce.
//
// ── EL UMBRAL ──────────────────────────────────────────────────────────────
//
// 3,0, que es el mínimo de WCAG 1.4.11 para algo que no es texto de párrafo. El
// número de la card es texto grande y en negrita —17,5 px bold, que entra en la
// excepción de "large text" de 3,0— y el borde es un componente de interfaz, que
// también pide 3,0. Es el mismo umbral con el que se midió la elevación de la
// tarjeta de producto.
//
// ── SI NO PUEDE MEDIR, ES ROJO ─────────────────────────────────────────────
//
// Mismo criterio que las otras dos sondas. Un tema que no se pudo aplicar o una
// variable que resolvió vacía no son "no se pudo comprobar": son rojo, porque el
// desconocido se convierte solo en "supongo que sí".
//
// Uso:
//   node scripts/sonda-controles-tokens.mjs --base http://localhost:3111
//
// NO necesita sesión: las variables las sirve el layout raíz, así que mide sobre
// `/login` y no gasta intentos del límite de login.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-controles-tokens"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const MINIMO = Number(arg("minimo", "3"));

// Los catorce, tal como los nombra `SunmiThemeProvider`. `null` es el default,
// que es el `html:not([data-theme])` — uno de los cuatro que heredan de `:root`.
const TEMAS = [
  null,
  "sunmiDark",
  "sunmiDarkCompact",
  "sunmiLight",
  "sunmiGraphite",
  "sunmiSand",
  "sunmiBlueClassic",
  "sunmiFrance",
  "sunmiFranceSplit",
  "operixBluePro",
  "operixNight",
  "verdeComercio",
  "grafitoEjecutivo",
  "ambarCaja",
  "violetaSaas",
];

// Los tres de salud, con el rol que representan. El neutro y el acento no entran:
// no son semántica de salud y no los toca este guardrail.
const TOKENS = [
  { rol: "success", token: "--success-fg" },
  { rol: "warning", token: "--warning-fg" },
  { rol: "danger", token: "--danger-fg" },
];
const FONDO = "--card-bg";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    console.log(`        ${detalle}`);
  }
};

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

// Contraste relativo de WCAG. Se calcula acá y no en la página para que el umbral
// viva en un solo lugar.
const luminancia = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};

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

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

try {
  const { default: WS } = await import("ws").catch(() => ({ default: null }));
  if (!WS) morir("falta el paquete `ws`");
  ws = new WS(await urlDepurador(), { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });

  const { targetInfos } = await send("Target.getTargets", {}, false);
  const page = targetInfos.find((t) => t.type === "page");
  ({ sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true }, false));
  await send("Page.enable");
  await send("Runtime.enable");

  await send("Page.navigate", { url: `${BASE}/login` });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete"`)) break;
  }

  console.log(`\nmidiendo ${TOKENS.length} tokens de salud en ${TEMAS.length} temas · mínimo ${MINIMO}\n`);

  const peorPorToken = new Map(TOKENS.map((t) => [t.token, { valor: Infinity, tema: null }]));

  for (const tema of TEMAS) {
    // ── EL TEMA SE APLICA COMO LO APLICA EL DISPOSITIVO ────────────────────
    //
    // Poniendo el atributo en `<html>`, que es lo que hace `SunmiThemeProvider`.
    // Acá alcanza —y no vale la advertencia de las capturas— porque lo único que
    // se mide son VARIABLES CSS, que dependen del selector y no del objeto que
    // React reparte. No se mide ninguna clase de Tailwind.
    await evaluar(
      tema
        ? `document.documentElement.setAttribute("data-theme", ${JSON.stringify(tema)})`
        : `document.documentElement.removeAttribute("data-theme")`
    );
    await sleep(120);

    const medido = await evaluar(`(() => {
      const cs = getComputedStyle(document.documentElement);
      const leer = (v) => cs.getPropertyValue(v).trim();
      const aRGB = (valor) => {
        const d = document.createElement("div");
        d.style.color = valor;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const salida = { tema: document.documentElement.getAttribute("data-theme") };
      for (const v of ${JSON.stringify([FONDO, ...TOKENS.map((t) => t.token)])}) {
        const crudo = leer(v);
        salida[v] = { crudo, resuelto: crudo ? aRGB(crudo) : "" };
      }
      return salida;
    })()`);

    const fondoCrudo = medido[FONDO];
    if (!fondoCrudo?.crudo) {
      morir(`el tema ${tema || "(default)"} no define ${FONDO}: no hay contra qué medir`);
    }
    const fondo = (fondoCrudo.resuelto.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

    const partes = [];
    for (const { rol, token } of TOKENS) {
      const t = medido[token];
      if (!t?.crudo) {
        morir(`el tema ${tema || "(default)"} deja ${token} sin valor: no hay nada que medir`);
      }
      const color = (t.resuelto.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const c = contraste(color, fondo);
      partes.push(`${rol} ${c.toFixed(2)}`);
      const peor = peorPorToken.get(token);
      if (c < peor.valor) peorPorToken.set(token, { valor: c, tema: tema || "(default)" });
    }
    console.log(`  ${String(tema || "(default)").padEnd(20)} ${partes.join("  ")}`);
  }

  console.log("");
  for (const { rol, token } of TOKENS) {
    const peor = peorPorToken.get(token);
    afirmar(
      peor.valor >= MINIMO,
      `${token} (${rol}) legible en los ${TEMAS.length} temas · peor caso ${peor.valor.toFixed(2)} en ${peor.tema}`,
      `mínimo ${MINIMO}`
    );
  }
} catch (e) {
  morir(e.message);
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} token(s) de salud no llegan al mínimo de contraste.`);
  process.exit(1);
}
console.log("VERDE · los tres tokens de salud se leen en los catorce temas.");
process.exit(0);
