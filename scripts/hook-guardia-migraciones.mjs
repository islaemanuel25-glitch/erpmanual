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
// MEDIDO, no supuesto: el evento que llega es un PreToolUse de la herramienta
// **Bash**, con el comando completo en `tool_input.command`. El `/deploy` no es
// un evento propio —es un skill que se expande a una serie de llamadas Bash—,
// así que el punto real donde empieza el riesgo es esa llamada y no otra. Está
// ejercido en scripts/hook-guardia-migraciones.test.mjs con el payload textual.
//
// ── POR QUÉ NADA SE IMPORTA ARRIBA ──────────────────────────────────────────
//
// EL 2026-09-10 ESTA GUARDIA ESTUVO APAGADA Y NADIE LO VIO. El archivo importaba
// `../lib/deploy/guardiaMigraciones.js` de forma estática. Ese `.js` tiene
// sintaxis ESM y el repo no declara `"type": "module"`, así que bajo Node 18
// —el del VPS de producción— el import lanza un SyntaxError ANTES de correr una
// sola línea. El proceso muere, no escribe nada, y sin decisión el comando pasa.
// El `migrate deploy` de producción de ese día corrió sin que nada lo mirara.
//
// De ahí las dos defensas de este archivo, y ninguna es cosmética:
//
//   1. La cadena entera es `.mjs` — ESM explícito, sin depender de que el motor
//      detecte la sintaxis. Hay un candado que se pone rojo si vuelve a entrar
//      un `.js` en el medio.
//   2. Los módulos se cargan con `await import()` DENTRO de un try/catch, y si
//      la carga falla se contesta **deny**. Un control que no puede correr tiene
//      que frenar: dejar pasar es exactamente cómo se apagó solo.
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
// lib/deploy/guardiaMigraciones.mjs, al lado de la función que lo decide.
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

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const CLASIFICADOR = path.join(AQUI, "clasificar-migraciones.mjs");
const BITACORA = path.join(ROOT, ".claude", "migraciones-autorizadas.log");

/**
 * El modo canónico del clasificador.
 *
 * `--desplegado` averigua solo si el contenedor que atiende se ve desde acá o
 * hay que preguntarle por ssh. Antes era `--vps`, que obliga a la vía remota:
 * corrido DENTRO del VPS, donde el alias `vps-erp` no resuelve, salía con 2 y la
 * guardia denegaba TODOS los despliegues hechos desde el servidor.
 */
const MODO_CLASIFICADOR = "--desplegado";

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

/**
 * LA ÚNICA RESPUESTA QUE NO PUEDE DEPENDER DE QUE ALGO CARGUE.
 *
 * Está escrita acá adentro, corta y sin importar nada, a propósito: si el
 * módulo de la decisión no se puede cargar, tampoco se puede cargar un texto que
 * viva en él. Es la respuesta de último recurso, no la del caso normal.
 */
function frenarPorGuardiaRota(detalle) {
  responder(
    "deny",
    "FRENADO: la guardia de migraciones no pudo cargarse, así que no miró nada.\n\n" +
      `  ${String(detalle ?? "").split("\n")[0]}\n\n` +
      "Esto no es una migración peligrosa: es el control roto. Un control que no puede " +
      "correr tiene que frenar, porque la alternativa —dejar pasar— es exactamente cómo " +
      "esta guardia se apagó sola el 2026-09-10 sin que nadie se enterara.\n\n" +
      "Arreglar el hook antes de seguir. La ruta explícita y auditable mientras tanto es " +
      "correr el clasificador a mano con --desde <SHA> y llevarle el resultado a Emanuel.",
    "GUARDIA: el hook de migraciones no pudo cargarse y frenó el comando."
  );
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (entrada += c));
process.stdin.on("end", async () => {
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

  let decidirPorComando;
  let decidirPorClasificacion;
  try {
    ({ decidirPorComando, decidirPorClasificacion } = await import(
      "../lib/deploy/guardiaMigraciones.mjs"
    ));
  } catch (e) {
    frenarPorGuardiaRota(e?.message || e);
  }

  const previa = decidirPorComando(comando);
  if (previa.accion !== "clasificar") {
    // Solo la autorización manual deja rastro: es la única que pasa sin que
    // nadie haya mirado qué entra. El rechazo del db push no hace falta
    // anotarlo, porque frena y por lo tanto se ve.
    if (previa.accion === "allow" && previa.aviso) dejarRastro(comando);
    responder(previa.accion, previa.razon, previa.aviso);
  }

  const r = spawnSync(process.execPath, [CLASIFICADOR, MODO_CLASIFICADOR], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 90_000,
  });

  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();
  const decision = decidirPorClasificacion({ status: r.status, salida });
  responder(decision.accion, decision.razon, decision.aviso);
});
