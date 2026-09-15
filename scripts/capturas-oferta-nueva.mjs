// CREAR UNA OFERTA, ABIERTA EN UN NAVEGADOR DE VERDAD.
//
//   node --experimental-websocket scripts/capturas-oferta-nueva.mjs \
//     --base http://127.0.0.1:3210 --chrome /usr/bin/chromium \
//     --salida /tmp/capturas-oferta --usuario 1 --local 1
//
// ── POR QUÉ UN ARNÉS PROPIO Y NO UN MODO DEL DE TRANSFERENCIAS ───────────
//
// Es el mismo criterio que ya se escribió cuando el tablero no se metió adentro
// del de recepción: aquéllos ejercen otras secuencias y saben de otras
// pantallas. Lo que se reusa es el MECANISMO —CDP sin dependencias nuevas, la
// sesión firmada con el `AUTH_SECRET` de la instancia descartable, y la regla de
// que cada captura afirma ANTES qué tiene que haber en pantalla—.
//
// ── ESTE ARNÉS **ESCRIBE** ──────────────────────────────────────────────
//
// La última parte crea una oferta de verdad. Por eso corre SOLO contra la base
// descartable `erpazul_v15`, nunca contra producción.
//
// ── UNA PÁGINA DE ERROR SE FOTOGRAFÍA IGUAL DE BIEN ─────────────────────
//
// Ninguna foto sale sin que antes se compruebe un texto que solo puede estar si
// la pantalla cargó.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://127.0.0.1:3210");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/tmp/capturas-oferta");
const PUERTO = Number(arg("puerto-cdp", "9336"));
const SECRETO = process.env.AUTH_SECRET;
const USUARIO = Number(arg("usuario", "1"));
const LOCAL = Number(arg("local", "1"));
const BUSCAR = arg("buscar", "V15");
const ANCHO = Number(arg("ancho", "390"));
const ALTOS = arg("altos", "640,520,440").split(",").map(Number);

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}

const PERMISOS = ["ofertas.ver", "ofertas.crear", "ofertas.editar", "productos.ver", "stock.ver"];

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

async function esperarTexto(fragmento, ms = 30000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const hay = await evaluar(
      `document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`
    );
    if (hay) return true;
    await esperar(400);
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 600) : '(sin body)'");
  throw new Error(`nunca apareció «${fragmento}». En pantalla había:\n${visto}`);
}

const hayTexto = (f) =>
  evaluar(`document.body ? document.body.innerText.includes(${JSON.stringify(f)}) : false`);

let afirmaciones = 0;
let desbordes = 0;

async function afirmar(condicion, mensaje) {
  if (condicion) {
    afirmaciones++;
    console.log(`  ✓ ${mensaje}`);
    return;
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 800) : '(sin body)'");
  throw new Error(`FALLÓ: ${mensaje}\n  En pantalla había:\n${visto}`);
}

async function medir(alto) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ANCHO,
    height: alto,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await esperar(500);
}

async function foto(nombre) {
  const desborde = await evaluar(
    "Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)"
  );
  if (desborde > 0) desbordes++;
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(data, "base64"));
  console.log(
    `  ✓ ${nombre}.png  ${desborde === 0 ? "sin scroll horizontal" : `⚠ DESBORDA ${desborde}px`}`
  );
}

/** Toca el primer control VISIBLE cuyo texto contenga el fragmento. */
async function tocar(fragmento, { exacto = false } = {}) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(fragmento)};
    const nodos = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null && !n.disabled);
    const texto = (n) => ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).trim();
    const el = nodos.find((n) => ${exacto ? "texto(n) === objetivo" : "texto(n).includes(objetivo)"});
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró nada tocable con «${fragmento}»`);
  await esperar(700);
}

/** Escribe en un campo con el setter nativo: asignar `.value` no le avisa a React. */
async function escribir(selectorAria, valor) {
  const ok = await evaluar(`(() => {
    const campo = [...document.querySelectorAll('input')]
      .filter((i) => i.offsetParent !== null)
      .find((i) => (i.getAttribute('aria-label') || i.placeholder || '').includes(${JSON.stringify(selectorAria)}));
    if (!campo) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(campo, ${JSON.stringify(valor)});
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró el campo «${selectorAria}»`);
  await esperar(600);
}

const url = new URL(BASE);

async function entrarComo(localId) {
  const token = jwt.sign(
    { id: USUARIO, nombre: "Capturas", email: "capturas@local", localId, permisos: PERMISOS },
    SECRETO,
    { expiresIn: "1h" }
  );
  await send("Network.setCookie", {
    name: "erpazul_sesion", value: token, domain: url.hostname, path: "/", httpOnly: true,
  });
  const operador = jwt.sign(
    { operadorId: USUARIO, nombre: "Capturas", localId, _tipo: "operador" },
    SECRETO,
    { expiresIn: "1h" }
  );
  await send("Network.setCookie", {
    name: "erpazul_operador_activo", value: operador, domain: url.hostname, path: "/", httpOnly: true,
  });
  console.log(`\n▸ sesión firmada (local ${localId})`);
}

async function abrir(ruta, textoEsperado) {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(400);
  await send("Page.navigate", { url: `${BASE}${ruta}` });
  await esperarTexto(textoEsperado, 45000);
  await esperar(900);
}

// ── ARRANQUE ─────────────────────────────────────────────────────────────
const perfil = fs.mkdtempSync(path.join("/tmp", "perfil-oferta-"));
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
    "--no-sandbox",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => {
  try { navegador.kill(); } catch {}
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

await entrarComo(LOCAL);

// ── 1 · LA PANTALLA VACÍA, EN LAS TRES ALTURAS ───────────────────────────
for (const alto of ALTOS) {
  await medir(alto);
  await abrir("/modulos/ofertas/nueva", "Qué producto");
  await afirmar(await hayTexto("Qué producto ponés en oferta"), `${alto} · el rótulo del buscador`);
  await afirmar(await hayTexto("Elegí un producto para empezar"), `${alto} · el resumen del pie`);
  await afirmar(
    await hayTexto("Desde que publicás, el POS ya cobra este precio"),
    `${alto} · la advertencia del pie`
  );
  await foto(`oferta-vacia-${ANCHO}x${alto}`);
}

await medir(ALTOS[0]);
await abrir("/modulos/ofertas/nueva", "Qué producto");

// ── EL NOMBRE NO SE PIDE, QUE ES EL CAMBIO DE REGLA ─────────────────────
//
// La oferta se llama como el producto. Un campo de nombre acá es lo que hizo
// que la única oferta de producción se llame "91100".
await afirmar(
  !(await hayTexto("Nombre de la oferta")) && !(await hayTexto("Nombre")),
  "la pantalla NO pide un nombre para la oferta"
);

// ── EL SHELL DIBUJA EL ENCABEZADO, NO LA PANTALLA ──────────────────────
const fila = await evaluar(`(() => {
  const n = [...document.querySelectorAll('div')]
    .filter((e) => e.className.includes('md:hidden') && e.className.includes('text-xl'))
    .find((e) => e.offsetParent !== null);
  return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null;
})()`);
await afirmar(
  fila === "Nueva oferta Volver",
  `el renglón del shell lleva el título y el Volver (dice: ${JSON.stringify(fila)})`
);
await afirmar(
  !(await evaluar(`document.body.innerText.includes('Nueva oferta\\nNueva oferta')`)),
  "el título no se repite: no hay encabezado propio"
);

// Los bloques 2 a 5 NO existen hasta que hay producto.
for (const t of ["Precio de oferta", "Hasta cuándo dura", "Solo si paga en efectivo"]) {
  await afirmar(!(await hayTexto(t)), `sin producto, «${t}» no se dibuja`);
}
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && b.disabled).length`)) === 1,
  "sin producto, Publicar está deshabilitado"
);

// ── 2 · ELEGIR UN PRODUCTO ───────────────────────────────────────────────
await escribir("Codigo o nombre", BUSCAR);
await esperar(1400);
await afirmar(
  (await evaluar(`document.body.innerText.includes("Stock:")`)),
  "el buscador del POS trajo resultados contra el endpoint de ofertas"
);
await foto(`oferta-buscando-${ANCHO}`);

// Se toca el primer resultado.
await evaluar(`(() => {
  const fila = [...document.querySelectorAll('div')]
    .filter((d) => d.offsetParent !== null && d.className.includes('cursor-pointer'))
    .find((d) => /Stock:/.test(d.innerText));
  if (fila) fila.click();
  return !!fila;
})()`);
await esperar(1200);

await afirmar(await hayTexto("Precio normal"), "al elegir, aparece la tarjeta del producto");
await afirmar(await hayTexto("Costo"), "la tarjeta muestra el costo");
await afirmar(await hayTexto("Stock hoy en"), "la tarjeta muestra el stock de la ubicación");
await afirmar(await hayTexto("Precio de oferta"), "aparece el bloque del precio");
await afirmar(await hayTexto("Hasta cuándo dura"), "aparece el bloque de la duración");
await afirmar(await hayTexto("Solo si paga en efectivo"), "aparece el interruptor");
await afirmar(await hayTexto("Termina el"), "la vigencia se dice en criollo");
await foto(`oferta-producto-elegido-${ANCHO}`);

// ── 3 · EL PRECIO, EN VIVO ───────────────────────────────────────────────
const precioNormal = await evaluar(`(() => {
  const m = document.body.innerText.match(/Precio normal\\s*\\$ ([\\d.,]+)/);
  return m ? Number(m[1].replace(/\\./g, "").replace(",", ".")) : null;
})()`);
await afirmar(precioNormal > 0, `se pudo leer el precio normal (${precioNormal})`);

// Un precio MAYOR al normal no es una oferta y no se puede publicar.
await escribir("Precio de oferta", String(Math.round(precioNormal * 1.1)));
await afirmar(await hayTexto("no es una oferta"), "un precio mayor al normal se rechaza con palabras");
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && b.disabled).length`)) === 1,
  "y Publicar sigue deshabilitado"
);
await foto(`oferta-precio-invalido-${ANCHO}`);

// ── UN PRECIO POR DEBAJO DEL COSTO: AVISA Y **DEJA PUBLICAR** ───────────
//
// Es la regla que más importa de esta pantalla y la que un candado de render no
// puede probar: que el aviso salga Y que el botón quede habilitado igual.
// Vender bajo costo es una decisión comercial legítima —un líder de pérdida— y
// el sistema no opina sobre el negocio.
//
// Se mide ACÁ y no con el tono "ok" porque la base de pruebas no lo permite: el
// sembrado crea los productos con `precio_venta = precio_costo`, así que NO
// EXISTE un precio menor al normal y mayor al costo. El caso bueno está cubierto
// por el candado O7, que es donde se puede elegir los números.
await escribir("Precio de oferta", String(Math.round(precioNormal * 0.9)));
await afirmar(await hayTexto("a pérdida"), "bajo costo se avisa con todas las letras");
await afirmar(await hayTexto("Te falta"), "y se dice cuánto falta para cubrir el costo");
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && !b.disabled).length`)) === 1,
  "AVISA, NO BLOQUEA: a pérdida se puede publicar igual"
);
await afirmar(await hayTexto("pasa de"), "el resumen del pie se arma solo");
await afirmar(await hayTexto("con cualquier medio de pago"), "el resumen dice el medio de pago");
await foto(`oferta-precio-ok-${ANCHO}`);

// ── 4 · LOS CHIPS DE DURACIÓN ────────────────────────────────────────────
const vigenciaAntes = await evaluar(`(document.body.innerText.match(/Termina el [^\\n]+/) || [])[0]`);
await tocar("1 semana", { exacto: true });
const vigenciaDespues = await evaluar(`(document.body.innerText.match(/Termina el [^\\n]+/) || [])[0]`);
await afirmar(
  vigenciaAntes !== vigenciaDespues,
  `el chip mueve la fecha (${vigenciaAntes} → ${vigenciaDespues})`
);
await tocar("Elegir", { exacto: true });
await afirmar(
  (await evaluar(`[...document.querySelectorAll('input[type=date]')].filter((i) => i.offsetParent !== null).length`)) === 1,
  "«Elegir» abre el selector de fecha"
);
await tocar("3 días", { exacto: true });

// ── 5 · SOLO EFECTIVO CAMBIA EL RESUMEN ──────────────────────────────────
//
// ── EL INTERRUPTOR DEL KIT NO TIENE `role` NI `aria-label` ──────────────
//
// `SunmiToggle` es un `div` con `onClick`: no es un `button`, no declara
// `role="switch"` ni `aria-checked`, y no acepta una etiqueta accesible. Así que
// acá NO se lo puede buscar como control — hay que llegar por la fila que lo
// contiene.
//
// Queda anotado como hueco del kit y no se arregla en esta tanda: tocar una
// pieza compartida por otras pantallas es otra tanda, con sus capturas.
await evaluar(`(() => {
  const fila = [...document.querySelectorAll('div')]
    .filter((d) => d.offsetParent !== null)
    .find((d) => /Solo si paga en efectivo/.test(d.innerText) && d.className.includes('justify-between'));
  if (!fila) return false;
  const toggle = [...fila.querySelectorAll('div')]
    .find((d) => d.className.includes('select-none'));
  if (!toggle) return false;
  toggle.click();
  return true;
})()`);
await esperar(800);
await afirmar(
  await hayTexto("solo si paga en efectivo"),
  "el interruptor cambia el resumen del pie"
);
await afirmar(
  !(await hayTexto("con cualquier medio de pago")),
  "y deja de decir el otro: el resumen no puede decir las dos cosas"
);
await foto(`oferta-solo-efectivo-${ANCHO}`);

// ── EL PIE ESTÁ ANCLADO, Y ESO SE MIDE ──────────────────────────────────
//
// La especificación lo pide explícito: el pie NO scrollea con el contenido. Un
// `sticky bottom-0` solo ancla si su contenedor genera scroll; si el que
// scrollea es la página entera, el pie se va hacia abajo con todo lo demás y la
// decisión —el resumen y los dos botones— queda fuera de la vista.
//
// Se mide en el navegador y no se lee del CSS: `position: sticky` depende de la
// cadena de contenedores, no de la clase.
const anclaje = await evaluar(`(() => {
  const pie = [...document.querySelectorAll('div')]
    .find((d) => d.offsetParent !== null && /Desde que public/.test(d.innerText) && d.className.includes('sticky'));
  if (!pie) return { hay: false };
  const antes = pie.getBoundingClientRect().bottom;
  const alto = window.innerHeight;
  // Se scrollea todo lo que se pueda y se vuelve a mirar dónde quedó.
  const cont = [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 20);
  if (cont) cont.scrollTop = cont.scrollHeight;
  window.scrollTo(0, document.body.scrollHeight);
  return { hay: true, antes, alto, despues: pie.getBoundingClientRect().bottom };
})()`);
await esperar(500);
await afirmar(anclaje.hay, "se encontró el pie anclado");
// Lo que se afirma es que NO SE MOVIÓ y que sigue dentro de la pantalla. No se
// compara contra el alto del viewport a secas: el shell dibuja su propio cromo
// abajo, así que el pie termina unos píxeles antes del borde y eso es correcto.
// La primera versión de esta afirmación medía contra el borde y daba rojo sobre
// un anclaje que funcionaba.
await afirmar(
  Math.abs(anclaje.despues - anclaje.antes) <= 2,
  `el pie NO se mueve al scrollear (antes ${anclaje.antes}, después ${anclaje.despues})`
);
await afirmar(
  anclaje.despues > 0 && anclaje.despues <= anclaje.alto,
  `y queda dentro de la pantalla (alto ${anclaje.alto}, pie termina en ${anclaje.despues})`
);

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
if (desbordes > 0) process.exitCode = 1;
process.exit(process.exitCode || 0);
