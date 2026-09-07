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
import fs from "node:fs";
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
/** Dónde dejar las fotos del campo enfocado. Sin esto, la sonda solo mide. */
const CAPTURAS = arg("capturas", null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pasadas = 0;
const fallas = [];
const ok = (t, c, d = "") => {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
};
const seccion = (t) => console.log(`\n  ── ${t} ${"─".repeat(Math.max(0, 58 - t.length))}`);

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
/**
 * Suelta los dos recursos que esta sonda abre: el socket de CDP y el navegador
 * que levantó.
 *
 * Los DOS, y no solo el navegador. Node no termina mientras quede un handle
 * abierto, y el socket es uno: con él vivo el proceso se quedaba corriendo
 * después de imprimir su resultado, el paso del workflow no avanzaba nunca y el
 * job se cortaba por `timeout-minutes`. Lo peor de ese defecto es que solo
 * ocurría en el camino EXITOSO —el de error salía por `process.exit`—, así que
 * la sonda terminaba bien cuando fallaba y se colgaba cuando pasaba.
 *
 * `process.on("exit")` no alcanzaba para eso: ese evento no se emite mientras
 * haya handles abiertos, que es exactamente lo que impedía terminar.
 */
const cerrar = () => {
  try { ws?.close(); } catch {}
  try { navegador.kill(); } catch {}
};
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
    // El campo se identifica por el TEXTO de su fila y no por su posición: si
    // mañana se agrega otro número arriba, un índice mediría el equivocado.
    //
    // La fila es el elemento MÁS CHICO que contiene el rótulo y un input. Subir
    // una cantidad fija de niveles no sirve: se pasa de largo y termina midiendo
    // el texto de la pantalla entera.
    const filas = [...document.querySelectorAll("div")]
      .filter((el) => el.querySelector('input[type="number"]') && el.textContent.includes(${JSON.stringify(rotulo)}))
      .sort((a, b) => a.textContent.length - b.textContent.length);

    if (!filas.length) {
      const campos = [...document.querySelectorAll('input[type="number"]')].map((i) => i.value);
      return { error: "no se encontró la fila del campo", campos };
    }

    window.__campo = filas[0].querySelector('input[type="number"]');
    window.__medidas = [];
    window.__campo.addEventListener("input", (e) => {
      window.__medidas.push({ inputType: e.inputType, data: e.data, valor: e.target.value });
    });
    const r = window.__campo.getBoundingClientRect();
    return {
      valor: window.__campo.value,
      caja: { x: r.x, y: r.y, w: r.width, h: r.height },
      rotulo: filas[0].textContent.slice(0, 60),
    };
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

/**
 * QUÉ HAY SELECCIONADO ADENTRO DEL CAMPO, medido copiando.
 *
 * No se puede preguntar de frente: en un `<input type="number">` Chrome lanza
 * `InvalidStateError` al leer `selectionStart`. Lo que sí se puede es ejercer el
 * comando de copiar del navegador y ver qué quedó en el portapapeles.
 *
 * El centinela es lo que hace que la medición signifique algo: si no hay nada
 * seleccionado, el comando de copiar no pisa el portapapeles y lo que se lee es
 * el centinela. Sin él, "no se copió nada" y "se copió lo de antes" darían lo
 * mismo.
 */
async function loSeleccionado() {
  const CENTINELA = "SIN-SELECCION";
  await copiarAlPortapapeles(CENTINELA);

  // Volver al campo SIN tocar su contenido: el clic ya lo dejó enfocado antes de
  // llamar acá, pero copiar desde el textarea movió el foco.
  await evaluar(`window.__campo.focus()`);
  await send("Input.dispatchKeyEvent", {
    type: "keyDown", key: "c", code: "KeyC", modifiers: 2,
    windowsVirtualKeyCode: 67, commands: ["copy"],
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
  await sleep(120);

  const leido = await evaluar(`(() => {
    const t = document.getElementById("__copiador");
    t.value = "";
    t.focus();
    return "listo";
  })()`);
  if (leido !== "listo") frenar("no se pudo preparar la lectura del portapapeles");

  await pegar();
  return evaluar(`document.getElementById("__copiador").value`);
}

/** Una foto del campo enfocado, para mirar con los ojos lo que se midió. */
async function retratar(caja, nombre) {
  if (!CAPTURAS) return null;
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    clip: {
      x: Math.max(0, caja.x - 12), y: Math.max(0, caja.y - 34),
      width: Math.min(390, caja.w + 24), height: caja.h + 48, scale: 3,
    },
  });
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const destino = path.join(CAPTURAS, `${nombre}.png`);
  fs.writeFileSync(destino, Buffer.from(data, "base64"));
  console.log(`    foto: ${destino}`);
  return destino;
}

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

// ── E. ENTRAR AL CAMPO: ¿QUEDA EL CERO SELECCIONADO? ───────────────────────
//
// Es lo que la persona VE antes de escribir. La lógica ya reemplaza el cero,
// pero con el cursor al costado del `0` parece que va a quedar `10`, y eso hace
// dudar a quien está cargando un recargo.

seccion("E · entrar al campo y ver qué queda seleccionado");

campo = await preparar("Recargo al cliente");
await clic(campo.caja, "derecha");

// La FOTO va primero, con el campo todavía enfocado. Leer el portapapeles mueve
// el foco al textarea, así que retratar después mostraba el campo apagado: una
// foto perfectamente nítida del momento equivocado.
await retratar(campo.caja, "foco-en-el-cero");

const seleccionAlEntrar = await loSeleccionado();
console.log(`    al entrar, lo seleccionado es: ${JSON.stringify(seleccionAlEntrar)}`);

// Y la pregunta del navegador, aparte de lo que haga la pantalla: ¿se puede
// seleccionar un `type="number"` sin que lance? `selectionStart` sí lanza.
campo = await preparar("Recargo al cliente");
await clic(campo.caja, "derecha");
const conSelect = await evaluar(`(() => {
  try { window.__campo.select(); return { ok: true, error: null }; }
  catch (e) { return { ok: false, error: String(e) }; }
})()`);
const seleccionForzada = conSelect.ok ? await loSeleccionado() : null;
console.log(`    select() sin excepción: ${conSelect.ok}${conSelect.error ? ` — ${conSelect.error}` : ""}`);
console.log(`    tras select(), lo seleccionado es: ${JSON.stringify(seleccionForzada)}`);

// Escribir con el cero seleccionado va en su PROPIA preparación, y no después de
// leer el portapapeles: esa lectura deja el foco en el textarea, así que la tecla
// caía ahí y la medición hablaba de la sonda en vez de la pantalla.
campo = await preparar("Recargo al cliente");
await clic(campo.caja, "derecha");
await evaluar(`window.__campo.select()`);
await teclear("1");
const trasSeleccionar = JSON.parse(await medidas()).valor;
console.log(`    y al teclear 1 con el cero seleccionado queda: ${JSON.stringify(trasSeleccionar)}`);

// ── F. UN VALOR QUE NO ES CERO NO SE SELECCIONA ────────────────────────────

seccion("F · un valor distinto de 0 no se reemplaza al entrar");

campo = await preparar("Recargo al cliente");
await clic(campo.caja, "derecha");
await teclear("1");
await teclear("2");
const doceEnElCampo = JSON.parse(await medidas()).valor;

// Salir del campo y volver a entrar: es el gesto que dispara el enfoque.
await evaluar(`window.__campo.blur()`);
await sleep(80);
await clic(campo.caja, "derecha");
const seleccionCon12 = await loSeleccionado();
console.log(`    con ${JSON.stringify(doceEnElCampo)} en el campo, lo seleccionado es: ${JSON.stringify(seleccionCon12)}`);

await evaluar(`window.__campo.focus()`);
await teclear("3");
const trasEscribirEn12 = JSON.parse(await medidas()).valor;
console.log(`    y al teclear 3 queda: ${JSON.stringify(trasEscribirEn12)}`);

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

console.log("\n── entrar al campo ──");
ok(
  "el navegador PUEDE seleccionar un type=number: `select()` no lanza",
  conSelect.ok,
  conSelect.error || ""
);
ok(
  "y esa selección cubre el cero",
  seleccionForzada === "0",
  `se copió ${JSON.stringify(seleccionForzada)}`
);
ok(
  "AL ENTRAR AL CAMPO, EL CERO QUEDA SELECCIONADO",
  seleccionAlEntrar === "0",
  `se copió ${JSON.stringify(seleccionAlEntrar)} — con el cero sin seleccionar, parece que el dígito se va a sumar al lado`
);
ok(
  "y escribir con el cero seleccionado sigue dejando el dígito solo",
  trasSeleccionar === "1",
  `quedó ${JSON.stringify(trasSeleccionar)}`
);
ok("un valor de dos dígitos NO se selecciona al entrar", seleccionCon12 !== "12", `se copió ${JSON.stringify(seleccionCon12)}`);
ok("y escribir sobre él lo sigue completando", trasEscribirEn12 === "123", `quedó ${JSON.stringify(trasEscribirEn12)}`);

console.log("\n── lo que tiene que quedar en el campo ──");
ok("A · 0 + tecla 1 → 1", A.valor === "1", `quedó ${JSON.stringify(A.valor)}`);
ok("B · 0 + tecla 1 (cursor a la derecha) → 1", B.valor === "1", `quedó ${JSON.stringify(B.valor)}`);
ok('C · 0 + pegar "10" → 10', C.valor === "10", `quedó ${JSON.stringify(C.valor)}`);
ok('D · 0 + pegar "12" → 12', D.valor === "12", `quedó ${JSON.stringify(D.valor)}`);


// ══ LA MATRIZ: LOS DOS CAMPOS, LOS MISMOS CASOS ═══════════════════════════
//
// Hasta acá la sonda medía SOLO "Recargo al cliente". El arreglo del 2026-09-06
// se aplicó a los dos campos por simetría, pero uno solo se ejerció en un
// navegador, y "se hizo igual en los dos" no es una medición.
//
// Los helpers de arriba ya eran genéricos —`preparar` recibe el rótulo— así que
// esto no duplica nada: recorre la misma maquinaria con los dos campos.
//
// SOBRE `selectionStart`: NO SE PUEDE LEER. En un `<input type="number">` Chrome
// lanza `InvalidStateError`. Por eso la selección se mide ejerciendo el comando
// de copiar y viendo qué quedó en el portapapeles, con un centinela para que
// "no se copió nada" y "se copió lo de antes" no den lo mismo. Es la evidencia
// alternativa que la sonda ya usaba, documentada arriba en `loSeleccionado`.

const CAMPOS = ["Recargo al cliente", "Comisión"];

/** Deja el campo con un valor de partida, tecleándolo como lo haría una persona. */
async function conValorInicial(rotulo, texto) {
  const info = await preparar(rotulo);
  await clic(info.caja, "derecha");
  for (const d of String(texto)) await teclear(d);
  await evaluar(`window.__medidas = []`);
  return info;
}

/** Llega al campo con TAB desde el primer input de la pantalla. */
async function entrarConTab(rotulo) {
  const info = await preparar(rotulo);
  await evaluar(`(() => { document.querySelector("input")?.focus(); return true; })()`);
  for (let i = 0; i < 40; i++) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await sleep(40);
    if (await evaluar(`document.activeElement === window.__campo`)) return { info, llego: true, tabs: i + 1 };
  }
  return { info, llego: false, tabs: 40 };
}

const detalle = (m) =>
  (m.eventos || []).map((e) => `inputType=${e.inputType} data=${JSON.stringify(e.data)} valor=${JSON.stringify(e.valor)}`).join(" | ") || "(sin eventos)";

for (const rotulo of CAMPOS) {
  seccion(`MATRIZ · ${rotulo}`);

  // ── CLICK, partiendo de 0 ────────────────────────────────────────────────
  let info = await preparar(rotulo);
  const valorInicial = info.valor;
  await clic(info.caja, "izquierda");
  const selAl0 = await loSeleccionado();
  // El foco vuelve al campo: `loSeleccionado` termina pegando en el textarea
  // auxiliar y se lo lleva. Sin esto la tecla no llega y el campo no informa
  // NINGÚN evento — que es exactamente el falso rojo que dio la primera corrida.
  // La entrada sigue siendo el click de arriba; esto solo repara al instrumento.
  await evaluar(`window.__campo.focus()`);
  await teclear("1");
  let m = JSON.parse(await medidas());
  console.log(`    antes=${JSON.stringify(valorInicial)} seleccion=${JSON.stringify(selAl0)} ${detalle(m)}`);
  ok(`${rotulo} · click · 0 + tecla 1 → 1`, m.valor === "1", `quedó ${JSON.stringify(m.valor)}`);

  info = await preparar(rotulo);
  await clic(info.caja, "izquierda");
  await teclear("7");
  m = JSON.parse(await medidas());
  console.log(`    antes=${JSON.stringify(info.valor)} ${detalle(m)}`);
  ok(`${rotulo} · click · 0 + tecla 7 → 7`, m.valor === "7", `quedó ${JSON.stringify(m.valor)}`);

  await teclear("5");
  m = JSON.parse(await medidas());
  console.log(`    y despues tecla 5 → ${detalle(m)}`);
  ok(`${rotulo} · click · 7 + tecla 5 → 75`, m.valor === "75", `quedó ${JSON.stringify(m.valor)}`);

  // ── CLICK, partiendo de 12 ───────────────────────────────────────────────
  info = await conValorInicial(rotulo, "12");
  await clic(info.caja, "derecha");
  const selEn12 = await loSeleccionado();
  await evaluar(`window.__campo.focus()`);
  await teclear("3");
  m = JSON.parse(await medidas());
  console.log(`    antes="12" seleccion=${JSON.stringify(selEn12)} ${detalle(m)}`);
  ok(`${rotulo} · click · 12 NO se selecciona entero`, selEn12 !== "12", `se copió ${JSON.stringify(selEn12)}`);
  ok(`${rotulo} · click · 12 + tecla 3 → 123`, m.valor === "123", `quedó ${JSON.stringify(m.valor)}`);

  // ── TAB, partiendo de 0 ──────────────────────────────────────────────────
  let t = await entrarConTab(rotulo);
  ok(`${rotulo} · Tab llega al campo`, t.llego, `no llegó en ${t.tabs} tabulaciones`);
  if (t.llego) {
    const selTab = await loSeleccionado();
    // La ENTRADA fue con Tab; este focus() solo repone lo que se llevó la
    // medición de la selección. No reemplaza a la forma de entrada.
    await evaluar(`window.__campo.focus()`);
    await teclear("1");
    m = JSON.parse(await medidas());
    console.log(`    TAB antes=${JSON.stringify(t.info.valor)} (${t.tabs} tabs) seleccion=${JSON.stringify(selTab)} ${detalle(m)}`);
    ok(`${rotulo} · Tab · 0 + tecla 1 → 1`, m.valor === "1", `quedó ${JSON.stringify(m.valor)}`);

    t = await entrarConTab(rotulo);
    await teclear("7");
    m = JSON.parse(await medidas());
    console.log(`    TAB ${detalle(m)}`);
    ok(`${rotulo} · Tab · 0 + tecla 7 → 7`, m.valor === "7", `quedó ${JSON.stringify(m.valor)}`);
  }

  // ── TAB, partiendo de 12 ─────────────────────────────────────────────────
  info = await conValorInicial(rotulo, "12");
  await evaluar(`(() => { document.querySelector("input")?.focus(); return true; })()`);
  let llegoTab12 = false;
  for (let i = 0; i < 40 && !llegoTab12; i++) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await sleep(40);
    llegoTab12 = await evaluar(`document.activeElement === window.__campo`);
  }
  if (llegoTab12) {
    const sel12Tab = await loSeleccionado();
    await evaluar(`window.__campo.focus()`);
    await teclear("3");
    m = JSON.parse(await medidas());
    console.log(`    TAB sobre 12: seleccion=${JSON.stringify(sel12Tab)} ${detalle(m)}`);
    // ── TAB Y CLICK NO ENTRAN IGUAL, Y ESO ES DEL NAVEGADOR ──────────────
    //
    // Estas dos afirmaciones decían antes "12 NO se selecciona entero" y
    // "12 + tecla 3 → 123", copiadas del caso del click. Estaban MAL: le exigían
    // al producto anular una convención del navegador que nadie pidió anular.
    //
    // Medido: al entrar con Tab a un campo con `12`, el navegador SELECCIONA EL
    // CONTENIDO COMPLETO —la lectura del portapapeles devuelve "12"— así que la
    // tecla reemplaza la selección y queda `3`. Entrando con click el mismo
    // campo devuelve SIN-SELECCION y `+3` da `123`.
    //
    // `alEscribirNumero` NI SIQUIERA INTERVIENE acá: su primera línea es
    // `if (String(anterior) !== "0") return valor`, y "12" no es "0". Lo que se
    // ve es el navegador, no el contrato.
    ok(`${rotulo} · Tab · 12 selecciona el contenido completo`, sel12Tab === "12", `se copió ${JSON.stringify(sel12Tab)}`);
    ok(`${rotulo} · Tab · 12 + tecla 3 reemplaza la selección → 3`, m.valor === "3", `quedó ${JSON.stringify(m.valor)}`);
  } else {
    ok(`${rotulo} · Tab llega al campo con 12`, false, "no llegó en 40 tabulaciones");
  }

  // ── PEGADO ───────────────────────────────────────────────────────────────
  for (const texto of ["10", "12"]) {
    info = await preparar(rotulo);
    await clic(info.caja, "izquierda");
    await copiarAlPortapapeles(texto);
    await evaluar(`window.__campo.focus()`);
    await evaluar(`window.__medidas = []`);
    await pegar();
    m = JSON.parse(await medidas());
    console.log(`    pegar ${JSON.stringify(texto)} sobre 0 → ${detalle(m)}`);
    ok(`${rotulo} · pegar "${texto}" sobre 0 → ${texto}`, m.valor === texto, `quedó ${JSON.stringify(m.valor)}`);
    ok(`${rotulo} · el pegado se distingue: insertFromPaste`,
      (m.eventos || []).some((e) => e.inputType === "insertFromPaste"),
      `informó ${(m.eventos || []).map((e) => e.inputType).join(",") || "nada"}`);
  }

  // ── BORRADO Y REESCRITURA ────────────────────────────────────────────────
  //
  // No se afirma un valor esperado para el estado vacío: se MIDE lo que el
  // producto hace hoy. Lo único que se exige es lo que sí es contrato — que
  // después de vaciar, escribir un dígito deje ese dígito solo.
  info = await conValorInicial(rotulo, "45");
  await clic(info.caja, "derecha");
  for (let i = 0; i < 6; i++) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await sleep(60);
  }
  const trasBorrar = await evaluar(`window.__campo.value`);
  console.log(`    tras borrar todo, el campo muestra ${JSON.stringify(trasBorrar)}`);
  await evaluar(`window.__medidas = []`);
  await teclear("4");
  m = JSON.parse(await medidas());
  console.log(`    y escribir 4 → ${detalle(m)}`);
  ok(`${rotulo} · borrar todo y escribir 4 → 4`, m.valor === "4", `quedó ${JSON.stringify(m.valor)}`);

  // ── DECIMALES ────────────────────────────────────────────────────────────
  //
  // Primero se comprueba si el campo los admite. `step` y `inputMode` lo
  // declaran; si no los admitiera, esto lo dice en vez de exigir un
  // comportamiento que el producto no promete.
  info = await preparar(rotulo);
  const config = JSON.parse(await evaluar(`JSON.stringify({
    step: window.__campo.getAttribute("step"),
    inputMode: window.__campo.getAttribute("inputmode"),
    min: window.__campo.getAttribute("min"),
    max: window.__campo.getAttribute("max"),
  })`));
  console.log(`    configuración: step=${config.step} inputMode=${config.inputMode} min=${config.min} max=${config.max}`);
  const admiteDecimal = config.inputMode === "decimal" || (config.step && config.step !== "1");
  if (!admiteDecimal) {
    console.log(`    el campo NO declara decimales: no se exige "1.5"`);
  } else {
    await clic(info.caja, "izquierda");
    await teclear("1");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: ".", code: "Period", text: ".", unmodifiedText: ".", windowsVirtualKeyCode: 190 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: ".", code: "Period", windowsVirtualKeyCode: 190 });
    await sleep(120);
    await teclear("5");
    m = JSON.parse(await medidas());
    console.log(`    decimal: ${detalle(m)}  → valor final ${JSON.stringify(m.valor)}`);
    ok(`${rotulo} · decimal 1.5`, m.valor === "1.5", `quedó ${JSON.stringify(m.valor)}`);
  }
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);

// Se cierra acá, en los dos caminos. Después de esto no queda ningún handle
// abierto, así que el proceso termina solo y con código 0: no hace falta un
// `process.exit(0)`, que taparía un cierre incompleto en vez de hacerlo.
cerrar();

if (fallas.length) {
  console.log("\nEN ROJO:");
  for (const f of fallas) console.log(`  · ${f}`);
  process.exit(1);
}
