// SONDA: ¿UN CACHÉ CORRUPTO SE CURA, O EL TELÉFONO QUEDA EN EL RESPALDO?
//
// ── POR QUÉ EXISTE, TENIENDO EL CANDADO U14 ───────────────────────────────
//
// U14 prueba el ORQUESTADOR: que reintente una sola vez, que invalide, que no
// guarde bytes malos. Lo hace con pasos de mentira, en Node, y por eso puede
// contar llamadas — pero no toca la Cache API ni a ORT.
//
// Lo que NO puede probar es lo único que importa acá: que cuando los bytes
// guardados están podridos DE VERDAD, el recorte vuelve a salir por u2netp. Eso
// necesita un navegador, la Cache API real y el runtime real fallando de la
// forma en que falla.
//
// ── LOS DOS CASOS SE CURAN EN MOMENTOS DISTINTOS, Y NO ES UN DETALLE ──────
//
// Salió de leer `node_modules/onnxruntime-web/lib/wasm/wasm-factory.ts`:
//
//   · MODELO podrido — el runtime ya arrancó bien y lo que falla es
//     `InferenceSession.create`. Se cura EN LA MISMA CARGA: se invalida, se baja
//     el modelo de nuevo y la sesión sale. La persona no ve nada raro.
//
//   · WASM podrido — ORT prende su bandera `aborted` y no la vuelve a apagar
//     nunca (`dispose` la deja en true). Cualquier llamada posterior en esa
//     página tira "previous call to 'initializeWebAssembly()' failed" sin
//     siquiera mirar el binario nuevo. Así que esa foto sale por el motor de
//     bordes, y la cura llega EN LA RECARGA SIGUIENTE, porque lo que sí quedó
//     hecho es borrar las entradas podridas.
//
// Un solo caso no distingue las dos cosas. Por eso se ejercen por separado, y
// por eso el caso del wasm afirma un respaldo EN VEZ de afirmar que no lo hubo:
// afirmar lo contrario sería escribir una expectativa que el runtime no cumple.
//
// Uso:
//   node scripts/sonda-u2netp-cache.mjs --base http://localhost:3111 \
//     --usuario admin@admin.com --clave <clave-de-desarrollo>
//
// NUNCA contra producción: hace login y procesa imágenes en la ficha real.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { prepararSesion } from "./lib/sesionArnes.mjs";

const arg = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
};

const BASE = arg("base", "http://localhost:3111");
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
const PUERTO = Number(arg("puerto-cdp", "9254"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
const PERFIL = arg("perfil", path.join(os.tmpdir(), "sonda-u2netp-cache"));

if (!USUARIO || !CLAVE) {
  console.error("Faltan --usuario y --clave. Sin sesión esto mide la pantalla de login.");
  process.exit(1);
}

const RUTA_MODELO = "/modelos/u2netp/u2netp.onnx";
const RUTA_WASM = "/modelos/u2netp/ort-wasm-simd-threaded.wasm";

// Un almacén que NO es nuestro. Existe para comprobar que la limpieza de
// versiones viejas no se lleva puesto nada ajeno.
const ALMACEN_AJENO = "algo-de-otra-parte-v1";

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

async function esperarA(expresion, cuantoMs = 90000, cada = 500) {
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
    "--window-size=390,844",
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

// La misma imagen del caso fácil de `sonda-u2netp-casos.mjs`. Acá no se mide
// calidad de recorte: se mide QUÉ MOTOR lo hizo.
const PINTA = `(x, y) => (x >= 20 && x <= 39 && y >= 20 && y <= 39) ? [30, 60, 180] : [240, 240, 240]`;

console.log(`\n── RECUPERACIÓN DE UN CACHÉ CORRUPTO ─────────────────────────────\n`);
console.log(`  perfil limpio: ${PERFIL}\n`);

let idProducto = null;

/** Una vuelta completa: recargar la ficha, meter una foto, esperar el recorte. */
async function recortarUnaVez(cuantoMs = 120000) {
  await navegar(`${BASE}/modulos/productos/editar/${idProducto}`);
  if (!(await esperarA(`Boolean(document.querySelector('input[type="file"][accept="image/*"]'))`, 30000))) {
    morir("la ficha no dibujó la carga de foto");
  }
  await evaluar(
    `(async () => {
       const inp = document.querySelector('input[type="file"][accept="image/*"]');
       const f = await window.__pintar(60, ${PINTA});
       const dt = new DataTransfer();
       dt.items.add(f);
       inp.files = dt.files;
       inp.dispatchEvent(new Event("change", { bubbles: true }));
       return true;
     })()`,
    true
  );
  const salio = await esperarA(`Boolean(document.querySelector('[data-foto-vista-sin-fondo]'))`, cuantoMs);
  const respaldos = await evaluar(`window.__respaldos || 0`);
  const pedidos = await evaluar(
    `performance.getEntriesByType("resource").filter((e) => e.name.includes("modelos/u2netp")).length`
  );
  return { salio, respaldos, pedidos };
}

/** El estado del almacén: cómo se llama y qué guarda. */
const estadoDelCache = () =>
  evaluar(
    `(async () => {
       const nombres = await caches.keys();
       const mio = nombres.find((n) => n.startsWith("u2netp-"));
       let entradas = [];
       if (mio) {
         const c = await caches.open(mio);
         entradas = (await c.keys()).map((r) => new URL(r.url).pathname).sort();
       }
       return JSON.stringify({ nombres: nombres.sort(), almacen: mio || null, entradas });
     })()`,
    true
  );

/** Pisa una entrada del almacén con basura. Es el corazón de la sonda. */
const pudrir = (ruta) =>
  evaluar(
    `(async () => {
       const nombres = await caches.keys();
       const mio = nombres.find((n) => n.startsWith("u2netp-"));
       if (!mio) return "sin almacen";
       const c = await caches.open(mio);
       const basura = new Uint8Array(4096);
       for (let i = 0; i < basura.length; i++) basura[i] = (i * 31) % 251;
       await c.put(${JSON.stringify(ruta)}, new Response(basura, { status: 200 }));
       return "podrido";
     })()`,
    true
  );

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
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });

  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
      window.__respaldos = 0;
      window.__motivos = [];
      const _warn = console.warn;
      console.warn = (...a) => {
        try {
          if (String(a[0] || "").includes("[quitarFondo]")) {
            window.__respaldos++;
            window.__motivos.push(String(a[1] || ""));
          }
        } catch {}
        return _warn.apply(console, a);
      };

      window.__pintar = async (n, pinta) => {
        const c = document.createElement("canvas");
        c.width = n; c.height = n;
        const ctx = c.getContext("2d");
        const img = ctx.createImageData(n, n);
        for (let y = 0; y < n; y++) {
          for (let x = 0; x < n; x++) {
            const col = pinta(x, y);
            const o = (y * n + x) * 4;
            img.data[o] = col[0]; img.data[o+1] = col[1]; img.data[o+2] = col[2]; img.data[o+3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        const b = await new Promise((r) => c.toBlob(r, "image/png"));
        return new File([b], "caso.png", { type: "image/png" });
      };
    `,
  });

  await prepararSesion({ navegar, evaluar, base: BASE, usuario: USUARIO, clave: CLAVE, log: (m) => console.log(m) });

  idProducto = await evaluar(
    `fetch("/api/productos/listar?page=1&pageSize=1", { credentials: "include" })
       .then((r) => r.json()).then((j) => (j.items || [])[0]?.id ?? null)`,
    true
  );
  if (!idProducto) morir("no hay ningún producto en estos datos: no hay ficha donde cargar una foto");
  console.log(`  producto de prueba: ${idProducto}\n`);

  // Un almacén ajeno, para comprobar después que la limpieza no se lo llevó.
  await navegar(`${BASE}/modulos/productos/editar/${idProducto}`);
  await evaluar(
    `caches.open(${JSON.stringify(ALMACEN_AJENO)}).then((c) => c.put("/algo-ajeno", new Response("no me toques"))).then(() => true)`,
    true
  );

  // ── PASO 1: LA PRIMERA VEZ, TODO SANO ────────────────────────────────────
  console.log("── paso 1 · primera carga, con el caché vacío ────────────────────\n");
  const uno = await recortarUnaVez(180000);
  afirmar(uno.salio, "salió el recorte", "no apareció ninguna vista sin fondo");
  afirmar(uno.respaldos === 0, `lo hizo u2netp (${uno.respaldos} respaldos)`, "cayó al motor por bordes ya en la primera");
  afirmar(uno.pedidos >= 2, `bajó modelo y runtime (${uno.pedidos} recursos)`, "no pidió nada: el perfil no estaba limpio");

  const c1 = JSON.parse(await estadoDelCache());
  console.log(`     almacén: ${c1.almacen}`);
  afirmar(
    Boolean(c1.almacen) && /^u2netp-[0-9a-f]{16}$/.test(c1.almacen),
    `el almacén lleva la huella del contenido (${c1.almacen})`,
    `el nombre no tiene forma de huella: ${c1.almacen}`
  );
  afirmar(c1.entradas.length === 2, `quedaron guardados los dos archivos (${c1.entradas.length})`, `guardó ${c1.entradas.length}`);

  // ── PASO 2: MODELO PODRIDO — se cura en la MISMA carga ───────────────────
  console.log("\n── paso 2 · el MODELO guardado se corrompe ───────────────────────\n");
  await pudrir(RUTA_MODELO);
  const dos = await recortarUnaVez(180000);
  afirmar(dos.salio, "salió el recorte igual", "no apareció ninguna vista sin fondo");
  afirmar(
    dos.respaldos === 0,
    `se recuperó SIN caer al respaldo (${dos.respaldos} respaldos)`,
    "cayó a bordes: la recuperación no funcionó para el modelo"
  );
  afirmar(
    dos.pedidos >= 1,
    `volvió a bajar de red lo que hacía falta (${dos.pedidos} recursos)`,
    "no pidió nada: entonces no se invalidó el caché"
  );
  const c2 = JSON.parse(await estadoDelCache());
  afirmar(c2.entradas.length === 2, `el caché quedó sano otra vez (${c2.entradas.length} entradas)`, `quedó con ${c2.entradas.length}`);

  // ── PASO 3: WASM PODRIDO — esta foto sale por bordes, y se limpia ────────
  console.log("\n── paso 3 · el WASM guardado se corrompe ─────────────────────────\n");
  await pudrir(RUTA_WASM);
  const tres = await recortarUnaVez(180000);
  afirmar(tres.salio, "salió una imagen igual: la persona no se queda sin foto", "no salió ninguna vista");
  afirmar(
    tres.respaldos >= 1,
    `esta foto sale por el respaldo, como se esperaba (${tres.respaldos})`,
    "no hubo respaldo: si ORT dejó de abortar, este caso hay que volver a medirlo"
  );
  const c3 = JSON.parse(await estadoDelCache());
  afirmar(
    c3.entradas.length === 0,
    `las entradas podridas quedaron BORRADAS (${c3.entradas.length})`,
    `quedaron ${c3.entradas.length}: el teléfono volvería a leer basura`
  );

  // ── PASO 4: LA RECARGA SIGUIENTE SE CURA SOLA ────────────────────────────
  console.log("\n── paso 4 · la recarga siguiente ─────────────────────────────────\n");
  const cuatro = await recortarUnaVez(180000);
  afirmar(cuatro.salio, "salió el recorte", "no apareció ninguna vista sin fondo");
  afirmar(
    cuatro.respaldos === 0,
    `volvió a hacerlo u2netp (${cuatro.respaldos} respaldos)`,
    "sigue en el respaldo: el teléfono quedó pegado, que es justo lo que había que arreglar"
  );
  afirmar(cuatro.pedidos >= 2, `bajó los dos de nuevo (${cuatro.pedidos})`, "no rebajó nada");

  // ── PASO 5: NO SE TOCÓ NADA AJENO ────────────────────────────────────────
  console.log("\n── paso 5 · lo que no es nuestro no se toca ──────────────────────\n");
  const c5 = JSON.parse(await estadoDelCache());
  afirmar(
    c5.nombres.includes(ALMACEN_AJENO),
    `el almacén ajeno sigue estando (${ALMACEN_AJENO})`,
    `la limpieza se llevó puesto un almacén que no es de este motor: ${c5.nombres.join(", ")}`
  );
  const mios = c5.nombres.filter((n) => n.startsWith("u2netp-"));
  afirmar(
    mios.length === 1,
    `hay un solo almacén de u2netp (${mios.join(", ")})`,
    `quedaron ${mios.length} almacenes del motor: la limpieza de versiones viejas no corrió`
  );
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
console.log("VERDE · un caché podrido se cura, y no se lleva puesto nada ajeno.");
process.exit(0);
