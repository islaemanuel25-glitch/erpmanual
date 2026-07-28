// CDP test del fix del botón "Corregir venta": reproduce AccionesTicket DENTRO
// de un SunmiModalLayout (z-[9999]) y verifica que el editor abre POR ENCIMA
// (z 10000) y es interactivo. Uso: SEED_JSON=<mobile.json> OUT=<dir> node scripts/cdp-boton-fix.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";

const OUT = process.env.OUT || ".";
const seed = JSON.parse(fs.readFileSync(process.env.SEED_JSON, "utf8"));
// Forjar sesión del tester (userId 1, con permiso corregir_completa + en el flag).
const TOKEN = jwt.sign({ id: 1, rolId: 1, permisos: ["reportes.ver", "ventas.corregir_simple", "ventas.corregir_completa", "pos.usar"], localId: seed.localId, esDuenoLocal: true }, process.env.AUTH_SECRET, { expiresIn: "1h" });
const CONTEXTO = encodeURIComponent(JSON.stringify({ localId: seed.localId }));
const BASE = "http://localhost:3011";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const UDD = path.join(OUT, "edge-boton");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { if (c) { console.log(`✔ ${n}`); pass++; } else { console.log(`✖ ${n} ${d}`); fail++; } };

const edge = spawn(EDGE, ["--headless=new", "--remote-debugging-port=9223", `--user-data-dir=${UDD}`, "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });
let ws, id = 0, sessionId = null; const pend = new Map(); const evs = [];
const send = (m, p = {}, s = true) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej, method: m }); const msg = { id: i, method: m, params: p }; if (s && sessionId) msg.sessionId = sessionId; ws.send(JSON.stringify(msg)); });
async function getWs() { for (let i = 0; i < 40; i++) { try { const r = await fetch("http://127.0.0.1:9223/json/version"); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {} await sleep(250); } throw new Error("no CDP"); }
async function connect() {
  ws = new WebSocket(await getWs());
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(`[${p.method}] ${m.error.message}`)) : p.res(m.result); return; } for (const h of evs) h(m); };
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
  sessionId = sid;
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
}
const consoleErrs = [];
async function evalJS(expr) { const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: `(function(){ return (${expr}); })()`, returnByValue: true }); return exceptionDetails ? undefined : result.value; }

async function run() {
  await connect();
  evs.push((m) => { if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") consoleErrs.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)); if (m.method === "Runtime.exceptionThrown") consoleErrs.push((m.params.exceptionDetails?.exception?.description || "").slice(0, 200)); });
  await send("Network.enable");
  await send("Network.setCookie", { name: "erpazul_sesion", value: TOKEN, url: BASE });
  await send("Network.setCookie", { name: "erpazul_contexto_activo", value: CONTEXTO, url: BASE });
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 2, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true });

  await send("Page.navigate", { url: `${BASE}/modulos/qa-boton?id=${seed.escenarios["MOBILE-01"].id}` });
  let st = "";
  for (let i = 0; i < 50; i++) { st = await evalJS(`document.querySelector('[data-qa=status]')?.textContent || ''`); if (st.includes("ok ")) break; await sleep(200); }
  console.log(`  status: ${st}`);
  ok("detalle cargó con puedeCompleta=true", st.includes("puedeCompleta=true"), st);

  // El modal de detalle (SunmiModalLayout) está presente en z-[9999]
  const modalZ = await evalJS(`(function(){var m=[...document.querySelectorAll('.fixed')].find(function(e){return getComputedStyle(e).zIndex==='9999';}); return m? '9999' : 'no';})()`);
  ok("SunmiModalLayout presente en z-9999", modalZ === "9999");

  // Botón "Corregir venta" presente y habilitado
  const btn = await evalJS(`(function(){var b=[...document.querySelectorAll('button')].find(function(x){return x.textContent.trim().indexOf('Corregir venta')!==-1;}); return b? (b.disabled?'disabled':'enabled') : 'ausente';})()`);
  ok("botón 'Corregir venta' habilitado", btn === "enabled", btn);

  // Click
  await evalJS(`(function(){var b=[...document.querySelectorAll('button')].find(function(x){return x.textContent.trim().indexOf('Corregir venta')!==-1 && !x.disabled;}); if(b){b.click();return true;} return false;})()`);
  for (let i = 0; i < 30; i++) { if (await evalJS(`!!document.querySelector('input[placeholder*="Agregar producto"]')`)) break; await sleep(150); }

  // El editor se montó
  const editorMontado = await evalJS(`!!document.querySelector('input[placeholder*="Agregar producto"]') && document.body.textContent.indexOf('Total corregido')!==-1`);
  ok("editor montado tras click", editorMontado === true);

  // CLAVE: el elemento superior en el centro pertenece a un fixed con z-index 10000 (editor por encima del modal 9999)
  const zTop = await evalJS(`(function(){
    var el = document.elementFromPoint(Math.floor(window.innerWidth/2), Math.floor(window.innerHeight/2));
    var z = 0, n = el;
    while(n){ var s = getComputedStyle(n); if(s.position==='fixed'){ var v = parseInt(s.zIndex); if(!isNaN(v) && v>z) z=v; } n = n.parentElement; }
    return z;
  })()`);
  console.log(`  z-index del elemento superior en el centro: ${zTop}`);
  ok("editor POR ENCIMA del modal (z=10000 en el centro, no 9999)", zTop === 10000, `z=${zTop}`);

  // Interactivo: el header "Cerrar" del editor es clickeable y cierra
  const cerrado = await evalJS(`(function(){var b=[...document.querySelectorAll('button')].find(function(x){return x.textContent.trim()==='Cerrar' && x.closest('.fixed') && getComputedStyle(x.closest('.fixed')).zIndex==='10000';}); if(b){b.click();return true;} return false;})()`);
  await sleep(300);
  const editorCerrado = await evalJS(`!document.querySelector('input[placeholder*="Agregar producto"]')`);
  ok("editor interactivo (Cerrar del editor funciona)", cerrado === true && editorCerrado === true);

  ok("sin errores de consola", consoleErrs.length === 0, consoleErrs.join(" | "));

  const { data } = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(OUT, "boton-fix.png"), Buffer.from(data, "base64"));

  console.log(`\nRESULTADO BOTÓN-FIX: ${pass} pass / ${fail} fail`);
  try { await send("Browser.close", {}, false); } catch {}
  edge.kill();
  process.exit(fail ? 1 : 0);
}
run().catch((e) => { console.error("CDP ERROR:", e); try { edge.kill(); } catch {} process.exit(1); });
