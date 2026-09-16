// EL COBRO EN EFECTIVO, RECORRIDO ENTERO EN LA PANTALLA DE VERDAD.
//
//   node --experimental-websocket scripts/capturas-cobro-efectivo.mjs \
//     --base http://127.0.0.1:3210 --chrome /usr/bin/chromium --salida /salida \
//     --usuario 2 --local 6
//
// ── POR QUÉ NO ALCANZA CON UN ANDAMIO ──────────────────────────────────────
//
// Lo que se rompió en `868c04d7` NO está adentro de `FormaPago`: está en
// `handleCobrar`, que vive en la página. El panel arma bien su tender —con
// identidad, como corresponde— y la página no lo reconocía como efectivo, así
// que cobraba de largo sin abrir el modal de "Cliente paga con".
//
// Un andamio que montara el panel solo habría dado verde: el defecto vive entre
// el panel y la página. Por eso esto corre contra `/modulos/pos-ventas` con una
// sesión firmada, un turno abierto y medios configurados —sin configuración el
// panel manda tenders legacy y el defecto ni siquiera aparece—.
//
// ── NO REGISTRA LA VENTA DE VERDAD… SALVO QUE SE LO PIDA ──────────────────
//
// Por defecto intercepta el `POST /api/pos-ventas/crear` y contesta un ok
// sintético: alcanza para ver que el modal abrió, que el vuelto se calculó y que
// el cuerpo lleva la identidad del tender, sin dejar ventas de prueba en la base.
// El cuerpo interceptado es el que la pantalla armó de verdad.
//
// ── SI NO PUEDE MEDIR, ES ROJO ─────────────────────────────────────────────
//
// Una pantalla que no cargó, un turno que no estaba o un botón que no apareció
// no son "no se pudo comprobar": son rojo.

import { spawn } from "node:child_process";
import fs from "node:fs";
import jwt from "jsonwebtoken";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://127.0.0.1:3210");
const CHROME = arg("chrome", "/usr/bin/chromium");
const SALIDA = arg("salida", "/salida");
const USUARIO = Number(arg("usuario", 2));
const LOCAL = Number(arg("local", 6));
const SECRETO = process.env.AUTH_SECRET;
const PUERTO = 9385;

if (!SECRETO) { console.error("ROJO: falta AUTH_SECRET"); process.exit(1); }
fs.mkdirSync(SALIDA, { recursive: true });

const navegador = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`,
  "--user-data-dir=/tmp/perfil-cobro-efectivo",
  "--window-size=360,640", "--no-first-run", "--disable-gpu", "--no-sandbox",
], { stdio: "ignore" });
process.on("exit", () => { try { navegador.kill(); } catch {} });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, sig = 0;
const pend = new Map();
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++sig; pend.set(id, { res, rej });
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
    const { res, rej } = pend.get(m.id); pend.delete(m.id);
    m.error ? rej(new Error(m.error.message)) : res(m.result);
  }
};
await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });

// LOS PERMISOS SALEN DEL CATÁLOGO DEL REPO, NO DE LA MEMORIA. La primera
// corrida los adivinó —"pos.vender", que no existe— y la pantalla contestó "No
// tenés permisos": doce afirmaciones en rojo por el token y ninguna por el
// código.
const PERMISOS = ["pos", "pos.usar", "pos.anular", "productos", "productos.ver"];
const cookie = (name, value) => send("Network.setCookie", { name, value, domain: "127.0.0.1", path: "/", httpOnly: true });
await cookie("erpazul_sesion", jwt.sign({ id: USUARIO, nombre: "Operador", permisos: PERMISOS, localId: LOCAL }, SECRETO, { expiresIn: "2h" }));
await cookie("erpazul_operador_activo", jwt.sign({ operadorId: USUARIO, nombre: "Operador", localId: LOCAL, _tipo: "operador" }, SECRETO, { expiresIn: "2h" }));

const evaluar = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

let fallas = 0;
const afirmar = async (cond, mensaje) => {
  if (cond) { console.log(`  ✓ ${mensaje}`); return; }
  fallas++;
  const visto = await evaluar("document.body.innerText.slice(0, 500)");
  console.log(`  FALLÓ: ${mensaje}\n    En pantalla:\n${visto}\n`);
};

const texto = () => evaluar("document.body.innerText");
const foto = async (nombre) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(`${SALIDA}/${nombre}.png`, Buffer.from(data, "base64"));
  console.log(`  ✓ ${nombre}.png`);
};

const tocar = async (t) => {
  const ok = await evaluar(`(() => {
    const b = [...document.querySelectorAll('button')]
      .filter((n) => n.offsetParent !== null && !n.disabled)
      .find((n) => (n.textContent || '').includes(${JSON.stringify(t)}));
    if (!b) return false;
    b.click(); return true;
  })()`);
  if (!ok) { console.log(`  FALLÓ: no se encontró el botón «${t}»`); fallas++; }
  await esperar(700);
  return ok;
};

/** Intercepta el POST de la venta y guarda el cuerpo que armó la pantalla. */
const INTERCEPTAR = `(() => {
  window.__ventas = [];
  const real = window.fetch;
  window.fetch = function (entrada, opciones) {
    const u = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    if (u.includes("/api/pos-ventas/crear") && opciones && opciones.method === "POST") {
      window.__ventas.push(JSON.parse(opciones.body));
      return Promise.resolve(new Response(
        JSON.stringify({ ok: true, numero: 9999, breakdown: { subtotal: 0, total: 0, lineas: [] } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ));
    }
    return real.apply(this, arguments);
  };
  return true;
})()`;

const abrirPos = async () => {
  await send("Page.navigate", { url: "about:blank" });
  await esperar(300);
  await send("Page.navigate", { url: `${BASE}/modulos/pos-ventas` });
  let listo = false;
  for (let i = 0; i < 90 && !listo; i++) {
    await esperar(1000);
    listo = (await texto()).includes("Elegí cómo cobrar") || (await texto()).includes("Buscar");
  }
  await evaluar(INTERCEPTAR);
  return listo;
};

/**
 * Carga un producto al carrito con el buscador de la pantalla.
 *
 * Los selectores salen del componente y no de la memoria: el input es
 * `#buscar-producto` —su placeholder es "Codigo o nombre del producto...", así
 * que buscarlo por la palabra "buscar" no lo encuentra— y cada resultado es un
 * `div` con `pos-bg-surface-interactive`, no un `button`. Las dos cosas se
 * adivinaron en la primera corrida y el carrito quedó vacío.
 */
const cargarProducto = async () => {
  const escribio = await evaluar(`(() => {
    const i = document.getElementById('buscar-producto');
    if (!i) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, 'V15');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  if (!escribio) return false;

  for (let i = 0; i < 20; i++) {
    await esperar(600);
    const hay = await evaluar(
      `document.querySelectorAll('.pos-bg-surface-interactive').length`
    );
    if (hay > 0) break;
  }
  return await evaluar(`(() => {
    const fila = [...document.querySelectorAll('.pos-bg-surface-interactive')]
      .find((n) => n.offsetParent !== null && /\\$/.test(n.textContent || ''));
    if (!fila) return false;
    fila.click(); return true;
  })()`);
};

console.log("\n▸ COBRO SIMPLE EN EFECTIVO — 360×640");
await afirmar(await abrirPos(), "el POS cargó");
await afirmar(await cargarProducto(), "se cargó un producto al carrito");
await esperar(1200);
await foto("pos-carrito");

const antesDeTocar = await evaluar("window.__ventas.length");
await tocar("Efectivo");
const enModal = await texto();

await afirmar(
  enModal.includes("Cliente paga con") || enModal.includes("paga con"),
  "tocar Efectivo abre el modal de «Cliente paga con»"
);
await afirmar(
  (await evaluar("window.__ventas.length")) === antesDeTocar,
  "y NO se registró la venta antes de confirmar: eso era el defecto"
);
await foto("modal-efectivo");

// Cargar un monto mayor y mirar el vuelto.
const total = await evaluar(`(() => {
  const m = document.body.innerText.match(/\\$\\s?([\\d.]+,\\d{2})/);
  return m ? m[1] : null;
})()`);
// EL INPUT DEL MODAL, NO EL BUSCADOR DE ATRÁS. La primera versión agarraba
// "el primer input visible" y ése es el buscador de productos, que sigue
// visible detrás del velo: el monto no entraba, el vuelto no aparecía y
// "Confirmar" seguía deshabilitado.
await afirmar(
  await evaluar(`(() => {
    const modal = document.querySelector('.fixed.inset-0');
    const i = modal && modal.querySelector('input[type="number"]');
    if (!i) return false;
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, '100000');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`),
  "se pudo escribir el monto en el campo del modal"
);
await esperar(600);
const conVuelto = await texto();
await afirmar(/vuelto/i.test(conVuelto), "con un monto mayor se ve el vuelto");
console.log(`     total en pantalla: $${total ?? "?"} · pagó con $100.000`);
await foto("modal-efectivo-vuelto");

await tocar("Confirmar");
await esperar(1500);
const ventas = await evaluar("window.__ventas");
await afirmar(Array.isArray(ventas) && ventas.length === 1, `confirmar registra la venta (${ventas?.length ?? 0})`);
if (ventas && ventas[0]) {
  const v = ventas[0];
  console.log(`     cuerpo: formaPago=${v.formaPago} · pagos=${JSON.stringify(v.pagos)}`);
  await afirmar(v.formaPago === "efectivo", `la venta sale como efectivo (${v.formaPago})`);
  await afirmar(
    Array.isArray(v.pagos) && v.pagos.length === 1 && v.pagos[0].medioCobroLocalId != null,
    "y con la IDENTIDAD del medio configurado, no con el compat legacy"
  );
}
await esperar(1500);
await foto("despues-de-confirmar");

console.log("\n▸ DIVIDIR PAGO CON UNA FILA DE EFECTIVO");
await afirmar(await abrirPos(), "el POS volvió a cargar");
await afirmar(await cargarProducto(), "se cargó un producto");
await esperar(1200);
await tocar("Dividir pago");
await afirmar((await texto()).includes("Volver"), "se entró a Dividir pago");

// UNA SOLA FILA, LA DE EFECTIVO. El panel abre con dos —el primer medio y el
// segundo— y la segunda vacía deja "COBRAR" deshabilitado. Se quita con su ×,
// que además es el caso que hay que medir: dividir pago con una fila de efectivo.
await evaluar(`(() => {
  const x = [...document.querySelectorAll('button')]
    .filter((n) => n.offsetParent !== null && n.getAttribute('aria-label') === 'Eliminar medio' && !n.disabled);
  if (x.length < 2) return false;
  x[x.length - 1].click();
  return true;
})()`);
await esperar(600);

// La fila de EFECTIVO se lleva el total. El panel arranca con las filas vacías,
// así que "COBRAR" está deshabilitado hasta que la suma dé exacta — y un botón
// deshabilitado no se toca, por eso hay que cargar el importe primero.
const cargoLaFila = await evaluar(`(() => {
  const m = document.body.innerText.match(/Total:\\s*\\$([\\d.]+,\\d{2})/);
  if (!m) return false;
  const total = m[1].replace(/\\./g, "").replace(",", ".");
  const i = [...document.querySelectorAll('input[type="number"]')].find((n) => n.offsetParent !== null);
  if (!i) return false;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(i, total);
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return total;
})()`);
await afirmar(Boolean(cargoLaFila), `se cargó el total en la fila de efectivo (${cargoLaFila})`);
await esperar(700);
await foto("dividir-pago");

const antes2 = await evaluar("window.__ventas.length");
await tocar("COBRAR");
const trasDividir = await texto();
await afirmar(
  /paga con/i.test(trasDividir),
  "con una fila de efectivo, Dividir pago también abre el modal"
);
await afirmar(
  (await evaluar("window.__ventas.length")) === antes2,
  "y tampoco registra antes de confirmar"
);
await foto("dividir-modal-efectivo");

console.log(fallas === 0 ? "\nVERDE · todo como se esperaba" : `\nROJO · ${fallas} afirmaciones fallaron`);
process.exit(fallas === 0 ? 0 : 1);
