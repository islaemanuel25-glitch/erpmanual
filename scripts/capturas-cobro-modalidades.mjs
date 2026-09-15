// EL PANEL DE COBRO CON MODALIDADES, EJERCIDO EN UN NAVEGADOR DE VERDAD.
//
//   node --experimental-websocket scripts/capturas-cobro-modalidades.mjs \
//     --base http://127.0.0.1:3210 --chrome /usr/bin/chromium --salida /salida
//
// ── QUÉ MIDE QUE NINGÚN CANDADO PUEDE MEDIR ────────────────────────────────
//
// `renderToStaticMarkup` dibuja el estado INICIAL: no hay clicks, no hay estado,
// no hay CSS y no hay 360 px de ancho. Los candados de render de esta tanda
// afirman el estado al que hay que volver; lo que no pueden es ENTRAR al
// selector y después vaciar el carrito, que es exactamente la secuencia que
// estaba rota:
//
//     tocar Mercado Pago → aparece el selector → se registra la venta →
//     el panel tiene que volver solo al principio
//
// Corre sobre `/andamio-cobro-modalidades`, que monta el panel de verdad con sus
// props reales y cuyo botón hace lo único que hace la pantalla al cobrar: vaciar
// el carrito. Así se ejerce la vuelta sin turno abierto y sin dejar ventas de
// prueba adentro de una base.
//
// ── SI NO PUEDE MEDIR, ES ROJO ─────────────────────────────────────────────
//
// Mismo criterio que las otras sondas del proyecto. Una pantalla que no cargó o
// un botón que no apareció no son "no se pudo comprobar": son rojo.

import { spawn } from "node:child_process";
import fs from "node:fs";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3210");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/salida");
const RUTA = "/andamio-cobro-modalidades";
const PUERTO = 9377;

// Los dos anchos que importan: el Sunmi del mostrador y el escritorio.
const VISTAS = [
  { nombre: "sunmi", ancho: 360, alto: 640, movil: true },
  { nombre: "escritorio", ancho: 1366, alto: 900, movil: false },
];

fs.mkdirSync(SALIDA, { recursive: true });

const navegador = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`,
  "--user-data-dir=/tmp/perfil-cobro-modalidades",
  "--no-first-run", "--disable-gpu", "--no-sandbox",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, sig = 0;
const pend = new Map();
const send = (m, p = {}) =>
  new Promise((res, rej) => {
    const id = ++sig;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
  });

let url = null;
for (let i = 0; i < 60 && !url; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PUERTO}/json/list`);
    url = (await r.json()).find((t) => t.type === "page" && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch {}
  if (!url) await esperar(500);
}
if (!url) { console.error("ROJO: el navegador no levantó"); process.exit(1); }

ws = new WebSocket(url);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { res, rej } = pend.get(m.id);
    pend.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
await send("Page.enable");
await send("Runtime.enable");

const evaluar = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

let fallas = 0;
const afirmar = async (condicion, mensaje) => {
  if (condicion) { console.log(`  ✓ ${mensaje}`); return; }
  fallas++;
  const visto = await evaluar("document.body.innerText.slice(0, 400)");
  console.log(`  FALLÓ: ${mensaje}\n    En pantalla había:\n${visto}`);
};

const textoDe = () => evaluar("document.body.innerText");

/** Tocar por texto visible. Rojo si no está: un botón que no aparece no es un caso. */
const tocar = async (texto) => {
  const ok = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null)
      .find((n) => (n.textContent || '').includes(${JSON.stringify(texto)}));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!ok) { console.log(`  FALLÓ: no se encontró el botón «${texto}»`); fallas++; }
  await esperar(500);
  return ok;
};

const foto = async (nombre) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(`${SALIDA}/${nombre}.png`, Buffer.from(data, "base64"));
  console.log(`  ✓ ${nombre}.png`);
};

for (const vista of VISTAS) {
  console.log(`\n▸ ${vista.nombre} — ${vista.ancho}×${vista.alto}`);
  await send("Emulation.setDeviceMetricsOverride", {
    width: vista.ancho, height: vista.alto, deviceScaleFactor: 2, mobile: vista.movil,
  });
  await send("Page.navigate", { url: "about:blank" });
  await esperar(300);
  await send("Page.navigate", { url: `${BASE}${RUTA}` });

  let listo = false;
  for (let i = 0; i < 60 && !listo; i++) {
    await esperar(1000);
    listo = (await textoDe()).includes("Mercado Pago");
  }
  await afirmar(listo, "el andamio cargó con el panel de cobro");
  if (!listo) break;

  // ── 1 · EL PANEL, CON EL CARRITO CARGADO ────────────────────────────────
  await foto(`panel-${vista.nombre}`);

  // ── 2 · EL SELECTOR DE MODALIDAD ────────────────────────────────────────
  await tocar("Mercado Pago");
  const enSelector = await textoDe();
  await afirmar(enSelector.includes("Volver"), "tocar el medio abre el selector");
  await afirmar(
    enSelector.includes("Crédito 1 pago") && enSelector.includes("Crédito 12 cuotas"),
    "están las tres modalidades"
  );
  await afirmar(
    !enSelector.includes("Elegí la modalidad"),
    "ya no está la línea que el encabezado repetía"
  );
  await afirmar(enSelector.includes("Sin recargo"), "la modalidad sin recargo lo dice en palabras");
  await afirmar(enSelector.includes("+7 %") && enSelector.includes("+15 %"), "los recargos llevan signo");

  // EL NOMBRE DEL MEDIO NO SE FUERZA A MAYÚSCULAS: es un dato del local.
  const titulo = await evaluar(`(() => {
    const v = [...document.querySelectorAll('button')].find((n) => (n.textContent || '').includes('Volver'));
    const fila = v && v.parentElement;
    const t = fila && fila.querySelector('span');
    return t ? { texto: t.textContent, transform: getComputedStyle(t).textTransform } : null;
  })()`);
  await afirmar(
    titulo && titulo.transform !== "uppercase",
    `el nombre del medio no va en mayúsculas forzadas (${titulo ? titulo.transform : "no se leyó"})`
  );

  // ── 3 · UNA OPCIÓN SE VE COMO UN BOTÓN DE MEDIO ─────────────────────────
  //
  // No se comparan clases —eso ya lo hace un candado— sino lo que el navegador
  // DIBUJA: alto, radio y familia de fondo. Es lo único que contesta "se ve
  // igual", que es lo que se pidió.
  //
  // NADA DE NÚMEROS MÁGICOS: se compara la opción contra UN BOTÓN DE MEDIO DEL
  // PANEL, medido en la misma corrida. Un umbral escrito a mano ya falló acá
  // —se puso 56 px suponiendo la aritmética de Tailwind por defecto, y en este
  // proyecto `1rem` son 14 px, así que `min-h-14` son 49—. El umbral estaba mal
  // y el botón estaba bien. Comparar contra la pieza de referencia no se puede
  // equivocar así.
  const medir = (texto) => `(() => {
    const b = [...document.querySelectorAll('button')]
      .find((n) => (n.textContent || '').includes(${JSON.stringify(texto)}));
    if (!b) return null;
    const c = getComputedStyle(b);
    return {
      alto: Math.round(b.getBoundingClientRect().height),
      radio: c.borderRadius,
      fondo: c.backgroundColor,
      letra: c.fontSize,
      peso: c.fontWeight,
      borde: c.borderTopWidth,
    };
  })()`;

  const opcion = await evaluar(medir("Crédito 1 pago"));
  await afirmar(opcion != null, "se pudo medir una opción del selector");
  if (opcion) {
    console.log(`     opción: alto ${opcion.alto}px · radio ${opcion.radio} · fondo ${opcion.fondo} · letra ${opcion.letra}/${opcion.peso}`);
    await afirmar(
      opcion.fondo !== "rgba(0, 0, 0, 0)",
      `la opción tiene fondo propio y no queda como texto suelto (${opcion.fondo})`
    );
  }
  await foto(`selector-${vista.nombre}`);

  // Se vuelve al panel para medir la referencia con el mismo navegador y el
  // mismo ancho, y recién ahí se comparan.
  await tocar("Volver");
  const referencia = await evaluar(medir("Banco X"));
  await afirmar(referencia != null, "se pudo medir un botón de medio del panel");
  if (opcion && referencia) {
    console.log(`     medio : alto ${referencia.alto}px · radio ${referencia.radio} · fondo ${referencia.fondo} · letra ${referencia.letra}/${referencia.peso}`);
    for (const eje of ["alto", "radio", "fondo", "letra", "peso", "borde"]) {
      await afirmar(
        opcion[eje] === referencia[eje],
        `la opción y el botón de medio comparten ${eje} (${opcion[eje]} contra ${referencia[eje]})`
      );
    }
  }

  // Y se vuelve a entrar, porque lo que sigue mide la vuelta DESDE el selector.
  await tocar("Mercado Pago");

  // ── 4 · LA VUELTA DESPUÉS DE LA VENTA, QUE ES EL DEFECTO ────────────────
  //
  // Se registra la venta ESTANDO ADENTRO del selector, que es el caso exacto
  // que quedaba roto: el carrito se vaciaba y el panel se quedaba acá.
  await tocar("Registrar venta");
  const despues = await textoDe();
  await afirmar(!despues.includes("Volver"), "registrada la venta, el panel salió del selector");
  await afirmar(despues.includes("Elegí cómo cobrar"), "y volvió al panel de medios");
  await afirmar(
    !despues.includes("214.000") && !despues.includes("230.000"),
    "no quedó pegado ningún total con recargo de la venta cerrada"
  );
  await foto(`despues-de-la-venta-${vista.nombre}`);

  // ── 5 · Y LO MISMO DESDE DIVIDIR PAGO ───────────────────────────────────
  await tocar("Reponer carrito");
  await tocar("Dividir pago");
  await afirmar((await textoDe()).includes("Volver"), "se entró a Dividir pago");
  await tocar("Registrar venta");
  const despues2 = await textoDe();
  await afirmar(!despues2.includes("Volver"), "Dividir pago también vuelve solo");
  await afirmar(despues2.includes("Elegí cómo cobrar"), "y queda el panel de medios");
}

console.log(fallas === 0 ? "\nVERDE · todo como se esperaba" : `\nROJO · ${fallas} afirmaciones fallaron`);
process.exit(fallas === 0 ? 0 : 1);
