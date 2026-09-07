// SONDA: LOS DOS RENGLONES SECUNDARIOS DEL CARRITO, EN LOS CATORCE TEMAS.
//
//   node scripts/sonda-muted-carrito.mjs --base http://localhost:3111 --capturas /tmp/capturas
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// Debajo del nombre del producto, la celda del carrito puede mostrar dos
// renglones chicos: el precio con su etiqueta de oferta, y el nombre de la lista
// de precios aplicada. Los dos son información secundaria del mismo rango, y hoy
// se dibujan con DOS contratos de gris distintos:
//
//   precio        `pos-text-muted`    → var(--pos-muted), un gris propio del POS
//   lista         `sunmi-text-muted`  → color-mix(--app-fg 60%), derivado del texto
//
// La pregunta es si esa diferencia dice algo —uno más fuerte que el otro a
// propósito— o si es una inconsistencia que quedó. Se contesta comparando el
// color calculado y el contraste contra el fondo, tema por tema, y no a ojo.
//
// ── QUÉ PRUEBA ESTO Y QUÉ NO ───────────────────────────────────────────────
//
// Se miden nodos con la cadena de clases EXACTA del JSX, sobre la hoja real, y
// se cambia el tema en el `html` como lo hace la aplicación. Para color y
// contraste es fiel: no dependen de dónde esté el nodo.
//
// NO es una foto de la celda de verdad. Llegar a ella pide una venta con un
// producto en oferta Y una lista de precios aplicada, y el sembrado del runner no
// crea productos. La tira que se retrata es una RECONSTRUCCIÓN de los dos
// renglones, dicho acá para que nadie la lea como la pantalla.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9228"));
const PERFIL = path.join(tmpdir(), "sonda-muted-carrito");
const CAPTURAS = arg("capturas", null);
const ANCHOS = (arg("anchos", "390,1280") || "").split(",").map((n) => Number(n.trim()));

/** Los catorce, tal como los declara `app/globals.css` con `html[data-theme=…]`. */
const TEMAS = [
  "sunmiDark", "sunmiDarkCompact", "sunmiLight", "sunmiGraphite", "sunmiSand",
  "sunmiBlueClassic", "sunmiFrance", "sunmiFranceSplit", "operixBluePro",
  "operixNight", "verdeComercio", "grafitoEjecutivo", "ambarCaja", "violetaSaas",
];

/** El precio, con su clase de hoy y la que tendría migrado. La lista no se toca. */
const PRECIO_HOY = "block text-xs2 pos-text-muted truncate";
const PRECIO_MIGRADO = "block text-xs2 sunmi-text-muted truncate";
const LISTA = "block text-[10px] sunmi-text-muted truncate";

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

function frenar(motivo) {
  console.error(`\nLA SONDA NO PUDO MEDIR: ${motivo}`);
  cerrar();
  process.exit(1);
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
  frenar("el navegador no respondió al puerto de depuración");
}

async function evaluar(expresion) {
  const r = await send("Runtime.evaluate", { expression: expresion, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const navegador = spawn(
  EDGE,
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"],
  { stdio: "ignore" }
);
const cerrar = () => { try { ws?.close(); } catch {} try { navegador.kill(); } catch {} };
process.on("exit", cerrar);
process.on("SIGINT", () => { cerrar(); process.exit(130); });

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
await send("Page.navigate", { url: `${BASE}/login` });

let lista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try {
    lista = await evaluar(`(() => {
      if (document.readyState !== "complete") return false;
      for (const hoja of document.styleSheets) {
        let reglas; try { reglas = hoja.cssRules; } catch { continue; }
        for (const r of reglas) {
          if (!r.selectorText) continue;
          for (const p of r.selectorText.split(",")) if (p.trim() === ".pos-text-muted") return true;
        }
      }
      return false;
    })()`);
  } catch {}
  if (lista) break;
}
if (!lista) frenar("la hoja no trae `.pos-text-muted`");

// ── La tira que se mide y se retrata ──────────────────────────────────────
//
// Se arma UNA vez y se le cambia el tema; así lo que varía entre temas es solo
// el tema, y no un nodo distinto cada vez.
await evaluar(`(() => {
  const caja = document.createElement("div");
  caja.id = "tira-muted";
  caja.style.cssText = "position:fixed;top:0;left:0;z-index:99999;padding:14px 16px;width:100%;box-sizing:border-box;background:var(--app-bg);";
  caja.innerHTML =
    '<div style="font:600 13px system-ui;color:var(--app-fg);margin-bottom:6px" id="tira-titulo"></div>' +
    '<div style="font:600 14px system-ui;color:var(--app-fg)">Coca Cola 2,25 L</div>' +
    '<span id="tira-precio" class="${PRECIO_HOY}">$ 2.450<span class="sunmi-text-success-soft"> · Oferta $ 1.990</span></span>' +
    '<span id="tira-lista" class="${LISTA}">Lista Mayorista</span>';
  document.body.append(caja);
  return true;
})()`);

const LEER = `(() => {
  const canal = (c) => {
    let m = c.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(/[\\s,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; }
    m = c.match(/color\\(srgb ([^)]+)\\)/);
    if (m) { const p = m[1].split(/[\\s\\/]+/).filter(Boolean).map(Number); return { r: p[0]*255, g: p[1]*255, b: p[2]*255, a: p[3] ?? 1 }; }
    return null;
  };
  const sobre = (f, b) => ({ r: f.r*f.a + b.r*(1-f.a), g: f.g*f.a + b.g*(1-f.a), b: f.b*f.a + b.b*(1-f.a) });
  const lum = (c) => { const f=(v)=>{v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4);};
    return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b); };
  const contraste = (f, b) => { const L1=lum(f), L2=lum(b); const a=Math.max(L1,L2), z=Math.min(L1,L2); return (a+0.05)/(z+0.05); };

  const caja = document.getElementById("tira-muted");
  const fondo = canal(getComputedStyle(caja).backgroundColor);
  const salida = {};
  for (const id of ["tira-precio", "tira-lista"]) {
    const el = document.getElementById(id);
    const crudo = getComputedStyle(el).color;
    const c = canal(crudo);
    if (!c || !fondo) return JSON.stringify({ error: "no se pudo leer un color: " + crudo });
    const efectivo = sobre(c, fondo);
    salida[id] = {
      crudo,
      efectivo: "rgb(" + [efectivo.r, efectivo.g, efectivo.b].map((v) => Math.round(v)).join(",") + ")",
      contraste: Math.round(contraste(efectivo, fondo) * 100) / 100,
    };
  }
  salida.fondo = getComputedStyle(caja).backgroundColor;
  return JSON.stringify(salida);
})()`;

async function retratar(nombre, ancho) {
  if (!CAPTURAS) return;
  const { data } = await send("Page.captureScreenshot", {
    format: "png", clip: { x: 0, y: 0, width: ancho, height: 110, scale: 2 },
  });
  fs.mkdirSync(CAPTURAS, { recursive: true });
  fs.writeFileSync(path.join(CAPTURAS, `${nombre}.png`), Buffer.from(data, "base64"));
}

let fallas = 0;
const ok = (t, c) => { if (c) console.log(`  ✓ ${t}`); else { fallas++; console.log(`  ✗ ${t}`); } };
const distintos = [];
const igualesMigrado = [];

for (const ancho of ANCHOS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: ancho, height: 400, deviceScaleFactor: 1, mobile: ancho < 1024,
  });
  console.log(`\n  ══ ${ancho} px ═════════════════════════════════════════════`);
  console.log(`  ${"tema".padEnd(20)} ${"precio (pos-muted)".padEnd(34)} ${"lista (sunmi-muted)".padEnd(34)} ¿igual?`);

  for (const tema of TEMAS) {
    await evaluar(`(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(tema)};
      document.getElementById("tira-precio").className = ${JSON.stringify(PRECIO_HOY)};
      document.getElementById("tira-titulo").textContent = ${JSON.stringify(tema)} + " — HOY";
      return true;
    })()`);
    await sleep(60);
    const hoy = JSON.parse(await evaluar(LEER));
    if (hoy.error) frenar(hoy.error);
    await retratar(`${ancho}-${tema}-hoy`, ancho);

    await evaluar(`(() => {
      document.getElementById("tira-precio").className = ${JSON.stringify(PRECIO_MIGRADO)};
      document.getElementById("tira-titulo").textContent = ${JSON.stringify(tema)} + " — MIGRADO";
      return true;
    })()`);
    await sleep(60);
    const mig = JSON.parse(await evaluar(LEER));
    await retratar(`${ancho}-${tema}-migrado`, ancho);

    const igual = hoy["tira-precio"].efectivo === hoy["tira-lista"].efectivo;
    if (!igual) distintos.push(`${ancho}/${tema}`);
    if (mig["tira-precio"].efectivo === mig["tira-lista"].efectivo) igualesMigrado.push(`${ancho}/${tema}`);

    console.log(
      `  ${tema.padEnd(20)} ${(hoy["tira-precio"].efectivo + " c" + hoy["tira-precio"].contraste).padEnd(34)} ` +
      `${(hoy["tira-lista"].efectivo + " c" + hoy["tira-lista"].contraste).padEnd(34)} ${igual ? "sí" : "NO"}`
    );
    console.log(
      `  ${"".padEnd(20)} migrado → ${(mig["tira-precio"].efectivo + " c" + mig["tira-precio"].contraste).padEnd(24)}`
    );
  }
}

console.log("\n  ══ veredicto ═════════════════════════════════════════════");
const total = ANCHOS.length * TEMAS.length;
ok(`HOY los dos renglones difieren en ${distintos.length} de ${total} combinaciones`, distintos.length > 0);
ok(`MIGRADO quedan iguales en las ${total}`, igualesMigrado.length === total);
console.log(`\n  ${fallas} afirmaciones en rojo.`);
cerrar();
process.exit(fallas ? 1 : 0);
