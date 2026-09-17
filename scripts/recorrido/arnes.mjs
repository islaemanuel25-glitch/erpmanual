// EL ARNÉS DEL RECORRIDO: el navegador, la pantalla y el libro de hallazgos.
//
// Lo que RECORRE está en `recorrer.mjs`, que es el que se ejecuta. Acá viven las
// herramientas, separadas por un motivo concreto: el recorrido es largo y va a
// crecer, y tener el cliente CDP mezclado con los pasos obliga a leer cuatrocientas
// líneas de protocolo para encontrar en qué pantalla se está.
//
// ── QUÉ ES ESTO Y QUÉ NO ES ────────────────────────────────────────────────
//
// NO es un candado. Un candado afirma una cosa y se pone rojo; esto RECORRE y
// anota lo que encuentra, sin frenar. Un recorrido que aborta en el primer
// defecto informa uno por corrida, y la idea es justamente que Emanuel no tenga
// que descubrirlos de a uno tocando el celular.
//
// Lo que sí comparte con un candado es de dónde saca la verdad.
//
// ── CADA AFIRMACIÓN SE COMPRUEBA CONTRA LA BASE ────────────────────────────
//
// La pantalla es el SUJETO del examen, no la fuente. Si se le pregunta a la
// pantalla si el costo se guardó, un módulo que dibuja bien y no escribe pasa el
// recorrido entero — y ese es exactamente el defecto que más caro sale en este
// repo: algo que no falla donde se rompe.
//
// Así que hay dos lecturas en cada paso: lo que muestra el navegador y lo que
// dice Postgres. Cuando difieren, eso ES el hallazgo.
//
// ── POR QUÉ CDP CRUDO Y NO PLAYWRIGHT ─────────────────────────────────────
//
// Porque Playwright no está instalado en esta imagen, y el Chromium que sí está
// habla el protocolo de depuración por WebSocket sin ninguna dependencia nueva.
// Los otros arneses del repo hacen lo mismo; lo que se comparte con ellos es la
// sesión —`scripts/lib/sesionArnes.mjs`— y no el cliente, porque cada uno
// necesita el suyo abierto a la vez.
//
// ── LA SESIÓN ES REAL ──────────────────────────────────────────────────────
//
// Login de verdad contra `/api/login`, no un JWT firmado a mano. El recorrido
// tiene que pasar por los mismos permisos y el mismo contexto que Emanuel, y un
// token fabricado saltea justamente la parte que puede estar rota.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// LA FÁBRICA PRIMERO, ANTES QUE CUALQUIER COSA QUE ARRASTRE A PRISMA.
// `@prisma/client` carga el `.env` al importarse, y la fábrica distingue "la
// puso el operador" de "la puso el archivo" capturando la variable antes de que
// eso ocurra. Ver la regla 6 del CLAUDE.md.
import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

import { sesionVigente, iniciarSesion, fijarContexto } from "../lib/sesionArnes.mjs";
import { SALIDA as BANCO, PROVEEDOR, PROVEEDOR_PDF, MARCA, CATALOGO, RANGO } from "./bancoDeListas.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3000");
const USUARIO = arg("usuario", "admin@admin.com");
const CLAVE = arg("clave", "123456");
const PUERTO = Number(arg("puerto-cdp", "9444"));
const EDGE = arg("edge", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");
const CAPTURAS = path.resolve(AQUI, "../..", arg("capturas", "capturas-recorrido"));
const INFORME = arg("informe", path.join(BANCO, "hallazgos.json"));

/** Los dos anchos del pedido: el celular de Emanuel y el escritorio. */
const ANCHOS = { movil: 360, escritorio: 1366 };

// ── EL CLIENTE CDP ─────────────────────────────────────────────────────────

let ws;
let sig = 0;
const pendientes = new Map();

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++sig;
    pendientes.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

/**
 * El WebSocket de la PÁGINA, no el del navegador.
 *
 * `/json/version` devuelve el endpoint del navegador, y ahí `Page.enable` no
 * existe: contesta "'Page.enable' wasn't found", que suena a que falta el
 * dominio y en realidad es que se está hablando con el interlocutor equivocado.
 */
async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const lista = await r.json();
      const pagina = lista.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch {}
    await esperar(500);
  }
  throw new Error(`el navegador no expuso ninguna pestaña en el puerto ${PUERTO}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  await esperar(300);
  // Espera a que React haya montado algo: `Page.loadEventFired` llega con el
  // HTML del servidor y el contenido aparece después.
  for (let i = 0; i < 80; i++) {
    const listo = await evaluar(
      "document.readyState === 'complete' && !!document.body && document.body.innerText.trim().length > 0"
    ).catch(() => false);
    if (listo) break;
    await esperar(250);
  }
}

// ── LO QUE SE LEE DE LA PANTALLA ───────────────────────────────────────────

/** Todo, sidebar incluido. Sirve para inventariar, no para afirmar. */
const textoDeLaPantalla = () =>
  evaluar("document.body ? document.body.innerText : '(sin body)'");

/**
 * LO QUE EL USUARIO ESTÁ MIRANDO: el `<main>` y la barra de arriba.
 *
 * ── POR QUÉ NO ES `document.body` ─────────────────────────────────────────
 *
 * Porque el menú lateral está SIEMPRE en el DOM y nombra media aplicación:
 * dice "Listas de proveedores", "Proveedores", "Productos", "Historial". Una
 * comprobación que busque cualquiera de esos textos en `body` da verde sin que
 * la pantalla los muestre — y eso es un candado que acompaña en vez de afirmar.
 *
 * Es exactamente el caso que el CLAUDE.md anota del V26: una afirmación escrita
 * con `hayTexto` sobre toda la página encontró el texto en OTRO componente. Acá
 * el otro componente es el menú, y son cuarenta renglones de él.
 *
 * Se incluye lo que está antes del `<main>` porque ahí vive el título de la
 * pantalla y el botón de volver, que son parte de lo que se recorre.
 */
const textoDelContenido = () =>
  evaluar(`(() => {
    const main = document.querySelector('main');
    if (!main) return document.body ? document.body.innerText : '(sin body)';
    const trozos = [];
    let n = main.previousElementSibling;
    while (n) { if (n.tagName !== 'NAV') trozos.unshift(n.innerText || ''); n = n.previousElementSibling; }
    trozos.push(main.innerText || '');
    return trozos.join('\\n');
  })()`);

/** ¿Lo dice la pantalla? El menú lateral no cuenta — ver `textoDelContenido`. */
const dice = async (fragmento) => (await textoDelContenido()).includes(fragmento);

/** Espera a que un texto aparezca. Devuelve false en vez de lanzar: acá no se aborta. */
async function esperarTexto(fragmento, ms = 20000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    if (await dice(fragmento)) return true;
    await esperar(400);
  }
  return false;
}

/** Los controles visibles, con su nombre accesible. Sirve para inventariar. */
const tocables = () =>
  evaluar(`(() => {
    return [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null)
      .map((n) => ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).trim().replace(/\\s+/g, ' '))
      .filter(Boolean);
  })()`);

/**
 * Toca el primer control visible cuyo texto o `aria-label` contenga el fragmento.
 *
 * `textContent` y NO `innerText`: el segundo depende del layout y devuelve vacío
 * en elementos que el navegador considera no renderizados. Y se CONCATENA el
 * `aria-label` en vez de usarlo con `||`, porque si no un botón etiquetado tapa
 * su propio texto.
 *
 * Solo lo VISIBLE: la composición de escritorio sigue en el DOM a 360 px
 * —`hidden md:block` la apaga con CSS, no la saca—, así que sin el filtro de
 * `offsetParent` el clic se va al control de la vista que nadie está mirando.
 */
async function tocar(fragmento, { ultimo = false, esperaMs = 900 } = {}) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(fragmento)};
    const nodos = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null);
    const coinciden = nodos.filter((n) =>
      ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo)
    );
    const el = ${ultimo ? "coinciden[coinciden.length - 1]" : "coinciden[0]"};
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (ok) await esperar(esperaMs);
  return ok;
}

/**
 * TOCA UNA OPCIÓN DE UN DESPLEGABLE DEL KIT.
 *
 * ── POR QUÉ HACE FALTA UNA FUNCIÓN APARTE ──────────────────────────────────
 *
 * Porque las opciones de `SunmiSelectAdv` NO son botones: son `<div onClick>`
 * sin `role`, sin `tabIndex` y sin `role="option"`. `tocar` busca
 * `button, a, [role="button"]` —que es lo correcto para todo lo demás— y por eso
 * no las encuentra.
 *
 * Eso mismo es un hallazgo del recorrido y está anotado: un desplegable así no
 * se puede usar con el teclado ni lo anuncia un lector de pantalla. Pero el
 * recorrido tiene que poder seguir igual, así que acá se toca por lo que el
 * componente realmente dibuja.
 *
 * Se limita a los contenedores del desplegable para no clickear un `<div>`
 * cualquiera de la pantalla que contenga el mismo texto.
 */
async function tocarOpcion(texto) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(texto)};
    const nodos = [...document.querySelectorAll('[class*="sunmi-select-item"], [role="option"]')]
      .filter((n) => n.offsetParent !== null);
    const el = nodos.find((n) => (n.textContent || '').includes(objetivo));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (ok) await esperar(1000);
  return ok;
}

/** ¿Las opciones abiertas del desplegable son alcanzables con el teclado? */
const opcionesAccesibles = () =>
  evaluar(`(() => {
    const nodos = [...document.querySelectorAll('[class*="sunmi-select-item"]')]
      .filter((n) => n.offsetParent !== null);
    if (!nodos.length) return { hay: 0 };
    return {
      hay: nodos.length,
      conRol: nodos.filter((n) => n.getAttribute('role')).length,
      enfocables: nodos.filter((n) => n.hasAttribute('tabindex') || /^(button|a|input)$/i.test(n.tagName)).length,
      etiquetaDelContenedor: nodos[0].parentElement?.getAttribute('role') || null,
    };
  })()`);

/** Escribe en un campo disparando los eventos que React escucha. */
async function escribir(selectorOEtiqueta, valor) {
  return evaluar(`(() => {
    const q = ${JSON.stringify(selectorOEtiqueta)};
    const campos = [...document.querySelectorAll('input, textarea')].filter((n) => n.offsetParent !== null);
    const el = campos.find((n) =>
      (n.getAttribute('aria-label') || '') === q ||
      (n.getAttribute('placeholder') || '').includes(q) ||
      (n.getAttribute('name') || '') === q ||
      (n.id || '') === q
    );
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    ).set;
    setter.call(el, ${JSON.stringify(String(valor))});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

/**
 * SUBE UN ARCHIVO DE VERDAD.
 *
 * `DOM.setFileInputFiles` es lo que hace que esto sea un recorrido y no una
 * simulación: el archivo lo lee el servidor, con su multipart y su validación de
 * extensión. Inyectar las filas por la API saltearía el lector, que es
 * justamente donde vivieron dos de los cinco defectos del módulo de comprobante.
 */
async function subirArchivo(ruta) {
  const doc = await send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await send("DOM.querySelectorAll", {
    nodeId: doc.root.nodeId,
    selector: 'input[type="file"]',
  });
  if (!nodeIds.length) return false;
  await send("DOM.setFileInputFiles", { files: [ruta], nodeId: nodeIds[nodeIds.length - 1] });
  await esperar(1200);
  return true;
}

// ── EL TEMA Y EL ANCHO ─────────────────────────────────────────────────────

async function fijarAncho(ancho) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: ancho <= 480 ? 780 : 900,
    deviceScaleFactor: 1,
    mobile: ancho <= 480,
  });
}

/** El tema se guarda en localStorage y lo lee el proveedor del kit al montar. */
async function fijarTema(tema) {
  await evaluar(
    `localStorage.setItem("erp-sunmi-theme", ${JSON.stringify(tema === "oscuro" ? "sunmiDark" : "sunmiLight")})`
  );
}

async function foto(nombre) {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const desborde = await evaluar(
    "Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)"
  );
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(CAPTURAS, `${nombre}.png`), Buffer.from(data, "base64"));
  return desborde;
}

// ── EL LIBRO DE HALLAZGOS ──────────────────────────────────────────────────

export const SEVERIDAD = {
  /** Escribe un precio mal, pierde datos, o deja al usuario trabado. */
  ROJO: "ROJO",
  /** Confunde, dice algo falso, o cuesta toques de más. */
  AMARILLO: "AMARILLO",
  /** Cosmético. */
  VERDE: "VERDE",
};

const hallazgos = [];
let pasos = 0;
let comprobaciones = 0;

/**
 * Anota un defecto. NO frena el recorrido.
 *
 * Los cinco campos son los que pidió Emanuel y ninguno es opcional: un hallazgo
 * sin "qué esperaba" es una opinión, y sin "qué pasó" no se puede reproducir.
 */
async function defecto({ pantalla, hice, esperaba, paso, severidad }) {
  // ── QUÉ HABÍA EN PANTALLA ─────────────────────────────────────────────
  //
  // Se guarda SIEMPRE, no solo cuando conviene. Un hallazgo sin el texto de la
  // pantalla obliga a volver a correr todo el recorrido para saber qué se
  // estaba mirando, y el recorrido tarda minutos. El recorte alcanza: lo que se
  // busca es reconocer la pantalla, no reconstruirla.
  let enPantalla = "(no se pudo leer)";
  try {
    enPantalla = (await textoDelContenido()).replace(/\s+/g, " ").slice(0, 600);
  } catch {}

  // ── EL MISMO DEFECTO NO SE CUENTA CINCO VECES ─────────────────────────
  //
  // El recorrido sube la lista cuatro veces —actualizar, otra vez, controlar y
  // el rango cero— y los defectos de la pantalla de lectura aparecen en las
  // cuatro. Son UN defecto visto cuatro veces, no cuatro: informarlos por
  // separado infla la cuenta y esconde lo que de verdad hay.
  //
  // Se guarda `vecesVisto`, que además es información: un defecto que aparece
  // en los cuatro caminos no es un caso de borde.
  const ya = hallazgos.find(
    (h) => h.pantalla === pantalla && h.esperaba === esperaba && h.paso === paso
  );
  if (ya) {
    ya.vecesVisto += 1;
    return;
  }

  hallazgos.push({
    numero: hallazgos.length + 1,
    pantalla,
    hice,
    esperaba,
    paso,
    severidad,
    enPantalla,
    vecesVisto: 1,
  });
  const color = { ROJO: "🔴", AMARILLO: "🟡", VERDE: "🟢" }[severidad];
  console.log(`  ${color} #${hallazgos.length} ${pantalla} — ${esperaba} / PERO ${paso}`);
}

/**
 * Comprueba y anota si falla. Devuelve si pasó, para poder encadenar.
 *
 * El nombre es `comprobar` y no `afirmar` a propósito: acá no se asevera nada,
 * se mira y se anota.
 */
async function comprobar(condicion, { pantalla, hice, esperaba, paso, severidad }) {
  comprobaciones++;
  if (condicion) return true;
  await defecto({ pantalla, hice, esperaba, paso, severidad });
  return false;
}

const anotarPaso = (texto) => {
  pasos++;
  console.log(`\n── ${texto}`);
};

// ── ARRANQUE DEL NAVEGADOR ─────────────────────────────────────────────────

async function abrirNavegador() {
  const perfil = fs.mkdtempSync("/tmp/recorrido-");
  const navegador = spawn(
    EDGE,
    [
      "--headless=new",
      `--remote-debugging-port=${PUERTO}`,
      `--user-data-dir=${perfil}`,
      // Esta imagen corre como root y Chromium se niega sin esto. No es una
      // concesión de seguridad del producto: es el contenedor de la corrida.
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
    ],
    { stdio: "ignore" }
  );
  process.on("exit", () => {
    try {
      navegador.kill();
    } catch {}
  });

  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { res, rej } = pendientes.get(m.id);
      pendientes.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("DOM.enable");
  return navegador;
}

/** El resumen de la corrida, para el cierre y para el archivo. */
export const resumen = () => ({
  pasos,
  comprobaciones,
  hallazgos,
  rojos: hallazgos.filter((h) => h.severidad === SEVERIDAD.ROJO).length,
  amarillos: hallazgos.filter((h) => h.severidad === SEVERIDAD.AMARILLO).length,
  verdes: hallazgos.filter((h) => h.severidad === SEVERIDAD.VERDE).length,
});

/** Cierra el WebSocket. El navegador se mata solo con el `process.on('exit')`. */
export function cerrar() {
  try {
    ws.close();
  } catch {}
}

/**
 * LA SESIÓN, Y LA COMPROBACIÓN DE QUE QUEDÓ.
 *
 * Una página de error es perfectamente determinista y se recorre igual de bien
 * que la buena: sin comprobar que entramos, el recorrido informaría hallazgos
 * sobre la pantalla de login. Es el mismo caso que el CLAUDE.md anota dos veces.
 */
export async function entrar() {
  if (!(await sesionVigente({ navegar, evaluar, base: BASE }))) {
    await iniciarSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: console.log });
  }
  await fijarContexto({ navegar, evaluar, base: BASE, log: console.log });

  await navegar(`${BASE}/modulos/proveedores/listas`);
  const entro = await evaluar(
    `fetch("/api/contexto-activo/get", { credentials: "same-origin" }).then((r) => r.status + "")`
  );
  if (entro !== "200") throw new Error(`la sesión no quedó: /api/contexto-activo/get dio ${entro}`);
  if (await dice("Iniciar sesión")) throw new Error("quedamos en la pantalla de login");
  console.log("  sesión real verificada");
}

export {
  send,
  evaluar,
  navegar,
  esperar,
  esperarTexto,
  dice,
  textoDeLaPantalla,
  textoDelContenido,
  tocables,
  tocar,
  tocarOpcion,
  opcionesAccesibles,
  escribir,
  subirArchivo,
  fijarAncho,
  fijarTema,
  foto,
  abrirNavegador,
  defecto,
  comprobar,
  anotarPaso,
  hallazgos,
  BASE,
  BANCO,
  CAPTURAS,
  INFORME,
  ANCHOS,
  PROVEEDOR,
  PROVEEDOR_PDF,
  MARCA,
  CATALOGO,
  RANGO,
  crearClientePrisma,
  LECTURA,
};
