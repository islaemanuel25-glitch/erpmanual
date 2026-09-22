// SONDA: ¿SOBREVIVE A UN REFRESCO LO QUE SE HIZO EN UNA RECEPCIÓN?
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Emanuel marcaba revisados, decidía precios y corregía cantidades en el pedido
// 242, y al refrescar la página perdía lo hecho. Medido contra producción: de
// los once renglones, `cantidadRecibida` 0, sueltas 0, kilos 0 y motivo 0 —todo
// vivía en la memoria del navegador—.
//
// Un candado no puede contestar esto: lo que hay que ejercer es guardar, VOLVER
// A PEDIR como si la pantalla se hubiera recargado, y comprobar que está. Son
// dos viajes de red y una base real.
//
// ── QUÉ ESCRIBE, Y CÓMO LO DEJA ───────────────────────────────────────────
//
// Escribe una corrección de prueba sobre UN renglón —cantidad, sueltas,
// unidades que entran, motivo— y al terminar **vuelve a dejar los cuatro campos
// como estaban**, hayan salido bien las afirmaciones o no. No mueve stock ni
// escribe ningún costo: esos campos son el borrador de trabajo que la recepción
// va a leer, y la recepción no se toca.
//
// Uso:
//   node --experimental-websocket scripts/sonda-refresco-recepcion.mjs \
//     --base https://operix.cloud --pedido 238 --usuario x --clave y
//
// ROJO Y FRENA si no puede medir.

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
const PEDIDO = Number(arg("pedido", "238"));
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9351"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-refresco-recepcion"));

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
  "--window-size=390,844", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

const fallas = [];
const afirmar = (ok, titulo, detalle = "") => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    if (detalle) console.log(`        ${detalle}`);
  }
};

/** Lo que la pantalla pide al abrir. Un refresco es exactamente esto. */
const alAbrir = () =>
  evaluar(
    `fetch("/api/compras-proveedor/obtener?id=${PEDIDO}", { credentials: "same-origin", cache: "no-store" })
       .then((r) => r.json())`,
    true
  );

const guardar = (cuerpo) =>
  evaluar(
    `fetch("/api/compras-proveedor/recepcion/correccion", {
       method: "POST", credentials: "same-origin",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(${JSON.stringify(cuerpo)}),
     }).then(async (r) => JSON.stringify({ status: r.status, cuerpo: await r.json().catch(() => null) }))`,
    true
  );

console.log(`\n── ¿SOBREVIVE UN REFRESCO? PEDIDO ${PEDIDO} ──────────────────────\n`);

let restaurar = null;
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
  await navegar(`${BASE}/modulos/compras-proveedor/${PEDIDO}`);

  const antes = await alAbrir();
  const detalles = antes?.item?.detalles || [];
  afirmar(detalles.length > 0, `el pedido trae renglones (${detalles.length})`);
  if (!detalles.length) morir("el pedido no trae renglones");

  const d = detalles[0];
  console.log(`  renglón de prueba: ${d.id} · ${d.producto?.base?.nombre ?? "(sin nombre)"}`);

  // Cómo estaba, para dejarlo igual.
  restaurar = {
    pedidoId: PEDIDO,
    pedidoDetalleId: d.id,
    cantidadRecibida: d.cantidadRecibida ?? null,
    unidadesSueltas: d.unidadesSueltas ?? null,
    unidadesFisicas: d.unidadesFisicas ?? null,
    motivoPrincipal: d.motivoPrincipal ?? null,
    motivoDetalle: d.motivoDetalle ?? null,
  };
  console.log(`  cómo estaba: ${JSON.stringify(restaurar)}`);

  const prueba = {
    pedidoId: PEDIDO,
    pedidoDetalleId: d.id,
    cantidadRecibida: 2,
    unidadesSueltas: 5,
    unidadesFisicas: 65,
    motivoPrincipal: "Faltante",
    motivoDetalle: "prueba de la sonda",
  };
  const r = JSON.parse(await guardar(prueba));
  console.log(`  guardado: ${r.status} · ${JSON.stringify(r.cuerpo?.guardado ?? r.cuerpo)}`);
  afirmar(r.status === 200 && r.cuerpo?.ok === true, "el servidor guardó la corrección",
    r.cuerpo?.queHacer || r.cuerpo?.error || `status ${r.status}`);

  // ── EL REFRESCO ──────────────────────────────────────────────────────
  //
  // Se recarga la pantalla de verdad y se vuelve a pedir lo mismo que pide al
  // abrir. Si algo vivía en la memoria, acá ya no está.
  await navegar(`${BASE}/modulos/compras-proveedor/${PEDIDO}`);
  await sleep(1500);
  const despues = ((await alAbrir())?.item?.detalles || []).find((x) => x.id === d.id);
  console.log(`  después del refresco: ${JSON.stringify({
    cantidadRecibida: despues?.cantidadRecibida ?? null,
    unidadesSueltas: despues?.unidadesSueltas ?? null,
    unidadesFisicas: despues?.unidadesFisicas ?? null,
    motivoPrincipal: despues?.motivoPrincipal ?? null,
  })}`);

  afirmar(Number(despues?.cantidadRecibida) === 2, "la cantidad corregida sigue estando");
  afirmar(Number(despues?.unidadesSueltas) === 5, "las sueltas siguen estando");
  afirmar(Number(despues?.unidadesFisicas) === 65, "las unidades que entran al stock siguen estando");
  afirmar(despues?.motivoPrincipal === "Faltante", "el motivo sigue estando");
  afirmar(despues?.motivoDetalle === "prueba de la sonda", "el detalle del motivo sigue estando");

  console.log("");
  if (fallas.length) {
    console.error(`ROJO · ${fallas.length} de las afirmaciones no se cumplen.`);
    process.exitCode = 1;
  } else {
    console.log("VERDE · refrescar la pantalla no pierde lo corregido.");
  }
} catch (e) {
  console.error(`\nROJO · la sonda no pudo medir: ${e?.message || e}`);
  process.exitCode = 1;
} finally {
  // ── Y SE DEJA COMO ESTABA, PASE LO QUE PASE ────────────────────────────
  if (restaurar) {
    try {
      const r = JSON.parse(await guardar(restaurar));
      console.log(`  restaurado: ${r.status} · ${JSON.stringify(restaurar)}`);
    } catch (e) {
      console.error(`  ATENCIÓN: no se pudo restaurar el renglón ${restaurar.pedidoDetalleId}: ${e?.message}`);
      process.exitCode = 1;
    }
  }
  process.exit(process.exitCode || 0);
}
