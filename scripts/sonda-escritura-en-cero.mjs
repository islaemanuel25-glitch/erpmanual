// SONDA: QUÉ INFORMA EL NAVEGADOR AL ESCRIBIR Y AL PEGAR SOBRE UN CAMPO EN 0.
//
//   node scripts/sonda-escritura-en-cero.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave 123456 --edge /usr/bin/google-chrome
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// La corrección del "campo en 0" tiene que distinguir dos cosas que producen
// exactamente el mismo texto:
//
//   · el campo mostraba `0`, la persona TECLEA un `1`  → tiene que quedar `1`
//   · el campo mostraba `0`, la persona PEGA `"10"`    → tiene que quedar `10`
//
// Mirando solo el texto son indistinguibles: en los dos casos se pasó de `"0"` a
// `"10"`. La única forma de separarlos es preguntarle al navegador QUÉ OPERACIÓN
// ocurrió, y eso vive en el evento nativo: `inputType` y `data`.
//
// Esta sonda lo mide sobre el input REAL de la pantalla —`type="number"`,
// controlado por React, dentro de `SunmiInput`— y no sobre un input de juguete,
// porque justamente lo que está en duda es si esa señal sobrevive a esa
// combinación.
//
// ── POR QUÉ EL CARETO SE PONE CON UN CLIC Y NO CON `setSelectionRange` ─────
//
// Porque un `<input type="number">` NO soporta `selectionStart` ni
// `setSelectionRange`: Chrome lanza `InvalidStateError`. O sea que la posición
// del cursor —que es lo que decide si el dígito entra antes o después del cero—
// solo se puede fijar como la fija una persona: tocando el campo. Se clickea
// cerca del borde izquierdo o del derecho.
//
// ── Y POR QUÉ EL PEGADO SE HACE CON EL PORTAPAPELES DE VERDAD ─────────────
//
// Un `ClipboardEvent` fabricado a mano no pega nada: no ejecuta la acción por
// defecto, así que el `input` que interesa medir no llega a ocurrir. Acá se
// copia desde un `textarea` con el comando de edición `copy` y se pega con
// `paste`, que es el mismo camino que usa el teclado.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO. Que el navegador no levante, que la pantalla no
// cargue o que no aparezcan los campos salen con 1 diciendo cuál.

import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const USUARIO = arg("usuario", null);
const CLAVE = arg("clave", null);
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9224"));
const PERFIL = path.join(tmpdir(), "sonda-escritura-en-cero");
const RUTA = arg("ruta", "/modulos/configuracion/pos-ventas/cobros/defecto%3AEFECTIVO");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pasadas = 0;
const fallas = [];
const ok = (t, c, d = "") => {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
};

function frenar(motivo) {
  console.error(`\nNO SE PUDO MEDIR: ${motivo}`);
  process.exit(1);
}

// ── Transporte CDP ─────────────────────────────────────────────────────────

let ws, sessionId, id = 0;
const pending = new Map();

const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  frenar("el navegador no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    const listo = await evaluar(
      `document.readyState === "complete" && location.pathname !== "about:blank"`
    );
    if (listo) return;
  }
}

const navegador = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=390,1200",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" }
);
const cerrar = () => { try { navegador.kill(); } catch {} };
process.on("exit", cerrar);
process.on("SIGINT", () => { cerrar(); process.exit(130); });

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
  width: 390, height: 1200, deviceScaleFactor: 1, mobile: true,
});

if (!USUARIO || !CLAVE) frenar("faltan --usuario y --clave");
await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

// ── El campo que se mide ───────────────────────────────────────────────────

/**
 * Deja la pantalla cargada, el campo identificado por su rótulo y un oyente
 * anotando cada evento `input` con lo que el navegador informa.
 *
 * Se recarga entre casos a propósito: devolver el campo a `0` a mano exigiría
 * fabricar un evento, y un evento fabricado es justamente lo que esta sonda no
 * puede usar como medición.
 */
async function preparar(rotulo) {
  await navegar(`${BASE}${RUTA}`);

  for (let i = 0; i < 60; i++) {
    const listo = await evaluar(`!!document.querySelector('input[type="number"]')`);
    if (listo) break;
    await sleep(250);
  }

  const info = await evaluar(`(() => {
    const inputs = [...document.querySelectorAll('input[type="number"]')];
    // El campo se identifica por el TEXTO de su fila, no por su posición: si
    // mañana se agrega otro número arriba, un índice mediría el equivocado.
    const conRotulo = inputs.map((i) => {
      let nodo = i, texto = "";
      for (let n = 0; n < 5 && nodo; n++) { nodo = nodo.parentElement; texto = nodo ? nodo.textContent : texto; }
      return { texto: (texto || "").slice(0, 60), valor: i.value };
    });
    const idx = conRotulo.findIndex((c) => c.texto.includes(${JSON.stringify(rotulo)}));
    if (idx < 0) return { error: "no se encontró el campo", campos: conRotulo };

    window.__campo = inputs[idx];
    window.__medidas = [];
    window.__campo.addEventListener("input", (e) => {
      window.__medidas.push({ inputType: e.inputType, data: e.data, valor: e.target.value });
    });
    const r = window.__campo.getBoundingClientRect();
    return { valor: window.__campo.value, caja: { x: r.x, y: r.y, w: r.width, h: r.height }, rotulo: conRotulo[idx].texto };
  })()`);

  if (!info || info.error) frenar(`${info?.error || "no se pudo preparar el campo"} — ${JSON.stringify(info?.campos || null)}`);
  return info;
}

/** Un clic dentro del campo, cerca del borde que se indique. */
async function clic(caja, lado) {
  const x = lado === "izquierda" ? caja.x + 4 : caja.x + caja.w - 4;
  const y = caja.y + caja.h / 2;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
  await sleep(80);
}

/** Una tecla de verdad, con su texto: es lo que hace que el navegador informe `insertText`. */
async function teclear(digito) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key: digito, code: `Digit${digito}`, text: digito,
    unmodifiedText: digito, windowsVirtualKeyCode: 48 + Number(digito),
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp", key: digito, code: `Digit${digito}`,
    windowsVirtualKeyCode: 48 + Number(digito),
  });
  await sleep(120);
}

/** Deja `texto` en el portapapeles del sistema, copiándolo desde un textarea real. */
async function copiarAlPortapapeles(texto) {
  await evaluar(`(() => {
    let t = document.getElementById("__copiador");
    if (!t) {
      t = document.createElement("textarea");
      t.id = "__copiador";
      t.style.position = "fixed"; t.style.top = "0"; t.style.left = "0"; t.style.opacity = "0";
      document.body.appendChild(t);
    }
    t.value = ${JSON.stringify(texto)};
    t.focus();
    t.setSelectionRange(0, t.value.length);
    return t.value;
  })()`);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "c", code: "KeyC", modifiers: 2,
    windowsVirtualKeyCode: 67, commands: ["copy"],
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
  await sleep(120);
}

/** Un pegado de verdad, con el comando de edición del navegador. */
async function pegar() {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "v", code: "KeyV", modifiers: 2,
    windowsVirtualKeyCode: 86, commands: ["paste"],
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "v", code: "KeyV", modifiers: 2, windowsVirtualKeyCode: 86 });
  await sleep(200);
}

const medidas = () => evaluar(`JSON.stringify({ eventos: window.__medidas, valor: window.__campo.value })`);

function informar(nombre, crudo) {
  const { eventos, valor } = JSON.parse(crudo);
  console.log(`\n  ── ${nombre} ──`);
  if (!eventos.length) console.log("    (ningún evento `input`)");
  for (const e of eventos) {
    console.log(`    inputType=${JSON.stringify(e.inputType)}  data=${JSON.stringify(e.data)}  value=${JSON.stringify(e.valor)}`);
  }
  console.log(`    valor final del campo: ${JSON.stringify(valor)}`);
  return { eventos, valor };
}

// ══════════════════════════════════════════════════════════════════════════
// LOS CUATRO CASOS
// ══════════════════════════════════════════════════════════════════════════

console.log(`\nMidiendo sobre ${RUTA} — campo "Recargo al cliente"`);

// A. Teclear con el cursor ANTES del cero. Es el caso que reportó el local.
let campo = await preparar("Recargo al cliente");
if (campo.valor !== "0") frenar(`el campo no arranca en 0, arranca en ${JSON.stringify(campo.valor)}`);
console.log(`\n  campo identificado por su fila: ${JSON.stringify(campo.rotulo)}`);
await clic(campo.caja, "izquierda");
await teclear("1");
const A = informar("A · valor 0, teclear 1 con el cursor ANTES del cero", await medidas());

// B. Teclear con el cursor DESPUÉS del cero.
campo = await preparar("Recargo al cliente");
await clic(campo.caja, "derecha");
await teclear("1");
const B = informar("B · valor 0, teclear 1 con el cursor DESPUÉS del cero", await medidas());

// C. Pegar "10". Produce el MISMO texto que el caso A y tiene que quedar distinto.
campo = await preparar("Recargo al cliente");
await copiarAlPortapapeles("10");
await clic(campo.caja, "derecha");
await evaluar(`window.__medidas = []`);
await pegar();
const C = informar('C · valor 0, PEGAR "10"', await medidas());

// D. Pegar "12".
campo = await preparar("Recargo al cliente");
await copiarAlPortapapeles("12");
await clic(campo.caja, "derecha");
await evaluar(`window.__medidas = []`);
await pegar();
const D = informar('D · valor 0, PEGAR "12"', await medidas());

// ══════════════════════════════════════════════════════════════════════════
// LO QUE SE AFIRMA
// ══════════════════════════════════════════════════════════════════════════

console.log("\n── la señal del navegador ──");

const tipos = (m) => m.eventos.map((e) => e.inputType).join(",");
ok("teclear informa `insertText`", tipos(A).includes("insertText"), `informó ${tipos(A) || "nada"}`);
ok("teclear informa el dígito en `data`", A.eventos.some((e) => e.data === "1"), JSON.stringify(A.eventos));
ok(
  "PEGAR informa algo DISTINTO de `insertText`",
  C.eventos.length > 0 && !tipos(C).includes("insertText"),
  `informó ${tipos(C) || "nada"} — sin esta diferencia no se pueden separar los dos casos`
);
ok("y ese algo es `insertFromPaste`", tipos(C).includes("insertFromPaste"), `informó ${tipos(C) || "nada"}`);

console.log("\n── lo que tiene que quedar en el campo ──");
ok("A · 0 + tecla 1 → 1", A.valor === "1", `quedó ${JSON.stringify(A.valor)}`);
ok("B · 0 + tecla 1 (cursor a la derecha) → 1", B.valor === "1", `quedó ${JSON.stringify(B.valor)}`);
ok('C · 0 + pegar "10" → 10', C.valor === "10", `quedó ${JSON.stringify(C.valor)}`);
ok('D · 0 + pegar "12" → 12', D.valor === "12", `quedó ${JSON.stringify(D.valor)}`);

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  console.log("\nEN ROJO:");
  for (const f of fallas) console.log(`  · ${f}`);
  process.exit(1);
}
