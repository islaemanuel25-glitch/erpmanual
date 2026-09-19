// SONDA: EL STEPPER DEL PEDIDO MUESTRA LO QUE ESTÁ EN EL PEDIDO.
//
// ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
//
// El 2026-09-19, en `compras-proveedor/nueva` con Arcor: tocar "Manual" y
// elegir "empezar de nuevo (vaciar pedido)" dejaba los steppers con el número
// del sugerido —269, 213— mientras la tarjeta de contexto decía "0 / 228
// cargados" y el pie decía $0. La pantalla mostraba cantidades que NO estaban
// en el pedido. Para que el producto entrara de verdad había que mover la
// cantidad: de 269 a 270.
//
// La causa era de una línea, en `getDraft`: el borrador de una fila no cargada
// arrancaba en `prod.sugerido`. En automático no se veía, porque el
// autorrelleno siembra `items` y el stepper lee del ítem.
//
// ── POR QUÉ NO LO PUEDE ATAJAR UN CANDADO ─────────────────────────────────
//
// Los candados de este proyecto son funciones puras que leen archivos. Pueden
// afirmar que `getDraft` existe y hasta qué devuelve; no pueden afirmar que el
// número que se ve en la pantalla sea el mismo que cuenta el pie, porque eso
// solo aparece después de montar la pantalla, cargar el catálogo del proveedor,
// cambiar de modo y vaciar. Es un defecto entre piezas, de los que CLAUDE.md
// dice que solo encuentra abrir la pantalla.
//
// ── QUÉ AFIRMA, Y NINGUNA ESCRIBE NADA ────────────────────────────────────
//
// 1. Con el pedido vaciado, la suma de los steppers es CERO.
// 2. El contador de la tarjeta de contexto dice "0 / N cargados".
// 3. El total del pie es $0.
// 4. Los tres coinciden entre sí, que es lo único que el usuario ve.
// 5. "Enviar pedido" está deshabilitado con el pedido vacío.
//
// La sonda navega, toca "Manual", toca "vaciar" y lee. NO toca "Guardar" ni
// "Enviar": en un pedido nuevo los ítems viven en el estado de React y recién
// se escriben al confirmar, así que ejercer esto no hace ni una escritura. Por
// eso —y solo por eso— se puede correr contra producción.
//
// Uso:
//   node --experimental-websocket scripts/sonda-cantidad-del-pedido.mjs \
//     --base https://operix.cloud --proveedor 20 \
//     --usuario admin@admin.com --clave <clave>

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3111");
const PROVEEDOR = arg("proveedor", "20");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9311"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-cantidad-del-pedido"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(PERFIL, { recursive: true, force: true });
fs.mkdirSync(PERFIL, { recursive: true });

const fallas = [];
const afirmar = (ok, titulo, detalle) => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push({ titulo });
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
  throw new Error("El navegador no respondió al puerto de depuración");
}

async function evaluar(expresion, esperaPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion, returnByValue: true, awaitPromise: esperaPromesa,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result.value;
}

async function navegar(url) {
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

async function esperarA(expresion, cuantoMs = 60000, cada = 250) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try { if (await evaluar(expresion)) return true; } catch {}
    await sleep(cada);
  }
  return false;
}

const navegador = spawn(EDGE, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--window-size=360,640", "--no-first-run", "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const morir = (motivo) => {
  console.error(`\nROJO · la sonda no pudo medir: ${motivo}`);
  console.error("Eso no es un pase: una verificación en estado desconocido frena igual.");
  process.exit(1);
};

/** Toca el botón cuyo texto coincide. CSS no sabe de texto y esto sí. */
const tocarPorTexto = (patron) =>
  evaluar(`(() => {
    const re = new RegExp(${JSON.stringify(patron)}, "i");
    const b = [...document.querySelectorAll('button')].find((x) => re.test((x.innerText || "").trim()));
    if (!b) return false;
    b.click();
    return true;
  })()`);

/** Lo que la pantalla MUESTRA, en los tres lugares que tienen que coincidir. */
const leerPantalla = () =>
  evaluar(`JSON.stringify((() => {
    // Los steppers: los inputs de cantidad de cada tarjeta.
    const inputs = [...document.querySelectorAll('input[inputmode="numeric"]')];
    const valores = inputs.map((i) => Number(i.value) || 0);
    const texto = document.body.innerText;
    // "0 / 228 cargados", de la tarjeta de contexto.
    const cargados = texto.match(/(\\d[\\d.]*)\\s*\\/\\s*(\\d[\\d.]*)\\s*cargados/i);
    // El total del pie: el último importe grande de la pantalla.
    const productos = texto.match(/(\\d[\\d.]*)\\s+productos?\\b/i);
    const botonEnviar = [...document.querySelectorAll('button')]
      .find((b) => /enviar pedido/i.test(b.innerText || ""));
    return {
      steppers: valores.length,
      sumaSteppers: valores.reduce((a, b) => a + b, 0),
      cargados: cargados ? Number(cargados[1].replace(/\\./g, "")) : null,
      universo: cargados ? Number(cargados[2].replace(/\\./g, "")) : null,
      productosEnPie: productos ? Number(productos[1].replace(/\\./g, "")) : null,
      enviarHabilitado: botonEnviar ? !botonEnviar.disabled : null,
    };
  })())`);

console.log(`\n── LA CANTIDAD QUE SE VE ES LA QUE ESTÁ EN EL PEDIDO ─────────────\n`);

try {
  ws = new WebSocket(await urlDepurador());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 360, height: 640, deviceScaleFactor: 1, mobile: true,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  await navegar(`${BASE}/modulos/compras-proveedor/nueva?proveedorId=${PROVEEDOR}`);
  if (!(await esperarA(`document.querySelectorAll('input[inputmode="numeric"]').length > 0`, 60000))) {
    morir("el catálogo del proveedor no llegó a dibujar ninguna fila");
  }
  await sleep(1500);

  const antes = JSON.parse(await leerPantalla());
  console.log(`  automático: ${antes.steppers} steppers, suma ${antes.sumaSteppers}, dice "${antes.cargados} / ${antes.universo} cargados"\n`);

  // ── EL CAMINO DEL DEFECTO: manual + vaciar ──────────────────────────────
  if (!(await tocarPorTexto("^Manual$"))) morir("no encontré el botón Manual");
  await sleep(800);
  if (!(await tocarPorTexto("vaciar"))) morir("no apareció la opción de vaciar el pedido");
  await sleep(2500);

  const vacio = JSON.parse(await leerPantalla());
  console.log(`  manual vaciado: ${vacio.steppers} steppers, suma ${vacio.sumaSteppers}, dice "${vacio.cargados} / ${vacio.universo} cargados", pie ${vacio.productosEnPie} productos\n`);

  afirmar(
    vacio.sumaSteppers === 0,
    "con el pedido vaciado, los steppers suman cero",
    `suman ${vacio.sumaSteppers} repartidos en ${vacio.steppers} filas: la pantalla muestra cantidades que no están en el pedido`
  );
  afirmar(
    vacio.cargados === 0,
    "la tarjeta de contexto dice 0 cargados",
    `dice ${vacio.cargados}`
  );
  afirmar(
    vacio.productosEnPie === 0,
    "el pie dice 0 productos",
    `dice ${vacio.productosEnPie}`
  );
  afirmar(
    vacio.sumaSteppers === 0 && vacio.cargados === 0 && vacio.productosEnPie === 0,
    "los tres lugares dicen lo mismo",
    `steppers ${vacio.sumaSteppers}, contador ${vacio.cargados}, pie ${vacio.productosEnPie}`
  );
  afirmar(
    vacio.enviarHabilitado === false,
    "“Enviar pedido” está deshabilitado con el pedido vacío",
    `el botón está ${vacio.enviarHabilitado ? "habilitado" : "ausente"}`
  );

  // ── Y AHORA CON LAS FILAS A LA VISTA, QUE ES LO QUE DE VERDAD PRUEBA ─────
  //
  // Vaciado, la pantalla arranca en "Cargados" y no dibuja ninguna fila: la
  // suma da cero porque no hay nada que sumar. Eso es verde por AUSENCIA, que
  // es la forma de candado que este proyecto tiene anotada como la peor —queda
  // verde para siempre y no cubre nada—.
  //
  // El defecto vivía justamente en las filas NO cargadas, así que hay que
  // mirarlas: se pasa a "Todos", donde el catálogo entero se dibuja con el
  // pedido vacío. Si el borrador volviera a arrancar en el sugerido, acá los
  // steppers sumarían miles otra vez.
  if (!(await tocarPorTexto("^Todos"))) morir("no encontré el filtro Todos");
  await sleep(2500);

  const todos = JSON.parse(await leerPantalla());
  console.log(`\n  manual · Todos: ${todos.steppers} steppers, suma ${todos.sumaSteppers}, dice "${todos.cargados} / ${todos.universo} cargados"\n`);

  afirmar(
    todos.steppers > 0,
    "la vista “Todos” dibuja filas, así que hay algo que mirar",
    "no se dibujó ninguna fila: la afirmación de abajo sería verde por ausencia"
  );
  afirmar(
    todos.sumaSteppers === 0,
    "con filas a la vista y el pedido vacío, los steppers siguen en cero",
    `suman ${todos.sumaSteppers} en ${todos.steppers} filas: el borrador volvió a arrancar en el sugerido`
  );
  afirmar(
    todos.cargados === 0,
    "y el contador sigue diciendo 0 cargados",
    `dice ${todos.cargados}`
  );

  console.log("");
  if (fallas.length) {
    console.log(`ROJO · ${fallas.length} ${fallas.length === 1 ? "afirmación falló" : "afirmaciones fallaron"}.`);
    process.exit(1);
  }
  console.log("VERDE · lo que muestra el stepper es lo que está en el pedido.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
