// Driver CDP para la PRUEBA MANUAL guiada (emulación móvil). Lanza Edge headless,
// setea cookies (admin + contexto local), navega la página QA temporal y ejerce
// el editor de corrección: viewport 360/412, agregar/editar/quitar, buscador
// (scoping por local), cliente, pagos, revisar y confirmar. Guarda screenshots,
// consola, requests fallidos y tiempos.
// Uso: SEED_JSON=<path> OUT=<dir> node scripts/cdp-manual-test.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = process.env.OUT || ".";
const seed = JSON.parse(fs.readFileSync(process.env.SEED_JSON, "utf8"));
const BASE = "http://localhost:3011";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const UDD = path.join(OUT, "edge-profile");
const evidence = { pasos: [], consola: [], requestsFallidos: [], tiempos: {} };
const log = (m) => { console.log(m); evidence.pasos.push(m); };

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// --- Lanzar Edge -----------------------------------------------------------
const edge = spawn(EDGE, [
  "--headless=new", "--remote-debugging-port=9222", `--user-data-dir=${UDD}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  "about:blank",
], { stdio: "ignore" });

async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch("http://127.0.0.1:9222/json/version");
      const j = await r.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Edge CDP no respondió");
}

// --- Cliente CDP mínimo ----------------------------------------------------
let ws, msgId = 0, sessionId = null;
const pending = new Map();
const evHandlers = [];
function send(method, params = {}, useSession = true) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    const msg = { id, method, params };
    if (useSession && sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });
}
function onEvent(fn) { evHandlers.push(fn); }

async function connect() {
  const wsUrl = await getWs();
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); return; }
    if (m.method) for (const h of evHandlers) h(m);
  };
  // Attach a un target de página.
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
}

// --- Captura de consola / requests -----------------------------------------
onEvent((m) => {
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
    evidence.consola.push({ tipo: m.params.type, texto: (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 300) });
  }
  if (m.method === "Runtime.exceptionThrown") {
    evidence.consola.push({ tipo: "exception", texto: (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || "").slice(0, 300) });
  }
  if (m.method === "Log.entryAdded" && ["error"].includes(m.params.entry.level)) {
    evidence.consola.push({ tipo: "log", texto: (m.params.entry.text || "").slice(0, 300) });
  }
  if (m.method === "Network.responseReceived") {
    const { status, url } = m.params.response;
    if (status >= 400) evidence.requestsFallidos.push({ status, url });
  }
  if (m.method === "Network.loadingFailed") {
    evidence.requestsFallidos.push({ status: "failed", error: m.params.errorText, url: m.params.requestId });
  }
});

// --- Helpers de página -----------------------------------------------------
async function setCookies() {
  const common = { domain: "localhost", path: "/" };
  await send("Network.setCookie", { name: "erpazul_sesion", value: seed.token, url: BASE, ...common });
  await send("Network.setCookie", { name: "erpazul_contexto_activo", value: decodeURIComponent(seed.contexto), url: BASE, ...common });
}
async function emulate(width) {
  await send("Emulation.setDeviceMetricsOverride", { width, height: 780, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });
}
async function goto(url) {
  await send("Page.navigate", { url });
  await sleep(400);
  // esperar a que el status de la página QA deje de decir "cargando"
  for (let i = 0; i < 40; i++) {
    const s = await evalJS(`document.querySelector('[data-qa=status]')?.textContent || ''`);
    if (s && !s.includes("cargando")) return s;
    await sleep(150);
  }
  return await evalJS(`document.querySelector('[data-qa=status]')?.textContent || ''`);
}
// expr = EXPRESIÓN (se le antepone return). Para IIFE u optional-chaining funciona.
async function evalJS(expr) {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: `(function(){ return (${expr}); })()`, returnByValue: true });
  if (exceptionDetails) return undefined;
  return result.value;
}
async function clickText(txt) {
  return evalJS(`(function(){
    var els = [].slice.call(document.querySelectorAll('button, a, [role=button]'));
    var el = els.find(function(e){ return e.textContent.trim().indexOf(${JSON.stringify(txt)}) !== -1 && !e.disabled; });
    if (el) { el.click(); return true; } return false;
  })()`);
}
async function setInput(selector, value) {
  return evalJS(`(function(){
    var el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    var proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(String(value))});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}
async function shot(name) {
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(OUT, `${name}.png`);
  fs.writeFileSync(p, Buffer.from(data, "base64"));
  return p;
}
async function overflowX() {
  return evalJS(`Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`);
}

// --- Flujo -----------------------------------------------------------------
async function run() {
  await connect();
  await setCookies();

  // ===== Viewport 360: flujo completo de corrección =====
  await emulate(360);
  let t0 = Date.now();
  const st = await goto(`${BASE}/modulos/qa-correccion?id=${seed.ventas.corregible}`);
  evidence.tiempos.cargarDetalle_ms = Date.now() - t0;
  log(`[360] detalle corregible: ${st}`);
  await shot("01-detalle-360");
  log(`[360] overflowX detalle = ${await overflowX()} px`);

  // Botón "Corregir venta" habilitado → abrir editor.
  const abrió = await clickText("Corregir venta");
  log(`[360] click 'Corregir venta' → ${abrió}`);
  t0 = Date.now();
  for (let i = 0; i < 30; i++) { if (await evalJS(`!!document.querySelector('input[placeholder*="Agregar producto"]')`)) break; await sleep(150); }
  evidence.tiempos.abrirEditor_ms = Date.now() - t0;
  await shot("02-editor-360");
  log(`[360] editor overflowX = ${await overflowX()} px`);
  log(`[360] total fijo visible = ${await evalJS(`(function(){var e=[...document.querySelectorAll('*')].find(function(x){return x.textContent==='Total corregido';}); return !!e;})()`)}`);

  // Editar: aumentar cantidad de la 1ª línea (Coca 2→4).
  await setInput('input[type=number]', 4); // primer number input = cantidad línea 1
  await sleep(150);
  log(`[360] cantidad línea 1 → 4`);

  // Buscador: scoping por local. Buscar producto del OTRO local (no debe aparecer).
  await setInput('input[placeholder*="Agregar producto"]', "SUCURSAL");
  await sleep(800);
  const ajenoVisible = await evalJS(`document.body.textContent.includes('PRODUCTO SUCURSAL NORTE')`);
  log(`[360] buscar producto de OTRO local visible = ${ajenoVisible} (esperado false)`);

  // Buscar y agregar un producto del PROPIO local (Queso).
  await setInput('input[placeholder*="Agregar producto"]', "Queso");
  await sleep(800);
  const hayQueso = await evalJS(`!!([...document.querySelectorAll('button')].find(function(b){return b.textContent.includes('Queso x Kg');}))`);
  log(`[360] resultado buscador propio 'Queso' = ${hayQueso}`);
  const cartAntes = await evalJS(`document.querySelectorAll('[class*="sunmi-surface"] input[type=number]').length`);
  await clickText("Queso x Kg");
  await sleep(300);
  // doble toque: intentar agregar otra vez rápido (el resultado ya se limpió → no debe duplicar)
  await clickText("Queso x Kg");
  await sleep(200);
  const cartDespues = await evalJS(`document.body.textContent.split('Queso x Kg').length - 1`);
  log(`[360] 'Queso' en carrito tras doble toque (ocurrencias) = ${cartDespues} (esperado 1)`);
  await shot("03-editor-agregado-360");

  // Ajustar pagos al total. Leer total y setear efectivo.
  const totalTxt = await evalJS(`(function(){var e=[...document.querySelectorAll('*')].find(function(x){return x.textContent==='Total corregido';}); return e? e.parentElement.querySelector('span:last-child').textContent : '';})()`);
  const totalNum = Number(String(totalTxt).replace(/[^0-9]/g, "")) / 100;
  log(`[360] total corregido mostrado = ${totalTxt} (num ${totalNum})`);
  await setInput('select + input[type=number]', totalNum); // primer monto de pago (efectivo)
  await sleep(200);

  // Revisar cambios.
  t0 = Date.now();
  await clickText("Revisar cambios");
  for (let i = 0; i < 40; i++) { if (await evalJS(`document.body.textContent.includes('Revisar cambios') && document.body.textContent.includes('Total anterior')`)) break; await sleep(150); }
  evidence.tiempos.revisar_ms = Date.now() - t0;
  await shot("04-revisar-360");
  const revisarTxt = await evalJS(`(function(){var m=[...document.querySelectorAll('div')].find(function(d){return d.textContent.includes('Total anterior')&&d.textContent.includes('Total nuevo');}); return m? m.textContent.replace(/\\s+/g,' ').slice(0,400):'';})()`);
  log(`[360] modal revisar (resumen): ${revisarTxt}`);

  // Confirmar sin motivo → debe estar deshabilitado; con motivo → habilitado.
  const confirmDisabledSinMotivo = await evalJS(`(function(){var b=[...document.querySelectorAll('button')].find(function(x){return x.textContent.includes('Confirmar corrección');}); return b? b.disabled : null;})()`);
  log(`[360] 'Confirmar' deshabilitado sin motivo = ${confirmDisabledSinMotivo}`);
  await setInput('input[placeholder*="Por qué se corrige"]', "Cliente devolvió una unidad y agregó queso");
  await sleep(200);
  t0 = Date.now();
  await clickText("Confirmar corrección");
  for (let i = 0; i < 50; i++) { const s = await evalJS(`document.querySelector('[data-qa=status]')?.textContent || ''`); if (s.includes("v=1") || s.includes("corregida=true")) break; await sleep(150); }
  evidence.tiempos.corregir_ms = Date.now() - t0;
  const stFinal = await evalJS(`document.querySelector('[data-qa=status]')?.textContent || ''`);
  log(`[360] tras confirmar, detalle: ${stFinal}`);
  await shot("05-confirmado-360");

  // ===== Bloqueos visuales =====
  for (const [nombre, id, motivoEsperado] of [["turno cerrado", seed.ventas.turnoCerrado, "turno_cerrado_no_corregible"], ["fuera de ventana", seed.ventas.fueraVentana, "fuera_de_ventana"], ["legacy", seed.ventas.legacy, null]]) {
    const s = await goto(`${BASE}/modulos/qa-correccion?id=${id}`);
    const btnDisabled = await evalJS(`(function(){var b=[...document.querySelectorAll('button')].find(function(x){return x.textContent.trim()==='🧾 Corregir venta';}); return b? b.disabled : 'no-btn';})()`);
    log(`[bloqueo:${nombre}] status='${s}' | boton corregir disabled=${btnDisabled}`);
    await shot(`06-bloqueo-${nombre.replace(/\s+/g, "-")}`);
  }

  // ===== Viewport 412: abrir editor y verificar overflow =====
  await emulate(412);
  await goto(`${BASE}/modulos/qa-correccion?id=${seed.ventas.fiada}`);
  await shot("07-detalle-fiada-412");
  log(`[412] overflowX detalle fiada = ${await overflowX()} px`);
  // Corrección SIMPLE en fiada: intentar cambiar cliente (debe estar restringido).
  await clickText("Corrección simple");
  await sleep(400);
  const fiadaClienteMsg = await evalJS(`document.body.textContent.includes('no se puede cambiar desde la corrección simple')`);
  log(`[412] fiada + simple: mensaje 'cliente no editable' = ${fiadaClienteMsg}`);
  await shot("08-simple-fiada-412");

  fs.writeFileSync(path.join(OUT, "evidencia.json"), JSON.stringify(evidence, null, 2));
  log("EVIDENCIA guardada.");
  try { await send("Browser.close", {}, false); } catch {}
  edge.kill();
  process.exit(0);
}

run().catch(async (e) => { console.error("CDP ERROR:", e); try { edge.kill(); } catch {} fs.writeFileSync(path.join(OUT, "evidencia.json"), JSON.stringify(evidence, null, 2)); process.exit(1); });
