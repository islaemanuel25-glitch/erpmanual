// SONDA: las dos acciones de la tarjeta de recepción, medidas en los CATORCE temas.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El V21 dejó la tarjeta del teléfono con dos botones y nada más: "✓ Coincide"
// —`sunmi-btn-accent-outline`— y "Corregir" —`sunmi-btn-accent-soft`—. Los dos
// pintan texto y borde con `--pos-accent` sobre el fondo de la tarjeta.
//
// `--pos-accent` vale distinto en cada tema, y va de `#fbbf24` a `#27272A`. Que
// la variable "siga al tema" NO alcanza como garantía: lo que hay que saber es
// si el resultado se LEE, y eso depende del par color/fondo, no de que el token
// esté definido. Un acento oscuro sobre una tarjeta oscura, o uno claro sobre
// una clara, deja el botón principal de la pantalla invisible — y nadie abre los
// catorce temas para mirarlo.
//
// Es el mismo procedimiento de `sonda-controles-tokens.mjs`, con el mismo
// criterio y los mismos umbrales. Lo que cambia es el sujeto.
//
// ── SE MIDE EL BOTÓN, NO LA EXPRESIÓN ─────────────────────────────────────
//
// La sonda no re-escribe a mano los colores que el CSS debería dar: MONTA un
// botón con exactamente el `className` que `SunmiButton` produce —importando
// `baseDeBoton`, la misma función— adentro de un `div.sunmi-card`, y lee
// `getComputedStyle`.
//
// Esa diferencia es el punto. La variante convive con el `sunmi-btn-<color>` que
// el componente agrega igual, y cuál gana lo decide el ORDEN de la hoja. Medir
// la expresión "lo que accent-outline declara" daría verde aunque el color del
// componente le estuviera ganando; medir el botón dibujado contesta lo que de
// verdad se ve. `variantesDeAccion.test.mjs` mira el orden en el archivo, esto
// mira el resultado: son dos preguntas distintas y ninguna tapa a la otra.
//
// ── Y SOBRE LOS TRES FONDOS QUE LA TARJETA USA ────────────────────────────
//
// La tarjeta no siempre es `--card-bg` liso: se tiñe con `sunmi-state-warning`
// cuando hay diferencia y con `sunmi-state-danger` cuando la línea no estaba en
// el remito. Esos fondos corren la tarjeta hacia el ámbar y el rojo, así que el
// contraste del acento cambia. Medir solo contra la tarjeta lisa sería una
// medición correcta de la cosa equivocada.
//
// ── LOS UMBRALES ──────────────────────────────────────────────────────────
//
//   texto normal          4,5   WCAG 1.4.3 (AA) — el botón es 13 px, peso 500
//   objeto gráfico        3,0   WCAG 1.4.11 — el contorno, que es lo que informa
//
// ── SI NO PUEDE MEDIR, ES ROJO ────────────────────────────────────────────
//
// Un tema que no se pudo aplicar, o un color que resolvió vacío, no son "no se
// pudo comprobar": son rojo. El desconocido se convierte solo en "supongo que
// sí" cuando ya hay ganas de terminar.
//
// Uso:
//   node --experimental-websocket scripts/sonda-acciones-recepcion.mjs \
//     --base http://localhost:3210 --chrome /usr/bin/chromium
//
// NO necesita sesión: las variables las sirve el layout raíz, así que mide sobre
// `/login` y no gasta intentos del límite de login.

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

import { baseDeBoton } from "../lib/sunmi/claseNegociada.js";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3210");
const PUERTO = Number(arg("puerto-cdp", "9251"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-acciones-recepcion"));
const CHROME = arg("chrome", "/usr/bin/chromium");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** WCAG 1.4.3 (AA) para texto normal. El botón del kit es 13 px, peso 500. */
const MINIMO_TEXTO = 4.5;
/** WCAG 1.4.11 para objetos gráficos: el contorno informa dónde termina el botón. */
const MINIMO_GRAFICO = 3.0;

// Los catorce, tal como los nombra `SunmiThemeProvider`. `null` es el default,
// que es el `html:not([data-theme])`.
const TEMAS = [
  null,
  "sunmiDark",
  "sunmiDarkCompact",
  "sunmiLight",
  "sunmiGraphite",
  "sunmiSand",
  "sunmiBlueClassic",
  "sunmiFrance",
  "sunmiFranceSplit",
  "operixBluePro",
  "operixNight",
  "verdeComercio",
  "grafitoEjecutivo",
  "ambarCaja",
  "violetaSaas",
];

/** Los tres fondos que la tarjeta de recepción usa de verdad. */
const FONDOS = [
  { clave: "tarjeta", clases: "sunmi-card" },
  { clave: "diferencia", clases: "sunmi-card sunmi-state-warning" },
  { clave: "no declarado", clases: "sunmi-card sunmi-state-danger" },
];

// ── EL `className` EXACTO QUE `SunmiButton` PRODUCE ───────────────────────
//
// `${baseDeBoton(pedido)} sunmi-btn-${color} ${pedido}`, y el color por defecto
// es `cyan` porque la tarjeta no pasa ninguno. Se arma con la MISMA función que
// el componente: si mañana la composición cambia, la sonda la sigue en vez de
// medir una cadena que quedó vieja.
const claseDeBoton = (pedido, color = "cyan") =>
  `${baseDeBoton(pedido)} sunmi-btn-${color} ${pedido}`;

const ACCIONES = [
  { clave: "✓ Coincide", pedido: "shrink-0 sunmi-btn-accent-outline" },
  { clave: "Corregir", pedido: "shrink-0 sunmi-btn-accent-suave" },
];

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

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

// ── LOS COLORES NO SE PARSEAN: LOS COMPONE EL NAVEGADOR ──────────────────
//
// La primera versión leía `getComputedStyle` y parseaba la cadena. Frenó dos
// veces seguidas, y las dos con razón:
//
//   · `color(srgb 0.98 0.74 0.14 / 0.4)` — lo que devuelve un `color-mix`,
//     con los componentes en 0..1 y separados por espacios;
//   · `oklab(0.777465 0.0391703 0.153345 / 0.4)` — lo mismo en otro espacio de
//     color, que es lo que Chromium elige según el tema.
//
// Perseguir formatos es perder: son varios, dependen del motor y del tema, y
// cada uno que falta es una sonda roja o —peor— un número mal convertido que se
// informa como si fuera cierto.
//
// Se pinta en un canvas de 1×1 y se lee el píxel. El navegador entiende todos
// sus propios formatos y hace la composición alfa con su matemática, que es la
// misma que dibuja la pantalla. Salen tres enteros de 0 a 255 y no hay nada que
// interpretar. Lo único que queda en Node es el contraste, que es la fórmula de
// WCAG y tiene que vivir en un solo lugar.
//
// Y la pila de fondos se pinta ENTERA, de afuera hacia adentro, sobre blanco:
// `--card-bg` es translúcido a propósito en varios temas —`rgba(2, 6, 23, 0.6)`
// en `sunmiDark`— así que quedarse con la primera capa daría un color que en la
// pantalla no existe.
const PINTOR = `(() => {
  const cv = document.createElement('canvas');
  cv.width = 1; cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  window.__sondaPixel = (capas) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 1);
    for (const c of capas) {
      if (!c) continue;
      ctx.fillStyle = '#000000';
      const antes = ctx.fillStyle;
      ctx.fillStyle = c;
      // Un color que el navegador no entiende deja el fillStyle como estaba.
      // Devolver null es mejor que pintar negro y llamarlo medición.
      if (ctx.fillStyle === antes && c !== '#000000' && !/^(#000|black|rgb\\(0, 0, 0\\))/.test(c)) return null;
      ctx.fillRect(0, 0, 1, 1);
    }
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return true;
})()`;

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=390,844",
    "--no-first-run",
    "--disable-gpu",
    "--no-sandbox",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { chrome.kill(); } catch {} });

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
  throw new Error("el navegador no respondió al puerto de depuración");
}

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

let fallas = 0;
/** El `--pos-accent` que resolvió cada tema. Ver el chequeo del final. */
const acentos = new Map();

try {
  const { default: WS } = await import("ws").catch(() => ({ default: null }));
  if (!WS) morir("falta el paquete `ws`");
  ws = new WS(await urlDepurador(), { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    }
  });

  const { targetInfos } = await send("Target.getTargets", {}, false);
  const page = targetInfos.find((t) => t.type === "page");
  ({ sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true }, false));
  await send("Page.enable");
  await send("Runtime.enable");

  await send("Page.navigate", { url: `${BASE}/login` });
  for (let i = 0; i < 120; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete"`)) break;
  }
  if (!(await evaluar(`document.readyState === "complete"`))) morir("la página no terminó de cargar");

  // El banco de pruebas, montado UNA vez. Se reusa cambiando el tema del `html`,
  // que es como el `SunmiThemeProvider` lo cambia de verdad.
  const banco = FONDOS.map((f, i) =>
    ACCIONES.map(
      (a, j) =>
        `<div class="${f.clases}" data-fondo="${i}">` +
        `<button class="${claseDeBoton(a.pedido)}" data-sonda="${i}-${j}">${a.clave}</button>` +
        `</div>`
    ).join("")
  ).join("");

  if ((await evaluar(PINTOR)) !== true) morir("no se pudo preparar el canvas que compone los colores");

  await evaluar(`(() => {
    const caja = document.createElement('div');
    caja.id = 'sonda-acciones';
    // El fondo de la aplicación, explícito: la tarjeta del kit es translúcida y
    // lo que se ve a través de ella tiene que ser lo mismo que en la pantalla de
    // recepción, no lo que tenga puesto el /login de turno.
    caja.style.background = 'var(--app-bg)';
    caja.innerHTML = ${JSON.stringify(banco)};
    document.body.appendChild(caja);
    return true;
  })()`);

  console.log(`\nmidiendo ${ACCIONES.length} acciones × ${FONDOS.length} fondos en ${TEMAS.length} temas`);
  console.log(`texto ${MINIMO_TEXTO} · contorno ${MINIMO_GRAFICO}\n`);

  for (const tema of TEMAS) {
    const esperado = tema === null ? "(default)" : tema;

    // ── DOS PROBLEMAS OPUESTOS, Y POR ESO SON DOS PASOS ────────────────────
    //
    // 1. Si se pone el tema y se espera, `SunmiThemeProvider` lo PISA: reescribe
    //    `document.documentElement.dataset.theme` con el guardado. La medición
    //    salía siempre con el tema por defecto — quince filas midiendo lo mismo.
    //    Y el chequeo original no lo veía, porque leía el atributo justo después
    //    de escribirlo, cuando todavía era correcto: un candado puesto sobre un
    //    momento que no es el momento que importa.
    //
    // 2. Si se pone el tema y se mide en el MISMO tick, el atributo está bien
    //    pero los colores salen viejos. Chromium actualiza la propiedad
    //    personalizada del elemento —`getComputedStyle(b).getPropertyValue`
    //    devuelve el valor nuevo— y sin embargo el `color` que ya derivó de un
    //    `var()` sigue siendo el anterior. Medido: token `#d97706` y color
    //    `rgb(251, 191, 36)` sobre el mismo elemento y en la misma llamada.
    //
    // Así que: se pone, se le da tiempo al navegador a rehacer el estilo, y se
    // COMPRUEBA que siga puesto al medir. Si el proveedor lo pisó, se repone y
    // se vuelve a esperar. Dos intentos alcanzan: el proveedor escribe al
    // montarse, no en bucle.
    for (let intento = 0; intento < 3; intento++) {
      await evaluar(`(() => {
        const h = document.documentElement;
        ${tema === null ? `h.removeAttribute('data-theme');` : `h.setAttribute('data-theme', ${JSON.stringify(tema)});`}
        return true;
      })()`);
      await sleep(180);
      const sigue = await evaluar(
        `(document.documentElement.getAttribute('data-theme') || '(default)')`
      );
      if (sigue === esperado) break;
      if (intento === 2) morir(`el tema ${esperado} lo pisa el proveedor y no se sostiene`);
    }

    const medido = await evaluar(`(() => {
      const h = document.documentElement;
      const raiz = getComputedStyle(h);
      const cabecera = {
        tema: h.getAttribute('data-theme') || '(default)',
        accent: raiz.getPropertyValue('--pos-accent').trim(),
      };
      const salida = [];
      for (const b of document.querySelectorAll('[data-sonda]')) {
        const cs = getComputedStyle(b);
        // Las capas de fondo, del padre hacia AFUERA; se dan vuelta para
        // pintarlas en el orden en que el navegador las pinta.
        const haciaAfuera = [];
        for (let n = b.parentElement; n; n = n.parentElement) {
          haciaAfuera.push(getComputedStyle(n).backgroundColor);
        }
        const pila = haciaAfuera.reverse();
        salida.push({
          clave: b.getAttribute('data-sonda'),
          anchoBorde: cs.borderTopWidth,
          px: parseFloat(cs.fontSize),
          // El token RESUELTO EN EL BOTON, que no tiene por que ser el de la
          // raiz: cualquier ancestro puede redefinirlo, y entonces el tema
          // cambia arriba y el boton sigue pintando lo de antes.
          // (Sin backticks ni acentos raros: esto vive adentro de un template.)
          accentAca: cs.getPropertyValue('--pos-accent').trim(),
          // Lo que se ve AFUERA del botón: contra esto se recorta el contorno.
          afuera: window.__sondaPixel(pila),
          // Lo que se ve ADENTRO: la pila más el fondo propio del botón.
          adentro: window.__sondaPixel([...pila, cs.backgroundColor]),
          // El texto, ya compuesto sobre lo de adentro.
          texto: window.__sondaPixel([...pila, cs.backgroundColor, cs.color]),
          // Y el contorno, compuesto sobre lo de afuera.
          borde: window.__sondaPixel([...pila, cs.borderTopColor]),
        });
      }
      return { ...cabecera, medidas: salida };
    })()`);

    const medidas = medido?.medidas;
    if (medido?.tema !== esperado) {
      morir(`el tema ${esperado} no quedó aplicado al medir (quedó ${medido?.tema})`);
    }
    if (!medido?.accent) morir(`en ${esperado}, --pos-accent resolvió vacío`);
    acentos.set(esperado, medido.accent);
    if (!Array.isArray(medidas) || medidas.length !== FONDOS.length * ACCIONES.length) {
      morir(`en ${esperado} se esperaban ${FONDOS.length * ACCIONES.length} botones y se midieron ${medidas?.length}`);
    }

    const renglones = [];
    for (const m of medidas) {
      const [i, j] = m.clave.split("-").map(Number);
      const nombre = `${ACCIONES[j].clave} · ${FONDOS[i].clave}`;

      // El mensaje dice CUÁL no se pudo pintar. "Un color resolvió vacío" no
      // alcanza para arreglar nada: hay cuatro candidatos.
      const vacio = ["afuera", "adentro", "texto", "borde"].find(
        (k) => !Array.isArray(m[k]) || m[k].length !== 3
      );
      if (vacio) morir(`en ${esperado}, ${nombre}: el navegador no pudo pintar «${vacio}»`);

      const cTexto = contraste(m.texto, m.adentro);
      // El contorno se recorta contra lo que hay AFUERA del botón.
      const cBorde = contraste(m.borde, m.afuera);

      const sinBorde = parseFloat(m.anchoBorde) === 0;
      const okTexto = cTexto >= MINIMO_TEXTO;
      // `accent-soft` no depende del contorno para verse: tiene relleno. El que
      // sí lo necesita es el de contorno, que es todo borde.
      const exigeBorde = ACCIONES[j].pedido.includes("outline");
      const okBorde = !exigeBorde || (!sinBorde && cBorde >= MINIMO_GRAFICO);

      if (!okTexto || !okBorde) fallas++;
      // Los píxeles van en el renglón que falla. Un cociente solo no deja
      // arreglar nada: hay que saber qué color quedó sobre qué fondo, y si el
      // que se pintó es el que se creía.
      const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
      renglones.push(
        `    ${okTexto && okBorde ? "✓" : "✗"} ${nombre.padEnd(26)}` +
        `texto ${String(cTexto).padStart(5)}` +
        (exigeBorde ? `  contorno ${String(cBorde).padStart(5)}` : "          ") +
        (okTexto && okBorde
          ? ""
          : `   ${hex(m.texto)} sobre ${hex(m.adentro)}` +
            `   ${hex(m.texto)} sobre ${hex(m.adentro)}`)
      );
    }
    console.log(`  ${esperado}  ·  --pos-accent ${medido.accent}`);
    console.log(renglones.join("\n"));
  }

  // ── QUE LOS TEMAS SEAN TEMAS DISTINTOS ────────────────────────────────
  //
  // Sin esto, la sonda puede recorrer quince temas midiendo el mismo quince
  // veces y dar un veredicto uniforme —verde o rojo— que no dice nada de los
  // otros catorce. Ya pasó en esta misma sonda: el proveedor pisaba el atributo
  // y todas las filas salían con el ámbar del default.
  //
  // `globals.css` declara nueve valores distintos de `--pos-accent`. Si se
  // miden menos, algo no se está aplicando.
  const distintos = new Set(acentos.values());
  console.log(`\n${acentos.size} temas medidos, ${distintos.size} valores distintos de --pos-accent`);
  if (distintos.size < 5) {
    morir(
      `solo ${distintos.size} acento(s) distinto(s) en ${acentos.size} temas: los temas no se están aplicando`
    );
  }

  console.log("");
  if (fallas > 0) {
    console.error(`ROJO · ${fallas} pares no llegan al umbral: el botón queda ilegible en algún tema.`);
    process.exit(1);
  }
  console.log("VERDE · las dos acciones se leen en los catorce temas, sobre los tres fondos.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
