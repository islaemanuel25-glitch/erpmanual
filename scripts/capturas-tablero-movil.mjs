// LA LISTA DE TRABAJO DE TRANSFERENCIAS, ABIERTA EN UN NAVEGADOR DE VERDAD.
//
//   node scripts/capturas-tablero-movil.mjs --base http://localhost:3210 \
//     --chrome /usr/bin/chromium --salida /tmp/capturas-tablero \
//     --usuario 4 --deposito 3 --local 4 --recibida-cerrada 12
//
// Los cuatro números los imprime la siembra. `--recibida-cerrada` es el de la
// transferencia que cae en el PERÍODO CERRADO, que desde la tercera vuelta es
// el que la pantalla muestra.
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
// El número de la recibida QUE CAE EN EL PERÍODO CERRADO. Lo imprime la siembra.
// Sin él el buscador se ejerce a medias: se puede comprobar que un número
// inventado no aparece, que es el caso fácil, y no que el verdadero filtre.
const RECIBIDA_CERRADA = Number(arg("recibida-cerrada", "0"));
const ANCHO = Number(arg("ancho", "390"));
const ALTOS = arg("altos", "640,520,440").split(",").map(Number);

// La ruta propia del tablero. Antes vivía en `/modulos/transferencias`, bajo un
// `lg:hidden`, compartiendo archivo con el reporte de escritorio.
const RUTA_CUENTA_MOVIL = "/modulos/transferencias/cuenta";

if (!SECRETO) {
  console.error("ABORTADO: falta AUTH_SECRET; sin eso no se puede firmar la sesión.");
  process.exit(2);
}

// SE ABORTA, no se saltea el paso. Un arnés que mide de menos cuando le falta un
// argumento informa verde con menos afirmaciones y nadie lo nota.
if (!RECIBIDA_CERRADA) {
  console.error(
    "ABORTADO: falta --recibida-cerrada <id>. Lo imprime la siembra, en la línea «recibida con diferencia»."
  );
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

/** Cuántas relaciones están marcadas como sin configurar, AHORA y en pantalla. */
const marcasSinConfigurar = () =>
  evaluar(
    `(document.body.innerText.match(/Sin configurar/g) || []).length`
  );

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

// ── NINGUNA SUPERFICIE DEL COLOR DE AQUELLO SOBRE LO QUE SE APOYA ────────
//
// ── POR QUÉ SE MIDE EL PADRE Y NO LA PÁGINA ──────────────────────────────
//
// El defecto del 2026-09-14 —la tarjeta de local pintada con `sunmi-surface`,
// que es `--app-bg`— se descubrió comparando la tarjeta contra la PÁGINA. Pero
// esa comparación solo sirve para lo que está apoyado en la página.
//
// En el repo hay 82 lugares con esa clase y NO todos son tarjetas: hay azulejos,
// chips y solapas que viven ADENTRO de una tarjeta, y ahí `--app-bg` es el
// contraste correcto contra `--card-bg`. Cambiarlos los haría desaparecer: el
// mismo defecto al revés.
//
// Lo que distingue un caso del otro no está en la clase, está en QUÉ TIENE
// ARRIBA. Por eso se busca el primer ancestro que realmente pinta algo y se
// compara contra ése. La regla queda igual de simple y sirve para los dos:
// **nada puede ser del color de aquello sobre lo que está apoyado.**
//
// Se excluye lo que flota —`fixed`, `absolute`, `sticky`— porque ahí la
// separación la dan la sombra y el borde, y además esas superficies necesitan
// ser OPACAS: `--card-bg` es translúcido en dos de los catorce temas y dejaría
// leer el texto de abajo. Es el defecto ya documentado de `.sunmi-select-dropdown`.
async function superficiesPegadasAlFondo() {
  return evaluar(`(() => {
    const transparente = (c) => !c || c === "rgba(0, 0, 0, 0)" || c === "transparent";
    const flota = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        if (p === "fixed" || p === "absolute" || p === "sticky") return true;
      }
      return false;
    };
    const salida = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.offsetParent === null) continue;
      const cls = typeof el.className === "string" ? el.className : "";
      if (!/(^|\\s)sunmi-surface(\\s|$)/.test(cls)) continue;
      if (flota(el)) continue;
      const propio = getComputedStyle(el).backgroundColor;
      if (transparente(propio)) continue;
      let padre = null, fondoPadre = null;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (!transparente(c)) { padre = n; fondoPadre = c; break; }
      }
      if (!fondoPadre) { padre = document.body; fondoPadre = getComputedStyle(document.body).backgroundColor; }
      if (propio !== fondoPadre) continue;
      salida.push({
        clases: cls.replace(/\\s+/g, " ").slice(0, 70),
        texto: (el.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 40),
        fondo: propio,
        apoyadoEn: padre === document.body ? "la página" : (typeof padre.className === "string" ? padre.className : "").slice(0, 40),
      });
    }
    return salida;
  })()`);
}

/** De qué piezas está hecha la cuenta, para comparar las dos entradas. */
const piezasDeLaCuenta = () =>
  evaluar(`(() => {
    const hay = (t) => document.body.innerText.includes(t);
    return {
      navegador: !!document.querySelector('[aria-label="Período anterior"]'),
      chips: ["Día","Semana","Mes"].filter((c) =>
        [...document.querySelectorAll('button')].some((b) => (b.textContent||"").trim() === c)).length,
      paraCobrar: hay("Para cobrar") || hay("Va acumulado"),
      buscador: [...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).length,
      secciones: hay("PARA RECIBIR") || hay("YA RECIBIDAS"),
    };
  })()`);

/** El período que se está mirando y qué trae, para comparar antes y después. */
const estadoDelPeriodo = () =>
  evaluar(`(() => {
    const t = document.body.innerText;
    const imp = t.match(/\\$ [\\d.,]+/);
    const nav = document.querySelector('[aria-label="Período anterior"]')?.parentElement;
    return {
      subtitulo: nav ? nav.innerText.replace(/\\s+/g, " ").trim() : null,
      importe: imp ? imp[0] : null,
      filas: document.querySelectorAll('[class*="sunmi-bg-card"]').length,
    };
  })()`);

/** Se llama en cada pantalla, con su nombre para que el rojo diga DÓNDE. */
async function afirmarSuperficies(pantalla) {
  const pegadas = await superficiesPegadasAlFondo();
  await afirmar(
    pegadas.length === 0,
    `${pantalla} · ninguna superficie es del color de aquello sobre lo que se apoya` +
      (pegadas.length ? `\n  PEGADAS: ${JSON.stringify(pegadas, null, 2)}` : "")
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

// ── 1 · LA ENTRADA DEL DEPÓSITO, EN LAS TRES ALTURAS ─────────────────────
//
// Desde la TERCERA vuelta esta pantalla es SOLO la lista de locales. Lo que
// antes se afirmaba acá —el importe, los chips de período— ahora vive adentro
// del local, y por eso las afirmaciones de abajo son en NEGATIVO: que nada de
// eso esté. Un chip de período arriba de la pantalla tendría que elegir UN
// período para todos los locales, y cada uno corta su semana el día que acordó.
await entrarComo(DEPOSITO, "DEPÓSITO");
for (const alto of ALTOS) {
  await medir(alto);
  await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
  await afirmar(await hayTexto("Local V15"), `${alto} · la entrada lista los locales`);
  await afirmar(await hayTexto("Reporte"), `${alto} · el reporte sigue a un toque`);
  await afirmar(
    !(await hayTexto("A pagar")),
    `${alto} · la entrada NO muestra importes: un importe es siempre el de UN período, y acá no hay ninguno elegido`
  );
  await foto(`v40-entrada-${ANCHO}x${alto}`);
}

await medir(ALTOS[0]);
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");

// NI CHIPS NI BUSCADOR. Se pregunta por los CONTROLES y no por el texto: la
// palabra "semana" aparece igual en el aviso del corte, así que buscarla en el
// `innerText` daría un falso rojo — y peor, buscar "Semana" con mayúscula daría
// un falso VERDE el día que el chip vuelva escrito distinto.
const controlesDePeriodo = await evaluar(`(() => {
  const chips = ["Día", "Semana", "Mes", "Otro"];
  return [...document.querySelectorAll('button, [role="button"]')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => (n.textContent || "").trim())
    .filter((t) => chips.includes(t));
})()`);
await afirmar(
  Array.isArray(controlesDePeriodo) && controlesDePeriodo.length === 0,
  `la entrada no tiene chips de período (encontrados: ${JSON.stringify(controlesDePeriodo)})`
);
await afirmar(
  (await evaluar(
    `[...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).length`
  )) === 0,
  "la entrada no tiene buscador: el número sirve cuando ya se sabe cuál se busca, y eso pasa adentro de un local"
);
await afirmar(
  !(await hayTexto("PARA RECIBIR")),
  "la entrada no lista transferencias"
);

// ── EL RÓTULO DE LA LISTA ────────────────────────────────────────────────
await afirmar(await hayTexto("LOCALES"), "la lista está rotulada");

// ── LA TARJETA NO ES DEL COLOR DE LA PÁGINA ──────────────────────────────
//
// El defecto, visto en el teléfono el 2026-09-14: la tarjeta usaba
// `sunmi-surface`, que pinta `--app-bg` —el fondo de la APLICACIÓN—, así que
// salía exactamente del color de la página y lo único que la separaba era el
// borde.
//
// Se comparan los fondos COMPUTADOS, no las clases: el candado ya afirma la
// clase, y ésta es la otra pregunta —si el navegador termina pintando dos
// colores distintos—. Una clase puede estar y no llegar al fondo si otra le
// gana por orden de hoja.
//
// SE PRUEBA EN LOS CATORCE TEMAS, y no solo en el que trae el arnés: el defecto
// se reportó en el crema, donde los dos tonos son casi el mismo, pero la causa
// era de todos. Un tema solo no distingue "lo arreglé" de "en éste no se nota".
const TEMAS = [
  "sunmiDark", "sunmiDarkCompact", "sunmiLight", "sunmiGraphite", "sunmiSand",
  "sunmiBlueClassic", "sunmiFrance", "sunmiFranceSplit", "operixBluePro",
  "operixNight", "verdeComercio", "grafitoEjecutivo", "ambarCaja", "violetaSaas",
];
const fondosPorTema = [];
for (const tema of TEMAS) {
  await evaluar(`document.documentElement.setAttribute("data-theme", ${JSON.stringify(tema)})`);
  await esperar(150);
  const medida = await evaluar(`(() => {
    const tarjeta = [...document.querySelectorAll('[aria-label]')]
      .find((n) => (n.getAttribute('aria-label') || '').startsWith('Abrir Local'));
    if (!tarjeta) return null;
    return {
      tarjeta: getComputedStyle(tarjeta).backgroundColor,
      pagina: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  fondosPorTema.push({ tema, ...(medida || {}) });
}
const pegados = fondosPorTema.filter((f) => !f.tarjeta || f.tarjeta === f.pagina);
const crema = fondosPorTema.find((f) => f.tema === "ambarCaja");
await afirmar(
  pegados.length === 0,
  `la tarjeta tiene fondo propio en los ${TEMAS.length} temas (crema: tarjeta ${crema?.tarjeta} sobre página ${crema?.pagina})`
);

// La foto va en el tema CREMA, que es donde se reportó: ahí `--app-bg` es
// `#FFFBEB` y `--card-bg` es `#FFFFFF`, o sea el caso donde los dos tonos están
// más cerca y donde un fondo mal puesto se ve como una tarjeta que no existe.
await evaluar(`document.documentElement.setAttribute("data-theme", "ambarCaja")`);
await esperar(300);
await foto(`v41-entrada-crema-${ANCHO}`);
await evaluar(`document.documentElement.removeAttribute("data-theme")`);
await esperar(150);

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

// ── TODOS LOS LOCALES, TENGAN O NO MOVIMIENTO ───────────────────────────
//
// El sembrado crea dos locales y le manda transferencias a UNO solo. Antes del
// 2026-09-13 el otro no aparecía, y con él se iba su marca de "sin corte": el
// aviso de arriba contaba los locales de la lista, así que informaba uno de dos.
await afirmar(
  await hayTexto("Local V15 sin movimiento"),
  "el local que no recibió nada aparece igual: si no, no hay forma de saber que existe"
);

// ── EL ORDEN ES SIEMPRE EL MISMO ─────────────────────────────────────────
//
// En producción la lista arrancaba por "Casiano casas" en una carga y por
// "mini el 7" en la siguiente: `grupoLocal` se consultaba sin `orderBy`, así que
// el orden lo elegía el plan de Postgres.
//
// Se compara contra una SEGUNDA carga y no contra una lista escrita a mano: lo
// que se afirma es que no se mueve, y eso solo se ve mirando dos veces.
const ordenDeLosLocales = () =>
  evaluar(`[...document.querySelectorAll('[aria-label]')]
     .filter((n) => (n.getAttribute('aria-label') || '').startsWith('Abrir '))
     .map((n) => n.getAttribute('aria-label'))`);

const orden1 = await ordenDeLosLocales();
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
const orden2 = await ordenDeLosLocales();
await afirmar(
  JSON.stringify(orden1) === JSON.stringify(orden2),
  `la lista no se mueve entre dos cargas (${JSON.stringify(orden1)})`
);
// Y es alfabético: "Local V15" antes que "Local V15 sin movimiento".
await afirmar(
  JSON.stringify(orden1) ===
    JSON.stringify(["Abrir Local V15", "Abrir Local V15 sin movimiento"]),
  `y el orden es el alfabético (${JSON.stringify(orden1)})`
);
// ── EL AVISO CUENTA AL QUE NO TUVO MOVIMIENTO, Y ESO ES LO QUE AFIRMA ───
//
// Decía "Hay 2 locales sin corte configurado", con el número escrito. El
// sembrado pasó a configurarle el corte a "Local V15" —hay un acuerdo suyo en
// `AcuerdoDepositoLocal`— así que hoy el aviso cuenta UNO.
//
// El número era incidental: lo que este chequeo defiende es que el aviso NO mire
// solo a los locales que movieron algo. Con el sembrado de hoy se ve MEJOR que
// antes, porque el único que cuenta es justamente el que no tuvo movimiento.
//
// El paso de arriba RECARGA la lista dos veces, así que primero hay que esperar
// a que vuelva a dibujarse: sin eso se mide una pantalla a medio montar.
await esperarTexto("LOCALES", 20000);
const textoDelAviso = await evaluar(`(() => {
  const l = document.body.innerText.split("\\n").find((x) => x.includes("sin corte configurado"));
  return l || "";
})()`);
await afirmar(Boolean(textoDelAviso), `el aviso de corte está (${textoDelAviso})`);
const sinCorte = Number(textoDelAviso.replace(/[^0-9]/g, "").slice(0, 2)) || 0;
const localesListados = await evaluar(
  `document.querySelectorAll('[aria-label^="Abrir Local"]').length`
);
await afirmar(
  sinCorte >= 1 && sinCorte <= localesListados,
  `el aviso cuenta entre 1 y los ${localesListados} locales listados (dice ${sinCorte})`
);
await afirmar(
  await hayTexto("Local V15 sin movimiento"),
  "y el local SIN MOVIMIENTO está listado: el aviso no mira solo a los que movieron"
);

// ── EL QUE NO OPERA POR TRANSFERENCIA NO ESTÁ ───────────────────────────
//
// El sembrado crea un tercer local, activo y en el grupo, pero SIN cliente
// vinculado. A ése se le VENDE y nada más, así que esta pantalla no tiene nada
// que decirle — y por eso tampoco entra en la cuenta del aviso, que dice DOS.
await afirmar(
  !(await hayTexto("Local V15 sin vínculo")),
  "apareció un local sin cliente vinculado: a ése se le vende, no se le transfiere"
);

// EL ORDEN YA NO ES POR IMPORTE, y no puede serlo: no hay importe en esta
// pantalla. Lo que se afirma es que los dos están y que el que no opera por
// transferencia no.
await afirmar(
  await hayTexto("sin corte configurado"),
  "el aviso de arriba dice cuántas faltan, con el camino para arreglarlo"
);
await foto(`v40-sin-configurar-${ANCHO}`);
await afirmarSuperficies("entrada");

// ── LA FACHADA: LA QUE DICE LA FUNCIÓN, Y LA MISMA ENTRE CORRIDAS ────────
//
// ── POR QUÉ ACÁ NO SE AFIRMA QUE LOS DOS LOCALES DIFIERAN ────────────────
//
// Sería una afirmación falsa, y la primera versión de este arnés la tenía. Hay
// CUATRO paletas: dos nombres cualesquiera pueden caer en la misma sin que nada
// esté roto, y los dos del sembrado —"Local V15" y "Local V15 sin movimiento"—
// caen los dos en verde. Medido. Exigir que difieran habría obligado a
// renombrar un local del sembrado para que la foto saliera linda, que es
// exactamente lo que no se hace.
//
// Que la paleta REPARTA se mide donde se puede medir de verdad: en el candado
// V4, contra los CUATRO nombres reales de producción, que tienen que dar cuatro
// paletas distintas. Ahí fue donde se encontró el defecto del hash.
//
// Lo que sí se afirma acá, y es el contrato de esta pantalla: que el navegador
// dibuje LA PALETA QUE LA FUNCIÓN DECIDE para ese nombre. Se importa la misma
// función que usa el componente —no se copia la tabla de colores— así que si
// mañana cambia la derivación, esto la sigue.
const { paletaDelLocal } = await import("../lib/transferencias/fachadaDelLocal.js");

// Se mide el color de los rellenos del SVG: lo que importa es lo que el
// navegador dibuja, no el nombre de la paleta.
const paletaEnPantalla = () =>
  evaluar(`(() => {
    const firma = (nombre) => {
      const tarjeta = [...document.querySelectorAll('[aria-label]')]
        .find((n) => n.getAttribute('aria-label') === 'Abrir ' + nombre);
      if (!tarjeta) return null;
      const svg = tarjeta.querySelector('svg');
      if (!svg) return null;
      return [...svg.querySelectorAll('*')]
        .map((e) => e.getAttribute('fill') || '')
        .filter(Boolean)
        .join('|');
    };
    return {
      conMovimiento: firma('Local V15'),
      sinMovimiento: firma('Local V15 sin movimiento'),
    };
  })()`);

const fachadas = await paletaEnPantalla();
await afirmar(
  fachadas && fachadas.conMovimiento && fachadas.sinMovimiento,
  `cada local dibuja su fachada (${JSON.stringify(fachadas).slice(0, 160)})`
);
for (const [clave, nombre] of [
  ["conMovimiento", "Local V15"],
  ["sinMovimiento", "Local V15 sin movimiento"],
]) {
  const esperada = paletaDelLocal(nombre);
  await afirmar(
    fachadas[clave].includes(esperada.toldoA) && fachadas[clave].includes(esperada.cartel),
    `«${nombre}» se dibuja con la paleta ${esperada.nombre}, que es la que su nombre decide`
  );
}

// Estable entre corridas: se recarga la pantalla entera y tiene que dar lo
// mismo. Con un color al azar esto sería rojo, y un color al azar es peor que
// no tener color.
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
const fachadasOtraVez = await paletaEnPantalla();
await afirmar(
  fachadasOtraVez.conMovimiento === fachadas.conMovimiento &&
    fachadasOtraVez.sinMovimiento === fachadas.sinMovimiento,
  "la fachada de un local es la MISMA entre dos cargas de la pantalla"
);

// ── 1.bis · ADENTRO DEL LOCAL ────────────────────────────────────────────
//
// Se entra por el `aria-label` EXACTO y no por el texto: "Local V15" es un
// prefijo de "Local V15 sin movimiento", así que tocar por texto entraría al
// que quedó primero en el DOM y la corrida mediría otro local sin avisar.
async function entrarAlLocal(nombre) {
  const ok = await evaluar(`(() => {
    const el = [...document.querySelectorAll('button, a, [role="button"]')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => n.getAttribute('aria-label') === ${JSON.stringify(`Abrir ${nombre}`)});
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró la tarjeta de «${nombre}» por su aria-label`);
  await esperarTexto("Para cobrar", 30000);
  await esperar(900);
}

// ═══════════════════════════════════════════════════════════════════════════
// VOLVER AL MISMO LUGAR
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL DEFECTO, CON SU NÚMERO ───────────────────────────────────────────
//
// Entrar a una transferencia desde un período pasado y volver caía SIEMPRE en el
// período de hoy: el local, el chip y el desplazamiento se perdían. Con 33
// transferencias sin recibir de una semana pasada, eso es renavegar 33 veces.
//
// ── POR QUÉ SE MIDE ACÁ Y NO CON UN CANDADO ─────────────────────────────
//
// Porque vive en la NAVEGACIÓN. `contextoDelTablero.test.mjs` afirma que la URL
// se arma y se lee bien —15 candados— y eso no dice nada sobre si la pantalla la
// usa, si "Volver" va al lado correcto, ni cuántas entradas deja el historial.
// Un candado de render tampoco: la pantalla se ve igual.

await medir(ALTOS[0]);

// ── 0 · LA RUTA VIEJA SIGUE LLEVANDO ACÁ ───────────────────────────────
//
// El tablero se mudó, pero el menú y cualquier atajo guardado apuntan a
// `/modulos/transferencias`. En un teléfono esa ruta redirige, y con `replace`:
// es un puente, no un lugar al que volver con el back.
await abrir("/modulos/transferencias", "LOCALES");
await afirmar(
  (await evaluar("location.pathname")) === RUTA_CUENTA_MOVIL,
  `la ruta vieja redirige al tablero (quedó en ${await evaluar("location.pathname")})`
);

// ── Y EL RESTO SE MIDE EN LA CUENTA DE UN LOCAL ────────────────────────
//
// El navegador de período y las transferencias viven ahí. La cuenta del
// DEPÓSITO es la lista de locales: no tiene chips ni flechas, a propósito —cada
// local corta su semana el día que acordó, así que un período global tendría que
// elegir uno y sería el equivocado para alguien—.
const RUTA_DEL_LOCAL = `/modulos/transferencias/local/${LOCAL}`;

// ── 1 · DIEZ FLECHAS, UNA SOLA ENTRADA EN EL HISTORIAL ──────────────────
// ── SE ARRANCA HONDO Y SE AVANZA ────────────────────────────────────────
//
// La flecha de ATRÁS la deshabilita el servidor cuando no hay más datos hacia
// atrás —`puedeRetroceder`— y con el sembrado de una sola transferencia eso
// pasa enseguida. Medido: en el período cerrado la flecha llega `disabled`.
//
// Así que se entra por URL a un período hondo, donde avanzar SÍ está permitido,
// y se aprieta diez veces la de adelante. Se mide lo mismo —diez toques, una
// entrada— con el control que de verdad se puede usar.
await abrir(`${RUTA_DEL_LOCAL}?desp=-11`, "Semana");
await afirmar(
  (await evaluar("location.search")).includes("desp=-11"),
  "se entró por URL a un período hondo, que es lo que hace usable la flecha de adelante"
);

// ── NUEVE Y NO DIEZ, Y EL MOTIVO ES DE DISEÑO ───────────────────────────
//
// Diez avances desde -11 llegan a -1, que es el período POR DEFECTO — y los
// defaults no se escriben en la URL, a propósito: `?desp=-1` dice lo mismo que
// la URL pelada y se vería como si alguien hubiera navegado.
//
// La primera versión de esta afirmación pedía `desp=-1` en la barra y daba rojo
// sobre un comportamiento correcto. Con nueve se llega a -2, que sí deja rastro,
// y se sigue midiendo lo mismo.
const largoInicial = await evaluar("history.length");
for (let i = 0; i < 9; i++) {
  await tocar("Período siguiente");
}
const largoDespues = await evaluar("history.length");
await afirmar(
  largoDespues === largoInicial,
  `nueve flechas dejan UNA entrada en el historial (antes ${largoInicial}, después ${largoDespues})`
);

// Y el período SÍ se movió nueve. Sin esto, un botón que no hace nada daría el
// mismo "una entrada" y el candado pasaría sobre una pantalla que no navega.
const urlTrasFlechas = await evaluar("location.pathname + location.search");
await afirmar(
  urlTrasFlechas.includes("desp=-2"),
  `y el período avanzó nueve, de -11 a -2: la URL dice ${urlTrasFlechas}`
);

// ── 2 · ENTRAR A UNA TRANSFERENCIA Y VOLVER ─────────────────────────────
//
// EL PERÍODO SE BUSCA, NO SE SUPONE. El sembrado pone la transferencia en una
// fecha fija, así que según qué día se corra el arnés cae en el período abierto
// o en el cerrado. Suponer uno hacía que la prueba fallara los días equivocados
// por un motivo que no es el suyo.
let despDePrueba = null;
for (const d of [0, -1, -2, -3]) {
  await abrir(`${RUTA_DEL_LOCAL}?desp=${d}`, "Semana");
  const hay = await evaluar(
    `[...document.querySelectorAll('button')].filter((n) => n.offsetParent !== null && /Recibir|Ver /.test(n.textContent || '')).length`
  );
  if (hay > 0) { despDePrueba = d; break; }
}
await afirmar(
  despDePrueba !== null,
  "se encontró un período con transferencias para ejercer la vuelta"
);
await abrir(`${RUTA_DEL_LOCAL}?desp=${despDePrueba}`, "Semana");
const urlAntes = await evaluar("location.pathname + location.search");
// EL RANGO SE LEE COMO SE ESCRIBE, y esto costó una corrida: la primera versión
// buscaba `dd/mm` y la pantalla dice «mié 24 al mar 30 de junio». No hay barras
// en ningún lado, así que la lectura volvía vacía y el rojo no era del período
// sino del lector.
const leerRango = () =>
  evaluar(
    `(() => { const l = document.body.innerText.split("\\n").find((x) => /\\d{1,2} (al|de) /.test(x)); return l || ""; })()`
  );
const rangoAntes = await leerRango();
await afirmar(Boolean(rangoAntes), `se pudo leer el rango del período (${rangoAntes})`);

// La fila de una transferencia NO tiene `aria-label`: es un botón entero, y el
// texto que la distingue es "Recibir" o "Ver ›".
const entro = await evaluar(`(() => {
  const t = [...document.querySelectorAll('button')]
    .filter((n) => n.offsetParent !== null)
    .find((n) => /Recibir|Ver /.test(n.textContent || ''));
  if (!t) return false;
  t.click();
  return true;
})()`);
await afirmar(entro, "se pudo entrar a una transferencia desde el tablero");
await esperar(2500);

const urlQueQuedo = await evaluar("location.pathname + location.search");
await afirmar(
  /\/modulos\/transferencias\/\d+/.test(urlQueQuedo),
  `se abrió el detalle (${urlQueQuedo})`
);
await afirmar(
  urlQueQuedo.includes("tab=1"),
  `y se llevó la marca del tablero, que es lo que decide a dónde vuelve (${urlQueQuedo})`
);

await tocar("Volver");
await esperar(2500);
const urlDespues = await evaluar("location.pathname + location.search");
const rangoDespues = await leerRango();
await afirmar(
  urlDespues === urlAntes,
  `volver deja la MISMA url (antes ${urlAntes}, después ${urlDespues})`
);
await afirmar(
  rangoDespues === rangoAntes,
  `y el MISMO período (antes «${rangoAntes}», después «${rangoDespues}»)`
);
await foto(`volver-al-mismo-lugar-${ANCHO}`);

// ── 3 · Y DESDE UN PERÍODO PASADO DE VERDAD ─────────────────────────────
await abrir(`${RUTA_DEL_LOCAL}?desp=-3`, "Semana");
const rangoLejano = await leerRango();
await afirmar(
  rangoLejano !== rangoAntes,
  `tres períodos atrás es OTRO rango («${rangoLejano}» contra «${rangoAntes}»)`
);
await afirmar(
  (await evaluar("location.search")).includes("desp=-3"),
  "y la URL lo dice, así que el enlace se puede compartir"
);

// ── SE DEVUELVE LA PANTALLA A LA LISTA ──────────────────────────────────
//
// Todo lo de arriba navegó a la cuenta de UN local. Lo que sigue arranca desde
// el tablero del depósito y entra por la tarjeta, así que si no se vuelve, el
// `entrarAlLocal` de abajo busca una tarjeta que no está en pantalla — y el
// error que tira no dice "te quedaste en otra ruta", dice que no encontró el
// aria-label, que apunta a la tarjeta y no al lugar.
await abrir(RUTA_CUENTA_MOVIL, "LOCALES");

await entrarAlLocal("Local V15");

// EL PERÍODO CERRADO ES LA RESPUESTA, la semana en curso es el contexto.
await afirmar(await hayTexto("Para cobrar"), "adentro del local, la pregunta es cuánto hay que cobrar");
await afirmar(
  await hayTexto("Semana cerrada ·"),
  "y se dice de qué período es: el CERRADO, con su rango"
);
// ── EL NAVEGADOR REEMPLAZÓ A LA LÍNEA DE "SEMANA EN CURSO" ──────────────
//
// Hasta la V40 el período en curso iba como un renglón compacto debajo de la
// cuenta. Ahora está a una flecha, que es mejor: aquél mostraba UNO solo —el
// siguiente— y esto llega a cualquiera.
await afirmar(
  await hayTexto("Período anterior") || (await evaluar(
    `[...document.querySelectorAll('[aria-label]')].some((n) => n.getAttribute('aria-label') === 'Período anterior')`
  )),
  "falta el navegador de período"
);

// ── EL ROTULO SIGUE AL PERÍODO, QUE ES EL PUNTO DE LA V41 ───────────────
//
// La pantalla abre en el período CERRADO, así que tiene que decir "Para cobrar".
await afirmar(await hayTexto("Para cobrar"), "un período terminado se rotula para cobrar");
await afirmar(
  !(await hayTexto("Va acumulado")),
  "un período terminado NO puede decir «va acumulado»"
);

// Y la flecha de ADELANTE tiene que estar disponible: se está mirando el
// período anterior, así que hay a dónde avanzar.
const flecha = (etiqueta) =>
  evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .find((n) => n.getAttribute('aria-label') === ${JSON.stringify(etiqueta)});
    if (!b) return null;
    return { deshabilitada: b.disabled, atenuada: (b.className || "").includes("opacity-35") };
  })()`);
const adelanteEnCerrado = await flecha("Período siguiente");
await afirmar(
  adelanteEnCerrado && !adelanteEnCerrado.deshabilitada,
  `desde el período cerrado se tiene que poder avanzar (${JSON.stringify(adelanteEnCerrado)})`
);

// LA BARRA DICE DÓNDE ESTÁS. Por ruta diría "Transferencias", que es de dónde
// se vino y no dónde se está.
await afirmar(
  (await filaDelShell())?.includes("Local V15"),
  `la barra de arriba dice el nombre del local (dice: ${JSON.stringify(await filaDelShell())})`
);

// Y el buscador SÍ está acá, que es el otro lado de la afirmación de la entrada.
await afirmar(
  (await evaluar(
    `[...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).length`
  )) >= 1,
  "el buscador por número vive adentro del local"
);

await foto(`v40-local-${ANCHO}`);
await afirmarSuperficies("adentro del local");

// ── LA SEGUNDA VUELTA (V32), AHORA ADENTRO DEL LOCAL ─────────────────────
//
// El sembrado pone DOS transferencias en el período cerrado, de días distintos:
// una recibida con una diferencia y otra sin recibir. Sin ellas todo esto
// miraría una lista vacía y no se pondría rojo — se volvería inalcanzable.
await afirmar(
  !(await hayTexto("#")),
  "el número interno salió de la lista: no dice qué día ni qué trae"
);
await afirmar(await hayTexto("Sin abrir"), "el estado se dice en palabras");
await afirmar(
  await hayTexto("Recibida · 1 diferencia"),
  "la recibida dice cuántas líneas no cerraron"
);
await afirmar(await hayTexto("Ver ›"), "la recibida ofrece abrirse");

// EL TOTAL TODAVÍA PUEDE CAMBIAR, y eso se dice. El período cerró pero le queda
// una transferencia sin contar, así que el importe de arriba no es definitivo.
// Es el caso que el sembrado pone a propósito: sin una sin recibir en el período
// cerrado, este aviso no se podría fotografiar nunca.
await afirmar(
  await hayTexto("sin recibir · el total no está cerrado"),
  "con una sin contar, la cuenta avisa que el total no está cerrado"
);

// LAS DOS BANDAS DE DÍA, y la más reciente primero.
const dias = await evaluar(`(() => {
  const t = document.body.innerText;
  const m = t.match(/(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \\d+/g) || [];
  return [...new Set(m)];
})()`);
await afirmar(
  Array.isArray(dias) && dias.length >= 2,
  `las transferencias se agrupan por día (encontrados: ${JSON.stringify(dias)})`
);

// ── LA BANDA SE PINTA PAREJA ─────────────────────────────────────────────
//
// El defecto a no repetir: un hijo con fondo propio tapa la franja y deja un
// rectángulo del color de la tarjeta en el medio. Se mide el fondo COMPUTADO de
// la banda y el de todos sus descendientes: los hijos tienen que ser
// transparentes.
const banda = await evaluar(`(() => {
  const b = [...document.querySelectorAll("div")]
    .filter((e) => e.offsetParent !== null && e.className.includes("sunmi-surface-soft"))
    .find((e) => /(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo) \\d+/.test(e.innerText));
  if (!b) return null;
  const fondo = getComputedStyle(b).backgroundColor;
  const hijos = [...b.querySelectorAll("*")].map((h) => getComputedStyle(h).backgroundColor);
  const opacos = hijos.filter((c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent");
  return { fondo, hijos: hijos.length, opacos: opacos.length, ejemplos: opacos.slice(0, 3) };
})()`);
await afirmar(
  banda && banda.fondo !== "rgba(0, 0, 0, 0)",
  `la banda del día tiene fondo propio (computado: ${JSON.stringify(banda)})`
);
await afirmar(
  banda && banda.opacos === 0,
  `NINGÚN hijo de la banda se pinta: si uno lo hace, tapa la franja (${JSON.stringify(banda)})`
);

await foto(`v32-dias-${ANCHO}`);
await afirmarSuperficies("adentro del local, con los días");

// ── EL BUSCADOR POR NÚMERO, EJERCIDO ─────────────────────────────────────
//
// Se escribe con el setter nativo y un evento `input`: asignar `.value` a secas
// no le avisa a React y el campo queda con el texto puesto y el estado viejo,
// así que la lista no se filtraría y el arnés afirmaría sobre una pantalla que
// no cambió.
async function escribirEnElBuscador(valor) {
  await evaluar(`(() => {
    const campo = [...document.querySelectorAll('input')].find((i) => i.offsetParent !== null);
    if (!campo) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(campo, ${JSON.stringify(valor)});
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await esperar(700);
}

// Un número que NO está: la pantalla lo dice en vez de mostrar una lista vacía.
await escribirEnElBuscador("999999");
await afirmar(
  await hayTexto("Ninguna transferencia de este período tiene ese número"),
  "un número que no está se contesta con una frase, no con una lista vacía"
);
await foto(`v40-buscador-sin-resultado-${ANCHO}`);

// Y el número real de la recibida sí la encuentra, y deja sola a esa.
await escribirEnElBuscador(String(RECIBIDA_CERRADA));
await afirmar(
  await hayTexto("Recibida · 1 diferencia"),
  "buscando su número, la transferencia aparece"
);
await afirmar(
  !(await hayTexto("Sin abrir")),
  "y la otra queda afuera: si no, el buscador no estaría filtrando nada"
);
await escribirEnElBuscador("");

// Y la recibida ABRE el detalle.
await tocar("Ver ›");
await esperarTexto("Productos transferidos", 30000);
await afirmar(true, "tocar una recibida lleva al detalle que ya existía");
await foto(`v32-detalle-${ANCHO}`);

// ── EL LOCAL SIN MOVIMIENTO: EL RANGO EXISTE Y ESTÁ VACÍO ────────────────
//
// No es lo mismo que "no hay período". El período está —siempre hay una semana
// anterior— y lo que no hay es movimiento. Decir que falta el dato sería otra
// cosa, y sería falsa.
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
await entrarAlLocal("Local V15 sin movimiento");
await afirmar(
  await hayTexto("Semana cerrada ·"),
  "el local sin movimiento igual tiene período cerrado: es una cuenta de calendario, no de datos"
);
await afirmar(
  await hayTexto("No se le envió nada en ese período"),
  "y se dice que está vacío, con una frase"
);

// UNA SOLA VEZ Y CON UNA SOLA REDACCIÓN. La primera versión lo decía dos veces
// —"No se le envió nada en ese período" arriba y "No hay transferencias en el
// período cerrado" abajo— y las dos frases no eran ni siquiera la misma. Lo
// encontró la captura, no una afirmación: por eso ahora hay una.
await afirmar(
  !(await hayTexto("No hay transferencias en el período cerrado")),
  "el período vacío se dice UNA vez: dos frases distintas para el mismo hecho se leen como dos hechos"
);
await afirmar(
  (await evaluar(
    `[...document.querySelectorAll('input')].filter((i) => i.offsetParent !== null).length`
  )) === 0,
  "y sin nada que listar tampoco hay buscador: no puede encontrar nada"
);
await foto(`v40-local-vacio-${ANCHO}`);

// EL ATRÁS VUELVE A LA LISTA, que es el motivo por el que esto es una ruta y no
// un estado de la entrada.
await tocar("Volver");
// Se espera "Reporte" y no el nombre del local: el nombre TAMBIÉN está en la
// pantalla de la que se viene —es su título— así que esperarlo daría por
// llegada una navegación que todavía no pasó. "Reporte" solo lo registra la
// entrada.
await esperarTexto("Reporte", 20000);
await esperar(600);
await afirmar(
  !(await hayTexto("Para cobrar")),
  "el botón de atrás vuelve a la lista de locales, no a otra pantalla del local"
);
await afirmar(
  await hayTexto("Local V15 sin movimiento"),
  "y la lista sigue entera al volver"
);

// ── 2 · EL CORTE DE SEMANA: SE VE, SE CAMBIA Y SE GUARDA ─────────────────
await abrir("/modulos/transferencias/corte-de-semana", "Corte de semana");
await afirmar(await hayTexto("Sin configurar"), "la relación sin acuerdo llega marcada");
await afirmar(await hayTexto("Arranca"), "se ve qué día arranca hoy");
await afirmar(
  await hayTexto("Local V15 sin movimiento"),
  "la pantalla de corte también lista al local que no recibió nada: el acuerdo es de la RELACIÓN, no del movimiento"
);
// Pero NO al que no opera por transferencia: un local al que se le vende no
// tiene ningún corte de pago que acordar.
await afirmar(
  !(await hayTexto("Local V15 sin vínculo")),
  "la pantalla de corte ofrece configurar un local que no opera por transferencia"
);
const marcasAntes = await marcasSinConfigurar();
await afirmar(marcasAntes === 2, `las dos relaciones arrancan sin configurar (son ${marcasAntes})`);
await foto(`v29-corte-${ANCHO}`);
await afirmarSuperficies("corte de semana");

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

// ── SE CUENTAN LAS MARCAS, NO SE PREGUNTA SI QUEDA ALGUNA ───────────────
//
// Con dos relaciones y una sola configurada, "¿queda algún 'Sin configurar'?"
// contesta que sí y eso es CORRECTO — la otra sigue sin configurar. Lo que
// prueba que el guardado funcionó es que la cuenta BAJÓ en uno. Preguntar por
// la ausencia total habría obligado a configurar las dos para que el candado
// pasara, o —peor— a aflojarlo.
await afirmar(
  (await marcasSinConfigurar()) === marcasAntes - 1,
  `guardado el acuerdo, queda UNA marca menos (antes ${marcasAntes}, ahora ${await marcasSinConfigurar()})`
);
await afirmar(await hayTexto("Mié."), "y el día guardado es el que se tocó");
await foto(`v29-guardado-${ANCHO}`);

// Y el cambio se ve del otro lado: el local que se configuró deja de estar
// marcado en la lista de trabajo, y el que no se tocó sigue marcado.
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
await afirmar(
  await hayTexto("Hay 1 local sin corte configurado"),
  "el aviso baja a uno: el que se configuró salió de la cuenta y el otro sigue"
);
await foto(`v40-ya-configurado-${ANCHO}`);

// ── DOS CORTES DISTINTOS, DOS PERÍODOS DISTINTOS ─────────────────────────
//
// Es el motivo de fondo por el que la pantalla se partió en dos, y hasta acá no
// se había podido ver: uno de los dos locales quedó con el miércoles y el otro
// sigue con el domingo por defecto, así que su "semana cerrada" NO puede ser la
// misma. Si diera lo mismo, el corte por local sería decorativo y un chip global
// habría alcanzado.
//
// Se compara el RÓTULO, que es lo que se lee en pantalla. Cuál de los dos quedó
// configurado no importa: lo que se afirma es que difieren.
async function rangoCerradoDe(nombre) {
  await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
  await entrarAlLocal(nombre);
  return evaluar(`(() => {
    const m = document.body.innerText.match(/Semana cerrada · ([^\\n]+)/);
    return m ? m[1].trim() : null;
  })()`);
}

const rangoConMovimiento = await rangoCerradoDe("Local V15");
const rangoSinMovimiento = await rangoCerradoDe("Local V15 sin movimiento");
await afirmar(
  rangoConMovimiento && rangoSinMovimiento,
  `los dos locales dicen su período cerrado (${rangoConMovimiento} / ${rangoSinMovimiento})`
);
await afirmar(
  rangoConMovimiento !== rangoSinMovimiento,
  `con cortes distintos, el período cerrado es distinto (dieron: ${rangoConMovimiento} y ${rangoSinMovimiento})`
);
await foto(`v40-corte-propio-${ANCHO}`);

// ── 3 · LA VISTA DEL LOCAL ───────────────────────────────────────────────
await entrarComo(LOCAL, "LOCAL");
for (const alto of ALTOS) {
  await medir(alto);
  await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
  // ── EL LOCAL VE LA MISMA PANTALLA QUE EL DEPÓSITO ────────────────────
  //
  // Hasta la V40 veía otra: chips arriba, el período EN CURSO y dos secciones
  // "PARA RECIBIR" / "YA RECIBIDAS". O sea que el defecto que abrió esta línea
  // de trabajo seguía intacto justo del lado del que cobra.
  await afirmar(await hayTexto("Para cobrar"), `${alto} · el local ve el período CERRADO`);
  await afirmar(
    !(await hayTexto("PARA RECIBIR")) && !(await hayTexto("YA RECIBIDAS")),
    `${alto} · volvieron las secciones de la pantalla paralela del local`
  );
  await afirmar(
    !(await hayTexto("A pagar esta semana")),
    `${alto} · volvió el rótulo de la pantalla paralela`
  );
  await afirmarSuperficies(`vista del local a ${alto}`);
  await foto(`v42-local-${ANCHO}x${alto}`);
}

// ── Y ES LA MISMA PANTALLA, NO UNA PARECIDA ──────────────────────────────
//
// Se comparan las PIEZAS que dibuja, no una captura: el depósito entra por la
// lista y el local directo, así que la barra de arriba dice distinto y las fotos
// nunca serían idénticas. Lo que tiene que coincidir es de qué está hecha.
await medir(ALTOS[0]);
await abrir(RUTA_CUENTA_MOVIL, "Para cobrar");
const piezasDelLocal = await piezasDeLaCuenta();
await entrarComo(DEPOSITO, "DEPÓSITO (para comparar)");
await abrir(RUTA_CUENTA_MOVIL, "Transferencias");
await entrarAlLocal("Local V15");
const piezasDelDeposito = await piezasDeLaCuenta();
await afirmar(
  JSON.stringify(piezasDelLocal) === JSON.stringify(piezasDelDeposito),
  `el local y el depósito ven la MISMA pantalla\n  local:    ${JSON.stringify(piezasDelLocal)}\n  depósito: ${JSON.stringify(piezasDelDeposito)}`
);

// ── MOVERSE ENTRE PERÍODOS CAMBIA EL RANGO, LOS DATOS Y EL RÓTULO ───────
//
// Se navega HACIA ADELANTE y no hacia atrás, y el motivo es el tope: el
// sembrado tiene cuatro días de historia, así que la semana que la pantalla
// abre YA empieza antes de la primera transferencia de este local y la flecha
// de atrás está —correctamente— apagada. Medirlo hacia atrás habría dado rojo
// sobre un comportamiento correcto.
const antes = await estadoDelPeriodo();
await afirmar(
  await hayTexto("Para cobrar"),
  `el período cerrado se rotula «Para cobrar» (${antes.subtitulo})`
);

// EL TOPE HACIA ATRÁS, que es la respuesta a "¿hasta dónde?": hasta donde haya
// dato. Más atrás de la primera transferencia del local no hay nada que mirar.
const atras = await flecha("Período anterior");
await afirmar(
  atras && atras.deshabilitada && atras.atenuada,
  `sin historia más atrás, la flecha se apaga y se atenúa (${JSON.stringify(atras)})`
);

await tocar("Período siguiente");
await esperar(1400);
const despues = await estadoDelPeriodo();

await afirmar(
  antes.subtitulo !== despues.subtitulo,
  `la flecha no movió el período (${antes.subtitulo} → ${despues.subtitulo})`
);
await afirmar(
  antes.importe !== despues.importe,
  `el período cambió pero el importe no (${antes.importe} → ${despues.importe})`
);

// ── Y EL RÓTULO CAMBIÓ CON ÉL, QUE ES EL PUNTO DE LA V41 ───────────────
//
// El período en curso NO se cobra todavía. Que el mismo número cambie de nombre
// al cambiar de período es lo que esta vuelta vino a arreglar: antes decía
// "Semana cerrada" siempre, aunque no lo estuviera.
await afirmar(
  await hayTexto("Va acumulado"),
  "el período EN CURSO tiene que decir «va acumulado», no «para cobrar»"
);
await afirmar(
  !(await hayTexto("Para cobrar")),
  "un período abierto rotulado «para cobrar» es el defecto que abrió esta línea"
);
await afirmar(
  await hayTexto("Semana en curso"),
  `el título tiene que seguir al período (dice: ${despues.subtitulo})`
);

// Y desde el período actual NO se puede avanzar: no hay futuro que mirar.
const adelante = await flecha("Período siguiente");
await afirmar(
  adelante && adelante.deshabilitada && adelante.atenuada,
  `en el período actual la flecha de adelante se apaga (${JSON.stringify(adelante)})`
);
await foto(`v42-semana-en-curso-${ANCHO}`);

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
// Se pregunta por las TARJETAS DE LOCAL y no por un texto: desde la tercera
// vuelta la entrada móvil no escribe "A pagar" en ningún lado, así que
// preguntar por esa frase daba verde sin mirar nada. Las tarjetas son lo que la
// entrada móvil dibuja hoy, y son lo que no tiene que colarse acá.
// `offsetParent !== null` y no la sola presencia en el DOM: la entrada móvil se
// apaga con `hidden lg:block`, así que sus nodos EXISTEN a 1366 y están
// ocultos. Contarlos sin mirar si se ven daba rojo sobre una pantalla correcta.
await afirmar(
  (await evaluar(
    `[...document.querySelectorAll('[aria-label]')]
       .filter((n) => n.offsetParent !== null)
       .filter((n) => (n.getAttribute('aria-label') || '').startsWith('Abrir Local')).length`
  )) === 0,
  "1366 · la entrada móvil NO se cuela en el escritorio"
);
await foto("escritorio-1366");
await afirmarSuperficies("escritorio 1366");

console.log(`\n${afirmaciones} afirmaciones en verde · ${desbordes} capturas con desborde`);
console.log(`Capturas en ${SALIDA}`);
if (desbordes > 0) process.exitCode = 1;
process.exit(process.exitCode || 0);
