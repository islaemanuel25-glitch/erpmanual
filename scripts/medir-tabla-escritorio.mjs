// MIDE LA TABLA DE ESCRITORIO DE PRODUCTOS, para comparar dos árboles.
//
// ── PARA QUÉ ────────────────────────────────────────────────────────────────
//
// La restauración de posición se pasó de alcance: tocó también la tabla de
// escritorio, que estaba aprobada. El hotfix la devuelve a como estaba, y la
// única forma de afirmar "quedó exactamente igual" es MEDIRLA en los dos
// árboles y comparar los números.
//
// "Se ve igual" no lo contesta, y leer el diff tampoco: el diff dice que los
// archivos volvieron, no que la pantalla dibuje lo mismo — un prop que la
// pantalla siga pasando, o un import que quedó, no aparecen en esos dos
// archivos.
//
// ── QUÉ MIDE, Y POR QUÉ CADA COSA ──────────────────────────────────────────
//
// · la estructura: cuántas filas y cuántas celdas por fila;
// · las dimensiones: el ancho de cada columna y el alto de cada fila, que es lo
//   que se movería si una píldora agregara una caja;
// · el scroll: qué contenedor desplaza y cuánto sobrante tiene;
// · los atributos que esta función agregaba —`data-ancla`, `aria-current`— y el
//   rótulo de la marca, que tienen que dar CERO;
// · y una huella del HTML de la tabla, normalizada, que atrapa cualquier cambio
//   que las medidas de arriba no nombren.
//
// No afirma nada: imprime. Quién compara contra qué es del que lo corre.
//
// Uso:
//   node scripts/medir-tabla-escritorio.mjs --base http://localhost:3230 \
//     --usuario <mail> --clave <clave-de-desarrollo> --etiqueta ANTES

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const ANCHO = Number(arg("ancho", "1366"));
const ALTO = Number(arg("alto", "900"));
const PUERTO = Number(arg("puerto-cdp", "9251"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "medir-tabla"));
const ETIQUETA = arg("etiqueta", BASE);
const RUTA = arg("ruta", "/modulos/productos?page=2&q=a&sortKey=precioVenta&sortDir=desc");
const SALIDA = arg("salida", null);
// La foto de la MISMA pantalla que se está midiendo, en la misma corrida y con
// la misma espera. Existe para que la comparación de antes y después no sea solo
// una tabla de números: los números dicen que el sobrante pasó de 743 a 0, y la
// foto muestra qué se ve cuando eso pasa.
const CAPTURA = arg("captura", null);

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  throw new Error("Edge no respondió al puerto de depuración");
}

async function evaluar(e, ap = false) {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: ap });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

const edge = spawn(
  arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--disable-gpu"],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (m) => { console.error(`ROJO · no se pudo medir: ${m}`); process.exit(1); };

try {
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
  await send("Emulation.setDeviceMetricsOverride", {
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: () => {} });
  await navegar(`${BASE}${RUTA}`);

  // ── SE ESPERA A LA TABLA CON DATOS, NO A QUE HAYA UNA FILA ──────────────
  //
  // La condición era `tbody tr > 0`, y la cumple el estado VACÍO: `SunmiTableEmpty`
  // dibuja una fila de una sola celda con "No hay productos disponibles". La
  // primera corrida midió eso y devolvió `filas: 1, celdas: [1]` — una medición
  // perfectamente determinista de la pantalla equivocada.
  //
  // Ahora se exige una fila con MÁS DE UNA celda, que es lo que distingue una
  // fila de datos del cartel de vacío.
  let listo = false;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    listo = await evaluar(
      `[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`
    );
    if (listo) break;
  }
  if (!listo) {
    morir(
      "la tabla no llegó a tener filas de datos: puede ser el estado vacío, y medirlo daría " +
        "un número estable de la pantalla equivocada"
    );
  }
  await sleep(1200);

  const medida = JSON.parse(await evaluar(`(() => {
    const tabla = document.querySelector("table");
    if (!tabla) return JSON.stringify({ error: "sin tabla" });
    const filas = [...tabla.querySelectorAll("tbody tr")];
    const encabezados = [...tabla.querySelectorAll("thead th")];
    const cont = document.getElementById("productos-scroll");
    const main = document.querySelector("main");

    // El HTML de la tabla, normalizado: se sacan los espacios entre etiquetas
    // para que un salto de línea distinto no cuente como cambio.
    const html = tabla.outerHTML.replace(/>\\s+</g, "><").trim();

    return JSON.stringify({
      filas: filas.length,
      celdasPorFila: [...new Set(filas.map((f) => f.children.length))],
      anchosDeColumna: encabezados.map((th) => Math.round(th.getBoundingClientRect().width)),
      altosDeFila: [...new Set(filas.map((f) => Math.round(f.getBoundingClientRect().height)))],
      altoDeLaTabla: Math.round(tabla.getBoundingClientRect().height),
      scroll: {
        contenedor: cont
          ? { top: Math.round(cont.scrollTop), sobrante: Math.round(cont.scrollHeight - cont.clientHeight) }
          : null,
        main: main
          ? { top: Math.round(main.scrollTop), sobrante: Math.round(main.scrollHeight - main.clientHeight) }
          : null,
      },
      // ── EL EJE HORIZONTAL, QUE ANTES NO SE MEDÍA ──────────────────────────
      //
      // Se agregó al sacarle a la tabla su scroll vertical propio. La pregunta
      // que contesta es cuál de los dos contenedores se queda el desplazamiento
      // lateral cuando las columnas no entran: sin esto, "conservar el scroll
      // horizontal" es una afirmación sin número atrás.
      //
      // Va junto con el overflow calculado y con el position del thead, porque
      // los tres se mueven a la vez: un contenedor que declara overflow en
      // cualquier eje se vuelve el ámbito de lo pegajoso, y ahí el encabezado
      // deja de seguir al scroll de la página.
      //
      // Y OJO CON LAS COMILLAS INVERTIDAS: esto es el cuerpo de un template
      // literal, así que una sola en un comentario cierra la cadena y el archivo
      // deja de parsear. Ya pasó al escribir este mismo bloque.
      horizontal: {
        contenedor: cont
          ? { sobrante: Math.round(cont.scrollWidth - cont.clientWidth) }
          : null,
        main: main ? { sobrante: Math.round(main.scrollWidth - main.clientWidth) } : null,
      },
      // OJO: esto es el cuerpo de un template literal. Nada de interpolaciones
      // acá adentro —se las comería Node antes de que el navegador las vea—, así
      // que las cadenas se arman concatenando.
      overflow: {
        contenedor: cont
          ? getComputedStyle(cont).overflowX + "/" + getComputedStyle(cont).overflowY
          : null,
        main: main
          ? getComputedStyle(main).overflowX + "/" + getComputedStyle(main).overflowY
          : null,
        maxHeightContenedor: cont ? getComputedStyle(cont).maxHeight : null,
      },
      thead: (() => {
        const th = tabla.querySelector("thead");
        return th ? getComputedStyle(th).position : null;
      })(),
      conAncla: tabla.querySelectorAll("[data-ancla]").length,
      conAriaCurrent: tabla.querySelectorAll('[aria-current]').length,
      conElRotulo: (tabla.innerText.match(/Último editado/g) || []).length,
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      huella: html.length,
      html,
    });
  })()`));

  if (medida.error) morir(medida.error);

  const huella = crypto.createHash("sha256").update(medida.html).digest("hex").slice(0, 16);
  const { html, ...sinHtml } = medida;

  console.log(`${ETIQUETA}`);
  console.log(`  filas:             ${sinHtml.filas}`);
  console.log(`  celdas por fila:   ${JSON.stringify(sinHtml.celdasPorFila)}`);
  console.log(`  anchos de columna: ${JSON.stringify(sinHtml.anchosDeColumna)}`);
  console.log(`  altos de fila:     ${JSON.stringify(sinHtml.altosDeFila)}`);
  console.log(`  alto de la tabla:  ${sinHtml.altoDeLaTabla}`);
  console.log(`  scroll:            ${JSON.stringify(sinHtml.scroll)}`);
  console.log(`  horizontal:        ${JSON.stringify(sinHtml.horizontal)}`);
  console.log(`  overflow:          ${JSON.stringify(sinHtml.overflow)}`);
  console.log(`  position del thead:${sinHtml.thead}`);
  console.log(`  con data-ancla:    ${sinHtml.conAncla}`);
  console.log(`  con aria-current:  ${sinHtml.conAriaCurrent}`);
  console.log(`  con el rótulo:     ${sinHtml.conElRotulo}`);
  console.log(`  desborde:          ${sinHtml.desborde}`);
  console.log(`  huella del HTML:   ${huella} (${sinHtml.huella} caracteres)`);

  if (SALIDA) {
    fs.writeFileSync(SALIDA, JSON.stringify({ ...sinHtml, huella }, null, 2), "utf8");
    console.log(`  guardado en:       ${SALIDA}`);
  }

  if (CAPTURA) {
    fs.mkdirSync(path.dirname(CAPTURA), { recursive: true });
    const foto = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(CAPTURA, Buffer.from(foto.data, "base64"));
    console.log(`  captura:           ${CAPTURA}`);
  }
} catch (err) {
  morir(err?.message || String(err));
}
process.exit(0);
