#!/usr/bin/env node
/**
 * sonda-foco-crudo.mjs — diagnóstico, no candado.
 *
 * Existe para cerrar UNA contradicción concreta:
 *
 *   El modelo estático dice que `button:focus { box-shadow: none !important }`
 *   de app/globals.css le gana a `.sunmi-btn:focus-visible`, que no lleva
 *   `!important`. La sonda de foco, sin embargo, medía sombra en el SunmiButton
 *   al enfocarlo. Las dos cosas no pueden ser ciertas.
 *
 * Esta sonda no resume a "sí/no": imprime valores crudos, una serie temporal, y
 * las reglas que el NAVEGADOR dice que emparejan el nodo —vía
 * CSS.getMatchedStylesForNode, no buscando texto en archivos—.
 *
 * Mide tres controles a propósito:
 *   - el caso contradictorio (SunmiButton),
 *   - un control positivo (SunmiTextarea, que hoy sí conserva foco),
 *   - un control negativo (button nativo, que hoy no lo muestra).
 *
 * No toca CSS productivo ni escribe nada. Salida siempre 0: informa, no juzga.
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
const PUERTO = Number(arg("puerto-cdp", "9231"));
const PERFIL = path.join(tmpdir(), "sonda-foco-crudo");
const TEMA = arg("tema", "sunmiDark");
const ANCHO = Number(arg("ancho", "390"));

// Los instantes de la serie, en ms desde que el control recibe el foco. El
// último no es un número fijo: se espera a que el navegador declare que no le
// quedan transiciones corriendo.
const INSTANTES = [0, 16, 50, 150, 300, 600];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, sessionId, sig = 0;
const pending = new Map();
const hojas = new Map(); // styleSheetId -> sourceURL

const send = (method, params = {}, conSesion = true) =>
  new Promise((resolve, reject) => {
    const id = ++sig;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(conSesion && sessionId ? { sessionId } : {}) }));
  });

const cerrar = () => {
  try { ws?.close(); } catch {}
  try { navegador.kill(); } catch {}
};

function frenar(motivo) {
  console.log(`\n  ✗ no se pudo medir: ${motivo}\n`);
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
  frenar("el navegador no abrió el puerto de depuración");
}

async function evaluar(expresion, esperarPromesa = false) {
  const r = await send("Runtime.evaluate", {
    expression: expresion,
    returnByValue: true,
    awaitPromise: esperarPromesa,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

fs.rmSync(PERFIL, { recursive: true, force: true });
const navegador = spawn(
  EDGE,
  ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`,
   "--no-first-run", "--no-default-browser-check", "--disable-gpu",
   `--window-size=${ANCHO},900`, "about:blank"],
  { stdio: "ignore" }
);
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
    return;
  }
  // Las hojas se anuncian por evento. Es la única forma de traducir un
  // styleSheetId a un archivo, que es lo que hace falta para poder decir
  // "esta declaración es la de globals.css" sin adivinar.
  if (m.method === "CSS.styleSheetAdded") {
    const h = m.params.header;
    hojas.set(h.styleSheetId, h.sourceURL || h.sourceMapURL || "(en línea)");
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
const { sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }, false);
sessionId = sid;
await send("Page.enable");
await send("Runtime.enable");
await send("DOM.enable");
await send("CSS.enable");
await send("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/login` });

let lista = false;
for (let i = 0; i < 80; i++) {
  await sleep(250);
  try { lista = await evaluar('document.readyState === "complete" && !!document.querySelector("button")'); } catch {}
  if (lista) break;
}
if (!lista) frenar("la página no llegó a tener un botón");

await evaluar(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(TEMA)}; return true; })()`);

const CASOS = [
  { id: "c-kit", nombre: "SunmiButton  (el caso contradictorio)", etiqueta: "button", clases: "sunmi-btn sunmi-btn-cyan" },
  { id: "c-textarea", nombre: "SunmiTextarea  (control POSITIVO)", etiqueta: "textarea", clases: "sunmi-textarea" },
  { id: "c-nativo", nombre: "button nativo  (control NEGATIVO)", etiqueta: "button", clases: "" },
];

await evaluar(`(() => {
  const casos = ${JSON.stringify(CASOS)};
  const barra = document.createElement("div");
  barra.id = "barra-foco";
  barra.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--app-bg)";
  const ancla = document.createElement("a");
  ancla.id = "ancla";
  ancla.href = "#";
  ancla.textContent = "ancla";
  barra.append(ancla);
  for (const c of casos) {
    const el = document.createElement(c.etiqueta);
    el.id = c.id;
    if (c.etiqueta === "button") { el.type = "button"; el.textContent = c.nombre; }
    else { el.value = "texto"; el.rows = 1; }
    el.className = c.clases;
    barra.append(el);
  }
  document.body.append(barra);
  return true;
})()`);

/**
 * Toma una muestra completa. Se ejecuta DENTRO de la página para que los
 * instantes sean instantes de la página y no del ida y vuelta del protocolo.
 */
const MUESTREAR = (elId) => `(async () => {
  const el = document.getElementById(${JSON.stringify(elId)});
  const s = () => getComputedStyle(el);
  const t0 = performance.now();

  const foto = () => {
    const c = s();
    const animaciones = el.getAnimations().map((a) => ({
      tipo: a.constructor.name,
      propiedad: a.transitionProperty || a.animationName || null,
      tiempo: Math.round(a.currentTime ?? -1),
      estado: a.playState,
    }));
    return {
      t: Math.round(performance.now() - t0),
      enfocado: document.activeElement === el,
      focus: (() => { try { return el.matches(":focus"); } catch { return null; } })(),
      focusVisible: (() => { try { return el.matches(":focus-visible"); } catch { return null; } })(),
      boxShadow: c.boxShadow,
      outline: c.outline,
      outlineStyle: c.outlineStyle,
      outlineWidth: c.outlineWidth,
      outlineColor: c.outlineColor,
      outlineOffset: c.outlineOffset,
      borderColor: c.borderColor,
      filter: c.filter,
      backgroundColor: c.backgroundColor,
      animaciones,
    };
  };

  const serie = [foto()];
  const instantes = ${JSON.stringify(INSTANTES)};
  for (const ms of instantes.slice(1)) {
    await new Promise((r) => setTimeout(r, Math.max(0, ms - (performance.now() - t0))));
    serie.push(foto());
  }

  // El estado ESTABLE no es un número elegido a ojo: se espera a que el
  // navegador no informe ninguna transición corriendo sobre el elemento.
  for (let i = 0; i < 60 && el.getAnimations().length > 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  await new Promise((r) => setTimeout(r, 100));
  const estable = foto();

  const c = s();
  return JSON.stringify({
    serie,
    estable,
    transicion: {
      property: c.transitionProperty,
      duration: c.transitionDuration,
      delay: c.transitionDelay,
      animationName: c.animationName,
      animationDuration: c.animationDuration,
    },
    pseudo: ["::before", "::after"].map((p) => {
      const q = getComputedStyle(el, p);
      return { p, content: q.content, boxShadow: q.boxShadow, outline: q.outline, border: q.border, background: q.backgroundColor, opacity: q.opacity };
    }),
  });
})()`;

const IDENTIDAD = (elId) => `(() => {
  const el = document.getElementById(${JSON.stringify(elId)});
  return JSON.stringify({
    tagName: el.tagName,
    className: el.className,
    outerHTML: el.outerHTML.slice(0, 120),
    esActivo: document.activeElement === el,
    focus: el.matches(":focus"),
    focusVisible: el.matches(":focus-visible"),
  });
})()`;

async function soltarFoco() {
  await evaluar(`(() => { document.activeElement && document.activeElement.blur(); return true; })()`);
  await sleep(400); // que termine cualquier transición de vuelta al reposo
}

async function tab(indice) {
  await evaluar(`(() => { document.getElementById("ancla").focus(); return true; })()`);
  for (let i = 0; i <= indice; i++) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    if (i < indice) await sleep(30);
  }
}

async function click(elId) {
  const caja = JSON.parse(await evaluar(`(() => {
    const r = document.getElementById(${JSON.stringify(elId)}).getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  })()`));
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: caja.x, y: caja.y, button: "left", clickCount: 1 });
  }
}

/** Reglas que el NAVEGADOR dice que emparejan el nodo, con archivo y línea. */
async function reglas(elId) {
  const { root } = await send("DOM.getDocument", { depth: 0 });
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: `#${elId}` });
  if (!nodeId) return [];
  const r = await send("CSS.getMatchedStylesForNode", { nodeId });
  const salida = [];
  // El protocolo las devuelve de menor a mayor precedencia.
  (r.matchedCSSRules || []).forEach((m, orden) => {
    const sel = (m.rule.selectorList?.text) || "";
    for (const d of m.rule.style?.cssProperties || []) {
      if (!["box-shadow", "outline", "outline-style", "outline-width", "border", "border-color"].includes(d.name)) continue;
      if (d.disabled) continue;
      salida.push({
        orden,
        selector: sel,
        hoja: hojas.get(m.rule.styleSheetId) || "(desconocida)",
        linea: (m.rule.style?.range?.startLine ?? d.range?.startLine ?? null),
        propiedad: d.name,
        valor: d.value,
        importante: !!d.important,
        media: (m.rule.media || []).map((x) => x.text).join(" y ") || null,
        capa: (m.rule.layers || []).map((x) => x.text).join(" > ") || null,
      });
    }
  });
  return salida;
}

const corto = (u) => (u || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 60) || "(en línea)";

console.log(`\n  ══ foco: valores crudos ═══════════════════════════════════`);
console.log(`  tema ${TEMA} · ancho ${ANCHO} px · ${BASE}\n`);

for (let i = 0; i < CASOS.length; i++) {
  const c = CASOS[i];
  console.log(`  ${"─".repeat(58)}`);
  console.log(`  ${c.nombre}`);
  console.log(`  ${"─".repeat(58)}`);

  await soltarFoco();
  const ident = JSON.parse(await evaluar(IDENTIDAD(c.id)));
  console.log(`  nodo   ${ident.tagName}  class="${ident.className}"`);
  console.log(`         ${ident.outerHTML}`);
  console.log(`  reposo activeElement=${ident.esActivo} :focus=${ident.focus} :focus-visible=${ident.focusVisible}`);

  const rep = JSON.parse(await evaluar(MUESTREAR(c.id), true));
  console.log(`  reposo box-shadow  ${rep.estable.boxShadow}`);
  console.log(`  reposo outline     ${rep.estable.outline}`);
  console.log(`  transición  property=${rep.transicion.property}`);
  console.log(`              duration=${rep.transicion.duration}  delay=${rep.transicion.delay}`);
  console.log(`              animation=${rep.transicion.animationName} ${rep.transicion.animationDuration}`);

  for (const [modo, accion] of [["TAB", () => tab(i)], ["CLICK", () => click(c.id)]]) {
    await soltarFoco();
    await accion();
    const m = JSON.parse(await evaluar(MUESTREAR(c.id), true));
    console.log(`\n  ── ${modo} ──  activeElement=${m.estable.enfocado} :focus=${m.estable.focus} :focus-visible=${m.estable.focusVisible}`);
    for (const f of m.serie) {
      const anim = f.animaciones.length
        ? ` ⟲ ${f.animaciones.map((a) => `${a.propiedad}@${a.tiempo}ms/${a.estado}`).join(", ")}`
        : "";
      console.log(`     +${String(f.t).padStart(3)}ms  shadow=${f.boxShadow}${anim}`);
    }
    console.log(`     ESTABLE  shadow=${m.estable.boxShadow}`);
    console.log(`              outline=${m.estable.outlineStyle} ${m.estable.outlineWidth} ${m.estable.outlineColor} off=${m.estable.outlineOffset}`);
    console.log(`              border-color=${m.estable.borderColor}  filter=${m.estable.filter}  bg=${m.estable.backgroundColor}`);
    for (const p of m.pseudo) {
      console.log(`              ${p.p} content=${p.content} shadow=${p.boxShadow} outline=${p.outline} border=${p.border} bg=${p.background} opacity=${p.opacity}`);
    }

    if (modo === "TAB") {
      console.log(`\n     reglas que el navegador dice que emparejan, con el nodo ENFOCADO:`);
      const rs = await reglas(c.id);
      if (!rs.length) console.log(`       (ninguna toca box-shadow/outline/border)`);
      for (const r of rs) {
        const marca = r.importante ? " !important" : "";
        const env = [r.media ? `@media ${r.media}` : null, r.capa ? `@layer ${r.capa}` : null].filter(Boolean).join(" ");
        console.log(`       [${String(r.orden).padStart(2)}] ${r.selector}`);
        console.log(`            ${r.propiedad}: ${r.valor}${marca}`);
        console.log(`            ${corto(r.hoja)}:${r.linea ?? "?"}  ${env || "(sin envoltorio)"}`);
      }
      console.log(`     ↑ el protocolo las devuelve de MENOR a MAYOR precedencia.`);
    }
  }
  console.log("");
}

cerrar();
process.exit(0);
