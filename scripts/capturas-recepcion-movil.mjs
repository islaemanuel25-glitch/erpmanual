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

// ── LO QUE HACE FALTA PARA EJERCER LA SECUENCIA DEL V15 ───────────────────
//
// Los helpers de arriba sacan fotos; estos AFIRMAN. Es la diferencia entre "la
// pantalla se ve así" y "la pantalla hace esto", y el V15 se pidió con la
// segunda: tocar Coincide, mover el contador, elegir motivo, y comprobar que el
// cierre se destraba.

let afirmaciones = 0;

/** Afirma, cuenta, y si falla dice qué había en pantalla. */
async function afirmar(condicion, mensaje) {
  if (condicion) {
    afirmaciones++;
    console.log(`  ✓ ${mensaje}`);
    return;
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 700) : '(sin body)'");
  throw new Error(`FALLÓ: ${mensaje}\n  En pantalla había:\n${visto}`);
}

/** ¿El texto está en pantalla AHORA? Sin esperar: para afirmar, no para sincronizar. */
const hayTexto = (fragmento) =>
  evaluar(`document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`);

/**
 * LA TARJETA DE UN PRODUCTO, Y SOLO ESA.
 *
 * Con cuatro tarjetas en pantalla, `tocar("Faltante")` se va a la primera que
 * encuentre, que puede ser la de otro producto. Acá se acota: se busca el
 * contenedor MÁS CHICO que contenga a la vez el nombre del producto y algo
 * tocable que coincida — el más chico es la tarjeta, porque cualquier ancestro
 * suyo contiene también a las otras.
 */
/**
 * @param {object} opciones
 * @param {boolean} [opciones.exacto] Comparar el TEXTO exacto del botón y
 *   ninguna `aria-label`. Hace falta para los chips de motivo: el botón "−"
 *   tiene `aria-label="Restar uno a V15 Faltante PACK"`, que contiene la palabra
 *   "Faltante", así que la búsqueda por fragmento se iba al contador y bajaba
 *   la cantidad en vez de elegir el motivo. El síntoma era desconcertante —el
 *   chip quedaba sin elegir y la tarjeta seguía pidiendo motivo— y costó una
 *   corrida entenderlo.
 */
async function tocarEnTarjeta(nombreProducto, fragmento, { etiqueta = null, exacto = false } = {}) {
  const ok = await evaluar(`(() => {
    const producto = ${JSON.stringify(nombreProducto)};
    const objetivo = ${JSON.stringify(fragmento)};
    const exacto = ${exacto ? "true" : "false"};
    // Por el ancla estable que la tarjeta se pone sola. Antes se buscaba "el div
    // más chico que contiene el nombre", que es una inferencia sobre la forma
    // del DOM y se rompe cada vez que la pantalla se rediseña. El detalle está
    // en el encabezado de textoDeTarjeta, sin backticks a propósito: esto vive
    // adentro de un template literal.
    const candidatos = [...document.querySelectorAll('[data-tarjeta-recepcion]')]
      .filter((n) => n.offsetParent !== null
        && (n.getAttribute('data-tarjeta-recepcion') || '').includes(producto));
    for (const caja of candidatos) {
      const el = [...caja.querySelectorAll('button, a, [role="button"]')]
        .filter((n) => n.offsetParent !== null)
        .find((n) => exacto
          ? (n.textContent || '').trim() === objetivo
          : ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo));
      if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    }
    return false;
  })()`);
  if (!ok) {
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => e.offsetParent !== null);
      return n.length + " tocables · " + n.slice(0, 16)
        .map((e) => JSON.stringify(((e.getAttribute('aria-label') || '') + ' ' + (e.textContent || '')).trim().slice(0, 40)))
        .join(", ");
    })()`);
    throw new Error(
      `no se encontró «${etiqueta || fragmento}» dentro de la tarjeta de «${nombreProducto}».\n  ${inventario}`
    );
  }
  await esperar(700);
}

/**
 * ¿Quedó algún contador − / + en la pantalla?
 *
 * La regla central del V21 es que la tarjeta NO edita cantidades. Se pregunta
 * por el `aria-label`, que es lo único estable: el botón no tiene texto —lleva
 * un ícono— así que buscar por `textContent` no lo encontraría aunque estuviera.
 */
const hayContador = () =>
  evaluar(`(() => {
    return [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .some((n) => /Restar uno a|Sumar uno a/.test(n.getAttribute('aria-label') || ''));
  })()`);

/**
 * ¿Está abierto el panel del producto?
 *
 * Se pregunta por el `role="dialog"` de la hoja del kit Y por un campo numérico
 * visible. Solo el `role` no alcanza: el aviso de "no figura" y la hoja de más
 * acciones también son diálogos, y lo que hay que afirmar es que se abrió el
 * panel DONDE SE EDITA, que es el que tiene el campo de la cantidad.
 *
 * ── AL DIÁLOGO NO SE LE PREGUNTA POR `offsetParent` ──────────────────────
 *
 * Es la tercera vez que esa propiedad engaña en este arnés —antes fueron los
 * SVG, que no la tienen—. Acá el motivo es otro: `offsetParent` devuelve `null`
 * para todo elemento con `position: fixed`, y la capa del modal del kit es
 * precisamente `fixed inset-0`. O sea que filtrar por eso descartaba justo el
 * diálogo que se estaba buscando, y la sonda contestaba "no se abrió" con el
 * panel abierto en pantalla.
 *
 * El campo SÍ se filtra: vive adentro de la capa fija, así que su `offsetParent`
 * es esa capa y no es null, y el filtro sirve para descartar los campos de otra
 * hoja que quedó montada pero oculta.
 */
const panelAbierto = () =>
  evaluar(`(() => {
    const hojas = [...document.querySelectorAll('[role="dialog"]')];
    const campos = [...document.querySelectorAll('input[type="number"]')].filter((n) => n.offsetParent !== null);
    return hojas.length > 0 && campos.length > 0;
  })()`);

/** ¿El botón de confirmar está trabado? Se lee del DOM, no de la foto. */
const cierreTrabado = () =>
  evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.textContent || '').includes('Confirmar'));
    if (!b) return 'SIN BOTON';
    return b.disabled === true;
  })()`);

/**
 * El texto de una tarjeta, para afirmar sobre ella y no sobre la pantalla entera.
 *
 * ── LA HEURÍSTICA SE CAMBIÓ POR UN ANCLA, Y ÉSTA ES LA HISTORIA ───────────
 *
 * Buscaba "el div más chico que contiene el nombre Y algún botón". La primera
 * mitad de esa regla ya había fallado una vez —el renglón del encabezado es más
 * chico que la tarjeta— y se le agregó la segunda para separarlos: el
 * encabezado no tenía botones y la tarjeta sí.
 *
 * El V21 la rompió sin tocarla. Al mudar "✓ Coincide" arriba a la derecha, el
 * encabezado PASÓ a tener un botón, así que volvió a ganar él y el pie con
 * "Corregir" quedaba afuera. El arnés informaba que la tarjeta no tenía
 * "Corregir" mientras la pantalla lo mostraba.
 *
 * La lección es la de siempre: una sonda que infiere la estructura se rompe
 * cuando la estructura cambia, que es exactamente cuando hay que confiar en
 * ella. Ahora la tarjeta se marca a sí misma con `data-tarjeta-recepcion` y acá
 * se la busca por ese atributo.
 */
const textoDeTarjeta = (nombreProducto) =>
  evaluar(`(() => {
    const producto = ${JSON.stringify(nombreProducto)};
    const marcada = [...document.querySelectorAll('[data-tarjeta-recepcion]')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.getAttribute('data-tarjeta-recepcion') || '').includes(producto));
    if (marcada) return marcada.innerText;
    return '(no está la tarjeta)';
  })()`);

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

  // ══════════════════════════════════════════════════════════════════════
  // V21 · LA SECUENCIA DE TRABAJO, EJERCIDA Y AFIRMADA
  //
  // No saca fotos: TOCA y comprueba. Es la mitad que los candados de
  // `tarjetaRecepcionV21.test.mjs` no pueden cubrir —montan el componente, no
  // corren eventos ni persisten— y la que el diseño pidió explícitamente.
  //
  // ── POR QUÉ SE REESCRIBIÓ ENTERA Y NO SE RETOCÓ ──────────────────────
  //
  // La secuencia del V15 ejercía el contador − / + de la tarjeta: siete de sus
  // pasos tocaban "Restar uno a" y "Sumar uno a". Ese contador ya no existe.
  // Retocarla habría dejado un arnés que verifica una mecánica muerta; lo que
  // hay que ejercer ahora es lo contrario — que la tarjeta NO edite y que el
  // panel sí—, y eso son pasos distintos, no los mismos con otro selector.
  //
  // Necesita la base descartable: `scripts/sembrar-v15-recepcion.mjs` deja un
  // remito de cuatro líneas, una por caso, más un producto por PESO fuera del
  // remito. El procedimiento completo está en
  // `docs/architecture/base-de-pruebas-v15.md`.
  // ══════════════════════════════════════════════════════════════════════
  if (MODO === "v21-secuencia") {
    const COINCIDE = "V15 Coincide UNIDAD";
    const FALTANTE = "V15 Faltante PACK";
    const SOBRANTE = "V15 Sobrante CAJON";
    const SUELTAS = "V15 Sueltas PACK";
    // El producto por PESO que vive fuera del remito llega por `--buscar`, que
    // es el mismo parámetro con el que el modo del V16 ejercía el no declarado.
    // En esta base hay que pasarle "V15 NoDeclarado KG".

    // ── PASO 0 · EL ESTADO DE PARTIDA ──────────────────────────────────
    console.log("\n  PASO 0 · estado inicial");
    await afirmar(await hayTexto(COINCIDE), "la tarjeta que va a coincidir está en la lista");
    await afirmar(await hayTexto(FALTANTE), "la que va a faltar está en la lista");
    await afirmar(await hayTexto(SOBRANTE), "la que va a sobrar está en la lista");
    await afirmar(await hayTexto(SUELTAS), "la del pack incompleto está en la lista");

    // LA REGLA CENTRAL DE LA TANDA, ejercida en el navegador y no leída del JSX.
    await afirmar(!(await hayContador()), "no quedó ningún contador − / + en la pantalla");

    const tCoincide = await textoDeTarjeta(COINCIDE);
    await afirmar(tCoincide.includes("Enviado 10 UNIDAD"), "la referencia del remito está: 10 UNIDAD");
    await afirmar(tCoincide.includes("✓ Coincide"), "el caso feliz se ofrece arriba a la derecha");
    await afirmar(tCoincide.includes("Corregir"), "y «Corregir» está en el pie");
    await afirmar(
      !tCoincide.includes("Cargar sueltas") && !tCoincide.includes("Total línea"),
      "salieron «Cargar sueltas» y el rótulo «Total línea»"
    );

    const tFaltante = await textoDeTarjeta(FALTANTE);
    await afirmar(
      tFaltante.includes("Enviado 6 PACK x24"),
      "y en la presentación: 6 PACK x24, no 144 unidades"
    );
    await afirmar(
      tFaltante.includes("PACK x24 · 144 unidades físicas"),
      "la fila 2 dice qué hay, en texto"
    );

    // La línea sembrada con sueltas ya nace con recepción cargada y diferencia.
    const tSueltas = await textoDeTarjeta(SUELTAS);
    await afirmar(
      tSueltas.includes("Recibido 4 PACK x6 + 3 unidades sueltas"),
      "con un conteo guardado, la fila 2 pasa a decir lo RECIBIDO"
    );
    await afirmar(
      tSueltas.includes("Ingreso físico 27 de 24 · sobran 3"),
      "el aviso de diferencia dice los tres números, en físico"
    );
    await afirmar(
      !tSueltas.includes("Coincide"),
      "sobre una diferencia ya declarada NO se ofrece Coincide"
    );
    await afirmar(
      !tSueltas.includes("Motivo obligatorio") && !tSueltas.includes("Faltante"),
      "el motivo salió de la tarjeta: ahora es del panel"
    );

    // ── LOS DOS IMPORTES, QUE ES EL DEFECTO DE LA #191 ─────────────────
    //
    // Esta línea nace con recepción cargada y diferencia: 4 packs de 6 más 3
    // sueltas son 27 físicas contra 24 enviadas. El remito vale 4 × $1.800 y lo
    // recibido 27 × $300. Los dos números tienen que verse, con la flecha en el
    // medio — hasta la #191 la tarjeta mostraba solo el del remito.
    await afirmar(
      tSueltas.includes("$7.200,00"),
      "no está el importe del REMITO en una línea corregida"
    );
    await afirmar(
      tSueltas.includes("$8.100,00"),
      "no está el importe de lo RECIBIDO en una línea corregida"
    );
    await afirmar(tSueltas.includes("→"), "no está la flecha que marca la corrección");

    // Y sobre una que coincide, un solo número y NINGUNA flecha: la flecha diría
    // que hubo una corrección que no hubo.
    await afirmar(
      !tCoincide.includes("→"),
      "apareció la flecha sobre una línea que coincide"
    );

    // El punto de partida del avance, para que el "se movió" del paso 3 tenga
    // contra qué compararse. Sin esto, afirmar "2 / 4" más adelante no dice si
    // el número cambió o si ya estaba así.
    await afirmar(await hayTexto("0 / 4 revisados"), "el avance arranca en 0 de 4");
    await afirmar(await cierreTrabado(), "el cierre arranca TRABADO");
    await afirmar(
      await hayTexto("Total"),
      "la barra de cierre rotula el total y nada más"
    );
    await afirmar(
      !(await hayTexto("Falta revisar")),
      "el V16 sacó el aviso de la barra: el avance ya está arriba"
    );

    // La foto del estado de TRABAJO, que es lo que esta tanda rediseñó. La del
    // final retrata la pantalla con todo colapsado y no muestra ninguna tarjeta
    // viva: sin ésta, el rediseño quedaba sin registro visual.
    desbordes += await foto("V21-tarjetas-de-trabajo", ancho);

    // ── DE ACÁ EN ADELANTE SE TRABAJA SOBRE «TODOS» ────────────────────
    //
    // En "Pendientes" una línea revisada DESAPARECE de la lista. Toda afirmación
    // sobre una tarjeta ausente pasa sola —`(no está la tarjeta)` no contiene
    // "Corregir"— y queda verde sin haber mirado nada: es exactamente el candado
    // sobre un dato que no existe que CLAUDE.md tiene anotado tres veces.
    //
    // Con el tab "Todos" la tarjeta sigue en pantalla después de guardarse y se
    // puede afirmar sobre lo que dice, que es lo que hay que verificar.
    await tocar("Todos", { etiqueta: "el tab Todos" });
    await esperar(900);

    // ── PASO 1 · COINCIDE, DE UN TOQUE Y SIN ABRIR NADA ────────────────
    console.log("\n  PASO 1 · tocar «Coincide»");
    await tocarEnTarjeta(COINCIDE, "✓ Coincide", { etiqueta: "la acción Coincide" });
    await esperar(2500);
    await afirmar(
      !(await panelAbierto()),
      "el caso feliz NO abre el panel: es un toque y nada más"
    );
    const trasCoincidir = await textoDeTarjeta(COINCIDE);
    // Primero que la tarjeta EXISTE. Sin esto, las tres afirmaciones de abajo
    // pasan por ausencia y no prueban nada.
    await afirmar(
      !trasCoincidir.includes("no está la tarjeta"),
      "la tarjeta sigue en la lista después de guardarse"
    );
    await afirmar(
      trasCoincidir.includes("10 UNIDAD"),
      "y quedó con lo que se guardó: 10 UNIDAD"
    );
    await afirmar(
      !trasCoincidir.includes("✓ Coincide"),
      "la línea quedó revisada y colapsada de un solo toque"
    );
    await afirmar(
      !trasCoincidir.includes("Volver a contar"),
      "y el V21 sacó el botón de desmarcar de la tarjeta revisada"
    );
    // Pero SÍ conserva la vuelta. Sin esto, contar mal y guardar deja la línea
    // sin arreglo posible desde el teléfono, que es donde se recibe.
    await afirmar(
      trasCoincidir.includes("Corregir"),
      "la línea revisada conserva el camino de vuelta"
    );
    await tocarEnTarjeta(COINCIDE, "Corregir", { etiqueta: "corregir una línea YA revisada", exacto: true });
    await esperar(1200);
    await afirmar(await panelAbierto(), "y ese «Corregir» abre el mismo panel");
    await tocar("Cerrar", { etiqueta: "cerrar el panel sin tocar nada" });
    await esperar(900);
    await afirmar(!(await panelAbierto()), "cerrar sin guardar deja la línea como estaba");

    // ── PASO 2 · «CORREGIR» ABRE EL PANEL QUE YA EXISTÍA ───────────────
    console.log("\n  PASO 2 · «Corregir» abre el panel");
    await afirmar(!(await panelAbierto()), "antes de tocar, el panel está cerrado");
    await tocarEnTarjeta(FALTANTE, "Corregir", { etiqueta: "la acción Corregir", exacto: true });
    await esperar(1200);
    await afirmar(await panelAbierto(), "«Corregir» abrió el panel de detalle");
    await afirmar(
      await hayTexto("Ingreso físico"),
      "y es el panel de siempre: el que muestra el ingreso físico"
    );

    // ── PASO 3 · EL PANEL EXIGE EL MOTIVO, Y GUARDA ────────────────────
    //
    // La regla NO cambió: si la cantidad se tocó, el motivo es obligatorio. Lo
    // que cambió es QUIÉN la exige — antes la tarjeta, ahora el panel.
    console.log("\n  PASO 3 · el panel exige motivo y guarda");
    await escribirEnCampo(0, "4");
    await esperar(600);
    await afirmar(
      await hayTexto("96"),
      "el panel recalcula el ingreso físico: 4 packs de 24 son 96"
    );

    // Guardar SIN motivo tiene que rebotar, y el panel tiene que seguir abierto.
    await tocar("y seguir", { etiqueta: "guardar sin motivo" });
    await esperar(1200);
    await afirmar(
      await panelAbierto(),
      "guardar con diferencia y SIN motivo no cerró el panel: lo rechazó"
    );
    await afirmar(
      await hayTexto("Elegí el motivo"),
      "y lo dijo con un mensaje, no en silencio"
    );

    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await tocarOpcion("Faltante", { etiqueta: "el motivo Faltante" });
    await tocar("y seguir", { etiqueta: "guardar la diferencia" });
    await esperar(2800);

    await afirmar(!(await panelAbierto()), "con el motivo puesto, guardó y la hoja se cerró sola");
    const trasCorregir = await textoDeTarjeta(FALTANTE);
    await afirmar(
      !trasCorregir.includes("no está la tarjeta"),
      "la tarjeta corregida sigue en la lista"
    );
    await afirmar(
      trasCorregir.includes("4 PACK x24"),
      "y la TARJETA se actualizó con lo que se guardó en el panel"
    );
    // El IMPORTE también, que es lo que la #191 no hacía: 6 packs enviados por
    // $31.500 corregidos a 4, que valen $21.000. La línea quedó revisada y
    // colapsada, y ahí va UN solo número — el de lo recibido.
    await afirmar(
      trasCorregir.includes("$21.000,00"),
      "el importe de la tarjeta no siguió a la cantidad corregida"
    );
    await afirmar(
      !trasCorregir.includes("$31.500,00"),
      "la línea colapsada sigue mostrando el importe del remito"
    );
    // Dos: la que coincidió y ésta. El numerador es `revisados + noDeclarados`
    // y el denominador `totalFisico`, que es la misma fuente del tab "Todos".
    await afirmar(
      await hayTexto("2 / 4 revisados"),
      "y el AVANCE de arriba se movió: el total lo recalculó el servidor"
    );

    // ── PASO 4 · CON DIFERENCIA SIN MOTIVO, EL CIERRE SIGUE TRABADO ────
    //
    // La línea de las sueltas nació con recepción cargada, diferencia y SIN
    // motivo. Mientras esté así, el cierre no se destraba — y el panel es ahora
    // el único lugar donde se le puede poner el motivo.
    console.log("\n  PASO 4 · el sobrante, y el cierre trabado");
    await tocarEnTarjeta(SOBRANTE, "Corregir", { etiqueta: "corregir el sobrante", exacto: true });
    await esperar(1200);
    await escribirEnCampo(0, "7");
    await esperar(600);
    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await tocarOpcion("Sobrante", { etiqueta: "el motivo Sobrante" });
    await tocar("y seguir", { etiqueta: "guardar el sobrante" });
    await esperar(2800);
    await afirmar(
      (await textoDeTarjeta(SOBRANTE)).includes("7 CAJÓN x12"),
      "el sobrante también se guardó desde el panel"
    );
    await afirmar(
      await cierreTrabado(),
      "queda el pack incompleto con diferencia y sin motivo: el cierre SIGUE trabado"
    );

    // ── PASO 5 · EL PACK INCOMPLETO, DONDE EL CONTADOR NO LLEGABA ──────
    console.log("\n  PASO 5 · el pack incompleto");
    await tocarEnTarjeta(SUELTAS, "Corregir", { etiqueta: "corregir el pack incompleto", exacto: true });
    await esperar(1200);
    // ── LOS DOS CAMPOS, SIN BOTÓN DE POR MEDIO ────────────────────────
    //
    // Antes acá se afirmaba que estuviera el botón "Hay unidades sueltas". En el
    // teléfono ese botón ya no existe: el panel es el único lugar donde se carga
    // la cantidad y esconder la mitad del desglose detrás de un toque es pedirle
    // al que tiene la mercadería en la mano que adivine que hay un segundo
    // campo. En escritorio el botón sigue, y eso lo afirma `fichaYNoDeclarado`.
    await afirmar(
      !(await hayTexto("Hay unidades sueltas")),
      "quedó el botón de sueltas en el camino del teléfono"
    );
    const camposDelPanel = await evaluar(`(() => {
      const vis = [...document.querySelectorAll('input[type="number"]')].filter((n) => n.offsetParent !== null);
      return vis.map((n) => n.getAttribute('aria-label') || '(sin etiqueta)');
    })()`);
    await afirmar(
      Array.isArray(camposDelPanel) && camposDelPanel.length >= 2,
      `el panel del teléfono tiene que abrir con los DOS campos; abrió con ${camposDelPanel?.length}: ${JSON.stringify(camposDelPanel)}`
    );
    await afirmar(
      camposDelPanel.some((e) => /sueltas/i.test(e)),
      "ninguno de los campos visibles es el de las unidades sueltas"
    );
    // Por "Seleccionar" y no por el rótulo: "Motivo de la diferencia" es el
    // `div` de la etiqueta, y el disparador del select es un botón aparte cuyo
    // texto es el valor elegido —o el placeholder mientras no hay ninguno—.
    await tocar("Seleccionar", { etiqueta: "el desplegable de motivo" });
    await tocarOpcion("Sobrante", { etiqueta: "el motivo Sobrante" });
    await tocar("y seguir", { etiqueta: "guardar el pack incompleto" });
    await esperar(2800);

    // ── PASO 6 · EL CIERRE SE DESTRABA ─────────────────────────────────
    console.log("\n  PASO 6 · el cierre");
    await afirmar(
      (await cierreTrabado()) === false,
      "con todo revisado y todos los motivos puestos, el botón de confirmar SE DESTRABÓ"
    );
    await afirmar(
      await hayTexto("Confirmar"),
      "y el botón de confirmar sigue en la barra"
    );

    // ── PASO 7 · EL NO DECLARADO, SIN MODAL (V16) ──────────────────────
    //
    // Los tres defectos que salieron de usarlo con la #195: que el importe no
    // salga en $0,00, que no ofrezca "Coincide", y que agregarlo no abra
    // ningún modal.
    console.log("\n  PASO 7 · el no declarado, sin modal");

    // Se escribe en el MISMO buscador de la pantalla. Antes había que escribir
    // acá, tocar un botón, y volver a escribir lo mismo adentro de un modal.
    await escribirEnBuscador(BUSQUEDA);
    await esperar(2500);
    await afirmar(
      await hayTexto("No figura en esta transferencia"),
      "el aviso de que no figura es una línea y dice qué hacer"
    );
    await afirmar(await hayTexto("EN EL CATÁLOGO"), "los resultados del catálogo salen en la misma lista");

    const modalesAntes = await evaluar(
      `document.querySelectorAll('[role="dialog"]').length`
    );
    await afirmar(modalesAntes === 0, "buscar en el catálogo NO abre ningún modal");

    // Tocar la fila agrega la línea. Sin segundo tipeo y sin panel.
    await tocar("Agregar +", { etiqueta: "la fila del catálogo" });
    await esperar(3000);
    const modalesDespues = await evaluar(
      `document.querySelectorAll('[role="dialog"]').length`
    );
    await afirmar(modalesDespues === 0, "agregar desde el catálogo NO abre ningún modal");

    await afirmar(await hayTexto("No declarado"), "la línea cayó como no declarada");
    // Se busca por el NOMBRE del producto, que es único en la pantalla. Anclar
    // en "No declarado" agarraba el renglón del estado, que no es la tarjeta.
    const tarjetaAgregada = await textoDeTarjeta(BUSQUEDA);
    await afirmar(
      tarjetaAgregada.includes("Cargá la cantidad que llegó"),
      "la tarjeta nace en cero y dice qué hacer"
    );
    await afirmar(
      !tarjetaAgregada.includes("Coincide"),
      "el no declarado NO ofrece Coincide: no hay contra qué comparar"
    );
    await afirmar(
      tarjetaAgregada.includes("No declarado · ingreso físico"),
      "el aviso dice por qué está en rojo y cuánto entró"
    );
    await afirmar(
      tarjetaAgregada.includes("Corregir"),
      "y ofrece «Corregir», que es el único camino para cargarle la cantidad"
    );
    await afirmar(await cierreTrabado(), "un no declarado en cero vuelve a trabar el cierre");

    // ── PASO 8 · UNA LÍNEA POR PESO SE CORRIGE, QUE ES EL MOTIVO DE FONDO
    //
    // El producto sembrado fuera del remito es KG a propósito: 3,250 KG no se
    // puede contar tocando + tres mil doscientas cincuenta veces, y ésa es la
    // razón por la que la edición se mudó al panel. Si este paso no pasa, la
    // tanda no resolvió aquello para lo que se hizo.
    console.log("\n  PASO 8 · corregir una línea por PESO");
    await afirmar(
      !tarjetaAgregada.includes("unidades físicas"),
      "en KG no dice «unidades físicas», que sería mentira"
    );
    await tocarEnTarjeta(BUSQUEDA, "Corregir", { etiqueta: "corregir la línea por peso", exacto: true });
    await esperar(1200);
    await afirmar(await panelAbierto(), "el panel se abre también para una línea por peso");
    await escribirEnCampo(0, "3.25");
    await esperar(600);
    await tocar("y seguir", { etiqueta: "guardar los 3,25 KG" });
    await esperar(2800);

    await afirmar(!(await panelAbierto()), "guardó y cerró: un no declarado no pide motivo");
    const tarjetaPeso = await textoDeTarjeta(BUSQUEDA);
    await afirmar(
      tarjetaPeso.includes("3,25"),
      "la tarjeta quedó con los 3,25 KG que se cargaron en el panel"
    );
    await afirmar(
      !tarjetaPeso.includes("$0,00"),
      "y su importe dejó de ser cero: se valoriza con lo recibido"
    );
    await afirmar(
      (await cierreTrabado()) === false,
      "con el no declarado cargado, el cierre se vuelve a destrabar"
    );

    desbordes += await foto("V21-secuencia-final", ancho);
    console.log(`\n  ${afirmaciones} afirmaciones, todas en verde.`);
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
