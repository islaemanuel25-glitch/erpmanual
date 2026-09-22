// SONDA: DEJAR ESCRITOS LOS VÍNCULOS QUE LA CASCADA YA RESUELVE SOLA.
//
// ── POR QUÉ HACE FALTA ────────────────────────────────────────────────────
//
// La cascada resuelve el vínculo AL LEER: `analisisDeComprobante` lo calcula en
// memoria cada vez que se pide la conciliación, y lo que queda escrito en el
// renglón lo escribe la siembra —cuando el pedido nace de la factura— o la ruta
// de vincular cuando alguien toca a mano.
//
// Cuando la cascada cambia —el 2026-09-22 se encendió la escalera por
// terminación— los renglones que AHORA resuelve no tienen ese vínculo escrito
// hasta que alguien toque algo o se relea el papel. Releer cuesta una llamada de
// IA y borra los renglones; esto no.
//
// ── QUÉ HACE Y QUÉ NO PISA ────────────────────────────────────────────────
//
// Pide la conciliación y, por cada renglón que la cascada marca como resuelto
// solo —`vinculadaSola`— y que TODAVÍA NO tiene producto escrito, llama a la
// misma ruta de vincular que usa la hoja. Los que ya tienen vínculo no se
// tocan: lo que una persona eligió manda.
//
// Uso:
//   node --experimental-websocket scripts/sonda-vincular-automaticos.mjs \
//     --base https://operix.cloud --pedido 245 --usuario x --clave y [--aplicar]

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
const PEDIDO = Number(arg("pedido", "0"));
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const APLICAR = process.argv.includes("--aplicar");
const PUERTO = Number(arg("puerto-cdp", "9381"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-vincular-automaticos"));

if (!USUARIO || !CLAVE || !PEDIDO) {
  console.error("Faltan --usuario, --clave o --pedido.");
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

const filasDe = (d) => (d?.grupos || []).flatMap((g) => g?.filas || []).concat(d?.filas || []);

console.log(`\n── VÍNCULOS AUTOMÁTICOS DEL PEDIDO ${PEDIDO} ─────────────────────\n`);

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

  const pedir = () =>
    evaluar(
      `fetch("/api/compras-proveedor/conciliacion/${PEDIDO}", { credentials: "same-origin", cache: "no-store" })
         .then((r) => r.json())`,
      true
    );

  const filas = filasDe(await pedir());
  console.log(`  renglones: ${filas.length}`);

  const pendientes = filas.filter((f) => f.vinculadaSola === true && !f.productoLocalId && f.productoBaseId);
  const yaEstaban = filas.filter((f) => f.productoLocalId);
  console.log(`  ya tenían producto escrito: ${yaEstaban.length} — no se tocan`);
  console.log(`  la cascada resuelve solos y faltan escribir: ${pendientes.length}`);
  for (const f of pendientes) {
    console.log(
      `     │ ${String(f.codigoProveedor ?? "-").padEnd(8)} ${String(f.textoCrudo).slice(0, 28).padEnd(28)}` +
        ` → base ${f.productoBaseId} · ${f.textoOrigen ?? f.origen}`
    );
  }

  if (!APLICAR) {
    console.log("\n  SIN --aplicar: no se escribió nada.");
    process.exit(0);
  }

  let bien = 0;
  const fallaron = [];
  for (const f of pendientes) {
    const r = await evaluar(
      `fetch("/api/compras-proveedor/comprobantes/vincular", {
         method: "POST", credentials: "same-origin",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           lineaId: ${Number(f.lineaId)},
           pedidoId: ${PEDIDO},
           textoCrudo: ${JSON.stringify(f.textoCrudo ?? null)},
           productoBaseId: ${Number(f.productoBaseId)},
           codigoProveedor: ${JSON.stringify(f.codigoProveedor ?? null)},
         }),
       }).then(async (r) => JSON.stringify({ status: r.status, cuerpo: await r.json().catch(() => null) }))`,
      true
    );
    const res = JSON.parse(r);
    if (res.cuerpo?.ok) bien += 1;
    else fallaron.push({ codigo: f.codigoProveedor, motivo: res.cuerpo?.queHacer || res.cuerpo?.error || res.status });
  }
  console.log(`\n  escritos: ${bien} de ${pendientes.length}`);
  for (const f of fallaron) console.log(`     ROJO ${f.codigo}: ${f.motivo}`);

  const despues = filasDe(await pedir());
  console.log(`  ahora con producto escrito: ${despues.filter((f) => f.productoLocalId).length} de ${despues.length}`);
  process.exit(fallaron.length ? 1 : 0);
} catch (e) {
  console.error(`\nROJO · no se pudo: ${e?.message || e}`);
  process.exit(1);
}
