// SONDA: ¿SE GUARDA LA DECISIÓN DE PRECIO DE UN RENGLÓN?
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// En la hoja de Corregir del pedido 242, "Dejar el que tenía" contestaba en
// rojo **"No existe esa línea."** y la decisión no se guardaba. Ese texto sale
// del servidor y es de adentro —habla de un id que la persona no eligió ni ve—,
// así que además de no funcionar, no se entendía.
//
// Lo que ningún candado podía atrapar: la ruta existe, sus funciones están
// probadas y el 404 sale de un `findFirst` que devuelve null. Quién manda qué
// id, y si ese id es el que la ruta busca, solo se contesta ejerciendo el
// camino entero contra datos reales.
//
// ── QUÉ MIDE, Y QUÉ NO ESCRIBE ────────────────────────────────────────────
//
// Entra con una sesión real, pide la conciliación del pedido —GET, no escribe
// nada— y muestra qué ids trae cada renglón. Con `--decidir` manda además la
// decisión y comprueba que el servidor la haya guardado, volviendo a pedir la
// conciliación.
//
// **`DEJA_EL_MIO` no escribe ningún costo**: solo registra que sobre estos dos
// precios ya se contestó. Es la única decisión que esta sonda manda, y por eso
// se puede ejercer sobre un pedido de verdad sin mover plata.
//
// Uso:
//   node --experimental-websocket scripts/sonda-decision-de-precio.mjs \
//     --base https://operix.cloud --pedido 242 --usuario x --clave y \
//     [--decidir "Papas Congeladas"]
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
const PEDIDO = arg("pedido", "242");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9349"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-decision-de-precio"));
// Qué renglón decidir, por un trozo de su nombre o del texto del papel. Vacío
// significa solo mirar.
const DECIDIR = arg("decidir", "");
// Lo mismo, pero TOCANDO la pantalla: abrir la hoja, elegir "Dejar el que
// tenía" y guardar. Es el gesto de la persona, que es el que falla.
const POR_PANTALLA = arg("por-pantalla", "");
// Un id de renglón que ya no existe, para ejercer el caso de la pantalla vieja.
const ID_MUERTO = arg("id-muerto", "");

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

/** La conciliación tal cual la recibe la pantalla. GET: no escribe nada. */
const pedirConciliacion = () =>
  evaluar(
    `fetch("/api/compras-proveedor/conciliacion/${PEDIDO}", { credentials: "same-origin", cache: "no-store" })
       .then((r) => r.json())`,
    true
  );

const filasDe = (d) =>
  (d?.grupos || []).flatMap((g) => g?.filas || []).concat(d?.filas || []);

console.log(`\n── LA DECISIÓN DE PRECIO DEL PEDIDO ${PEDIDO} ─────────────────────\n`);

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

  const datos = await pedirConciliacion();
  const filas = filasDe(datos);
  afirmar(filas.length > 0, `la conciliación trae renglones (${filas.length})`,
    "sin renglones no hay id que mirar: ¿el pedido tiene comprobante leído?");
  if (!filas.length) morir("la conciliación no devolvió renglones");

  console.log("");
  console.log("  ── QUÉ IDS TRAE CADA RENGLÓN ───────────────────────────────");
  for (const f of filas) {
    const nombre = (f.producto || f.textoCrudo || "—").slice(0, 30).padEnd(30);
    console.log(
      `     │ ${nombre} lineaId=${String(f.lineaId).padEnd(6)} pedidoDetalleId=${String(f.pedidoDetalleId)}` +
        ` decision=${f.decisionPrecio ? f.decisionPrecio.decision : "—"}`
    );
  }
  console.log("");

  // Todos los renglones tienen que traer el id del RENGLÓN DEL PAPEL, que es lo
  // que las tres rutas del control buscan. Sin él, la pantalla manda undefined
  // y el servidor contesta sobre una línea que nunca existió.
  const sinLinea = filas.filter((f) => !Number.isFinite(Number(f.lineaId)));
  afirmar(sinLinea.length === 0, "todos los renglones traen el id del renglón del papel",
    `${sinLinea.length} sin lineaId: ${sinLinea.map((f) => f.producto || f.textoCrudo).join(", ")}`);

  if (DECIDIR) {
    const objetivo = filas.find((f) =>
      `${f.producto || ""} ${f.textoCrudo || ""}`.toLowerCase().includes(DECIDIR.toLowerCase())
    );
    afirmar(!!objetivo, `está el renglón de «${DECIDIR}»`);
    if (!objetivo) morir(`no hay ningún renglón que diga «${DECIDIR}»`);

    // ── CON EL ID MUERTO, QUE ES EL CASO QUE FALLABA ──────────────────
    //
    // `--id-muerto` manda un id que ya no existe junto con el texto del papel,
    // que es exactamente lo que tiene un teléfono con la pantalla abierta desde
    // antes de la última lectura. Antes contestaba "No existe esa línea.".
    const idQueSeManda = ID_MUERTO ? Number(ID_MUERTO) : Number(objetivo.lineaId);
    console.log(
      `  mandando DEJA_EL_MIO sobre lineaId=${idQueSeManda}` +
        `${ID_MUERTO ? " (MUERTO, el vivo es " + objetivo.lineaId + ")" : ""} · no escribe ningún costo`
    );
    const r = await evaluar(
      `fetch("/api/compras-proveedor/comprobantes/aceptar-precio", {
         method: "POST",
         credentials: "same-origin",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           lineaId: ${idQueSeManda},
           pedidoId: ${Number(PEDIDO)},
           textoCrudo: ${JSON.stringify(objetivo.textoCrudo ?? null)},
           decision: "DEJA_EL_MIO",
         }),
       }).then(async (r) => JSON.stringify({ status: r.status, cuerpo: await r.json().catch(() => null) }))`,
      true
    );
    const res = JSON.parse(r);
    console.log(`  respuesta: ${res.status} · ${JSON.stringify(res.cuerpo)}`);
    afirmar(res.status === 200 && res.cuerpo?.ok === true, "el servidor guardó la decisión",
      res.cuerpo?.queHacer || res.cuerpo?.error || `status ${res.status}`);

    // Y se comprueba MIRANDO, no creyéndole a la respuesta: la conciliación
    // tiene que devolver la decisión guardada sobre ese renglón.
    await sleep(1500);
    const despues = filasDe(await pedirConciliacion()).find((f) => f.lineaId === objetivo.lineaId);
    console.log(`  la conciliación ahora dice: ${JSON.stringify(despues?.decisionPrecio ?? null)}`);
    afirmar(despues?.decisionPrecio?.decision === "DEJA_EL_MIO",
      "la decisión quedó guardada y la pantalla la vuelve a leer",
      `decisionPrecio = ${JSON.stringify(despues?.decisionPrecio ?? null)}`);
  }

  // ── Y EL MISMO GESTO, PERO POR LA PANTALLA ────────────────────────────
  //
  // Mandar el pedido a mano contesta "la ruta funciona". Lo que la persona hace
  // es abrir la hoja, tocar una opción y guardar, y ahí hay dos cosas más en el
  // medio: qué `fila` tiene la hoja abierta y qué le manda al servidor. Los
  // defectos de este módulo vivieron siempre ahí.
  if (POR_PANTALLA) {
    const objetivo = POR_PANTALLA;
    for (let i = 0; i < 40; i++) {
      await sleep(1000);
      if (await evaluar(`document.querySelectorAll("[data-linea-factura]").length > 0`)) break;
    }
    const abrio = await evaluar(`(() => {
      const t = Array.from(document.querySelectorAll("[data-linea-factura]"))
        .find((n) => (n.innerText || "").toLowerCase().includes(${JSON.stringify(objetivo.toLowerCase())}));
      if (!t) return "no-esta-la-tarjeta";
      // Una tarjeta YA REVISADA está colapsada y no tiene botón "Corregir":
      // se abre tocándola. Es el camino por el que se llega a la hoja de un
      // renglón ya controlado, que es justamente el caso del que se queja.
      const b =
        Array.from(t.querySelectorAll("button")).find((x) => /corregir/i.test(x.innerText || "")) ||
        t.querySelector("button");
      if (!b) return "no-esta-el-boton";
      b.click();
      return "ok";
    })()`);
    afirmar(abrio === "ok", `se pudo abrir Corregir de «${objetivo}» en la pantalla`, String(abrio));
    if (abrio !== "ok") morir(`no se pudo abrir la hoja: ${abrio}`);

    for (let i = 0; i < 30; i++) {
      await sleep(500);
      if (await evaluar(`/Dejar el que ten/.test(document.querySelector("[data-sunmi-modal]")?.innerText || "")`)) break;
    }
    const eligio = await evaluar(`(() => {
      const m = document.querySelector("[data-sunmi-modal]");
      if (!m) return "no-hay-hoja";
      const b = Array.from(m.querySelectorAll("button")).find((x) => /Dejar el que ten/i.test(x.innerText || ""));
      if (!b) return "no-esta-la-opcion";
      b.click();
      return "ok";
    })()`);
    afirmar(eligio === "ok", "está la opción «Dejar el que tenía»", String(eligio));
    if (eligio !== "ok") morir(`no se pudo elegir la opción: ${eligio}`);

    await sleep(400);
    const guardo = await evaluar(`(() => {
      const m = document.querySelector("[data-sunmi-modal]");
      const b = Array.from(m.querySelectorAll("button")).find((x) => /Revisado y seguir/i.test(x.innerText || ""));
      if (!b) return "no-esta-guardar";
      b.click();
      return "ok";
    })()`);
    afirmar(guardo === "ok", "está el botón de guardar", String(guardo));

    await sleep(3000);
    const rojo = await evaluar(`(() => {
      const m = document.querySelector("[data-sunmi-modal]");
      if (!m) return "";
      return Array.from(m.querySelectorAll(".sunmi-text-danger")).map((n) => n.innerText).join(" | ");
    })()`);
    const sigueAbierta = await evaluar(`!!document.querySelector("[data-sunmi-modal]")`);
    console.log(`  la hoja ${sigueAbierta ? "SIGUE ABIERTA" : "se cerró"} · en rojo: ${JSON.stringify(rojo)}`);
    afirmar(!rojo, "guardar por la pantalla no deja ningún cartel rojo", String(rojo));
  }

  console.log("");
  if (fallas.length) {
    console.error(`ROJO · ${fallas.length} de las afirmaciones no se cumplen.`);
    process.exit(1);
  }
  console.log("VERDE · la decisión de precio se guarda y se vuelve a leer.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
