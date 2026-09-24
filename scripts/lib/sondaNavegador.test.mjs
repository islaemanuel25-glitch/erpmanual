// CANDADO: CÓMO SE LEVANTA EL NAVEGADOR DE LA SONDA DE CASCADA.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/lib/sondaNavegador.test.mjs
//
// Lo que la sonda MIDE no está acá: necesita un navegador y no va en la suite.
// Acá está lo que cambia entre entornos —qué navegador, con qué argumentos, con
// qué WebSocket— y la promesa más importante del cambio: el comando de siempre,
// en Windows con Edge, arma EXACTAMENTE lo mismo que antes.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  EDGE_POR_DEFECTO,
  argumentosDelNavegador,
  opcionesDeLaSonda,
  resolverWebSocket,
} from "./sondaNavegador.mjs";

const argv = (...resto) => ["node", "scripts/sonda-cascada.mjs", ...resto];

/** Los argumentos que la sonda le pasaba al navegador antes del cambio, copiados del fuente de entonces. */
const ARGUMENTOS_DE_SIEMPRE = (puerto, perfil) => [
  "--headless=new",
  `--remote-debugging-port=${puerto}`,
  `--user-data-dir=${perfil}`,
  "--window-size=1366,900",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-gpu",
];

test("el comando de siempre: Edge de Windows, sin sandbox apagado, mismos argumentos", () => {
  const o = opcionesDeLaSonda(argv("--base", "https://operix.cloud"), { tmpdir: "/tmp" });
  assert.equal(o.base, "https://operix.cloud");
  assert.equal(o.ruta, "/login");
  assert.equal(o.puerto, 9226);
  assert.equal(o.perfil, "/tmp/sonda-cascada-edge-9226".replace(/\//g, require_sep()));
  assert.equal(o.navegador, EDGE_POR_DEFECTO);
  assert.equal(EDGE_POR_DEFECTO, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
  assert.equal(o.sinSandbox, false);
  assert.deepEqual(argumentosDelNavegador(o), ARGUMENTOS_DE_SIEMPRE(9226, o.perfil));
});

test("sin ningún flag, los defaults de siempre", () => {
  const o = opcionesDeLaSonda(argv(), { tmpdir: "/tmp" });
  assert.equal(o.base, "http://localhost:3000");
  assert.equal(o.ruta, "/login");
  assert.equal(o.navegador, EDGE_POR_DEFECTO);
});

test("navegador explícito con --edge, sin tocar nada más", () => {
  const o = opcionesDeLaSonda(argv("--base", "https://operix.cloud", "--edge", "/opt/pw-browsers/chromium"));
  assert.equal(o.navegador, "/opt/pw-browsers/chromium");
  assert.equal(o.sinSandbox, false, "elegir navegador no apaga el sandbox");
  assert.ok(!argumentosDelNavegador(o).includes("--no-sandbox"));
});

test("--no-sandbox se pide explícito y agrega ese argumento, y solo ése, al final", () => {
  const o = opcionesDeLaSonda(
    argv("--base", "https://operix.cloud", "--edge", "/opt/pw-browsers/chromium", "--no-sandbox"),
    { tmpdir: "/tmp" }
  );
  assert.equal(o.sinSandbox, true);
  assert.deepEqual(argumentosDelNavegador(o), [...ARGUMENTOS_DE_SIEMPRE(9226, o.perfil), "--no-sandbox"]);
});

test("--no-sandbox no se come el valor del flag que sigue", () => {
  const o = opcionesDeLaSonda(argv("--no-sandbox", "--base", "https://operix.cloud", "--url", "/otra"));
  assert.equal(o.sinSandbox, true);
  assert.equal(o.base, "https://operix.cloud");
  assert.equal(o.ruta, "/otra");
});

test("el perfil sigue atado al puerto", () => {
  const o = opcionesDeLaSonda(argv("--puerto-cdp", "9300"), { tmpdir: "/tmp" });
  assert.equal(o.puerto, 9300);
  assert.ok(o.perfil.endsWith("sonda-cascada-edge-9300"));
  assert.ok(argumentosDelNavegador(o).includes("--remote-debugging-port=9300"));
});

// ── WEBSOCKET ─────────────────────────────────────────────────────────────

test("con WebSocket global, usa el global", async () => {
  class Global {}
  const r = await resolverWebSocket({ global: Global, importar: () => assert.fail("no tenía que importar ws") });
  assert.equal(r.WebSocket, Global);
  assert.equal(r.origen, "global");
});

test("Node sin WebSocket global (Node 18): usa el paquete ws", async () => {
  class DeWs {}
  const r = await resolverWebSocket({ global: undefined, importar: async () => ({ WebSocket: DeWs }) });
  assert.equal(r.WebSocket, DeWs);
  assert.equal(r.origen, "ws");
});

test("el paquete ws que el repo ya tiene se puede usar de verdad", async () => {
  const r = await resolverWebSocket({ global: undefined });
  assert.equal(r.origen, "ws", r.error);
  assert.equal(typeof r.WebSocket, "function");
  // La sonda le pone onopen, onerror y onmessage, y usa send.
  assert.ok("onopen" in r.WebSocket.prototype && "onmessage" in r.WebSocket.prototype);
});

test("sin global y sin ws, no tira: devuelve el motivo para informarlo en ROJO", async () => {
  const r = await resolverWebSocket({
    global: undefined,
    importar: async () => {
      throw new Error("Cannot find package 'ws'");
    },
  });
  assert.equal(r.WebSocket, undefined);
  assert.match(r.error, /WebSocket global/);
});

// ── LA SONDA USA ESTO, Y NO MIDE DISTINTO ─────────────────────────────────

test("la sonda lanza el navegador con estos argumentos y habla con este WebSocket", () => {
  const src = fs
    .readFileSync(new URL("../sonda-cascada.mjs", import.meta.url), "utf8")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(src, /argumentosDelNavegador\(\{ puerto: PUERTO, perfil: PERFIL, sinSandbox: OPCIONES\.sinSandbox \}\)/);
  assert.ok(src.includes("new conexion.WebSocket("), "la sonda volvió a depender del WebSocket global");
  assert.ok(!/new WebSocket\(/.test(src), "la sonda volvió a depender del WebSocket global");
  assert.ok(src.includes("ROJO · NO SE PUEDE MEDIR"), "sin WebSocket tiene que ser rojo");
});

function require_sep() {
  // `path.join` usa el separador del sistema; el candado corre en Linux y en Windows.
  return process.platform === "win32" ? "\\" : "/";
}
