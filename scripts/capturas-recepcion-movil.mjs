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
async function tocar(fragmento, { etiqueta = null } = {}) {
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
    const el = nodos.find((n) =>
      ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).includes(objetivo)
    );
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
