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
const LOCAL = arg("local");
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-modalidades-cobro"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

// Los dos anchos que el pedido exige medir. El primero es la Sunmi.
const ANCHO_MOBILE = Number(arg("ancho-mobile", "390"));
const ALTO_MOBILE = Number(arg("alto-mobile", "844"));
const ANCHO_DESKTOP = Number(arg("ancho-desktop", "1366"));
const ALTO_DESKTOP = Number(arg("alto-desktop", "900"));

// Los cuatro temas que hay que ver. No se adapta la UI con condicionales: la
// misma pantalla tiene que responder a los tokens, y eso se comprueba leyendo el
// color COMPUTADO en cada uno.
const TEMAS = (arg("temas", "dark,light,sand,blueClassic") || "").split(",").map((t) => t.trim()).filter(Boolean);

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

  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });

  if (LOCAL) {
    const r = await evaluar(
      `fetch("/api/contexto-activo/set",{method:"POST",headers:{"Content-Type":"application/json"},` +
        `body:JSON.stringify({localId:${Number(LOCAL)}})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}))`,
      true
    );
    if (!r || r.ok !== true) morir(`no pude pararme en el local ${LOCAL}: ${r?.error ?? "sin respuesta"}`);
    console.log(`ubicación pedida: ${r.nombre} (id ${r.localId})`);
  }

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

  const crear = async (nombre, recargo) => {
    const r = await evaluar(
      `fetch("/api/medios-cobro/" + encodeURIComponent(${JSON.stringify(padre.claveEdicion)}) + "/modalidades",` +
        `{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},` +
        `body:JSON.stringify({nombre:${JSON.stringify(nombre)},tipoContable:"CREDITO",recargoPct:${recargo},comisionPct:null})})` +
        `.then(r=>r.json())`,
      true
    );
    if (!r?.ok) morir(`no pude crear la modalidad "${nombre}": ${r?.error ?? "sin respuesta"}`);
    return r.modalidadId;
  };
  // La creación se hace por la API a propósito: lo que esta sonda tiene que
  // medir es la PANTALLA DE COBRO, y tipear dos formularios enteros para llegar
  // ahí la haría frágil por motivos que no son el objeto de la medición. El
  // formulario se ejerce igual, más abajo, editando.
  modalidades = [await crear(NOMBRE_MODALIDAD_A, RECARGO_A), await crear(NOMBRE_MODALIDAD_B, RECARGO_B)];
  medioId = (await evaluar(
    `fetch("/api/medios-cobro",{credentials:"same-origin"}).then(r=>r.json())`, true
  )).medios.find((m) => m.tipoContable === "MERCADOPAGO")?.id;

  await navegar(`${BASE}/modulos/configuracion/pos-ventas/cobros/${encodeURIComponent(String(medioId))}`);
  await esperar(`document.body.innerText.includes("MODALIDADES")`, "la sección MODALIDADES");

  const textoCobros = await evaluar(`document.body.innerText`);
  afirmar(textoCobros.includes(NOMBRE_MODALIDAD_A), "la primera modalidad se ve en la lista");
  afirmar(textoCobros.includes(NOMBRE_MODALIDAD_B), "la segunda también, aunque comparta el tipo contable");
  afirmar(textoCobros.includes("Recargo 4 %"), "con su recargo", textoCobros.slice(0, 400));
  afirmar(textoCobros.includes("Recargo 8 %"), "y el de la otra");
  afirmar(
    textoCobros.includes("Comisión sin configurar"),
    "una comisión sin cargar se dice SIN CONFIGURAR"
  );
  afirmar(
    !/hered/i.test(textoCobros.split("MODALIDADES")[1] ?? ""),
    "y NUNCA heredada: una modalidad no hereda del grupo"
  );
  afirmar(
    /la condición.*modalidad/i.test(textoCobros) || textoCobros.includes("cobra por modalidad"),
    "y se avisa que la condición del medio ya no manda"
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 3. COBROS: editar una modalidad, con el teclado ────────────");
  // ═════════════════════════════════════════════════════════════════════════

  await navegar(
    `${BASE}/modulos/configuracion/pos-ventas/cobros/${encodeURIComponent(String(medioId))}/modalidades/${modalidades[0]}`
  );
  await esperar(`document.body.innerText.includes("CONDICIÓN COMERCIAL")`, "el formulario de la modalidad");

  const formulario = await evaluar(`document.body.innerText`);
  afirmar(formulario.includes("Sin configurar"), "el campo de comisión dice Sin configurar");
  afirmar(!/hered/i.test(formulario), "y en ningún lado dice Heredada");
  afirmar(!formulario.includes("Procesador\nElegir"), "no se pide procesador: lo aporta el padre");

  // ── LA ESCRITURA NUMÉRICA, EJERCIDA DE VERDAD ───────────────────────────
  //
  // El contrato ya cerrado: con un 0 seleccionado, teclear 1 deja 1 y no 10. Se
  // ejerce con el TECLADO del navegador, que es el único que reproduce el caso.
  const inputRecargo = `[...document.querySelectorAll('input[type=number]')].find((i) => i.value === "4" || i.value === "0")`;
  await clickEn(inputRecargo);
  await evaluar(`(() => { const i = ${inputRecargo}; if (i) { i.focus(); i.select(); } return true; })()`);
  for (const texto of ["1"]) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", text: texto });
    await send("Input.dispatchKeyEvent", { type: "char", text: texto });
    await send("Input.dispatchKeyEvent", { type: "keyUp", text: texto });
  }
  await sleep(200);
  const valorTrasTeclear = await evaluar(`(${inputRecargo} || {}).value ?? null`);
  afirmar(
    valorTrasTeclear === "1",
    "con el valor seleccionado, teclear 1 deja 1 y no 10",
    `quedó ${JSON.stringify(valorTrasTeclear)}`
  );

  // ── FOCO VISIBLE CON TAB, Y SIN INDICADOR POR CLICK ─────────────────────
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await sleep(200);
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

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 4. POS: un solo botón padre, y el selector ─────────────────");
  // ═════════════════════════════════════════════════════════════════════════

  const abrirPos = async () => {
    await navegar(`${BASE}/modulos/pos-ventas`);
    await esperar(`document.body.innerText.includes("Elegí cómo cobrar") ||
      document.body.innerText.includes("Total a cobrar") ||
      document.body.innerText.includes("Total según el medio")`, "el panel de cobro del POS");
  };
  await abrirPos();

  // Hace falta algo en el carrito para que los importes existan. Se busca un
  // producto REAL del local con el buscador de la pantalla.
  const cargoCarrito = await evaluar(
    `(async () => {
       const r = await fetch("/api/pos-ventas/buscar-producto?q=a", { credentials: "same-origin" }).then((x) => x.json());
       return (r.items || []).length;
     })()`,
    true
  );
  if (!cargoCarrito) morir("el local no tiene productos para cargar el carrito");

  const input = `document.querySelector('input[type=search], input[placeholder*="uscar"]')`;
  await clickEn(input);
  await evaluar(`(() => { const i = ${input}; if (i) i.focus(); return true; })()`);
  for (const ch of "a") {
    await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch });
    await send("Input.dispatchKeyEvent", { type: "char", text: ch });
    await send("Input.dispatchKeyEvent", { type: "keyUp", text: ch });
  }
  await sleep(900);
  await evaluar(`(() => {
    const b = [...document.querySelectorAll("button,li,div[role=option]")].find((n) => n.dataset && n.dataset.resultado);
    if (b) b.click();
    return true;
  })()`);
  await sleep(600);

  const nombrePadre = padre.nombre;
  const textoPos = await evaluar(`document.body.innerText`);
  const vecesPadre = textoPos.split(nombrePadre).length - 1;
  afirmar(vecesPadre >= 1, `el botón "${nombrePadre}" está en el panel`);
  afirmar(
    !textoPos.includes(NOMBRE_MODALIDAD_A) && !textoPos.includes(NOMBRE_MODALIDAD_B),
    "y sus modalidades NO son botones del panel: es UN solo botón"
  );

  // Tocarlo NO cobra: abre el selector.
  const toco = await clickEn(botonConTexto(nombrePadre));
  afirmar(toco, "se puede tocar el botón padre");
  await sleep(400);
  const trasTocar = await evaluar(`document.body.innerText`);
  afirmar(
    trasTocar.includes("Elegí la modalidad"),
    "tocarlo abre el selector en vez de cobrar",
    trasTocar.slice(0, 300)
  );
  afirmar(trasTocar.includes(NOMBRE_MODALIDAD_A), "el selector muestra la primera modalidad");
  afirmar(trasTocar.includes(NOMBRE_MODALIDAD_B), "y la segunda, con el mismo tipo contable");
  afirmar(
    await evaluar(`window.__cobros.length === 0`),
    "y no se mandó ningún cobro al abrir el selector"
  );

  // Los dos importes tienen que ser DISTINTOS: 4 % contra 8 %.
  const importes = await evaluar(
    `[...document.querySelectorAll("button")]
       .map((b) => (b.textContent || "").match(/\\$[\\d.,]+/g) || [])
       .flat()`
  );
  afirmar(
    new Set(importes).size >= 2,
    "las dos modalidades muestran importes DISTINTOS",
    JSON.stringify(importes)
  );

  // ── SIN DESBORDE HORIZONTAL A 390 px ────────────────────────────────────
  const desborde = await evaluar(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  afirmar(desborde <= 0, "el selector no desborda a lo ancho en mobile", `sobran ${desborde} px`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 5. POS: elegir la modalidad manda IDENTIDAD, no porcentajes ─");
  // ═════════════════════════════════════════════════════════════════════════

  const totalEnPantalla = await evaluar(
    `(() => {
       const b = ${botonConTexto(NOMBRE_MODALIDAD_B)};
       const m = (b?.textContent || "").match(/\\$([\\d.]+,\\d{2})/);
       return m ? m[1] : null;
     })()`
  );
  afirmar(totalEnPantalla != null, "la opción muestra su importe");

  await evaluar(`window.__respuestaCobro = { status: 200, cuerpo: { ok: true, ventaId: 0, numero: 0, breakdown: {} } }; true`);
  await clickEn(botonConTexto(NOMBRE_MODALIDAD_B));
  await sleep(700);

  const cobro = await evaluar(`window.__cobros[window.__cobros.length - 1] || null`);
  afirmar(cobro != null, "elegir la modalidad dispara el cobro");
  const tender = cobro?.pagos?.[0] ?? null;
  afirmar(tender != null, "el cuerpo lleva un tender", JSON.stringify(cobro));
  afirmar(
    tender?.medioCobroLocalId === medioId,
    "con el id del medio padre",
    JSON.stringify(tender)
  );
  afirmar(
    tender?.modalidadId === modalidades[1],
    "y el id de la modalidad elegida",
    JSON.stringify(tender)
  );
  afirmar(
    tender != null && !("recargoPct" in tender) && !("comisionPct" in tender) &&
      !("tipoContable" in tender) && !("procesador" in tender),
    "y NINGÚN porcentaje, comisión, tipo ni procesador: eso lo resuelve el servidor",
    JSON.stringify(tender)
  );
  afirmar(
    cobro?.totalPantalla != null &&
      String(cobro.totalPantalla).replace(".", ",") === String(totalEnPantalla).replace(/\./g, ""),
    "y el total que viaja es EL QUE SE VIO",
    `pantalla ${totalEnPantalla} · cuerpo ${cobro?.totalPantalla}`
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

  await abrirPos();
  await clickEn(botonConTexto(nombrePadre));
  await sleep(400);

  const lecturas = {};
  for (const tema of TEMAS) {
    await evaluar(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(tema)}); true`);
    await sleep(300);
    lecturas[tema] = await evaluar(
      `(() => {
         const b = ${botonConTexto(NOMBRE_MODALIDAD_A)};
         if (!b) return null;
         const cs = getComputedStyle(b);
         return { fondo: cs.backgroundColor, texto: cs.color, borde: cs.borderColor };
       })()`
    );
    afirmar(lecturas[tema] != null, `el selector se dibuja en el tema ${tema}`);
  }
  const distintos = new Set(Object.values(lecturas).filter(Boolean).map((l) => l.fondo + l.texto));
  afirmar(
    distintos.size > 1,
    "los temas cambian el color de verdad: la UI responde a los tokens",
    JSON.stringify(lecturas)
  );

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n── 9. ESCRITORIO: el mismo contrato, otra composición ─────────");
  // ═════════════════════════════════════════════════════════════════════════

  await evaluar(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(TEMAS[0] ?? "dark")}); true`);
  await medirEn(ANCHO_DESKTOP, ALTO_DESKTOP, false);
  await abrirPos();

  const textoDesktop = await evaluar(`document.body.innerText`);
  afirmar(textoDesktop.includes(nombrePadre), "el botón padre está en escritorio");
  afirmar(
    !textoDesktop.includes(NOMBRE_MODALIDAD_A),
    "y sigue siendo UN botón: las modalidades no se despliegan solas"
  );
  await clickEn(botonConTexto(nombrePadre));
  await sleep(400);
  afirmar(
    await evaluar(`document.body.innerText.includes("Elegí la modalidad")`),
    "el selector abre igual en escritorio"
  );
  const desbordeDesktop = await evaluar(
    `document.documentElement.scrollWidth - document.documentElement.clientWidth`
  );
  afirmar(desbordeDesktop <= 0, "sin desborde horizontal en escritorio", `sobran ${desbordeDesktop} px`);

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
