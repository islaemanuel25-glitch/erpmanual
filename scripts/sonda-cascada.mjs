// scripts/sonda-cascada.mjs
//
// UNA UTILIDAD DE TAILWIND LE GANA A LA CLASE DEL KIT. MEDIDO EN EL NAVEGADOR.
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO ALCANZA CON EL CANDADO BARATO ─────────────
//
// `SunmiButton` pone `.sunmi-btn-base` y `SunmiInput` pone `.sunmi-input`, las
// dos de `styles/sunmi.css`. Lo que cada pantalla escribe encima —`py-3`, `px-3`,
// `text-xs`, `w-full`— son utilidades de Tailwind. Misma especificidad, así que
// no decide el orden del atributo sino cuál se escribió última en la hoja. Hoy
// gana la pantalla, y lo único que lo sostiene es que `app/globals.css` importa
// `sunmi.css` en la línea 6 y declara `@tailwind utilities` en la 13.
//
// Son **535 declaraciones medidas** —388 del botón, 147 del input— colgando de
// dos líneas. Si se dan vuelta, no rompe el build ni pone la suite en rojo: cada
// pantalla que hoy define su padding, su letra o su ancho pasa a mostrar el del
// kit, y solo se ve abriéndolas de a una.
//
// `lib/sunmi/ordenDeCascada.test.mjs` mira ESE ARCHIVO y es barato. Su límite
// está escrito ahí y es real: no ve un `@layer` agregado en otro lado, no ve un
// cambio de motor, y en Tailwind v4 —donde `@tailwind utilities` no existe—
// dejaría de encontrar lo que busca.
//
// Esta sonda no afirma sobre el orden: afirma sobre **lo que el orden produce**.
// Un botón con `sunmi-btn-base py-3` tiene que medir 10,5 px de relleno y no 3,5.
// Eso sobrevive a un `@layer`, a un cambio de motor y a cualquier otra forma de
// romperlo, porque pregunta por el resultado. El precio es que necesita el
// navegador, así que va acá y no en la suite de candados puros.
//
// ── LAS CUATRO MEDICIONES, Y POR QUÉ SON CUATRO Y NO DOS ───────────────────
//
// Medir solo el par mezclado no alcanza. Si mañana `.sunmi-btn-base` se quedara
// sin `padding-block` —o la hoja no cargara—, el botón con `py-3` seguiría dando
// 10,5 px y la sonda contestaría verde sin haber probado nada: estaría midiendo
// una utilidad contra nadie. Por eso cada pieza se mide DOS veces:
//
//   A · `sunmi-btn-base`          → 3,5 px   el kit aplica, y éste es su valor
//   B · `sunmi-btn-base py-3`     → 10,5 px  la utilidad le gana
//   C · `sunmi-input`             → 7 px     ídem para el input
//   D · `sunmi-input px-3`        → 10,5 px  ídem
//
// A y C son el control: sin ellos, B y D no distinguen "la utilidad gana" de "la
// clase del kit no existe". Con el orden dado vuelta, A y C no se mueven y B y D
// caen a 3,5 y a 7 — que es exactamente la firma que esta sonda busca.
//
// Los números salen de la hoja: `.sunmi-btn-base` declara `padding-block: .25rem`
// y `.sunmi-input` hace `@apply px-2` (`.5rem`); `py-3` y `px-3` son `.75rem`. El
// `html` del proyecto tiene `font-size: 14px`, así que 1rem = 14px y de ahí salen
// 3,5 / 7 / 10,5. La sonda informa el tamaño de raíz que midió: si algún día se
// cambia, este archivo se pone rojo y el motivo se lee en la primera línea.
//
// ── LA TRAMPA QUE ESTA SONDA TIENE QUE ESQUIVAR ────────────────────────────
//
// **Tailwind genera solo las clases que encuentra escritas en el código.** Si
// `py-3` no estuviera escrita en ningún lado, la regla `.py-3` no existiría, el
// botón daría 3,5 px y eso se lee EXACTAMENTE IGUAL que "la utilidad no gana".
// Ya invalidó una medición de esta fase, con `my-0` del separador.
//
// Por eso la sonda comprueba primero que las cuatro reglas ESTÉN en la hoja
// servida, y si falta cualquiera sale en rojo diciendo cuál. No mide nada sobre
// una regla que no existe.
//
// Uso:
//   node scripts/sonda-cascada.mjs --base http://localhost:3000
//
// Sale con 0 si las cuatro dan lo esperado y 1 si alguna no. No necesita sesión:
// la hoja la sirve el layout raíz, así que mide sobre `/login`.

import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : process.argv.includes(`--${n}`)
      ? true
      : d;
};

const BASE = arg("base", "http://localhost:3000");
const RUTA = arg("url", "/login");
const PUERTO = Number(arg("puerto-cdp", "9226"));
// EL PERFIL VA ATADO AL PUERTO. Con un perfil fijo, correr la sonda en otro
// puerto —para medir producción sin matar la corrida local— encuentra el perfil
// tomado por el Edge anterior, el nuevo se muere solo y lo único que se ve es
// "Edge no respondió al puerto de depuración". El síntoma no nombra al perfil.
const PERFIL = arg("perfil", path.join(os.tmpdir(), `sonda-cascada-edge-${PUERTO}`));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── LO QUE SE ESPERA, EN UN SOLO LUGAR ─────────────────────────────────────
//
// Cada caso trae la clase del kit, la utilidad que se le escribe encima, la
// propiedad que se mide, y los dos valores: el del kit solo y el de la mezcla.
// Que estén acá y no repartidos por el código es para que un cambio de expectativa
// sea una línea y no una búsqueda.
const CASOS = [
  {
    nombre: "SunmiButton",
    etiqueta: "button",
    claseKit: "sunmi-btn-base",
    utilidad: "py-3",
    propiedad: "paddingTop",
    esperadoKitSolo: 3.5,
    esperadoConUtilidad: 10.5,
    declaraKit: "padding-block: .25rem",
  },
  {
    nombre: "SunmiInput",
    etiqueta: "input",
    claseKit: "sunmi-input",
    utilidad: "px-3",
    propiedad: "paddingLeft",
    esperadoKitSolo: 7,
    esperadoConUtilidad: 10.5,
    declaraKit: "@apply px-2",
  },
];

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

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=1366,900",
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

const destino = String(BASE) + String(RUTA);
console.log(`sonda de cascada — ${destino}`);
await send("Page.navigate", { url: destino });

// Se espera a que la hoja esté PUESTA, no a que pase un tiempo. Un `sleep` fijo
// mide una página cuyo CSS todavía no llegó y devuelve los valores por defecto,
// que se leen igual que "el kit ganó". La condición es la regla del kit
// encontrable en `document.styleSheets`, o sea justo lo que se va a medir.
let hojaLista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    hojaLista = await evaluar(`(() => {
      if (document.readyState !== "complete") return false;
      for (const hoja of document.styleSheets) {
        let reglas; try { reglas = hoja.cssRules; } catch { continue; }
        for (const r of reglas) if (r.selectorText === ".sunmi-btn-base") return true;
      }
      return false;
    })()`);
  } catch {}
  if (hojaLista) break;
}

if (!hojaLista) {
  console.log("");
  console.log("ROJO · LA HOJA NO TIENE `.sunmi-btn-base`.");
  console.log("  No se mide nada: sin la regla del kit en la hoja, cualquier número que salga");
  console.log("  no distingue 'la utilidad gana' de 'el kit no cargó'. Revisar que el dev");
  console.log(`  server esté sirviendo (--base, hoy ${BASE}) y que el @import de sunmi.css siga.`);
  cerrar();
  process.exit(1);
}

// ── PRIMERO: ¿ESTÁN LAS CUATRO REGLAS EN LA HOJA? ──────────────────────────
//
// La trampa del encabezado. Se enumeran los selectores servidos y se busca cada
// uno de los cuatro. De paso se guarda su POSICIÓN en la cascada aplanada, que
// no es lo que se afirma pero explica un rojo sin tener que investigar.
const SELECTORES = [
  ...CASOS.map((c) => `.${c.claseKit}`),
  ...CASOS.map((c) => `.${c.utilidad}`),
];

const inventario = await evaluar(`(() => {
  const buscados = ${JSON.stringify(SELECTORES)};
  const posiciones = {};
  let n = 0, hojasIlegibles = 0;
  // OJO CON LA RECURSION: en Chrome moderno una CSSStyleRule cualquiera TAMBIEN
  // tiene cssRules —vacia— porque el anidamiento de CSS es parte del estandar.
  // Escrito como "si tiene cssRules, baja y segui", esto se saltea todas las
  // reglas de estilo y devuelve una hoja de 30 reglas sin ningun selector. Paso
  // en la primera corrida: la sonda dijo que faltaban las cuatro clases, y el
  // que faltaba era este if. Asi que primero se mira el selector, y recien
  // despues se baja a las hijas si las hay.
  const recorrer = (reglas) => {
    for (const r of reglas) {
      n += 1;
      if (r.selectorText) {
        for (const partes of r.selectorText.split(",")) {
          const sel = partes.trim();
          // TODAS las apariciones, no la primera. Un selector puede estar dos
          // veces —eso es justamente lo que hace un @layer o una hoja importada
          // despues— y ahi la que decide es la ULTIMA. Informar la primera
          // dijo "la utilidad va despues, que es lo que la hace ganar" en la
          // misma corrida en que la utilidad estaba perdiendo.
          if (!buscados.includes(sel)) continue;
          (posiciones[sel] ||= []).push(n);
        }
      }
      if (r.cssRules && r.cssRules.length) recorrer(r.cssRules);
    }
  };
  for (const hoja of document.styleSheets) {
    let reglas; try { reglas = hoja.cssRules; } catch { hojasIlegibles += 1; continue; }
    recorrer(reglas);
  }
  return { posiciones, reglasTotales: n, hojasIlegibles };
})()`);

const faltantes = SELECTORES.filter((s) => !inventario.posiciones[s]?.length);
if (faltantes.length) {
  console.log("");
  console.log(`ROJO · FALTAN REGLAS EN LA HOJA: ${faltantes.join(", ")}`);
  console.log("  Tailwind genera solo las clases que encuentra escritas en el código. Una");
  console.log("  utilidad que no existe mide igual que una que no gana, así que la sonda no");
  console.log("  mide: si la que falta es una utilidad, escribirla en algún lado del repo y");
  console.log("  volver a correr. Si es una del kit, el problema es la hoja del kit.");
  console.log(`  (reglas enumeradas: ${inventario.reglasTotales}, hojas ilegibles por CORS: ${inventario.hojasIlegibles})`);
  cerrar();
  process.exit(1);
}

// ── LA MEDICIÓN ────────────────────────────────────────────────────────────
//
// Sobre elementos REALES metidos en el documento. `getComputedStyle` de un nodo
// suelto devuelve vacío, así que se adjuntan, se miden y se sacan.
const medido = await evaluar(`(() => {
  const casos = ${JSON.stringify(CASOS)};
  const salida = [];
  for (const c of casos) {
    const solo = document.createElement(c.etiqueta);
    solo.className = c.claseKit;
    const mezcla = document.createElement(c.etiqueta);
    mezcla.className = c.claseKit + " " + c.utilidad;
    document.body.append(solo, mezcla);
    salida.push({
      nombre: c.nombre,
      kitSolo: parseFloat(getComputedStyle(solo)[c.propiedad]),
      conUtilidad: parseFloat(getComputedStyle(mezcla)[c.propiedad]),
    });
    solo.remove();
    mezcla.remove();
  }
  return {
    casos: salida,
    remRaiz: parseFloat(getComputedStyle(document.documentElement).fontSize),
  };
})()`);

// ── EL VEREDICTO ───────────────────────────────────────────────────────────
console.log(`  1rem = ${medido.remRaiz}px · ${inventario.reglasTotales} reglas en la hoja`);
console.log("");

let rojo = false;
for (const caso of CASOS) {
  const m = medido.casos.find((x) => x.nombre === caso.nombre);
  // La que decide es la ÚLTIMA aparición de cada selector, no la primera.
  const apKit = inventario.posiciones[`.${caso.claseKit}`];
  const apUtil = inventario.posiciones[`.${caso.utilidad}`];
  const posKit = apKit[apKit.length - 1];
  const posUtil = apUtil[apUtil.length - 1];
  const repetida = apKit.length > 1 || apUtil.length > 1;

  const okSolo = Math.abs(m.kitSolo - caso.esperadoKitSolo) < 0.01;
  const okMezcla = Math.abs(m.conUtilidad - caso.esperadoConUtilidad) < 0.01;

  console.log(`${caso.nombre} · ${caso.propiedad}`);
  console.log(
    `  .${caso.claseKit} solo ............ ${m.kitSolo}px ` +
      `(esperado ${caso.esperadoKitSolo}, de \`${caso.declaraKit}\`) ${okSolo ? "OK" : "✗"}`
  );
  console.log(
    `  .${caso.claseKit} + ${caso.utilidad} ....... ${m.conUtilidad}px ` +
      `(esperado ${caso.esperadoConUtilidad}) ${okMezcla ? "OK" : "✗"}`
  );
  console.log(
    `  orden en la cascada (última aparición): kit en la regla ${posKit}, utilidad en la ${posUtil}` +
      ` — ${posUtil > posKit ? "la utilidad va después, que es lo que la hace ganar" : "LA UTILIDAD VA ANTES Y POR ESO PIERDE"}`
  );
  if (repetida) {
    console.log(
      `  ⚠ hay selectores repetidos en la hoja: .${caso.claseKit} en [${apKit.join(", ")}], ` +
        `.${caso.utilidad} en [${apUtil.join(", ")}]. Una segunda declaración después de las ` +
        "utilidades da vuelta el resultado sin tocar `app/globals.css`."
    );
  }

  if (!okSolo) {
    rojo = true;
    console.log(
      `  ✗ EL CONTROL FALLÓ: \`.${caso.claseKit}\` no está aplicando su propio valor. Sin eso, ` +
        "la otra medición no prueba nada — mediría una utilidad contra nadie."
    );
  }
  if (!okMezcla) {
    rojo = true;
    if (Math.abs(m.conUtilidad - caso.esperadoKitSolo) < 0.01) {
      console.log(
        `  ✗ LA CASCADA ESTÁ DADA VUELTA: con \`${caso.utilidad}\` encima sigue midiendo el valor ` +
          `del kit (${m.conUtilidad}px). La clase del kit le está ganando a la utilidad, así que ` +
          "TODO lo que las pantallas escriben sobre esta pieza dejó de aplicarse."
      );
    } else {
      console.log(`  ✗ dio ${m.conUtilidad}px, que no es ni el valor del kit ni el de la utilidad.`);
    }
  }
  console.log("");
}

if (rojo) {
  console.log("ROJO · la sonda de cascada no pasa.");
  console.log("  Mirar `app/globals.css`: el @import de sunmi.css tiene que ir ANTES de");
  console.log("  `@tailwind utilities`. Y si el orden del archivo está bien, entonces lo que");
  console.log("  cambió está afuera: un `@layer` nuevo, otro motor, u otra hoja importada");
  console.log("  después. Eso es justamente lo que el candado del archivo no puede ver.");
  cerrar();
  process.exit(1);
}

console.log("VERDE · las utilidades de Tailwind le ganan a las clases del kit.");
console.log("  Las 535 declaraciones que las pantallas escriben sobre SunmiButton y SunmiInput");
console.log("  se están aplicando.");
cerrar();
process.exit(0);
