// CANDADO: LA GUARDIA DE CAPTURAS FRENA NAVEGADOR Y CAPTURAS, Y NADA MÁS.
//
//   node --test scripts/hookGuardiaCapturas.test.mjs
//
// Se ejerce el HOOK, no la función: cada caso corre
// `scripts/hook-guardia-capturas.mjs` en un proceso aparte con el JSON que
// manda Claude Code por stdin, y se lee lo que contesta. Y el envoltorio de
// `.claude/settings.json` se corre tal cual está escrito ahí, con `sh`, para
// probar que falla cerrado cuando el hook no puede correr.
//
// Las autorizaciones escriben una bitácora: esos casos corren sobre una copia
// del hook y su módulo en un directorio temporal, para no ensuciar el repo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const HOOK = path.join(RAIZ, "scripts", "hook-guardia-capturas.mjs");
const PROHIBIDO = "Prohibido: navegador y capturas. Lo visual lo prueba Emanuel desplegado en su celular. Seguí con candados y suite.";

/** Corre el hook con un evento; el ambiente se limpia de la puerta salvo que se pida. */
function correr(evento, { env = {}, hook = HOOK, crudo = null } = {}) {
  const ambiente = { ...process.env, ...env };
  if (!("CAPTURAS_AUTORIZADAS" in env)) delete ambiente.CAPTURAS_AUTORIZADAS;
  const r = spawnSync(process.execPath, [hook], {
    input: crudo ?? JSON.stringify(evento),
    encoding: "utf8",
    env: ambiente,
    timeout: 15_000,
  });
  let json = null;
  try {
    json = r.stdout ? JSON.parse(r.stdout) : null;
  } catch {
    json = { roto: r.stdout };
  }
  return { status: r.status, json, stderr: r.stderr };
}

const bash = (command) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
const herramienta = (tool_name, tool_input = {}) => ({ hook_event_name: "PreToolUse", tool_name, tool_input });
const decision = (r) => r.json?.hookSpecificOutput?.permissionDecision ?? null;

function denegado(r, que) {
  assert.equal(r.status, 0, `${que}: el hook se cayó (${r.stderr})`);
  assert.equal(decision(r), "deny", `${que}: no lo frenó`);
  assert.ok(r.json.hookSpecificOutput.permissionDecisionReason.startsWith(PROHIBIDO), `${que}: el mensaje no es el pedido`);
}

function pasa(r, que) {
  assert.equal(r.status, 0, `${que}: el hook se cayó (${r.stderr})`);
  assert.equal(decision(r), null, `${que}: lo frenó o lo decidió y no tenía por qué`);
}

// ── LO QUE FRENA ─────────────────────────────────────────────────────────

test("frena Bash que invoca playwright, puppeteer, chromium o una captura", () => {
  for (const c of [
    "npx playwright screenshot https://operix.cloud a.png",
    "npx -y playwright@1.48.2 install chromium",
    "cd /tmp && playwright test",
    "pnpm exec playwright test",
    "npx puppeteer browsers install chrome",
    "node -e 'const { chromium } = require(\"playwright\"); chromium.launch()'",
    "node --input-type=module -e 'import { chromium } from \"playwright-core\"'",
    "node -e 'createRequire(\"/x/\")(\"playwright-core\")'",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell --dump-dom https://x",
    "chromium --headless --screenshot https://x",
    "google-chrome --headless=new --remote-debugging-port=9222",
    "node -e 'await page.screenshot({ path: \"a.png\" })'",
  ]) {
    denegado(correr(bash(c)), c);
  }
});

test("frena los scripts del arnés por lo que HACEN, no por su nombre", () => {
  // Elegidos por contenido: los tres manejan un navegador —directo o por la
  // sonda que importan—. Si alguno dejara de hacerlo, el caso tiene que salir.
  for (const s of ["scripts/generar-huellas.mjs", "scripts/capturas-tablero-movil.mjs", "scripts/sonda-cascada.mjs"]) {
    assert.ok(fs.existsSync(path.join(RAIZ, s)), `${s} ya no existe: releer este candado`);
    denegado(correr(bash(`node ${s} --salida /tmp/x`)), s);
    denegado(correr(bash(`cd /home/user/erpmanual && node --no-warnings ./${s}`)), `${s} con ./`);
  }
});

test("frena las herramientas MCP de navegador y captura", () => {
  for (const t of [
    "mcp__Claude_Browser__navigate",
    "mcp__remote-devices__Claude_Browser__screenshot",
    "mcp__claude-in-chrome__tabs_create",
    "mcp__computer-use__screenshot",
    "mcp__remote-devices__computer_click",
    "mcp__playwright__browser_navigate",
    "mcp__puppeteer__puppeteer_screenshot",
    "mcp__Figma__get_screenshot",
  ]) {
    denegado(correr(herramienta(t, { url: "https://x" })), t);
  }
});

test("frena la skill capturas, con o sin prefijo", () => {
  denegado(correr(herramienta("Skill", { skill: "capturas" })), "capturas");
  denegado(correr(herramienta("Skill", { skill: "erpmanual:capturas" })), "erpmanual:capturas");
  denegado(correr(bash("cat .claude/skills/capturas/SKILL.md && node scripts/generar-huellas.mjs")), "por su carpeta");
});

// ── LO QUE NO FRENA ──────────────────────────────────────────────────────

test("deja pasar sin preguntar lo de todos los días, aunque nombre la palabra", () => {
  for (const c of [
    "git status",
    "node scripts/test/correr.mjs",
    "node --import ./scripts/alias-loader.mjs --test lib/turnosYCierres/turnosYCierres.test.mjs",
    // Un candado que prueba cómo se ARMA la llamada al navegador, sin abrirlo.
    "node --import ./scripts/alias-loader.mjs --test scripts/lib/sondaNavegador.test.mjs",
    "git grep --untracked -n playwright -- scripts",
    "grep -rn chromium .github/workflows",
    "git log --oneline -3 -- scripts/generar-huellas.mjs",
    "npx eslint components",
  ]) {
    pasa(correr(bash(c)), c);
  }
  for (const t of ["mcp__github__get_me", "mcp__claude-code-remote__get_session", "mcp__Claude_Docs__batch"]) pasa(correr(herramienta(t)), t);
  pasa(correr(herramienta("Skill", { skill: "relevar" })), "skill relevar");
});

// ── LA PUERTA ────────────────────────────────────────────────────────────

/** Una copia del hook y su módulo, para que la bitácora caiga en un temporal. */
function copiaAislada() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-capturas-"));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.mkdirSync(path.join(dir, "lib", "hooks"), { recursive: true });
  fs.copyFileSync(HOOK, path.join(dir, "scripts", "hook-guardia-capturas.mjs"));
  fs.copyFileSync(path.join(RAIZ, "lib", "hooks", "guardiaCapturas.mjs"), path.join(dir, "lib", "hooks", "guardiaCapturas.mjs"));
  return dir;
}

test("CAPTURAS_AUTORIZADAS=1 en la línea deja pasar, avisa y deja rastro", () => {
  const dir = copiaAislada();
  const hook = path.join(dir, "scripts", "hook-guardia-capturas.mjs");
  const r = correr(bash("CAPTURAS_AUTORIZADAS=1 npx playwright screenshot https://x a.png"), { hook });
  pasa(r, "autorizado en la línea");
  assert.match(r.json?.systemMessage ?? "", /CAPTURAS AUTORIZADAS/, "pasó sin avisar");
  const log = fs.readFileSync(path.join(dir, ".claude", "capturas-autorizadas.log"), "utf8");
  assert.match(log, /CAPTURAS_AUTORIZADAS\s+CAPTURAS_AUTORIZADAS=1 npx playwright screenshot/);
  // Otro valor no es la puerta.
  denegado(correr(bash("CAPTURAS_AUTORIZADAS=0 npx playwright test"), { hook }), "=0");
  denegado(correr(bash("CAPTURAS_AUTORIZADAS=11 npx playwright test"), { hook }), "=11");
});

test("CAPTURAS_AUTORIZADAS=1 en el ambiente de la sesión abre también las MCP", () => {
  const dir = copiaAislada();
  const hook = path.join(dir, "scripts", "hook-guardia-capturas.mjs");
  const r = correr(herramienta("mcp__Claude_Browser__navigate"), { hook, env: { CAPTURAS_AUTORIZADAS: "1" } });
  pasa(r, "MCP autorizada");
  assert.match(r.json?.systemMessage ?? "", /CAPTURAS AUTORIZADAS/);
  assert.match(fs.readFileSync(path.join(dir, ".claude", "capturas-autorizadas.log"), "utf8"), /mcp__Claude_Browser__navigate/);
});

// ── FALLA CERRADA ────────────────────────────────────────────────────────

test("si no puede leer la llamada, deniega", () => {
  denegado(correr(null, { crudo: "esto no es json" }), "stdin roto");
  denegado(correr(null, { crudo: "" }), "stdin vacío");
  denegado(correr(null, { crudo: JSON.stringify({ tool_input: { command: "git status" } }) }), "sin tool_name");
});

test("si su módulo no carga, deniega", () => {
  const dir = copiaAislada();
  fs.rmSync(path.join(dir, "lib"), { recursive: true });
  denegado(correr(bash("git status"), { hook: path.join(dir, "scripts", "hook-guardia-capturas.mjs") }), "sin módulo");
});

test("y si el hook ni corre, el envoltorio de settings.json sale con 2", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(RAIZ, ".claude", "settings.json"), "utf8"));
  const grupo = cfg.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("hook-guardia-capturas.mjs")));
  assert.ok(grupo, "el hook no está registrado en .claude/settings.json");
  assert.equal(grupo.matcher, "Bash|Skill|mcp__.*");
  const comando = grupo.hooks.find((h) => h.command.includes("hook-guardia-capturas.mjs")).command;
  const ok = spawnSync("sh", ["-c", comando], { input: JSON.stringify(bash("git status")), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: RAIZ } });
  assert.equal(ok.status, 0, "con el proyecto bien, el envoltorio no deja pasar git status");
  const roto = spawnSync("sh", ["-c", comando], { input: JSON.stringify(bash("git status")), encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: "/no/existe" } });
  assert.equal(roto.status, 2, "con el hook ausente no bloqueó: falla abierta");
  assert.match(roto.stderr, /Prohibido: navegador y capturas/);
});
