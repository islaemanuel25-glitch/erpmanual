#!/usr/bin/env node
/**
 * sonda-cierre-trinquete.mjs — equivalencia medida, no "se ve igual".
 *
 * Las tres unidades de esta tanda prometen CERO cambio visual. Esta sonda lo
 * comprueba de la única forma que vale: dibuja lo VIEJO y lo NUEVO en la misma
 * página, al mismo tiempo, y compara los valores computados.
 *
 * Por qué lado a lado y no dos corridas: dos corridas comparan dos navegadores,
 * dos momentos y dos builds. Si dan distinto, hay que averiguar cuál de las tres
 * cosas cambió. Acá el único diferencial es la clase.
 *
 * Falla cerrado: si no puede medir —no levantó el navegador, no se dibujó un
 * nodo— sale con 1. Un contrato que no se pudo comprobar no es un contrato que
 * pasó.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9240"));
const PERFIL = path.join(tmpdir(), "sonda-cierre-trinquete");
const ANCHOS = (arg("anchos", "390,1280") || "").split(",").map((n) => Number(n.trim()));
const TEMAS = (arg("temas", "sunmiDark,sunmiLight,sunmiSand,sunmiBlueClassic") || "").split(",");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, sessionId, sig = 0;
const pending = new Map();
const send = (m, p = {}, s = true) =>
  new Promise((res, rej) => {
    const id = ++sig;
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method: m, params: p, ...(s && sessionId ? { sessionId } : {}) }));
  });
const cerrar = () => { try { ws?.close(); } catch {} try { navegador.kill(); } catch {} };
function frenar(motivo) { console.log(`\n  LA SONDA NO PUDO MEDIR: ${motivo}\n`); cerrar(); process.exit(1); }

async function urlDepurador() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PUERTO}/json/version`); const j = await r.json(); if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; } catch {}
    await sleep(250);
  }
  frenar("el navegador no abrió el puerto de depuración");
}
async function evaluar(e) {
  const r = await send("Runtime.evaluate", { expression: e, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

fs.rmSync(PERFIL, { recursive: true, force: true });
const navegador = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"], { stdio: "ignore" });
process.on("exit", cerrar);

ws = new WebSocket(await urlDepurador());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
};
const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
sessionId = sid;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: `${BASE}/login` });
let lista = false;
for (let i = 0; i < 80; i++) { await sleep(250); try { lista = await evaluar('document.readyState === "complete" && !!document.querySelector("button")'); } catch {} if (lista) break; }
if (!lista) frenar("la página no llegó a cargar");

/**
 * Los pares. `nuevo` es lo que dice el JSX hoy. El lado VIEJO se expresa en dos
 * partes: `viejo` para las clases que siguen existiendo, y `viejoEstilo` para
 * los valores que antes venían de una clase arbitraria de Tailwind.
 *
 * ── POR QUÉ EL VIEJO NO PUEDE SER "LA CLASE DE ANTES" ─────────────────────
 *
 * Tailwind genera una clase arbitraria solo si ALGUIEN LA NOMBRA en los
 * archivos que escanea. Esta tanda las sacó del JSX, así que `w-[202px]`,
 * `min-h-[51.5px]`, `text-[25px]` y `w-[44px]` ya no están en la hoja: un
 * elemento con esa clase se dibuja sin ancho y sin alto.
 *
 * La primera versión de esta sonda las usaba igual y dio 24 diferencias que NO
 * eran del cambio: comparaba lo nuevo contra un elemento sin estilo. Es la misma
 * trampa que el procedimiento de despliegue documenta al revés —una clase no
 * desaparece del build porque la saques del código, desaparece cuando nadie la
 * nombra— y acá se pagó en la dirección contraria.
 *
 * El estilo en línea es la referencia correcta: `w-[202px]` producía
 * exactamente `width: 202px`, y eso no depende de que Tailwind lo genere.
 */
const PARES = [
  { nombre: "lista de tarjetas · gap", etiqueta: "div",
    viejo: "grid grid-cols-1 auto-rows-fr",
    viejoEstilo: "gap:9px",
    nuevo: "grid grid-cols-1 auto-rows-fr sunmi-product-list",
    props: ["rowGap", "columnGap"] },
  { nombre: "bloque de valor · caja", etiqueta: "div",
    viejo: "flex max-w-full rounded-xl px-2.5 py-2",
    viejoEstilo: "width:202px;min-height:51.5px",
    nuevo: "flex max-w-full rounded-xl px-2.5 py-2 sunmi-product-value-block",
    props: ["width", "minHeight", "paddingLeft", "paddingTop", "borderRadius"] },
  { nombre: "rótulo del valor", etiqueta: "span",
    viejo: "mb-1 font-bold whitespace-nowrap",
    viejoEstilo: "font-size:9px",
    nuevo: "mb-1 sunmi-product-value-label font-bold whitespace-nowrap",
    props: ["fontSize", "fontWeight", "marginBottom"] },
  { nombre: "número del valor", etiqueta: "span",
    viejo: "font-semibold whitespace-nowrap",
    viejoEstilo: "font-size:25px",
    nuevo: "sunmi-product-value-number font-semibold whitespace-nowrap",
    props: ["fontSize", "fontWeight"] },
  { nombre: "miniatura del producto", etiqueta: "div",
    viejo: "",
    viejoEstilo: "width:44px;height:44px",
    nuevo: "sunmi-product-thumbnail",
    props: ["width", "height"] },
  { nombre: "acción de la tarjeta", etiqueta: "button",
    viejo: "flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium sunmi-text-strong sunmi-row-hover",
    viejoEstilo: "height:44px",
    nuevo: "flex items-center justify-center gap-1.5 py-2.5 sunmi-product-card-action text-xs font-medium sunmi-text-strong sunmi-row-hover",
    props: ["height", "paddingTop", "fontSize"] },
  { nombre: "botón-enlace (importador)", etiqueta: "button",
    viejo: "text-xs sunmi-text-accent mt-1 underline",
    nuevo: "text-xs sunmi-text-accent underline mt-1",
    props: ["fontSize", "color", "textDecorationLine", "backgroundColor", "borderTopWidth",
            "borderRadius", "paddingTop", "paddingLeft", "marginTop"] },
  { nombre: "tarjeta de acción (TarjetaOferta)", etiqueta: "button",
    viejo: "w-full text-left sunmi-panel rounded-lg p-3 flex flex-col gap-1.5",
    nuevo: "w-full text-left sunmi-panel rounded-lg p-3 flex flex-col gap-1.5",
    props: ["width", "textAlign", "backgroundColor", "borderTopWidth", "borderTopColor",
            "borderRadius", "paddingTop", "paddingLeft", "rowGap", "display", "flexDirection"] },
];

await evaluar(`(() => {
  const pares = ${JSON.stringify(PARES)};
  const caja = document.createElement("div");
  caja.id = "caja-cierre";
  caja.style.cssText = "position:fixed;top:0;left:0;width:100%;z-index:99999;background:var(--app-bg)";
  for (const [i, p] of pares.entries()) {
    for (const lado of ["viejo", "nuevo"]) {
      const cont = document.createElement("div");
      cont.style.cssText = "width:320px";
      const el = document.createElement(p.etiqueta);
      el.id = "par-" + i + "-" + lado;
      el.className = p[lado];
      if (lado === "viejo" && p.viejoEstilo) el.style.cssText = p.viejoEstilo;
      el.textContent = "x";
      cont.append(el);
      caja.append(cont);
    }
  }
  document.body.append(caja);
  return true;
})()`);

const LEER = (id, props) => `(() => {
  const el = document.getElementById(${JSON.stringify(id)});
  if (!el) return null;
  const s = getComputedStyle(el);
  const o = {};
  for (const p of ${JSON.stringify(props)}) o[p] = s[p];
  return JSON.stringify(o);
})()`;

let fallas = 0;
console.log("\n  ══ equivalencia medida: viejo vs nuevo, en la misma página ══\n");

for (const ancho of ANCHOS) {
  await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: 900, deviceScaleFactor: 1, mobile: ancho < 1024 });
  for (const tema of TEMAS) {
    await evaluar(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(tema)}; return true; })()`);
    await sleep(60);
    for (const [i, p] of PARES.entries()) {
      const v = await evaluar(LEER(`par-${i}-viejo`, p.props));
      const n = await evaluar(LEER(`par-${i}-nuevo`, p.props));
      if (!v || !n) frenar(`no se dibujó el par "${p.nombre}"`);
      const V = JSON.parse(v), N = JSON.parse(n);
      const distintas = p.props.filter((k) => V[k] !== N[k]);
      if (distintas.length) {
        fallas += 1;
        console.log(`  ✗ ${tema}/${ancho} · ${p.nombre}`);
        for (const k of distintas) console.log(`      ${k}: viejo=${V[k]}  nuevo=${N[k]}`);
      } else if (tema === TEMAS[0]) {
        console.log(`  ✓ ${ancho}px · ${p.nombre.padEnd(36)} ${p.props.map((k) => `${k}=${N[k]}`).join(" · ")}`);
      }
    }
  }
}

console.log(`\n  ${fallas} diferencias.  (${PARES.length} contratos × ${TEMAS.length} temas × ${ANCHOS.length} anchos)`);
cerrar();
process.exit(fallas ? 1 : 0);
