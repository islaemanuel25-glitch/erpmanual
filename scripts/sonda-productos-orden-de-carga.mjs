// SONDA: ¿EN QUÉ ORDEN SALEN EL LISTADO Y LOS CONTROLES DE PRODUCTOS?
//
// ── QUÉ MIDE, Y POR QUÉ NO ALCANZA CON QUE SEAN RÁPIDOS ───────────────────
//
// `/api/productos/listar` está paginado y trae 25 filas. `/api/productos/controles`
// recorre el catálogo entero de la ubicación hasta `TECHO_CONTROL`. Si los dos
// salen a la vez, el segundo compite con el primero por servidor y por base, y la
// pantalla tarda en mostrar los productos aunque su propia consulta sea barata.
//
// Por eso lo que hay que probar NO es "los dos son rápidos" sino **el orden**:
//
//   1. arranca el listado;
//   2. TERMINA el primer pedido del listado;
//   3. recién ahí arranca controles.
//
// Un umbral de tiempo no lo prueba. Dos pedidos simultáneos en una máquina
// descargada pueden dar los dos rápido y estar compitiendo igual. Se miden los
// instantes de INICIO y de FIN de cada uno, con Resource Timing, y se compara
// `inicioControles` contra `finListado`.
//
// ── CÓMO SE DISTINGUE EL PRIMER PEDIDO DEL RESTO ──────────────────────────
//
// Cambiar de página vuelve a pedir el listado y NO tiene que volver a pedir
// controles. Así que no alcanza con mirar el primero de cada uno: se toma la
// lista completa de pedidos a cada ruta, en orden, y se afirma sobre ella.
//
// ── LO QUE ESTA SONDA NO PRUEBA ───────────────────────────────────────────
//
// No mide la calidad de los datos ni la semántica de los cuatro controles. Mide
// cuándo salen los pedidos y cuánto tardan. Que los números de las cards sean los
// correctos lo prueban los candados del servidor, que son otra pregunta.
//
// Uso:
//   node scripts/sonda-productos-orden-de-carga.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo> [--salida informe.json]
//
// NUNCA contra producción: hace login y navega la interfaz real.

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
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9280"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-productos-orden"));
const SALIDA = arg("salida", null);
const ETIQUETA = arg("etiqueta", "medicion");

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
  for (let i = 0; i < 120; i++) {
    await sleep(200);
    if (await evaluar(`document.readyState === "complete" && location.pathname !== "about:blank"`)) return;
  }
}

async function esperarA(expresion, cuantoMs = 60000, cada = 200) {
  const hasta = Date.now() + cuantoMs;
  while (Date.now() < hasta) {
    try {
      if (await evaluar(expresion)) return true;
    } catch {}
    await sleep(cada);
  }
  return false;
}

const edge = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PUERTO}`,
    `--user-data-dir=${PERFIL}`,
    "--window-size=1366,900",
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

/**
 * Los pedidos a las dos rutas, en orden, con inicio y fin relativos al arranque
 * de la navegación. Sale de Resource Timing, que es lo que el navegador hizo de
 * verdad y no lo que el código dice que iba a hacer.
 */
const pedidos = () =>
  evaluar(
    `JSON.stringify(
       performance.getEntriesByType("resource")
         .filter((e) => e.name.includes("/api/productos/listar") || e.name.includes("/api/productos/controles"))
         .map((e) => ({
           ruta: e.name.includes("/listar") ? "listar" : "controles",
           url: e.name.replace(location.origin, ""),
           inicio: Math.round(e.startTime),
           fin: Math.round(e.responseEnd),
           ms: Math.round(e.duration),
         }))
         .sort((a, b) => a.inicio - b.inicio)
     )`
  );

const limpiarMediciones = () => evaluar(`performance.clearResourceTimings(); true`);

/** Cuántas filas de producto hay dibujadas. */
const filasVisibles = () =>
  evaluar(`document.querySelectorAll('[data-sunmi-row], [data-tarjeta-cara]').length`);

console.log(`\n── ORDEN DE CARGA DE LA PANTALLA DE PRODUCTOS ────────────────────\n`);
console.log(`  etiqueta: ${ETIQUETA}`);
console.log(`  perfil limpio: ${PERFIL}\n`);

const informe = { etiqueta: ETIQUETA, base: BASE };

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

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { performance.setResourceTimingBufferSize(1000); } catch {}
      // El instante en que aparecen las primeras filas. Se mide con un observador
      // y no preguntando cada 200 ms: el sondeo redondea al intervalo y acá la
      // diferencia que se busca es justamente de ese orden.
      window.__primeraFila = null;
      const _obs = new MutationObserver(() => {
        if (window.__primeraFila !== null) return;
        if (document.querySelector('[data-sunmi-row], [data-tarjeta-cara]')) {
          window.__primeraFila = Math.round(performance.now());
        }
      });
      document.addEventListener("DOMContentLoaded", () => {
        _obs.observe(document.body, { childList: true, subtree: true });
      });
    `,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  // ── ENTRADA LIMPIA A LA PANTALLA ─────────────────────────────────────────
  await limpiarMediciones();
  await navegar(`${BASE}/modulos/productos`);
  if (!(await esperarA(`document.querySelectorAll('[data-sunmi-row], [data-tarjeta-cara]').length > 0`, 60000))) {
    morir("la pantalla de productos no dibujó ninguna fila");
  }
  // Se espera a que los controles hayan tenido tiempo de salir y volver, si no
  // el "no salió" sería solo "todavía no".
  await esperarA(
    `performance.getEntriesByType("resource").some((e) => e.name.includes("/api/productos/controles"))`,
    30000
  );
  await sleep(1500);

  const primera = JSON.parse(await pedidos());
  const primeraFila = await evaluar(`window.__primeraFila`);
  const filas = await filasVisibles();

  console.log("── PRIMERA ENTRADA ───────────────────────────────────────────────\n");
  for (const p of primera) {
    console.log(`  ${p.ruta.padEnd(10)} inicio ${String(p.inicio).padStart(6)} ms   fin ${String(p.fin).padStart(6)} ms   dura ${String(p.ms).padStart(5)} ms`);
  }
  console.log(`\n  primeras filas dibujadas a los ${primeraFila} ms · ${filas} filas\n`);

  const listados = primera.filter((p) => p.ruta === "listar");
  const controles = primera.filter((p) => p.ruta === "controles");

  informe.primeraEntrada = { pedidos: primera, primeraFilaMs: primeraFila, filas };

  afirmar(listados.length >= 1, `salió el listado (${listados.length})`, "no salió ningún pedido del listado");
  afirmar(controles.length >= 1, `salieron los controles (${controles.length})`, "no salió ningún pedido de controles");

  if (listados.length && controles.length) {
    const finPrimerListado = listados[0].fin;
    const inicioControles = controles[0].inicio;
    const holgura = inicioControles - finPrimerListado;

    console.log(`  fin del primer listado ....... ${finPrimerListado} ms`);
    console.log(`  inicio de controles .......... ${inicioControles} ms`);
    console.log(`  holgura ...................... ${holgura} ms  ${holgura >= 0 ? "(controles esperó)" : "(SE PISARON)"}\n`);

    informe.primeraEntrada.finPrimerListado = finPrimerListado;
    informe.primeraEntrada.inicioControles = inicioControles;
    informe.primeraEntrada.holgura = holgura;

    afirmar(
      inicioControles >= finPrimerListado,
      `controles empieza DESPUÉS de que terminó el primer listado (holgura ${holgura} ms)`,
      `controles arrancó a los ${inicioControles} ms y el listado recién terminó a los ${finPrimerListado} ms: ` +
        `se solapan ${-holgura} ms y compiten por servidor y base`
    );
    afirmar(
      listados[0].inicio <= inicioControles,
      "el listado arranca primero",
      `controles arrancó antes que el listado`
    );
  }

  // ── CAMBIAR DE PÁGINA NO RECALCULA LOS CONTROLES ─────────────────────────
  console.log("── CAMBIO DE PÁGINA ──────────────────────────────────────────────\n");
  const controlesAntes = controles.length;
  // El botón se busca por su `aria-label`, que es el que el kit le pone y el
  // único que no cambia con el ancho: a 1366 el paginador dibuja una variante y
  // en móvil otra, las dos con textos distintos.
  const paso = await evaluar(
    `(() => {
       const b = [...document.querySelectorAll('[aria-label="Página siguiente"]')]
         .find((x) => !x.disabled);
       if (!b) return false;
       b.click();
       return true;
     })()`
  );
  if (!paso) {
    console.log("  (no hay paginador con más de una página en estos datos: no se pudo ejercer)\n");
    informe.cambioDePagina = { ejercido: false };
  } else {
    await sleep(3000);
    const despues = JSON.parse(await pedidos());
    const listadosDespues = despues.filter((p) => p.ruta === "listar").length;
    const controlesDespues = despues.filter((p) => p.ruta === "controles").length;
    console.log(`  pedidos de listado:   ${listados.length} → ${listadosDespues}`);
    console.log(`  pedidos de controles: ${controlesAntes} → ${controlesDespues}\n`);
    informe.cambioDePagina = { ejercido: true, listadosDespues, controlesDespues, controlesAntes };
    afirmar(
      listadosDespues > listados.length,
      `cambiar de página vuelve a pedir el listado (${listados.length} → ${listadosDespues})`,
      "el listado no se volvió a pedir: la paginación no está andando"
    );
    afirmar(
      controlesDespues === controlesAntes,
      `cambiar de página NO vuelve a pedir controles (${controlesDespues})`,
      `los controles se volvieron a pedir (${controlesAntes} → ${controlesDespues}): su universo no depende de la página`
    );
  }

  if (SALIDA) {
    fs.writeFileSync(SALIDA, JSON.stringify(informe, null, 2));
    console.log(`  informe escrito en ${SALIDA}\n`);
  }
} catch (e) {
  morir(e?.message || String(e));
} finally {
  try { edge.kill(); } catch {}
}

console.log("");
if (fallas.length) {
  console.error(`ROJO · ${fallas.length} afirmación(es) no se cumplen.`);
  for (const f of fallas) console.error(`  · ${f.titulo}`);
  process.exit(1);
}
console.log("VERDE · el listado tiene prioridad y los controles salen después.");
process.exit(0);
