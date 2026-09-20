// MIDE EL PIE PEGAJOSO DE UNA PANTALLA DE TRABAJO, Y QUÉ TAPA.
//
// ── POR QUÉ SE MIDE Y NO SE MIRA ──────────────────────────────────────────
//
// El pie de la recepción de un pedido llegó a tener cuatro renglones de números
// más el botón de recibir, y el botón se montaba encima del porcentaje de la
// ganancia. Mirando una captura eso se lee como "está apretado"; lo que hace
// falta para decidir es el número: cuánto alto se come el pie, y si la última
// tarjeta de la lista queda debajo de él.
//
// Es la misma idea que `medir-desborde.mjs` —un número en vez de un ojo— pero
// sobre el pie: aquél pregunta si algo desborda su caja, éste pregunta cuánto
// tapa un elemento pegajoso.
//
// ── QUÉ CONTESTA ──────────────────────────────────────────────────────────
//
//   · alto del pie, en píxeles;
//   · cuánto del alto útil se lleva, en porcentaje;
//   · si al final del scroll el pie SE SUPERPONE con la última tarjeta de la
//     lista, y cuántos píxeles.
//
// Lo último es lo que importa: un pie `sticky` reserva su lugar al final del
// contenido, así que abajo de todo no debería tapar nada. Si tapa, el número lo
// dice.
//
// Uso:
//   node --experimental-websocket scripts/medir-pie-de-recepcion.mjs \
//     --base https://operix.cloud --url /modulos/compras-proveedor/232 \
//     --usuario x --clave y [--edge /usr/bin/chromium-browser]

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
const URL_REL = arg("url", "/modulos/compras-proveedor/232");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9347"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "medir-pie"));
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));

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
  `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`\nROJO · no se pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una medición en estado desconocido frena igual.");
  process.exit(1);
};

// ── LA MEDICIÓN, ADENTRO DEL NAVEGADOR ────────────────────────────────────
//
// El pie se busca por su clase `sticky`, que es lo que lo hace pegajoso, y no
// por un texto: el texto de adentro cambia con la tanda y la medición tiene que
// sobrevivir a eso. La última tarjeta es la última `[data-linea-factura]`, que
// es la marca que la tarjeta ya pone para el arnés.
const MEDICION = `(() => {
  const pie = document.querySelector("main .sticky.bottom-0");
  if (!pie) return { error: "no se encontró el pie pegajoso" };
  const tarjetas = document.querySelectorAll("[data-linea-factura]");
  if (!tarjetas.length) return { error: "no hay tarjetas de línea en la pantalla" };
  const ultima = tarjetas[tarjetas.length - 1];
  const cont = document.querySelector("main");
  const p = pie.getBoundingClientRect();
  const t = ultima.getBoundingClientRect();
  // ── QUÉ ES "TAPAR", MEDIDO BIEN ──────────────────────────────────────
  //
  // No es "la última tarjeta está más abajo que el pie": con la lista arriba de
  // todo, la última tarjeta está a dos mil píxeles y eso no es taparla. Tapar
  // es que la caja de una tarjeta se SUPERPONGA con la banda del pie, o sea que
  // haya píxeles de tarjeta detrás del pie. Eso se mide por intersección.
  const dentroDeLaBanda = [...tarjetas]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.bottom > p.top && r.top < p.bottom);
  return {
    altoDelPie: Math.round(p.height),
    altoUtil: Math.round(cont ? cont.getBoundingClientRect().height : window.innerHeight),
    tarjetas: tarjetas.length,
    tapadas: dentroDeLaBanda.length,
    pixelesTapados: Math.round(
      dentroDeLaBanda.reduce((max, r) => Math.max(max, Math.min(r.bottom, p.bottom) - p.top), 0)
    ),
    // De la ÚLTIMA tarjeta en particular, que es la que un pie pegajoso deja
    // inalcanzable cuando está mal.
    superposicionUltima: Math.round(Math.max(0, Math.min(t.bottom, p.bottom) - Math.max(t.top, p.top))),
    hastaAbajo: Math.round(cont ? cont.scrollHeight - cont.clientHeight - cont.scrollTop : -1),
  };
})()`;

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
  await send("Emulation.setDeviceMetricsOverride", {
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: true,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });
  await navegar(`${BASE}${URL_REL}`);
  await sleep(6000);

  console.log(`\n── EL PIE DE ${URL_REL} A ${ANCHO}×${ALTO} ─────────────────\n`);

  const arriba = await evaluar(MEDICION);
  if (arriba?.error) morir(arriba.error);
  console.log(`  alto del pie ............ ${arriba.altoDelPie} px`);
  console.log(`  alto útil de la pantalla  ${arriba.altoUtil} px`);
  console.log(`  el pie se lleva ......... ${((arriba.altoDelPie / arriba.altoUtil) * 100).toFixed(1)} % del alto`);
  console.log(`  tarjetas en la lista .... ${arriba.tarjetas}`);
  console.log(`  ARRIBA DE TODO: tarjetas con píxeles detrás del pie: ${arriba.tapadas} (hasta ${arriba.pixelesTapados} px de la de más abajo)`);

  // Y ahora abajo de todo, que es donde un pie pegajoso tiene que dejar de
  // tapar: si sigue superponiéndose ahí, la última tarjeta es ilegible siempre.
  await evaluar(`(() => { const m = document.querySelector("main"); m.scrollTop = m.scrollHeight; return true; })()`);
  await sleep(600);
  const abajo = await evaluar(MEDICION);
  if (abajo?.error) morir(abajo.error);
  console.log(`  ABAJO DE TODO: superposición con la ÚLTIMA tarjeta: ${abajo.superposicionUltima} px`);
  console.log(`  (lo que falta para el fondo: ${abajo.hastaAbajo} px)`);

  const veredicto = abajo.superposicionUltima === 0;
  console.log(`\n${veredicto ? "VERDE" : "ROJO "} · abajo de todo el pie ${veredicto ? "no tapa" : "TAPA"} la última tarjeta.`);
  process.exit(veredicto ? 0 : 1);
} catch (e) {
  morir(e?.message || String(e));
}
