// RESTAURAR UN COSTO QUE UN CIERRE ESCRIBIÓ MAL, POR EL CAMINO DE LA APLICACIÓN.
//
// ── POR QUÉ ESTO Y NO UN UPDATE A LA BASE ─────────────────────────────────
//
// Porque el costo de un producto no vive en un solo lugar: está en la ficha y
// en el `ProductoLocal` de cada ubicación, y al cambiarlo se recalcula el precio
// de venta por margen y se marca la revisión de precio. Un `UPDATE` a mano
// escribe una fila y deja las otras cinco diciendo otra cosa.
//
// Así que se hace lo mismo que haría una persona editando el producto: se lee la
// ficha con `obtener`, se manda de vuelta con `editar` cambiando SOLO el costo,
// y la aplicación propaga y deja su rastro. Es la regla 1 de CLAUDE.md aplicada
// a un arreglo de datos: se reusa el camino que existe, no se escribe uno nuevo
// al lado.
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// El cierre del pedido 242, el 2026-09-22 a las 13:42:03 UTC, escribió el costo
// de Hamburguesa Paty Clasica x2 en $1.851.090: tomó los $61.703 del bulto de 30
// y los multiplicó OTRA VEZ por 30. El precio de venta se recalculó solo y pasó
// de $80.300 a $2.406.500 en la ficha y en las cinco ubicaciones.
//
// Los valores a restaurar NO se deducen de una fórmula: salen del backup que el
// despliegue sacó a las 13:35:16 UTC, siete minutos antes del cierre.
//
// ── SIN `--aplicar` NO ESCRIBE NADA ───────────────────────────────────────
//
// Por omisión lee, muestra lo que hay y lo que dejaría, y sale. Escribir es
// explícito.
//
// Uso:
//   node --experimental-websocket scripts/sonda-restaurar-costo.mjs \
//     --base https://operix.cloud --usuario x --clave y \
//     --producto 298 --costo 61703 --venta 80300 [--aplicar]

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
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PRODUCTO = Number(arg("producto", "0"));
const COSTO = Number(arg("costo", "0"));
const VENTA = arg("venta", "") === "" ? null : Number(arg("venta"));
const APLICAR = process.argv.includes("--aplicar");
const PUERTO = Number(arg("puerto-cdp", "9361"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-restaurar-costo"));

if (!USUARIO || !CLAVE || !PRODUCTO || !COSTO) {
  console.error("Faltan --usuario, --clave, --producto o --costo.");
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

console.log(`\n── RESTAURAR EL COSTO DEL PRODUCTO ${PRODUCTO} ─────────────────────\n`);

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

  const crudo = await evaluar(
    `fetch("/api/productos/obtener?id=${PRODUCTO}", { credentials: "same-origin", cache: "no-store" })
       .then((r) => r.text())`,
    true
  );
  const d = JSON.parse(crudo);
  const ficha = d?.item ?? d?.producto ?? d;
  if (!ficha?.id) {
    console.error("No se pudo leer la ficha:", crudo.slice(0, 300));
    process.exit(1);
  }

  console.log(`  producto: ${ficha.nombre}`);
  console.log(`  ahora:    costo ${ficha.precio_costo} · venta ${ficha.precio_venta} · margen ${ficha.margen} · factor ${ficha.factor_pack}`);
  console.log(`  quedaría: costo ${COSTO} · venta ${VENTA ?? "(la que salga del margen)"}`);

  if (!APLICAR) {
    console.log("\n  SIN --aplicar: no se escribió nada.");
    process.exit(0);
  }

  // La ficha entera de vuelta, con el costo corregido. `editar` reescribe todos
  // los campos de la base, así que mandar un pedazo borraría el resto.
  const cuerpo = { ...ficha, precio_costo: COSTO };
  if (VENTA !== null) cuerpo.precio_venta = VENTA;

  const res = await evaluar(
    `fetch("/api/productos/editar/${PRODUCTO}", {
       method: "PUT", credentials: "same-origin",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(${JSON.stringify(cuerpo)}),
     }).then(async (r) => JSON.stringify({ status: r.status, cuerpo: await r.json().catch(() => null) }))`,
    true
  );
  const r = JSON.parse(res);
  console.log(`\n  respuesta: ${r.status} · ${JSON.stringify(r.cuerpo).slice(0, 300)}`);

  const despues = JSON.parse(
    await evaluar(
      `fetch("/api/productos/obtener?id=${PRODUCTO}", { credentials: "same-origin", cache: "no-store" })
         .then((r) => r.text())`,
      true
    )
  );
  const f2 = despues?.item ?? despues?.producto ?? despues;
  console.log(`  quedó:    costo ${f2.precio_costo} · venta ${f2.precio_venta}`);
  process.exit(r.status === 200 && r.cuerpo?.ok ? 0 : 1);
} catch (e) {
  console.error(`\nROJO · no se pudo: ${e?.message || e}`);
  process.exit(1);
}
