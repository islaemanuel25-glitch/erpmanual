// SONDA: ¿SE VE DÓNDE ESTÁ EL FOCO, Y SOLO CUANDO CORRESPONDE?
//
//   node scripts/sonda-foco-boton.mjs --base http://localhost:3111
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// Son dos preguntas y hay que contestar las dos, porque arreglar una rompiendo
// la otra es el error clásico de este tema:
//
//   1. Con TAB, ¿el control muestra una señal visible?
//   2. Con CLICK, ¿NO la muestra? Un anillo de teclado que queda pegado después
//      de cada click es la razón por la que alguien lo apagó en primer lugar.
//
// ── POR QUÉ SE USA TECLADO Y MOUSE DE VERDAD ───────────────────────────────
//
// La primera versión de esta sonda enfocaba con `el.focus()` desde el script y
// leía `:focus-visible`. Daba `true` SIEMPRE —Chrome trata el foco por script
// como si fuera de teclado— así que no distinguía los dos casos, que es
// justamente lo único que hay que distinguir. Ahora el Tab y el click se
// mandan como eventos de entrada reales por CDP.
//
// ── Y POR QUÉ SE MIDE SIN FOCO Y CON FOCO ──────────────────────────────────
//
// Porque el botón del kit tiene una sombra ambiental que está siempre. Leer solo
// el estado enfocado la contaba como anillo de foco: falso positivo, ya visto.
// Hay señal solo si algo CAMBIA al enfocar.
//
// ── EL CRITERIO ───────────────────────────────────────────────────────────
//
// Si no puede medir, es ROJO. El veredicto se activa con `--exigir`, para que la
// misma sonda sirva de retrato del estado roto y de candado del arreglado.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const bandera = (n) => process.argv.includes(`--${n}`);

const BASE = (arg("base", "http://localhost:3111") || "").replace(/\/$/, "");
const EDGE = arg("edge", "/usr/bin/google-chrome");
const PUERTO = Number(arg("puerto-cdp", "9229"));
const PERFIL = path.join(tmpdir(), "sonda-foco-boton");
const CAPTURAS = arg("capturas", null);
const EXIGIR = bandera("exigir");
const ANCHOS = (arg("anchos", "390,1280") || "").split(",").map((n) => Number(n.trim()));
const TEMAS = (arg("temas", "sunmiDark,sunmiLight,sunmiSand,sunmiBlueClassic") || "").split(",");

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

const cerrar = () => { try { ws?.close(); } catch {} try { navegador.kill(); } catch {} };

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
  try { lista = await evaluar('document.readyState === "complete" && !!document.querySelector("button")'); } catch {}
  if (lista) break;
}
if (!lista) frenar("la página no llegó a tener un botón");

// Los cinco controles del contrato. Se dibujan en una barra propia, con un ancla
// antes para poder llegar al primero con un solo Tab.
const CASOS = [
  { id: "c-kit", nombre: "1 SunmiButton", etiqueta: "button", clases: "sunmi-btn sunmi-btn-cyan" },
  { id: "c-input", nombre: "2 SunmiInput", etiqueta: "input", clases: "sunmi-input" },
  { id: "c-select", nombre: "3 select del kit", etiqueta: "select", clases: "sunmi-select-native" },
  { id: "c-textarea", nombre: "4 SunmiTextarea", etiqueta: "textarea", clases: "sunmi-textarea" },
  { id: "c-nativo", nombre: "5 button nativo", etiqueta: "button", clases: "" },
  { id: "c-a", nombre: "6 enlace <a>", etiqueta: "a", clases: "" },
  { id: "c-tarjeta", nombre: "7 TarjetaOferta", etiqueta: "button", clases: "w-full text-left sunmi-panel rounded-lg p-3" },
  { id: "c-link", nombre: "8 botón-enlace crudo", etiqueta: "button", clases: "text-xs sunmi-text-accent underline" },
  { id: "c-fecha", nombre: "9 input date (la excepción histórica)", etiqueta: "input", tipo: "date", clases: "sunmi-input" },
];

await evaluar(`(() => {
  const casos = ${JSON.stringify(CASOS)};
  const barra = document.createElement("div");
  barra.id = "barra-foco";
  barra.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:12px;display:flex;flex-direction:column;gap:10px;background:var(--app-bg)";
  const titulo = document.createElement("div");
  titulo.id = "barra-titulo";
  titulo.style.cssText = "font:600 12px system-ui;color:var(--app-fg)";
  barra.append(titulo);
  const ancla = document.createElement("a");
  ancla.id = "ancla";
  ancla.href = "#";
  ancla.textContent = "ancla";
  ancla.style.cssText = "font:12px system-ui;color:var(--app-fg)";
  barra.append(ancla);
  for (const c of casos) {
    const el = document.createElement(c.etiqueta);
    el.id = c.id;
    if (c.etiqueta === "button") { el.type = "button"; el.textContent = c.nombre; }
    else if (c.etiqueta === "a") { el.href = "#"; el.textContent = c.nombre; el.style.color = "var(--app-fg)"; }
    else if (c.etiqueta === "select") { const o = document.createElement("option"); o.textContent = "opción"; el.append(o); }
    else if (c.etiqueta === "textarea") { el.value = "texto"; el.rows = 1; }
    else { el.type = c.tipo || "text"; el.value = c.tipo === "date" ? "2026-09-07" : "texto"; }
    el.className = c.clases;
    barra.append(el);
  }
  document.body.append(barra);
  return true;
})()`);

const LEER = (elId) => `(() => {
  const el = document.getElementById(${JSON.stringify(elId)});
  const s = getComputedStyle(el);
  return JSON.stringify({
    enfocado: document.activeElement === el,
    focus: (() => { try { return el.matches(":focus"); } catch { return null; } })(),
    focusVisible: (() => { try { return el.matches(":focus-visible"); } catch { return null; } })(),
    outline: s.outlineStyle + " " + s.outlineWidth,
    outlineColor: s.outlineColor,
    outlineOffset: s.outlineOffset,
    boxShadow: s.boxShadow,
  });
})()`;

async function reposo(elId) {
  await evaluar(`(() => { document.activeElement && document.activeElement.blur(); return true; })()`);
  await sleep(40);
  return JSON.parse(await evaluar(LEER(elId)));
}

async function porTeclado(elId, indice) {
  // Se ancla el foco en el enlace de arriba y se manda TAB de verdad tantas
  // veces como haga falta. Un `focus()` por script no sirve: Chrome lo trata
  // como teclado siempre y no distinguiría del click.
  await evaluar(`(() => { document.getElementById("ancla").focus(); return true; })()`);
  for (let i = 0; i <= indice; i++) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
    await sleep(25);
  }
  return JSON.parse(await evaluar(LEER(elId)));
}

async function porMouse(elId) {
  // Se suelta el foco ANTES de clickear. Sin esto el click caía sobre un
  // elemento que el Tab acababa de enfocar, y Chrome conserva `:focus-visible`:
  // la columna del mouse informaba `true` siempre y no distinguía nada, que es
  // lo único que esta sonda tiene que distinguir.
  await evaluar(`(() => { document.activeElement && document.activeElement.blur(); return true; })()`);
  await sleep(40);

  const caja = JSON.parse(await evaluar(`(() => {
    const r = document.getElementById(${JSON.stringify(elId)}).getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
  })()`));
  for (const type of ["mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x: caja.x, y: caja.y, button: "left", clickCount: 1 });
  }
  await sleep(40);
  return JSON.parse(await evaluar(LEER(elId)));
}

/**
 * ¿Hay señal de foco? Solo si algo se AGREGA, no si algo cambia.
 *
 * La versión anterior tomaba cualquier diferencia contra el reposo, y eso daba
 * un falso positivo al revés: el botón del kit tiene una sombra ambiental que la
 * regla global BORRA al enfocarlo, y esa desaparición contaba como "se ve". Un
 * control que pierde su sombra al recibir el foco no está señalando dónde está
 * el foco: está perdiendo decoración.
 *
 * Señal = aparece un contorno, o la sombra pasa a ser algo distinto Y no vacío.
 */
const haySenal = (base, otro) => {
  const contorno = otro.outline.split(" ")[0] !== "none";
  const sombraNueva = otro.boxShadow !== "none" && otro.boxShadow !== base.boxShadow;
  return contorno || sombraNueva;
};

let fallas = 0;
const ok = (t, c, d = "") => { if (c) console.log(`  ✓ ${t}`); else { fallas++; console.log(`  ✗ ${t}${d ? "  " + d : ""}`); } };

for (const ancho of ANCHOS) {
  await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: 700, deviceScaleFactor: 1, mobile: ancho < 1024 });
  for (const tema of TEMAS) {
    await evaluar(`(() => {
      document.documentElement.dataset.theme = ${JSON.stringify(tema)};
      document.getElementById("barra-titulo").textContent = ${JSON.stringify(`${tema} · ${ancho}px`)};
      return true;
    })()`);
    await sleep(60);
    console.log(`\n  ══ ${tema} · ${ancho} px ═══════════════════════════════`);

    for (let i = 0; i < CASOS.length; i++) {
      const c = CASOS[i];
      const base = await reposo(c.id);
      const tec = await porTeclado(c.id, i);
      const mou = await porMouse(c.id);

      const senalTeclado = tec.enfocado && haySenal(base, tec);
      const senalMouse = mou.enfocado && haySenal(base, mou);

      // Una fila por control: TAB y CLICK con lo que decide cada uno.
      console.log(
        `  ${c.nombre.padEnd(38)}` +
          `TAB[fv:${String(tec.focusVisible).padEnd(5)} out:${tec.outline.padEnd(12)} sh:${tec.boxShadow === "none" ? "no " : "sí "}${senalTeclado ? "SE VE " : "NO ve "}]  ` +
          `CLICK[fv:${String(mou.focusVisible).padEnd(5)} ${senalMouse ? "anillo" : "limpio"}]`
      );
      if (senalTeclado && tec.outline.split(" ")[0] !== "none") {
        console.log(`  ${"".padEnd(38)}      contorno ${tec.outline} ${tec.outlineColor} offset ${tec.outlineOffset}`);
      }

      if (EXIGIR) {
        ok(`${tema}/${ancho} · ${c.nombre}: con TAB se ve`, senalTeclado);
        ok(`${tema}/${ancho} · ${c.nombre}: con CLICK no queda anillo de teclado`, !senalMouse);
      }
    }

    if (CAPTURAS) {
      await evaluar(`(() => { document.getElementById("ancla").focus(); return true; })()`);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: 9, key: "Tab", code: "Tab" });
      await sleep(60);
      const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: ancho, height: 330, scale: 2 } });
      fs.mkdirSync(CAPTURAS, { recursive: true });
      fs.writeFileSync(path.join(CAPTURAS, `${ancho}-${tema}-foco.png`), Buffer.from(data, "base64"));
    }
  }
}

console.log("");
if (EXIGIR) {
  console.log(`  ${fallas} afirmaciones en rojo.`);
} else {
  console.log("  (retrato del estado actual: sin --exigir esta sonda no falla)");
}
cerrar();
process.exit(EXIGIR && fallas ? 1 : 0);
