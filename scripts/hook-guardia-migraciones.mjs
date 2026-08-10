// scripts/hook-guardia-migraciones.mjs
//
// GUARDIA PreToolUse: no deja correr `prisma migrate deploy` contra producción
// sin que el clasificador haya mirado qué migraciones entran.
//
// ── POR QUÉ UN HOOK Y NO UN PASO EN EL DOCUMENTO ────────────────────────────
//
// El chequeo estaba escrito en el skill de deploy como un bloque de comandos.
// Eso depende de que el que despliega se acuerde de correrlo, y de que no lo
// saltee cuando tiene apuro — que es exactamente el día que importa. Un hook no
// se olvida.
//
// ── DÓNDE SE ENGANCHA ───────────────────────────────────────────────────────
//
// En `migrate deploy` y no en `up -d`, porque ese es el momento en que se abre
// la ventana: a partir de ahí el esquema es nuevo y el código que atiende es el
// viejo. Recrear la app después no agrega riesgo, lo cierra.
//
// ── CÓMO SE AUTORIZA ────────────────────────────────────────────────────────
//
// Con `DEPLOY_MIGRACION_AUTORIZADA=1` adelante del comando, misma idea que
// `SEED_DESTRUCTIVO` en los scripts que tocan la base: la autorización es un
// acto explícito y visible en la línea, no un flag que se queda pegado en la
// configuración de alguien. La guardia lo deja pasar y lo dice.
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
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const CLASIFICADOR = path.join(AQUI, "clasificar-migraciones.mjs");

// `migrate deploy` es el de producción. `migrate dev` es local y no entra acá.
const ES_MIGRACION_DE_PRODUCCION = /\bmigrate\s+deploy\b/;
const AUTORIZADO = /\bDEPLOY_MIGRACION_AUTORIZADA\s*=\s*1\b/;

function responder(decision, razon) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: razon,
      },
    })
  );
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

  if (!ES_MIGRACION_DE_PRODUCCION.test(comando)) responder("allow", "");

  if (AUTORIZADO.test(comando)) {
    responder(
      "allow",
      "Migración AUTORIZADA a mano con DEPLOY_MIGRACION_AUTORIZADA=1. La guardia no clasificó nada: la compatibilidad durante la ventana queda bajo la confirmación de Emanuel."
    );
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
      "DEPLOY_MIGRACION_AUTORIZADA=1 adelante."
  );
});
