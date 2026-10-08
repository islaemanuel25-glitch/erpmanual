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
// ── QUÉ PROYECTO SE MIGRA ───────────────────────────────────────────────────
//
// Desde el 2026-10-07 la decisión mira primero de qué proyecto es el
// `migrate deploy` (lib/deploy/proyectoDelComando.mjs). El clasificador calcula
// el rango del ERP y solo vale para la base del ERP: una migración de Azul Chat,
// reconocida por la forma exacta de su runbook, no se le manda. Lo desconocido
// sigue yendo al clasificador, y lo ambiguo se rechaza.
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

//
// ── QUÉ COPIA DE ESTE ARCHIVO CORRE — desde el 2026-10-08 ───────────────────
//
// Claude Code corre el comando del hook en el directorio ACTUAL de la sesión,
// que se mueve con cada `cd` (comprobado con Claude Code 2.1.293). Con
// `node scripts/hook-guardia-migraciones.mjs` a secas, después de un
// `cd /srv/produccion/erpazul` corría la copia de producción —otra versión—, y
// después de un `cd` a cualquier otro lado el archivo no existía: node salía
// con 1, que NO bloquea, y el comando pasaba sin guardia.
//
// Por eso `.claude/settings.json` lo llama por `$CLAUDE_PROJECT_DIR` —la raíz
// del proyecto donde arrancó la sesión, que no se mueve— y lo envuelve en un
// `sh` que sale con 2 si este archivo no pudo correr y el comando nombra
// prisma. El 2 es el único código que bloquea un PreToolUse.
//
// Y este archivo, al decidir sobre un `migrate deploy`, dice QUÉ copia es: su
// ruta y el commit de su árbol. Una copia que no es la del proyecto de la
// sesión frena todo lo que nombra prisma.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const CLASIFICADOR = path.join(AQUI, "clasificar-migraciones.mjs");
const BITACORA = path.join(ROOT, ".claude", "migraciones-autorizadas.log");

/**
 * ¿Esta copia es la del proyecto de la sesión? Claude Code exporta
 * `CLAUDE_PROJECT_DIR`; si no está —un test, una corrida a mano— no se puede
 * comparar y no se inventa una respuesta: devuelve null.
 */
function esLaCopiaDelProyecto() {
  const proyecto = process.env.CLAUDE_PROJECT_DIR;
  if (!proyecto) return null;
  try {
    return fs.realpathSync(proyecto) === fs.realpathSync(ROOT);
  } catch {
    return false;
  }
}

/**
 * EL PRESUPUESTO DE TIEMPO, porque un hook que se pasa del suyo DEJA PASAR el
 * comando (comprobado con Claude Code 2.1.293: un hook de 4 s que iba a salir
 * con 2 a los 20 s no frenó nada). El clasificador tiene 90 s, la identidad dos
 * `git` de 5 s, y el hook 150 s en .claude/settings.json; un candado compara los
 * números. `GUARDIA_TIEMPO_CLASIFICADOR_MS` solo puede ACHICAR los 90 s —un
 * clasificador cortado antes frena, no autoriza—: es para que los candados
 * ejerzan el corte sin esperar minuto y medio.
 */
const TIEMPO_CLASIFICADOR_MS = 90_000;
const TIEMPO_GIT_IDENTIDAD_MS = 5_000;
function tiempoDelClasificador() {
  const pedido = Number(process.env.GUARDIA_TIEMPO_CLASIFICADOR_MS);
  return Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, TIEMPO_CLASIFICADOR_MS) : TIEMPO_CLASIFICADOR_MS;
}

/** La ruta y el commit de la guardia que está corriendo. Informativo: si git no contesta, lo dice. */
function identidadDeLaGuardia() {
  try {
    const sha = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: TIEMPO_GIT_IDENTIDAD_MS }).trim();
    const cambios = execFileSync(
      "git",
      ["-C", ROOT, "status", "--porcelain", "--", "scripts/hook-guardia-migraciones.mjs", "scripts/clasificar-migraciones.mjs", "lib/deploy", ".claude/settings.json"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: TIEMPO_GIT_IDENTIDAD_MS }
    ).trim();
    return `Guardia efectiva: ${ROOT} en ${sha.slice(0, 12)}${cambios ? ", CON CAMBIOS SIN COMMITEAR en la guardia" : ""}.`;
  } catch {
    return `Guardia efectiva: ${ROOT} (no se pudo leer su commit).`;
  }
}

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
  // El directorio de trabajo de la sesión, que Claude Code manda en el evento:
  // es una de las señales para saber de qué proyecto es un `migrate deploy`.
  let cwd = null;

  // ── UN EVENTO QUE NO SE PUEDE INTERPRETAR NO AUTORIZA NADA DE PRISMA ───────
  //
  // Hasta el 2026-10-08 un evento mal formado —JSON roto, sin `tool_name`, con
  // un `command` que no es texto— recibía `allow`. Claude Code no los manda así
  // (el formato real está comprobado: `tool_input.command` es un string), pero
  // la guardia no puede apoyarse en eso: lo que no pudo leer no lo autoriza. Si
  // el texto crudo nombra prisma, se frena; si no, pasa diciendo que no miró,
  // con la misma red ancha que se usa cuando el módulo no carga.
  const ininterpretable = (motivo) => {
    if (MENCIONA_PRISMA.test(entrada)) {
      responder(
        "deny",
        `FRENADO: la guardia de migraciones no pudo interpretar el evento (${motivo}) y el texto nombra prisma. Lo que no se pudo leer no se autoriza.`,
        "GUARDIA: se frenó un evento ininterpretable que nombra prisma."
      );
    }
    responder("allow", `guardia de migraciones: no se pudo interpretar el evento (${motivo}); no nombra prisma, no se comprobó nada`);
  };
  let evento;
  try {
    evento = JSON.parse(entrada || "{}");
  } catch {
    ininterpretable("el JSON no se pudo leer");
  }
  if (evento === null || typeof evento !== "object" || typeof evento.tool_name !== "string") {
    ininterpretable("no trae tool_name");
  }
  if (evento.tool_name !== "Bash") responder("allow", "");
  if (typeof evento.tool_input?.command !== "string") ininterpretable("tool_input.command no es texto");
  comando = evento.tool_input.command;
  cwd = typeof evento.cwd === "string" ? evento.cwd : null;

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

  // Una copia que no es la del proyecto de la sesión es otra versión, vieja o
  // nueva, que nadie eligió. Para lo que nombra prisma no se la usa.
  if (MENCIONA_PRISMA.test(comando) && esLaCopiaDelProyecto() === false) {
    responder(
      "deny",
      `FRENADO: la guardia que está corriendo (${ROOT}) no es la del proyecto de esta sesión (CLAUDE_PROJECT_DIR=${process.env.CLAUDE_PROJECT_DIR}).\n\n` +
        "Es otra copia —otra versión— y no se decide con ella. Revisá que .claude/settings.json llame al hook por " +
        "\"$CLAUDE_PROJECT_DIR\" y reiniciá la sesión de Claude Code.",
      "GUARDIA: se frenó un comando de prisma porque corrió una copia de la guardia que no es la del proyecto."
    );
  }

  const previa = decidirPorComando(comando, { cwd });
  if (previa.accion !== "clasificar") {
    // Dejan rastro los que pasan avisando: la autorización manual, que pasa sin
    // que nadie haya mirado qué entra, y las recuperaciones tipadas —libro_stock
    // y la activación del Libro de Costos—, que escriben en _prisma_migrations.
    // Cada una con su nombre. El rechazo del
    // db push no hace falta anotarlo, porque frena y por lo tanto se ve.
    if (previa.accion === "allow" && previa.aviso) dejarRastro(comando, previa.rastro);
    responder(previa.accion, previa.razon, previa.aviso);
  }

  const identidad = identidadDeLaGuardia();

  // El clasificador tiene que estar. Si falta, node sale con 1 —el mismo código
  // que "migración marcada"— y el motivo impreso sería falso. Se frena diciendo
  // el motivo real.
  if (!fs.existsSync(CLASIFICADOR)) {
    responder(
      "deny",
      `FRENADO: no existe el clasificador (${CLASIFICADOR}), así que no se puede mirar qué migraciones entran.\n${previa.nota ?? ""}\n${identidad}`,
      "GUARDIA: se frenó una migración porque falta el clasificador."
    );
  }

  const r = spawnSync(process.execPath, [CLASIFICADOR, "--vps"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: tiempoDelClasificador(),
  });

  const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim();

  // Solo un 0 de un clasificador que terminó solo deja pasar. Un timeout, una
  // señal o un error al lanzarlo no son un 0.
  if (r.status === 0 && !r.error && !r.signal) {
    responder(
      "allow",
      `Guardia de migraciones: el clasificador no encontró sentencias marcadas.\n${previa.nota ?? ""}\n${identidad}\n\n${salida}`
    );
  }

  // Un 1 es "migración marcada" solo si el clasificador lo dijo (imprime
  // "FRENO:"); un 1 sin eso es que se cayó antes de clasificar.
  const marcada = r.status === 1 && /^FRENO:/m.test(String(r.stdout ?? ""));
  const encabezado = marcada
    ? "FRENADO: hay al menos una migración que rompería a la versión que está atendiendo tráfico durante la ventana entre migrar y recrear."
    : r.status === 2
      ? "FRENADO: la guardia no pudo determinar qué migraciones entran, así que no puede afirmar que sean compatibles."
      : `FRENADO: el clasificador no terminó bien (código ${r.status ?? "ninguno"}${r.signal ? `, señal ${r.signal}` : ""}${r.error ? `, ${r.error.message}` : ""}), así que no se miró qué migraciones entran.`;

  responder(
    "deny",
    `${encabezado}\n${previa.nota ?? ""}\n${identidad}\n\n${salida}\n\n` +
      "NO continuar por criterio propio. Informarle a Emanuel qué migración es, qué " +
      "sentencia la marcó y por qué rompería a la versión vieja, y esperar su " +
      "confirmación explícita. Si él confirma, el comando se repite con " +
      "DEPLOY_MIGRACION_AUTORIZADA=1 adelante.",
    marcada
      ? "GUARDIA: se frenó una migración que rompería a la versión vieja durante la ventana."
      : "GUARDIA: se frenó una migración porque el clasificador no pudo determinar qué entra."
  );
});
