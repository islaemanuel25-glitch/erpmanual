// SONDA: los tokens semánticos de "Para revisar", medidos en los CATORCE temas.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El bloque de controles pinta su número y su borde con `--success-fg`,
// `--warning-fg` y `--danger-fg`, los tokens semánticos generales del ERP, sobre
// el fondo de tarjeta `--card-bg`.
//
// Esos cuatro tokens NO están definidos en los catorce temas: ocho los
// sobrescriben y cuatro —`sunmiDark` y su `:not([data-theme])`, `sunmiDarkCompact`,
// `sunmiGraphite` y `sunmiBlueClassic`— heredan los de `:root`, que están pensados
// para fondo oscuro. Que hereden no es un problema por sí solo; el problema sería
// que en alguno el número quede ilegible, y eso no se puede saber leyendo el CSS:
// hay que resolver las variables como las resuelve el navegador y medir.
//
// Es el mismo procedimiento con el que se derivó `--pos-warning` y
// `--card-elevacion`, y por el mismo motivo: un color que "se ve bien" en el tema
// que uno tiene puesto puede ser ilegible en otro, y nadie abre los catorce.
//
// ── LOS UMBRALES SON DOS, Y LA PRIMERA VERSIÓN USABA EL EQUIVOCADO ────────
//
// Decía 3,0 para todo, con el argumento de que el número —17,5 px en negrita—
// entraba en la excepción de "texto grande". **No entra.** El umbral de WCAG para
// negrita es 14 pt, que son 18,67 px CSS: a 17,5 px el número es texto normal y
// le corresponde 4,5:1. Con 3,0 la sonda daba verde sobre dos tokens que no
// llegaban —`--warning-fg` con 3,19 y `--success-fg` con 3,77 en `sunmiLight`—.
//
// Un umbral demasiado bajo no es una sonda floja: es una sonda que AFIRMA algo
// falso, y en verde. Es peor que no tenerla.
//
// Ahora se mide POR USO, con el umbral que a ese uso le corresponde:
//
//   texto normal          4,5   WCAG 1.4.3 (AA)
//   texto grande          3,0   ≥ 24 px, o ≥ 18,67 px en negrita
//   objeto gráfico        3,0   WCAG 1.4.11 — bordes e íconos que informan
//
// Y el componente se acomodó a eso en vez de al revés: el número pasó a 21 px
// bold para calificar como texto grande, y el texto del aviso —10,5 px— dejó de
// ir pintado con el ámbar y usa el color de texto de la aplicación.
//
// ── SI NO PUEDE MEDIR, ES ROJO ─────────────────────────────────────────────
//
// Mismo criterio que las otras dos sondas. Un tema que no se pudo aplicar o una
// variable que resolvió vacía no son "no se pudo comprobar": son rojo, porque el
// desconocido se convierte solo en "supongo que sí".
//
// Uso:
//   node scripts/sonda-controles-tokens.mjs --base http://localhost:3111
//
// NO necesita sesión: las variables las sirve el layout raíz, así que mide sobre
// `/login` y no gasta intentos del límite de login.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : d;
};

const BASE = arg("base", "http://localhost:3111");
const PUERTO = Number(arg("puerto-cdp", "9243"));
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-controles-tokens"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

/** WCAG 1.4.3 (AA) para texto normal. */
const MINIMO_TEXTO = 4.5;
/** WCAG 1.4.3 para texto grande, y 1.4.11 para objetos gráficos. */
const MINIMO_GRAFICO = 3.0;
/** El piso de "texto grande" en negrita: 14 pt = 18,67 px CSS. */
const PX_TEXTO_GRANDE_BOLD = 18.67;

// Los catorce, tal como los nombra `SunmiThemeProvider`. `null` es el default,
// que es el `html:not([data-theme])` — uno de los cuatro que heredan de `:root`.
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

// ── LO QUE SE MIDE ES CADA USO, NO CADA TOKEN ─────────────────────────────
//
// El mismo token puede cumplir en un lugar y no en otro, porque el umbral lo
// decide el USO —tamaño y peso de la letra, o si es un objeto gráfico— y no el
// color. Por eso cada entrada dice de qué color es, sobre qué fondo va, y con
// qué requisito se lo juzga.
//
// `px` y `bold` están para poder DERIVAR el umbral en vez de escribirlo: si
// mañana alguien achica el número, el requisito sube solo y la sonda se pone
// roja. Escribir el umbral a mano dejaría que un cambio de tamaño pasara sin que
// nadie recalculara nada — que es exactamente lo que pasó con los 17,5 px.
const umbralDeTexto = (px, bold) =>
  px >= 24 || (bold && px >= PX_TEXTO_GRANDE_BOLD) ? MINIMO_GRAFICO : MINIMO_TEXTO;

// ── SE MIDE LA EXPRESIÓN QUE EL COMPONENTE PINTA, NO EL TOKEN ─────────────
//
// `color` es una expresión CSS tal cual va en el `style`, no el nombre de una
// variable. La diferencia importa: el componente no pinta `var(--warning-fg)`
// pelado sino una MEZCLA con el color de texto de la aplicación, y medir el token
// suelto informaría un número que en la pantalla no existe.
//
// Estas expresiones tienen que ser las MISMAS que las de
// `components/productos/CarruselControles.jsx`. Hay un candado que lo exige, para
// que no se separen.
const mezcla = (token) => `color-mix(in srgb, var(${token}) 88%, var(--app-fg))`;

const USOS = [
  {
    nombre: "número de la card",
    colores: [
      ["success", mezcla("--success-fg")],
      ["warning", mezcla("--warning-fg")],
      ["danger", mezcla("--danger-fg")],
    ],
    fondo: "--card-bg",
    // 21 px en negrita: `text-2xl` con 1 rem = 14 px.
    px: 21,
    bold: true,
  },
  {
    nombre: "borde de la card",
    colores: [
      ["success", mezcla("--success-fg")],
      ["warning", mezcla("--warning-fg")],
      ["danger", mezcla("--danger-fg")],
    ],
    fondo: "--card-bg",
    grafico: true,
  },
  {
    nombre: "ícono del aviso de conteo parcial",
    colores: [["warning", mezcla("--warning-fg")]],
    // El aviso va sobre el fondo de la página, no adentro de una card.
    fondo: "--app-bg",
    grafico: true,
  },
  {
    nombre: "texto del aviso de conteo parcial",
    colores: [["texto", "var(--app-fg)"]],
    fondo: "--app-bg",
    px: 10.5,
    bold: false,
  },
  {
    nombre: "título de la card",
    colores: [["texto", "var(--app-fg)"]],
    fondo: "--card-bg",
    px: 11.5,
    bold: true,
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    console.log(`        ${detalle}`);
  }
};

const morir = (motivo) => {
  console.error("");
  console.error(`ROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

// Contraste relativo de WCAG. Se calcula acá y no en la página para que el umbral
// viva en un solo lugar.
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

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=390,844",
    "--no-first-run",
    "--disable-gpu",
  ],
  { stdio: "ignore" }
);
process.on("exit", () => { try { edge.kill(); } catch {} });

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

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

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
  for (let i = 0; i < 80; i++) {
    await sleep(150);
    if (await evaluar(`document.readyState === "complete"`)) break;
  }

  console.log(`\nmidiendo ${USOS.length} usos en ${TEMAS.length} temas`);
  console.log(`texto normal ${MINIMO_TEXTO} · texto grande y objetos gráficos ${MINIMO_GRAFICO}\n`);

  // Todas las expresiones que hay que resolver, sin repetir. Los fondos van como
  // `var(...)` para que se resuelvan por el mismo camino.
  const EXPRESIONES = [
    ...new Set(
      USOS.flatMap((u) => [`var(${u.fondo})`, ...u.colores.map(([, c]) => c)])
    ),
  ];

  // El peor caso por (uso, rol), que es la unidad sobre la que se afirma.
  const peor = new Map();
  const clave = (uso, rol) => `${uso.nombre}|${rol}`;
  for (const uso of USOS) {
    for (const [rol] of uso.colores) {
      peor.set(clave(uso, rol), { valor: Infinity, tema: null });
    }
  }

  for (const tema of TEMAS) {
    // ── EL TEMA SE APLICA COMO LO APLICA EL DISPOSITIVO ────────────────────
    //
    // Poniendo el atributo en `<html>`, que es lo que hace `SunmiThemeProvider`.
    // Acá alcanza —y no vale la advertencia de las capturas— porque lo único que
    // se mide son VARIABLES CSS, que dependen del selector y no del objeto que
    // React reparte. No se mide ninguna clase de Tailwind.
    await evaluar(
      tema
        ? `document.documentElement.setAttribute("data-theme", ${JSON.stringify(tema)})`
        : `document.documentElement.removeAttribute("data-theme")`
    );
    await sleep(120);

    // ── SE RESUELVE EN EL NAVEGADOR, no con una fórmula escrita acá ────────
    //
    // `color-mix` lo calcula el motor. Reimplementarlo en JavaScript sería medir
    // una segunda versión de la mezcla, escrita por la misma persona el mismo
    // día: coincidiría siempre, incluso estando las dos mal. Se le pide al
    // navegador el color CALCULADO, que es el que la pantalla dibuja.
    const medido = await evaluar(`(() => {
      const aRGB = (valor) => {
        const d = document.createElement("div");
        d.style.color = valor;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const salida = {};
      for (const e of ${JSON.stringify(EXPRESIONES)}) salida[e] = aRGB(e);
      return salida;
    })()`);

    // ── DOS FORMAS DE COLOR, Y UNA VIENE EN 0..1 ──────────────────────────
    //
    // Un `color-mix` computado sale como `color(srgb 0.28 0.83 0.64)` —canales de
    // 0 a 1— y un color liso sale como `rgb(72 213 163)` —de 0 a 255—. Leer los
    // dos con el mismo parser daba un contraste absurdo: la primera versión tomó
    // 0,28 como si fuera un canal de 255 y la sonda directamente no midió.
    const aTerna = (expresion) => {
      const v = medido[expresion];
      if (!v) morir(`el tema ${tema || "(default)"} no resolvió "${expresion}"`);
      const n = (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      if (n.length !== 3) {
        morir(`el tema ${tema || "(default)"} no resolvió "${expresion}" (dio "${v}")`);
      }
      if (/^color\(/.test(v)) return n.map((x) => x * 255);
      if (/^rgba?\(/.test(v)) return n;
      morir(`el tema ${tema || "(default)"} devolvió un color que no se sabe leer: "${v}"`);
    };

    const partes = [];
    for (const uso of USOS) {
      const fondo = aTerna(`var(${uso.fondo})`);
      for (const [rol, color] of uso.colores) {
        const c = contraste(aTerna(color), fondo);
        const p = peor.get(clave(uso, rol));
        if (c < p.valor) peor.set(clave(uso, rol), { valor: c, tema: tema || "(default)" });
        // La línea por tema solo muestra los tres de salud sobre la card, que son
        // los que se mueven; el resto se resume abajo. Mostrar quince números por
        // tema no se lee.
        if (uso.nombre === "número de la card") partes.push(`${rol} ${c.toFixed(2)}`);
      }
    }
    console.log(`  ${String(tema || "(default)").padEnd(20)} ${partes.join("  ")}`);
  }

  console.log("");
  for (const uso of USOS) {
    const minimo = uso.grafico ? MINIMO_GRAFICO : umbralDeTexto(uso.px, uso.bold);
    const como = uso.grafico
      ? "objeto gráfico"
      : minimo === MINIMO_GRAFICO
        ? `texto grande (${uso.px} px${uso.bold ? " bold" : ""})`
        : `texto normal (${uso.px} px${uso.bold ? " bold" : ""})`;
    for (const [rol] of uso.colores) {
      const p = peor.get(clave(uso, rol));
      afirmar(
        p.valor >= minimo,
        `${uso.nombre} · ${rol} · ${como} · mínimo ${minimo} · peor ${p.valor.toFixed(2)} en ${p.tema}`,
        `le faltan ${(minimo - p.valor).toFixed(2)} puntos de contraste`
      );
    }
  }
} catch (e) {
  morir(e.message);
}

console.log("");
if (fallas.length) {
  console.log(`ROJO · ${fallas.length} uso(s) no llegan al mínimo de contraste que les corresponde.`);
  process.exit(1);
}
console.log("VERDE · cada uso llega al mínimo que le corresponde, en los catorce temas.");
process.exit(0);
