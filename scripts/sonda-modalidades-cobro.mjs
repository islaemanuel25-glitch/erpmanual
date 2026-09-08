// SONDA DE LAS MODALIDADES DE COBRO — AFIRMA SOBRE LA PANTALLA, NO LA FOTOGRAFÍA.
//
// ── QUÉ MIDE QUE NINGÚN CANDADO PUEDE MEDIR ────────────────────────────────
//
// Los candados de `lib/` prueban decisiones sobre datos escritos a mano. Los de
// render ejecutan el JSX, pero `renderToStaticMarkup` dibuja el ESTADO INICIAL:
// no hay clicks, no hay estado, no hay CSS y no hay 390 px de ancho.
//
// Lo que falta es exactamente el camino que el cajero recorre:
//
//     tocar Mercado Pago → aparece el selector → elegir Crédito → el total que
//     dice el botón es el que viaja en el cuerpo del pedido
//
// y ese camino vive ENTRE las piezas, que es donde el proyecto ya se comió cinco
// defectos seguidos con la suite en verde.
//
// ── POR QUÉ NO REGISTRA VENTAS ─────────────────────────────────────────────
//
// El último paso —cobrar— se mide interceptando `fetch` y leyendo el CUERPO que
// la pantalla arma, en vez de dejar que la venta entre. No es una simulación: el
// click es real, el componente es el de verdad y el cuerpo es el que se habría
// mandado. Lo que se evita es ensuciar una base con ventas de prueba, y sobre
// todo poder correr esto sin un turno abierto.
//
// Y permite algo que de otra forma no se podría: afirmar que el cuerpo NO lleva
// porcentajes. Una venta registrada no dice qué campos venían de más.
//
// ── SI NO PUEDE MEDIR, ES ROJO ─────────────────────────────────────────────
//
// Mismo criterio que `sonda-cascada.mjs` y `sonda-tarjeta-producto.mjs`. Una
// pantalla que no cargó, una sesión que no entró o un botón que no apareció no
// son "no se pudo comprobar": son rojo. El desconocido se convierte solo en
// "supongo que sí" cuando ya hay ganas de terminar.
//
// Uso:
//   node scripts/sonda-modalidades-cobro.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave> [--local <id>]
//
// NUNCA contra producción: hace login, toca la interfaz y escribe configuración.

import { spawn } from "node:child_process";
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
// DÓNDE SE PARA. Un LOCAL y no el depósito: el POS de un depósito se comporta
// distinto, y lo que hay que medir es la pantalla del que vende. Es el mismo
// local donde `sembrar-visual-pos.mjs` deja el producto y el turno abierto.
const LOCAL_NOMBRE = arg("local-nombre", "Local 1");
// El producto que siembra ese script. Se busca por él porque tiene que ser
// inequívoco: si el buscador devolviera dos cosas, la sonda tocaría la
// equivocada y estaría midiendo sobre otro producto.
const PRODUCTO = arg("producto", "Sonda Modalidades Producto");
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-modalidades-cobro"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const CAPTURAS = arg("capturas", null);

// Los dos anchos que el pedido exige medir. El primero es la Sunmi.
const ANCHO_MOBILE = Number(arg("ancho-mobile", "390"));
const ALTO_MOBILE = Number(arg("alto-mobile", "844"));
const ANCHO_DESKTOP = Number(arg("ancho-desktop", "1366"));
const ALTO_DESKTOP = Number(arg("alto-desktop", "900"));

// Los cuatro temas que hay que ver. No se adapta la UI con condicionales: la
// misma pantalla tiene que responder a los tokens, y eso se comprueba leyendo el
// color COMPUTADO en cada uno.
//
// ── LOS IDS SON LOS DEL REPO, NO NOMBRES CORTOS ─────────────────────────────
//
// El default decía `dark,light,sand,blueClassic`, que no existen: los scopes de
// `styles/sunmi.css` y el resto de las sondas usan `sunmiDark`, `sunmiLight`,
// `sunmiSand` y `sunmiBlueClassic`. Con los cortos, `data-theme` queda en un
// valor que ningún selector empareja, así que los cuatro "temas" daban el MISMO
// color y la afirmación de que cambian habría sido un falso rojo — o peor, un
// verde si alguien la aflojaba. No se crean alias: se usan los de verdad.
const TEMAS = (arg("temas", "sunmiDark,sunmiLight,sunmiSand,sunmiBlueClassic") || "")
  .split(",").map((t) => t.trim()).filter(Boolean);

// Los nombres con los que la sonda configura su caso. Llevan marca de tiempo
// para no chocar con lo que el local ya tenga, y se borran al final.
const MARCA = `sonda-${Date.now()}`;
const NOMBRE_MODALIDAD_A = `${MARCA} 1 pago`;
const NOMBRE_MODALIDAD_B = `${MARCA} cuotas`;
const RECARGO_A = 4;
const RECARGO_B = 8;

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle = "") => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo, detalle });
    if (detalle) console.log(`        ${detalle}`);
  }
};

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
  throw new Error("el navegador no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    // ── AWAIT PROMISE, Y NO ES UN DETALLE ──────────────────────────────────
    //
    // Sin esto una expresión asíncrona devuelve el objeto Promise y la sonda
    // lee `undefined` como si fuera una medición. Es un defecto que este repo ya
    // arregló una vez en otra sonda y volvió a escribir en la siguiente.
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
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

/** Espera a que una expresión sea verdadera. Si no llega, MUERE con el motivo. */
async function esperar(expresion, queEsperaba, intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    if (await evaluar(expresion)) return true;
    await sleep(250);
  }
  morir(`nunca apareció: ${queEsperaba}`);
}

/**
 * Un click REAL, con el mouse del navegador y no con `.click()` de JS.
 *
 * La diferencia importa: `.click()` no dispara los mismos eventos de puntero, y
 * además no prueba que el control esté DONDE se puede tocar. Un botón tapado por
 * otra capa responde a `.click()` y no responde a un dedo.
 */
async function clickEn(selectorJs) {
  const caja = await evaluar(
    `(() => {
       const el = ${selectorJs};
       if (!el) return null;
       el.scrollIntoView({ block: "center" });
       const r = el.getBoundingClientRect();
       return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
     })()`
  );
  if (!caja || caja.w === 0 || caja.h === 0) return false;
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", {
      type, x: caja.x, y: caja.y, button: "left", clickCount: 1,
    });
  }
  await sleep(250);
  return true;
}

/** El botón cuyo texto contiene esto. Devuelve la expresión JS, no el nodo. */
const botonConTexto = (texto) =>
  `[...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes(${JSON.stringify(texto)}))`;

/**
 * CUÁNTOS BOTONES DE VERDAD, VISIBLES, LLEVAN ESTE TEXTO.
 *
 * Ésta es la medición que reemplazó a un `veces >= 1` sobre `document.body
 * .innerText`, que probaba "existe" y no "es UNO".
 *
 * Tres decisiones, y las tres son por lo que NO tiene que contar:
 *
 *   · `button` — nodos interactivos. Un título, un `<div>` o una fila de tabla
 *     con el mismo texto no son un botón de cobro.
 *   · `innerText` y no `textContent` ni el HTML — el ícono de Mercado Pago es un
 *     `<img alt="Mercado Pago">`, y el alt es un ATRIBUTO: no entra en el texto
 *     renderizado. Un `aria-label` tampoco. Contando el HTML crudo, un solo
 *     botón daba dos.
 *   · `getClientRects().length > 0` — lo oculto no cuenta. Un panel escondido
 *     con los mismos botones haría dar dos donde el cajero ve uno.
 */
const contarBotonesCon = (texto) =>
  evaluar(
    `[...document.querySelectorAll("button")]
       .filter((b) => b.getClientRects().length > 0)
       .filter((b) => (b.innerText || "").includes(${JSON.stringify(texto)}))
       .length`
  );

/** Una captura de la pantalla entera, si se pidió carpeta. Acompaña, no reemplaza. */
async function retratar(nombre) {
  if (!CAPTURAS) return;
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(CAPTURAS, `${nombre}.png`), Buffer.from(data, "base64"));
}

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    `--window-size=${ANCHO_MOBILE},${ALTO_MOBILE}`,
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

let medioId = null;
let modalidades = [];

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
  const medirEn = (w, h, mobile) =>
    send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  await medirEn(ANCHO_MOBILE, ALTO_MOBILE, true);

  // ── SE INTERCEPTA EL COBRO, Y SE GUARDA EL CUERPO ────────────────────────
  //
  // Es lo que permite afirmar sobre lo que la pantalla MANDA sin registrar una
  // venta. La respuesta se puede fabricar para ejercer TOTAL_DESACTUALIZADO, que
  // de otro modo exigiría que alguien cambie una modalidad en el medio del
  // pedido — imposible de sincronizar desde acá.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__cobros = [];
      window.__respuestaCobro = null;
      const _fetch = window.fetch;
      window.fetch = async (...args) => {
        const u = String(args[0]?.url || args[0] || "");
        if (u.includes("/api/pos-ventas/crear")) {
          try { window.__cobros.push(JSON.parse(args[1] && args[1].body ? args[1].body : "{}")); } catch (e) {}
          if (window.__respuestaCobro) {
            return new Response(JSON.stringify(window.__respuestaCobro.cuerpo), {
              status: window.__respuestaCobro.status,
              headers: { "Content-Type": "application/json" },
            });
          }
        }
        return _fetch(...args);
      };
    `,
  });

  // La ubicación va POR NOMBRE y el arnés falla si no existe, en vez de caer al
  // depósito en silencio: medir parado en otro lado daría un verde sobre una
  // pantalla que no es la pedida.
  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    ubicacion: LOCAL_NOMBRE,
    log: (m) => console.log(m),
  });

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 1. COBROS: la lista de modalidades de un medio ─────────────");
  // ═════════════════════════════════════════════════════════════════════════

  await navegar(`${BASE}/modulos/configuracion/pos-ventas/cobros`);
  await esperar(`document.body.innerText.includes("MEDIOS DE COBRO")`, "la lista de Cobros");

  // El medio sobre el que se trabaja: el de MERCADOPAGO del local. Se pide a la
  // API en vez de adivinar el nombre, porque el nombre lo escribe cada local.
  const medios = await evaluar(
    `fetch("/api/medios-cobro",{credentials:"same-origin"}).then(r=>r.json())`,
    true
  );
  if (!medios?.ok) morir(`no pude leer los medios: ${medios?.error ?? "sin respuesta"}`);
  const padre = (medios.medios || []).find((m) => m.tipoContable === "MERCADOPAGO");
  if (!padre) morir("el local no tiene un medio de tipo MERCADOPAGO");

  // Se entra POR LA PANTALLA, tocando la tarjeta: así se ejerce el enlace real y
  // la clave de edición, que ya causó un defecto en producción por el
  // encodeURIComponent.
  const entro = await clickEn(
    `[...document.querySelectorAll("a")].find((a) => (a.textContent || "").includes(${JSON.stringify(padre.nombre)}))`
  );
  afirmar(entro, "se entra al medio tocando su tarjeta");
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "la sección MODALIDADES");

  afirmar(
    await evaluar(`document.body.innerText.includes("+ Agregar modalidad")`),
    "el medio ofrece agregar una modalidad"
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 2. COBROS: crear dos modalidades del MISMO tipo contable ───");
  // ═════════════════════════════════════════════════════════════════════════

  medioId = padre.id;
  if (medioId == null) {
    morir("el medio de Mercado Pago todavía es un default: falta correr sembrar-visual-medios-cobro.mjs");
  }
  const rutaMedio = `${BASE}/modulos/configuracion/pos-ventas/cobros/${encodeURIComponent(String(medioId))}`;

  /**
   * UNA TECLA DE VERDAD, Y UNA SOLA VEZ.
   *
   * `keyDown` CON `text` ya inserta el carácter: Chrome sintetiza el `char` solo.
   * Mandar además un evento `char` lo inserta DOS VECES, y eso fue exactamente
   * lo que midió la primera corrida —teclear un "4" sobre un 0 seleccionado dejó
   * "44"— y lo que hizo que el nombre de la modalidad se guardara con cada letra
   * duplicada.
   *
   * Era un defecto de la MEDICIÓN y no del producto, y hay prueba en la misma
   * corrida: `sonda-escritura-en-cero.mjs` —que teclea así, sin `char`— informó
   * un solo `insertText` y dejó "1" sobre el cero seleccionado. Esta es su misma
   * forma.
   */
  const teclear = async (ch) => {
    // El espacio va con su `code` y su código virtual: sin ellos hay navegadores
    // que lo tratan como activación del control enfocado en vez de como texto, y
    // un nombre de modalidad lleva espacios.
    const extra = ch === " " ? { code: "Space", windowsVirtualKeyCode: 32 } : {};
    await send("Input.dispatchKeyEvent", {
      type: "keyDown", key: ch, text: ch, unmodifiedText: ch, ...extra,
    });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch, ...extra });
    await sleep(60);
  };
  const escribirEn = async (selectorJs, texto, { seleccionarTodo = false } = {}) => {
    if (!(await clickEn(selectorJs))) morir(`no encontré el campo: ${selectorJs}`);
    if (seleccionarTodo) {
      await evaluar(`(() => { const i = ${selectorJs}; if (i) i.select(); return true; })()`);
    }
    for (const ch of texto) await teclear(ch);
  };

  // ── LA MODALIDAD SE CREA POR EL FORMULARIO, NO POR LA API ────────────────
  //
  // Es el único camino que prueba que la pantalla de alta funciona: un
  // `SunmiInput` sin importar, o un select que no abre, compilan y pasan los
  // candados. La segunda modalidad sí se crea por la API —es preparación del
  // escenario y el formulario ya quedó ejercido—.
  await navegar(`${rutaMedio}/modalidades/nueva`);
  await esperar(`document.body.innerText.includes("CONDICIÓN COMERCIAL")`, "el formulario de alta");
  await retratar("390-cobros-modalidad-alta");

  const campoNombre = `document.querySelector('input[placeholder^="Ej. Cr"]')`;
  afirmar(await evaluar(`!!${campoNombre}`), "el alta pide un nombre");
  await escribirEn(campoNombre, NOMBRE_MODALIDAD_A);

  // El tipo contable arranca en el del PADRE —MERCADOPAGO— y hay que ponerlo en
  // CREDITO: que las dos modalidades compartan tipo contable es todo el caso.
  // El disparador del kit se busca por SU clase y no por su texto: el texto es el
  // valor elegido y cambia, así que un selector por texto mediría otra cosa el
  // día que cambie el default.
  const disparadorTipo = `document.querySelector("button.sunmi-select-trigger")`;
  afirmar(await evaluar(`!!${disparadorTipo}`), "el alta ofrece elegir el tipo contable");
  await clickEn(disparadorTipo);
  await esperar(`!!document.querySelector(".sunmi-select-dropdown")`, "el desplegable del tipo contable");
  const eligioTipo = await clickEn(
    `[...document.querySelectorAll(".sunmi-select-dropdown div")].find((d) => (d.innerText || "").trim() === "Crédito")`
  );
  afirmar(eligioTipo, "se puede elegir el tipo contable en el desplegable del kit");

  // ── LA ESCRITURA NUMÉRICA, EJERCIDA DE VERDAD ───────────────────────────
  //
  // El campo de recargo de un alta muestra 0. El contrato cerrado dice que al
  // entrar ese 0 queda seleccionado y que teclear un dígito lo REEMPLAZA: 0 + 6
  // da 6, no 06 ni 60. Es el defecto que ya se midió una vez y no puede volver.
  const campoRecargo = `[...document.querySelectorAll('input[type=number]')][1]`;
  const valorInicialRecargo = await evaluar(`(${campoRecargo} || {}).value ?? null`);
  afirmar(valorInicialRecargo === "0", "el recargo de un alta arranca en 0", `arrancó en ${valorInicialRecargo}`);
  await escribirEn(campoRecargo, String(RECARGO_A));
  const trasTeclear = await evaluar(`(${campoRecargo} || {}).value ?? null`);
  afirmar(
    trasTeclear === String(RECARGO_A),
    `con el 0 seleccionado, teclear ${RECARGO_A} deja ${RECARGO_A} y no 0${RECARGO_A} ni ${RECARGO_A}0`,
    `quedó ${JSON.stringify(trasTeclear)}`
  );

  afirmar(await clickEn(botonConTexto("Crear modalidad")), "se puede tocar Crear modalidad");
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "la vuelta al medio después de crear");
  afirmar(
    await evaluar(
      `[...document.querySelectorAll("a")].some((a) => (a.innerText || "").includes(${JSON.stringify(NOMBRE_MODALIDAD_A)}))`
    ),
    "la modalidad creada desde el formulario aparece en la LISTA, como fila que se puede abrir"
  );

  // La segunda, por API: preparación del escenario.
  const crear = async (nombre, recargo) => {
    const r = await evaluar(
      `fetch("/api/medios-cobro/" + ${Number(medioId)} + "/modalidades",` +
        `{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},` +
        `body:JSON.stringify({nombre:${JSON.stringify(nombre)},tipoContable:"CREDITO",recargoPct:${recargo},comisionPct:null})})` +
        `.then(r=>r.json())`,
      true
    );
    if (!r?.ok) morir(`no pude crear la modalidad "${nombre}": ${r?.error ?? "sin respuesta"}`);
    return r.modalidadId;
  };
  const idB = await crear(NOMBRE_MODALIDAD_B, RECARGO_B);

  await navegar(rutaMedio);
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "la sección MODALIDADES");
  const idsDelMedio = await evaluar(
    `fetch("/api/medios-cobro/" + ${Number(medioId)} + "/modalidades",{credentials:"same-origin"})` +
      `.then(r=>r.json()).then(r=>(r.modalidades||[]).map(m=>[m.nombre,m.id]))`,
    true
  );
  const idA = (idsDelMedio.find(([n]) => n === NOMBRE_MODALIDAD_A) || [])[1];
  if (idA == null) morir("la modalidad creada por el formulario no quedó guardada");
  modalidades = [idA, idB];

  const textoCobros = await evaluar(`document.body.innerText`);
  afirmar(textoCobros.includes(NOMBRE_MODALIDAD_A), "la primera modalidad se ve en la lista");
  afirmar(textoCobros.includes(NOMBRE_MODALIDAD_B), "la segunda también, aunque comparta el tipo contable");
  afirmar(textoCobros.includes(`Recargo ${RECARGO_A} %`), "con su recargo", textoCobros.slice(0, 500));
  afirmar(textoCobros.includes(`Recargo ${RECARGO_B} %`), "y el de la otra");
  afirmar(
    textoCobros.includes("Comisión sin configurar"),
    "una comisión sin cargar se dice SIN CONFIGURAR"
  );
  // ── EL "HEREDADA" SE MIDE SOBRE LAS FILAS DE MODALIDAD, NO SOBRE LA PÁGINA ─
  //
  // La primera versión partía el texto de la página en "MODALIDADES" y miraba
  // todo lo que venía después. Abajo de la lista está el formulario del MEDIO, y
  // ahí "Heredada del grupo · editable" es CORRECTO: un medio sí hereda. O sea
  // que la sonda estaba dando rojo por un texto que tiene que estar, sobre una
  // pantalla que no es la que la afirmación nombra.
  //
  // Lo que se afirma es lo que dice el pedido: que ninguna MODALIDAD se presente
  // como heredada. Se leen sus filas.
  const filasModalidad = await evaluar(
    `[...document.querySelectorAll("a")]
       .map((a) => a.innerText || "")
       .filter((t) => t.includes(${JSON.stringify(NOMBRE_MODALIDAD_A)}) || t.includes(${JSON.stringify(NOMBRE_MODALIDAD_B)}))`
  );
  afirmar(filasModalidad.length === 2, "las dos modalidades son filas propias", JSON.stringify(filasModalidad));
  afirmar(
    !/hered/i.test(filasModalidad.join(" ")),
    "y NINGUNA dice heredada: una modalidad no hereda del grupo",
    JSON.stringify(filasModalidad)
  );
  afirmar(
    /cobra por modalidad/i.test(textoCobros),
    "y se avisa que la condición del medio ya no manda",
    textoCobros.slice(0, 500)
  );
  await retratar("390-cobros-medio-con-modalidades");

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. COBROS: editar una modalidad, con el teclado ────────────");
  // ═════════════════════════════════════════════════════════════════════════

  await navegar(`${rutaMedio}/modalidades/${modalidades[0]}`);
  await esperar(`document.body.innerText.includes("CONDICIÓN COMERCIAL")`, "el formulario de la modalidad");
  await retratar("390-cobros-modalidad-editar");

  const formulario = await evaluar(`document.body.innerText`);
  afirmar(formulario.includes("Sin configurar"), "el campo de comisión dice Sin configurar");
  afirmar(!/hered/i.test(formulario), "y en ningún lado dice Heredada");
  afirmar(formulario.includes("Lo aporta el medio"), "no se pide procesador: lo aporta el padre");

  // ── SE EDITA DE VERDAD: LA COMISIÓN PASA DE null A UN NÚMERO ────────────
  //
  // El campo arranca VACÍO —sin configurar, que no es 0— así que escribir acá
  // ejerce el otro lado del contrato: lo que se guarda es 3, y el renglón de la
  // lista tiene que dejar de decir "sin configurar".
  const campoComision = `[...document.querySelectorAll('input[type=number]')][2]`;
  const comisionInicial = await evaluar(`(${campoComision} || {}).value ?? null`);
  afirmar(comisionInicial === "", "la comisión arranca vacía: sin configurar no es 0",
    `arrancó en ${JSON.stringify(comisionInicial)}`);
  await escribirEn(campoComision, "3");
  afirmar(
    (await evaluar(`(${campoComision} || {}).value ?? null`)) === "3",
    "y se puede escribir un porcentaje"
  );

  // ── FOCO VISIBLE CON TAB ────────────────────────────────────────────────
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(250);
  const foco = await evaluar(
    `(() => {
       const el = document.activeElement;
       if (!el || el === document.body) return null;
       const cs = getComputedStyle(el);
       return {
         tag: el.tagName,
         visible: el.matches(":focus-visible"),
         outline: cs.outlineStyle + " " + cs.outlineWidth,
         sombra: cs.boxShadow,
       };
     })()`
  );
  afirmar(foco != null, "Tab mueve el foco a un control", "no hay elemento enfocado");
  afirmar(
    foco != null && foco.visible === true,
    "y el foco de teclado es visible",
    JSON.stringify(foco)
  );
  afirmar(
    foco != null && (foco.outline.includes("none") === false || (foco.sombra && foco.sombra !== "none")),
    "con una señal dibujada: contorno o sombra",
    JSON.stringify(foco)
  );
  await retratar("390-cobros-modalidad-foco");

  afirmar(await clickEn(botonConTexto("Guardar cambios")), "se puede tocar Guardar cambios");
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "la vuelta al medio después de guardar");
  const trasGuardar = await evaluar(`document.body.innerText`);
  afirmar(
    trasGuardar.includes("Comisión 3 %"),
    "el cambio quedó guardado y la lista lo muestra",
    trasGuardar.slice(0, 500)
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. POS: un solo botón padre, y el selector ─────────────────");
  // ═════════════════════════════════════════════════════════════════════════

  // ── ABRIR EL POS CON EL CARRITO CARGADO, SIEMPRE IGUAL ──────────────────
  //
  // Se hace en una función porque hacen falta CUATRO veces: después de cobrar,
  // el POS limpia el carrito —es lo que tiene que hacer—, así que cada bloque
  // que sigue necesita volver a cargarlo. Con el carrito vacío el panel no
  // muestra importes y las afirmaciones medirían una pantalla que no es la que
  // se quiere medir.
  const cargarProducto = async () => {
    const campo = `document.querySelector('input[placeholder*="odigo"], input[type=search]')`;
    await escribirEn(campo, "Sonda Modalidades", { seleccionarTodo: true });
    await esperar(
      `document.body.innerText.includes(${JSON.stringify(PRODUCTO)})`,
      "el producto en los resultados de la búsqueda"
    );
    // La fila de resultado es un `div` con onClick, no un botón: se la toca con
    // el mouse, que es lo que hace un dedo.
    return clickEn(
      `[...document.querySelectorAll("div")].find((d) => d.onclick && (d.innerText || "").includes(${JSON.stringify(PRODUCTO)}))`
    );
  };

  const abrirPos = async () => {
    await navegar(`${BASE}/modulos/pos-ventas`);
    await esperar(
      `!!document.querySelector('input[placeholder*="odigo"], input[type=search]')`,
      "el buscador de productos del POS"
    );
    await cargarProducto();
    await esperar(`document.body.innerText.includes("Elegí cómo cobrar") ||
      document.body.innerText.includes("Total según el medio")`, "el panel de cobro con el carrito cargado");
  };

  await navegar(`${BASE}/modulos/pos-ventas`);
  await esperar(
    `!!document.querySelector('input[placeholder*="odigo"], input[type=search]')`,
    "el buscador de productos del POS"
  );

  // ── EL CARRITO SE CARGA POR LA PANTALLA, TOCANDO EL PRODUCTO ────────────
  //
  // El producto lo siembra `scripts/pruebas-db/sembrar-visual-pos.mjs`, porque
  // `prisma/seed.js` no crea ninguno. Si el buscador no lo encuentra es un
  // problema de FIXTURE y no de la UI, así que se muere diciéndolo: contar ese
  // rojo como evidencia de la pantalla sería mentir sobre qué se midió.
  // ── EL localId VA EXPLÍCITO, COMO LO MANDA EL POS ───────────────────────
  //
  // `buscar-producto` NO usa el contexto activo: toma `localId` del query, y si
  // no viene cae al `localId` de la SESIÓN. El usuario de prueba tiene asignado
  // el depósito, así que una consulta sin ese parámetro busca en otro local y
  // devuelve cero — que es lo que pasó en la corrida 34180152496 y se leyó como
  // "falta el fixture" cuando el fixture estaba puesto.
  //
  // La pantalla sí lo manda, porque usa su `localActual`. Esta comprobación
  // previa tiene que preguntar igual que ella.
  const localId = await evaluar(
    `fetch("/api/locales/opciones", { credentials: "same-origin" })
       .then((r) => r.json())
       .then((j) => ((j.items || []).find((l) => String(l.nombre).toLowerCase() === ${JSON.stringify(LOCAL_NOMBRE.toLowerCase())}) || {}).id ?? null)`,
    true
  );
  if (!localId) morir(`no pude resolver el id del local "${LOCAL_NOMBRE}"`);

  const enCatalogo = await evaluar(
    `fetch("/api/pos-ventas/buscar-producto?localId=" + ${Number(localId)} + "&q=" + encodeURIComponent(${JSON.stringify(PRODUCTO)}),
       { credentials: "same-origin" }).then((x) => x.json()).then((r) => (r.items || []).length)`,
    true
  );
  if (!enCatalogo) {
    morir(
      `el buscador no encuentra "${PRODUCTO}": falta el fixture. ` +
        `Corré scripts/pruebas-db/sembrar-visual-pos.mjs antes de esta sonda.`
    );
  }

  const toco = await cargarProducto();
  afirmar(toco, "se toca el producto y entra al carrito");
  await esperar(
    `document.body.innerText.includes("Elegí cómo cobrar") ||
     document.body.innerText.includes("Total según el medio")`,
    "el panel de cobro habilitado con el carrito cargado"
  );
  await retratar("390-pos-panel");

  // ── UN SOLO BOTÓN PADRE. NODOS, NO TEXTO ────────────────────────────────
  const nombrePadre = padre.nombre;
  const botonesPadre = await contarBotonesCon(nombrePadre);
  afirmar(
    botonesPadre === 1,
    `"${nombrePadre}" es UN solo botón de cobro`,
    `botones visibles con ese texto: ${botonesPadre}`
  );

  const comoBotonA = await contarBotonesCon(NOMBRE_MODALIDAD_A);
  const comoBotonB = await contarBotonesCon(NOMBRE_MODALIDAD_B);
  afirmar(
    comoBotonA === 0 && comoBotonB === 0,
    "y sus modalidades NO son botones del panel",
    `"${NOMBRE_MODALIDAD_A}": ${comoBotonA} · "${NOMBRE_MODALIDAD_B}": ${comoBotonB}`
  );

  // Tocarlo NO cobra: abre el selector.
  const abrio = await clickEn(botonConTexto(nombrePadre));
  afirmar(abrio, "se puede tocar el botón padre");
  await sleep(400);
  afirmar(
    await evaluar(`document.body.innerText.includes("Elegí la modalidad")`),
    "tocarlo abre el selector en vez de cobrar",
    (await evaluar(`document.body.innerText`)).slice(0, 300)
  );
  afirmar(
    (await contarBotonesCon(NOMBRE_MODALIDAD_A)) === 1,
    "recién ACÁ la primera modalidad es un botón"
  );
  afirmar(
    (await contarBotonesCon(NOMBRE_MODALIDAD_B)) === 1,
    "y la segunda también, con el mismo tipo contable"
  );
  afirmar(
    await evaluar(`window.__cobros.length === 0`),
    "y no se mandó ningún cobro al abrir el selector"
  );
  await retratar("390-selector-modalidad");

  // Los dos importes tienen que ser DISTINTOS: 4 % contra 8 %. Se leen de LOS
  // BOTONES de cada modalidad y no de la página entera, para que el total grande
  // de arriba no pueda hacer pasar la afirmación por su cuenta.
  const importeDe = (texto) =>
    evaluar(
      `(() => {
         const b = ${botonConTexto(texto)};
         const m = (b?.innerText || "").match(/\\$([\\d.]+,\\d{2})/);
         return m ? m[1] : null;
       })()`
    );
  const importeA = await importeDe(NOMBRE_MODALIDAD_A);
  const importeB = await importeDe(NOMBRE_MODALIDAD_B);
  afirmar(importeA != null && importeB != null, "cada modalidad muestra su importe", `${importeA} · ${importeB}`);
  afirmar(
    importeA !== importeB,
    "y los dos importes son DISTINTOS: 4 % contra 8 %",
    `${importeA} contra ${importeB}`
  );

  // ── SIN DESBORDE HORIZONTAL A 390 px ────────────────────────────────────
  const desborde = await evaluar(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  afirmar(desborde <= 0, "el selector no desborda a lo ancho en mobile", `sobran ${desborde} px`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 5. POS: elegir la modalidad manda IDENTIDAD, no porcentajes ─");
  // ═════════════════════════════════════════════════════════════════════════

  await evaluar(`window.__respuestaCobro = { status: 200, cuerpo: { ok: true, ventaId: 0, numero: 0, breakdown: {} } }; true`);
  await clickEn(botonConTexto(NOMBRE_MODALIDAD_B));
  await sleep(700);

  const cobro = await evaluar(`window.__cobros[window.__cobros.length - 1] || null`);
  afirmar(cobro != null, "elegir la modalidad dispara el cobro");
  const tender = cobro?.pagos?.[0] ?? null;
  afirmar(tender != null, "el cuerpo lleva un tender", JSON.stringify(cobro));
  afirmar(
    tender?.medioCobroLocalId === medioId,
    "el cuerpo manda medioCobroLocalId, con el id del medio padre",
    JSON.stringify(tender)
  );
  afirmar(
    tender?.modalidadId === modalidades[1],
    "y modalidadId, con el de la modalidad elegida",
    JSON.stringify(tender)
  );
  // Uno por uno y no en una sola afirmación: si mañana se filtra el procesador,
  // el rojo tiene que decir CUÁL se filtró.
  for (const campo of ["recargoPct", "comisionPct", "tipoContable", "procesador"]) {
    afirmar(
      tender != null && !(campo in tender),
      `y NO manda ${campo}: eso lo resuelve el servidor`,
      JSON.stringify(tender)
    );
  }

  // El importe que se vio está en es-AR: se convierte a número para comparar en
  // centavos, que es como se compara plata en este repo.
  const aNumero = (t) => Number(String(t ?? "").replace(/\./g, "").replace(",", "."));
  afirmar(
    cobro?.totalPantalla != null &&
      Math.round(Number(cobro.totalPantalla) * 100) === Math.round(aNumero(importeB) * 100),
    "y el total que viaja es EL QUE SE VIO en el botón",
    `pantalla ${importeB} · cuerpo ${cobro?.totalPantalla}`
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 6. POS: TOTAL_DESACTUALIZADO no reintenta solo ─────────────");
  // ═════════════════════════════════════════════════════════════════════════

  await abrirPos();
  await evaluar(`window.__cobros = []; true`);
  await evaluar(
    `window.__respuestaCobro = { status: 409, cuerpo: { ok: false, code: "TOTAL_DESACTUALIZADO",
       error: "El total cambió.", totalPantalla: 1, totalEsperado: 99999,
       breakdown: { total: 99999, recargoPagoPct: 15 } } }; true`
  );
  await clickEn(botonConTexto(nombrePadre));
  await sleep(400);
  await clickEn(botonConTexto(NOMBRE_MODALIDAD_B));
  await sleep(900);

  const trasChoque = await evaluar(`document.body.innerText`);
  afirmar(
    /no se registró/i.test(trasChoque) || /total cambió/i.test(trasChoque),
    "la pantalla dice que la venta NO se registró",
    trasChoque.slice(0, 400)
  );
  afirmar(trasChoque.includes("99.999"), "y muestra el total nuevo");
  afirmar(
    await evaluar(`window.__cobros.length === 1`),
    "y NO reintenta sola: un solo pedido",
    `pedidos: ${await evaluar(`window.__cobros.length`)}`
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 7. POS: pago dividido con modalidad por fila ───────────────");
  // ═════════════════════════════════════════════════════════════════════════

  await abrirPos();
  await evaluar(`window.__cobros = []; window.__respuestaCobro = null; true`);
  await clickEn(botonConTexto("Dividir pago"));
  await sleep(500);

  const selects = await evaluar(`document.querySelectorAll("select").length`);
  afirmar(selects >= 2, "el panel dividido dibuja sus filas", `selects: ${selects}`);

  // El selector de modalidad de la fila es el del kit —`SunmiSelectAdv`— y no un
  // `<select>` nativo: se lo busca por su marca, no por su etiqueta.
  const hayModalidad = await evaluar(`!!document.querySelector("[data-modalidad-de]")`);
  afirmar(hayModalidad, "y la fila del medio con modalidades trae SU selector de modalidad");

  // Se ABRE, que es lo único que prueba que las opciones existen de verdad.
  await clickEn(`document.querySelector("[data-modalidad-de]")`);
  await sleep(400);
  const textoDividido = await evaluar(`document.body.innerText`);
  afirmar(
    textoDividido.includes(NOMBRE_MODALIDAD_A) && textoDividido.includes(NOMBRE_MODALIDAD_B),
    "con las modalidades adentro de la fila, no como medios",
    textoDividido.slice(0, 400)
  );

  // Y NO son opciones del selector de MEDIO: eso las convertiría en medios.
  const opcionesDeMedio = await evaluar(
    `(() => {
       const s = [...document.querySelectorAll("select")].find((x) => (x.getAttribute("aria-label") || "") === "Medio de pago");
       return s ? [...s.options].map((o) => o.textContent) : [];
     })()`
  );
  afirmar(
    !opcionesDeMedio.includes(NOMBRE_MODALIDAD_A) && !opcionesDeMedio.includes(NOMBRE_MODALIDAD_B),
    "y el selector de MEDIO no las ofrece como si fueran medios",
    JSON.stringify(opcionesDeMedio)
  );

  const desbordeDiv = await evaluar(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  afirmar(desbordeDiv <= 0, "el panel dividido no desborda en mobile", `sobran ${desbordeDiv} px`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 8. LOS CUATRO TEMAS, sobre la misma pantalla ───────────────");
  // ═════════════════════════════════════════════════════════════════════════

  // ── EL TEMA SE PONE COMO LO PONE LA APLICACIÓN ──────────────────────────
  //
  // Escribiendo `localStorage` y recargando, que es el camino que usa el propio
  // `SunmiThemeProvider` y el que ya usa `generar-huellas.mjs`. Pisar
  // `data-theme` a mano sería más rápido y mediría otra cosa: el proveedor lo
  // reescribe en su sincronización, así que una lectura tomada en el medio
  // podría ser del tema viejo sin que nada avise.
  const ponerTema = async (tema) => {
    await evaluar(
      `(() => { try { localStorage.setItem("erp-sunmi-theme", ${JSON.stringify(tema)}); } catch (e) {} return true; })()`
    );
    await abrirPos();
    const aplicado = await evaluar(`document.documentElement.dataset.theme || null`);
    if (aplicado !== tema) {
      morir(`pedí el tema ${tema} y la página quedó en ${JSON.stringify(aplicado)}`);
    }
  };

  const lecturas = {};
  for (const tema of TEMAS) {
    await ponerTema(tema);
    await clickEn(botonConTexto(nombrePadre));
    await sleep(400);
    lecturas[tema] = await evaluar(
      `(() => {
         const b = ${botonConTexto(NOMBRE_MODALIDAD_A)};
         if (!b) return null;
         const cs = getComputedStyle(b);
         const fondo = getComputedStyle(document.body).backgroundColor;
         return { fondo: cs.backgroundColor, texto: cs.color, borde: cs.borderColor, pagina: fondo };
       })()`
    );
    afirmar(lecturas[tema] != null, `el selector se dibuja en el tema ${tema}`, "no apareció el botón de la modalidad");
    await retratar(`390-tema-${tema}`);
  }
  const firmas = Object.values(lecturas).filter(Boolean).map((l) => `${l.fondo}|${l.texto}|${l.pagina}`);
  afirmar(
    new Set(firmas).size === firmas.length && firmas.length === TEMAS.length,
    "los CUATRO temas dan valores computados distintos: la UI responde a los tokens",
    JSON.stringify(lecturas)
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 9. ESCRITORIO: el mismo contrato, otra composición ─────────");
  // ═════════════════════════════════════════════════════════════════════════

  await medirEn(ANCHO_DESKTOP, ALTO_DESKTOP, false);
  await ponerTema(TEMAS[0]);

  const botonesPadreDesktop = await contarBotonesCon(nombrePadre);
  afirmar(botonesPadreDesktop === 1, "en escritorio también es UN solo botón padre",
    `botones: ${botonesPadreDesktop}`);
  afirmar(
    (await contarBotonesCon(NOMBRE_MODALIDAD_A)) === 0 &&
      (await contarBotonesCon(NOMBRE_MODALIDAD_B)) === 0,
    "y las modalidades no se despliegan solas"
  );
  await retratar(`${ANCHO_DESKTOP}-pos-panel`);

  await clickEn(botonConTexto(nombrePadre));
  await sleep(400);
  afirmar(
    await evaluar(`document.body.innerText.includes("Elegí la modalidad")`),
    "el selector abre igual en escritorio"
  );
  afirmar(
    (await contarBotonesCon(NOMBRE_MODALIDAD_A)) === 1 &&
      (await contarBotonesCon(NOMBRE_MODALIDAD_B)) === 1,
    "con las dos modalidades, igual que en mobile: mismo contrato"
  );
  const desbordeDesktop = await evaluar(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  afirmar(desbordeDesktop <= 0, "sin desborde horizontal en escritorio", `sobran ${desbordeDesktop} px`);
  await retratar(`${ANCHO_DESKTOP}-selector-modalidad`);

  await navegar(`${BASE}/modulos/configuracion/pos-ventas/cobros/${encodeURIComponent(String(medioId))}`);
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "Cobros en escritorio");
  afirmar(
    await evaluar(`document.body.innerText.includes(${JSON.stringify(NOMBRE_MODALIDAD_A)})`),
    "y Cobros muestra las modalidades en escritorio"
  );
} catch (err) {
  morir(err?.message || String(err));
} finally {
  // Se borra lo que la sonda creó. Un script que ensucia la configuración de un
  // local es un script que alguien va a correr donde no debe.
  try {
    for (const modalidadId of modalidades) {
      await evaluar(
        `fetch("/api/medios-cobro/" + ${Number(medioId)} + "/modalidades/" + ${Number(modalidadId)},` +
          `{method:"DELETE",credentials:"same-origin"}).then(r=>r.json())`,
        true
      );
    }
  } catch {}
  try { ws?.close(); } catch {}
  try { edge.kill(); } catch {}
}

console.log("");
if (fallas.length > 0) {
  console.log(`ROJO · ${fallas.length} afirmaciones no se cumplieron:`);
  for (const f of fallas) console.log(`  ✗ ${f.titulo}${f.detalle ? ` — ${f.detalle}` : ""}`);
  process.exit(1);
}
console.log("VERDE · todas las afirmaciones de la sonda se cumplieron.");
process.exit(0);
