// SONDA: QUÉ LE HACE LA HOJA A LAS CLASES DEL COBRO, ANTES Y DESPUÉS.
//
//   node scripts/sonda-importe-pos.mjs --base http://localhost:3111
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// `styles/sunmi.css` tiene una regla compuesta que agranda el importe del total
// un 50 %:
//
//   .pos-text-accent.font-black { font-size: 3.375rem !important }
//   @media (min-width:1024px)   { font-size: 4.5rem !important }
//
// El comentario que la acompaña dice, textual, «el div que combina
// .pos-text-accent + .font-black (unico del total)». Esa premisa era cierta
// cuando se escribió. Hoy en `FormaPago.jsx` hay CUATRO elementos que combinan
// las dos clases, así que la regla los agranda a todos —incluido un importe
// pensado como `text-base`—.
//
// Esto no se puede contestar leyendo: hay que preguntarle al navegador qué
// tamaño calcula. Y no se puede contestar con una captura de la pantalla de
// cobro, porque tres de los cuatro solo aparecen con una venta armada y ciertos
// medios configurados.
//
// ── POR QUÉ SE MIDE SOBRE ELEMENTOS SINTÉTICOS, Y POR QUÉ ES FIEL ──────────
//
// Se crean nodos reales con EXACTAMENTE la cadena de clases que tiene el JSX, se
// adjuntan al documento y se lee `getComputedStyle`. Es la misma técnica de
// `sonda-cascada.mjs`, y es fiel para lo que se pregunta: los tamaños de esta
// hoja están en `rem` —relativos a la raíz, no al padre— y el color sale de una
// variable de tema, así que ninguno depende de dónde esté el nodo en el árbol.
//
// Lo que NO contesta: si el bloque entra en la pantalla, si desborda o si tapa
// algo. Eso necesita la pantalla de cobro con una venta real y queda dicho.
//
// Cada caso trae su cadena de ANTES y la de DESPUÉS, y se miden las dos en la
// misma corrida. Así la comparación no depende de acordarse de correr la sonda
// dos veces sobre dos ramas distintas.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO. Que la hoja no cargue o que el navegador no
// levante no son "no se pudo comprobar".

import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const RUTA = arg("url", "/login");
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9227"));
const PERFIL = path.join(tmpdir(), "sonda-importe-pos");
const ANCHOS = (arg("anchos", "390,1280") || "").split(",").map((n) => Number(n.trim()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Los elementos del cobro que están en discusión, con la cadena de clases TAL
 * CUAL la tiene el JSX y la que tendría después de migrar.
 *
 * Las cadenas se copian enteras a propósito: medir solo `pos-text-accent` no
 * contestaría nada, porque lo que decide el tamaño es la COMBINACIÓN.
 */
const CASOS = [
  {
    nombre: "FormaPago:380  total a cobrar",
    antes: "text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight",
    despues: "text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight",
    nota: "NO se migra: es el elemento para el que se escribió la regla",
  },
  {
    nombre: "FormaPago:374  total según el medio",
    antes: "text-2xl lg:text-3xl font-black pos-text-accent mt-1 tabular-nums tracking-tight",
    despues: "text-2xl lg:text-3xl font-black sunmi-text-accent mt-1 tabular-nums tracking-tight",
  },
  {
    nombre: "FormaPago:445  importe por medio",
    antes: "text-base font-black pos-text-accent tabular-nums leading-tight",
    despues: "text-base font-black sunmi-text-accent tabular-nums leading-tight",
  },
  {
    nombre: "FormaPago:281  aviso de mínimo",
    antes: "px-2 py-1.5 rounded-lg text-xs text-center font-medium pos-text-accent",
    despues: "px-2 py-1.5 rounded-lg text-xs text-center font-medium sunmi-text-accent",
  },
  {
    nombre: "FormaPago:274  total dividido",
    antes: "text-xl font-black pos-text-accent tabular-nums",
    despues: "text-xl font-black pos-text-accent tabular-nums",
    nota: "NO se migra en esta tanda: es deuda anterior a la línea de base",
  },
  {
    nombre: "CarritoVenta:458  precio tachado",
    antes: "block text-xs2 pos-text-muted truncate",
    despues: "block text-xs2 sunmi-text-muted truncate",
  },
  {
    nombre: "CarritoVenta:464  nombre de lista (ya migrado)",
    antes: "block text-[10px] sunmi-text-muted truncate",
    despues: "block text-[10px] sunmi-text-muted truncate",
    nota: "referencia: su vecino de celda, ya en el sistema general",
  },
  {
    nombre: "CarritoVenta:33  etiqueta de oferta",
    antes: "pos-text-success-soft whitespace-nowrap",
    despues: "sunmi-text-success-soft whitespace-nowrap",
  },
];

let ws, sessionId, id = 0;
const pending = new Map();

const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

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
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

const navegador = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" }
);

/** El socket TAMBIÉN, no solo el navegador: sin eso la sonda se cuelga al salir bien. */
const cerrar = () => {
  try { ws?.close(); } catch {}
  try { navegador.kill(); } catch {}
};
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

await send("Page.navigate", { url: `${BASE}${RUTA}` });

// La hoja se sirve desde el layout raíz. Se espera a que la regla del kit sea
// encontrable, que es justo lo que se va a medir.
let lista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    lista = await evaluar(`(() => {
      if (document.readyState !== "complete") return false;
      for (const hoja of document.styleSheets) {
        let reglas; try { reglas = hoja.cssRules; } catch { continue; }
        for (const r of reglas) {
          if (!r.selectorText) continue;
          for (const parte of r.selectorText.split(",")) {
            if (parte.trim() === ".pos-text-accent") return true;
          }
        }
      }
      return false;
    })()`);
  } catch {}
  if (lista) break;
}
if (!lista) frenar("la hoja no trae `.pos-text-accent`: no hay nada que medir");

const medir = (clases) => `(() => {
  const el = document.createElement("div");
  el.className = ${JSON.stringify(clases)};
  el.textContent = "$ 12.345";
  document.body.append(el);
  const c = getComputedStyle(el);
  const r = { tamano: c.fontSize, peso: c.fontWeight, color: c.color, alto: Math.round(el.getBoundingClientRect().height) };
  el.remove();
  return JSON.stringify(r);
})()`;

const resultados = {};

for (const ancho of ANCHOS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho, height: ancho >= 1024 ? 900 : 1200, deviceScaleFactor: 1, mobile: ancho < 1024,
  });
  await sleep(200);

  console.log(`\n  ══ ${ancho} px ${"═".repeat(Math.max(0, 58 - String(ancho).length))}`);
  console.log(`  1rem = ${await evaluar(`getComputedStyle(document.documentElement).fontSize`)}`);
  console.log("");

  resultados[ancho] = [];
  for (const caso of CASOS) {
    const a = JSON.parse(await evaluar(medir(caso.antes)));
    const d = JSON.parse(await evaluar(medir(caso.despues)));
    const cambia = a.tamano !== d.tamano || a.color !== d.color || a.peso !== d.peso;

    console.log(`  ${caso.nombre}`);
    console.log(`     antes    ${a.tamano.padStart(8)}  peso ${a.peso}  ${a.color}`);
    if (caso.antes === caso.despues) {
      console.log(`     (no se migra) ${caso.nota || ""}`);
    } else {
      console.log(`     después  ${d.tamano.padStart(8)}  peso ${d.peso}  ${d.color}${cambia ? "   ← CAMBIA" : "   = idéntico"}`);
    }
    resultados[ancho].push({ nombre: caso.nombre, antes: a, despues: d, migra: caso.antes !== caso.despues });
  }
}

// ── LO QUE HAY QUE PODER AFIRMAR ──────────────────────────────────────────

console.log("\n  ══ veredicto ═════════════════════════════════════════════");
let fallas = 0;
const ok = (t, c) => { if (c) console.log(`  ✓ ${t}`); else { fallas++; console.log(`  ✗ ${t}`); } };

for (const ancho of ANCHOS) {
  const porNombre = Object.fromEntries(resultados[ancho].map((r) => [r.nombre, r]));

  const raiz = parseFloat(await evaluar(`getComputedStyle(document.documentElement).fontSize`));
  const total = porNombre["FormaPago:380  total a cobrar"];
  const esperadoPx = (ancho >= 1024 ? 4.5 : 3.375) * raiz;
  ok(
    `${ancho} · el total a cobrar mide ${esperadoPx}px, el 50 % agrandado de la regla`,
    Math.abs(parseFloat(total.antes.tamano) - esperadoPx) < 0.5
  );

  const porMedio = porNombre["FormaPago:445  importe por medio"];
  ok(
    `${ancho} · HOY el importe por medio se dibuja IGUAL DE GRANDE que el total`,
    porMedio.antes.tamano === total.antes.tamano
  );
  ok(
    `${ancho} · migrado vuelve a su tamaño propio, más chico`,
    parseFloat(porMedio.despues.tamano) < parseFloat(porMedio.antes.tamano)
  );

  const cambianColor = resultados[ancho]
    .filter((r) => r.migra && r.antes.color !== r.despues.color)
    .map((r) => r.nombre);
  ok(
    `${ancho} · los migrados NO cambian de color${cambianColor.length ? ` — cambian: ${cambianColor.join(", ")}` : ""}`,
    cambianColor.length === 0
  );
}

console.log(`\n  ${fallas} afirmaciones en rojo.`);
cerrar();
process.exit(fallas ? 1 : 0);
