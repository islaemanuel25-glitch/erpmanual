// SONDA DE "CREAR BORRADOR DESDE ARCHIVO" — foto, PDF o Excel.
//
// Abre el modal de importación en un navegador de verdad, a 390 y a 1366, y
// afirma que la pantalla se puede usar: que no corta texto, que no pisa
// controles, que el pie se alcanza, y que el velo cierra SOLO cuando no hay nada
// que perder.
//
// ── POR QUÉ NO ALCANZA CON LOS CANDADOS ────────────────────────────────────
//
// Los candados de este módulo son funciones puras: leen un archivo o ejercen un
// mapeo. Ninguno puede contestar si el pie entra en la ventana de un celular, ni
// si el velo cierra en el paso equivocado. Eso solo lo dice un navegador.
//
// ── TODO LO QUE SE VE ACÁ ES INVENTADO ─────────────────────────────────────
//
// Se interceptan los CUATRO endpoints que la pantalla consume, así que la sonda
// **no crea pedidos, no sube archivos y no llama al modelo**. El proveedor, los
// productos y el documento leído son constantes de este archivo. No hay un solo
// dato de un proveedor real, y no hace falta ningún binario: el "archivo
// elegido" es un `File` armado en memoria que nadie llega a leer.
//
// Las capturas van a un directorio temporal del sistema, FUERA del repo.
//
// ── CONTRA QUÉ SE PUEDE CORRER ─────────────────────────────────────────────
//
// Solo contra un servidor local, y está comprobado abajo. Aunque los endpoints
// estén interceptados, la sonda hace login de verdad: apuntarla a producción
// gastaría intentos del límite de acceso y tocaría la interfaz que están usando
// cinco locales. La restricción es del arranque y no una intención.
//
// Uso:
//   node scripts/sonda-importar-pedido-desde-archivo.mjs \
//     --base http://localhost:3111 --usuario admin@admin.com --clave <clave-dev>

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3000");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const SALIDA = arg("salida", path.join(os.tmpdir(), "sonda-importar-pedido"));
const PUERTO = Number(arg("puerto-cdp", "9411"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = path.join(os.tmpdir(), "sonda-importar-pedido-perfil");

// ── EL CANDADO DE LA URL, QUE VA ANTES QUE CUALQUIER OTRA COSA ─────────────
//
// Se mira el HOSTNAME parseado y no la cadena: un `--base https://operix.cloud`
// no tiene por qué contener la palabra "prod" para ser producción, y una
// comprobación por subcadena dejaría pasar cualquier host nuevo.
const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);
let anfitrion;
try {
  anfitrion = new URL(BASE).hostname;
} catch {
  console.error(`--base no es una URL válida: ${BASE}`);
  process.exit(1);
}
if (!LOCALES.has(anfitrion)) {
  console.error(`\nFRENO: --base apunta a "${anfitrion}", que no es local.`);
  console.error("Esta sonda hace login real y opera la interfaz. Contra producción");
  console.error("gastaría intentos del límite de acceso y molestaría a los locales.");
  console.error(`Locales aceptados: ${[...LOCALES].join(", ")}`);
  process.exit(1);
}

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });
// La salida se vacía en cada corrida. Si no, una corrida que FRENA antes de
// capturar deja las fotos de la anterior, y quedan mirándote como si fueran de
// ésta. Pasó verificando esta misma sonda.
fs.rmSync(SALIDA, { recursive: true, force: true });
fs.mkdirSync(SALIDA, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    console.log(`        ${detalle}`);
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
    } catch {
      // El navegador todavía no levantó el puerto: se reintenta.
    }
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

// OJO: `returnByValue` NO puede serializar un nodo del DOM. Toda expresión que
// pregunte por un elemento tiene que devolver un booleano o una cadena — si
// devuelve el nodo, esto lanza y el `esperarA` lo lee como "todavía no está".
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

async function esperarA(expresion, cuantoMs = 30000, cada = 200) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {
      // Una expresión que todavía no puede evaluarse cuenta como "no está".
    }
    await sleep(cada);
  }
  return false;
}

async function medidas(w, h) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: 1, mobile: w < 700,
  });
  await sleep(400);
}

async function capturar(nombre) {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const ruta = path.join(SALIDA, nombre);
  fs.writeFileSync(ruta, Buffer.from(r.data, "base64"));
  return ruta;
}

// ── LOS DATOS INVENTADOS ───────────────────────────────────────────────────
//
// LA FORMA SALE DEL CONSUMIDOR REAL, NO DE LA MEMORIA. `prepararLineas.js`
// vincula por CÓDIGO INTERNO del proveedor —no por código de barra— y necesita
// `baseId`; `cantidad.js` lee `factor_pack`, `modoCompra` y `unidad_medida`, en
// snake_case. Escribirlos "parecidos" ya costó una tanda de capturas: ninguna
// línea vinculaba, así que la fila de cantidad no se dibujaba y las capturas
// retrataban un caso que no era el que se quería mirar.
//
// Son constantes: no hay fechas, ni azar, ni nada que dependa del entorno.
const FALSO = {
  proveedores: [{ id: 4242, nombre: "Distribuidora Ejemplo SRL", activo: true }],
  productos: [
    { productoLocalId: 9001, baseId: 8001, nombre: "Galletita Sintetica Vainilla 120g", codigoInterno: "SINT-001", unidad_medida: "pack", factor_pack: 12, modoCompra: "BULTO", precioCosto: 1200 },
    { productoLocalId: 9002, baseId: 8002, nombre: "Jugo Ficticio Naranja 1L", codigoInterno: "SINT-002", unidad_medida: "unidad", factor_pack: 6, modoCompra: "BULTO", precioCosto: 900 },
    { productoLocalId: 9003, baseId: 8003, nombre: "Arroz Imaginario Largo Fino 1kg", codigoInterno: "SINT-003", unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precioCosto: 1500 },
  ],
  documento: {
    numeroPedido: "SINTETICO-001",
    lineas: [
      { descripcion: "Galletita Sintetica Vainilla 120g", cantidad: 4, unidad: "BULTO", codigo: "SINT-001" },
      { descripcion: "Jugo Ficticio Naranja 1L", cantidad: 12, unidad: "UNIDAD", codigo: "SINT-002" },
      { descripcion: "Arroz Imaginario Largo Fino 1kg", cantidad: 6, unidad: "UNIDAD", codigo: "SINT-003" },
      // La cuarta NO vincula a propósito: ejerce el camino de revisión manual y,
      // con un nombre deliberadamente largo, el ajuste del texto.
      { descripcion: "Producto Que No Existe En El Catalogo Con Nombre Deliberadamente Largo Para Ver Si Se Corta", cantidad: 3, unidad: "UNIDAD", codigo: "" },
    ],
  },
};

// Los CUATRO endpoints. `analizar` se responde de mentira, así que el modelo no
// se llama nunca; `aplicar` se corta para que no se cree ningún pedido aunque
// alguien toque el botón del pie.
const INTERCEPTOR = `
(() => {
  const D = ${JSON.stringify(FALSO)};
  const original = window.fetch;
  window.__intercepciones = [];
  window.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    const responder = (cuerpo) => {
      window.__intercepciones.push(url.split("?")[0]);
      return new Response(JSON.stringify(cuerpo), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    };
    if (url.includes("/api/proveedores/listar")) {
      return responder({ ok: true, items: D.proveedores, proveedores: D.proveedores, data: D.proveedores });
    }
    if (url.includes("/api/compras-proveedor/productos")) {
      return responder({ ok: true, items: D.productos, productos: D.productos, data: D.productos });
    }
    if (url.includes("/api/compras-proveedor/importar/analizar")) {
      await new Promise((r) => setTimeout(r, 500));
      return responder({ ok: true, documento: D.documento });
    }
    if (url.includes("/api/compras-proveedor/importar/aplicar")) {
      return responder({ ok: false, error: "SONDA: no se crean pedidos de verdad." });
    }
    return original(entrada, opciones);
  };
  window.__sintetico = true;
})();
`;

// ── EL ESTADO SE LEE POR PIEZAS PROPIAS, NO POR EL TÍTULO ──────────────────
//
// El título del modal dice "Crear borrador desde archivo" en los TRES pasos, así
// que buscar /Crear borrador/ clasifica todo como `revisar`. Ya pasó. Lo que
// distingue de verdad es qué pieza está montada: el `input[type=file]` solo
// existe en `elegir`, el girador solo en `analizando`, y el botón del PIE
// —distinto del título, que no es un botón— solo en `revisar`.
const estado = () => evaluar(`(() => {
  const c = document.querySelector('[role="dialog"]');
  if (!c) return "cerrado";
  if (c.querySelector('input[type="file"]')) return "elegir";
  if (c.querySelector('.animate-spin')) return "analizando";
  const pie = [...c.querySelectorAll('button')].some((b) => /^(Crear borrador|Creando\\.\\.\\.)$/.test((b.innerText || "").trim()));
  const filas = c.querySelectorAll('[class*="flex-col"] > div').length > 0;
  if (pie && filas) return "revisar";
  return "?";
})()`);

/** Texto que no entra en su caja y que además no se puede llegar a ver. */
const cortados = () => evaluar(`JSON.stringify((() => {
  const capa = document.querySelector('[role="dialog"]');
  if (!capa) return [];
  const malos = [];
  for (const el of capa.querySelectorAll('*')) {
    if (!el.firstChild || el.children.length) continue;
    const s = getComputedStyle(el);
    const desborda = el.scrollWidth > el.clientWidth + 1;
    const puedeVerse = /auto|scroll/.test(s.overflowX) || s.textOverflow === "ellipsis";
    if (desborda && !puedeVerse && (el.innerText || "").trim()) {
      malos.push({ txt: (el.innerText || "").trim().slice(0, 45), sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  return malos.slice(0, 8);
})())`);

/**
 * Controles que se pisan entre sí.
 *
 * ── EL VELO SE EXCLUYE POR IDENTIDAD, NO POR TAMAÑO ──────────────────────
 *
 * El velo de `SunmiModalLayout` es un `<button class="absolute inset-0">` hijo
 * DIRECTO de la capa: cubre la ventana entera y por eso se superpone a todos los
 * controles, que es exactamente su trabajo. La primera versión de esto lo
 * descartaba por área —"todo lo que ocupe más del 90% de la ventana"— y eso
 * aflojaba la detección para cualquier otra cosa grande que apareciera. Ahora se
 * lo saca por lo que ES: ese nodo y ninguno más.
 */
const superpuestos = () => evaluar(`JSON.stringify((() => {
  const capa = document.querySelector('[role="dialog"]');
  if (!capa) return [];
  const velos = new Set(capa.querySelectorAll(':scope > button.absolute.inset-0'));
  const ctr = [...capa.querySelectorAll('button, input, select, [role="button"]')]
    .filter((e) => !velos.has(e))
    .filter((e) => e.offsetParent !== null)
    .map((e) => ({ r: e.getBoundingClientRect(), t: (e.innerText || e.value || e.tagName).trim().slice(0, 22) }))
    .filter((x) => x.r.width > 0 && x.r.height > 0);
  const choques = [];
  for (let i = 0; i < ctr.length; i++) {
    for (let j = i + 1; j < ctr.length; j++) {
      const a = ctr[i].r, b = ctr[j].r;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) choques.push(ctr[i].t + " x " + ctr[j].t);
    }
  }
  return choques.slice(0, 8);
})())`);

/** El pie de `revisar`: que exista, entre en la ventana y se pueda tocar. */
const pie = () => evaluar(`JSON.stringify((() => {
  const capa = document.querySelector('[role="dialog"]');
  if (!capa) return null;
  const b = [...capa.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
  if (!b) return { hay: false };
  const r = b.getBoundingClientRect();
  const centro = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    hay: true,
    dentro: r.bottom <= innerHeight + 1 && r.top >= -1,
    alcanzable: !!centro && (centro === b || b.contains(centro)),
    bottom: Math.round(r.bottom), vh: innerHeight,
  };
})())`);

/**
 * La fila de cantidad de una línea VINCULADA.
 *
 * Solo se dibuja cuando la línea encontró producto, así que es la prueba de que
 * el dato sintético vinculó de verdad. Sin esto, cuatro líneas sin vincular
 * dejarían una captura perfectamente nítida de un caso que no es el que se
 * quería mirar — y eso ya pasó una vez.
 */
const filaVinculada = () => evaluar(`JSON.stringify((() => {
  const capa = document.querySelector('[role="dialog"]');
  if (!capa) return { hay: false, motivo: "no hay modal" };
  const inputs = [...capa.querySelectorAll('input')].filter((e) => (e.className || "").includes('tabular-nums'));
  if (!inputs.length) return { hay: false, motivo: "ninguna linea vinculo: no hay campo de cantidad" };
  const fila = inputs[0].parentElement;
  const unidad = fila ? fila.querySelector('div') : null;
  if (!unidad) return { hay: false, motivo: "hay cantidad pero no la unidad al lado" };
  const r = inputs[0].getBoundingClientRect(), ru = unidad.getBoundingClientRect();
  return {
    hay: true, cuantas: inputs.length,
    anchoCantidad: Math.round(r.width), anchoUnidad: Math.round(ru.width),
    textoUnidad: (unidad.innerText || "").trim().slice(0, 12),
  };
})())`);

/**
 * Tocar el velo.
 *
 * Se toca EL NODO DEL VELO, que es donde caería el dedo: en `elegir` es un
 * `<button>` con manejador y cierra; en `revisar` es un `<div aria-hidden>` sin
 * manejador y no pasa nada. Esa diferencia ES lo que la contraprueba mide.
 */
const tocarVelo = () => evaluar(`(() => {
  const capa = document.querySelector('[role="dialog"]');
  if (!capa) return "sin-modal";
  const velo = capa.querySelector(':scope > button.absolute.inset-0, :scope > div.absolute.inset-0');
  if (!velo) return "sin-velo";
  const clase = velo.tagName === "BUTTON" ? "boton" : "inerte";
  velo.click();
  return clase;
})()`);

const edge = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=390,844", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { edge.kill(); } catch { /* ya murió */ } });

const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

(async () => {
  const WS = (await import("ws")).default;
  ws = new WS(await urlDepurador(), { perMessageDeflate: false });
  await new Promise((r) => ws.on("open", r));
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    }
  });
  const targets = await send("Target.getTargets", {}, false);
  const pagina = targets.targetInfos.find((t) => t.type === "page");
  ({ sessionId } = await send("Target.attachToTarget", { targetId: pagina.targetId, flatten: true }, false));
  await send("Page.enable");
  await send("Runtime.enable");

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  // El interceptor se instala ANTES de que la pantalla cargue: si se instalara
  // después, el primer pedido de proveedores ya habría salido de verdad.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: INTERCEPTOR });

  console.log("\n── datos inventados, sin tocar nada real ───────────────────────");
  await medidas(390, 844);
  await navegar(`${BASE}/modulos/compras-proveedor/nueva`);
  if (!(await esperarA(`window.__sintetico === true`, 20000))) morir("el interceptor no quedó instalado");

  // Elegir el proveedor inventado. El selector es un `SunmiSelectAdv`: no dibuja
  // sus opciones hasta que se lo abre.
  if (!(await esperarA(`[...document.querySelectorAll('button,[role="combobox"]')].some((b)=>/Seleccionar/i.test(b.innerText||""))`, 25000))) {
    morir("no apareció el selector de proveedor");
  }
  await evaluar(`[...document.querySelectorAll('button,[role="combobox"]')].find((b)=>/Seleccionar/i.test(b.innerText||"")).click()`);
  if (!(await esperarA(`[...document.querySelectorAll('*')].some((e)=>/Distribuidora Ejemplo SRL/.test(e.textContent||""))`, 15000))) {
    morir("el proveedor inventado no apareció al abrir el selector");
  }
  await evaluar(`(() => {
    const cand = [...document.querySelectorAll('[role="option"],li,button,div')]
      .filter((e) => /^\\s*Distribuidora Ejemplo SRL\\s*$/.test(e.textContent || ""));
    (cand[cand.length - 1] || cand[0])?.click();
    return true;
  })()`);
  await sleep(1500);

  if (!(await esperarA(`[...document.querySelectorAll('button')].some((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||""))`, 20000))) {
    morir("no apareció el botón que abre el modal");
  }
  await evaluar(`[...document.querySelectorAll('button')].find((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||"")).click()`);
  if (!(await esperarA(`!!document.querySelector('[role="dialog"]')`, 15000))) morir("el modal no abrió");

  const tocados = await evaluar(`JSON.stringify([...new Set(window.__intercepciones || [])])`);
  afirmar(
    JSON.parse(tocados).length >= 2,
    `los endpoints se responden de mentira: ${JSON.parse(tocados).join(" · ")}`,
    "no se interceptó ninguno: la sonda estaría tocando datos reales"
  );

  const capturas = [];

  console.log("\n── estado `elegir` ─────────────────────────────────────────────");
  for (const [w, h] of [[390, 844], [1366, 900]]) {
    await medidas(w, h);
    const e = await estado();
    if (e !== "elegir") morir(`se esperaba 'elegir' a ${w}px y hay '${e}'`);
    capturas.push(await capturar(`elegir-${w}x${h}.png`));
    const c = JSON.parse(await cortados()), s = JSON.parse(await superpuestos());
    afirmar(c.length === 0, `elegir · ${w}×${h} · sin texto cortado`, JSON.stringify(c));
    afirmar(s.length === 0, `elegir · ${w}×${h} · sin controles superpuestos`, JSON.stringify(s));
  }

  console.log("\n── contraprueba del velo, primera mitad ────────────────────────");
  await medidas(1366, 900);
  const tipoElegir = await tocarVelo();
  await sleep(700);
  const trasVeloElegir = await estado();
  afirmar(
    tipoElegir === "boton" && trasVeloElegir === "cerrado",
    "en `elegir` el velo es tocable y CIERRA",
    `el velo era '${tipoElegir}' y el modal quedó en '${trasVeloElegir}'`
  );

  // Reabrir y pasar a `revisar` con el análisis inventado. El "archivo" es un
  // File en memoria: no hay ningún binario en el repo ni en el disco.
  await evaluar(`[...document.querySelectorAll('button')].find((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||""))?.click()`);
  if (!(await esperarA(`!!document.querySelector('[role="dialog"]')`, 15000))) morir("el modal no volvió a abrir");
  await evaluar(`(() => {
    const inp = document.querySelector('[role="dialog"] input[type="file"]');
    if (!inp) return false;
    const f = new File(["pedido inventado"], "pedido-sintetico.pdf", { type: "application/pdf" });
    const dt = new DataTransfer(); dt.items.add(f);
    Object.defineProperty(inp, "files", { value: dt.files, configurable: true });
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!(await esperarA(`(() => {
    const c = document.querySelector('[role="dialog"]');
    return !!c && !c.querySelector('input[type="file"]') && !c.querySelector('.animate-spin');
  })()`, 25000))) {
    morir("no se llegó a `revisar` con el análisis inventado");
  }

  console.log("\n── estado `revisar` ────────────────────────────────────────────");
  // LA EXIGENCIA VA ANTES DE LA CAPTURA: si la línea no vinculó, la foto sería
  // de otro caso y no hay nada que mirar.
  const fila = JSON.parse(await filaVinculada());
  if (!fila.hay) morir(`la fila vinculada no se dibujó — ${fila.motivo}`);
  console.log(`     ${fila.cuantas} línea(s) vinculada(s) · cantidad ${fila.anchoCantidad}px · unidad ${fila.anchoUnidad}px ("${fila.textoUnidad}")`);

  for (const [w, h] of [[390, 844], [1366, 900]]) {
    await medidas(w, h);
    const e = await estado();
    if (e !== "revisar") morir(`se esperaba 'revisar' a ${w}px y hay '${e}'`);
    const f = JSON.parse(await filaVinculada());
    afirmar(f.hay, `revisar · ${w}×${h} · la fila vinculada está dibujada`, f.motivo || "");
    if (!f.hay) morir(`a ${w}px la fila vinculada desapareció — ${f.motivo}`);

    capturas.push(await capturar(`revisar-${w}x${h}.png`));
    const c = JSON.parse(await cortados()), s = JSON.parse(await superpuestos()), p = JSON.parse(await pie());
    afirmar(c.length === 0, `revisar · ${w}×${h} · sin texto cortado`, JSON.stringify(c));
    afirmar(s.length === 0, `revisar · ${w}×${h} · sin controles superpuestos`, JSON.stringify(s));
    afirmar(p && p.hay && p.dentro && p.alcanzable, `revisar · ${w}×${h} · el pie entra en la ventana y se puede tocar`, JSON.stringify(p));
  }

  console.log("\n── contraprueba del velo, segunda mitad ────────────────────────");
  await medidas(1366, 900);
  const tipoRevisar = await tocarVelo();
  await sleep(700);
  const trasVeloRevisar = await estado();
  afirmar(
    tipoRevisar === "inerte" && trasVeloRevisar === "revisar",
    "en `revisar` el velo es inerte y NO cierra",
    `el velo era '${tipoRevisar}' y el modal quedó en '${trasVeloRevisar}'`
  );

  console.log("\ncapturas (fuera del repo):");
  for (const c of capturas) console.log("  " + c);

  if (fallas.length) {
    console.log(`\nROJO · ${fallas.length} problema(s): ${fallas.join(" · ")}`);
    process.exit(1);
  }
  console.log("\nVERDE · el modal entra en los dos anchos, no corta texto, no pisa");
  console.log("controles, el pie se alcanza, y el velo cierra solo cuando no hay");
  console.log("nada que perder.");
  process.exit(0);
})().catch((e) => morir(e.message));
