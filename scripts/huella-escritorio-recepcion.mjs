// LA HUELLA DE LA RECEPCIÓN EN ESCRITORIO, PARA PROBAR QUE NO SE MOVIÓ.
//
//   AUTH_SECRET=… node --experimental-websocket scripts/huella-escritorio-recepcion.mjs \
//     --base http://localhost:3210 --transferencia 2 --usuario 3 --local 6 \
//     --chrome /usr/bin/chromium --salida /salida/huella-despues.json
//
// ── POR QUÉ NO SE REUSA `generar-huellas.mjs` ────────────────────────────
//
// Ése cubre las pantallas con tabla y transferencias NO está en su lista —lo
// dice su propio encabezado—. Y `medir-tabla-escritorio.mjs` hace login real con
// usuario y clave, que la base descartable no tiene: su usuario existe para que
// las claves foráneas cierren, con un hash que no corresponde a ninguna clave.
// Acá la sesión se firma, igual que en el arnés de capturas.
//
// ── QUÉ MIDE, Y POR QUÉ ASÍ ──────────────────────────────────────────────
//
// La GEOMETRÍA de cada elemento visible de la composición de escritorio: tag,
// clases, posición, tamaño y el texto propio. No un screenshot: dos PNG pueden
// diferir por el antialiasing de una fuente y eso no es un cambio de layout.
// Y no solo el texto: un cambio de padding no mueve una letra y mueve todo lo
// de abajo.
//
// ── SE MIDE SOLO LO QUE ESCRITORIO DIBUJA ────────────────────────────────
//
// La composición móvil sigue en el DOM a 1366 —`md:hidden` la apaga con CSS, no
// la saca—, así que se filtra por `offsetParent !== null`. Sin eso, la huella
// incluiría la pantalla que esta tanda SÍ cambia y daría distinto siempre, por
// el motivo equivocado.

import fs from "node:fs";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3210");
const CHROME = arg("chrome", "/usr/bin/chromium");
const TRANSFERENCIA = Number(arg("transferencia", "2"));
const USUARIO = Number(arg("usuario", "3"));
const LOCAL = Number(arg("local", "6"));
const ANCHO = Number(arg("ancho", "1366"));
const ALTO = Number(arg("alto", "900"));
const PUERTO = Number(arg("puerto-cdp", "9355"));
const SALIDA = arg("salida", null);
const SECRETO = process.env.AUTH_SECRET;

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}
if (!SALIDA) {
  console.error("ABORTADO: falta --salida; una huella que no se guarda no se puede comparar.");
  process.exit(2);
}

const PERMISOS = [
  "transferencias.ver", "transferencias.recibir", "transferencias.crear",
  "transferencias.cancelar", "productos.ver", "stock.ver",
];

const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=/tmp/huella-${PUERTO}`, "--no-first-run",
  "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
], { stdio: "ignore" });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, sig = 0;
const pendientes = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { const id = ++sig; pendientes.set(id, res); ws.send(JSON.stringify({ id, method, params })); });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const p = lista.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await esperar(500);
  }
  throw new Error(`el navegador no expuso ninguna pestaña en el puerto ${PUERTO}`);
}

ws = new WebSocket(await urlDepurador());
await new Promise((r) => { ws.onopen = r; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m.result || {}); pendientes.delete(m.id); }
};

const evaluar = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false });

const url = new URL(BASE);
for (const [name, payload] of [
  ["erpazul_sesion", { id: USUARIO, nombre: "Huella", email: "huella@local", localId: LOCAL, permisos: PERMISOS }],
  ["erpazul_operador_activo", { operadorId: USUARIO, nombre: "Huella", localId: LOCAL, _tipo: "operador" }],
]) {
  await send("Network.setCookie", {
    name, value: jwt.sign(payload, SECRETO, { expiresIn: "1h" }),
    domain: url.hostname, path: "/", httpOnly: true,
  });
}

await send("Page.navigate", { url: "about:blank" });
await esperar(400);
await send("Page.navigate", { url: `${BASE}/modulos/transferencias/${TRANSFERENCIA}` });

// Que la pantalla esté cargada de verdad antes de medir. Una huella de una
// pantalla a medio renderizar es determinista y no significa nada.
for (let i = 0; i < 90; i++) {
  const listo = await evaluar(
    `document.body ? document.body.innerText.includes("Transferencia #${TRANSFERENCIA}") : false`
  );
  if (listo) break;
  await esperar(500);
}
await esperar(2500);

const huella = await evaluar(`(() => {
  // ── SE MIDE LO QUE OCUPA LUGAR, Y ESO NO ES offsetParent ───────────────
  //
  // El filtro era offsetParent distinto de null, que funciona para un div
  // oculto y NO para un SVG: offsetParent es una propiedad de HTMLElement, así
  // que en un svg o un path devuelve undefined y el filtro los dejaba pasar.
  // Con eso, los iconos de la composición MÓVIL —que a 1366 está apagada—
  // entraban en la huella de escritorio: 20 nodos de más, todos con geometría
  // cero, y la comparación decía que escritorio se había movido cuando no se
  // había movido nada.
  //
  // La pregunta correcta es si el elemento OCUPA LUGAR. Un rectángulo de 0x0 no
  // desplaza nada, esté oculto por CSS o sea un nodo sin caja.
  const conCaja = [...document.querySelectorAll('main *')].filter((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return conCaja.map((n) => {
    const r = n.getBoundingClientRect();
    // El texto PROPIO, sin el de los hijos: si no, cada ancestro repite todo lo
    // que tiene adentro y un cambio se cuenta veinte veces.
    const propio = [...n.childNodes]
      .filter((c) => c.nodeType === 3)
      .map((c) => c.textContent.trim())
      .join(" ")
      .replace(/\\s+/g, " ");
    return [
      n.tagName,
      typeof n.className === "string" ? n.className : "",
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
      propio,
    ].join("|");
  });
})()`);

if (!Array.isArray(huella) || huella.length === 0) {
  console.error("ABORTADO: la huella salió vacía. La pantalla no cargó.");
  chrome.kill();
  process.exit(1);
}

fs.writeFileSync(SALIDA, JSON.stringify(huella, null, 0));
console.log(`huella guardada: ${SALIDA}  ·  ${huella.length} elementos visibles a ${ANCHO}px`);
chrome.kill();
process.exit(0);
