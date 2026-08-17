// scripts/sonda-tabla.mjs
//
// LOS ESTILOS CALCULADOS DE UNA TABLA REAL, CON SUS FILAS REALES.
//
// ── QUÉ LA SEPARA DE `sonda-estilos.mjs` ────────────────────────────────────
//
// Aquélla INYECTA un elemento con las clases que uno le dicta y lo mide. Sirve
// para partir una clase del kit en sub-clases: la pregunta es "¿esta cadena de
// clases produce este efecto?" y no hace falta ninguna pantalla.
//
// Ésta pregunta otra cosa: "¿la tabla que Emanuel abre todos los días quedó
// igual?". Eso no se puede inyectar — depende de qué props le pasa la pantalla,
// de qué columnas declaró, y de que la fila exista. Mide sobre el DOM que el ERP
// dibujó, sin tocarlo.
//
// ── LA REGLA QUE LE FALTABA, Y POR QUÉ ES LA MITAD DEL ARCHIVO ──────────────
//
// **UNA TABLA VACÍA MIDE PERFECTO.** `SunmiTable` dibuja el vacío y el "Cargando…"
// igual que dibujaría una fila: un `<tr>` con UNA celda con `colspan`. Si la sonda
// cuenta `tbody tr` a secas encuentra 1, la da por cargada, y mide los estilos de
// la celda del cartel. Sale un JSON impecable, el antes y el después dan
// idénticos, y no se probó nada — porque esa celda no lleva ninguna de las clases
// que la tanda está tocando.
//
// Pasó DOS VECES EN UN MISMO DÍA, el 2026-08-17, con dos sondas distintas: una
// midió el turno 26, que no tiene ventas, y otra la celda única de
// `SunmiTableEmpty`. Las dos informaron verde.
//
// Por eso acá la exigencia es PREVIA a la medición y es dura:
//
//   · al menos DOS filas de datos —una sola no distingue una tabla de un cartel—,
//   · ninguna de ellas puede ser el relleno, que se reconoce POR LA FORMA
//     —una celda sola con `colspan`— y no por su texto,
//   · y al menos dos celdas con texto de verdad, porque una fila de celdas vacías
//     tampoco prueba nada.
//
// Si algo de eso no se cumple, sale ROJA nombrando la tabla y la pantalla, y no
// mide. Una medición sobre el vacío es peor que no tener: se ve igual que una buena.
//
// ── LA OTRA MITAD: QUE HAYA RETRATADO LO QUE DICE RETRATAR ─────────────────
//
// Tres corridas idénticas prueban que no hay ruido; no prueban que la foto sea de
// lo que uno cree. **Una página de error es perfectamente determinista.** Así que
// además de las filas se comprueba que la hoja del kit esté servida —sin CSS todos
// los valores son el default del navegador y los dos lados salen iguales— y que la
// tabla lleve alguna clase, no un `class` vacío.
//
// ── USO ─────────────────────────────────────────────────────────────────────
//
//   MSYS_NO_PATHCONV=1 node scripts/sonda-tabla.mjs \
//     --base http://localhost:3111 --usuario admin@admin.com --clave <clave> \
//     --ubicacion depo --url /modulos/clientes --nombre clientes \
//     --salida /tmp/tabla-antes.json
//
//   node scripts/sonda-tabla.mjs --comparar /tmp/tabla-antes.json /tmp/tabla-despues.json
//
// **EL `MSYS_NO_PATHCONV=1` NO ES ADORNO.** Desde Git Bash, `/modulos/...` se
// convierte a una ruta de Windows antes de llegar a node, y lo único que se ve es
// `Cannot navigate to invalid URL` — un mensaje que no nombra la causa y que ya
// costó una corrida entera. Acá se detecta y se dice con todas las letras.
//
// Sale 0 si midió todo, 1 si alguna tabla no tenía filas reales o si el comparar
// encontró diferencias, y 2 si el uso está mal.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { prepararSesion } from "./lib/sesionArnes.mjs";

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--")
    ? argv[i + 1]
    : argv.includes(`--${n}`)
      ? true
      : d;
};
const todos = (n) => argv.map((a, i) => (a === `--${n}` ? argv[i + 1] : null)).filter(Boolean);

// ── MODO COMPARAR: no necesita navegador ───────────────────────────────────
//
// Se compara POR NOMBRE DE TABLA —pantalla más el texto de sus encabezados— y no
// por posición. Un índice cambia cuando la pantalla suma una tabla arriba, y ahí
// el comparador resta dos cosas distintas y llama "diferencia" a eso.
if (arg("comparar")) {
  const a = arg("comparar");
  const b = argv[argv.indexOf("--comparar") + 2];
  if (!b) {
    console.error("Uso: --comparar <antes.json> <despues.json>");
    process.exit(2);
  }
  const A = JSON.parse(fs.readFileSync(a, "utf8"));
  const B = JSON.parse(fs.readFileSync(b, "utf8"));
  let rojo = false;

  const todas = [...new Set([...Object.keys(A.tablas || {}), ...Object.keys(B.tablas || {})])];
  if (!todas.length) {
    console.log("ROJO · los dos archivos no tienen ninguna tabla. No hay nada que comparar.");
    process.exit(1);
  }

  for (const clave of todas) {
    const x = A.tablas[clave];
    const y = B.tablas[clave];
    if (!x || !y) {
      console.log(`  FALTA  "${clave}" está sólo en ${x ? a : b}`);
      rojo = true;
      continue;
    }
    // El control de que el después siga siendo una medición y no un vacío: si las
    // filas cayeron, la comparación de estilos no significa nada aunque dé idéntica.
    if (x.filasReales !== y.filasReales) {
      console.log(`  ✗ "${clave}": las filas cambiaron, ${x.filasReales} → ${y.filasReales}.`);
      console.log("      Los estilos de abajo comparan conjuntos distintos de celdas.");
      rojo = true;
    }
    const dif = [];
    for (const p of [...new Set([...Object.keys(x.tabla), ...Object.keys(y.tabla)])].sort()) {
      if (x.tabla[p] !== y.tabla[p]) dif.push(`tabla · ${p}: ${x.tabla[p]}  →  ${y.tabla[p]}`);
    }
    const n = Math.max(x.celdas.length, y.celdas.length);
    for (let i = 0; i < n; i++) {
      const cx = x.celdas[i], cy = y.celdas[i];
      if (!cx || !cy) { dif.push(`celda ${i}: sólo está en uno de los dos`); continue; }
      for (const p of [...new Set([...Object.keys(cx), ...Object.keys(cy)])].sort()) {
        if (p === "texto") continue;
        if (cx[p] !== cy[p]) dif.push(`celda ${cx.ref} · ${p}: ${cx[p]}  →  ${cy[p]}`);
      }
    }
    if (!dif.length) {
      console.log(`  IDÉNTICO  "${clave}"  (${x.filasReales} filas, ${x.celdas.length} celdas medidas)`);
    } else {
      rojo = true;
      console.log(`  DIFIEREN  "${clave}"  en ${dif.length}:`);
      for (const d of dif.slice(0, 40)) console.log(`    ${d}`);
      if (dif.length > 40) console.log(`    … y ${dif.length - 40} más`);
    }
  }
  process.exit(rojo ? 1 : 0);
}

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario", null);
const CLAVE = arg("clave", null);
const UBICACION = arg("ubicacion", null);
const SALIDA = arg("salida", null);
const ANCHO = Number(arg("ancho", "1366"));
const ALTO = Number(arg("alto", "900"));
const PUERTO = Number(arg("puerto-cdp", "9231"));
// El perfil va atado al puerto, por el mismo motivo que en `sonda-cascada.mjs`:
// con un perfil fijo, una segunda corrida en otro puerto encuentra el perfil
// tomado por el Edge anterior y lo único que se ve es "Edge no respondió".
const PERFIL = arg("perfil", path.join(os.tmpdir(), `sonda-tabla-edge-${PUERTO}`));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const MINIMO_FILAS = Number(arg("minimo-filas", "2"));

const URLS = todos("url");
const NOMBRES = todos("nombre");
if (!URLS.length) {
  console.error("Falta al menos un --url. Se pueden pasar varios, cada uno con su --nombre.");
  process.exit(2);
}

// LA TRAMPA DE GIT BASH, DETECTADA Y NOMBRADA.
//
// Sin `MSYS_NO_PATHCONV=1`, Git Bash convierte `/modulos/x` en
// `C:/Program Files/Git/modulos/x` ANTES de que node vea el argumento. Lo que se
// ve entonces es `Cannot navigate to invalid URL`, que no nombra la causa: se
// pierde media hora buscando el defecto adentro de la sonda. Acá se falla temprano.
const convertidas = URLS.filter((u) => /^[A-Za-z]:[\\/]/.test(u) || u.includes("Program Files"));
if (convertidas.length) {
  console.error("ABORTADO · Git Bash convirtió la ruta a una ruta de Windows:");
  for (const u of convertidas) console.error(`    ${u}`);
  console.error("");
  console.error("  Volver a correr con MSYS_NO_PATHCONV=1 adelante:");
  console.error("    MSYS_NO_PATHCONV=1 node scripts/sonda-tabla.mjs …");
  process.exit(2);
}

const objetivos = URLS.map((u, i) => ({ url: u, nombre: NOMBRES[i] || u }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CLIENTE CDP MÍNIMO ─────────────────────────────────────────────────────
let ws, sessionId, id = 0;
const pendientes = new Map();

function send(method, params = {}, conSesion = true) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pendientes.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error(`Edge no respondió al puerto de depuración ${PUERTO}`);
}

// `esperaPromesa` existe porque `sesionArnes` evalúa `fetch(...)`: sin esto el
// valor que vuelve es la promesa sin resolver y el login parece fallar siempre.
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
    const listo = await evaluar(
      `document.readyState === "complete" && location.pathname !== "about:blank"`
    );
    if (listo) return;
  }
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    `--window-size=${ANCHO},${ALTO}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
const cerrar = () => { try { edge.kill(); } catch {} };
process.on("exit", cerrar);

ws = new WebSocket(await urlDepurador());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) {
    const p = pendientes.get(m.id);
    pendientes.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
sessionId = sid;
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false,
});

console.log(`sonda de tabla — ${BASE} · ${ANCHO}x${ALTO}`);

if (USUARIO && CLAVE) {
  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    ubicacion: UBICACION, log: (m) => console.log(m),
  });
} else {
  console.log("  sin --usuario/--clave: se mide lo que se vea sin sesión");
}

// ── LO QUE SE EVALÚA EN LA PÁGINA ──────────────────────────────────────────
//
// El lector se escribe UNA vez y lo usan la espera y la medición, para que las
// dos cuenten las filas con el MISMO criterio. Contarlas distinto es cómo una
// espera da por asentada una tabla que la medición después encuentra vacía.
const LECTOR = `
  (() => {
    // EL RELLENO SE RECONOCE POR LA FORMA, NO POR EL TEXTO. "Cargando…", "Sin
    // items", "Sin ventas registradas" y el que alguien agregue mañana son todos
    // lo mismo: un <tr> con UNA celda con colspan. Buscar el texto obliga a
    // mantener una lista de carteles y falla con el primero que nadie agregó.
    const esRelleno = (tr) => {
      const tds = tr.querySelectorAll(":scope > td");
      return tds.length === 1 && tds[0].hasAttribute("colspan");
    };
    // La fila de DETALLE de una fila expandible también es una celda sola con
    // colspan, así que cae acá — y es correcto: no es una fila de datos.
    const salida = [];
    for (const tabla of document.querySelectorAll("table")) {
      const ths = [...tabla.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      const trs = [...tabla.querySelectorAll(":scope > tbody > tr")];
      const relleno = trs.filter(esRelleno);
      const reales = trs.filter((tr) => !esRelleno(tr));
      salida.push({
        clave: ths.length ? ths.join(" | ") : "(tabla sin encabezados)",
        filasTotales: trs.length,
        filasReales: reales.length,
        filasRelleno: relleno.length,
        textoRelleno: relleno.map((tr) => tr.textContent.trim()).join(" / "),
        celdasConTexto: reales
          .slice(0, 3)
          .reduce((n, tr) => n + [...tr.querySelectorAll(":scope > td")]
            .filter((td) => td.textContent.trim() !== "").length, 0),
      });
    }
    return salida;
  })()
`;

const PROPIEDADES_TABLA = ["font-size", "table-layout", "width", "border-collapse"];
const PROPIEDADES_CELDA = [
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "text-align", "font-size", "font-weight", "color",
  "text-decoration-line", "font-variant-numeric", "white-space",
];

const MEDIDOR = `
  (() => {
    const propsTabla = ${JSON.stringify(PROPIEDADES_TABLA)};
    const propsCelda = ${JSON.stringify(PROPIEDADES_CELDA)};
    const esRelleno = (tr) => {
      const tds = tr.querySelectorAll(":scope > td");
      return tds.length === 1 && tds[0].hasAttribute("colspan");
    };
    const salida = {};
    for (const tabla of document.querySelectorAll("table")) {
      const ths = [...tabla.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      const clave = ths.length ? ths.join(" | ") : "(tabla sin encabezados)";
      const reales = [...tabla.querySelectorAll(":scope > tbody > tr")].filter((tr) => !esRelleno(tr));
      const csT = getComputedStyle(tabla);
      const t = { clase: (tabla.getAttribute("class") || "").replace(/\\s+/g, " ").trim() };
      for (const p of propsTabla) t[p] = csT.getPropertyValue(p);

      // Las TRES primeras filas y no una: una sola no distingue el estilo de la
      // columna del de la fila —el tono, el hover, la fila seleccionada—.
      const celdas = [];
      reales.slice(0, 3).forEach((tr, f) => {
        [...tr.querySelectorAll(":scope > td")].forEach((td, c) => {
          const cs = getComputedStyle(td);
          const m = {
            ref: "f" + f + "c" + c,
            clase: (td.getAttribute("class") || "").replace(/\\s+/g, " ").trim(),
            texto: td.textContent.trim().slice(0, 30),
          };
          for (const p of propsCelda) m[p] = cs.getPropertyValue(p);
          celdas.push(m);
        });
      });
      // Los encabezados también: la alineación del th la pone la tabla.
      [...tabla.querySelectorAll("thead th")].forEach((th, c) => {
        const cs = getComputedStyle(th);
        const m = {
          ref: "th" + c,
          clase: (th.getAttribute("class") || "").replace(/\\s+/g, " ").trim(),
          texto: th.textContent.trim().slice(0, 30),
        };
        for (const p of propsCelda) m[p] = cs.getPropertyValue(p);
        celdas.push(m);
      });
      salida[clave] = { encabezados: ths, filasReales: reales.length, tabla: t, celdas };
    }
    return salida;
  })()
`;

/** ¿La hoja del kit está servida? Sin CSS los dos lados dan el default y salen iguales. */
async function hojaDelKitPuesta() {
  return evaluar(`(() => {
    for (const hoja of document.styleSheets) {
      let reglas; try { reglas = hoja.cssRules; } catch { continue; }
      for (const r of reglas) {
        if (!r.selectorText) continue;
        for (const parte of r.selectorText.split(",")) {
          const s = parte.trim();
          if (s === ".sunmi-thead" || s === ".sunmi-divide") return true;
        }
      }
    }
    return false;
  })()`);
}

const documento = { base: BASE, ancho: ANCHO, alto: ALTO, pantallas: {}, tablas: {} };
let rojo = false;

for (const objetivo of objetivos) {
  const destino = String(BASE) + String(objetivo.url);
  console.log("");
  console.log(`── ${objetivo.nombre} · ${destino}`);
  await send("Page.navigate", { url: destino });

  // Se espera a que la tabla se ASIENTE, con el mismo criterio con que después se
  // mide. Un `sleep` fijo mide una tabla a mitad de camino, y "Cargando…" es una
  // celda con colspan que se lee igual que una fila.
  let lectura = [];
  let asentada = false;
  for (let i = 0; i < 100; i++) {
    await sleep(250);
    try {
      if (!(await evaluar(`document.readyState === "complete"`))) continue;
      lectura = await evaluar(LECTOR);
    } catch { continue; }
    if (lectura.some((t) => t.filasReales >= MINIMO_FILAS && t.celdasConTexto >= 2)) {
      // Dos lecturas seguidas iguales: la primera puede caer entre dos renders.
      await sleep(400);
      const otra = await evaluar(LECTOR);
      if (JSON.stringify(otra.map((t) => t.filasReales)) === JSON.stringify(lectura.map((t) => t.filasReales))) {
        lectura = otra;
        asentada = true;
        break;
      }
    }
  }

  const urlFinal = await evaluar(`location.pathname + location.search`);
  const titulo = await evaluar(`document.title`);
  console.log(`  llegó a: ${urlFinal}${urlFinal !== objetivo.url ? "   ⚠ NO es la url pedida" : ""}`);

  if (!(await hojaDelKitPuesta())) {
    console.log("  ROJO · la hoja del kit no está servida (`.sunmi-thead` no aparece en ninguna regla).");
    console.log("    Sin CSS todas las celdas dan el default del navegador y el antes y el después");
    console.log("    salen idénticos sin haber medido nada.");
    rojo = true;
    continue;
  }

  if (!lectura.length) {
    console.log("  ROJO · no hay NINGUNA <table> en la pantalla.");
    console.log(`    título del documento: "${titulo}". Si dice error, la sonda retrató una página`);
    console.log("    de error — que es perfectamente determinista y pasa cualquier control de");
    console.log("    estabilidad.");
    rojo = true;
    continue;
  }

  // ── LA EXIGENCIA DE FILAS REALES ─────────────────────────────────────────
  const buenas = lectura.filter((t) => t.filasReales >= MINIMO_FILAS && t.celdasConTexto >= 2);
  for (const t of lectura) {
    const ok = t.filasReales >= MINIMO_FILAS && t.celdasConTexto >= 2;
    console.log(
      `  ${ok ? "✓" : "✗"} "${t.clave.slice(0, 58)}" · ${t.filasReales} filas de datos` +
        `, ${t.filasRelleno} de relleno${t.textoRelleno ? ` ("${t.textoRelleno.slice(0, 34)}")` : ""}` +
        `, ${t.celdasConTexto} celdas con texto`
    );
  }

  if (!buenas.length) {
    console.log("");
    console.log(`  ROJO · ${objetivo.nombre.toUpperCase()} NO TIENE NI UNA TABLA CON FILAS REALES.`);
    console.log(`    Se exigen ${MINIMO_FILAS} filas de datos y 2 celdas con texto. Lo que hay es el`);
    console.log("    ESTADO VACÍO: una celda sola con colspan, que no lleva ninguna de las clases");
    console.log("    que esta tanda toca. Medirla da un antes y un después idénticos y no prueba");
    console.log("    nada — es exactamente el defecto que esta sonda existe para no repetir.");
    console.log("    Elegir otro registro, con líneas cargadas.");
    rojo = true;
    continue;
  }

  if (!asentada) {
    console.log("  ⚠ no llegó a dos lecturas seguidas iguales, pero tiene filas: se mide igual.");
  }

  const medido = await evaluar(MEDIDOR);
  let cuantas = 0;
  for (const [clave, datos] of Object.entries(medido)) {
    if (datos.filasReales < MINIMO_FILAS) continue;
    if (!datos.tabla.clase) {
      console.log(`  ROJO · la tabla "${clave.slice(0, 40)}" tiene el atributo class VACÍO.`);
      rojo = true;
      continue;
    }
    documento.tablas[`${objetivo.nombre} · ${clave}`] = datos;
    cuantas++;
    console.log(`    medida: ${datos.celdas.length} celdas · <table class="${datos.tabla.clase}">`);
    console.log(`            font-size ${datos.tabla["font-size"]} · table-layout ${datos.tabla["table-layout"]} · width ${datos.tabla.width}`);
  }
  documento.pantallas[objetivo.nombre] = { url: objetivo.url, urlFinal, tablasMedidas: cuantas };
}

console.log("");
if (SALIDA) {
  fs.mkdirSync(path.dirname(path.resolve(SALIDA)), { recursive: true });
  fs.writeFileSync(path.resolve(SALIDA), JSON.stringify(documento, null, 1));
  console.log(`escrito en ${SALIDA} · ${Object.keys(documento.tablas).length} tablas`);
}

if (rojo) {
  console.log("ROJO · la sonda no midió todo lo que se le pidió. Ver arriba cuál y por qué.");
  cerrar();
  process.exit(1);
}
console.log(`VERDE · ${Object.keys(documento.tablas).length} tablas medidas, todas con filas reales.`);
cerrar();
process.exit(0);
