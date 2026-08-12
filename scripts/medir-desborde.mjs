// scripts/medir-desborde.mjs
//
// MIDE SI ALGÚN BOTÓN DEL KIT DESBORDA SU CAJA, Y SACA LA CAPTURA COMPLETA.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// La pantalla de recetas llegó rota al celular con las capturas de 360 ya
// sacadas y miradas. El motivo no fue no mirar: `Page.captureScreenshot` sin
// `captureBeyondViewport` fotografía SOLO EL VIEWPORT, así que de un formulario
// de varios miles de píxeles de alto quedaban retratados 640. Lo que se rompía
// estaba arriba del recorte.
//
// Y aunque hubiera entrado, un desborde de 4 píxeles se ve como una tarjeta un
// poco pegada a la otra, no como un error. Por eso acá se MIDE en vez de mirar:
// `scrollHeight > clientHeight` es un número, y el ojo no tiene que decidir.
//
// Uso:
//   node scripts/medir-desborde.mjs --url /modulos/proveedores/recetas \
//     --ancho 360 --alto 640 --salida /tmp/desborde [--abrir-primero]

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : process.argv.includes(`--${n}`)
      ? true
      : d;
};

const BASE = arg("base", "http://localhost:3111");
const URL_REL = arg("url", "/");
const ANCHO = Number(arg("ancho", "360"));
const ALTO = Number(arg("alto", "640"));
const SALIDA = arg("salida", "/tmp/desborde");
const PERFIL = arg("perfil", path.join(SALIDA, "edge-profile"));
const PUERTO = Number(arg("puerto-cdp", "9224"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SALIDA, { recursive: true });

let ws, sessionId, id = 0;
const pending = new Map();

function send(method, params = {}, conSesion = true) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    `--window-size=${ANCHO},${ALTO}`,
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
const cerrar = () => { try { edge.kill(); } catch {} };
process.on("exit", cerrar);

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
  width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: true,
});

const destino = String(BASE) + String(URL_REL);
console.log("navegando a:", destino);
await send("Page.navigate", { url: destino });
await sleep(4000);

// Abrir el primer formulario, que es donde vive lo que se mide.
if (arg("abrir-primero")) {
  await evaluar(`(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Cargar|Cambiar/.test(x.textContent));
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(2500);
}

// ── LA MEDICIÓN ──────────────────────────────────────────────────────────
//
// Dos cosas, y las dos son números:
//   · cuánto mide la página contra cuánto entra en el viewport,
//   · qué elementos tienen más contenido del que su caja declara.
const medida = await evaluar(`(() => {
  const doc = document.scrollingElement || document.documentElement;
  const desbordan = [];
  for (const el of document.querySelectorAll("button, .sunmi-btn-base")) {
    const dif = el.scrollHeight - el.clientHeight;
    if (dif > 1) {
      desbordan.push({
        texto: (el.textContent || "").trim().slice(0, 46),
        alto: el.clientHeight,
        contenido: el.scrollHeight,
        seDerrama: dif,
      });
    }
  }
  // EL QUE SCROLLEA DE VERDAD. En esta aplicación NO es el documento: hay un
  // contenedor interno con overflow, así que el scrollHeight del documento da
  // exactamente el alto del viewport y una captura de página completa sale
  // idéntica a una de viewport. Sin mirar esto, la conclusión sería que la
  // pantalla entra entera.
  let scroller = null;
  for (const el of document.querySelectorAll("*")) {
    const o = getComputedStyle(el).overflowY;
    if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 4) {
      if (!scroller || el.scrollHeight > scroller.scrollHeight) scroller = el;
    }
  }
  // Los altos de los botones DE UNA SOLA LÍNEA. Tienen que seguir midiendo 36:
  // si el arreglo del desborde los cambiara, movería todas las pantallas del
  // sistema, que es un precio que este problema no justifica.
  const unaLinea = [];
  for (const el of document.querySelectorAll(".sunmi-btn-base")) {
    const r = el.getBoundingClientRect();
    if (el.scrollHeight <= 40) unaLinea.push(Math.round(r.height));
  }

  return {
    altosDeUnaLinea: [...new Set(unaLinea)].sort((a, b) => a - b),
    scrollerInterno: scroller
      ? { etiqueta: scroller.tagName + "." + String(scroller.className).split(" ").slice(0,3).join("."),
          visible: scroller.clientHeight, contenido: scroller.scrollHeight }
      : null,
    altoDePagina: doc.scrollHeight,
    altoDelViewport: window.innerHeight,
    vecesQueNoEntra: +(doc.scrollHeight / window.innerHeight).toFixed(1),
    desbordan,
  };
})()`);

console.log(`Página: ${medida.altoDePagina}px de alto, viewport ${medida.altoDelViewport}px.`);
if (medida.scrollerInterno) {
  const s2 = medida.scrollerInterno;
  console.log(`EL QUE SCROLLEA ES UN CONTENEDOR INTERNO: ${s2.etiqueta}`);
  console.log(`  muestra ${s2.visible}px de ${s2.contenido}px → queda afuera el ${Math.round(100 - s2.visible/s2.contenido*100)} % del formulario.`);
  console.log("  Una captura de página completa NO lo arregla: el documento mide lo que el viewport.");
}
console.log(`Una captura de viewport retrata 1 de cada ${medida.vecesQueNoEntra} pantallas.`);
console.log(`Altos de los botones de una línea: ${medida.altosDeUnaLinea.join(", ")}px (tienen que ser 36).\n`);
if (medida.desbordan.length === 0) {
  console.log("Ningún elemento desborda su caja.");
} else {
  console.log(`DESBORDAN ${medida.desbordan.length} elemento(s):`);
  for (const d of medida.desbordan) {
    console.log(`  +${d.seDerrama}px  caja ${d.alto}px, contenido ${d.contenido}px — "${d.texto}"`);
  }
}

// ── PARA QUE LA CAPTURA MUESTRE EL FORMULARIO ENTERO ─────────────────────
//
// `captureBeyondViewport` solo no alcanza: acá el que recorta es un contenedor
// interno con overflow, así que el documento mide lo que el viewport y la foto
// sale igual que sin la opción. Hay que abrirle el recorte a ese contenedor
// ANTES de fotografiar.
//
// Se toca solo para la foto y en una pestaña descartable: no cambia nada de la
// aplicación, y sin esto el 92 % de la pantalla no aparece en ninguna imagen.
const alto = await evaluar(`(() => {
  for (const el of document.querySelectorAll("*")) {
    const o = getComputedStyle(el).overflowY;
    if (o === "auto" || o === "scroll") {
      el.style.overflow = "visible";
      el.style.maxHeight = "none";
      el.style.height = "auto";
    }
  }
  document.documentElement.style.height = "auto";
  document.body.style.height = "auto";
  return (document.scrollingElement || document.documentElement).scrollHeight;
})()`);
await sleep(500);
console.log(`\nPara la foto se abre el recorte: la pantalla completa mide ${alto}px.`);

const { data } = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: true,
});
const archivo = path.join(SALIDA, `${arg("nombre", "captura")}-${ANCHO}-completa.png`);
fs.writeFileSync(archivo, Buffer.from(data, "base64"));
console.log(`\nCaptura completa: ${archivo}`);

cerrar();
process.exit(medida.desbordan.length ? 1 : 0);
