// scripts/hook-guardia-capturas.mjs
//
// GUARDIA PreToolUse: ninguna sesión de Code de este repo abre un navegador ni
// saca una captura. La decisión vive en lib/hooks/guardiaCapturas.mjs, con el
// porqué; este archivo solo lee el evento, le pasa los textos de los scripts
// que el comando nombra y contesta.
//
// ── FALLA CERRADA ──────────────────────────────────────────────────────────
//
// Si no puede evaluar —el evento no se lee, el módulo no carga, algo tira—
// DENIEGA. Es la lección de la guardia de migraciones (2026-09-15): un hook que
// se cae antes de opinar sale con 1, y un PreToolUse que sale con 1 no frena
// nada. Por eso la carga es un `import()` adentro del `try`, y además
// `.claude/settings.json` envuelve la llamada: si este archivo no corre, el
// envoltorio sale con 2, que es el único código que bloquea.
//
// Corre solo para Bash, Skill y las herramientas MCP (el `matcher` de
// settings.json). Read, Edit y Write quedan afuera a propósito: si esta guardia
// se rompe, todavía se la puede arreglar.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const BITACORA = path.join(ROOT, ".claude", "capturas-autorizadas.log");

const MENSAJE_SI_NO_CARGA =
  "Prohibido: navegador y capturas. Lo visual lo prueba Emanuel desplegado en su celular. Seguí con candados y suite. (La guardia de capturas no pudo evaluar esta llamada: falla cerrada.)";

function responder(decision, razon, aviso = null) {
  const salida = {};
  if (decision) {
    salida.hookSpecificOutput = { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: razon };
  }
  if (aviso) salida.systemMessage = aviso;
  if (Object.keys(salida).length) process.stdout.write(JSON.stringify(salida));
  process.exit(0);
}

function leerEntrada() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** El texto de un script del repo y los de lo que importa, dos niveles. */
function textosDe(ruta) {
  const textos = [];
  const vistos = new Set();
  const pila = [{ archivo: path.resolve(ROOT, ruta), nivel: 0 }];
  while (pila.length) {
    const { archivo, nivel } = pila.pop();
    if (vistos.has(archivo)) continue;
    vistos.add(archivo);
    let texto;
    try {
      texto = fs.readFileSync(archivo, "utf8");
    } catch {
      continue; // un archivo que no existe no abre ningún navegador
    }
    textos.push(texto);
    if (nivel >= 2) continue;
    const re = /(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g;
    let m;
    while ((m = re.exec(texto)) !== null) pila.push({ archivo: path.resolve(path.dirname(archivo), m[1]), nivel: nivel + 1 });
  }
  return textos;
}

function dejarRastro(linea) {
  try {
    fs.mkdirSync(path.dirname(BITACORA), { recursive: true });
    const cuando = new Date().toISOString().slice(0, 16).replace("T", " ");
    fs.appendFileSync(BITACORA, `${cuando}  ${linea}\n`, "utf8");
  } catch {
    // el rastro es para el informe, no para la decisión
  }
}

try {
  const { decidir } = await import("../lib/hooks/guardiaCapturas.mjs");
  let evento = null;
  try {
    evento = JSON.parse(leerEntrada());
  } catch {
    evento = null;
  }
  const r = decidir(evento, { textosDe, autorizadaEnAmbiente: process.env.CAPTURAS_AUTORIZADAS === "1" });
  if (r.accion === "deny") responder("deny", r.razon);
  if (r.accion === "authorized") {
    const que = evento.tool_name === "Bash" ? String(evento.tool_input?.command ?? "") : evento.tool_name;
    dejarRastro(`CAPTURAS_AUTORIZADAS  ${que.replace(/\s+/g, " ").slice(0, 400)}`);
    responder(null, "", r.razon);
  }
  responder(null, "");
} catch {
  responder("deny", MENSAJE_SI_NO_CARGA);
}
