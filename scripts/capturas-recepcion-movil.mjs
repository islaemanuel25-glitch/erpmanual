// CAPTURAS REALES DE LA RECEPCIÓN MÓVIL V2, EN UN NAVEGADOR DE VERDAD.
//
//   node scripts/capturas-recepcion-movil.mjs --base http://app:3000 \
//        --chrome /tmp/chrome-sonda --salida /w/capturas --transferencia 180
//
// ── POR QUÉ ESTE ARCHIVO EXISTE Y NO SE REUSA UNA SONDA ──────────────────
//
// `sonda-cascada.mjs` mide UNA cosa y devuelve verde o rojo. Acá hace falta
// otra: abrir la pantalla con datos reales, tocarla como la tocaría un operador
// y sacar la foto de cinco momentos, en dos anchos. Es un arnés de capturas, no
// una sonda, y mezclarlos habría dejado a la sonda con un modo que no usa nadie.
//
// ── LA SESIÓN NO SE FALSIFICA, SE FIRMA ──────────────────────────────────
//
// No hay un login automatizable sin la contraseña de alguien, y pedirla o
// adivinarla no corresponde. Lo que se hace es lo mismo que hace la suite de
// base: firmar un JWT con el `AUTH_SECRET` de ESTA instancia descartable y
// ponerlo como cookie. El usuario, el local y los permisos salen de la copia
// restaurada, no se inventan.
//
// ── Y LAS FOTOS TIENEN QUE PROBAR LO QUE DICEN ───────────────────────────
//
// Una página de error es perfectamente determinista y se fotografía igual de
// bien que la pantalla buena. Por eso cada captura verifica ANTES que en la
// página esté lo que se espera —el nombre de la transferencia, la hoja abierta—
// y aborta diciendo qué encontró si no está. Sin eso el arnés informa "capturas
// listas" sobre cinco fotos de un cartel de error.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3000");
const CHROME = arg("chrome", "/tmp/chrome-sonda");
const SALIDA = arg("salida", "/w/capturas");
const TRANSFERENCIA = Number(arg("transferencia", "180"));
const PUERTO = Number(arg("puerto-cdp", "9333"));
const SECRETO = process.env.AUTH_SECRET;
const USUARIO = Number(arg("usuario", "4"));
const LOCAL = Number(arg("local", "4"));

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}

const PERMISOS = [
  "transferencias.ver", "transferencias.recibir", "transferencias.crear",
  "transferencias.cancelar", "productos.ver", "stock.ver",
];

// Se pueden pedir de a uno: una corrida larga que se cuelga en el segundo
// ancho deja sin foto al primero también si van juntos.
const ANCHOS = (arg("anchos", "390,412")).split(",").map(Number);

fs.mkdirSync(SALIDA, { recursive: true });

// ── CDP mínimo, sin dependencias nuevas ──────────────────────────────────
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
 * El de la pestaña sale de `/json/list`, entre los targets de tipo `page`.
 */
async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
      const lista = await r.json();
      const pagina = lista.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (pagina) return pagina.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`el navegador no expuso ninguna pestaña en el puerto ${PUERTO}`);
}

const evaluar = async (expresion) => {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera a que un texto APAREZCA. Si no aparece, dice qué había. */
async function esperarTexto(fragmento, ms = 25000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const hay = await evaluar(
      `document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`
    );
    if (hay) return true;
    await esperar(400);
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 400) : '(sin body)'");
  throw new Error(`nunca apareció «${fragmento}». En pantalla había:\n${visto}`);
}

async function medirAncho(ancho) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho,
    height: 900,
    deviceScaleFactor: 2,
    mobile: true,
  });
}

async function foto(nombre, ancho) {
  // Antes de disparar: que no haya scroll horizontal. Es uno de los puntos que
  // hay que revisar, y comprobarlo acá es más confiable que mirarlo en la foto.
  const desborde = await evaluar(
    "Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)"
  );
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const archivo = path.join(SALIDA, `${nombre}-${ancho}.png`);
  fs.writeFileSync(archivo, Buffer.from(data, "base64"));
  console.log(`  ✓ ${path.basename(archivo)}  ${desborde === 0 ? "sin scroll horizontal" : `⚠ DESBORDA ${desborde}px`}`);
  return desborde;
}

/** Toca el primer elemento cuyo texto contenga el fragmento. */
/**
 * @param {object} opciones
 * @param {boolean} [opciones.ultimo] Tocar la ÚLTIMA coincidencia y no la
 *   primera. Hace falta cuando un modal repite el texto de un botón que quedó
 *   atrás: "Informar producto no declarado" es a la vez el CTA del listado y el
 *   botón que confirma adentro de la hoja. El velo no los distingue —los dos
 *   siguen renderizados— así que sin esto el clic se va al de atrás, el modal no
 *   se cierra y la línea no se crea. Costó una corrida entenderlo.
 */
async function tocar(fragmento, { etiqueta = null, ultimo = false } = {}) {
  // `textContent` y NO `innerText`: el segundo depende del layout y devuelve
  // vacío en elementos que el navegador considera no renderizados, que es lo que
  // pasa justo después de una captura con `captureBeyondViewport`. Y se
  // CONCATENA el `aria-label` en vez de usarlo con `||`, porque si no un botón
  // etiquetado —el de "⋯"— tapa su propio texto.
  // ── Y SOLO LO VISIBLE ──────────────────────────────────────────────────
  //
  // La composición de ESCRITORIO sigue en el DOM a 390 px: `hidden md:block` la
  // apaga con CSS, no la saca. Así que `querySelectorAll` devolvía los botones
  // de las dos, y el clic se iba al primero —el de escritorio, invisible—. El
  // síntoma era desconcertante: "Hay unidades sueltas" no abría el campo,
  // porque abría el de la ficha que nadie está viendo.
  //
  // `offsetParent === null` es exactamente "no está renderizado" para un
  // elemento con `display:none` en algún ancestro.
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
  if (!ok) {
    // Si no está, se dice QUÉ hay. Un "no se encontró" a secas manda a adivinar.
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => e.offsetParent !== null);
      return n.length + " tocables · " + n
        .filter((e) => (e.textContent || "").trim())
        .slice(0, 14)
        .map((e) => JSON.stringify(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().slice(0, 45)))
        .join(", ");
    })()`);
    throw new Error(`no se encontró nada tocable con «${etiqueta || fragmento}».\n  ${inventario}`);
  }
  await esperar(900);
}

/**
 * Toca una OPCIÓN de `SunmiSelectAdv`, que no es un botón.
 *
 * Sus opciones son `div` con `onClick` y sin `role`, así que `tocar` —que
 * consulta `button, a, [role="button"]`— no las ve nunca. El síntoma es
 * "no se encontró nada tocable con «Faltante»", que suena a que el motivo no
 * está en la lista y en realidad es que se está mirando otra clase de elemento.
 *
 * Y hay que abrir la lista primero: cerrada, ninguna opción existe en el DOM.
 */
async function tocarOpcion(texto, { etiqueta } = {}) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(texto)};
    const nodos = [...document.querySelectorAll('div[class*="cursor-pointer"]')]
      .filter((n) => n.offsetParent !== null);
    const el = nodos.find((n) => (n.textContent || "").trim() === objetivo)
      || nodos.find((n) => (n.textContent || "").includes(objetivo));
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) {
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('div[class*="cursor-pointer"]')].filter((e) => e.offsetParent !== null);
      return n.length + " opciones · " + n.map((e) => JSON.stringify((e.textContent || "").trim().slice(0, 30))).join(", ");
    })()`);
    throw new Error(`no se encontró la opción «${etiqueta || texto}».\n  ${inventario}`);
  }
  await esperar(700);
}

/**
 * Escribe en el enésimo `input[type=number]` como lo haría una persona.
 *
 * Enfoca, selecciona lo que hay y lo reemplaza con `Input.insertText`, que entra
 * por el mismo camino que una tecla. Asignar `value` a mano deja el campo con el
 * número y a React sin enterarse.
 */
async function escribirEnCampo(indice, texto) {
  const enfocado = await evaluar(`(() => {
    const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
    const el = campos[${indice}];
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.select();
    return true;
  })()`);
  if (!enfocado) throw new Error(`no existe el campo numérico ${indice}`);
  await send("Input.insertText", { text: texto });
  await esperar(300);
}

/**
 * Escribe en el campo de búsqueda visible, como lo haría una persona.
 *
 * Hay dos: el del listado y el del modal de producto no declarado. Cuando el
 * modal está abierto, el suyo es el último visible del documento.
 */
async function escribirEnBuscador(texto, { enModal = false } = {}) {
  const enfocado = await evaluar(`(() => {
    const campos = [...document.querySelectorAll('input[type="text"], input:not([type])')]
      .filter((e) => e.offsetParent !== null);
    const el = ${enModal ? "campos[campos.length - 1]" : "campos[0]"};
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    el.select();
    return true;
  })()`);
  if (!enfocado) throw new Error("no se encontró un campo de búsqueda visible");
  await send("Input.insertText", { text: texto });
  await esperar(500);
}

/** Enter de verdad. El aviso de "no figura" sale al RESOLVER, no al tipear. */
async function apretarEnter() {
  for (const type of ["keyDown", "char", "keyUp"]) {
    await send("Input.dispatchKeyEvent", {
      type,
      key: "Enter",
      code: "Enter",
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
      text: type === "char" ? "\r" : undefined,
    });
  }
  await esperar(900);
}

// ── ARRANQUE ─────────────────────────────────────────────────────────────
const perfil = fs.mkdtempSync("/tmp/cap-");
const navegador = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${perfil}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--hide-scrollbars",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { navegador.kill(); } catch {} });

const { default: WS } = { default: WebSocket };
ws = new WS(await urlDepurador());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
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

// La sesión, firmada con el secreto de esta instancia.
const token = jwt.sign(
  { id: USUARIO, nombre: "Capturas", email: "capturas@local", localId: LOCAL, permisos: PERMISOS },
  SECRETO,
  { expiresIn: "1h" }
);
const url = new URL(BASE);
await send("Network.setCookie", {
  name: "erpazul_sesion",
  value: token,
  domain: url.hostname,
  path: "/",
  httpOnly: true,
});

// ── Y EL OPERADOR DEL LOCAL, QUE ES OTRA PUERTA ─────────────────────────
//
// El ERP pide un operador activo antes de dejar trabajar en un local: sin él
// aparece la pantalla de "Ingresar", que se fotografía igual de bien que la
// pantalla buena. Es una cookie firmada aparte, con `_tipo: "operador"` —ver
// `lib/operador.js`—, así que se firma igual que la sesión y con los mismos
// datos de la copia restaurada. No se inventa un operador que no exista: se
// declara al mismo usuario que ya está operando.
const tokenOperador = jwt.sign(
  { operadorId: USUARIO, nombre: "Capturas", localId: LOCAL, _tipo: "operador" },
  SECRETO,
  { expiresIn: "1h" }
);
await send("Network.setCookie", {
  name: "erpazul_operador_activo",
  value: tokenOperador,
  domain: url.hostname,
  path: "/",
  httpOnly: true,
});

const RUTA = `${BASE}/modulos/transferencias/${TRANSFERENCIA}`;
const MODO = arg("modo", "principal");
/** Qué producto buscar en el catálogo del origen. Lo usa `nodeclarado-pack`. */
const BUSQUEDA = arg("buscar", "COCA COLA ZERO");
let desbordes = 0;

/**
 * Abre la pantalla desde cero.
 *
 * Pasa por `about:blank` primero: navegar dos veces a la MISMA url dejaba el
 * cuerpo vacío en la segunda vuelta —la del otro ancho— y el arnés esperaba 25
 * segundos a un texto que no iba a llegar. Con la pizarra en blanco en el medio,
 * cada vuelta es una carga limpia.
 */
async function abrir() {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(400);
  await send("Page.navigate", { url: RUTA });
  await esperarTexto(`Transferencia #${TRANSFERENCIA}`, 40000);
  await esperarTexto("revisados");
}

for (const ancho of ANCHOS) {
  console.log(`\n── ${ancho} px · modo ${MODO} ─────────────────────────────`);
  await medirAncho(ancho);
  await abrir();

  if (MODO === "principal") {
    // A · la recepción con productos pendientes
    desbordes += await foto("A-recepcion-pendientes", ancho);

    // B · un producto normal, abierto en la hoja inferior.
    //
    // "Pendiente de revisar" y no "Pendiente": lo segundo también lo dice el
    // BOTÓN del filtro "Pendientes 45", así que el clic se iba al filtro y la
    // hoja no se abría nunca. El texto largo solo lo tienen las filas.
    await tocar("Pendiente de revisar", { etiqueta: "una fila del listado" });
    await esperarTexto("Enviado");
    await esperarTexto("Ingreso físico");
    desbordes += await foto("B-producto-abierto", ancho);
    await tocar("Cerrar");

  }

  if (MODO === "acciones") {
    // E · la hoja de "Más acciones". En su propio modo: cada hoja abre un modal
    // por portal, y encadenar tres en la misma sesión del navegador colgaba la
    // corrida sin error. Separadas, cada una es una carga limpia.
    await tocar("Más acciones", { etiqueta: "el botón ⋯" });
    await esperarTexto("PDF de envío");
    desbordes += await foto("E-mas-acciones", ancho);
  }

  if (MODO === "pack") {
    // C · un PACK con unidades sueltas y diferencia. El caso NO se fabrica: se
    // usa la única transferencia abierta del respaldo que salió en BULTO.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en PACK" });
    await esperarTexto("PACK x");

    // ── LA PRIMERA VERSIÓN DE ESTO SACÓ UNA FOTO QUE NO PROBABA NADA ──────
    //
    // Tocaba el desglose, escribía los números y esperaba el texto
    // "Diferencia" — que aparece IGUAL cuando la diferencia es cero. La captura
    // salió con 2 packs, sin sueltas y "Diferencia 0", o sea el caso contrario
    // al que decía retratar, y el arnés informó éxito.
    //
    // Ahora cada paso se comprueba por su EFECTO: que el campo de sueltas
    // aparezca, que los dos números queden escritos, y que la diferencia sea
    // distinta de cero.
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del pack" });
    const hayCampoSueltas = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hayCampoSueltas) throw new Error("el desglose de sueltas no se abrió: la foto no probaría el caso");

    // Un pack entero menos y cinco sueltas: 1 × 24 + 5 = 29 contra 48.
    //
    // ── SE ESCRIBE CON EL TECLADO, NO ASIGNANDO `value` ────────────────────
    //
    // La primera versión usaba el truco del setter nativo más un `input`
    // sintético. El campo QUEDABA con el número —lo comprobé leyendo `value`—
    // pero el estado de React no se movía: la línea de abajo seguía diciendo
    // "48 unidades · Diferencia 0". O sea que la foto habría mostrado el número
    // escrito y el cálculo del caso anterior, que es peor que no sacarla.
    //
    // `Input.insertText` del protocolo del navegador entra por el mismo camino
    // que una tecla, así que React se entera igual que con una persona
    // tipeando. Es más lento y es lo único que prueba algo.
    await escribirEnCampo(0, "1");
    await escribirEnCampo(1, "5");
    await esperar(800);

    const leido = await evaluar(`(() => {
      const c = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).map((e) => e.value);
      const t = document.body.innerText;
      // Sin expresión regular y sin secuencias de escape, a propósito: este
      // código viaja adentro de una plantilla de JS que a su vez se escribió por
      // shell, así que cada barra invertida pasa por dos intérpretes. La primera
      // versión perdió una y quedó una regex inválida. \`fromCharCode(10)\` es el
      // salto de línea sin escapar nada.
      const m = t.split(String.fromCharCode(10)).find((l) => l.indexOf("Ingreso f") === 0);
      return JSON.stringify({ campos: c, linea: m || null });
    })()`);
    const { campos, linea } = JSON.parse(leido);
    if (campos[0] !== "1" || campos[1] !== "5") {
      throw new Error(`los números no quedaron escritos: ${JSON.stringify(campos)}`);
    }
    if (!linea || /Diferencia 0 /.test(linea)) {
      throw new Error(`la diferencia no es la del caso; la pantalla dice: ${linea}`);
    }
    console.log(`  · ${linea}`);
    desbordes += await foto("C-pack-con-sueltas", ancho);
    await tocar("Cerrar");
  }

  // ── LAS CUATRO ESCENAS DE LA TANDA DEL FORMATO DE ORIGEN ────────────────
  //
  // Se agregan como modos del MISMO arnés en vez de escribir otro script: la
  // sesión firmada, la espera por texto, el clic sobre lo visible y la medición
  // del scroll horizontal ya están resueltos acá.

  if (MODO === "formato-lista") {
    // A · la lista con las cinco presentaciones y los tres estados a la vez.
    //
    // Hay que pasar a "Todos": el filtro por defecto es Pendientes y los
    // revisados no estarían en pantalla, que es justamente lo que esta captura
    // tiene que mostrar junto a los pendientes.
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(700);
    await esperarTexto("CAJÓN x8");
    await esperarTexto("KG");
    await esperarTexto("PIEZA");
    await esperarTexto("Revisado");
    desbordes += await foto("A-lista-formato-origen", ancho);
  }

  if (MODO === "formato-cajon") {
    // B · el CAJÓN x8 abierto, con bultos completos y unidades sueltas.
    await tocar("COCA COLA 2L", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del cajón" });
    const hay = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hay) throw new Error("el desglose no se abrió: la foto no probaría el caso");
    await escribirEnCampo(0, "5");
    await escribirEnCampo(1, "7");
    await esperar(800);
    const linea = await evaluar(`(() => {
      const t = document.body.innerText.split(String.fromCharCode(10));
      return JSON.stringify(t.find((l) => l.indexOf("Ingreso f") === 0) || null);
    })()`);
    const texto = JSON.parse(linea);
    // 5 cajones de 8 más 7 sueltas son 47 contra 48: falta 1.
    if (!texto || !texto.includes("47")) {
      throw new Error(`la pantalla no muestra el caso; dice: ${texto}`);
    }
    console.log(`  · ${texto}`);
    desbordes += await foto("B-cajon-completos-y-sueltas", ancho);
  }

  if (MODO === "formato-kg") {
    // C · un producto por KG abierto. La diferencia se dice en KG, no en
    // "unidades", que es el defecto que esta tanda saca.
    // El producto por KG de esta transferencia ya está revisado, así que no
    // aparece en el filtro por defecto. Se pasa a "Todos" primero.
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(700);
    await tocar("Queso Cremoso", { etiqueta: "la línea por KG" });
    await esperarTexto("KG");
    const dice = await evaluar("document.body.innerText");
    if (/Ingreso f[ií]sico:[^\n]*unidades/.test(dice)) {
      throw new Error("un producto por KG sigue diciendo «unidades»");
    }
    desbordes += await foto("C-producto-kg", ancho);
  }

  if (MODO === "formato-nodeclarado") {
    // D · el producto no declarado: el catálogo del ORIGEN, con la presentación
    // que ese catálogo declara.
    //
    // La versión larga de esta escena —escribir en el modal, esperar al
    // servidor y elegir un resultado— colgaba el arnés de forma reproducible al
    // encadenar dos modales en la misma sesión del navegador. Queda la parte que
    // sí se puede fotografiar de forma confiable: el camino de excepción abierto
    // sobre el catálogo del origen.
    await escribirEnBuscador("zzz-no-existe");
    await apretarEnter();
    await esperarTexto("no figura");
    await tocar("Informar producto no declarado", { etiqueta: "el catálogo del origen" });
    await esperar(1500);
    const abierto = await evaluar(
      `[...document.querySelectorAll('input[type="text"], input:not([type])')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!abierto) throw new Error("el modal del catálogo del origen no abrió");
    desbordes += await foto("D-no-declarado-catalogo-origen", ancho);
  }

  // ── LAS TRES ESCENAS DE LA TANDA CORRECTIVA ────────────────────────────
  //
  // Las tres retratan el MISMO defecto por sus tres caras: la escala en la que
  // se recibe una línea con snapshot. La transferencia de estas escenas se
  // arma con `scripts/fixture-captura-cajon.mjs`, que llama a las funciones de
  // producción —el mapper de venta interna y `crearTransferencia`— sobre la
  // copia descartable. El respaldo no sirve: la migración es aditiva y no
  // rellena históricos, así que ahí ninguna línea tiene snapshot todavía.

  if (MODO === "cajon-inicial") {
    // E · el CAJÓN x8 recién abierto. Lo que se fotografía es el VALOR
    // PROPUESTO: la línea está persistida como 48 con `unidadEnviada = UNIDAD`,
    // y el campo tiene que arrancar en 6, que es la escala en la que el remito
    // habla. Antes arrancaba en 48, así que el caso feliz de un toque guardaba
    // 48 cajones: 384 unidades.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");

    const estado = await evaluar(`(() => {
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      const t = document.body.innerText;
      const linea = t.split(String.fromCharCode(10)).find((l) => l.indexOf("Enviado") === 0);
      return JSON.stringify({ campos: campos.map((e) => e.value), enviado: linea || null });
    })()`);
    const { campos, enviado } = JSON.parse(estado);
    if (campos[0] !== "6") {
      throw new Error(
        `el campo propone ${JSON.stringify(campos[0])} y tiene que proponer "6": la foto no probaría el caso`
      );
    }
    if (!enviado || !enviado.includes("6 CAJÓN x8")) {
      throw new Error(`el rótulo del envío no dice 6 CAJÓN x8; dice: ${enviado}`);
    }
    console.log(`  · ${enviado} · campo inicial = ${campos[0]}`);
    desbordes += await foto("E-cajon-inicial", ancho);
  }

  if (MODO === "cajon-guardado") {
    // F · el mismo CAJÓN, DESPUÉS de ejercer el servidor.
    //
    // No alcanza con escribir los números y fotografiar: eso retrata el estado
    // local de React y no prueba que el servidor los haya aceptado. Antes de
    // esta corrección, 5 + 7 sobre una línea con `unidadEnviada = UNIDAD` se
    // rechazaba con SUELTAS_SIN_BULTO, y la recarga informaba cero recibido.
    //
    // Así que la escena escribe, MARCA REVISADO —que persiste—, RECARGA la
    // página desde cero, y recién ahí saca la foto. Lo que se ve viene de la
    // base, no del navegador.
    await tocar("Pendiente de revisar", { etiqueta: "la línea en CAJÓN" });
    await esperarTexto("CAJÓN x8");
    await tocar("Hay unidades sueltas", { etiqueta: "el desglose del cajón" });
    const hay = await evaluar(
      `[...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!hay) throw new Error("el desglose no se abrió: la foto no probaría el caso");

    await escribirEnCampo(0, "5");
    await escribirEnCampo(1, "7");
    await esperar(800);

    // Falta 1, así que el botón pide un motivo antes de dejar marcar.
    //
    // Son DOS toques y no uno: `SunmiSelectAdv` dibuja su lista solo cuando
    // está abierto, así que "Faltante" no existe en el DOM hasta que alguien
    // toca el control. Buscarlo de entrada da "no se encontró nada tocable",
    // que suena a que el motivo no está y en realidad es que la lista está
    // cerrada — el mismo malentendido que ya costó dos candados en este repo.
    await tocar("Seleccionar", { etiqueta: "el selector de motivo" });
    await esperar(600);
    await tocarOpcion("Faltante", { etiqueta: "el motivo de la diferencia" });
    await tocar("y seguir", { etiqueta: "el botón de marcar revisado" });
    await esperar(2500);

    // ── LA RECARGA, QUE ES LO QUE HACE QUE ESTA FOTO PRUEBE ALGO ─────────
    await abrir();
    await tocar("Todos", { etiqueta: "el filtro Todos" });
    await esperar(900);

    const persistido = await evaluar(`(() => {
      const t = document.body.innerText;
      return JSON.stringify({
        revisado: t.includes("Revisado"),
        faltante: t.includes("Faltante"),
        texto: t.split(String.fromCharCode(10)).filter((l) => l.indexOf("Recibido") === 0 || l.indexOf("Enviado") === 0),
      });
    })()`);
    const leido = JSON.parse(persistido);
    if (!leido.revisado) throw new Error("la línea no quedó revisada en la base");
    if (!leido.faltante) throw new Error("la línea no quedó como Faltante: el 5+7 no llegó al servidor");
    console.log(`  · tras recargar: ${JSON.stringify(leido.texto)}`);

    // Y se abre la ficha, que es donde se ven los dos números y el 47 de 48.
    await tocar("Faltante", { etiqueta: "la línea ya revisada" });
    await esperarTexto("CAJÓN x8");
    const detalle = await evaluar(`(() => {
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      const t = document.body.innerText.split(String.fromCharCode(10));
      return JSON.stringify({
        campos: campos.map((e) => e.value),
        fisico: t.find((l) => l.indexOf("Ingreso f") === 0) || null,
      });
    })()`);
    const { campos, fisico } = JSON.parse(detalle);
    if (campos[0] !== "5" || campos[1] !== "7") {
      throw new Error(`la recarga no conservó 5 + 7; los campos dicen ${JSON.stringify(campos)}`);
    }
    if (!fisico || !fisico.includes("47")) {
      throw new Error(`la pantalla no dice 47 físicas; dice: ${fisico}`);
    }
    console.log(`  · ${fisico}`);
    desbordes += await foto("F-cajon-guardado", ancho);
  }

  // ── LAS TRES ESCENAS DE LA TANDA DE UX ─────────────────────────────────
  //
  // Las tres se sacan sobre la transferencia #176 de la copia del respaldo, que
  // es una HISTÓRICA abierta de verdad: 52 líneas, ninguna con snapshot de
  // despacho, y varios productos que hoy el depósito trabaja agrupados. No hay
  // fixture que fabricar — el caso existe.

  if (MODO === "ux-no-figura") {
    // A · se escribe algo que no está en la transferencia y el camino de salida
    // aparece SOLO, sin Enter. Antes había que adivinar que existía esa tecla.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);

    const estado = await evaluar(`(() => {
      const t = document.body.innerText;
      const botones = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        noFigura: t.includes("no figura en esta transferencia"),
        cta: botones.some((b) => (b.textContent || "").includes("Informar producto no declarado")),
        filtro: t.includes("coincidan con este filtro"),
      });
    })()`);
    const e = JSON.parse(estado);
    // Se comprueba ANTES de disparar: una pantalla que dice lo contrario se
    // fotografía igual de bien que la buena.
    if (!e.noFigura) throw new Error("no apareció el aviso de que el producto no figura");
    if (!e.cta) throw new Error("el CTA no apareció sin Enter, que es todo el punto de esta captura");
    console.log(`  · sin Enter: aviso ${e.noFigura} · CTA ${e.cta}`);
    desbordes += await foto("A-no-figura-cta", ancho);
  }

  if (MODO === "ux-no-declarado") {
    // B · informar el producto y verlo QUEDAR en el listado. Antes se agregaba y
    // desaparecía: no estaba en ningún filtro, ni siquiera en "Todos".
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);
    await tocar("Informar producto no declarado", { etiqueta: "el camino de salida" });
    await esperar(1800);

    await escribirEnBuscador(BUSQUEDA, { enModal: true });
    await esperar(2500);
    await tocar(BUSQUEDA, { etiqueta: "un resultado del catálogo del origen" });
    await esperar(1200);

    // 2 completos y 1 suelta: el caso que prueba que el desglose sobrevive.
    await escribirEnCampo(0, "2");
    await escribirEnCampo(1, "1");
    await esperar(600);
    await tocar("Informar producto no declarado", {
      etiqueta: "el botón de confirmar",
      ultimo: true,
    });
    await esperar(3000);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const filas = [...document.querySelectorAll('[data-detalle-id]')].filter((e) => e.offsetParent !== null);
      const card = filas.find((f) => (f.textContent || "").includes("9 DE ORO"));
      return JSON.stringify({
        visibleEnLista: !!card,
        texto: card ? (card.textContent || "").trim().slice(0, 120) : null,
        cuantasFilas: filas.length,
      });
    })()`);
    const b = JSON.parse(escena);
    if (!b.visibleEnLista) {
      throw new Error("el producto agregado NO quedó visible en el listado: es el defecto que la tanda cierra");
    }
    console.log(`  · en el listado (${b.cuantasFilas} filas): ${b.texto}`);
    desbordes += await foto("B-no-declarado-integrado", ancho);
  }

  if (MODO === "ux-historica") {
    // C · la histórica abierta: los dos hechos, separados, y la acción explícita.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(900);
    await tocar(BUSQUEDA, { etiqueta: "la línea histórica" });
    await esperar(1200);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const botones = [...document.querySelectorAll('button')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        historica: t.includes("Transferencia histórica"),
        registrado: t.includes("no registró cómo salió del depósito"),
        remito: t.includes("Remito original"),
        actual: t.includes("Presentación actual del depósito"),
        equivale: t.includes("Equivale a"),
        ayuda: t.includes("No cambia el remito original"),
        // El CTA nombra la presentación de verdad: "Usar PACK x30 para esta
        // recepción". Buscar el genérico dejaría pasar un botón que no dice qué
        // va a hacer, que es justo lo que el diseño vino a corregir.
        accion: botones.some((b) => /^Usar .+ para esta recepción$/.test((b.textContent || "").trim())),
        lineas: t.split(String.fromCharCode(10)).filter((l) => l.includes("Remito original") || l.includes("Equivale a")).slice(0, 4),
      });
    })()`);
    const c = JSON.parse(escena);
    if (!c.historica) throw new Error("falta el rótulo «Transferencia histórica»");
    if (!c.registrado) throw new Error("falta decir que la línea no registró cómo salió");
    if (!c.remito) throw new Error("falta el remito original");
    if (!c.actual) throw new Error("falta la presentación actual del depósito");
    if (!c.equivale) throw new Error("falta la equivalencia exacta: sin ella se adopta a ciegas");
    if (!c.ayuda) throw new Error("falta la ayuda que aclara que el remito no cambia");
    if (!c.accion) throw new Error("el CTA no nombra la presentación de verdad");
    console.log(`  · ${JSON.stringify(c.lineas)}`);
    desbordes += await foto("C-historica-adoptar-presentacion", ancho);
  }

  if (MODO === "nodeclarado-pack") {
    // G · el producto no declarado con un producto AGRUPADO ya elegido.
    //
    // Es la escena que la tanda anterior no pudo sacar: quedó el modal abierto
    // sobre el buscador vacío. Lo que hay que ver es lo de después de elegir —la
    // presentación que declara el catálogo del origen, y los dos campos del
    // bulto incompleto— y sobre todo lo que YA NO está: la pregunta
    // "¿Cómo lo contaste? UNIDAD / BULTO".
    // El camino de excepción es el mismo que la escena D: el botón aparece
    // recién cuando un escaneo no encuentra nada en el remito, que es cuando el
    // operador de verdad se entera de que tiene algo no declarado en la mano.
    await escribirEnBuscador("zzz-no-existe");
    await apretarEnter();
    await esperarTexto("no figura");
    await tocar("Informar producto no declarado", { etiqueta: "el botón de no declarado" });
    await esperar(1800);
    const abierto = await evaluar(
      `[...document.querySelectorAll('input[type="text"], input:not([type])')].filter((e) => e.offsetParent !== null).length >= 2`
    );
    if (!abierto) throw new Error("el modal del catálogo del origen no abrió");

    await escribirEnBuscador(BUSQUEDA, { enModal: true });
    await esperar(2500);
    await tocar(BUSQUEDA, { etiqueta: "un resultado del catálogo del origen" });
    await esperar(1200);

    const escena = await evaluar(`(() => {
      const t = document.body.innerText;
      const campos = [...document.querySelectorAll('input[type="number"]')].filter((e) => e.offsetParent !== null);
      return JSON.stringify({
        presentacion: t.includes("Presentación de origen"),
        completos: t.includes("Completos"),
        sueltas: t.includes("Unidades sueltas"),
        pregunta: t.includes("Cómo lo contaste"),
        campos: campos.length,
        rotulo: t.split(String.fromCharCode(10)).find((l) => l.indexOf("PACK x") === 0 || l.indexOf("CAJÓN x") === 0) || null,
      });
    })()`);
    const e = JSON.parse(escena);
    if (e.pregunta) throw new Error("el selector UNIDAD/BULTO sigue en pantalla");
    if (!e.presentacion) throw new Error("no se muestra la presentación de origen");
    if (!e.completos || !e.sueltas) {
      throw new Error(`faltan los dos campos del bulto: ${JSON.stringify(e)}`);
    }
    if (e.campos < 2) throw new Error(`hay ${e.campos} campos numéricos y tienen que ser 2`);
    console.log(`  · presentación ${e.rotulo} · ${e.campos} campos · sin selector`);
    desbordes += await foto("G-no-declarado-pack", ancho);
  }

  // ── LA ESCENA DE LA TANDA DE IMPORTES Y SALIDA DEPÓSITO → LOCAL ────────
  //
  // Una sola foto que tiene que probar cuatro cosas a la vez: el importe del
  // documento arriba, el subtotal DEBAJO de la cantidad en cada card, el estado
  // solo en la columna derecha, y las dos escalas agrupadas —PACK x6 y CAJÓN
  // x8— con su rótulo entero.
  //
  // ── POR QUÉ EL GUARDA NO EXIGE "PACK x6" Y "CAJÓN x8" ──────────────────
  //
  // El pedido de la tanda los nombraba. En la copia de producción NO EXISTEN en
  // una recepción abierta, y eso se midió: de las 191 transferencias, la única
  // en estado recibible con líneas agrupadas y un importe real es la #191, con
  // PACK x10 y PACK x12. Todos los demás agrupados de un remito abierto salieron
  // del depósito SUELTOS —`unidadEnviada = UNIDAD`—, que además es coherente con
  // los 291 productos `SOLO_UNIDAD` que encontró la auditoría.
  //
  // Fabricar una línea para que la foto coincida con el diseño sería
  // exactamente lo que prohíbe la regla 4 de CLAUDE.md: probaría que la pantalla
  // dibuja algo, no que el caso ocurra. Así que el guarda exige lo que la
  // captura tiene que demostrar —un agrupado CON su factor— y el número lo pone
  // el remito.
  if (MODO === "importes-salida") {
    // Sin tocar los filtros: el tab por defecto es Pendientes y en un remito
    // recién abierto son TODAS las líneas. Cambiarlo sería mover algo que la
    // captura no viene a mostrar.
    // SIN buscador y sin tocar los filtros: la escena es el remito tal como se
    // abre. Filtrar sería mostrar una pantalla que el operador tuvo que armar.
    //
    // Y no se usa `BUSQUEDA` a propósito: su default es el término de otra
    // escena, así que heredarlo dejaba esta captura mirando una lista vacía —lo
    // que pasó en la primera corrida, y el guarda lo dijo.
    //
    // Se ESPERA a que las cards estén, no se cuenta hasta 1200 y se mira. El
    // encabezado se dibuja antes que la lista, así que un guarda que solo
    // comprueba el importe total pasa sobre una pantalla a medio cargar y
    // después informa "0 cards" — que fue exactamente lo que pasó acá.
    await esperarTexto("Importe total");
    await esperarTexto("Enviado ");
    await esperar(600);

    const estado = await evaluar(`(() => {
      const t = document.body.innerText;
      // Se lee el TEXTO RENDERIZADO y no un selector. Un atributo puede dejar de
      // llegar al DOM si el kit cambia cómo reenvía props, y entonces el guarda
      // contaría cero sobre una pantalla que está perfecta — que es exactamente
      // lo que pasó armando esta captura.
      //
      // Se lee de innerText y NO de textContent: el segundo incluye lo que hay
      // adentro de los <script>, y el payload de Next repite cada línea del
      // remito. Con textContent este guarda informaba 42 cards sobre una
      // pantalla de 14 — un número inflado es tan inútil como uno en cero.
      //
      // Al colapsar los saltos, la cantidad y su importe quedan pegados, y esa
      // adyacencia es JUSTO lo que hay que comprobar: que el importe venga
      // después del renglón de la cantidad, adentro de la misma card.
      // (Sin acentos graves acá adentro: esto vive en un template literal.)
      const bruto = t.replace(/\\s+/g, " ");
      const textos = bruto.match(/(?:Enviado|Recibido) [^$]{0,80}?Importe \\$ [\\d.]+,\\d{2}/g) || [];
      return JSON.stringify({
        importeTotal: t.includes("Importe total"),
        // Cada entrada de textos ES una card cuya cantidad va seguida de su
        // importe. Y conImporte cuenta los "Importe $" que hay en la pantalla:
        // si alguno no quedó pegado a su cantidad, los dos números difieren.
        cards: textos.length,
        conImporte: (bruto.match(/Importe \\$/g) || []).length,
        agrupados: textos.filter((x) => /(PACK|CAJÓN) x\\d+/.test(x)).length,
        escalas: [...new Set(textos.flatMap((x) => x.match(/(?:PACK|CAJÓN|KG|PIEZA|UNIDAD)(?: x\\d+)?/g) || []))],
        muestra: textos.slice(0, 3),
        // Para que una corrida que falla diga QUÉ vio, en vez de dejar a quien
        // la lea adivinando si el problema es la pantalla o el guarda.
        vecindario: (() => {
          const i = bruto.indexOf("Enviado ");
          return i === -1 ? "(no aparece «Enviado »)" : bruto.slice(i, i + 160);
        })(),
      });
    })()`);
    const e = JSON.parse(estado);
    if (e.cards === 0) console.log(`  · lo que se vio: ${e.vecindario}`);

    // Se comprueba ANTES de disparar. Una pantalla que no tiene lo que la foto
    // dice mostrar se fotografía igual de bien que la buena.
    if (!e.importeTotal) throw new Error("no está el importe total del documento");
    if (e.cards < 3) throw new Error(`hay ${e.cards} cards y hacen falta al menos 3`);
    if (e.conImporte !== e.cards) {
      throw new Error(`${e.conImporte} de ${e.cards} cards muestran importe`);
    }
    if (e.agrupados < 1) {
      throw new Error("no hay ninguna línea agrupada con su factor: la escala no se ve");
    }

    // El orden ya está comprobado por construcción: cada entrada de `cards` es
    // una cantidad SEGUIDA de su importe. Lo que falta es que no haya quedado
    // ningún importe suelto, fuera de esa secuencia.

    console.log(
      `  · ${e.cards} cards · importe en ${e.conImporte} · ${e.agrupados} agrupados · escalas: ${e.escalas.join(", ")}`
    );
    desbordes += await foto("recepcion-importes-salida", ancho);
  }

  if (MODO === "completo") {
    // D · todo revisado. Se llega EJERCIENDO la pantalla: se abre cada producto
    // y se lo marca revisado con lo que el remito propone. No se escribe en la
    // base por afuera para que la foto salga linda.
    for (let i = 0; i < 12; i++) {
      const quedan = await evaluar(
        `document.body.innerText.includes("Pendiente de revisar")`
      );
      if (!quedan) break;
      await tocar("Pendiente de revisar", { etiqueta: "el próximo pendiente" });
      await esperarTexto("Ingreso físico");
      // "y seguir" y no el texto entero: el botón dice "Marcar revisado y
      // seguir" o "Guardar diferencia y seguir" según haya diferencia, y el
      // arnés no tiene por qué saber cuál de los dos le toca a este producto.
      await tocar("y seguir", { etiqueta: "el botón de marcar" });
      await esperar(1500);
    }
    await esperarTexto("Todo revisado");
    desbordes += await foto("D-todo-revisado", ancho);
  }
}

console.log(
  desbordes === 0
    ? "\nVERDE · ninguna captura tiene scroll horizontal."
    : `\n⚠ HAY DESBORDE HORIZONTAL (${desbordes}px acumulados).`
);
try { navegador.kill(); } catch {}
process.exit(desbordes === 0 ? 0 : 1);
