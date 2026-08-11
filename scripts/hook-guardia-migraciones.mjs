// scripts/hook-guardia-migraciones.mjs
//
// GUARDIA PreToolUse: no deja correr `prisma migrate deploy` contra producción
// sin que el clasificador haya mirado qué migraciones entran, y no deja correr
// `prisma db push` nunca.
//
// ── POR QUÉ UN HOOK Y NO UN PASO EN EL DOCUMENTO ────────────────────────────
//
// El chequeo estaba escrito en el skill de deploy como un bloque de comandos.
// Eso depende de que el que despliega se acuerde de correrlo, y de que no lo
// saltee cuando tiene apuro — que es exactamente el día que importa. Un hook no
// se olvida.
//
// ── POR QUÉ AHORA IMPORTA MÁS QUE ANTES ─────────────────────────────────────
//
// Desde el 2026-08-10 la sesión corre sin pedidos de permiso, por decisión de
// Emanuel. El cartel era el segundo control de todo esto; al sacarlo, este hook
// pasó a ser el único que queda del lado de la máquina. Por eso se le agregó el
// rechazo total del `db push` y el aviso visible de la autorización manual: los
// dos casos que hasta ese día frenaba el cartel.
//
// ── DÓNDE SE ENGANCHA ───────────────────────────────────────────────────────
//
// En `migrate deploy` y no en `up -d`, porque ese es el momento en que se abre
// la ventana: a partir de ahí el esquema es nuevo y el código que atiende es el
// viejo. Recrear la app después no agrega riesgo, lo cierra.
//
// ── CÓMO SE AUTORIZA, Y QUÉ NO SE PUEDE AUTORIZAR ───────────────────────────
//
// `migrate deploy` se autoriza con `DEPLOY_MIGRACION_AUTORIZADA=1` adelante del
// comando, misma idea que `SEED_DESTRUCTIVO` en los scripts que tocan la base:
// la autorización es un acto explícito y visible en la línea, no un flag pegado
// en la configuración de alguien. La guardia lo deja pasar, lo dice, Y AVISA en
// pantalla.
//
// `db push` NO se autoriza con nada. El motivo largo está en
// lib/deploy/guardiaMigraciones.js, al lado de la función que lo decide.
//
// ── LÍMITES, QUE HAY QUE TENERLOS PRESENTES ─────────────────────────────────
//
// Esto solo corre cuando el comando pasa por la herramienta Bash de Claude Code
// en ESTE repo. Un `ssh` a mano desde una terminal, un `docker compose` tipeado
// dentro del VPS o un workflow remoto no lo ven. La lista completa de por dónde
// se puede saltear está en el skill `/deploy`.
//
// Salida: JSON con permissionDecision allow/deny. Si la guardia misma falla,
// DENIEGA: no puede distinguir "no hay problema" de "no pude comprobar".

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decidirPorComando } from "../lib/deploy/guardiaMigraciones.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const CLASIFICADOR = path.join(AQUI, "clasificar-migraciones.mjs");
const BITACORA = path.join(ROOT, ".claude", "migraciones-autorizadas.log");

/**
 * Deja el rastro de una autorización manual en un archivo.
 *
 * Existe porque el aviso de pantalla no alcanza, y eso se descubrió probándolo:
 * en la ruta de "permitir", ni el systemMessage ni la razón vuelven al contexto
 * de quien está trabajando. O sea que la autorización se le muestra a Emanuel
 * en el momento y a nadie más — si él está mirando otra cosa, no queda nada.
 *
 * Un archivo sí queda. El skill `/deploy` manda a leerlo antes de cerrar el
 * reporte, así que la autorización aparece ahí aunque nadie la haya visto pasar.
 *
 * Si escribir falla, no se frena nada: el rastro es para el informe, no para la
 * decisión. Perder una línea de bitácora no puede costar un despliegue.
 */
function dejarRastro(comando) {
  try {
    fs.mkdirSync(path.dirname(BITACORA), { recursive: true });
    const cuando = new Date().toISOString().slice(0, 16).replace("T", " ");
    fs.appendFileSync(BITACORA, `${cuando}  AUTORIZACIÓN MANUAL  ${comando}\n`, "utf8");
  } catch {
    // a propósito en silencio
  }
}

/**
 * `aviso` va como systemMessage: es lo que Emanuel ve en pantalla. `razon` la
 * lee quien está trabajando. Se mandan las dos porque cubren cosas distintas —
 * si solo fuera la razón, el aviso dependería de que alguien se acuerde de
 * repetirlo en el reporte, que es justamente lo que se quiso dejar de depender.
 */
function responder(decision, razon, aviso = null) {
  const salida = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: razon,
    },
  };
  if (aviso) salida.systemMessage = aviso;
  process.stdout.write(JSON.stringify(salida));
  process.exit(0);
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (entrada += c));
process.stdin.on("end", () => {
  let comando = "";
  try {
    const evento = JSON.parse(entrada || "{}");
    if (evento.tool_name !== "Bash") responder("allow", "");
    comando = String(evento.tool_input?.command ?? "");
  } catch {
    // No se pudo leer el evento. No se sabe qué comando es, así que no se puede
    // afirmar que sea inofensivo — pero tampoco se bloquea todo el trabajo del
    // repo por un evento mal formado. Se deja pasar y se dice.
    responder("allow", "guardia de migraciones: no se pudo leer el evento, no se comprobó nada");
  }

  const previa = decidirPorComando(comando);
  if (previa.accion !== "clasificar") {
    // Solo la autorización manual deja rastro: es la única que pasa sin que
    // nadie haya mirado qué entra. El rechazo del db push no hace falta
    // anotarlo, porque frena y por lo tanto se ve.
    if (previa.accion === "allow" && previa.aviso) dejarRastro(comando);
    responder(previa.accion, previa.razon, previa.aviso);
  }

  const r = spawnSync(process.execPath, [CLASIFICADOR, "--vps"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 90_000,
  });

  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();

  if (r.status === 0) {
    responder(
      "allow",
      `Guardia de migraciones: el clasificador no encontró sentencias marcadas.\n\n${salida}`
    );
  }

  const encabezado =
    r.status === 1
      ? "FRENADO: hay al menos una migración que rompería a la versión que está atendiendo tráfico durante la ventana entre migrar y recrear."
      : "FRENADO: la guardia no pudo determinar qué migraciones entran, así que no puede afirmar que sean compatibles.";

  responder(
    "deny",
    `${encabezado}\n\n${salida}\n\n` +
      "NO continuar por criterio propio. Informarle a Emanuel qué migración es, qué " +
      "sentencia la marcó y por qué rompería a la versión vieja, y esperar su " +
      "confirmación explícita. Si él confirma, el comando se repite con " +
      "DEPLOY_MIGRACION_AUTORIZADA=1 adelante.",
    r.status === 1
      ? "GUARDIA: se frenó una migración que rompería a la versión vieja durante la ventana."
      : "GUARDIA: se frenó una migración porque el clasificador no pudo determinar qué entra."
  );
});
