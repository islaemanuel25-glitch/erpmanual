// SONDA: LO QUE LA PANTALLA DE UN PEDIDO RECIBIDO AFIRMA SOBRE EL PAPEL.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El 2026-09-21, con `037ac915` en producción, el pedido 232 —que tiene el
// comprobante 5 leído, con 15 renglones— mostró en pantalla "Este pedido se
// cerró sin ningún papel del proveedor" y "Estos 24 no venían en el papel".
// Las dos frases son falsas y hablan de mercadería.
//
// Nada de lo que corre en un despliegue podía verlo: la suite son funciones
// puras, el build compila, el marcador prueba que el texto VIAJÓ —no que se
// diga en el momento correcto—, y `sonda-consola.mjs` mira si la pantalla
// explota, no qué dice. La pantalla cargaba perfecto. Mentía perfecto.
//
// ── QUÉ AFIRMA, Y POR QUÉ ASÍ ──────────────────────────────────────────────
//
// Le pregunta lo mismo a las dos partes y las cruza:
//
//   · AL SERVIDOR, por `/api/compras-proveedor/conciliacion/<id>`: cuántos
//     comprobantes tiene el pedido y cuántos renglones trajeron.
//   · A LA PANTALLA, leyendo su texto.
//
// Y exige que no se contradigan. Ese cruce es el punto: el defecto no fue una
// frase mal escrita, fueron dos criterios distintos para la misma pregunta —el
// servidor encontraba el papel y la pantalla lo resolvía de otra manera—, que
// es el defecto que este módulo ya vio cuatro veces. Un candado que mire un
// solo lado no lo puede ver.
//
// Imprime el texto de la pantalla siempre, aunque dé verde: el que lo corre
// tiene que poder LEER lo que sale, no solo enterarse de que cargó.
//
// Uso:
//   node --experimental-websocket scripts/sonda-pedido-recibido.mjs \
//     --base https://operix.cloud --pedido 232 \
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
const PEDIDO = arg("pedido", "232");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9351"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-pedido-recibido"));
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

// La frase prohibida, textual. Se busca sin acentos hasta donde se puede, pero
// acá el texto vive en un nodo JSX común y los acentos sobreviven.
const FRASE_SIN_PAPEL = "sin ningún papel del proveedor";

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
  await navegar(`${BASE}/modulos/compras-proveedor/${PEDIDO}`);
  await sleep(7000);

  console.log(`\n── EL PEDIDO ${PEDIDO} EN ${BASE} ────────────────────────────\n`);

  // ── LO QUE DICE EL SERVIDOR ─────────────────────────────────────────────
  //
  // Se pide DESDE la pantalla, con su sesión, que es la misma respuesta que la
  // pantalla usa. Preguntarle a otra fuente mediría otra cosa.
  const delServidor = await evaluar(
    `fetch("/api/compras-proveedor/conciliacion/${PEDIDO}", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => ({
        ok: d?.ok === true,
        comprobantes: Array.isArray(d?.grupos) ? d.grupos.length : null,
        renglones: Array.isArray(d?.grupos) ? d.grupos.reduce((a, g) => a + (g?.filas?.length || 0), 0) : null,
        sinComprobante: Array.isArray(d?.sinComprobante) ? d.sinComprobante.length : null,
      }))
      .catch((e) => ({ ok: false, error: String(e) }))`,
    true
  );
  if (!delServidor?.ok) morir(`la conciliación no contestó: ${delServidor?.error || "sin ok"}`);
  console.log(`  el servidor dice: ${delServidor.comprobantes} comprobante(s), ${delServidor.renglones} renglones, ${delServidor.sinComprobante} líneas que el papel no trajo`);

  const texto = await evaluar(`(document.body.innerText || "")`);
  const estado = await evaluar(`(document.body.innerText || "").includes("Recibido")`);

  console.log(`\n── LO QUE DICE LA PANTALLA ──────────────────────────────────\n`);
  console.log(texto.split("\n").filter((l) => l.trim()).map((l) => `  │ ${l}`).join("\n"));
  console.log("");

  const rota = /Application error|client-side exception/i.test(texto);
  afirmar(!rota, "la pantalla no explotó", texto.slice(0, 200));
  afirmar(estado, "es la pantalla de un pedido recibido", "no se encontró el estado en el texto");

  const dice = (t) => texto.includes(t);
  const conPapel = delServidor.comprobantes > 0;

  if (conPapel) {
    afirmar(
      !dice(FRASE_SIN_PAPEL),
      "NO afirma que el pedido no tiene papel",
      `el servidor encontró ${delServidor.comprobantes} comprobante(s) y la pantalla dice que no hay ninguno`
    );
  }
  if (delServidor.renglones > 0) {
    afirmar(dice("Te facturó"), "dice cuánto facturó el proveedor");
    afirmar(dice("A tus precios vale"), "dice cuánto vale a los precios propios");
    afirmar(dice("Ganás"), "dice la ganancia del depósito");
    afirmar(dice("El papel de"), "está la tarjeta del papel");
    afirmar(dice("Entró esto"), "está la lista de lo que entró");
    // ── Y EN CASTELLANO, QUE ES LA OTRA MITAD ───────────────────────────
    //
    // "Renglón", "línea" e "ítem" son idioma de sistema. Esto no es estilo: la
    // pantalla la mira alguien que acaba de recibir mercadería, y lo que hay en
    // el papel son productos. Se mira el texto de la pantalla, no el marcado,
    // así que las clases de Tailwind —`items-center`— no cuentan.
    for (const deSistema of ["renglón", "renglones", "línea", "líneas", "ítems", " items"]) {
      afirmar(!dice(deSistema), `no usa la palabra de sistema "${deSistema.trim()}"`,
        `aparece en la pantalla: ${(texto.match(new RegExp(`.{0,40}${deSistema.trim()}.{0,20}`)) || [])[0] || ""}`);
    }
  }
  if (!conPapel) {
    afirmar(
      dice(FRASE_SIN_PAPEL),
      "un pedido sin comprobantes sí lo dice",
      "el servidor no encontró ningún comprobante y la pantalla no lo aclara"
    );
  }

  console.log(
    `\n${fallas.length === 0 ? "VERDE" : "ROJO "} · ${fallas.length === 0 ? "la pantalla y el servidor dicen lo mismo." : `${fallas.length} afirmación(es) en rojo.`}`
  );
  process.exit(fallas.length === 0 ? 0 : 1);
} catch (e) {
  morir(e?.message || String(e));
}
