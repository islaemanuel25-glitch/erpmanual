// SONDA: volver al mismo lugar después de editar, ejercido en un navegador.
//
// ── POR QUÉ NO ALCANZA CON CANDADOS ────────────────────────────────────────
//
// Los tres defectos de esta tanda son invisibles para un candado de texto:
//
//   1. **El contenedor de scroll equivocado.** `#productos-scroll` existe en el
//      DOM del celular y está oculto. Un candado que lea el código ve la línea
//      correcta; lo que falla es qué mide esa línea EN EL NAVEGADOR.
//   2. **La card sin ancla.** Que el atributo esté escrito en el JSX no prueba
//      que la card se pueda encontrar ni que quede a la misma altura.
//   3. **La posición vertical.** Es aritmética de rectángulos después del
//      layout. No hay texto que buscar.
//
// Por eso acá se abre la pantalla, se anota dónde está un producto, se lo edita,
// se vuelve por los cuatro caminos y se COMPARA la altura con tolerancia.
//
// ── EL CARGADOR DE ALIAS NO ES OPCIONAL ────────────────────────────────────
//
// Importa `lib/productos/estadoDeRetorno.js`, que usa el alias `@/`.
//
// Uso:
//   node --import ./scripts/alias-loader.mjs scripts/sonda-retorno-productos.mjs \
//     --base http://localhost:3111 --usuario <mail> --clave <clave-de-desarrollo>
//
// NUNCA contra producción: hace login, toca la interfaz y GUARDA un producto.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";
// El rótulo y la clave del almacén salen del dominio. Escritos acá, un cambio
// dejaría la sonda buscando el viejo y pasando en verde sobre otra pantalla.
import {
  TEXTO_ULTIMO_EDITADO,
  CLAVE_ESTADO_RETORNO,
} from "../lib/productos/estadoDeRetorno.js";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const ANCHO = Number(arg("ancho", "390"));
const ALTO = Number(arg("alto", "844"));
const PUERTO = Number(arg("puerto-cdp", "9247"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-retorno"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const SALIDA = arg("capturas", path.join(process.cwd(), "capturas-retorno"));
// La tolerancia del pedido. Va como parámetro para poder endurecerla, no para
// aflojarla: el default es el máximo aceptado.
const TOLERANCIA = Number(arg("tolerancia", "12"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });
fs.mkdirSync(SALIDA, { recursive: true });

const fallas = [];
let cuenta = 0;
const afirmar = (ok, titulo, detalle = "") => {
  cuenta += 1;
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${cuenta}. ${titulo}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallas.push(`${cuenta}. ${titulo}`);
};
const nota = (t) => console.log(`  ----  ${t}`);

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

/**
 * Espera a que la lista esté MONTADA, no a que pase un tiempo.
 *
 * La condición es la misma que usa la pantalla para restaurar: el pedido
 * terminó y hay filas con su ancla en el DOM. Un `sleep` fijo anda en la máquina
 * del que lo escribió y falla en la del que lo usa.
 */
async function esperarLista(intentos = 100) {
  for (let i = 0; i < intentos; i++) {
    await sleep(150);
    const n = await evaluar(`[...document.querySelectorAll("[data-ancla]")].filter(${VISIBLE}).length`);
    if (n > 0) return n;
  }
  return 0;
}

// ── LAS ANCLAS SE CUENTAN SOLO DONDE SE VEN ────────────────────────────────
//
// La pantalla dibuja las DOS superficies siempre: la lista de tarjetas
// (`md:hidden`) y la tabla (`hidden md:block`). A 390 px las dos están en el
// DOM y una está oculta, así que `querySelectorAll("[data-ancla]")` devuelve
// cincuenta elementos para veinticinco productos.
//
// Contarlas todas no es solo un número feo: el primer resultado puede ser el
// oculto, y hacerle clic no hace nada. La primera corrida de esta sonda se
// quedó en "no se encontró Cancelar" por eso — el clic había caído en un botón
// invisible y nunca se abrió el editor.
//
// Es el mismo error que el defecto que esta tanda arregla, del otro lado: allá
// se MEDÍA un elemento oculto, acá se lo TOCABA.
const VISIBLE = `(el) => el.offsetParent !== null`;

/** Todo lo que interesa de la pantalla, en un viaje. */
const LEER = `(() => {
  const anclas = [...document.querySelectorAll("[data-ancla]")].filter(${VISIBLE});
  // Solo lo que ES un producto. El carrusel de cards usa \`aria-current\` en sus
  // puntitos de paginado, así que contar todos los \`aria-current\` metía un
  // "(sin ancla)" permanente y hacía fallar la entrada fresca sobre una pantalla
  // correcta. Se afirma sobre productos marcados, no sobre atributos sueltos.
  const marca = [...document.querySelectorAll('[aria-current="true"][data-ancla]')]
    .filter(${VISIBLE})
    .map((e) => e.getAttribute("data-ancla"));
  const textoMarca = document.body.innerText.includes(${JSON.stringify(TEXTO_ULTIMO_EDITADO)});
  return JSON.stringify({
    url: location.pathname + location.search,
    cantidad: anclas.length,
    anclas: anclas.map((e) => e.getAttribute("data-ancla")),
    marcados: marca,
    textoMarca,
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    retenido: (() => { try { return !!sessionStorage.getItem(${JSON.stringify(CLAVE_ESTADO_RETORNO)}); } catch (e) { return null; } })(),
  });
})()`;

const leer = async () => JSON.parse(await evaluar(LEER));

/**
 * ¿Estas dos URL del listado son la misma?
 *
 * Se comparan la ruta y el CONJUNTO de parámetros, no la cadena. La pantalla
 * reconstruye su URL desde el estado, así que el orden de los parámetros no
 * tiene por qué ser el que se tipeó: entrar por `?page=2&q=a` y salir con
 * `?page=2&q=a` en otro orden es la misma pantalla.
 *
 * Comparar cadenas daría rojo sobre un comportamiento correcto, que es la peor
 * clase de candado: obliga a aflojarlo y ahí deja de afirmar.
 */
function mismaUrlDeListado(a, b) {
  const partir = (u) => {
    const [ruta, qs = ""] = String(u).split("?");
    const p = [...new URLSearchParams(qs).entries()].sort();
    return { ruta, p: JSON.stringify(p) };
  };
  const x = partir(a);
  const y = partir(b);
  return x.ruta === y.ruta && x.p === y.p;
}

/**
 * Qué contenedor scrollea y cuánto puede desplazar.
 *
 * Se informa junto a cada comparación de alturas: sin esto, una diferencia de
 * 66 px no distingue "la restauración no anduvo" de "el contenedor no tenía
 * tanto para desplazar". Son dos cosas distintas y una no es un defecto.
 */
async function contenedores() {
  return JSON.parse(await evaluar(`(() => {
    const uno = (el, nombre) => el ? {
      nombre,
      visible: el.offsetParent !== null,
      scrollTop: Math.round(el.scrollTop),
      sobrante: Math.round(el.scrollHeight - el.clientHeight),
    } : { nombre, ausente: true };
    return JSON.stringify([
      uno(document.getElementById("productos-scroll"), "#productos-scroll"),
      uno(document.querySelector("main"), "main"),
    ]);
  })()`));
}

const resumenContenedores = (c) =>
  c.map((x) => (x.ausente ? `${x.nombre}=ausente` : `${x.nombre}[${x.visible ? "visible" : "oculto"} top=${x.scrollTop} sobrante=${x.sobrante}]`)).join(" ");

/** La posición vertical de un ancla respecto de la ventana. `null` si no está. */
async function alturaDe(ancla) {
  const r = await evaluar(`(() => {
    const el = [...document.querySelectorAll('[data-ancla="${ancla}"]')].find(${VISIBLE});
    if (!el) return "null";
    const r = el.getBoundingClientRect();
    return JSON.stringify({
      top: Math.round(r.top),
      dentro: r.top < window.innerHeight && r.bottom > 0,
    });
  })()`);
  return r === "null" ? null : JSON.parse(r);
}

/**
 * Espera hasta que la URL deje de ser la que se le pasa.
 *
 * ── POR QUÉ NO ES UN `sleep` ────────────────────────────────────────────
 *
 * Estaba escrito como `await sleep(900)` y el producto pasaba mientras el combo
 * fallaba: su editor tarda un poco más en montar. Un número que anda para un
 * caso y no para el otro es exactamente el timeout arbitrario que el pedido
 * descarta — y el síntoma era "no se encontró Cancelar", que apunta a otro lado.
 */
async function esperarUrlDistintaDe(anterior, intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    await sleep(150);
    const u = await evaluar("location.pathname + location.search");
    if (u !== anterior) return u;
  }
  return evaluar("location.pathname + location.search");
}

/**
 * Espera a que el FORMULARIO del editor esté montado, no solo la ruta.
 *
 * ── LA CONDICIÓN QUE FALTABA ────────────────────────────────────────────
 *
 * La URL cambia en cuanto navega, pero el editor pide el producto y dibuja el
 * formulario después. Entre las dos cosas la pantalla tiene solo "Volver", así
 * que buscar "Cancelar" ahí falla — y el mensaje manda a buscar el defecto al
 * editor cuando en realidad no se había terminado de abrir.
 *
 * Con el `sleep(900)` anterior esto quedaba tapado por casualidad: la espera
 * fija era más lenta que la navegación. Al reemplazarla por una condición —que
 * es más rápida— el hueco quedó a la vista. Es la misma familia que el timeout
 * arbitrario: andaba por el número, no por la razón.
 */
/**
 * Espera a que la pantalla esté ASENTADA antes de medir alturas.
 *
 * ── POR QUÉ HACE FALTA, Y QUÉ SE MIDIÓ MAL SIN ESTO ─────────────────────
 *
 * El bloque de cards de arriba llega DESPUÉS del listado: sus contadores son
 * otra consulta. Mientras no está, todo lo que va abajo —el buscador y las
 * tarjetas— está más arriba de donde va a quedar.
 *
 * Midiendo "antes" sin el bloque y "después" con él, la diferencia que sale no
 * es que el scroll no se restauró: es que se compararon dos pantallas distintas.
 * En el listado de combos, que entra entero sin scroll, eso dio 66 px y 259 px
 * de diferencia sobre un comportamiento correcto.
 *
 * Es la regla de comparar lo mismo de los dos lados, aplicada al tiempo en vez
 * de al tamaño de la ventana.
 */
async function esperarPantallaAsentada(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    await sleep(150);
    const listo = await evaluar(
      `[...document.querySelectorAll("section button[aria-pressed]")].filter(${VISIBLE}).length > 0`
    );
    if (listo) {
      // Un cuadro más para que el layout termine de acomodarse.
      await sleep(300);
      return true;
    }
  }
  return false;
}

async function esperarEditor(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    await sleep(150);
    const listo = await evaluar(
      `[...document.querySelectorAll("button")].filter(${VISIBLE}).some((b) => /cancelar|guardar/i.test(b.innerText || ""))`
    );
    if (listo) return true;
  }
  return false;
}

/** Toca el botón Editar de una card/fila por su ancla. */
async function tocarEditarDe(ancla, desde) {
  const ok = await evaluar(`(() => {
    const el = [...document.querySelectorAll('[data-ancla="${ancla}"]')].find(${VISIBLE});
    if (!el) return false;
    const b = [...el.querySelectorAll("button, a")].find((x) =>
      /editar/i.test((x.innerText || "") + " " + (x.getAttribute("aria-label") || ""))
    );
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no se encontró Editar dentro de ${ancla}`);
  await esperarUrlDistintaDe(desde);
}

async function capturar(nombre, url) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(SALIDA, `${nombre}.png`), Buffer.from(data, "base64"));
  console.log(`        captura: ${path.join(SALIDA, `${nombre}.png`)}`);
  console.log(`        URL:     ${url}`);
}

const edge = spawn(
  EDGE,
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   `--window-size=${ANCHO},${ALTO}`, "--no-first-run", "--disable-gpu"],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

/** Un ciclo completo: anotar, editar, volver, comparar. */
async function ciclo({ nombre, urlListado, indice, salir, capturaPrefijo }) {
  await navegar(`${BASE}${urlListado}`);
  if ((await esperarLista()) === 0) morir(`${nombre}: la lista no se montó`);
  await esperarPantallaAsentada();

  const antes = await leer();
  if (antes.cantidad <= indice) {
    return { salteado: `solo hay ${antes.cantidad} elementos y se pedía el ${indice + 1}` };
  }
  const ancla = antes.anclas[indice];
  // Se lo lleva a media pantalla para que el caso no sea el trivial de estar
  // arriba de todo: si el scroll no se restaurara, la diferencia se vería.
  await evaluar(`[...document.querySelectorAll('[data-ancla="${ancla}"]')].find(${VISIBLE}).scrollIntoView({block:"center"})`);
  await sleep(500);
  const alturaAntes = await alturaDe(ancla);
  const contAntes = await contenedores();
  const urlAntes = antes.url;

  await tocarEditarDe(ancla, urlAntes);
  const enElEditor = await evaluar("location.pathname + location.search");
  afirmar(
    !enElEditor.startsWith("/modulos/productos?") && enElEditor.includes("/modulos/productos"),
    `${nombre}: se abrió el editor`,
    enElEditor
  );
  afirmar(
    urlAntes.includes("?") ? enElEditor.includes("?") : true,
    `${nombre}: LA QUERY DEL LISTADO VIAJA AL EDITOR`,
    `listado=${urlAntes} · editor=${enElEditor}`
  );

  if (!(await esperarEditor())) morir(`${nombre}: el formulario del editor no se montó`);
  await salir();
  if ((await esperarLista()) === 0) morir(`${nombre}: no volvió al listado`);
  await esperarPantallaAsentada();
  await sleep(400);

  const despues = await leer();
  afirmar(mismaUrlDeListado(despues.url, urlAntes), `${nombre}: LA URL DEL LISTADO SE CONSERVA`,
    `antes=${urlAntes} · después=${despues.url}`);

  const alturaDespues = await alturaDe(ancla);
  afirmar(
    alturaDespues !== null && alturaDespues.dentro,
    `${nombre}: EL MISMO PRODUCTO QUEDA DENTRO DE LA PANTALLA`,
    alturaDespues ? `top=${alturaDespues.top}` : "no está en esta página"
  );
  if (alturaAntes && alturaDespues) {
    const dif = Math.abs(alturaDespues.top - alturaAntes.top);
    const contDespues = await contenedores();
    const detalle =
      `antes=${alturaAntes.top} después=${alturaDespues.top} · diferencia=${dif} px` +
      `\n        contenedores antes:   ${resumenContenedores(contAntes)}` +
      `\n        contenedores después: ${resumenContenedores(contDespues)}`;

    // ── EL LÍMITE FÍSICO DEL CONTENEDOR NO ES UNA FALLA ──────────────────
    //
    // Con una lista corta —el listado de combos tiene dos— no existe ningún
    // scroll que ponga el segundo elemento a media pantalla: no hay tanto
    // contenido. La restauración hizo todo lo que podía y el contenedor quedó
    // pegado a su tope.
    //
    // Se distingue POR EVIDENCIA y no por criterio: el contenedor visible tiene
    // que estar EXACTAMENTE en su máximo. En un valor intermedio podría haberse
    // movido más, y ahí sí sería una falla.
    //
    // Y se informa como NO ALCANZABLE, que NO es un pase: queda escrito que ese
    // caso no se pudo comprobar y con qué números.
    const visible = contDespues.find((c) => !c.ausente && c.visible && c.sobrante > 0);
    const enSuTope = visible && visible.scrollTop >= visible.sobrante;

    if (dif > TOLERANCIA && enSuTope) {
      nota(
        `${nombre}: A LA MISMA ALTURA — NO ALCANZABLE. ${detalle}\n        ` +
          `El contenedor quedó en su tope (${visible.scrollTop} de ${visible.sobrante} px de sobrante): ` +
          `con esta cantidad de elementos no hay scroll que lo suba más.`
      );
    } else {
      afirmar(dif <= TOLERANCIA, `${nombre}: A LA MISMA ALTURA (tolerancia ${TOLERANCIA} px)`, detalle);
    }
  }
  afirmar(
    despues.marcados.includes(ancla),
    `${nombre}: queda marcado con aria-current`,
    `marcados=${despues.marcados.join(", ") || "(ninguno)"}`
  );
  afirmar(despues.textoMarca, `${nombre}: y con el rótulo "${TEXTO_ULTIMO_EDITADO}"`);
  afirmar(
    despues.retenido === false,
    `${nombre}: el estado de retorno se consumió`,
    `retenido=${despues.retenido}`
  );
  afirmar(despues.desborde <= 0, `${nombre}: sin desborde horizontal`, `sobra ${despues.desborde} px`);
  if (capturaPrefijo) await capturar(capturaPrefijo, `${BASE}${despues.url}`);
  return { ancla, alturaAntes, alturaDespues };
}

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
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__alertas=[];window.alert=(m)=>{window.__alertas.push(String(m));};`,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  console.log("");
  console.log(`Midiendo ${BASE}/modulos/productos a ${ANCHO}×${ALTO}`);
  console.log("");

  // ── EL LISTADO DE PRUEBA: PÁGINA > 1, CON BÚSQUEDA, FILTRO Y ORDEN ──────
  //
  // Los cuatro a la vez, que es lo que el pedido pide: si la restauración
  // perdiera cualquiera de ellos, la URL de vuelta no sería la misma.
  const URL_LISTADO = "/modulos/productos?page=2&q=a&sortKey=precioVenta&sortDir=desc";
  await navegar(`${BASE}${URL_LISTADO}`);
  const n = await esperarLista();
  if (n === 0) morir("la lista de prueba no trajo ningún elemento");
  const inicial = await leer();
  afirmar(mismaUrlDeListado(inicial.url, URL_LISTADO), "el listado de prueba abre con los cuatro parámetros", inicial.url);
  afirmar(inicial.cantidad > 0, "y trae elementos con ancla", `${inicial.cantidad} anclas`);
  nota(`elementos en la página: ${inicial.cantidad}`);

  // La posición 20 pedida, o la última si hay menos. Se dice cuál se usó.
  const INDICE = Math.min(19, inicial.cantidad - 1);
  if (INDICE !== 19) nota(`se pedía la posición 20 y hay ${inicial.cantidad}: se usa la ${INDICE + 1}`);

  // ── 1 · PRODUCTO NORMAL, SALIENDO POR CANCELAR ─────────────────────────
  const cancelar = async () => {
    const ok = await evaluar(`(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /cancelar/i.test(x.innerText || ""));
      if (!b) return false; b.click(); return true;
    })()`);
    if (!ok) {
      // El mensaje dice DÓNDE estaba y qué botones había. "No se encontró
      // Cancelar" a secas manda a buscar el defecto al editor cuando el problema
      // puede ser que ni siquiera se llegó a abrirlo.
      const donde = await evaluar("location.pathname + location.search");
      const botones = await evaluar(
        `JSON.stringify([...document.querySelectorAll("button")].filter(${VISIBLE}).map((b)=>(b.innerText||"").trim().slice(0,20)).slice(0,12))`
      );
      throw new Error(`no se encontró Cancelar. URL=${donde} · botones visibles=${botones}`);
    }
    await esperarUrlDistintaDe(await evaluar("location.pathname + location.search"));
  };
  const r1 = await ciclo({
    nombre: "cancelar", urlListado: URL_LISTADO, indice: INDICE, salir: cancelar,
    capturaPrefijo: "01-vuelta-por-cancelar",
  });
  if (r1.salteado) nota(`cancelar: NO EJERCIDO — ${r1.salteado}`);

  // ── 2 · EL BOTÓN ATRÁS DE LA PANTALLA ──────────────────────────────────
  const botonAtras = async () => {
    const ok = await evaluar(`(() => {
      const b = [...document.querySelectorAll("a,button")].find((x) =>
        /volver|atr[áa]s/i.test((x.innerText || "") + " " + (x.getAttribute("aria-label") || ""))
      );
      if (!b) return false; b.click(); return true;
    })()`);
    if (!ok) throw new Error("no se encontró el botón de volver");
    await esperarUrlDistintaDe(await evaluar("location.pathname + location.search"));
  };
  const r2 = await ciclo({
    nombre: "botón Atrás", urlListado: URL_LISTADO, indice: INDICE, salir: botonAtras,
    capturaPrefijo: "02-vuelta-por-boton-atras",
  });
  if (r2.salteado) nota(`botón Atrás: NO EJERCIDO — ${r2.salteado}`);

  // ── 3 · EL ATRÁS DEL NAVEGADOR ─────────────────────────────────────────
  const atrasDelNavegador = async () => {
    const antes = await evaluar("location.pathname + location.search");
    await evaluar("history.back()");
    await esperarUrlDistintaDe(antes);
  };
  const r3 = await ciclo({
    nombre: "Atrás del navegador", urlListado: URL_LISTADO, indice: INDICE, salir: atrasDelNavegador,
    capturaPrefijo: "03-vuelta-por-atras-del-navegador",
  });
  if (r3.salteado) nota(`Atrás del navegador: NO EJERCIDO — ${r3.salteado}`);

  // ── 4 · GUARDAR ────────────────────────────────────────────────────────
  //
  // ⚠️ ESCRIBE EN LA BASE DE DESARROLLO. Se guarda SIN tocar ningún campo, así
  // que los valores quedan como estaban; lo que cambia es `updatedAt`. Se dice
  // acá y en el informe: una sonda que escribe y no lo declara es peor que una
  // que no prueba el caso.
  const guardar = async () => {
    const ok = await evaluar(`(() => {
      const b = [...document.querySelectorAll("button")].find((x) =>
        /guardar/i.test(x.innerText || "") && !x.disabled
      );
      if (!b) return false; b.click(); return true;
    })()`);
    if (!ok) throw new Error("no se encontró Guardar en el editor");
    await esperarUrlDistintaDe(await evaluar("location.pathname + location.search"));
  };
  const r4 = await ciclo({
    nombre: "guardar", urlListado: URL_LISTADO, indice: INDICE, salir: guardar,
    capturaPrefijo: "04-vuelta-por-guardar",
  });
  if (r4.salteado) nota(`guardar: NO EJERCIDO — ${r4.salteado}`);

  // ── 5 · COMBO ──────────────────────────────────────────────────────────
  //
  // Se busca un combo en el listado. Si no hay ninguno en estos datos se DICE:
  // no se fabrica una fila para que la sonda cierre.
  const URL_COMBOS = "/modulos/productos?tipo=combos";
  await navegar(`${BASE}${URL_COMBOS}`);
  await esperarLista();
  await sleep(700);
  const listaCombos = await leer();
  const anclaCombo = (listaCombos.anclas || []).find((a) => a && a.startsWith("combo:"));
  if (!anclaCombo) {
    nota("COMBO: NO EJERCIDO — no hay ningún combo en el listado de esta ubicación.");
    nota("       No se crea uno: una fila fabricada probaría que el código dibuja algo.");
  } else {
    nota(`combo de prueba: ${anclaCombo}`);
    const rc1 = await ciclo({
      nombre: "combo · cancelar", urlListado: URL_COMBOS, indice: listaCombos.anclas.indexOf(anclaCombo),
      salir: cancelar, capturaPrefijo: "05-combo-cancelar",
    });
    if (rc1.salteado) nota(`combo cancelar: NO EJERCIDO — ${rc1.salteado}`);
    const rc2 = await ciclo({
      nombre: "combo · guardar", urlListado: URL_COMBOS, indice: listaCombos.anclas.indexOf(anclaCombo),
      salir: guardar, capturaPrefijo: "06-combo-guardar",
    });
    if (rc2.salteado) nota(`combo guardar: NO EJERCIDO — ${rc2.salteado}`);
  }

  // ── 6 · ENTRADA FRESCA: NI MARCA NI SALTO ──────────────────────────────
  //
  // Es lo que pide que la marca se borre al entrar de cero. Se comprueba
  // ADEMÁS que no quede estado retenido: si quedara, la próxima entrada
  // saltaría sola.
  await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
  await navegar(`${BASE}/modulos/productos`);
  await esperarLista();
  await sleep(900);
  const fresca = await leer();
  afirmar(fresca.marcados.length === 0, "ENTRADA FRESCA: no hay nada marcado",
    `marcados=${fresca.marcados.join(", ") || "(ninguno)"}`);
  afirmar(!fresca.textoMarca, `ENTRADA FRESCA: no aparece "${TEXTO_ULTIMO_EDITADO}"`);
  afirmar(fresca.retenido === false, "ENTRADA FRESCA: no queda estado de retorno");
  const arribaDeTodo = await evaluar(`(() => {
    const m = document.querySelector("main");
    return m ? Math.round(m.scrollTop) : -1;
  })()`);
  afirmar(arribaDeTodo === 0, "ENTRADA FRESCA: el listado arranca arriba de todo",
    `scrollTop=${arribaDeTodo}`);
  afirmar(fresca.desborde <= 0, "ENTRADA FRESCA: sin desborde", `sobra ${fresca.desborde} px`);
  await capturar("07-entrada-fresca", `${BASE}/modulos/productos`);

  // ── 6-bis · ENTRAR POR OTRA URL CON UN ESTADO PENDIENTE ────────────────
  //
  // ── EL DEFECTO QUE ESTE BLOQUE FIJA ────────────────────────────────────
  //
  // El estado guardaba la URL del listado y nadie la comparaba: solo se
  // validaban la forma y el vencimiento. Así, con el editor abandonado sin
  // volver, entrar a Productos por OTRA URL dentro de la media hora movía el
  // scroll y marcaba un producto que no tenía nada que ver.
  //
  // Se ejerce el camino completo: se abre el editor desde la página 2 con
  // filtros —lo que deja el estado escrito—, se abandona navegando a otro lado,
  // y se entra al listado limpio.
  await navegar(`${BASE}${URL_LISTADO}`);
  await esperarLista();
  await esperarPantallaAsentada();
  const previo = await leer();
  const anclaPrevia = previo.anclas[Math.min(19, previo.cantidad - 1)];
  await evaluar(
    `[...document.querySelectorAll('[data-ancla="${anclaPrevia}"]')].find(${VISIBLE}).scrollIntoView({block:"center"})`
  );
  await sleep(400);
  await tocarEditarDe(anclaPrevia, previo.url);
  if (!(await esperarEditor())) morir("abandono: el editor no se montó");

  const conEstado = await evaluar(
    `(() => { try { return !!sessionStorage.getItem(${JSON.stringify(CLAVE_ESTADO_RETORNO)}); } catch (e) { return null; } })()`
  );
  afirmar(conEstado === true, "ABANDONO: al abrir el editor quedó un estado pendiente", `retenido=${conEstado}`);

  // Se abandona el editor sin volver por ninguno de sus botones.
  await navegar(`${BASE}/inicio`);
  await sleep(600);
  // Y se entra al listado por OTRA URL.
  await navegar(`${BASE}/modulos/productos`);
  await esperarLista();
  await esperarPantallaAsentada();
  await sleep(600);
  const otra = await leer();

  afirmar(
    otra.marcados.length === 0,
    "OTRA URL: NO SE MARCA NINGÚN PRODUCTO",
    `marcados=${otra.marcados.join(", ") || "(ninguno)"} — el estado era de ${anclaPrevia}`
  );
  afirmar(!otra.textoMarca, `OTRA URL: no aparece "${TEXTO_ULTIMO_EDITADO}"`);
  const scrollOtra = await evaluar(`(() => {
    const m = document.querySelector("main");
    return m ? Math.round(m.scrollTop) : -1;
  })()`);
  afirmar(
    scrollOtra === 0,
    "OTRA URL: EL SCROLL NO SE MOVIÓ (queda en 0)",
    `main.scrollTop=${scrollOtra}`
  );
  afirmar(
    otra.retenido === false,
    "OTRA URL: el estado incompatible quedó CONSUMIDO",
    `retenido=${otra.retenido} — si quedara, saltaría en la próxima entrada`
  );
  afirmar(otra.desborde <= 0, "OTRA URL: sin desborde", `sobra ${otra.desborde} px`);
  await capturar("09-entrada-por-otra-url", `${BASE}/modulos/productos`);

  // ── 6-ter · VER NO ES EDITAR ───────────────────────────────────────────
  //
  // `abrirVer` guardaba el estado de edición, así que abrir la ficha y volver
  // habría dejado el producto rotulado "Último editado" sin que nadie lo hubiera
  // editado.
  //
  // ── LO QUE ESTE BLOQUE EJERCE, Y LO QUE NO ─────────────────────────────
  //
  // **`abrirVer` NO TIENE NINGÚN LLAMADOR.** Comprobado con `git grep`: la
  // función existe y ninguna superficie la invoca — la tarjeta del celular solo
  // tiene "Editar" y la tabla tiene "Ver composición", que es otra cosa. O sea
  // que ese defecto estaba en el código y no se podía alcanzar desde la
  // pantalla.
  //
  // Por eso acá NO se toca un botón: no hay ninguno que llegue. Se entra a la
  // ficha por su URL, que es a donde `abrirVer` llevaría, y se comprueba el
  // comportamiento visible: volver de mirar una ficha no marca nada.
  //
  // Lo que sí ata la función es el candado R30, que lee el código. Se dice acá
  // para que nadie lea estas tres afirmaciones como "se ejerció el camino de
  // Ver": no se ejerció, porque el camino no existe.
  nota("VER: `abrirVer` no tiene llamadores; se ejerce la ficha por su URL, no un botón");
  await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
  await navegar(`${BASE}${URL_LISTADO}`);
  await esperarLista();
  await esperarPantallaAsentada();
  const antesDeVer = await leer();
  const anclaVer = antesDeVer.anclas[Math.min(19, antesDeVer.cantidad - 1)];
  const idVer = anclaVer.split(":")[1];

  // Se entra a la ficha por su ruta, que es a donde lleva `abrirVer`.
  await navegar(`${BASE}/modulos/productos/${idVer}?${URL_LISTADO.split("?")[1]}`);
  await sleep(1500);
  const trasAbrirLaFicha = await evaluar(
    `(() => { try { return !!sessionStorage.getItem(${JSON.stringify(CLAVE_ESTADO_RETORNO)}); } catch (e) { return null; } })()`
  );
  afirmar(
    trasAbrirLaFicha === false,
    "VER: entrar a la ficha por su URL no deja estado de edición",
    `retenido=${trasAbrirLaFicha}`
  );

  await navegar(`${BASE}${URL_LISTADO}`);
  await esperarLista();
  await esperarPantallaAsentada();
  await sleep(600);
  const trasVolverDeVer = await leer();
  afirmar(
    trasVolverDeVer.marcados.length === 0,
    "VER: volver de la ficha NO marca nada",
    `marcados=${trasVolverDeVer.marcados.join(", ") || "(ninguno)"}`
  );
  afirmar(
    !trasVolverDeVer.textoMarca,
    `VER: y no aparece "${TEXTO_ULTIMO_EDITADO}" — nadie editó nada`
  );
  await capturar("10-volver-de-ver-sin-marca", `${BASE}${trasVolverDeVer.url}`);

  // ── 7 · ESCRITORIO A 1366: NO SE RESTAURA, Y ESO ES LO CORRECTO ────────
  //
  // ── QUÉ AFIRMABA ANTES ESTE BLOQUE, Y POR QUÉ AHORA AFIRMA LO CONTRARIO ─
  //
  // Corría el mismo ciclo que en el celular y exigía que el producto volviera a
  // la misma altura. Eso era del alcance equivocado: la restauración de posición
  // es de la vista MÓVIL, y la tabla de escritorio estaba aprobada y tiene que
  // quedar como estaba.
  //
  // Se invierte en vez de borrarse, por el mismo motivo de siempre: sin nada que
  // mire escritorio, volver a agregarle la marca o el ancla no pondría nada rojo.
  // Ahora se exige que NO haya ancla, que NO se marque, que NO se guarde estado
  // y que el scroll NO se toque.
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1366, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
  await navegar(`${BASE}${URL_LISTADO}`);

  // No se puede esperar por anclas: en escritorio no tiene que haber ninguna.
  // Se espera por la TABLA con filas de datos, que es lo que se dibuja ahí.
  let tablaLista = false;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    tablaLista = await evaluar(
      `[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`
    );
    if (tablaLista) break;
  }
  if (!tablaLista) morir("escritorio: la tabla no llegó a tener filas de datos");
  await sleep(1000);

  const esc = await leer();
  afirmar(
    esc.cantidad === 0,
    "ESCRITORIO: la tabla NO tiene anclas de restauración",
    `anclas visibles=${esc.cantidad}`
  );
  afirmar(esc.marcados.length === 0, "ESCRITORIO: no hay nada marcado", `marcados=${esc.marcados.join(", ") || "(ninguno)"}`);
  afirmar(!esc.textoMarca, `ESCRITORIO: no aparece "${TEXTO_ULTIMO_EDITADO}"`);

  // ── SE DESPLAZA LA TABLA DE VERDAD, Y ESA ES LA CORRECCIÓN ─────────────
  //
  // La versión anterior de este bloque medía el scroll de la tabla en 0 antes y
  // en 0 después: nunca la desplazaba. Comparaba dos ceros y daba verde sobre
  // una regresión —escritorio había perdido su restauración— sin decir nada.
  //
  // Ahora se la lleva a más de 200 px y se elige una fila de la MITAD de lo
  // visible, que es lo único que hace que la comparación signifique algo.
  //
  // ── Y AHORA EL QUE SE DESPLAZA ES EL `<main>`, NO LA TABLA ─────────────
  //
  // La tabla dejó de tener scroll vertical propio: crece con sus 25 filas y el
  // único desplazamiento vertical de la pantalla es el de la página. Si esto
  // siguiera midiendo `#productos-scroll` mediría un contenedor cuyo `scrollTop`
  // vale 0 siempre — o sea, volvería a comparar dos ceros, que es exactamente el
  // defecto que este bloque existe para no repetir.
  const cicloEscritorio = async (nombreSalida, salir) => {
    await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
    await navegar(`${BASE}${URL_LISTADO}`);
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      if (await evaluar(`[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`)) break;
    }
    await sleep(1000);

    const desplazo = await evaluar(`(() => {
      const c = document.querySelector("main");
      if (!c) return -1;
      const objetivo = Math.min(300, Math.max(0, c.scrollHeight - c.clientHeight));
      c.scrollTop = objetivo;
      return Math.round(c.scrollTop);
    })()`);
    afirmar(
      desplazo > 200,
      `ESCRITORIO · ${nombreSalida}: LA PÁGINA se desplazó de verdad`,
      `main.scrollTop=${desplazo} — con 0 la comparación no significaría nada`
    );
    if (desplazo <= 200) return;
    await sleep(400);

    // Una fila de la MITAD de lo que se ve, no la primera. Lo que se ve lo
    // define ahora el `<main>`, que es el que recorta.
    const elegida = JSON.parse(await evaluar(`(() => {
      const c = document.querySelector("main");
      const rc = c.getBoundingClientRect();
      const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => {
        if (f.children.length <= 1) return false;
        const r = f.getBoundingClientRect();
        return r.top >= rc.top && r.bottom <= rc.bottom;
      });
      if (filas.length === 0) return JSON.stringify({ hay: false });
      const f = filas[Math.floor(filas.length / 2)];
      const b = [...f.querySelectorAll("button")].find((x) =>
        /editar/i.test((x.getAttribute("aria-label") || "") + " " + (x.getAttribute("title") || ""))
      );
      if (!b) return JSON.stringify({ hay: false });
      f.setAttribute("data-sonda-elegida", "1");
      return JSON.stringify({ hay: true, visibles: filas.length, texto: (f.innerText || "").split("\\n")[0].slice(0, 30) });
    })()`));
    afirmar(elegida.hay, `ESCRITORIO · ${nombreSalida}: hay una fila visible de la mitad con Editar`,
      elegida.hay ? `${elegida.visibles} filas visibles · ${elegida.texto}` : "ninguna");
    if (!elegida.hay) return;

    const scrollAntes = await evaluar(`Math.round(document.querySelector("main").scrollTop)`);
    const urlAntes = await evaluar("location.pathname + location.search");
    await evaluar(`(() => {
      const f = document.querySelector('[data-sonda-elegida]');
      const b = [...f.querySelectorAll("button")].find((x) =>
        /editar/i.test((x.getAttribute("aria-label") || "") + " " + (x.getAttribute("title") || ""))
      );
      b.click();
      return true;
    })()`);
    await esperarUrlDistintaDe(urlAntes);

    const enEditor = await evaluar("location.pathname + location.search");
    afirmar(
      enEditor.includes("/editar"),
      `ESCRITORIO · ${nombreSalida}: EDITAR ABRE IGUAL`,
      enEditor
    );
    const estadoMovil = await evaluar(
      `(() => { try { return !!sessionStorage.getItem(${JSON.stringify(CLAVE_ESTADO_RETORNO)}); } catch (e) { return null; } })()`
    );
    afirmar(
      estadoMovil === false,
      `ESCRITORIO · ${nombreSalida}: NO se guardó el estado MÓVIL`,
      `retenido=${estadoMovil} — desde la tabla va el mecanismo de escritorio`
    );
    const legacy = JSON.parse(await evaluar(`(() => {
      try {
        return JSON.stringify({
          scroll: sessionStorage.getItem("productos:scrollY"),
          seleccion: sessionStorage.getItem("productos:selectedProductId"),
        });
      } catch (e) { return JSON.stringify({ scroll: null, seleccion: null }); }
    })()`));
    afirmar(
      legacy.scroll !== null && legacy.seleccion !== null,
      `ESCRITORIO · ${nombreSalida}: SÍ se guardó el retorno de escritorio`,
      `productos:scrollY=${legacy.scroll} · productos:selectedProductId=${legacy.seleccion}`
    );

    if (!(await esperarEditor())) morir(`escritorio ${nombreSalida}: el editor no se montó`);
    await salir();
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      if (await evaluar(`[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`)) break;
    }
    await sleep(1200);

    const volvio = await leer();
    const scrollDespues = await evaluar(`Math.round(document.querySelector("main").scrollTop)`);
    const dif = Math.abs(scrollDespues - scrollAntes);
    afirmar(
      dif <= 2,
      `ESCRITORIO · ${nombreSalida}: EL SCROLL DE LA PÁGINA VUELVE (tolerancia 2 px)`,
      `main antes=${scrollAntes} después=${scrollDespues} · diferencia=${dif} px`
    );
    // Y la tabla NO se quedó con nada: si volviera a tener scroll propio, el de
    // la página podría restaurarse bien y la lista igual aparecer en otro lugar.
    const internoAlVolver = await evaluar(`(() => {
      const c = document.getElementById("productos-scroll");
      return c ? Math.round(c.scrollHeight - c.clientHeight) : -1;
    })()`);
    afirmar(
      internoAlVolver === 0,
      `ESCRITORIO · ${nombreSalida}: la tabla sigue sin scroll vertical propio`,
      `sobrante interno=${internoAlVolver} px`
    );

    // La clase la compone `claseDeFila`: con `tono="atencion"` la fila lleva
    // `sunmi-fila-atencion`. Se busca ESA y no una inventada — un selector que
    // no matchea nunca daría cero y el candado se leería como "se perdió la
    // selección" sobre una pantalla correcta.
    const seleccionada = await evaluar(`(() => {
      return [...document.querySelectorAll("table tbody tr")].filter(
        (x) => (x.className || "").includes("sunmi-fila-atencion")
      ).length;
    })()`);
    afirmar(
      seleccionada >= 1,
      `ESCRITORIO · ${nombreSalida}: LA FILA SIGUE SELECCIONADA`,
      `filas con tinte=${seleccionada}`
    );
    afirmar(
      volvio.cantidad === 0 && volvio.marcados.length === 0 && !volvio.textoMarca,
      `ESCRITORIO · ${nombreSalida}: sin ancla, sin aria-current y sin píldora`,
      `anclas=${volvio.cantidad} marcados=${volvio.marcados.length}`
    );
    afirmar(volvio.desborde <= 0, `ESCRITORIO · ${nombreSalida}: sin desborde a 1366`, `sobra ${volvio.desborde} px`);
    await capturar(`08-escritorio-1366-${nombreSalida}`, `${BASE}${URL_LISTADO}`);
  };

  await cicloEscritorio("cancelar", cancelar);
  // Guardar SIN tocar ningún campo: los valores quedan como estaban.
  await cicloEscritorio("guardar", guardar);

  // ── 8 · EL COMBO DE ESCRITORIO NO GANA NADA ────────────────────────────
  //
  // En `c12de2c7`, desde la tabla, el editor de combo se abría SIN query y sus
  // tres salidas iban a destinos fijos: guardar a `?tipo=combos`, cancelar y
  // atrás a `/modulos/productos`. Al arreglar el retorno del celular eso se
  // unificó y escritorio ganó un comportamiento que no tenía.
  //
  // Acá se comprueban los cinco puntos, uno por uno.
  const comboEscritorio = async (nombreSalida, salir, destinoEsperado) => {
    await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
    await navegar(`${BASE}/modulos/productos?tipo=combos`);
    for (let i = 0; i < 120; i++) {
      await sleep(250);
      if (await evaluar(`[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`)) break;
    }
    await sleep(1000);

    const urlAntes = await evaluar("location.pathname + location.search");
    const toco = await evaluar(`(() => {
      const fila = [...document.querySelectorAll("table tbody tr")].find((f) => f.children.length > 1);
      if (!fila) return false;
      const b = [...fila.querySelectorAll("button")].find((x) =>
        /editar/i.test((x.getAttribute("aria-label") || "") + " " + (x.getAttribute("title") || ""))
      );
      if (!b) return false;
      b.click();
      return true;
    })()`);
    afirmar(toco, `COMBO ESCRITORIO · ${nombreSalida}: se pudo abrir un combo desde la tabla`);
    if (!toco) return;
    await esperarUrlDistintaDe(urlAntes);

    const enEditor = await evaluar("location.pathname + location.search");
    afirmar(
      enEditor.includes("/editar-combo/"),
      `COMBO ESCRITORIO · ${nombreSalida}: abrió el editor de combo`,
      enEditor
    );
    afirmar(
      !enEditor.includes("?"),
      `COMBO ESCRITORIO · ${nombreSalida}: EL EDITOR NO LLEVA QUERY DE RETORNO`,
      `${enEditor} — en c12de2c7 se abría pelado`
    );
    afirmar(
      !enEditor.includes("origen="),
      `COMBO ESCRITORIO · ${nombreSalida}: no lleva el marcador de origen móvil`,
      enEditor
    );
    const estadoMovil = await evaluar(
      `(() => { try { return !!sessionStorage.getItem(${JSON.stringify(CLAVE_ESTADO_RETORNO)}); } catch (e) { return null; } })()`
    );
    afirmar(
      estadoMovil === false,
      `COMBO ESCRITORIO · ${nombreSalida}: NO se escribió estado móvil`,
      `retenido=${estadoMovil}`
    );

    if (!(await esperarEditor())) morir(`combo escritorio ${nombreSalida}: el editor no se montó`);
    await salir();
    await sleep(1500);
    const destino = await evaluar("location.pathname + location.search");
    afirmar(
      destino === destinoEsperado,
      `COMBO ESCRITORIO · ${nombreSalida}: VUELVE AL DESTINO DE c12de2c7`,
      `esperado=${destinoEsperado} · obtenido=${destino}`
    );
    await capturar(`11-combo-escritorio-${nombreSalida}`, `${BASE}${destino}`);
  };

  await comboEscritorio("cancelar", cancelar, "/modulos/productos");
  await comboEscritorio("guardar", guardar, "/modulos/productos?tipo=combos");

  // ── 9 · UN SOLO SCROLL VERTICAL EN LA PANTALLA ─────────────────────────
  //
  // La tabla tenía `max-h-[70dvh]` y su propio `overflow-auto`, así que había
  // DOS barras verticales: la de la tabla y la de la página. Ahora la tabla
  // crece con sus filas y la única que desplaza es la página.
  //
  // Se miden las tres cosas por separado porque fallan por separado: que la
  // tabla no tenga sobrante vertical, que el que se mueve sea el `<main>`, y que
  // el desplazamiento LATERAL siga estando —que es lo que se perdería si alguien
  // "arreglara" esto sacándole el overflow al envoltorio—.
  await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
  await navegar(`${BASE}${URL_LISTADO}`);
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    if (await evaluar(`[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`)) break;
  }
  await sleep(1200);

  const ejes = JSON.parse(await evaluar(`(() => {
    const c = document.getElementById("productos-scroll");
    const m = document.querySelector("main");
    const t = document.querySelector("table");
    const th = t ? t.querySelector("thead") : null;
    const cs = c ? getComputedStyle(c) : null;
    return JSON.stringify({
      hayEnvoltorio: !!c,
      internoVertical: c ? Math.round(c.scrollHeight - c.clientHeight) : -1,
      internoHorizontal: c ? Math.round(c.scrollWidth - c.clientWidth) : -1,
      maxHeight: cs ? cs.maxHeight : null,
      overflowX: cs ? cs.overflowX : null,
      paginaVertical: m ? Math.round(m.scrollHeight - m.clientHeight) : -1,
      filas: t ? t.querySelectorAll("tbody tr").length : 0,
      altoTabla: t ? Math.round(t.getBoundingClientRect().height) : 0,
      posicionThead: th ? getComputedStyle(th).position : null,
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    });
  })()`));

  afirmar(ejes.hayEnvoltorio, "SCROLL ÚNICO: el envoltorio de la tabla sigue existiendo", "#productos-scroll");
  afirmar(
    ejes.internoVertical === 0,
    "SCROLL ÚNICO: LA TABLA NO TIENE DESPLAZAMIENTO VERTICAL INTERNO",
    `sobrante interno=${ejes.internoVertical} px · max-height=${ejes.maxHeight}`
  );
  afirmar(
    ejes.maxHeight === "none",
    "SCROLL ÚNICO: no quedó ningún tope de alto",
    `max-height=${ejes.maxHeight}`
  );
  afirmar(
    ejes.paginaVertical > 0,
    "SCROLL ÚNICO: EL QUE DESPLAZA ES LA PÁGINA",
    `sobrante del <main>=${ejes.paginaVertical} px · la tabla mide ${ejes.altoTabla} px con ${ejes.filas} filas`
  );
  afirmar(
    ejes.internoHorizontal > 0 && ejes.overflowX === "auto",
    "SCROLL ÚNICO: EL DESPLAZAMIENTO LATERAL SIGUE DISPONIBLE",
    `sobrante lateral=${ejes.internoHorizontal} px · overflow-x=${ejes.overflowX}`
  );
  afirmar(ejes.desborde <= 0, "SCROLL ÚNICO: sin desborde a 1366", `sobra ${ejes.desborde} px`);
  nota(
    `el encabezado ya no queda fijo: position del thead = ${ejes.posicionThead}. ` +
      `Es la consecuencia declarada de conservar el overflow lateral.`
  );

  // Y se comprueba MOVIENDO: el que cambia de scrollTop tiene que ser el <main>.
  const quienSeMueve = JSON.parse(await evaluar(`(() => {
    const c = document.getElementById("productos-scroll");
    const m = document.querySelector("main");
    const antes = { c: Math.round(c.scrollTop), m: Math.round(m.scrollTop) };
    m.scrollTop = 250;
    c.scrollTop = 250;
    return JSON.stringify({
      antes,
      despues: { c: Math.round(c.scrollTop), m: Math.round(m.scrollTop) },
    });
  })()`));
  afirmar(
    quienSeMueve.despues.m > 200 && quienSeMueve.despues.c === 0,
    "SCROLL ÚNICO: PEDIRLE SCROLL A LA TABLA NO HACE NADA; A LA PÁGINA SÍ",
    `main ${quienSeMueve.antes.m}→${quienSeMueve.despues.m} · tabla ${quienSeMueve.antes.c}→${quienSeMueve.despues.c}`
  );
  await capturar("12-escritorio-scroll-unico", `${BASE}${URL_LISTADO}`);

  // ── 10 · RECORRER LOS PRODUCTOS CON LAS FLECHAS ────────────────────────
  //
  // La fila que ya se teñía al tocarla es el cursor. Se ejerce la secuencia
  // completa del pedido —tocar la 10, bajar tres veces, subir dos— comparando el
  // NOMBRE de la fila teñida contra el de la fila que corresponde por posición.
  //
  // Comparar por nombre y no por "hay una fila teñida" es lo que distingue
  // "avanzó una" de "avanzó dos" y de "no se movió": las tres dejan exactamente
  // una fila teñida.
  await evaluar(`try { sessionStorage.clear(); } catch (e) {}`);
  await navegar(`${BASE}${URL_LISTADO}`);
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    if (await evaluar(`[...document.querySelectorAll("table tbody tr")].some((f) => f.children.length > 1)`)) break;
  }
  await sleep(1200);

  // El texto de cada fila, en orden. Es la lista contra la que se compara todo.
  //
  // NO se usa el primer renglón: la primera celda es la miniatura, y sin foto
  // dice "-" en todas. Con eso, comparar el nombre de la fila teñida contra el
  // esperado comparaba "-" contra "-" y no distinguía una fila de otra — la
  // afirmación se habría leído como fuerte y no lo era. Se usa la fila entera,
  // que lleva nombre, códigos y precios.
  const nombresDeFila = JSON.parse(await evaluar(`(() => {
    return JSON.stringify(
      [...document.querySelectorAll("table tbody tr")]
        .filter((f) => f.children.length > 1)
        .map((f) => (f.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 60))
    );
  })()`));
  afirmar(
    new Set(nombresDeFila).size === nombresDeFila.length,
    "FLECHAS: cada fila se distingue de las otras por su texto",
    `${new Set(nombresDeFila).size} textos distintos sobre ${nombresDeFila.length} filas — si se repitieran, comparar por texto no afirmaría nada`
  );
  afirmar(
    nombresDeFila.length >= 15,
    "FLECHAS: hay filas suficientes para recorrer",
    `${nombresDeFila.length} filas`
  );

  /** Cuál fila está teñida ahora, por índice y por nombre. */
  const filaTenida = async () =>
    JSON.parse(await evaluar(`(() => {
      const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => f.children.length > 1);
      const i = filas.findIndex((f) => (f.className || "").includes("sunmi-fila-atencion"));
      const cuantas = filas.filter((f) => (f.className || "").includes("sunmi-fila-atencion")).length;
      return JSON.stringify({
        indice: i,
        cuantas,
        nombre: i >= 0 ? (filas[i].innerText || "").replace(/\\s+/g, " ").trim().slice(0, 60) : null,
      });
    })()`));

  /** Manda una flecha de verdad por CDP y dice si el navegador la dejó pasar. */
  const flecha = async (tecla) => {
    const codigo = tecla === "ArrowDown" ? 40 : 38;
    await send("Input.dispatchKeyEvent", {
      type: "rawKeyDown", key: tecla, code: tecla, windowsVirtualKeyCode: codigo, nativeVirtualKeyCode: codigo,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp", key: tecla, code: tecla, windowsVirtualKeyCode: codigo, nativeVirtualKeyCode: codigo,
    });
    await sleep(260);
  };

  // Tocar la fila 10 (índice 9). Se toca una CELDA y no el `<tr>`: es lo que
  // hace el dedo, y es lo que ejerce que el clic no caiga en un botón.
  await evaluar(`(() => {
    const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => f.children.length > 1);
    filas[9].querySelectorAll("td")[1].click();
    return true;
  })()`);
  await sleep(400);

  const trasTocar = await filaTenida();
  afirmar(
    trasTocar.indice === 9 && trasTocar.cuantas === 1,
    "FLECHAS: TOCAR LA FILA 10 LA SELECCIONA",
    `teñida la ${trasTocar.indice + 1} (${trasTocar.nombre}) · teñidas=${trasTocar.cuantas}`
  );

  // El foco tiene que haber quedado en la tabla: sin eso la primera flecha no
  // llega al manejador y el resto del bloque mediría otra cosa.
  const foco = await evaluar(`(() => {
    const a = document.activeElement;
    const t = document.querySelector("table");
    if (!a || !t) return "ninguno";
    return (a.tagName || "?") + (a.contains(t) ? " (contiene la tabla)" : " (fuera de la tabla)");
  })()`);
  afirmar(
    /contiene la tabla/.test(foco),
    "FLECHAS: LA TABLA CONSERVA EL FOCO DESPUÉS DE SELECCIONAR",
    `activeElement=${foco}`
  );

  // ArrowDown tres veces: 11, 12 y 13, una por pulsación.
  for (const esperado of [10, 11, 12]) {
    await flecha("ArrowDown");
    const ahora = await filaTenida();
    afirmar(
      ahora.indice === esperado && ahora.cuantas === 1 && ahora.nombre === nombresDeFila[esperado],
      `FLECHAS: ArrowDown deja la fila ${esperado + 1} y NADA MÁS`,
      `teñida la ${ahora.indice + 1} (${ahora.nombre}) · esperada la ${esperado + 1} (${nombresDeFila[esperado]}) · teñidas=${ahora.cuantas}`
    );
  }

  // ArrowUp dos veces: 12 y después 11.
  for (const esperado of [11, 10]) {
    await flecha("ArrowUp");
    const ahora = await filaTenida();
    afirmar(
      ahora.indice === esperado && ahora.cuantas === 1 && ahora.nombre === nombresDeFila[esperado],
      `FLECHAS: ArrowUp deja la fila ${esperado + 1} y NADA MÁS`,
      `teñida la ${ahora.indice + 1} (${ahora.nombre}) · esperada la ${esperado + 1} · teñidas=${ahora.cuantas}`
    );
  }

  // ── LA FLECHA NO MUEVE LA PÁGINA POR SU CUENTA ─────────────────────────
  //
  // Es la contraprueba del `preventDefault`, y hay que montarla con cuidado: si
  // la fila de destino está fuera de la pantalla, el `scrollIntoView` desplaza
  // legítimamente y la medición no distingue una cosa de la otra.
  //
  // Por eso se elige un par de filas CONSECUTIVAS que ya se vean las dos
  // enteras. Ahí el desplazamiento correcto es exactamente CERO: lo único que
  // puede mover la página es la flecha sin atajar.
  const parVisible = JSON.parse(await evaluar(`(() => {
    const m = document.querySelector("main").getBoundingClientRect();
    const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => f.children.length > 1);
    for (let i = 0; i < filas.length - 1; i++) {
      const a = filas[i].getBoundingClientRect();
      const b = filas[i + 1].getBoundingClientRect();
      if (a.top >= m.top && b.bottom <= m.bottom) {
        filas[i].querySelectorAll("td")[1].click();
        return JSON.stringify({ hay: true, i });
      }
    }
    return JSON.stringify({ hay: false });
  })()`));
  afirmar(
    parVisible.hay,
    "FLECHAS: hay dos filas consecutivas enteramente visibles para medir el atajo",
    parVisible.hay ? `filas ${parVisible.i + 1} y ${parVisible.i + 2}` : "ninguna"
  );
  if (parVisible.hay) {
    await sleep(350);
    const antesDeLaFlecha = await evaluar(`Math.round(document.querySelector("main").scrollTop)`);
    await flecha("ArrowDown");
    const despuesDeLaFlecha = await evaluar(`Math.round(document.querySelector("main").scrollTop)`);
    const movio = Math.abs(despuesDeLaFlecha - antesDeLaFlecha);
    const dondeQuedo = await filaTenida();
    afirmar(
      movio === 0,
      "FLECHAS: LA TECLA SE ATAJA — la página no se mueve sola",
      `main ${antesDeLaFlecha}→${despuesDeLaFlecha} (${movio} px). ` +
        `Las dos filas ya se veían enteras, así que traerla a la vista no desplaza: ` +
        `sin preventDefault, acá el navegador scrollea su paso de línea`
    );
    afirmar(
      dondeQuedo.indice === parVisible.i + 1,
      "FLECHAS: y el cursor igual avanzó UNA fila",
      `de la ${parVisible.i + 1} a la ${dondeQuedo.indice + 1}`
    );
  }

  // La fila seleccionada queda a la vista. Se baja hasta el final y se comprueba
  // en cada paso, que es donde la lista se va sin el `scrollIntoView`.
  //
  // Se arranca desde donde quedó el cursor y no desde un número escrito a mano:
  // el bloque de arriba lo dejó donde le tocó, y una constante acá haría que
  // este recorrido termine antes de la última fila sin que se note.
  const desdeDonde = (await filaTenida()).indice;
  let siempreVisible = true;
  let peor = null;
  for (let i = desdeDonde; i < nombresDeFila.length - 1; i++) {
    await flecha("ArrowDown");
    const v = JSON.parse(await evaluar(`(() => {
      const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => f.children.length > 1);
      const f = filas.find((x) => (x.className || "").includes("sunmi-fila-atencion"));
      if (!f) return JSON.stringify({ hay: false });
      const m = document.querySelector("main").getBoundingClientRect();
      const r = f.getBoundingClientRect();
      return JSON.stringify({
        hay: true,
        dentro: r.top >= m.top - 1 && r.bottom <= m.bottom + 1,
        arriba: Math.round(r.top - m.top),
        abajo: Math.round(m.bottom - r.bottom),
      });
    })()`));
    if (!v.hay || !v.dentro) {
      siempreVisible = false;
      peor = v;
      break;
    }
  }
  afirmar(
    siempreVisible,
    "FLECHAS: LA FILA SELECCIONADA NUNCA SE SALE DE LA PANTALLA",
    siempreVisible
      ? `recorridas ${nombresDeFila.length - 1 - desdeDonde} filas hasta la última, siempre dentro del <main>`
      : `se salió: ${JSON.stringify(peor)}`
  );

  // En la última, ArrowDown no envuelve.
  const enLaUltima = await filaTenida();
  afirmar(
    enLaUltima.indice === nombresDeFila.length - 1,
    "FLECHAS: se llegó a la última fila",
    `índice=${enLaUltima.indice} de ${nombresDeFila.length - 1}`
  );
  await flecha("ArrowDown");
  const trasElBorde = await filaTenida();
  afirmar(
    trasElBorde.indice === nombresDeFila.length - 1,
    "FLECHAS: EN LA ÚLTIMA, ArrowDown NO ENVUELVE",
    `quedó en la ${trasElBorde.indice + 1} · envolver la habría llevado a la 1`
  );

  // Y en la primera, ArrowUp tampoco.
  await evaluar(`(() => {
    const filas = [...document.querySelectorAll("table tbody tr")].filter((f) => f.children.length > 1);
    filas[0].querySelectorAll("td")[1].click();
    return true;
  })()`);
  await sleep(400);
  await flecha("ArrowUp");
  const enLaPrimera = await filaTenida();
  afirmar(
    enLaPrimera.indice === 0,
    "FLECHAS: EN LA PRIMERA, ArrowUp NO ENVUELVE",
    `quedó en la ${enLaPrimera.indice + 1} · envolver la habría llevado a la ${nombresDeFila.length}`
  );

  // La página no cambia sola: para eso está el paginador.
  const urlTrasLasFlechas = await evaluar("location.pathname + location.search");
  afirmar(
    mismaUrlDeListado(urlTrasLasFlechas, URL_LISTADO),
    "FLECHAS: NO SE CAMBIA DE PÁGINA SOLA",
    `${urlTrasLasFlechas}`
  );

  // ── LAS FLECHAS DEL BUSCADOR SON DEL BUSCADOR ──────────────────────────
  //
  // Es la novena comprobación del pedido, y la única que puede romper algo que
  // hoy funciona: con el foco en un campo de texto la flecha mueve el cursor de
  // escritura, y robarla dejaría el buscador sin poder recorrer lo escrito.
  //
  // El campo se busca por su PLACEHOLDER y no por `input[type="text"]`: el kit
  // no le pone el atributo `type`, así que ese selector no matchea nunca — la
  // primera corrida dio rojo por eso, sobre una pantalla que estaba bien.
  const hayBuscador = await evaluar(`(() => {
    const i = [...document.querySelectorAll("input")].find(
      (x) => /buscar/i.test(x.getAttribute("placeholder") || "") && x.offsetParent !== null
    );
    if (!i) return false;
    i.focus();
    return document.activeElement === i;
  })()`);
  afirmar(hayBuscador, "FLECHAS: se pudo enfocar el buscador para la contraprueba");
  if (hayBuscador) {
    const antesDelBuscador = await filaTenida();
    await flecha("ArrowDown");
    await flecha("ArrowDown");
    const despuesDelBuscador = await filaTenida();
    afirmar(
      despuesDelBuscador.indice === antesDelBuscador.indice,
      "FLECHAS: CON EL FOCO EN EL BUSCADOR NO SE MUEVE LA SELECCIÓN",
      `antes la ${antesDelBuscador.indice + 1}, después la ${despuesDelBuscador.indice + 1} — dos pulsaciones`
    );
    const sigueEnfocado = await evaluar(`(document.activeElement.tagName || "?")`);
    afirmar(
      sigueEnfocado === "INPUT",
      "FLECHAS: el buscador conserva el foco",
      `activeElement=${sigueEnfocado}`
    );
  }
  await capturar("13-escritorio-flechas", `${BASE}${URL_LISTADO}`);
} catch (err) {
  morir(err?.message || String(err));
}

console.log("");
if (fallas.length === 0) {
  console.log("VERDE · volver de editar deja al mismo producto donde estaba.");
} else {
  console.log(`ROJO · ${fallas.length} afirmaciones fallaron:`);
  for (const f of fallas) console.log(`  · ${f}`);
}
console.log("");
process.exit(fallas.length === 0 ? 0 : 1);
