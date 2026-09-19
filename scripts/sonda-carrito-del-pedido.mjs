// SONDA: EL PEDIDO EN ARMADO SOBREVIVE A SALIR DE LA PANTALLA.
//
// ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
//
// Cargar productos y refrescar la página perdía todo, y además volvía a la
// pantalla de elegir proveedor: los ítems vivían solo en el estado de React y
// el guardado en `sessionStorage` lo llamaba un único lugar —al ir a editar un
// producto—, así que cualquier otra salida se llevaba el trabajo puesto.
//
// ── QUÉ EJERCE, Y QUÉ NO ──────────────────────────────────────────────────
//
// Carga una cantidad, refresca, y comprueba que el proveedor y la línea sigan
// ahí. Después vacía el pedido, refresca de nuevo, y comprueba que NO quedó
// nada.
//
// NO ejerce "Enviar pedido", y es deliberado: enviar escribe un pedido de
// verdad en la base de producción, con los cinco locales operando. La limpieza
// al enviar pasa por `resetParaNuevoPedido`, que llama al MISMO
// `limpiarEnCurso` que ejerce el camino de vaciar — o sea que lo que queda sin
// ejercer es la llamada, no el borrado.
//
// Todo lo demás es de lectura: en un pedido nuevo los ítems viven en el estado
// de React hasta que se confirma.
//
// Uso:
//   node --experimental-websocket scripts/sonda-carrito-del-pedido.mjs \
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
const PUERTO = Number(arg("puerto-cdp", "9321"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-carrito-del-pedido"));

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

/** Qué hay en pantalla: proveedor, cuántas líneas cargadas y qué guardó. */
const leerEstado = () =>
  evaluar(`JSON.stringify((() => {
    const texto = document.body.innerText;
    const cargados = texto.match(/(\\d[\\d.]*)\\s*\\/\\s*(\\d[\\d.]*)\\s*cargados/i);
    let guardado = null;
    try { guardado = sessionStorage.getItem("comprasPedidoEnCurso"); } catch {}
    let lineasGuardadas = null;
    try { lineasGuardadas = guardado ? (JSON.parse(guardado).lineas || []).length : 0; } catch { lineasGuardadas = -1; }
    return {
      // Por el ATRIBUTO y no por \`innerText\`: un placeholder no es un nodo de
      // texto, así que buscarlo en el texto renderizado da \`false\` SIEMPRE —y
      // esta afirmación pasaba en verde justo cuando la pantalla estaba en
      // elegir proveedor, que es lo que tiene que atrapar.
      eligiendoProveedor: !!document.querySelector('input[placeholder="Buscar proveedor"]'),
      cargados: cargados ? Number(cargados[1].replace(/\\./g, "")) : null,
      lineasGuardadas,
      haySteppers: document.querySelectorAll('input[inputmode="numeric"]').length,
    };
  })())`);

const URL_PEDIDO = `${BASE}/modulos/compras-proveedor/nueva?proveedorId=${PROVEEDOR}`;

console.log(`\n── EL PEDIDO EN ARMADO SOBREVIVE A UN REFRESCO ───────────────────\n`);

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
  await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  // ── 1 · CARGAR ALGO ──────────────────────────────────────────────────────
  await navegar(URL_PEDIDO);
  if (!(await esperarA(`document.querySelectorAll('input[inputmode="numeric"]').length > 0`, 60000))) {
    morir("el catálogo del proveedor no dibujó ninguna fila");
  }
  await sleep(2000);
  const cargado = JSON.parse(await leerEstado());
  console.log(`  cargado: ${cargado.cargados} líneas en pantalla, ${cargado.lineasGuardadas} guardadas\n`);

  afirmar(
    cargado.cargados > 0,
    "el pedido arranca con líneas cargadas (automático siembra los sugeridos)",
    `dice ${cargado.cargados}: sin nada cargado la prueba del refresco no probaría nada`
  );
  afirmar(
    cargado.lineasGuardadas === cargado.cargados,
    "lo que hay en pantalla quedó guardado en el navegador",
    `pantalla ${cargado.cargados}, guardado ${cargado.lineasGuardadas}`
  );

  // ── 2 · REFRESCAR ────────────────────────────────────────────────────────
  // Sin el `?proveedorId=`, que es como se ve de verdad: si el proveedor no se
  // restaura del guardado, acá cae en la pantalla de elegir proveedor.
  await navegar(`${BASE}/modulos/compras-proveedor/nueva`);
  await sleep(5000);
  const tras = JSON.parse(await leerEstado());
  console.log(`  tras refrescar: eligiendoProveedor=${tras.eligiendoProveedor}, ${tras.cargados} cargados, ${tras.lineasGuardadas} guardadas\n`);

  afirmar(
    tras.eligiendoProveedor === false,
    "tras refrescar NO vuelve a la pantalla de elegir proveedor",
    "volvió a elegir proveedor: el proveedor del pedido en armado no se restauró"
  );
  afirmar(
    tras.cargados === cargado.cargados,
    "tras refrescar están las mismas líneas",
    `antes ${cargado.cargados}, después ${tras.cargados}`
  );

  // ── 3 · VACIAR Y REFRESCAR: NO TIENE QUE QUEDAR NADA ─────────────────────
  if (!(await tocarPorTexto("^Manual$"))) morir("no encontré el botón Manual");
  await sleep(800);
  if (!(await tocarPorTexto("vaciar"))) morir("no apareció la opción de vaciar el pedido");
  await sleep(2500);

  const vaciado = JSON.parse(await leerEstado());
  afirmar(
    vaciado.lineasGuardadas === 0,
    "vaciar el pedido también borra lo guardado",
    `quedaron ${vaciado.lineasGuardadas} líneas guardadas: refrescar resucitaría lo que se acaba de tirar`
  );

  await navegar(`${BASE}/modulos/compras-proveedor/nueva`);
  await sleep(5000);
  const despues = JSON.parse(await leerEstado());
  console.log(`\n  tras vaciar y refrescar: eligiendoProveedor=${despues.eligiendoProveedor}, ${despues.lineasGuardadas} guardadas\n`);

  afirmar(
    despues.lineasGuardadas === 0,
    "tras vaciar y refrescar no quedó ningún carrito",
    `quedaron ${despues.lineasGuardadas} líneas`
  );

  console.log("");
  if (fallas.length) {
    console.log(`ROJO · ${fallas.length} ${fallas.length === 1 ? "afirmación falló" : "afirmaciones fallaron"}.`);
    process.exit(1);
  }
  console.log("VERDE · el pedido en armado sobrevive al refresco y se limpia cuando corresponde.");
  process.exit(0);
} catch (e) {
  morir(e?.message || String(e));
}
