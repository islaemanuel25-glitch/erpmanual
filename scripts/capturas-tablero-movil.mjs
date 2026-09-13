// LA LISTA DE TRABAJO DE TRANSFERENCIAS, ABIERTA EN UN NAVEGADOR DE VERDAD.
//
//   node scripts/capturas-tablero-movil.mjs --base http://localhost:3210 \
//     --chrome /usr/bin/chromium --salida /tmp/capturas-tablero \
//     --usuario 4 --deposito 3 --local 4
//
// ── POR QUÉ NO SE REUSA `capturas-recepcion-movil.mjs` ───────────────────
//
// Aquél ejerce UNA secuencia —abrir una transferencia, tocar Coincide, mover el
// contador, elegir motivo— y tiene 800 líneas que saben de esa pantalla: las
// cajas del campo con pasos, el desplegable de motivo, la hoja de corrección.
// Acá la pregunta es otra: tres pantallas nuevas, dos vistas que dependen de
// QUIÉN mira, y una configuración que se guarda. Meterlo adentro habría dejado
// aquél con un segundo modo que no comparte nada con el primero.
//
// Lo que sí se reusa es el MECANISMO, copiado tal cual: CDP sin dependencias
// nuevas, la sesión firmada con el `AUTH_SECRET` de esta instancia descartable,
// y la regla de que cada captura afirma ANTES qué tiene que haber en pantalla.
//
// ── UNA PÁGINA DE ERROR SE FOTOGRAFÍA IGUAL DE BIEN ─────────────────────
//
// Por eso ninguna foto sale sin que antes se haya comprobado un texto que solo
// puede estar si la pantalla cargó. Tres fotos idénticas de un cartel de error
// son perfectamente reproducibles y no prueban nada.
//
// ── Y ACÁ ADEMÁS SE ESCRIBE ─────────────────────────────────────────────
//
// El paso del corte de semana toca "Cambiar", elige un día y guarda. Eso
// persiste en `AcuerdoDepositoLocal`, así que este arnés corre SOLO contra la
// base descartable `erpazul_v15`. Nunca contra producción.
//
// Y por eso mismo: **se corre UNA vez por siembra.** La segunda corrida sobre la
// misma base encuentra el acuerdo ya guardado y falla en la primera afirmación
// —"la relación sin acuerdo se ve MARCADA"—, que es exactamente lo que tiene que
// hacer: la relación ya está configurada y la marca sería falsa. Volver a
// sembrar borra los dos locales y el acuerdo se va con ellos en cascada.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import jwt from "jsonwebtoken";

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE = arg("base", "http://localhost:3210");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/tmp/capturas-tablero");
const PUERTO = Number(arg("puerto-cdp", "9334"));
const SECRETO = process.env.AUTH_SECRET;
const USUARIO = Number(arg("usuario", "4"));
const DEPOSITO = Number(arg("deposito", "3"));
const LOCAL = Number(arg("local", "4"));
const ANCHO = Number(arg("ancho", "390"));
const ALTOS = arg("altos", "640,520,440").split(",").map(Number);

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}

const PERMISOS = [
  "transferencias.ver",
  "transferencias.recibir",
  "transferencias.crear",
  "productos.ver",
  "stock.ver",
];

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

/** El WebSocket de la PÁGINA, no el del navegador: `Page.enable` no existe allá. */
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
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 500) : '(sin body)'");
  throw new Error(`nunca apareció «${fragmento}». En pantalla había:\n${visto}`);
}

/**
 * EL RENGLÓN DEL SHELL: el título de la pantalla y, a su derecha, la acción que
 * la pantalla registró con `useAccionDePagina`.
 *
 * Se lee ese nodo y no el texto entero de la página por dos motivos. Uno: el
 * mismo título lo dibujan `Header` y `LayoutBase`, uno oculto según el ancho, y
 * buscar el texto suelto encontraría los dos. Dos: lo que hay que afirmar es
 * que el botón está EN ESE RENGLÓN, que es lo que ahorra el renglón propio —y
 * "el texto está en algún lado de la página" no lo contesta.
 */
const filaDelShell = () =>
  evaluar(`(() => {
    const n = [...document.querySelectorAll('div')]
      .filter((e) => e.className.includes('md:hidden') && e.className.includes('text-xl'))
      .find((e) => e.offsetParent !== null);
    return n ? n.innerText.replace(/\\s+/g, ' ').trim() : null;
  })()`);

const hayTexto = (fragmento) =>
  evaluar(`document.body ? document.body.innerText.includes(${JSON.stringify(fragmento)}) : false`);

let afirmaciones = 0;
let desbordes = 0;

async function afirmar(condicion, mensaje) {
  if (condicion) {
    afirmaciones++;
    console.log(`  ✓ ${mensaje}`);
    return;
  }
  const visto = await evaluar("document.body ? document.body.innerText.slice(0, 700) : '(sin body)'");
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
  const { data } = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  const archivo = path.join(SALIDA, `${nombre}.png`);
  fs.writeFileSync(archivo, Buffer.from(data, "base64"));
  console.log(
    `  ✓ ${path.basename(archivo)}  ${desborde === 0 ? "sin scroll horizontal" : `⚠ DESBORDA ${desborde}px`}`
  );
}

/** Toca el primer control VISIBLE cuyo texto contenga el fragmento. */
async function tocar(fragmento, { exacto = false } = {}) {
  const ok = await evaluar(`(() => {
    const objetivo = ${JSON.stringify(fragmento)};
    const nodos = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null);
    const texto = (n) => ((n.getAttribute('aria-label') || '') + ' ' + (n.textContent || '')).trim();
    const el = nodos.find((n) => ${exacto ? "texto(n) === objetivo" : "texto(n).includes(objetivo)"});
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) {
    const inventario = await evaluar(`(() => {
      const n = [...document.querySelectorAll('button, a, [role="button"]')].filter((e) => e.offsetParent !== null);
      return n.length + " tocables · " + n
        .filter((e) => (e.textContent || "").trim())
        .slice(0, 16)
        .map((e) => JSON.stringify((e.textContent || "").trim().slice(0, 40)))
        .join(", ");
    })()`);
    throw new Error(`no se encontró nada tocable con «${fragmento}».\n  ${inventario}`);
  }
  await esperar(900);
}

const url = new URL(BASE);

/**
 * Firma la sesión PARA UN LOCAL. Se llama dos veces: una como depósito y otra
 * como local, que es lo que hace que las dos vistas se puedan retratar en la
 * misma corrida — la vista la elige `Local.es_deposito` del local de la sesión.
 */
async function entrarComo(localId, etiqueta) {
  const token = jwt.sign(
    { id: USUARIO, nombre: "Capturas", email: "capturas@local", localId, permisos: PERMISOS },
    SECRETO,
    { expiresIn: "1h" }
  );
  await send("Network.setCookie", {
    name: "erpazul_sesion",
    value: token,
    domain: url.hostname,
    path: "/",
    httpOnly: true,
  });
  // El operador activo es otra puerta: sin él aparece "Ingresar", que se
  // fotografía igual de bien que la pantalla buena.
  const operador = jwt.sign(
    { operadorId: USUARIO, nombre: "Capturas", localId, _tipo: "operador" },
    SECRETO,
    { expiresIn: "1h" }
  );
  await send("Network.setCookie", {
    name: "erpazul_operador_activo",
    value: operador,
    domain: url.hostname,
    path: "/",
    httpOnly: true,
  });
  console.log(`\n▸ sesión firmada como ${etiqueta} (local ${localId})`);
}

/** Carga limpia: pasar por `about:blank` evita que la segunda vuelta quede vacía. */
async function abrir(ruta, textoEsperado) {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(400);
  await send("Page.navigate", { url: `${BASE}${ruta}` });
  await esperarTexto(textoEsperado, 45000);
  await esperar(800);
}

// ── ARRANQUE ─────────────────────────────────────────────────────────────
const perfil = fs.mkdtempSync("/tmp/cap-tablero-");
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

// ── 1 · LA VISTA DEL DEPÓSITO, EN LAS TRES ALTURAS ───────────────────────
await entrarComo(DEPOSITO, "DEPÓSITO");
for (const alto of ALTOS) {
  await medir(alto);
  await abrir("/modulos/transferencias", "Transferencias");
  await afirmar(await hayTexto("A pagar"), `${alto} · el bloque muestra el importe a pagar`);
  await afirmar(await hayTexto("Reporte"), `${alto} · el reporte sigue a un toque`);
  await afirmar(await hayTexto("Semana"), `${alto} · están los chips de período`);
  await foto(`v28-deposito-${ANCHO}x${alto}`);
}

// EL TÍTULO NO SE REPITE. La barra del shell ya dice "Transferencias"; cuando la
// pantalla lo escribía otra vez, los dos quedaban pegados en el texto de la
// página. Esta afirmación busca exactamente esa adyacencia.
await afirmar(
  !(await evaluar(
    "document.body.innerText.includes('Transferencias\\nTransferencias')"
  )),
  "el título de la pantalla no repite el de la barra"
);

// Y EL BOTÓN VIAJA EN ESE MISMO RENGLÓN, que es lo que hace que no cueste uno
// propio: el shell dibuja el título a la izquierda y la acción registrada a la
// derecha.
await afirmar(
  (await filaDelShell()) === "Transferencias Reporte",
  `el renglón del shell lleva el título y la acción (dice: ${JSON.stringify(await filaDelShell())})`
);

// LA ENTRADA PERMANENTE, en el menú y no solo en el aviso.
await afirmar(
  await evaluar(
    `!!document.querySelector('a[href="/modulos/transferencias/corte-de-semana"]')`
  ),
  "el menú ofrece «Corte de semana» aunque no falte configurar nada"
);

// La marca de "sin configurar", que es lo que Emanuel pidió ver.
await medir(ALTOS[0]);
await abrir("/modulos/transferencias", "Transferencias");
await afirmar(
  await hayTexto("Sin corte"),
  "la relación sin acuerdo se ve MARCADA en el renglón del local"
);
await afirmar(
  await hayTexto("sin corte configurado"),
  "y el aviso de arriba dice cuántas faltan, con el camino para arreglarlo"
);
await foto(`v28-sin-configurar-${ANCHO}`);

// El bloque abierto: la transferencia con su botón.
await tocar("A pagar");
await afirmar(await hayTexto("Recibir"), "al abrir el bloque, la pendiente ofrece recibirla");
await foto(`v28-bloque-abierto-${ANCHO}`);

// ── 2 · EL CORTE DE SEMANA: SE VE, SE CAMBIA Y SE GUARDA ─────────────────
await abrir("/modulos/transferencias/corte-de-semana", "Corte de semana");
await afirmar(await hayTexto("Sin configurar"), "la relación sin acuerdo llega marcada");
await afirmar(await hayTexto("Arranca"), "se ve qué día arranca hoy");
await foto(`v29-corte-${ANCHO}`);

// La barra del shell tiene que decir DÓNDE ESTÁS. Por ruta diría
// "Transferencias" —el módulo—, así que la pantalla registra el suyo.
await afirmar(
  (await filaDelShell())?.includes("Corte de semana"),
  `la barra de arriba dice «Corte de semana» y no el nombre del módulo (dice: ${JSON.stringify(await filaDelShell())})`
);

await tocar("Cambiar");
await afirmar(await hayTexto("Guardar"), "editando aparece el botón de guardar");
await afirmar(await hayTexto("Mié"), "y los siete chips de día");

// ── LA SEÑAL DE EDICIÓN, MEDIDA EN EL NAVEGADOR ─────────────────────────
//
// El candado afirma las CLASES; esto afirma lo que el navegador realmente
// computa. Son preguntas distintas: una clase puede estar y no llegar a
// `border-style` si otra regla de la misma familia le gana por orden de hoja.
const bordeEditando = await evaluar(`(() => {
  const fila = [...document.querySelectorAll('section')]
    .find((s) => s.className.includes('border-dashed'));
  if (!fila) return null;
  const cs = getComputedStyle(fila);
  return { estilo: cs.borderTopStyle, ancho: cs.borderTopWidth };
})()`);
await afirmar(
  bordeEditando && bordeEditando.estilo === "dashed",
  `la fila en edición se dibuja punteada (computado: ${JSON.stringify(bordeEditando)})`
);

await foto(`v29-editando-${ANCHO}`);

await tocar("Mié", { exacto: true });
await tocar("Guardar");
await esperar(1500);
await afirmar(
  !(await hayTexto("Sin configurar")),
  "guardado el acuerdo, la marca de 'sin configurar' DESAPARECE"
);
await afirmar(await hayTexto("Mié."), "y el día guardado es el que se tocó");
await foto(`v29-guardado-${ANCHO}`);

// Y el cambio se ve del otro lado: el rango del bloque tiene que haber cambiado.
await abrir("/modulos/transferencias", "Transferencias");
await afirmar(
  !(await hayTexto("Sin corte")),
  "la lista de trabajo ya no marca al local: el acuerdo quedó guardado"
);
await foto(`v28-ya-configurado-${ANCHO}`);

// ── 3 · LA VISTA DEL LOCAL ───────────────────────────────────────────────
await entrarComo(LOCAL, "LOCAL");
for (const alto of ALTOS) {
  await medir(alto);
  await abrir("/modulos/transferencias", "Transferencias");
  await afirmar(await hayTexto("A pagar esta semana"), `${alto} · la cuenta del local`);
  await afirmar(await hayTexto("PARA RECIBIR"), `${alto} · la sección de lo pendiente`);
  await foto(`v28b-local-${ANCHO}x${alto}`);
}

// ── 4 · Y EL ESCRITORIO NO SE MOVIÓ ──────────────────────────────────────
//
// La tanda envuelve el reporte de siempre en un `hidden lg:block`. A 1024 px o
// más eso es `display: block`, o sea exactamente lo que era — pero eso es un
// razonamiento, y acá se comprueba: a 1366 tiene que verse el reporte y NO la
// lista de trabajo. Sin esto, un error de tipeo en la clase dejaría la pantalla
// de escritorio en blanco y nadie se enteraría desde el teléfono.
await entrarComo(DEPOSITO, "DEPÓSITO (escritorio)");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1366,
  height: 768,
  deviceScaleFactor: 1,
  mobile: false,
});
await abrir("/modulos/transferencias", "Generar reporte");
await afirmar(
  await hayTexto("Historial de transferencias entre Depósito y Locales"),
  "1366 · el reporte de escritorio sigue siendo lo que se dibuja"
);
await afirmar(
  !(await hayTexto("A pagar")),
  "1366 · y la lista de trabajo NO se cuela en el escritorio"
);
await foto("escritorio-1366");

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
if (desbordes > 0) process.exitCode = 1;
process.exit(process.exitCode || 0);
