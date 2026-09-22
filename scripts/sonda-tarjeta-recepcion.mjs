// SONDA: QUÉ DIBUJA DE VERDAD LA TARJETA DE UN PRODUCTO EN LA RECEPCIÓN.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// La tarjeta con las líneas "Papel" y "ERP" se desplegó y NO apareció en el
// celular. Lo que se había medido eran sus NÚMEROS —llamando a
// `renglonesDeLaTarjeta` desde afuera con los datos del servidor— y eso
// contesta "la cuenta da bien", no "la pantalla lo dibuja". Son dos preguntas
// distintas y la segunda es la que importaba.
//
// Es exactamente la regla 2 de CLAUDE.md: los candados prueban piezas, la
// pantalla prueba el camino, y los defectos viven entre las piezas.
//
// Uso:
//   node --experimental-websocket scripts/sonda-tarjeta-recepcion.mjs \
//     --base https://operix.cloud --pedido 242 --usuario x --clave y
//
// ROJO Y FRENA si no puede medir. Una pantalla que no cargó no es "no se pudo
// comprobar": es rojo.

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
const PEDIDO = arg("pedido", "242");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9347"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-tarjeta-recepcion"));
// Qué renglón abrir en la hoja de Corregir, por un trozo de su nombre. Vacío
// significa medir solo las tarjetas, que es como venía.
const CORREGIR = arg("corregir", "");
// Solo leer lo que la pantalla dice, sin exigir tarjetas de producto. Un pedido
// ya RECIBIDO dibuja otra pantalla —sin tarjetas— y ahí la sonda moría antes de
// poder mostrar nada.
const SOLO_TEXTO = process.argv.includes("--solo-texto");

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

console.log(`\n── LA TARJETA DE RECEPCIÓN, A 390 px ─────────────────────────────\n`);

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

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });

  await navegar(`${BASE}/modulos/compras-proveedor/${PEDIDO}`);
  // La conciliación llega por su propio pedido: hay que esperarla.
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    if (await evaluar(`document.querySelectorAll("[data-linea-factura]").length > 0`)) break;
  }

  const cuantas = await evaluar(`document.querySelectorAll("[data-linea-factura]").length`);
  if (SOLO_TEXTO) {
    const todo = await evaluar(
      `((document.querySelector("main") || document.body).innerText || "").slice(0, 2600)`
    );
    console.log("  ── LO QUE DICE LA PANTALLA ─────────────────────────────────");
    for (const l of String(todo).split("\n").filter((x) => x.trim())) console.log(`     │ ${l}`);
    process.exit(0);
  }
  afirmar(cuantas > 0, `la pantalla dibuja tarjetas de producto (${cuantas})`,
    "sin tarjetas no hay nada que medir: ¿la pantalla cargó? ¿el pedido tiene comprobante leído?");
  if (!cuantas) morir("no se dibujó ninguna tarjeta de producto");

  const texto = await evaluar(
    `Array.from(document.querySelectorAll("[data-linea-factura]")).map((n) => n.innerText).join("\\n───\\n")`
  );
  const primera = await evaluar(
    `(document.querySelector("[data-linea-factura]").innerText || "").slice(0, 400)`
  );

  // ── LO QUE DICE LA PANTALLA ARRIBA DE LAS TARJETAS ────────────────────
  //
  // Ahí vive el bloque del papel que no cerró. Si después de corregir vuelve a
  // pedir lo mismo, se ve acá y en ningún otro lado.
  const arriba = await evaluar(`(() => {
    const t = document.querySelector("[data-linea-factura]");
    // OJO: esto es el CUERPO DE UN TEMPLATE LITERAL. Nada de backticks acá
    // adentro, ni siquiera en un comentario: cierran la cadena y el archivo
    // deja de parsear. Ya pasó escribiendo este mismo bloque.
    // El contenido, no el menú lateral: el body arrastra las treinta entradas
    // del sidebar y tapa lo único que se quiere leer.
    const todo = (document.querySelector("main") || document.body).innerText || "";
    if (!t) return todo.slice(0, 900);
    const primeraLinea = (t.innerText || "").split(String.fromCharCode(10))[0];
    const corte = todo.indexOf(primeraLinea);
    return corte > 0 ? todo.slice(0, corte) : todo.slice(0, 900);
  })()`);
  console.log("");
  console.log("  ── LO QUE DICE LA PANTALLA ARRIBA DE LAS TARJETAS ──────────");
  for (const l of String(arriba).split("\n").filter((x) => x.trim())) console.log(`     │ ${l}`);

  console.log("");
  console.log("  ── LO QUE DICE LA PRIMERA TARJETA ──────────────────────────");
  for (const l of String(primera).split("\n")) console.log(`     │ ${l}`);
  console.log("");

  afirmar(/\bPapel\b/.test(texto), "alguna tarjeta muestra la línea «Papel»");
  afirmar(/\bERP\b/.test(texto), "alguna tarjeta muestra la línea «ERP»");
  afirmar(/\bFactura\b/.test(texto), "alguna tarjeta muestra la línea «Factura»");
  afirmar(/\/\s*(u|kg|pack)\b/.test(texto), "los precios llevan su unidad al lado");
  afirmar(/[+−]\d+,\d\s*%/.test(texto), "se ve el porcentaje contra el ERP");
  // Lo que se fue.
  afirmar(!/Ya decidido/.test(texto), "no volvió «Ya decidido»");

  // ── Y SI SE PIDE, LA HOJA DE CORREGIR DE UN RENGLÓN ───────────────────
  //
  // La tarjeta y la hoja son dos pantallas distintas sobre el mismo renglón, y
  // los defectos de este módulo vivieron siempre en el espacio entre las dos:
  // la tarjeta decía "3 PACK x30" y la hoja ofrecía 3 unidades sueltas. Medir
  // solo la tarjeta deja ese espacio sin mirar.
  //
  // Abre la hoja y LEE. No guarda: tocar "Guardar" recibiría mercadería.
  if (CORREGIR) {
    // Primero la TARJETA de ese renglón, que es la otra mitad del par: si la
    // tarjeta y la hoja dicen cosas distintas sobre el mismo renglón, se ve acá.
    const tarjeta = await evaluar(`(() => {
      const t = Array.from(document.querySelectorAll("[data-linea-factura]"))
        .find((n) => (n.innerText || "").toLowerCase().includes(${JSON.stringify(CORREGIR.toLowerCase())}));
      return t ? t.innerText : "";
    })()`);
    console.log("");
    console.log(`  ── LO QUE DICE LA TARJETA DE «${CORREGIR}» ─────────────────`);
    for (const l of String(tarjeta).split("\n")) console.log(`     │ ${l}`);

    const abrio = await evaluar(`(() => {
      const tarjetas = Array.from(document.querySelectorAll("[data-linea-factura]"));
      const t = tarjetas.find((n) => (n.innerText || "").toLowerCase().includes(${JSON.stringify(
        CORREGIR.toLowerCase()
      )}));
      if (!t) return "no-esta-la-tarjeta";
      const b = Array.from(t.querySelectorAll("button")).find((x) => /corregir/i.test(x.innerText || ""));
      if (!b) return "no-esta-el-boton";
      b.click();
      return "ok";
    })()`);
    afirmar(abrio === "ok", `se pudo abrir Corregir de «${CORREGIR}»`, String(abrio));
    if (abrio !== "ok") morir(`no se pudo abrir la hoja: ${abrio}`);

    let hoja = "";
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      hoja = String(
        await evaluar(
          `(() => { const m = document.querySelector("[data-sunmi-modal]"); return m ? m.innerText : ""; })()`
        ) || ""
      );
      if (/Entra al stock/i.test(hoja)) break;
    }
    if (!/Entra al stock/i.test(hoja)) morir("la hoja no llegó a dibujar «Entra al stock»");

    console.log("");
    console.log("  ── LO QUE DICE LA HOJA DE CORREGIR ─────────────────────────");
    for (const l of hoja.split("\n")) console.log(`     │ ${l}`);
    console.log("");
  }

  console.log("");
  if (fallas.length) {
    console.error(`ROJO · ${fallas.length} de las afirmaciones no se cumplen.`);
    process.exit(1);
  }
  console.log("VERDE · la tarjeta dibuja Factura, Papel y ERP en la pantalla real.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
