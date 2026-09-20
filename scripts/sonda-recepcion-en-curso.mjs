// SONDA: LA RECEPCIÓN A MEDIO CARGAR SOBREVIVE A SALIR DE LA PANTALLA.
//
// ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
//
// Las cantidades recibidas vivían SOLO en el estado de React y se escribían
// recién al tocar "Recibir mercadería". Cargar cuarenta líneas y que se
// recargue la página eran cuarenta líneas de vuelta a contar.
//
// ── QUÉ EJERCE, Y QUÉ NO ──────────────────────────────────────────────────
//
// Cambia una cantidad, comprueba que quedó guardada, refresca y comprueba que
// sigue ahí. NO toca "Recibir mercadería": eso mueve stock de verdad en la base
// de producción. La limpieza al recibir pasa por el MISMO `limpiarRecepcion`
// que la sonda sí ejerce borrando la clave a mano y comprobando que no
// reaparece sola.
//
// Todo lo demás es de lectura: en un pedido ENVIADO las cantidades no se
// escriben hasta confirmar.
//
// Uso:
//   node --experimental-websocket scripts/sonda-recepcion-en-curso.mjs \
//     --base https://operix.cloud --pedido 219 \
//     --usuario admin@admin.com --clave <clave>

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
const PEDIDO = arg("pedido", "219");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9331"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-recepcion-en-curso"));

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

/** Qué hay en pantalla y qué quedó guardado. */
const leerEstado = () =>
  evaluar(`JSON.stringify((() => {
    // SOLO LAS CANTIDADES DE LINEA. El primer input numerico de la pantalla es
    // "Total real ($)", del panel de factura: escribir ahi no toca los
    // recibidos, y la sonda daba rojo sobre un campo que no tenia que mirar.
    const campos = [...document.querySelectorAll('input[aria-label="Cantidad recibida"]')];
    let guardado = null;
    try { guardado = sessionStorage.getItem("comprasRecepcionEnCurso"); } catch {}
    let parsed = null;
    try { parsed = guardado ? JSON.parse(guardado) : null; } catch {}
    return {
      campos: campos.length,
      // QUIEN ES CADA CAMPO, no solo cuantos hay. El primer input numerico de
      // la pantalla puede no ser una cantidad de linea, y escribir ahi no toca
      // los recibidos: la sonda daria rojo sobre un campo equivocado.
      quienes: campos.slice(0, 3).map((i) => (i.getAttribute("aria-label") || i.getAttribute("placeholder") || i.name || i.id || "(sin nombre)")),
      valores: campos.slice(0, 3).map((i) => i.value),
      pedidoGuardado: parsed ? parsed.pedidoId : null,
      cuantasGuardadas: parsed ? Object.keys(parsed.recibidos || {}).length : 0,
    };
  })())`);

/** Escribe en un campo disparando el onChange de React. */
const escribir = (indice, texto) =>
  evaluar(`(() => {
    const campos = [...document.querySelectorAll('input[aria-label="Cantidad recibida"]')];
    const el = campos[${indice}];
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(texto)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);

const URL_PEDIDO = `${BASE}/modulos/compras-proveedor/${PEDIDO}`;

console.log(`\n── LA RECEPCIÓN A MEDIO CARGAR SOBREVIVE AL REFRESCO ─────────────\n`);

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
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  // Arrancar sin nada guardado, para que lo que aparezca sea de esta corrida.
  await navegar(URL_PEDIDO);
  await evaluar(`(() => { try { sessionStorage.removeItem("comprasRecepcionEnCurso"); } catch {} return true; })()`);
  await navegar(URL_PEDIDO);
  if (!(await esperarA(`document.querySelectorAll('input[aria-label="Cantidad recibida"]').length > 0`, 60000))) {
    morir("la pantalla del pedido no dibujó ningún campo de cantidad");
  }
  await sleep(2000);

  const inicial = JSON.parse(await leerEstado());
  console.log(`  al abrir: ${inicial.campos} campos, guardadas ${inicial.cuantasGuardadas}`);
  console.log(`  primeros campos: ${JSON.stringify(inicial.quienes)} = ${JSON.stringify(inicial.valores)}\n`);
  afirmar(inicial.campos > 0, "la pantalla dibuja campos de cantidad", "sin campos no hay nada que ejercer");

  // ── 1 · CONTAR ALGO ──────────────────────────────────────────────────────
  const CANTIDAD = "7";
  if (!(await escribir(0, CANTIDAD))) morir("no pude escribir en el primer campo");
  await sleep(1500);

  const cargado = JSON.parse(await leerEstado());
  console.log(`  contado: primer campo "${cargado.valores[0]}", pedido guardado ${cargado.pedidoGuardado}, ${cargado.cuantasGuardadas} cantidades\n`);

  afirmar(
    cargado.valores[0] === CANTIDAD,
    "lo escrito quedó en el campo",
    `el campo dice "${cargado.valores[0]}"`
  );
  afirmar(
    cargado.cuantasGuardadas > 0,
    "lo contado quedó guardado en el navegador",
    "el almacenamiento está vacío: la carga se perdería con un refresco"
  );
  afirmar(
    Number(cargado.pedidoGuardado) === Number(PEDIDO),
    "lo guardado lleva el número de pedido adentro",
    `dice ${cargado.pedidoGuardado} y el pedido es ${PEDIDO}`
  );

  // ── 2 · REFRESCAR ────────────────────────────────────────────────────────
  await navegar(URL_PEDIDO);
  if (!(await esperarA(`document.querySelectorAll('input[aria-label="Cantidad recibida"]').length > 0`, 60000))) {
    morir("tras refrescar la pantalla no volvió a dibujar los campos");
  }
  await sleep(2500);

  const tras = JSON.parse(await leerEstado());
  console.log(`  tras refrescar: primer campo "${tras.valores[0]}", ${tras.cuantasGuardadas} guardadas\n`);

  afirmar(
    tras.valores[0] === CANTIDAD,
    "tras refrescar la cantidad contada sigue ahí",
    `el campo dice "${tras.valores[0]}" y se había contado ${CANTIDAD}`
  );

  // ── 3 · Y CUANDO SE LIMPIA, NO REAPARECE ─────────────────────────────────
  //
  // Es lo que hace el camino de recibir y el de anular. No se toca "Recibir
  // mercadería" —eso mueve stock— pero sí se comprueba que borrada la clave la
  // pantalla vuelve a los valores por defecto y no la resucita sola.
  await evaluar(`(() => { try { sessionStorage.removeItem("comprasRecepcionEnCurso"); } catch {} return true; })()`);
  await navegar(URL_PEDIDO);
  await esperarA(`document.querySelectorAll('input[aria-label="Cantidad recibida"]').length > 0`, 60000);
  await sleep(2500);

  const limpio = JSON.parse(await leerEstado());
  console.log(`  tras limpiar y refrescar: primer campo "${limpio.valores[0]}"\n`);
  afirmar(
    limpio.valores[0] !== CANTIDAD,
    "limpiada la carga, la pantalla vuelve a lo pedido",
    `el campo sigue diciendo "${limpio.valores[0]}": la limpieza no tiene efecto`
  );

  console.log("");
  if (fallas.length) {
    console.log(`ROJO · ${fallas.length} ${fallas.length === 1 ? "afirmación falló" : "afirmaciones fallaron"}.`);
    process.exit(1);
  }
  console.log("VERDE · la recepción a medio cargar sobrevive al refresco y se limpia cuando corresponde.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
