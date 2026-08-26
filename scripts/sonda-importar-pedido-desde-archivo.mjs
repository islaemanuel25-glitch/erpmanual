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
    { productoLocalId: 9001, baseId: 8001, nombre: "Galletita Sintetica Vainilla 120g", codigoInterno: "SINT-001", unidad_medida: "pack", factor_pack: 12, modoCompra: "BULTO", precio_costo: 1200, precioCosto: 1200 },
    { productoLocalId: 9002, baseId: 8002, nombre: "Jugo Ficticio Naranja 1L", codigoInterno: "SINT-002", unidad_medida: "unidad", factor_pack: 6, modoCompra: "BULTO", precio_costo: 900, precioCosto: 900 },
    { productoLocalId: 9003, baseId: 8003, nombre: "Arroz Imaginario Largo Fino 1kg", codigoInterno: "SINT-003", unidad_medida: "unidad", factor_pack: 1, modoCompra: "UNIDAD", precio_costo: 1500, precioCosto: 1500 },
    // EL CASO ECONÓMICO, con los números de la revisión: un PACK de 21 cuyo
    // bulto vale 2.100. Se piden 40 unidades, que no son bultos enteros, así que
    // la línea queda en UNIDAD y su costo TIENE que ser 100 — no 2.100. Es la
    // única línea del escenario cuyo costo cambia de escala, y por eso es la que
    // la sonda mira en el cuerpo que se manda a crear.
    { productoLocalId: 9004, baseId: 8004, nombre: "Pack Sintetico x21", codigoInterno: "SINT-021", unidad_medida: "unidad", factor_pack: 21, modoCompra: "BULTO", precio_costo: 2100, precioCosto: 2100 },
  ],
  documento: {
    numeroPedido: "SINTETICO-001",
    lineas: [
      { descripcion: "Galletita Sintetica Vainilla 120g", cantidad: 4, unidad: "BULTO", codigo: "SINT-001" },
      { descripcion: "Jugo Ficticio Naranja 1L", cantidad: 12, unidad: "UNIDAD", codigo: "SINT-002" },
      { descripcion: "Arroz Imaginario Largo Fino 1kg", cantidad: 6, unidad: "UNIDAD", codigo: "SINT-003" },
      // 40 no es múltiplo de 21: la línea se queda en UNIDAD y su costo baja a 100.
      { descripcion: "Pack Sintetico x21", cantidad: 40, unidad: "UNIDAD", codigo: "SINT-021" },
      // La cuarta NO vincula a propósito: ejerce el camino de revisión manual y,
      // con un nombre deliberadamente largo, el ajuste del texto.
      { descripcion: "Producto Que No Existe En El Catalogo Con Nombre Deliberadamente Largo Para Ver Si Se Corta", cantidad: 3, unidad: "UNIDAD", codigo: "" },
    ],
  },

  // ── EL ESCENARIO DE CONTINUACIÓN ─────────────────────────────────────────
  //
  // Un borrador que YA tiene 2 BULTO del pack a un costo NEGOCIADO de 2.520 —no
  // el maestro, que es 2.100— y encima se importan 5 unidades. La suma da 47
  // UNIDAD y el costo tiene que ser 2.520/21 = 120, no 2.100/21 = 100.
  //
  // Los tres números están elegidos para que no se puedan confundir: 120 sale del
  // negociado, 100 del maestro, y 2.520 es el viejo sin convertir.
  pedido: {
    id: 999001,
    estado: "BORRADOR",
    notas: null,
    proveedor: { id: 4242, nombre: "Distribuidora Ejemplo SRL" },
    detalles: [
      {
        id: 5001,
        productoLocalId: 9004,
        cantidad: 2,
        unidad: "BULTO",
        precioCosto: 2520,
        producto: {
          base: {
            id: 8004, nombre: "Pack Sintetico x21", sku: "SINT-021",
            unidad_medida: "unidad", factor_pack: 21,
            modoCompraProveedor: "BULTO", precio_costo: 2100, pesoReferenciaKg: null,
          },
        },
      },
    ],
  },
  documentoContinuar: {
    numeroPedido: "SINTETICO-002",
    lineas: [{ descripcion: "Pack Sintetico x21", cantidad: 5, unidad: "UNIDAD", codigo: "SINT-021" }],
  },
  // Lo que el servidor DEVUELVE tras reconciliar: la línea ya corregida.
  detalleReconciliado: {
    id: 5001, productoLocalId: 9004, cantidad: 47, unidad: "UNIDAD", precioCosto: 120,
  },
};

// ── EL INTERCEPTOR FALLA CERRADO ───────────────────────────────────────────
//
// La primera versión listaba los endpoints que conocía y mandaba todo lo demás
// al `fetch` original. Eso dejó un agujero real: el escenario abre un pedido
// NUEVO, y ahí "Crear borrador" no llama a `importar/aplicar` sino a
// `compras-proveedor/crear` — que no estaba en la lista y **habría escrito de
// verdad**. La sonda decía "no toca nada real" y no era cierto.
//
// Ahora cualquier ruta de escritura de Compras que no esté reconocida se
// RECHAZA y se anota: si mañana aparece un endpoint nuevo, la sonda se pone roja
// en vez de escribir en la base. Enumerar lo permitido es lo único que sobrevive
// a que el código crezca; enumerar lo prohibido, no.
const INTERCEPTOR = `
(() => {
  const D = ${JSON.stringify(FALSO)};
  const original = window.fetch;
  window.__intercepciones = [];
  window.__cuerpos = {};
  window.__fugas = [];
  window.__analisis = [];
  window.__fallarPrimerAnalisis = false;
  const LECTURA = ["/api/compras-proveedor/productos", "/api/compras-proveedor/obtener"];
  // Que documento devuelve analizar: el del pedido nuevo o el de continuacion.
  // (Sin acentos graves: este bloque vive dentro de un template literal.)
  window.__escenario = "nuevo";

  window.fetch = async (entrada, opciones) => {
    const url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    const ruta = url.split("?")[0];
    const metodo = String((opciones && opciones.method) || "GET").toUpperCase();
    const responder = (cuerpo) => {
      window.__intercepciones.push(ruta);
      return new Response(JSON.stringify(cuerpo), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    };
    const guardar = (clave) => {
      try { window.__cuerpos[clave] = JSON.parse((opciones && opciones.body) || "null"); }
      catch { window.__cuerpos[clave] = "(cuerpo no era JSON)"; }
    };

    if (url.includes("/api/proveedores/listar")) {
      return responder({ ok: true, items: D.proveedores, proveedores: D.proveedores, data: D.proveedores });
    }
    if (url.includes("/api/compras-proveedor/productos")) {
      return responder({ ok: true, items: D.productos, productos: D.productos, data: D.productos });
    }
    if (url.includes("/api/compras-proveedor/obtener")) {
      return responder({ ok: true, item: D.pedido });
    }
    if (url.includes("/api/compras-proveedor/importar/analizar")) {
      await new Promise((r) => setTimeout(r, 300));
      // Se registra QUE archivo viajo, para poder afirmar que el reintento manda
      // el mismo y no uno nuevo elegido a mano.
      try {
        const f = (opciones && opciones.body && opciones.body.get)
          ? opciones.body.get("archivo") : null;
        window.__analisis.push(f ? { nombre: f.name, tam: f.size } : { nombre: null, tam: null });
      } catch { window.__analisis.push({ nombre: null, tam: null }); }

      // EL PRIMER ANALISIS FALLA A PROPOSITO. Sin esto la sonda nunca veia la
      // pantalla de error, y por lo tanto nunca veia el boton de reintentar:
      // afirmaba sobre un estado que su propio guion no producia.
      if (window.__fallarPrimerAnalisis && window.__analisis.length === 1) {
        window.__intercepciones.push(ruta);
        return new Response(JSON.stringify({
          ok: false, codigo: "SIN_LINEAS",
          error: "No encontre lineas de productos en el archivo.",
        }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const doc = window.__escenario === "continuar" ? D.documentoContinuar : D.documento;
      return responder({ ok: true, documento: doc });
    }
    // Las DOS salidas de "Crear borrador": pedido nuevo y continuación de uno.
    if (url.includes("/api/compras-proveedor/crear")) {
      guardar("crear");
      return responder({ ok: true, item: { id: 999001 } });
    }
    if (url.includes("/api/compras-proveedor/importar/aplicar")) {
      guardar("aplicar");
      // Se devuelve la línea YA RECONCILIADA, que es lo que el servidor arreglado
      // manda: 47 UNIDAD a 120. Si la pantalla la ignora y conserva el costo
      // viejo, se ve acá y no en producción.
      return responder({ ok: true, pedidoId: 999001, detalles: [D.detalleReconciliado] });
    }

    // Cualquier otra cosa de Compras que ESCRIBA: se rechaza y se anota.
    const esCompras = ruta.includes("/api/compras-proveedor") || ruta.includes("/api/compras");
    const escribe = metodo !== "GET" && metodo !== "HEAD";
    if (esCompras && escribe && !LECTURA.includes(ruta)) {
      window.__fugas.push(metodo + " " + ruta);
      return new Response(JSON.stringify({ ok: false, error: "SONDA: endpoint de escritura no reconocido" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
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

  // ── LO QUE ESTÁ SCROLLEADO FUERA DEL CUERPO NO CUENTA ──────────────────
  //
  // El pie del modal está pegado abajo y el cuerpo scrollea POR DEBAJO de él:
  // con suficientes líneas, la última siempre queda tapada por el pie. Eso es
  // cómo funciona un pie pegajoso, no un defecto — se scrollea y aparece.
  //
  // Sin esta acotación el control daba rojo por el largo de la lista y no por
  // un problema de dibujo, que es justo lo contrario de lo que tiene que medir.
  // Se acota al RECTÁNGULO VISIBLE del cuerpo scrolleable, así que un control
  // realmente tapado DENTRO de la zona visible se sigue detectando.
  const cuerpo = capa.querySelector('[class*="overflow-y-auto"]');
  const zona = cuerpo ? cuerpo.getBoundingClientRect() : null;
  const visibleEnElCuerpo = (e) => {
    if (!zona || !cuerpo.contains(e)) return true; // el pie y la cabecera no scrollean
    const r = e.getBoundingClientRect();
    return r.top >= zona.top - 1 && r.bottom <= zona.bottom + 1;
  };

  const ctr = [...capa.querySelectorAll('button, input, select, [role="button"]')]
    .filter((e) => !velos.has(e))
    .filter((e) => e.offsetParent !== null)
    .filter(visibleEnElCuerpo)
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

  // ══ EL REINTENTO, A 390 px ═══════════════════════════════════════════════
  //
  // El primer análisis devuelve SIN_LINEAS con 400 —el caso REAL del 2026-08-25,
  // que se dio tres veces seguidas— y el segundo el documento. Sin esto la sonda
  // nunca veía la pantalla de error y por lo tanto nunca veía el botón: afirmaba
  // sobre un estado que su propio guion no producía.
  console.log("\n── reintentar sin volver a la galería ──────────────────────────");
  await medidas(390, 844);
  await evaluar(`window.__fallarPrimerAnalisis = true; window.__analisis = []; true`);
  await evaluar(`(() => {
    const inp = document.querySelector('[role="dialog"] input[type="file"]');
    if (!inp) return false;
    const f = new File(["pedido inventado que no se lee la primera vez"], "reintento-sintetico.pdf", { type: "application/pdf" });
    const dt = new DataTransfer(); dt.items.add(f);
    Object.defineProperty(inp, "files", { value: dt.files, configurable: true });
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!(await esperarA(`(window.__analisis || []).length >= 1`, 20000))) morir("el primer análisis del reintento no salió");
  await sleep(900);

  const pantallaError = JSON.parse(await evaluar(`JSON.stringify((() => {
    const capa = document.querySelector('[role="dialog"]');
    if (!capa) return { hay: false };
    const t = (capa.innerText || "").replace(/\\s+/g, " ");
    const boton = [...capa.querySelectorAll('button')].find((b) => /Reintentar an/i.test(b.innerText || ""));
    if (!boton) return { hay: true, texto: t.slice(0, 200), boton: false };
    const r = boton.getBoundingClientRect();
    const centro = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      hay: true, texto: t.slice(0, 200), boton: true,
      dentro: r.top >= -1 && r.bottom <= innerHeight + 1,
      alcanzable: !!centro && (centro === boton || boton.contains(centro)),
    };
  })())`));

  afirmar(pantallaError.hay, "reintento · el modal sigue abierto tras el fallo", JSON.stringify(pantallaError));
  afirmar(
    /No encontr. lineas de productos/i.test(pantallaError.texto || ""),
    "reintento · se muestra el mensaje ESPECÍFICO del servidor",
    `texto: ${pantallaError.texto}`
  );
  afirmar(
    /reintento-sintetico\.pdf/.test(pantallaError.texto || ""),
    "reintento · el nombre del archivo elegido sigue a la vista",
    `texto: ${pantallaError.texto}`
  );
  afirmar(pantallaError.boton === true, "reintento · aparece el botón `Reintentar análisis`", JSON.stringify(pantallaError));
  afirmar(
    pantallaError.boton && pantallaError.dentro && pantallaError.alcanzable,
    "reintento · el botón entra en la ventana de 390×844 y se puede tocar",
    JSON.stringify(pantallaError)
  );

  const superpuestosError = JSON.parse(await superpuestos());
  afirmar(superpuestosError.length === 0, "reintento · sin controles superpuestos en la pantalla de error", JSON.stringify(superpuestosError));

  capturas.push(await capturar("reintento-390x844.png"));

  // SE TOCA EL BOTÓN, sin volver a elegir archivo.
  if (pantallaError.boton) {
    await evaluar(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].find((b)=>/Reintentar an/i.test(b.innerText||"")).click()`);
  }
  const llegoARevisar = await esperarA(`(() => {
    const c = document.querySelector('[role="dialog"]');
    return !!c && !c.querySelector('input[type="file"]') && !c.querySelector('.animate-spin');
  })()`, 25000);
  afirmar(llegoARevisar, "reintento · el segundo análisis llega a revisión", "se quedó en la pantalla de error");

  const analisis = JSON.parse(await evaluar(`JSON.stringify(window.__analisis || [])`));
  afirmar(
    analisis.length === 2,
    `reintento · hubo EXACTAMENTE dos llamadas a analizar (${analisis.length})`,
    JSON.stringify(analisis)
  );
  afirmar(
    analisis.length === 2 && analisis[0].nombre === analisis[1].nombre && analisis[0].tam === analisis[1].tam,
    "reintento · las dos llamadas llevaron el MISMO archivo (nombre y tamaño)",
    JSON.stringify(analisis)
  );
  if (analisis.length === 2) {
    console.log(`     archivo enviado dos veces: ${analisis[0].nombre} · ${analisis[0].tam} bytes`);
  }

  const fugasReintento = JSON.parse(await evaluar(`JSON.stringify(window.__fugas || [])`));
  afirmar(fugasReintento.length === 0, "reintento · ninguna escritura real se escapó", JSON.stringify(fugasReintento));

  // Se apaga el guion de fallo y se vuelve al estado de `elegir` para lo que sigue.
  await evaluar(`window.__fallarPrimerAnalisis = false; true`);
  await evaluar(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].find((b)=>/^Cancelar$/.test((b.innerText||"").trim()))?.click()`);
  await sleep(700);
  await evaluar(`[...document.querySelectorAll('button')].find((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||""))?.click()`);
  await esperarA(`!!document.querySelector('[role="dialog"]')`, 15000);

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

  // ── EL CUERPO QUE SE MANDA A CREAR ────────────────────────────────────────
  //
  // Es la afirmación económica de la sonda: no alcanza con que la pantalla se
  // vea bien, tiene que MANDAR los números correctos. Se confirman a mano las
  // líneas que quedaron en revisión —igual que haría una persona— y se toca el
  // botón del pie.
  console.log("\n── el cuerpo que viaja a crear ─────────────────────────────────");
  await medidas(1366, 900);
  const confirmadas = await evaluar(`(() => {
    const capa = document.querySelector('[role="dialog"]');
    const botones = [...capa.querySelectorAll('button')].filter((b) => /^Confirmar$/.test((b.innerText || "").trim()));
    botones.forEach((b) => b.click());
    return botones.length;
  })()`);
  await sleep(600);
  console.log("     líneas confirmadas a mano: " + confirmadas);

  // Las que no tienen producto vinculado no se pueden confirmar: se sacan, que
  // es lo que haría una persona con una línea que el archivo trajo de más.
  await evaluar(`(() => {
    const capa = document.querySelector('[role="dialog"]');
    const quitar = [...capa.querySelectorAll('button')].filter((b) => {
      const fila = b.closest('div');
      return (b.getAttribute('aria-label') || "").includes('Quitar') || (b.innerText || "").trim() === "×";
    });
    return quitar.length;
  })()`);
  await evaluar(`(() => {
    const capa = document.querySelector('[role="dialog"]');
    // Cada tarjeta de línea sin producto elegido tiene su botón de sacar arriba a
    // la derecha; se identifican por el select que sigue diciendo "Elegir producto".
    const sinVincular = [...capa.querySelectorAll('*')].filter((e) => /Elegir producto/.test(e.textContent || "") && e.children.length < 4);
    for (const nodo of sinVincular) {
      const tarjeta = nodo.closest('div[class*="rounded"]') || nodo.parentElement;
      const x = tarjeta && [...tarjeta.querySelectorAll('button')].find((b) => (b.innerText || "").trim() === "" && b.querySelector('svg'));
      if (x) x.click();
    }
    return true;
  })()`);
  await sleep(600);

  const pie2 = JSON.parse(await pie());
  const habilitado = await evaluar(`(() => {
    const capa = document.querySelector('[role="dialog"]');
    const b = [...capa.querySelectorAll('button')].find((x) => /^Crear borrador$/.test((x.innerText || "").trim()));
    return b ? !b.disabled : false;
  })()`);
  afirmar(pie2.hay && habilitado, "el botón `Crear borrador` quedó habilitado", `pie=${JSON.stringify(pie2)} habilitado=${habilitado}`);

  if (habilitado) {
    await evaluar(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].find((x)=>/^Crear borrador$/.test((x.innerText||"").trim())).click()`);
    await sleep(1500);
  }

  const cuerpos = JSON.parse(await evaluar(`JSON.stringify(window.__cuerpos || {})`));
  const fugas = JSON.parse(await evaluar(`JSON.stringify(window.__fugas || [])`));

  afirmar(fugas.length === 0, "ningún endpoint de escritura de Compras se escapó al fetch real", JSON.stringify(fugas));
  afirmar(
    !!(cuerpos.crear || cuerpos.aplicar),
    "se capturó el cuerpo que la pantalla manda al guardar",
    "no se registró ninguna llamada a crear ni a aplicar: el botón no llegó a disparar"
  );

  const enviado = cuerpos.crear || cuerpos.aplicar || null;
  if (enviado) {
    const items = enviado.items || [];
    console.log("     endpoint usado : " + (cuerpos.crear ? "/api/compras-proveedor/crear" : "/api/compras-proveedor/importar/aplicar"));
    console.log("     items enviados : " + items.length);
    for (const it of items) {
      console.log("       productoLocalId " + it.productoLocalId + " · " + it.cantidad + " " + it.unidad + " · costo " + it.precioCosto);
    }
    // EL CASO PACK -> UNIDAD, que es la razón de todo esto.
    const pack = items.find((i) => Number(i.productoLocalId) === 9004);
    afirmar(!!pack, "el PACK x21 viaja en el cuerpo", "no está la línea 9004");
    if (pack) {
      afirmar(pack.unidad === "UNIDAD", "PACK x21: 40 unidades quedan en UNIDAD", `llegó ${pack.unidad}`);
      afirmar(Number(pack.cantidad) === 40, "PACK x21: la cantidad es 40", `llegó ${pack.cantidad}`);
      afirmar(
        Number(pack.precioCosto) === 100,
        "PACK x21: el costo viaja UNITARIO (100), no el del bulto (2.100)",
        `llegó ${pack.precioCosto} — si es 2100, la conversión de escala no está ocurriendo`
      );
      afirmar(
        Number(pack.cantidad) * Number(pack.precioCosto) === 4000,
        "PACK x21: la línea vale 4.000",
        `da ${Number(pack.cantidad) * Number(pack.precioCosto)}`
      );
    }
  }

  console.log("\n── contraprueba del velo, segunda mitad ────────────────────────");
  await evaluar(`[...document.querySelectorAll('button')].find((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||""))?.click()`);
  await esperarA(`!!document.querySelector('[role="dialog"]')`, 15000);
  await evaluar(`(() => {
    const inp = document.querySelector('[role="dialog"] input[type="file"]');
    if (!inp) return false;
    const f = new File(["pedido inventado"], "pedido-sintetico.pdf", { type: "application/pdf" });
    const dt = new DataTransfer(); dt.items.add(f);
    Object.defineProperty(inp, "files", { value: dt.files, configurable: true });
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  await esperarA(`(() => {
    const c = document.querySelector('[role="dialog"]');
    return !!c && !c.querySelector('input[type="file"]') && !c.querySelector('.animate-spin');
  })()`, 25000);
  await medidas(1366, 900);
  const tipoRevisar = await tocarVelo();
  await sleep(700);
  const trasVeloRevisar = await estado();
  afirmar(
    tipoRevisar === "inerte" && trasVeloRevisar === "revisar",
    "en `revisar` el velo es inerte y NO cierra",
    `el velo era '${tipoRevisar}' y el modal quedó en '${trasVeloRevisar}'`
  );

  // ══ ESCENARIO 2: CONTINUAR UN BORRADOR QUE YA TIENE LA LÍNEA ══════════════
  //
  // El primer escenario solo recorre el pedido NUEVO, así que nunca ejerce la
  // reconciliación: el camino donde el servidor corrige la escala y la pantalla
  // tiene que adoptarla. Éste sí.
  console.log("\n── continuar un borrador: el costo negociado y su escala ───────");
  await evaluar(`window.__cuerpos = {}; window.__escenario = "continuar"; true`);
  // `importar=1` es la vía real: el botón de continuar navega a esa URL y la
  // pantalla abre el modal sola al leerla.
  await navegar(`${BASE}/modulos/compras-proveedor/nueva?pedidoId=999001&importar=1`);
  if (!(await esperarA(`window.__sintetico === true`, 20000))) morir("el interceptor no quedó instalado al continuar");
  await evaluar(`window.__escenario = "continuar"; true`);

  const cargo = await esperarA(`[...document.querySelectorAll('*')].some((e)=>/Pack Sintetico x21/.test(e.textContent||""))`, 25000);
  if (!cargo) morir("el borrador sintético no se cargó (¿/obtener no quedó interceptado?)");

  // El estado ANTES: 2 BULTO a 2.520, tal como lo devolvió /obtener.
  const leerLinea = () => evaluar(`JSON.stringify((() => {
    const filas = [...document.querySelectorAll('tr, li, div')].filter(
      (e) => /Pack Sintetico x21/.test(e.textContent || "") && e.querySelectorAll('input').length >= 1
    );
    const fila = filas[filas.length - 1];
    if (!fila) return { hay: false };
    const inputs = [...fila.querySelectorAll('input')].map((i) => i.value);
    return { hay: true, texto: (fila.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 160), inputs };
  })())`);

  const antes = JSON.parse(await leerLinea());
  console.log("     antes  : " + (antes.hay ? antes.inputs.join(" | ") : "(no se pudo leer la fila)"));

  if (!(await esperarA(`!!document.querySelector('[role="dialog"]')`, 20000))) {
    await evaluar(`[...document.querySelectorAll('button')].find((b)=>/desde foto, PDF o Excel|Continuar borrador/i.test(b.innerText||""))?.click()`);
    if (!(await esperarA(`!!document.querySelector('[role="dialog"]')`, 15000))) morir("el modal no abrió al continuar");
  }
  await evaluar(`(() => {
    const inp = document.querySelector('[role="dialog"] input[type="file"]');
    if (!inp) return false;
    const f = new File(["pedido inventado"], "suma-sintetica.pdf", { type: "application/pdf" });
    const dt = new DataTransfer(); dt.items.add(f);
    Object.defineProperty(inp, "files", { value: dt.files, configurable: true });
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
  if (!(await esperarA(`(() => {
    const c = document.querySelector('[role="dialog"]');
    return !!c && !c.querySelector('input[type="file"]') && !c.querySelector('.animate-spin');
  })()`, 25000))) morir("no se llegó a `revisar` al continuar");

  await evaluar(`(() => {
    const capa = document.querySelector('[role="dialog"]');
    [...capa.querySelectorAll('button')].filter((b) => /^Confirmar$/.test((b.innerText || "").trim())).forEach((b) => b.click());
    return true;
  })()`);
  await sleep(600);
  await evaluar(`[...document.querySelector('[role="dialog"]').querySelectorAll('button')].find((x)=>/^Crear borrador$/.test((x.innerText||"").trim()))?.click()`);
  await sleep(1800);

  const cuerposC = JSON.parse(await evaluar(`JSON.stringify(window.__cuerpos || {})`));
  const fugasC = JSON.parse(await evaluar(`JSON.stringify(window.__fugas || [])`));
  afirmar(fugasC.length === 0, "continuar · ningún endpoint de escritura se escapó", JSON.stringify(fugasC));
  afirmar(!!cuerposC.aplicar, "continuar · se llamó a `importar/aplicar` y se capturó el cuerpo", JSON.stringify(Object.keys(cuerposC)));
  if (cuerposC.aplicar) {
    const it = (cuerposC.aplicar.items || [])[0];
    console.log("     enviado: productoLocalId " + it?.productoLocalId + " · " + it?.cantidad + " " + it?.unidad);
  }

  const despues = JSON.parse(await leerLinea());
  console.log("     después: " + (despues.hay ? despues.inputs.join(" | ") : "(no se pudo leer la fila)"));
  console.log("     fila   : " + (despues.texto || "(vacía)"));
  const valores = (despues.inputs || []).map((v) => Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")));
  const texto = despues.texto || "";

  afirmar(
    valores.includes(47) || /\b47\b/.test(texto),
    "continuar · la pantalla adopta la CANTIDAD del servidor (47)",
    `inputs=${JSON.stringify(despues.inputs)} texto=${texto}`
  );
  afirmar(
    valores.includes(120) || /\b120\b/.test(texto),
    "continuar · la pantalla adopta el COSTO del servidor (120)",
    `inputs=${JSON.stringify(despues.inputs)} texto=${texto}`
  );
  // ── EL COSTO VIEJO SE BUSCA EN EL TEXTO CRUDO ──────────────────────────
  //
  // La fila muestra la cantidad en un campo y el costo como TEXTO: "$2520.00/u".
  // Dos versiones de esta afirmación no servían y las dos daban verde con el
  // defecto puesto —que es la única forma de descubrirlo—: mirar solo los inputs,
  // porque el costo no está en ninguno; y "desformatear" quitando los puntos,
  // que convertía 2520.00 en 252000 y hacía fallar el borde de palabra.
  //
  // Se busca el número como token, sobre el texto tal como se lee.
  // OJO CON QUÉ NÚMERO SE BUSCA. La fila muestra el costo POR UNIDAD y su
  // equivalente POR BULTO: con el arreglo puesto dice "$120.00/u · $2520.00/bulto".
  // O sea que 2.520 aparece igual, y correctamente —es 120 × 21—. Una afirmación
  // de "2.520 no está" se pone roja sobre el resultado BUENO: no distingue el
  // costo viejo del equivalente legítimo, porque son el mismo número.
  //
  // Lo que sí distingue es a qué escala está pegado: con el defecto era
  // "$2520.00/u"; arreglado es "$120.00/u". Y el subtotal, que no es ambiguo.
  afirmar(
    /120[.,]00\/u/.test(texto),
    "continuar · el costo POR UNIDAD es 120",
    `la escala del costo unitario no es la corregida — fila: ${texto}`
  );
  afirmar(
    !/2520[.,]00\/u/.test(texto),
    "continuar · el costo por unidad ya no es 2.520 (el del bulto sin convertir)",
    `sigue mostrando el costo del bulto como unitario — fila: ${texto}`
  );
  afirmar(
    /5[.,]640/.test(texto) && !/118[.,]440/.test(texto),
    "continuar · el subtotal es 5.640 y no 118.440",
    `la línea sigue valorizada con el costo viejo — fila: ${texto}`
  );
  afirmar(
    !valores.includes(100),
    "continuar · no se usó el maestro (100) en lugar del negociado (120)",
    `inputs=${JSON.stringify(despues.inputs)}`
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
