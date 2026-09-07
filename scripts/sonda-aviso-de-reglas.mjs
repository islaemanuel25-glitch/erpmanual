// SONDA: EL AVISO DE REGLAS, EN SUS DOS TONOS, FOTOGRAFIADO DE VERDAD.
//
//   node scripts/sonda-aviso-de-reglas.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave> --capturas /tmp/capturas
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// El aviso de "Reglas de venta" pasó de ser un renglón compacto escrito a mano
// —relleno chico, esquina chica, letra chica— al bloque del kit, que es más
// grande. El cambio puede estar bien, pero no se aprueba sin verlo, y ese aviso
// no se puede ver en una captura estática: aparece SOLO después de guardar.
//
// Esta sonda lo hace aparecer por el camino real y lo retrata en los dos
// estados, a dos anchos.
//
// ── CÓMO SE PROVOCA CADA ESTADO, Y POR QUÉ NO HAY COSTURA EN LA PANTALLA ───
//
// No se tocó una sola línea de código productivo, y no hacía falta:
//
//   · **success** — se toca un interruptor. En esta pantalla el interruptor ES
//     el guardado: `handleToggle` hace el POST y, si sale bien, pone el mensaje.
//     O sea que el camino feliz se ejerce con la interfaz, sin ayuda.
//   · **danger** — se le pide al NAVEGADOR que bloquee la ruta de la API
//     (`Network.setBlockedURLs`) y se vuelve a tocar el interruptor. El `fetch`
//     falla, cae en el `catch` de la pantalla y sale "Error de conexión", que es
//     el mensaje de error real y no uno fabricado.
//
// El bloqueo vive en el navegador de la sonda, no en la aplicación: no hay
// bandera, ni parámetro de URL, ni rama de prueba que pueda filtrarse a
// producción. La pantalla no sabe que la están midiendo.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO. Que el aviso no aparezca, que la sesión no entre o
// que la pantalla no cargue no son "no se pudo comprobar": son fallas. Sin eso,
// un vacío se leería como "salió bien".

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const USUARIO = arg("usuario", null);
const CLAVE = arg("clave", null);
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9225"));
const PERFIL = path.join(tmpdir(), "sonda-aviso-de-reglas");
const RUTA = "/modulos/configuracion/pos-ventas/reglas";
const API = "/api/config/pos-ventas-cliente";
const CAPTURAS = arg("capturas", null);
const ANCHOS = (arg("anchos", "390,1280") || "").split(",").map((n) => Number(n.trim()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pasadas = 0;
const fallas = [];
const ok = (t, c, d = "") => {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(t); console.log(`  ✗ ${t}${d ? `  ${d}` : ""}`); }
};
const seccion = (t) => console.log(`\n  ── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`);

function frenar(motivo) {
  console.error(`\nLA SONDA NO PUDO MEDIR: ${motivo}`);
  cerrar();
  process.exit(1);
}

// ── Transporte CDP ─────────────────────────────────────────────────────────

let ws, sessionId, id = 0;
const pending = new Map();

const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

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
    const listo = await evaluar(
      `document.readyState === "complete" && location.pathname !== "about:blank"`
    );
    if (listo) return;
  }
}

const navegador = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=390,1200",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" }
);

/**
 * Suelta los DOS recursos: el socket y el navegador.
 *
 * No es prolijidad. Node no termina mientras quede un handle abierto, y con el
 * socket vivo la sonda se quedaba corriendo después de imprimir su resultado; el
 * paso del workflow no avanzaba y el job moría por `timeout-minutes`. Lo peor de
 * ese defecto es que solo pasaba en el camino EXITOSO. Está anotado igual en
 * `sonda-escritura-en-cero.mjs`, de donde sale esta forma.
 */
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
await send("Network.enable");

if (!USUARIO || !CLAVE) frenar("faltan --usuario y --clave");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1200, deviceScaleFactor: 1, mobile: true });
await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

// ── Lo que se mide del aviso ───────────────────────────────────────────────

/**
 * El aviso, si está: sus clases, su geometría y su tipografía calculadas.
 *
 * Se lo busca por la clase de la CAJA del kit —`sunmi-btn-*-soft`— y no por el
 * texto: el texto cambia con el interruptor que se tocó, y atarse a él haría que
 * la sonda dejara de encontrarlo el día que alguien reescriba un rótulo.
 */
const LEER_AVISO = `(() => {
  const el = document.querySelector('[class*="sunmi-btn-"][class*="-soft"]');
  if (!el) return null;
  const c = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return JSON.stringify({
    clases: el.className,
    texto: el.innerText.trim(),
    alto: Math.round(r.height),
    ancho: Math.round(r.width),
    relleno: c.padding,
    radio: c.borderTopLeftRadius,
    letra: c.fontSize,
    fondo: c.backgroundColor,
    borde: c.borderTopColor,
    color: c.color,
  });
})()`;

async function esperarAviso(intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    const crudo = await evaluar(LEER_AVISO);
    if (crudo) return JSON.parse(crudo);
    await sleep(150);
  }
  return null;
}

/** Toca el primer interruptor de la pantalla, que es el que guarda. */
async function tocarInterruptor() {
  const tocado = await evaluar(`(() => {
    const track = document.querySelector('[class*="w-8"][class*="h-4"][class*="rounded-full"]');
    if (!track) return false;
    const clickable = track.closest('[class*="cursor-pointer"]') || track.parentElement;
    if (!clickable) return false;
    clickable.click();
    return true;
  })()`);
  if (!tocado) frenar("no se encontró ningún interruptor en la pantalla de Reglas");
}

async function retratar(nombre, ancho, alto) {
  if (!CAPTURAS) return null;
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: ancho, height: alto, scale: 1 },
  });
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const destino = path.join(CAPTURAS, `${nombre}.png`);
  fs.writeFileSync(destino, Buffer.from(data, "base64"));
  console.log(`    foto: ${destino}`);
  return destino;
}

/**
 * Qué clases quedan si se sacan las del tono. Es lo que contesta si los dos
 * estados comparten maquetado y solo cambia la semántica del color.
 */
const sinTono = (clases) =>
  clases
    .split(/\s+/)
    .filter((c) => c && !/^sunmi-(btn-[a-z]+-soft|badge-[a-z]+|text-[a-z-]+)$/.test(c))
    .sort()
    .join(" ");

// ── La medición ────────────────────────────────────────────────────────────

const medido = {};

for (const ancho of ANCHOS) {
  const alto = ancho >= 1024 ? 900 : 1200;
  seccion(`${ancho} px`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 1024,
  });

  // ── success: el camino feliz, con la interfaz y nada más ────────────────
  await send("Network.setBlockedURLs", { urls: [] });
  await navegar(`${BASE}${RUTA}`);
  await sleep(600);
  await tocarInterruptor();
  const exito = await esperarAviso();
  ok(`${ancho} · aparece el aviso al guardar`, !!exito);
  if (!exito) frenar(`a ${ancho} px el aviso de éxito no apareció`);
  ok(`${ancho} · el tono es success`, /sunmi-btn-success-soft/.test(exito.clases), exito.clases);
  await retratar(`${ancho}-reglas-aviso-success`, ancho, alto);
  console.log(`    alto ${exito.alto}px · ancho ${exito.ancho}px · relleno ${exito.relleno} · radio ${exito.radio} · letra ${exito.letra}`);
  console.log(`    texto: ${JSON.stringify(exito.texto)}`);

  // ── danger: el mismo camino, con la API bloqueada por el navegador ──────
  await send("Network.setBlockedURLs", { urls: [`*${API}*`] });
  await navegar(`${BASE}${RUTA}`);
  await sleep(600);
  await tocarInterruptor();
  const error = await esperarAviso();
  ok(`${ancho} · aparece el aviso al fallar`, !!error);
  if (!error) frenar(`a ${ancho} px el aviso de error no apareció`);
  ok(`${ancho} · el tono es danger`, /sunmi-btn-danger-soft/.test(error.clases), error.clases);
  await retratar(`${ancho}-reglas-aviso-danger`, ancho, alto);
  console.log(`    alto ${error.alto}px · ancho ${error.ancho}px · relleno ${error.relleno} · radio ${error.radio} · letra ${error.letra}`);
  console.log(`    texto: ${JSON.stringify(error.texto)}`);

  // ── lo que hay que poder afirmar sobre los dos juntos ───────────────────
  ok(
    `${ancho} · MISMO maquetado en los dos estados`,
    sinTono(exito.clases) === sinTono(error.clases),
    `${sinTono(exito.clases)}  ≠  ${sinTono(error.clases)}`
  );
  ok(`${ancho} · misma altura en los dos estados`, exito.alto === error.alto, `${exito.alto} ≠ ${error.alto}`);
  ok(
    `${ancho} · y el COLOR sí cambia: no son el mismo aviso pintado igual`,
    exito.fondo !== error.fondo && exito.color !== error.color,
    `${exito.fondo}/${exito.color} vs ${error.fondo}/${error.color}`
  );

  medido[ancho] = { exito, error };
  await send("Network.setBlockedURLs", { urls: [] });
}

// ── Resumen ────────────────────────────────────────────────────────────────

seccion("geometría medida");
for (const [ancho, { exito, error }] of Object.entries(medido)) {
  console.log(`  ${ancho} px  success: alto ${exito.alto}px, relleno ${exito.relleno}, radio ${exito.radio}, letra ${exito.letra}`);
  console.log(`  ${ancho} px  danger : alto ${error.alto}px, relleno ${error.relleno}, radio ${error.radio}, letra ${error.letra}`);
  console.log(`  ${ancho} px  fondo success ${exito.fondo} · fondo danger ${error.fondo}`);
}

console.log(`\n  ${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
cerrar();
process.exit(fallas.length ? 1 : 0);
