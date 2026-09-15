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

// ── 2.bis · EL BLOQUE DE PRECIO ARRANCA EN EL MARGEN DE HOY ──────────────
//
// No arranca vacío. Al elegir el producto los dos campos ya traen el margen y el
// precio que ese producto tiene HOY, para que se vea de dónde se parte. Lo que
// se afirma no es "hay algo escrito" sino que el margen mostrado es EL QUE SALE
// de los dos números que la propia pantalla está mostrando: si fuera un cero
// puesto por defecto, la cuenta no daría.
//
// Se lee del navegador y no del dominio: `estadoInicial` ya tiene su candado, y
// lo que acá falta saber es si la pantalla la llama al elegir el producto.
const leerCampos = `(() => {
  const campo = (etiqueta) => {
    const i = [...document.querySelectorAll('input')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.getAttribute('aria-label') || '').includes(etiqueta));
    return i ? i.value : null;
  };
  const num = (re) => {
    const m = document.body.innerText.match(re);
    return m ? Number(m[1].replace(/\\./g, "").replace(",", ".")) : null;
  };
  return {
    margen: campo("Margen sobre el costo"),
    precio: campo("Precio de oferta"),
    costo: num(/Costo\\s*\\$ ([\\d.,]+)/),
    normal: num(/Precio normal\\s*\\$ ([\\d.,]+)/),
  };
})()`;

const arranque = await evaluar(leerCampos);
await afirmar(
  arranque.margen !== null && arranque.margen !== "",
  `el campo de margen arranca LLENO, no vacío (${arranque.margen})`
);
await afirmar(
  arranque.precio !== null && arranque.precio !== "",
  `el campo de precio arranca LLENO (${arranque.precio})`
);
await afirmar(
  arranque.costo > 0 && arranque.normal > 0,
  `se pudieron leer costo (${arranque.costo}) y precio normal (${arranque.normal})`
);
// El margen real de hoy: (normal / costo − 1) × 100. Se recalcula acá, del lado
// del arnés, contra los números que la pantalla dibuja.
const margenDeHoy = Math.round(((arranque.normal / arranque.costo - 1) * 100) * 100) / 100;
await afirmar(
  Math.abs(Number(arranque.margen) - margenDeHoy) < 0.02,
  `y ES EL MARGEN REAL DE HOY: la pantalla dice ${arranque.margen} %, la cuenta da ${margenDeHoy} %`
);
await afirmar(
  Math.abs(Number(arranque.precio) - arranque.normal) < 0.02,
  `y el precio arranca en el normal (${arranque.precio} contra ${arranque.normal})`
);
// Y ese arranque NO ES UNA OFERTA: es el precio normal escrito en dos campos.
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && b.disabled).length`)) === 1,
  "el arranque no es una oferta todavía: Publicar está apagado"
);

// ── 2.ter · LOS DOS CAMPOS SE SINCRONIZAN EN LOS DOS SENTIDOS ────────────
//
// Es el corazón del bloque y no se puede afirmar leyendo: lo que hace falta
// saber es si el manejador de UN campo escribe en el OTRO, y eso solo se ve
// tipeando. Se prueba en las dos direcciones porque son dos manejadores
// distintos y romper uno solo deja el otro andando.
await escribir("Margen sobre el costo", "40");
const trasMargen = await evaluar(leerCampos);
await afirmar(
  trasMargen.margen === "40",
  `el campo TOCADO no se reescribe bajo el dedo (quedó «${trasMargen.margen}»)`
);
const esperadoDe40 = Math.ceil((arranque.costo * 1.4) / 100) * 100;
await afirmar(
  Number(trasMargen.precio) === esperadoDe40,
  `MARGEN → PRECIO: con 40 % sobre ${arranque.costo} el precio quedó en ${trasMargen.precio} y la cuenta da ${esperadoDe40}`
);

// Y ahora al revés, con un precio que NO es múltiplo de 100 a propósito.
const precioCrudo = Math.round((arranque.normal * 0.77) / 100) * 100 + 33;
await escribir("Precio de oferta", String(precioCrudo));
const trasPrecio = await evaluar(leerCampos);
await afirmar(
  trasPrecio.precio === String(precioCrudo),
  `el campo tocado tampoco se reescribe en este sentido (quedó «${trasPrecio.precio}»)`
);
await afirmar(
  trasPrecio.margen !== "" && trasPrecio.margen !== trasMargen.margen,
  `PRECIO → MARGEN: el margen se movió solo (${trasMargen.margen} → ${trasPrecio.margen})`
);

// ── 2.quater · EL % QUE SE MUESTRA ES EL DE DESPUÉS DEL REDONDEO ─────────
//
// Con el redondeo encendido, el precio que se va a cobrar NO es el tipeado. El
// margen que se muestra tiene que ser el del precio COBRADO, no el del tipeado:
// si dijera el segundo estaría mostrando una intención donde va un hecho.
const redondeado = Math.ceil(precioCrudo / 100) * 100;
const margenDelCrudo = Math.round(((precioCrudo / arranque.costo - 1) * 100) * 100) / 100;
const margenDelRedondeado = Math.round(((redondeado / arranque.costo - 1) * 100) * 100) / 100;
await afirmar(
  redondeado !== precioCrudo,
  `el precio elegido (${precioCrudo}) no es múltiplo de 100, así que el redondeo tiene algo que hacer`
);
await afirmar(
  Math.abs(Number(trasPrecio.margen) - margenDelRedondeado) < 0.02,
  `el % es el de DESPUÉS del redondeo: dice ${trasPrecio.margen} %, el de ${redondeado} da ${margenDelRedondeado} % y el del tipeado daría ${margenDelCrudo} %`
);
await afirmar(
  await hayTexto("Redondeado de"),
  "y se dice que se redondeó, con el precio del que se partió"
);

// ── Y EL PIE DICE EL PRECIO QUE SE VA A COBRAR, NO EL TIPEADO ───────────
//
// El pie es la última frase que se lee antes de tocar Publicar, así que es la
// que no puede mentir. Decía el texto del campo: con $ 433 escritos anunciaba
// "pasa de $ 500,00 a $ 433,00" mientras el bloque de arriba decía que el
// precio quedaba en $ 500. Ningún candado lo veía —el pie y el bloque se arman
// con funciones distintas, cada una con los suyos en verde— y apareció mirando
// una captura.
const precioDelPie = await evaluar(
  `(document.body.innerText.match(/pasa de \\$ [\\d.,]+ a \\$ ([\\d.,]+)/) || [])[1] || ""`
);
await afirmar(
  Number(precioDelPie.replace(/\./g, "").replace(",", ".")) === redondeado,
  `el pie anuncia el precio COBRADO: dice $ ${precioDelPie} y lo que se cobra es ${redondeado} (se tipeó ${precioCrudo})`
);
await foto(`oferta-redondeo-${ANCHO}`);

// Apagar el interruptor tiene que mover el % al del precio exacto.
const tocarInterruptor = (rotulo) => evaluar(`(() => {
  const fila = [...document.querySelectorAll('div')]
    .filter((d) => d.offsetParent !== null)
    .find((d) => new RegExp(${JSON.stringify(rotulo)}).test(d.innerText) && d.className.includes('justify-between'));
  if (!fila) return false;
  const toggle = [...fila.querySelectorAll('div')].find((d) => d.className.includes('select-none'));
  if (!toggle) return false;
  toggle.click();
  return true;
})()`);

await afirmar(await tocarInterruptor("Redondear a"), "se encontró el interruptor de redondeo");
await esperar(800);
const sinRedondeo = await evaluar(leerCampos);
await afirmar(
  Math.abs(Number(sinRedondeo.margen) - margenDelCrudo) < 0.02,
  `apagado el redondeo, el % pasa al del precio exacto (${sinRedondeo.margen} contra ${margenDelCrudo})`
);
await afirmar(
  !(await hayTexto("Redondeado de")),
  "y desaparece el renglón del redondeo, porque ya no hay nada que redondear"
);
await tocarInterruptor("Redondear a");
await esperar(800);

// ── 2.quinquies · EL MARGEN NEGATIVO: TIPEADO FRENA, DERIVADO NO ─────────
//
// Las dos reglas se tocan y la pantalla es donde se juntan. Un "-20" escrito a
// mano es un tipeo y apaga el botón; el margen negativo que queda solo al
// escribir un precio por debajo del costo es el líder de pérdida, y se publica.
await escribir("Margen sobre el costo", "-20");
await afirmar(
  await hayTexto("no puede ser negativo"),
  "un margen negativo TIPEADO se frena en el campo"
);
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && b.disabled).length`)) === 1,
  "y apaga el botón: es la única validación que bloquea"
);
await foto(`oferta-margen-negativo-${ANCHO}`);

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

// ── EL REDONDEO ES HACIA ARRIBA, Y PUEDE CANCELAR LA OFERTA ─────────────
//
// `redondear100` es la regla del POS y redondea SIEMPRE hacia arriba. Sobre un
// precio de oferta eso tiene una consecuencia que no es obvia: un precio por
// debajo del normal puede volver AL normal y dejar de ser una oferta. Acá el
// producto vale $ 500 y escribir $ 450 termina cobrando $ 500.
//
// No es un defecto silencioso —la pantalla lo dice, y eso es lo que se afirma—
// pero SÍ es una trampa, y por eso queda escrita como candado: si algún día el
// redondeo pasa a ser hacia el más cercano o hacia abajo, este renglón se pone
// rojo y obliga a decidirlo a propósito.
await escribir("Precio de oferta", String(Math.round(precioNormal * 0.9)));
await afirmar(
  await hayTexto("Redondeado de"),
  "el redondeo hacia arriba se declara"
);
await afirmar(
  await hayTexto("no es una oferta"),
  `redondeado hacia arriba, ${Math.round(precioNormal * 0.9)} vuelve a ${precioNormal} y la pantalla avisa que dejó de ser oferta`
);
await afirmar(
  (await evaluar(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Publicar/.test(b.textContent) && b.disabled).length`)) === 1,
  "y no se puede publicar algo que no baja el precio"
);
await foto(`oferta-redondeo-cancela-${ANCHO}`);

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
//
// Y SE APAGA EL REDONDEO ANTES, por lo que se acaba de medir arriba: con el
// redondeo puesto no hay ningún precio por debajo de $ 500 que siga estando por
// debajo de $ 500 después de redondear, así que el caso sería inalcanzable y
// este candado quedaría verde sin probar nada. Apagarlo es lo que haría
// cualquiera que quiera cobrar exactamente lo que escribió.
await tocarInterruptor("Redondear a");
await esperar(800);
await escribir("Precio de oferta", String(Math.round(precioNormal * 0.9)));
await afirmar(await hayTexto("a pérdida"), "bajo costo se avisa con todas las letras");
// Y SE DICE CUÁNTO FALTA, EN PESOS. El bloque viejo lo decía en su segunda
// línea; al rediseñarlo ese renglón desapareció y este candado quedó rojo. Se
// reescribió el renglón, no el candado: sin el número, "a pérdida" no dice de
// qué tamaño es la pérdida y hay que ir a hacer la cuenta a otro lado.
// El número que se afirma es el que sale de la resta, no "hay un número": con
// el redondeo apagado el precio que se cobra es el tipeado, así que lo que falta
// para cubrir el costo es exactamente `costo − precio`.
const faltante = await evaluar(
  `(document.body.innerText.match(/te falta \\$ ([\\d.,]+) para cubrir el costo/) || [])[1] || ""`
);
const faltanteEsperado = arranque.costo - Math.round(precioNormal * 0.9);
await afirmar(
  Math.abs(Number(faltante.replace(/\./g, "").replace(",", ".")) - faltanteEsperado) < 0.02,
  `y se dice CUÁNTO falta: la pantalla dice $ ${faltante} y la resta da ${faltanteEsperado}`
);
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

// ── 6 · EL AVISO DE STOCK SIGUE LA CONFIGURACIÓN DEL LOCAL ───────────────
//
// No se afirma "sale el aviso" ni "no sale": se afirma que la pantalla dibuja lo
// que la CONFIGURACIÓN decide. Se le pregunta al endpoint —el mismo que usó el
// buscador— si este local permite vender sin stock, y se compara contra lo que
// el navegador está mostrando. Así el candado sirve con cualquier configuración
// y no hay que fabricar una fila para que dé verde.
//
// ── Y ACÁ SE EJERCE UNA SOLA RAMA, A PROPÓSITO ──────────────────────────
//
// En la base de pruebas todos los productos tienen stock, así que lo que se
// mide desde el navegador es siempre el lado que NO dibuja el aviso. Eso solo
// no alcanza —sería un candado que no puede ponerse rojo—, y por eso la
// decisión se sacó a `avisaSinStock`, cuyas dos ramas se ejercen en los
// candados O18, O19 y O20. Acá se afirma la otra mitad, la que ningún candado
// puede afirmar: que la pantalla LLAMA a esa función con los datos del
// endpoint, en vez de decidir por su cuenta.
const stock = await evaluar(`(async () => {
  const nombre = document.querySelector('section .text-lg2')?.textContent || "";
  const r = await fetch('/api/ofertas/buscar-producto?q=' + encodeURIComponent(nombre) + '&destino=');
  const j = await r.json();
  const it = (j?.items || [])[0] || {};
  return {
    nombre,
    permite: it.permiteVenderSinStock === true,
    stock: Number(it.stock ?? 0),
    avisoDibujado: /no se puede vender en/.test(document.body.innerText),
    hubo: (j?.items || []).length > 0,
  };
})()`);
await afirmar(stock.hubo, `el endpoint contestó por «${stock.nombre}»`);
const avisoEsperado = !stock.permite && stock.stock <= 0;
await afirmar(
  stock.avisoDibujado === avisoEsperado,
  `el aviso de stock sigue a la configuración: permiteVenderSinStock=${stock.permite}, stock=${stock.stock}, esperado=${avisoEsperado}, dibujado=${stock.avisoDibujado}`
);

// ── 7 · LO QUE SE ESTABA CARGANDO SOBREVIVE AL REFRESH ───────────────────
//
// Es lo único de esta pantalla que no se puede probar sin recargar de verdad, y
// por eso va último: la recarga se lleva puesto todo lo anterior.
const antesDeRecargar = await evaluar(leerCampos);
await abrir("/modulos/ofertas/nueva", "Nueva oferta");

await afirmar(
  await hayTexto("Tenés una oferta a medio armar"),
  "al volver, el cartel avisa que había algo a medio cargar"
);
await afirmar(
  await hayTexto(antesDeRecargar.nombre || stock.nombre),
  "y el cartel nombra el producto, para saber cuál quedó a medias"
);

// EL CARTEL VA ADENTRO DEL ENCABEZADO, NO DEL CUERPO QUE SCROLLEA. Si estuviera
// adentro del contenedor con scroll, se iría de la vista al bajar y el aviso no
// serviría de nada. Se mide en el navegador: `closest` sobre el contenedor que
// scrollea contesta por la cadena real de padres, no por la clase escrita.
const dondeVaElCartel = await evaluar(`(() => {
  const nodos = [...document.querySelectorAll('div')]
    .filter((d) => d.offsetParent !== null && /Tenés una oferta a medio armar/.test(d.innerText));
  const cartel = nodos[nodos.length - 1];
  if (!cartel) return { hay: false };
  return {
    hay: true,
    dentroDelScroll: !!cartel.closest('.overflow-y-auto'),
  };
})()`);
await afirmar(dondeVaElCartel.hay, "se encontró el cartel en el DOM");
await afirmar(
  dondeVaElCartel.dentroDelScroll === false,
  "el cartel está en el ENCABEZADO: no vive adentro del contenedor que scrollea"
);
await foto(`oferta-cartel-en-curso-${ANCHO}`);

// Y lo guardado se repone TAL CUAL. No se restaura solo: la persona decide.
await tocar("Retomar");
await esperar(2000);
const repuesto = await evaluar(leerCampos);
await afirmar(
  repuesto.margen === antesDeRecargar.margen && repuesto.precio === antesDeRecargar.precio,
  `lo guardado vuelve tal cual: margen «${antesDeRecargar.margen}»→«${repuesto.margen}», precio «${antesDeRecargar.precio}»→«${repuesto.precio}»`
);
await afirmar(
  !(await hayTexto("Tenés una oferta a medio armar")),
  "y el cartel se va: ya se retomó"
);
await afirmar(
  await hayTexto("Precio normal"),
  "el producto se volvió a pedir al servidor, con su costo y su precio de HOY"
);
await foto(`oferta-retomada-${ANCHO}`);

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
if (desbordes > 0) process.exitCode = 1;
process.exit(process.exitCode || 0);
