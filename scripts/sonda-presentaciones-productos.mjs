// SONDA: el carrusel del catálogo, ejercido en un navegador de verdad.
//
// Un solo bloque de doce cards en tres páginas: los cuatro controles de "Para
// revisar", las cuatro modalidades de venta y las cuatro de compra.
//
// ── POR QUÉ ESTA SONDA Y NO MÁS CANDADOS ───────────────────────────────────
//
// Los tres defectos que motivaron estas tandas son de los que un candado de
// texto NO puede ver:
//
//   0. **Hubo DOS bloques donde tenía que haber uno.** Un candado de render
//      mira lo que se le pasa al componente; no mira cuántas veces la pantalla
//      lo dibuja. Acá se cuentan los carruseles del documento, que es la única
//      forma de contestar esa pregunta — y se cuentan otra vez al final, después
//      de haber tocado todo, por si el segundo apareciera recién con un filtro.
//
//   1. **Atrás no deshacía.** Un candado que busca `router.push` comprueba que la
//      llamada esté escrita. No comprueba que el historial reciba una entrada, ni
//      que el estado de React siga a la URL cuando el navegador navega hacia
//      atrás. Las dos mitades tienen que estar para que Atrás funcione, y con una
//      sola el candado pasa igual.
//
//   2. **La card activa podía quedar invisible.** Al abrir un enlace con
//      `presCompra`, el carrusel arrancaba en la página de Venta. Eso es
//      `scrollLeft` de un contenedor: no aparece en el HTML, no lo ve
//      `renderToStaticMarkup` y no hay texto que buscar.
//
// Por eso acá se abre la pantalla, se toca, se aprieta Atrás y se MIDE dónde
// quedó el carrusel.
//
// ── EL CRITERIO, IGUAL QUE EN LAS OTRAS SONDAS ─────────────────────────────
//
// Si no puede medir, es ROJO y frena. Una sesión que no entró, una pantalla que
// no cargó o un bloque que no apareció no son "no se pudo comprobar".
//
// ── EL CARGADOR DE ALIAS NO ES OPCIONAL ────────────────────────────────────
//
// Importa `lib/productos/presentaciones.js`, que usa el alias `@/` de
// `jsconfig.json`. Node no sabe nada de ese alias: sin el cargador falla al
// arrancar con "Cannot find package '@/lib'". Es el mismo motivo por el que la
// suite se corre con `--import ./scripts/alias-loader.mjs`.
//
// Uso:
//   node --import ./scripts/alias-loader.mjs scripts/sonda-presentaciones-productos.mjs \
//     --base http://localhost:3111 --usuario <mail> --clave <clave-de-desarrollo>
//
// NUNCA contra producción: hace login y toca la interfaz.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";
// Los nombres y el orden salen del dominio, no escritos acá: si la sonda tuviera
// su propia lista, un cambio en el catálogo la dejaría midiendo otra pantalla y
// pasando en verde.
import { PRESENTACIONES, IDS_VENTA, IDS_COMPRA } from "../lib/productos/presentaciones.js";

// Cuántas cards entran en una página. NO se escribe: sale del catálogo, porque
// el diseño es "un grupo por página" y los dos grupos tienen el mismo tamaño. Un
// 4 escrito acá quedaría viejo el día que el catálogo cambie, y la sonda pasaría
// a medir otra cosa sin decirlo.
const POR_PAGINA_ESPERADO = IDS_VENTA.length;

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const LOCAL = arg("local");
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-presentaciones"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const SALIDA = arg("capturas", path.join(process.cwd(), "capturas-presentaciones"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });
fs.mkdirSync(SALIDA, { recursive: true });

const fallas = [];

// ── LA NUMERACIÓN LA PONE EL ARNÉS, NO EL QUE ESCRIBE ─────────────────────
//
// Estaba escrita a mano en cada título, y al insertar afirmaciones en el medio
// —esta tanda agregó dieciséis al principio— la lista quedaba con números
// repetidos. Un informe con dos "14." es un informe que no se puede citar.
//
// Se saca el prefijo viejo si lo tiene, así los títulos ya escritos no hay que
// tocarlos uno por uno para que la cuenta salga bien.
let cuenta = 0;
const afirmar = (ok, titulo, detalle = "") => {
  cuenta += 1;
  const limpio = String(titulo).replace(/^\s*\d+(-\w+)?\.\s*/, "");
  const linea = `${cuenta}. ${limpio}`;
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${linea}${ok && detalle ? ` — ${detalle}` : ""}`);
  if (!ok) {
    fallas.push({ titulo: linea, detalle });
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
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

/** Espera a que el listado y los contadores terminen de contestar. */
async function esperarDatos(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    await sleep(150);
    const listo = await evaluar(
      `!!(window.__listado && window.__listado.ok && window.__controles && window.__controles.ok)`
    );
    if (listo) return true;
  }
  return false;
}

/**
 * El estado que interesa, leído de la pantalla en un solo viaje.
 *
 * ── SE BUSCA EL CARRUSEL, NO UN TÍTULO ────────────────────────────────────
 *
 * La versión anterior de esta sonda buscaba una sección titulada
 * "Presentaciones", que era el segundo bloque —el defecto de interpretación que
 * este arreglo saca—. Ahora hay UN carrusel, y se lo identifica por su
 * estructura: la sección que tiene una pista horizontal con cards.
 *
 * `carruseles` viaja aparte y a propósito: es el dato con el que se afirma que
 * hay uno solo. Contarlos es lo único que distingue "el bloque está bien" de
 * "hay dos y estoy mirando el primero".
 */
const LEER_ESTADO = `(() => {
  const secciones = [...document.querySelectorAll("section")].filter(
    (s) => s.querySelector("[class*='overflow-x-auto']") && s.querySelector("button[aria-pressed]")
  );
  const titulos = [...document.querySelectorAll("h2")].map((h) => h.textContent.trim());
  const base = {
    carruseles: secciones.length,
    titulos,
    url: location.pathname + location.search,
    historial: history.length,
    total: window.__listado ? window.__listado.total : null,
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
  const seccion = secciones[0];
  if (!seccion) return JSON.stringify({ ...base, hay: false });

  const pista = seccion.querySelector("[class*='overflow-x-auto']");
  const botones = [...seccion.querySelectorAll("button[aria-pressed]")];
  const activos = botones
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => (b.getAttribute("aria-label") || "").split(":")[0].trim());
  const rp = pista ? pista.getBoundingClientRect() : null;
  const visibles = botones
    .filter((b) => {
      if (!rp) return false;
      const r = b.getBoundingClientRect();
      return r.left >= rp.left - 1 && r.right <= rp.right + 1;
    })
    .map((b) => (b.getAttribute("aria-label") || "").split(":")[0].trim());
  const cinta = [...seccion.querySelectorAll("[role='status'] span")]
    .map((s) => s.textContent.trim())
    .filter(Boolean);

  // ── DÓNDE EMPIEZA EL BUSCADOR ────────────────────────────────────────────
  // El número que contesta si el bloque empujó la pantalla hacia abajo. Se mide
  // el borde superior del campo, en coordenadas del documento.
  const campo = document.querySelector('input[type="search"], input[placeholder*="uscar"], input[placeholder*="ombre"]');
  const yBuscador = campo ? Math.round(campo.getBoundingClientRect().top + window.scrollY) : null;

  return JSON.stringify({
    ...base,
    hay: true,
    activos,
    visibles,
    cinta,
    cards: botones.length,
    yBuscador,
    puntos: [...seccion.querySelectorAll('button[aria-label^="Página"]')].length,
    pagina: pista && pista.clientWidth ? Math.round(pista.scrollLeft / pista.clientWidth) : null,
    paginas: pista ? pista.children.length : 0,
  });
})()`;

/**
 * El estado, o un fallo legible.
 *
 * ── POR QUÉ NO DEVUELVE EL OBJETO CRUDO ──────────────────────────────────
 *
 * Con el defecto de Atrás reintroducido —`replace` en vez de `push`— el botón
 * Atrás se lleva el navegador FUERA de la pantalla, porque la entrada de esta
 * selección nunca existió. Ahí `leerEstado` devolvía `{hay:false}` y la sonda
 * moría con "Cannot read properties of undefined", que es un choque y no un
 * diagnóstico: el que lo lee no se entera de cuál era el defecto.
 *
 * Devolviendo campos vacíos, las afirmaciones que siguen se ponen rojas UNA POR
 * UNA y nombran lo que falló. Un arnés que se cae no informa: frena.
 */
async function leerEstado() {
  const e = JSON.parse(await evaluar(LEER_ESTADO));
  if (e.hay) return e;
  return {
    ...e,
    hay: false,
    activos: [],
    visibles: [],
    cinta: [],
    cards: 0,
    yBuscador: null,
    puntos: 0,
    pagina: null,
    paginas: 0,
  };
}

/** Toca una card por su rótulo, esté en la página que esté. */
async function tocarPorEtiqueta(etiqueta) {
  const ok = await evaluar(`(() => {
    const b = [...document.querySelectorAll("section button[aria-pressed]")].find((x) =>
      (x.getAttribute("aria-label") || "").startsWith(${JSON.stringify(etiqueta)} + ":")
    );
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró la card "${etiqueta}"`);
  await sleep(250);
  await esperarDatos(40);
  return etiqueta;
}

/** Toca la card de una presentación por su id, usando su rótulo del dominio. */
async function tocarCard(idPresentacion) {
  const p = PRESENTACIONES.find((x) => x.id === idPresentacion);
  return tocarPorEtiqueta(`${p.titulo} ${p.detalle}`);
}

/** Lleva el carrusel a una página, como lo haría un dedo sobre el puntito. */
async function irAPagina(indice) {
  await evaluar(`(() => {
    const b = document.querySelector('section button[aria-label="Página ${indice + 1} de 3"]');
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(700);
}

async function capturar(nombre, url) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const archivo = path.join(SALIDA, `${nombre}.png`);
  fs.writeFileSync(archivo, Buffer.from(data, "base64"));
  console.log(`        captura: ${archivo}`);
  console.log(`        URL:     ${url}`);
  return archivo;
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    `--window-size=${ANCHO},${ALTO}`,
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: true,
  });

  // Se guardan las respuestas que la propia pantalla pidió. Es la única forma de
  // comparar el número de la card contra el total del listado sin armar otra
  // consulta que podría traer otra página, otro orden u otra ubicación.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__listado = null; window.__controles = null;
      const _fetch = window.fetch;
      window.fetch = async (...args) => {
        const r = await _fetch(...args);
        try {
          const u = String(args[0]?.url || args[0] || "");
          if (u.includes("/api/productos/listar")) r.clone().json().then((j) => { window.__listado = j; }).catch(() => {});
          if (u.includes("/api/productos/controles")) r.clone().json().then((j) => { window.__controles = j; }).catch(() => {});
        } catch (e) {}
        return r;
      };
    `,
  });

  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });

  if (LOCAL) {
    const r = await evaluar(
      `fetch("/api/contexto-activo/set", {
         method: "POST", headers: { "Content-Type": "application/json" },
         credentials: "same-origin", body: JSON.stringify({ localId: ${Number(LOCAL)} }),
       }).then((r) => r.status + "")`,
      true
    );
    if (r !== "200") morir(`no se pudo parar la sonda en el local ${LOCAL} (status ${r})`);
  }

  console.log("");
  console.log(`Midiendo ${BASE}/modulos/productos a ${ANCHO}×${ALTO}`);
  console.log("");

  // ── 1 · LA PANTALLA LIMPIA ───────────────────────────────────────────────
  const URL_LIMPIA = `${BASE}/modulos/productos`;
  await navegar(URL_LIMPIA);
  if (!(await esperarDatos())) morir("el listado o los contadores no contestaron");

  let e = await leerEstado();
  afirmar(e.hay, "1. hay un carrusel de cards en la pantalla", e.hay ? "" : "no se encontró ninguno");
  if (!e.hay) morir("sin el carrusel no hay nada que medir");

  // ── LAS DOS AFIRMACIONES DEL DEFECTO DE INTERPRETACIÓN ──────────────────
  //
  // La tanda anterior creó un SEGUNDO bloque con su propio título. Estas dos son
  // las que se ponen rojas si eso vuelve, y por eso van primero: si hay dos
  // carruseles, todo lo que se mida después está mirando uno de los dos.
  afirmar(
    e.carruseles === 1,
    "2. UN SOLO CARRUSEL EN LA PANTALLA",
    `hay ${e.carruseles} — con dos, la pantalla vuelve a tener dos bloques`
  );
  afirmar(
    !e.titulos.includes("Presentaciones"),
    "3. NO EXISTE EL ENCABEZADO 'Presentaciones'",
    `títulos=${e.titulos.join(" | ")}`
  );
  afirmar(
    e.titulos.includes("Para revisar"),
    "4. y el encabezado del bloque sigue siendo el de siempre",
    `títulos=${e.titulos.join(" | ")}`
  );

  afirmar(
    e.cards === 12,
    "5. DOCE CARDS EN EL MISMO CARRUSEL",
    `cards=${e.cards} (4 controles + ${PRESENTACIONES.length} modalidades)`
  );
  afirmar(
    e.paginas === 3,
    "6. TRES PÁGINAS de cuatro cards",
    `páginas=${e.paginas} · por página ${POR_PAGINA_ESPERADO}`
  );
  afirmar(e.puntos === 3, "7. TRES INDICADORES", `puntos=${e.puntos}`);
  afirmar(
    e.visibles.length === POR_PAGINA_ESPERADO,
    "8. en la primera página se ven cuatro cards",
    `visibles=${e.visibles.join(" | ")}`
  );
  afirmar(
    e.visibles.some((v) => v.startsWith("Precios")) && !e.visibles.some((v) => v.startsWith("Venta por")),
    "9. LA PÁGINA 1 ES 'PARA REVISAR', no las modalidades",
    `visibles=${e.visibles.join(" | ")}`
  );
  afirmar(e.activos.length === 0, "10. sin filtro no hay ninguna card encendida", `activos=${e.activos.join(", ")}`);
  afirmar(e.cinta.length === 0, "11. sin filtro no hay cinta", `cinta=${e.cinta.join(" | ")}`);
  afirmar(e.desborde <= 0, `12. sin desborde horizontal a ${ANCHO} px`, `sobra ${e.desborde} px`);

  // ── DÓNDE QUEDÓ EL BUSCADOR ─────────────────────────────────────────────
  //
  // El número se informa siempre y se compara contra un tope que se pasa por
  // parámetro. Sin `--y-buscador-max` no se afirma nada: **medir no es afirmar**,
  // y un tope inventado acá adentro sería una referencia que nadie eligió.
  const Y_MAX = arg("y-buscador-max") ? Number(arg("y-buscador-max")) : null;
  if (Y_MAX === null) {
    console.log(`  ----  13. el buscador arranca en y=${e.yBuscador} px — SIN TOPE: no se afirma nada`);
  } else {
    afirmar(
      e.yBuscador !== null && e.yBuscador <= Y_MAX,
      "13. EL BUSCADOR NO BAJÓ MÁS QUE CON EL CARRUSEL ORIGINAL",
      `y=${e.yBuscador} px · tope=${Y_MAX} px`
    );
  }

  const yBuscadorLimpio = e.yBuscador;

  const totalSinFiltro = e.total;
  const historialInicial = e.historial;
  const conteos = await evaluar(
    `JSON.stringify((window.__controles.presentaciones || []).map((p) => [p.id, p.cantidad]))`
  );
  const CANTIDAD = Object.fromEntries(JSON.parse(conteos));
  console.log(`        catálogo sin filtro: ${totalSinFiltro} productos`);
  console.log(`        conteos: ${Object.entries(CANTIDAD).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  await capturar("01-carrusel-unico-pagina-1", URL_LIMPIA);

  // ── LAS TRES PÁGINAS SE RECORREN DE VERDAD, TOCANDO LOS PUNTITOS ────────
  //
  // No alcanza con contar tres `<div>` en la pista: hay que ver que cada página
  // muestre las cuatro cards que le tocan. Es la diferencia entre "el carrusel
  // dice que tiene tres páginas" y "las tres páginas están donde se espera".
  await irAPagina(1);
  const p2 = await leerEstado();
  afirmar(
    p2.visibles.length === 4 && p2.visibles.every((v) => v.startsWith("Venta por")),
    "LA PÁGINA 2 SON LAS CUATRO DE VENTA",
    `visibles=${p2.visibles.join(" | ")}`
  );
  afirmar(p2.desborde <= 0, "sin desborde en la página de Venta", `sobra ${p2.desborde} px`);
  await capturar("02-pagina-2-venta", `${BASE}${p2.url}`);

  await irAPagina(2);
  const p3 = await leerEstado();
  afirmar(
    p3.visibles.length === 4 && p3.visibles.every((v) => v.startsWith("Compra por")),
    "LA PÁGINA 3 SON LAS CUATRO DE COMPRA",
    `visibles=${p3.visibles.join(" | ")}`
  );
  afirmar(p3.desborde <= 0, "sin desborde en la página de Compra", `sobra ${p3.desborde} px`);
  afirmar(
    p3.yBuscador === yBuscadorLimpio,
    "EL BUSCADOR NO SE MUEVE AL CAMBIAR DE PÁGINA",
    `página 1 y=${yBuscadorLimpio} · página 3 y=${p3.yBuscador}`
  );
  await capturar("03-pagina-3-compra", `${BASE}${p3.url}`);

  await irAPagina(0);
  e = await leerEstado();

  // Se eligen cards CON productos: una card en cero también filtra bien, pero no
  // deja comprobar que el total del listado sea el número de la card.
  const conProductos = (ids) => ids.find((i) => (CANTIDAD[i] ?? 0) > 0) ?? null;
  const VENTA = conProductos(IDS_VENTA);
  const COMPRA = conProductos(IDS_COMPRA);
  if (!VENTA || !COMPRA) {
    morir(
      `en estos datos no hay una card de venta y una de compra con productos ` +
        `(venta=${VENTA}, compra=${COMPRA}). No se fabrica una fila para que la sonda cierre.`
    );
  }

  // ── 2 · UNA CARD DE VENTA ────────────────────────────────────────────────
  const etiquetaVenta = await tocarCard(VENTA);
  e = await leerEstado();
  afirmar(e.url.includes(`presVenta=${VENTA}`), "8. tocar una card de Venta escribe la URL", `url=${e.url}`);
  afirmar(e.activos.includes(etiquetaVenta), "9. la card queda encendida", `activos=${e.activos.join(", ")}`);
  afirmar(
    e.total === CANTIDAD[VENTA],
    "10. EL TOTAL DEL LISTADO ES EL NÚMERO DE LA CARD",
    `card=${CANTIDAD[VENTA]} listado=${e.total}`
  );
  afirmar(
    e.historial > historialInicial,
    "11. LA SELECCIÓN CREÓ UNA ENTRADA DE HISTORIAL",
    `historial ${historialInicial} → ${e.historial}: con replace no crecería y Atrás no la desharía`
  );
  // ── ACÁ NO VA CINTA, Y ES LO CORRECTO ──────────────────────────────────
  //
  // Esta afirmación decía "la cinta nombra lo que está filtrando" y era del
  // diseño de DOS bloques, donde la cinta salía siempre. Con el carrusel único
  // la regla es otra: la cinta nombra lo que está encendido **y no se ve**, y
  // acá el carrusel acaba de llevar a la página de la card tocada — así que la
  // card está a la vista, encendida, y repetirla arriba sería decir dos veces lo
  // mismo.
  //
  // Se reescribe por lo que el diseño afirma HOY en vez de aflojarla: se exige
  // que la card esté VISIBLE y encendida, y que por eso no haya cinta.
  afirmar(
    e.visibles.includes(etiquetaVenta) && e.cinta.length === 0,
    "12. LA CARD TOCADA QUEDA A LA VISTA, así que no hace falta cinta",
    `visibles=${e.visibles.join(" | ")} · cinta=${e.cinta.join(" | ") || "(ninguna)"}`
  );
  afirmar(e.desborde <= 0, "13. sin desborde con una card activa", `sobra ${e.desborde} px`);
  await capturar("04-venta-activa", `${BASE}${e.url}`);
  const historialConVenta = e.historial;
  const totalVenta = e.total;

  // ── 3 · ATRÁS ────────────────────────────────────────────────────────────
  await evaluar("history.back()");
  await sleep(500);
  await esperarDatos(40);
  e = await leerEstado();
  // El detalle es un HECHO y no un relato: se imprime también cuando pasa, así
  // que "la pantalla ya no está" en una línea OK se leería como una falla.
  afirmar(
    e.hay,
    "13-bis. ATRÁS DEJA LA PANTALLA EN PIE",
    `bloque=${e.hay ? "presente" : "AUSENTE"} url=${e.url}`
  );
  afirmar(!e.url.includes("presVenta"), "14. ATRÁS SACA EL PARÁMETRO DE LA URL", `url=${e.url}`);
  afirmar(
    e.activos.length === 0,
    "15. ATRÁS APAGA LA CARD EN LA PANTALLA",
    `activos=${e.activos.join(", ")} — si la URL volvió y la card sigue encendida, el estado no sigue a la URL`
  );
  afirmar(
    e.total === totalSinFiltro,
    "16. ATRÁS DEVUELVE EL LISTADO ANTERIOR",
    `antes=${totalSinFiltro} ahora=${e.total}`
  );
  afirmar(e.cinta.length === 0, "17. Atrás también saca la cinta", `cinta=${e.cinta.join(" | ")}`);
  await capturar("05-despues-de-atras", `${BASE}${e.url}`);

  // ── 4 · ADELANTE ─────────────────────────────────────────────────────────
  await evaluar("history.forward()");
  await sleep(500);
  await esperarDatos(40);
  e = await leerEstado();
  afirmar(e.url.includes(`presVenta=${VENTA}`), "18. ADELANTE vuelve a poner el parámetro", `url=${e.url}`);
  afirmar(e.activos.includes(etiquetaVenta), "19. ADELANTE vuelve a encender la card", `activos=${e.activos.join(", ")}`);
  afirmar(e.total === totalVenta, "20. Adelante devuelve el listado filtrado", `esperado=${totalVenta} ahora=${e.total}`);

  // ── 5 · VENTA + COMPRA ───────────────────────────────────────────────────
  const etiquetaCompra = await tocarCard(COMPRA);
  e = await leerEstado();
  afirmar(
    e.url.includes(`presVenta=${VENTA}`) && e.url.includes(`presCompra=${COMPRA}`),
    "21. las dos viajan juntas en la URL",
    `url=${e.url}`
  );
  afirmar(e.activos.length === 2, "22. quedan DOS cards encendidas", `activos=${e.activos.join(", ")}`);
  afirmar(
    e.total <= CANTIDAD[VENTA] && e.total <= CANTIDAD[COMPRA],
    "23. LA COMBINACIÓN ES UNA INTERSECCIÓN",
    `venta=${CANTIDAD[VENTA]} compra=${CANTIDAD[COMPRA]} listado=${e.total}`
  );
  // ── LAS DOS SIGUEN SIENDO RECONOCIBLES, CADA UNA POR SU CAMINO ─────────
  //
  // Esta afirmación pedía que la cinta mostrara LAS DOS, y era del diseño de dos
  // bloques. Con el carrusel único la regla es "la cinta nombra lo encendido que
  // no se ve", así que acá cubre a una y la otra se anuncia sola, encendida en la
  // página que está a la vista.
  //
  // Lo que hay que exigir es lo que el requisito pide de verdad: que NINGUNA
  // selección activa quede sin señal. Se comprueba que la unión de "lo visible y
  // encendido" con "lo que nombra la cinta" sean las dos, sin que sobre ninguna.
  const senaladas = new Set([
    ...e.visibles.filter((v) => e.activos.includes(v)),
    ...e.cinta,
  ]);
  afirmar(
    e.activos.every((a) => senaladas.has(a)) && senaladas.size === e.activos.length,
    "24. NINGUNA SELECCIÓN ACTIVA QUEDA SIN SEÑAL",
    `activas=${e.activos.join(" | ")} · a la vista=${e.visibles.filter((v) => e.activos.includes(v)).join(" | ") || "(ninguna)"} · en la cinta=${e.cinta.join(" | ") || "(ninguna)"}`
  );
  afirmar(
    e.visibles.length === POR_PAGINA_ESPERADO && e.visibles.filter((v) => e.activos.includes(v)).length < 2,
    "25. y en efecto NO se pueden ver las dos cards a la vez",
    `visibles=${e.visibles.join(" | ")}`
  );
  afirmar(
    e.cinta.length > 0,
    "25-bis. la que quedó fuera de pantalla SÍ está en la cinta",
    `cinta=${e.cinta.join(" | ") || "(ninguna)"}`
  );
  afirmar(e.desborde <= 0, "26. sin desborde con las dos activas", `sobra ${e.desborde} px`);
  await capturar("06-venta-mas-compra", `${BASE}${e.url}`);
  const totalCruce = e.total;

  // ── 6 · RECARGAR UN ENLACE SOLO DE COMPRA ────────────────────────────────
  //
  // EL DEFECTO ORIGINAL: el carrusel arrancaba en la página de Venta con la card
  // encendida en la de Compra.
  const URL_COMPRA = `${BASE}/modulos/productos?presCompra=${COMPRA}`;
  await navegar(URL_COMPRA);
  if (!(await esperarDatos())) morir("la pantalla no cargó al abrir el enlace de compra");
  await sleep(600); // el carrusel se acomoda después de que llegan los contadores
  e = await leerEstado();
  afirmar(e.activos.includes(etiquetaCompra), "27. el enlace enciende la card de Compra", `activos=${e.activos.join(", ")}`);
  afirmar(
    e.pagina === 2,
    "28. EL CARRUSEL ABRE EN LA PÁGINA DE LA CARD ACTIVA",
    `página visible=${e.pagina} (esperada la 2, la de Compra: con el carrusel único la 0 es Para revisar)`
  );
  afirmar(
    e.visibles.includes(etiquetaCompra),
    "29. LA CARD ACTIVA SE VE, que era el defecto",
    `visibles=${e.visibles.join(" | ")}`
  );
  afirmar(
    e.total === CANTIDAD[COMPRA],
    "30. y el listado es el de esa card",
    `card=${CANTIDAD[COMPRA]} listado=${e.total}`
  );
  afirmar(e.desborde <= 0, "31. sin desborde en la página de Compra", `sobra ${e.desborde} px`);
  await capturar("07-recarga-compra-pagina-visible", URL_COMPRA);

  // ── 7 · RECARGAR EL CRUCE ────────────────────────────────────────────────
  const URL_CRUCE = `${BASE}/modulos/productos?presVenta=${VENTA}&presCompra=${COMPRA}`;
  await navegar(URL_CRUCE);
  if (!(await esperarDatos())) morir("la pantalla no cargó al abrir el enlace del cruce");
  await sleep(600);
  e = await leerEstado();
  afirmar(e.activos.length === 2, "32. recargar el cruce enciende las dos", `activos=${e.activos.join(", ")}`);
  afirmar(
    e.total === totalCruce,
    "33. RECARGAR DA EL MISMO LISTADO que tocar las cards",
    `tocando=${totalCruce} recargando=${e.total}`
  );
  afirmar(
    e.cinta.includes(etiquetaVenta) && e.cinta.includes(etiquetaCompra),
    "34. y la cinta las nombra a las dos",
    `cinta=${e.cinta.join(" | ")}`
  );
  await capturar("08-recarga-cruce", URL_CRUCE);

  // ── 8 · EL BUSCADOR NO LLENA EL HISTORIAL ────────────────────────────────
  //
  // Es la otra mitad del arreglo de Atrás: cambiar todo a `push` habría creado
  // una entrada por tecla, y volver desde "aceite" serían seis toques de Atrás.
  await navegar(URL_LIMPIA);
  if (!(await esperarDatos())) morir("la pantalla no cargó para medir el buscador");
  const antesDeEscribir = (await leerEstado()).historial;
  const LETRAS = ["a", "ac", "ace", "acei", "aceit", "aceite"];
  for (const texto of LETRAS) {
    await evaluar(`(() => {
      const i = document.querySelector('input[type="search"], input[placeholder*="uscar"], input[placeholder*="ombre"]');
      if (!i) return false;
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      set.call(i, ${JSON.stringify(texto)});
      i.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await sleep(220);
  }
  await sleep(900);
  e = await leerEstado();
  const creadas = e.historial - antesDeEscribir;
  afirmar(
    creadas <= 1,
    "35. ESCRIBIR SEIS LETRAS NO CREA SEIS ENTRADAS",
    `entradas creadas=${creadas} por ${LETRAS.length} teclas (se admite 1: la transición que apagó la card)`
  );
  afirmar(e.desborde <= 0, "36. sin desborde con el buscador escrito", `sobra ${e.desborde} px`);
  await capturar("09-buscador-sin-llenar-historial", `${BASE}${e.url}`);

  // ── 9 · Y AL FINAL, OTRA VEZ: SIGUE HABIENDO UN SOLO BLOQUE ──────────────
  //
  // Se vuelve a preguntar DESPUÉS de haber tocado todo —cards, Atrás, Adelante,
  // recargas y el buscador—, no solo al entrar. Un segundo carrusel que
  // apareciera recién con un filtro puesto no lo vería una comprobación hecha
  // únicamente sobre la pantalla limpia.
  e = await leerEstado();
  afirmar(
    e.carruseles === 1,
    "37. DESPUÉS DE TOCAR TODO, SIGUE HABIENDO UN SOLO CARRUSEL",
    `carruseles=${e.carruseles}`
  );
  afirmar(
    !e.titulos.includes("Presentaciones") && e.titulos.includes("Para revisar"),
    "38. y el único encabezado sigue siendo 'Para revisar'",
    `títulos=${e.titulos.join(" | ")}`
  );
} catch (err) {
  morir(err?.message || String(err));
}

console.log("");
if (fallas.length === 0) {
  console.log("VERDE · un solo carrusel de doce cards, Atrás/Adelante y la página visible andan.");
} else {
  console.log(`ROJO · ${fallas.length} afirmaciones fallaron:`);
  for (const f of fallas) console.log(`  · ${f.titulo}`);
}
console.log("");
process.exit(fallas.length === 0 ? 0 : 1);
