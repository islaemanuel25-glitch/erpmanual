// SONDA DE LA TARJETA DE PRODUCTO — AFIRMA SOBRE LA PANTALLA, NO LA FOTOGRAFÍA.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El 2026-08-18 la tarjeta de producto llegó a producción con CINCO defectos, y
// ninguno de los controles que había podía verlos:
//
//   · la suite son funciones puras y la tarjeta no es una;
//   · el build compila JSX que explota en el navegador;
//   · el marcador de la hoja de estilos probó que las clases VIAJARON, que no es
//     lo mismo que que la pantalla funcione;
//   · y el andamio pasó, porque tenía los textos escritos a mano y un botón sin
//     manejador — o sea que tres de los cinco defectos eran invisibles ahí por
//     construcción.
//
// Lo que faltaba es lo que dice la regla 2 del proyecto: abrir la pantalla con
// datos reales. Esto lo hace, y AFIRMA sobre cada paso en vez de sacar una foto.
// Una foto de una pantalla rota es perfectamente determinista.
//
// ── QUÉ AFIRMA, Y CONTRA QUÉ DEFECTO ──────────────────────────────────────
//
//   1. El rótulo del precio no contradice a la línea de equivalencia.
//   2. Tocar Editar entra a la ficha, sin alert.
//   3. La capa tiene los botones esperados y ninguno de adorno.
//   4. El segundo toque cierra la capa.
//   5. La tarjeta tiene un límite visible contra el fondo: 3,0 o más.
//
// Los cinco están verificados por CONTRAPRUEBA: se reintrodujo cada defecto y
// esta sonda se puso roja por el que correspondía, uno por uno. Sin eso sería un
// candado que acompaña en vez de afirmar, que es la falla que este repo ya
// documentó tres veces.
//
// ── DÓNDE CORRE ────────────────────────────────────────────────────────────
//
// No en la suite: necesita un servidor y una sesión. Corre al lado de
// `sonda-cascada.mjs`, con el mismo criterio — SI NO PUEDE MEDIR, ES ROJA. Una
// pantalla que no cargó, una sesión que no entró o una tarjeta que no apareció
// no son "no se pudo comprobar": son rojo, porque el desconocido se convierte
// solo en "supongo que sí" cuando ya hay ganas de terminar.
//
// Uso:
//   node scripts/sonda-tarjeta-producto.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave>
//
// NUNCA contra producción: hace login y toca la interfaz.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

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
const PUERTO = Number(arg("puerto-cdp", "9241"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-tarjeta-producto"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

// El mínimo de WCAG 1.4.11 para contraste de algo que NO es texto. El límite de
// un componente de interfaz entra en esa categoría. Es el mismo umbral con el
// que se derivó `--card-elevacion` en los catorce temas.
const MINIMO_ELEVACION = 3.0;

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

// ── LAS AFIRMACIONES ───────────────────────────────────────────────────────
// Se juntan todas y se informan juntas: si hay tres defectos, que se vean los
// tres en una corrida y no de a uno por vuelta.
const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo, detalle });
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

// Contraste relativo de WCAG. Se calcula acá y no en la página para que el
// umbral viva en un solo lugar.
const luminancia = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};
const aRGB = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);

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

// Cualquier tropiezo del arnés es ROJO, no "no se pudo medir".
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

  // Los `alert` cuelgan un navegador sin cabeza. Se capturan para poder AFIRMAR
  // sobre ellos: el defecto de Editar ERA un alert, así que sin esto el caso no
  // se puede distinguir de "no pasó nada".
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__alertas = []; window.alert = (m) => { window.__alertas.push(String(m)); };`,
  });

  await prepararSesion({
    navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE,
    log: (m) => console.log(m),
  });

  await send("Page.navigate", { url: `${BASE}/modulos/productos` });
  await sleep(6000);

  const donde = await evaluar(`location.pathname`);
  if (!donde.includes("/modulos/productos")) {
    morir(`quedó en ${donde} en vez de /modulos/productos — la sesión no entró`);
  }

  // La tarjeta se reconoce por el pie de códigos monoespaciado, que es suyo y de
  // ningún otro panel de la pantalla.
  const TARJETAS = `[...document.querySelectorAll('[data-sunmi-panel]')].filter(p => p.querySelector('.font-mono'))`;
  const cuantas = await evaluar(`${TARJETAS}.length`);
  if (!cuantas) {
    morir("no hay ninguna tarjeta de producto a 390 px — o no hay datos, o no se dibujó");
  }
  console.log(`\ntarjetas de producto a ${ANCHO} px: ${cuantas}\n`);

  // ── 1 · EL RÓTULO NO PUEDE CONTRADECIR A LA EQUIVALENCIA ────────────────
  //
  // No se afirma cuál es el rótulo correcto —eso depende del producto—, se
  // afirma que las dos mitades de la tarjeta no digan cosas opuestas. Si la
  // tarjeta explica "1 pack = N un", entonces el número de arriba es de bulto y
  // rotularlo como unitario es falso. Es la contradicción exacta que llegó a
  // producción sobre 1.293 de 2.600 productos.
  // EL RÓTULO SE LEE DEL NODO, NO DEL TEXTO PLANO. En `innerText` la palabra
  // "por unidad" aparece DOS veces —una es el rótulo y la otra el final de la
  // equivalencia, "…$1.329,17 por unidad"—, así que buscarla por texto encuentra
  // la que no es y el candado pasa a afirmar cualquier cosa. El rótulo es el
  // último hijo de la fila del precio, y eso no es ambiguo.
  const contradicciones = await evaluar(`(() => {
    return ${TARJETAS}.map((t) => {
      const texto = t.innerText;
      const fila = t.querySelector('.items-baseline');
      const rotulo = fila && fila.lastElementChild
        ? fila.lastElementChild.textContent.trim()
        : null;
      return {
        texto: texto.split("\\n").slice(0, 2).join(" · "),
        equivalencia: /1 pack = \\d+ un/.test(texto),
        porKilo: /Se vende por kilo/.test(texto),
        rotulo,
      };
    }).filter((c) =>
      (c.equivalencia && c.rotulo !== "por bulto") ||
      (c.porKilo && c.rotulo !== "por kg") ||
      !["por bulto", "por kg", "por unidad"].includes(c.rotulo)
    );
  })()`);
  afirmar(
    contradicciones.length === 0,
    "1 · el rótulo del precio no contradice a la línea de equivalencia",
    contradicciones.length
      ? `${contradicciones.length} tarjeta(s) se contradicen. La primera: ${contradicciones[0].texto} — rótulo ${contradicciones[0].rotulo ?? "AUSENTE"}`
      : ""
  );

  // ── 5 · LA TARJETA TIENE UN LÍMITE VISIBLE ──────────────────────────────
  const limite = await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const s = getComputedStyle(t);
    return {
      outline: s.outlineColor, anchoOutline: s.outlineWidth, estilo: s.outlineStyle,
      borde: s.borderTopColor, fondo: getComputedStyle(document.body).backgroundColor,
    };
  })()`);
  const hayOutline = limite.estilo !== "none" && parseFloat(limite.anchoOutline) > 0;
  const cOutline = hayOutline ? contraste(aRGB(limite.outline), aRGB(limite.fondo)) : 0;
  const cBorde = contraste(aRGB(limite.borde), aRGB(limite.fondo));
  const mejor = Math.max(cOutline, cBorde);
  afirmar(
    mejor >= MINIMO_ELEVACION,
    `5 · la tarjeta se distingue del fondo (${mejor} · mínimo ${MINIMO_ELEVACION})`,
    `outline ${hayOutline ? cOutline : "sin outline"}, borde ${cBorde}. Sin límite visible, N tarjetas se leen como un bloque.`
  );

  // ── 6 · TODAS DEL MISMO ALTO ────────────────────────────────────────────
  //
  // Una tarjeta sin equivalencia o sin código de barras perdía la fila entera y
  // quedaba más baja que las vecinas; con veinticinco apiladas eso se lee como
  // una lista rota. El arreglo NO fue dejar un hueco: la línea está siempre y
  // dice lo que corresponde —un producto suelto se vende por unidad, y no tener
  // código de barras es un dato—. Lo que queda parejo lo empareja la grilla.
  const altos = await evaluar(`(() => {
    const h = ${TARJETAS}.map((t) => Math.round(t.getBoundingClientRect().height * 10) / 10);
    return { distintos: [...new Set(h)].sort((a, b) => a - b), cuantas: h.length };
  })()`);
  afirmar(
    altos.distintos.length === 1,
    `6 · las ${altos.cuantas} tarjetas tienen el mismo alto`,
    `hay ${altos.distintos.length} altos distintos: ${altos.distintos.join(", ")} px`
  );

  // Y la mitad que explica POR QUÉ están parejas. Sin esto, alguien "arregla" el
  // alto con un `min-h` fijo, la afirmación de arriba se pone verde, y las
  // tarjetas vuelven a no decir en qué escala se vende ni si falta el código.
  const filas = await evaluar(`(() => {
    const t = ${TARJETAS};
    return {
      sinEquivalencia: t.filter((c) => !/Se vende|1 pack =/.test(c.innerText)).length,
      sinPie: t.filter((c) => !c.querySelector('.font-mono')).length,
    };
  })()`);
  afirmar(
    filas.sinEquivalencia === 0 && filas.sinPie === 0,
    "6b · ninguna tarjeta se quedó sin la línea de escala ni sin el pie de códigos",
    `sin equivalencia: ${filas.sinEquivalencia} · sin pie: ${filas.sinPie}`
  );

  // ── 7 · LA LISTA TIENE PAGINACIÓN ───────────────────────────────────────
  //
  // La tabla la tenía y la lista de tarjetas no: mostraba los primeros 25 de
  // 2.600 productos sin forma de llegar al 26. OJO: a este ancho el paginador de
  // la TABLA sigue en el DOM, oculto por `hidden md:block`, así que preguntar si
  // existe daría verde igual. Se pregunta por el que se VE.
  const paginador = await evaluar(`(() => {
    const todos = [...document.querySelectorAll('button')].filter(b => /Anterior/.test(b.textContent));
    const visibles = todos.filter(b => b.getBoundingClientRect().height > 0);
    if (!visibles.length) return { visible: false, enElDom: todos.length };
    const bloque = visibles[0].closest('div').parentElement;
    return { visible: true, enElDom: todos.length, texto: bloque.innerText.replace(/\\n/g, " ").slice(0, 60) };
  })()`);
  afirmar(
    paginador.visible,
    "7 · la lista de tarjetas tiene su paginación a la vista",
    `paginadores en el DOM: ${paginador.enElDom}, visibles: 0 — el de la tabla no cuenta, está oculto`
  );

  // ── 3 · LA CAPA, Y NINGÚN BOTÓN DE ADORNO ───────────────────────────────
  await evaluar(`${TARJETAS}[0].firstElementChild.click(); true`);
  await sleep(700);
  const capa = await evaluar(`(() => {
    const c = ${TARJETAS}[0].querySelector('.absolute.inset-0');
    if (!c) return null;
    return [...c.querySelectorAll('button')].map((b) => b.textContent.trim());
  })()`);
  afirmar(capa !== null, "3a · el primer toque abre la capa de acciones",
    "la capa no apareció: la tarjeta no responde al toque");

  // ── POR QUÉ ES UNA LISTA ESPERADA Y NO "¿TIENE MANEJADOR?" ──────────────
  //
  // Lo primero que se escribió acá fue `!boton.onclick`, para cazar el botón de
  // adorno que tenía el andamio. NO SIRVE, y lo dijo la contraprueba: React no
  // pone el manejador en el elemento sino en la raíz, así que `onclick` es null
  // hasta para el botón que anda. Medido: el andamio informaba "sin manejador"
  // para los DOS, el muerto y el vivo. Un candado escrito así se pone rojo
  // siempre o verde siempre, pero nunca por el motivo que dice.
  //
  // La lista esperada sí afirma: si alguien vuelve a agregar "Información" antes
  // de que exista la pantalla a la que iría, esto se pone rojo y lo nombra. Y si
  // el botón nuevo es legítimo, se agrega acá A PROPÓSITO, que es exactamente el
  // trámite que tiene que costar.
  const ESPERADOS = (arg("botones", "Editar") || "").split(",").map((s) => s.trim());
  const sobran = (capa || []).filter((b) => !ESPERADOS.includes(b));
  const faltan = ESPERADOS.filter((b) => !(capa || []).includes(b));
  afirmar(
    capa !== null && sobran.length === 0 && faltan.length === 0,
    `3b · la capa tiene exactamente los botones esperados (${ESPERADOS.join(", ")})`,
    capa === null ? "no hay capa que mirar"
      : `sobran: ${sobran.join(", ") || "ninguno"} · faltan: ${faltan.join(", ") || "ninguno"}`
  );

  // ── 4 · EL SEGUNDO TOQUE CIERRA ─────────────────────────────────────────
  await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    const c = t.querySelector('.absolute.inset-0');
    (c || t.firstElementChild).click();
    return true;
  })()`);
  await sleep(700);
  const sigueAbierta = await evaluar(`!!${TARJETAS}[0].querySelector('.absolute.inset-0')`);
  afirmar(
    !sigueAbierta,
    "4 · el segundo toque cierra la capa",
    "sigue abierta: el toque en la capa burbujea al contenedor y `onToggle` corre dos veces"
  );

  // ── 2 · EDITAR ENTRA ────────────────────────────────────────────────────
  // Va última porque navega y deja la pantalla.
  await evaluar(`(() => {
    const t = ${TARJETAS}[0];
    if (!t.querySelector('.absolute.inset-0')) t.firstElementChild.click();
    return true;
  })()`);
  await sleep(600);
  const tocado = await evaluar(`(() => {
    const b = [...${TARJETAS}[0].querySelectorAll('.absolute.inset-0 button')]
      .find((x) => /editar/i.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!tocado) morir("no encontré el botón Editar dentro de la capa");
  await sleep(3000);

  const despues = await evaluar(`({ alertas: window.__alertas || [], donde: location.pathname })`);
  afirmar(
    despues.alertas.length === 0,
    "2a · tocar Editar no muestra ningún cartel de error",
    `alert: ${despues.alertas.join(" | ")}`
  );
  afirmar(
    /\/modulos\/productos\/\d+\/editar/.test(despues.donde),
    "2b · tocar Editar entra a la ficha del producto",
    `quedó en ${despues.donde}`
  );
} catch (e) {
  morir(e.message);
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} afirmación(es) de la tarjeta de producto no se cumplen.`);
  for (const f of fallas) console.log(`  · ${f.titulo}`);
  process.exit(1);
}
console.log("VERDE · la tarjeta de producto dice la verdad, se toca y se ve.");
process.exit(0);
