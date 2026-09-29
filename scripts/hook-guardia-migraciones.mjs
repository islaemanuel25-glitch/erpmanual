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
//
// ── Y ESA FRASE DE ARRIBA ERA FALSA EN EL ÚNICO CASO QUE IMPORTABA ──────────
//
// Decía "si la guardia misma falla, DENIEGA", y valía para todo lo que pasa
// DESPUÉS de que el módulo carga. No valía para el momento anterior: si el
// `import` de abajo no resolvía, este archivo se caía con un error de sintaxis
// antes de tener una opinión, salía con código 1 — que para un PreToolUse no es
// un bloqueo— y el comando corría igual.
//
// Falló ABIERTA, que es lo contrario de lo que este comentario prometía, y no
// avisó nunca. Se descubrió el 2026-09-15 desplegando, y para entonces ese
// despliegue ya había corrido `migrate deploy` sin guardia.
//
// La causa era una letra: `lib/deploy/guardiaMigraciones` se llamaba `.js` y
// tiene sintaxis de módulo ES. Este `package.json` no declara `"type": "module"`,
// así que un `.js` es CommonJS. Node 20 lo disimula —reparsea como ESM y sigue,
// con un warning—; **node 18 no**, y el node del sistema del VPS, que es el que
// ejecuta los hooks, es 18. O sea que la guardia andaba en la CI y estaba muerta
// justo en la máquina desde la que se despliega.
//
// El hermano que sí andaba lo demuestra: `hook-trinquete-hardcodeo.mjs` importa
// `contador.mjs` y carga con los dos nodes. La diferencia era la extensión.
//
// Por eso ahora son dos cosas y no una: el módulo se llama `.mjs`, y la carga
// pasó a ser `import()` adentro de un `try` que DENIEGA si no puede cargar. La
// primera arregla el caso conocido; la segunda cubre el próximo, que no va a ser
// una extensión y no lo vamos a ver venir.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
function dejarRastro(comando, etiqueta = "AUTORIZACIÓN MANUAL") {
  try {
    fs.mkdirSync(path.dirname(BITACORA), { recursive: true });
    const cuando = new Date().toISOString().slice(0, 16).replace("T", " ");
    fs.appendFileSync(BITACORA, `${cuando}  ${etiqueta}  ${comando}\n`, "utf8");
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
 * LA RED DE ÚLTIMO RECURSO, para cuando el módulo que decide no carga.
 *
 * A propósito es MÁS ANCHA que la regla de verdad: cualquier mención de prisma
 * alcanza. Sin el módulo no hay forma de distinguir un comando peligroso de uno
 * inofensivo, y en esa duda la única dirección aceptable es bloquear de más.
 *
 * No se usa para decidir cuando el módulo SÍ cargó: ahí manda `decidirPorComando`
 * y ésta no se mira. Duplicar la regla sería escribir una segunda parecida al
 * lado, que es justo lo que no se hace; ésta no es una segunda regla, es el
 * cartel de "no puedo mirar".
 */
const MENCIONA_PRISMA = /prisma/i;

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

  // ── SE CARGA ACÁ, Y SI NO CARGA SE DENIEGA ────────────────────────────────
  //
  // Con el `import` arriba, un módulo que no resuelve mata el proceso antes de
  // esta línea y el comando pasa. Acá abajo el fallo es un objeto que se puede
  // mirar, así que la guardia puede contestar "no pude comprobar" en vez de no
  // contestar nada — que es la diferencia entre fallar cerrada y fallar abierta.
  let decidirPorComando;
  try {
    ({ decidirPorComando } = await import("../lib/deploy/guardiaMigraciones.mjs"));
  } catch (e) {
    const detalle = e?.message ? ` (${String(e.message).split("\n")[0]})` : "";
    if (!MENCIONA_PRISMA.test(comando)) {
      // Que la guardia esté rota no puede dejar el repo sin poder correr un `ls`.
      // Se deja pasar lo que ni de lejos le compete, y se dice que no se miró.
      responder(
        "allow",
        `guardia de migraciones: NO SE PUDO CARGAR${detalle}. Este comando no nombra prisma, así que se deja pasar sin comprobar. ARREGLARLA ES URGENTE: mientras esté así, no protege nada.`,
        "GUARDIA ROTA: no se pudo cargar el módulo que decide. No está protegiendo."
      );
    }
    responder(
      "deny",
      `FRENADO: la guardia de migraciones NO SE PUDO CARGAR${detalle}, así que no puede afirmar que este comando sea seguro.\n\n` +
        "Un chequeo que no pudo mirar no es un chequeo que pasó, y este comando nombra prisma.\n\n" +
        "No lo corras esquivando la guardia. Arreglá la carga del módulo " +
        "lib/deploy/guardiaMigraciones.mjs y volvé a intentar. El candado " +
        "scripts/hooksSeCargan.test.mjs dice exactamente qué se rompió.",
      "GUARDIA ROTA: se frenó un comando de prisma porque la guardia no se pudo cargar."
    );
  }

  const previa = decidirPorComando(comando);
  if (previa.accion !== "clasificar") {
    // Dejan rastro los que pasan avisando: la autorización manual, que pasa sin
    // que nadie haya mirado qué entra, y las recuperaciones tipadas —libro_stock
    // y la activación del Libro de Costos—, que escriben en _prisma_migrations.
    // Cada una con su nombre. El rechazo del
    // db push no hace falta anotarlo, porque frena y por lo tanto se ve.
    if (previa.accion === "allow" && previa.aviso) dejarRastro(comando, previa.rastro);
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
