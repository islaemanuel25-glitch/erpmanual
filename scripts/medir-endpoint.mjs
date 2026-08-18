// scripts/medir-endpoint.mjs
//
// Corre un fetch DESDE DENTRO de la aplicación, con la sesión del navegador, y
// mide cuánto tarda y qué contesta.
//
// Existe porque "se queda en Buscando… para siempre" tiene tres causas posibles
// —la ruta no existe, la consulta no se dispara, o la respuesta tarda— y las
// tres se ven igual desde afuera. Acá se separan con números.
//
// Uso:
//   MSYS_NO_PATHCONV=1 node scripts/medir-endpoint.mjs \
//     --pagina /modulos/compras --url "/api/productos/listar?q=Philips&pageSize=8"

import { spawn } from "node:child_process";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3111");
const PAGINA = arg("pagina", "/");
const RUTA = arg("url", "/api/version");
// El perfil sale del temporal del sistema, no de una ruta escrita a mano: este
// repositorio es público y el nombre de usuario no tiene por qué estar acá.
// Resuelve al mismo lugar en la máquina donde corre.
const PERFIL = arg("perfil", path.join(tmpdir(), "desborde-edge"));
const PUERTO = Number(arg("puerto-cdp", "9225"));
const EDGE = arg("edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, sessionId, id = 0;
const pending = new Map();

const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (conSesion && sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`);
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge no respondió");
}

const edge = spawn(EDGE, [
  "--headless=new",
  `--remote-debugging-port=${PUERTO}`,
  `--user-data-dir=${PERFIL}`,
  "--no-first-run",
  "--disable-gpu",
], { stdio: "ignore" });
process.on("exit", () => { try { edge.kill(); } catch {} });

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
await send("Page.navigate", { url: BASE + PAGINA });
await sleep(4000);

// Login opcional, contra la base LOCAL. La cookie la emite el servidor: no se
// firma ni se inyecta nada a mano.
const USUARIO = arg("usuario");
const CLAVE = arg("clave");
if (USUARIO && CLAVE) {
  const login = await send("Runtime.evaluate", {
    expression: `fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ${JSON.stringify(USUARIO)}, password: ${JSON.stringify(CLAVE)} }),
    }).then(r => r.status)`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log("login:", login.result?.value);
  await send("Page.navigate", { url: BASE + PAGINA });
  await sleep(3000);
}

// El contexto operativo, si se pide: la aplicación lo guarda en una cookie y
// sin él las rutas contestan 409 antes de hacer nada.
const CTX = arg("contexto");
if (CTX) {
  await send("Runtime.evaluate", {
    expression: `document.cookie = "erpazul_contexto_activo=" + encodeURIComponent(${JSON.stringify(CTX)}) + "; path=/"`,
    returnByValue: true,
  });
}

// El MISMO fetch que hace el componente, con la sesión de la página.
const expresion = `(async () => {
  const t0 = performance.now();
  try {
    const r = await fetch(${JSON.stringify(RUTA)});
    const ms = Math.round(performance.now() - t0);
    const texto = await r.text();
    let cuantos = null;
    try { const d = JSON.parse(texto); cuantos = Array.isArray(d.items) ? d.items.length : (Array.isArray(d.productos) ? d.productos.length : null); } catch {}
    return { estado: r.status, ms, cuantos, muestra: texto.slice(0, 200) };
  } catch (e) {
    return { estado: "EXCEPCIÓN", ms: Math.round(performance.now() - t0), error: String(e) };
  }
})()`;

const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true, awaitPromise: true, timeout: 120000 });
if (r.exceptionDetails) {
  console.log("falló la evaluación:", r.exceptionDetails.exception?.description || r.exceptionDetails.text);
} else {
  const v = r.result.value;
  console.log(`estado: ${v.estado} | tardó: ${v.ms} ms | items: ${v.cuantos ?? "(no es una lista)"}`);
  if (v.error) console.log("error:", v.error);
  if (v.muestra) console.log("respuesta:", v.muestra);
}
process.exit(0);
