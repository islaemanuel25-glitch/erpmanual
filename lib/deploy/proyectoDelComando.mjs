// lib/deploy/proyectoDelComando.mjs
//
// ¿A QUÉ PROYECTO LE CORRE ESTE `prisma migrate deploy`?
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// La guardia de migraciones (lib/deploy/guardiaMigraciones.mjs) es un hook de
// ESTE repo y mira cualquier comando Bash que pase por la sesión. Hasta el
// 2026-10-07 trataba todo `migrate deploy` como del ERP: mandaba al clasificador
// a calcular el rango del ERP —desde la imagen que atiende `erpazul_app` hasta
// el HEAD del checkout del ERP— y decidía con eso.
//
// Ese día se desplegó Azul Chat desde una sesión de este repo. Su migración se
// corre con `docker compose ... run azul-chat-app prisma migrate deploy` en
// /srv/produccion/azul-chat. La guardia la tomó por del ERP, calculó el rango
// del ERP (25172fe, que era a la vez la imagen que atendía y el HEAD: rango
// degenerado) y salió INDETERMINADO. Frenó bien —falla cerrado—, pero por un
// motivo que no tenía nada que ver con lo que se estaba migrando: el historial
// y las migraciones del ERP no dicen nada de la base de Azul Chat. La única
// salida fue DEPLOY_MIGRACION_AUTORIZADA=1, que es justo la puerta que no tiene
// que volverse un paso del procedimiento.
//
// ── AZUL CHAT: SOLO LAS FORMAS EXACTAS DEL RUNBOOK ──────────────────────────
//
// La primera versión de esta frontera exigía dos señales —el directorio y el
// servicio— y aceptaba cualquier otra cosa alrededor. La revisión lo rompió con
// argumentos triviales que conservaban las dos señales y cambiaban qué corre:
// `-v=../erpazul/prisma:/app/prisma`, `--entrypoint=sh`,
// `--env=DATABASE_URL=…`, `-eDATABASE_URL=…`, `--schema=…` después del
// comando, o `-f ../erpazul/docker-compose.prod.yml`.
//
// Por eso la exención ya NO se deduce de señales: se reconoce el comando
// ENTERO contra las formas canónicas del runbook de Azul Chat (docs/DEPLOY.md de
// ese repo, paso 3: `$C run --rm --no-deps azul-chat-app prisma migrate deploy`
// con `C="docker compose -f docker-compose.prod.yml"`, parado en el directorio):
//
//   NÚCLEO   docker compose -f <compose> run [--rm] [--no-deps] [-T] azul-chat-app prisma migrate deploy
//
//   con <compose> = `docker-compose.prod.yml` o
//   `/srv/produccion/azul-chat/docker-compose.prod.yml`, las tres opciones a lo
//   sumo una vez cada una y en cualquier orden, un espacio entre palabras, y
//   NADA después de `deploy`. Y una de estas tres envolturas, sin nada más:
//
//   1. cd /srv/produccion/azul-chat && NÚCLEO
//   2. ssh vps-erp 'cd /srv/produccion/azul-chat && NÚCLEO'
//   3. NÚCLEO solo, con la sesión parada en /srv/produccion/azul-chat
//
// No hay un parser de shell: es igualdad contra un patrón anclado de punta a
// punta. Lo que no es exactamente eso —otra opción, una variable adelante, un
// `;`, un pipe, una redirección, `$(…)`, comillas de más, `$C` sin expandir— no
// es Azul Chat.
//
// ── Y LO QUE SE PARECE A AZUL CHAT Y NO ES CANÓNICO SE BLOQUEA ─────────────
//
// No alcanza con negarle la exención y mandarlo al clasificador del ERP: el
// clasificador mira las migraciones del ERP y puede salir con 0, y entonces una
// variante con el destino o las migraciones alteradas pasaría. Así que todo
// `migrate deploy` que tenga ALGUNA señal de Azul Chat —su directorio, su
// servicio, cualquier mención de `azul-chat` en el comando, o la sesión parada
// en una carpeta de Azul Chat— y no sea canónico es AMBIGUO: la guardia lo
// rechaza, también con la autorización manual.
//
// ── EL RESTO NO CAMBIA ──────────────────────────────────────────────────────
//
//   · ERP —directorio y servicio del ERP, ninguna señal de Azul Chat—: la
//     guardia del ERP entera, como siempre.
//   · DESCONOCIDO —sin señales de ningún proyecto—: la guardia del ERP entera,
//     como antes de esta frontera.
//   · AMBIGUO también: señales de los dos proyectos, o más de un
//     `migrate deploy` en el mismo comando.
//
// Todo se lee del TEXTO del comando, con los límites de la guardia entera: un
// envoltorio que esconda el `migrate deploy` (un script, un alias) la esquiva.
// Está en el skill `/deploy`, "Esa guardia NO hace obligatorio el chequeo".

/** Los proyectos que se despliegan en el VPS, con su firma. */
export const PROYECTOS_DEL_VPS = Object.freeze([
  Object.freeze({ id: "ERP", nombre: "ERP Azul", directorio: "/srv/produccion/erpazul", servicio: "app" }),
  Object.freeze({ id: "AZUL_CHAT", nombre: "Azul Chat", directorio: "/srv/produccion/azul-chat", servicio: "azul-chat-app" }),
]);

export const PROYECTO = Object.freeze({ ERP: "ERP", AZUL_CHAT: "AZUL_CHAT", DESCONOCIDO: "DESCONOCIDO", AMBIGUO: "AMBIGUO" });

const [ERP, AZUL_CHAT] = PROYECTOS_DEL_VPS;

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── Las formas canónicas de Azul Chat ───────────────────────────────────────

/** Las únicas opciones de `run` que acepta la exención, cada una a lo sumo una vez. */
export const OPCIONES_RUN_AZUL_CHAT = Object.freeze(["--rm", "--no-deps", "-T"]);

const DIR_AZUL = escapar(AZUL_CHAT.directorio);
const COMPOSE_AZUL = `(?:docker-compose\\.prod\\.yml|${DIR_AZUL}/docker-compose\\.prod\\.yml)`;
const OPCION_AZUL = `(?:${OPCIONES_RUN_AZUL_CHAT.map(escapar).join("|")})`;
const NUCLEO_AZUL = `docker compose -f ${COMPOSE_AZUL} run((?: ${OPCION_AZUL})*) ${escapar(AZUL_CHAT.servicio)} prisma migrate deploy`;

/** Las tres envolturas aceptadas, ancladas de punta a punta. El grupo 1 son las opciones de `run`. */
const FORMAS_AZUL = Object.freeze({
  conCd: new RegExp(`^cd ${DIR_AZUL} && ${NUCLEO_AZUL}$`),
  porSsh: new RegExp(`^ssh vps-erp 'cd ${DIR_AZUL} && ${NUCLEO_AZUL}'$`),
  desdeElDirectorio: new RegExp(`^${NUCLEO_AZUL}$`),
});

/** ¿Las opciones de `run` son de la lista y sin repetir? */
function opcionesValidas(grupo) {
  const opciones = String(grupo ?? "").trim().split(" ").filter(Boolean);
  return opciones.every((o) => OPCIONES_RUN_AZUL_CHAT.includes(o)) && new Set(opciones).size === opciones.length;
}

const normalizarCwd = (cwd) => (cwd ? String(cwd).replace(/\/+$/, "") : null);

/**
 * ¿Es EXACTAMENTE una de las formas canónicas de Azul Chat? Igualdad contra un
 * patrón anclado, no deducción. La tercera forma vale solo con la sesión parada
 * justo en el directorio de despliegue (no en uno de adentro: ahí el `-f`
 * relativo apuntaría a otro archivo).
 */
export function esMigracionCanonicaDeAzulChat(comando, contexto = {}) {
  const cmd = String(comando ?? "").trim();
  for (const [forma, re] of Object.entries(FORMAS_AZUL)) {
    const m = re.exec(cmd);
    if (!m || !opcionesValidas(m[1])) continue;
    if (forma === "desdeElDirectorio" && normalizarCwd(contexto.cwd) !== AZUL_CHAT.directorio) continue;
    return true;
  }
  return false;
}

// ── Las señales, para lo que no es canónico ─────────────────────────────────

/**
 * El directorio como ruta COMPLETA: antes, un borde (inicio, espacio, comilla,
 * `=`, `:` o un separador de shell); después, fin, espacio, comilla, `/`, `;`,
 * `&`, `|` o `)`. Así `/srv/produccion/azul-chat-viejo` o
 * `/srv/produccion/erpazul2` no cuentan como esos directorios.
 */
const firmaDeDirectorio = (dir) => new RegExp(`(?:^|[\\s'"=:;&|(])${escapar(dir)}(?=$|[\\s'"/;&|)])`);

/**
 * Azul Chat mencionado en cualquier lugar: el servicio, el directorio, una
 * carpeta `azul-chat` o `azul_chat`, aun con comillas o barras metidas entre
 * las dos palabras. Es a propósito más ancho que la firma: sirve para BLOQUEAR,
 * no para eximir, así que pasarse de largo cuesta un rechazo y quedarse corto
 * mandaría al clasificador del ERP algo que no es del ERP.
 */
const MENCIONA_AZUL_CHAT = /azul[\W_]*chat/i;

/** `run [opciones] <servicio> [npx] prisma[@versión] migrate deploy`: el servicio que migra. */
const SERVICIO_QUE_MIGRA = /\brun\b(?:\s+-[^\s]+)*\s+([A-Za-z0-9][\w.-]*)\s+(?:npx\s+)?prisma(?:@[\w.-]+)?\s+migrate\s+deploy\b/g;
const MIGRATE_DEPLOY = /\bmigrate\s+deploy\b/g;

/** `ssh` como comando: lo que sigue corre en otra máquina. */
const VA_POR_SSH = /(?:^|[\s;&|(])ssh\s/;

/** El directorio de trabajo de la sesión, si está en el de un proyecto (o adentro) y el comando no va por `ssh`. */
function proyectoPorCwd(cwd, cmd) {
  const c = normalizarCwd(cwd);
  if (!c || VA_POR_SSH.test(cmd)) return null;
  return PROYECTOS_DEL_VPS.find((p) => c === p.directorio || c.startsWith(`${p.directorio}/`)) ?? null;
}

const FORMA_CANONICA =
  "las formas aceptadas son `cd /srv/produccion/azul-chat && docker compose -f docker-compose.prod.yml run --rm --no-deps azul-chat-app prisma migrate deploy`, " +
  "la misma adentro de `ssh vps-erp '…'`, o el comando sin el `cd` con la sesión parada en /srv/produccion/azul-chat; " +
  "las únicas opciones de `run` son --rm, --no-deps y -T, y nada después de `deploy`";

/**
 * El proyecto de un comando que corre `prisma migrate deploy`.
 *
 * `contexto.cwd` es el directorio de trabajo de la sesión (el que manda Claude
 * Code en el evento del hook).
 *
 * Devuelve `{ proyecto, motivo }`, con `proyecto` uno de `PROYECTO`. Un comando
 * sin `migrate deploy` no es asunto de esta función: devuelve DESCONOCIDO.
 */
export function identificarProyecto(comando, contexto = {}) {
  const cmd = String(comando ?? "");
  const despliegues = cmd.match(MIGRATE_DEPLOY)?.length ?? 0;
  if (despliegues === 0) return { proyecto: PROYECTO.DESCONOCIDO, motivo: "el comando no corre `migrate deploy`" };
  if (despliegues > 1) return { proyecto: PROYECTO.AMBIGUO, motivo: "hay más de un `migrate deploy` en el mismo comando" };

  if (esMigracionCanonicaDeAzulChat(cmd, contexto)) {
    return { proyecto: PROYECTO.AZUL_CHAT, motivo: "es exactamente una de las formas del runbook de Azul Chat" };
  }

  const nombrados = PROYECTOS_DEL_VPS.filter((p) => firmaDeDirectorio(p.directorio).test(cmd));
  if (nombrados.length > 1) {
    return { proyecto: PROYECTO.AMBIGUO, motivo: `el comando nombra los directorios de ${nombrados.map((p) => p.nombre).join(" y ")}` };
  }
  const porCwd = nombrados.length === 0 ? proyectoPorCwd(contexto.cwd, cmd) : null;
  const dir = nombrados[0] ?? porCwd;

  // Cualquier señal de Azul Chat sin la forma canónica: se bloquea. No se manda
  // al clasificador del ERP, que podría salir con 0 sobre algo que no mira. La
  // sesión parada en una carpeta de Azul Chat cuenta igual que el directorio,
  // con la misma condición: que el comando no nombre otro y no vaya por ssh.
  const cwdDeAzul = nombrados.length === 0 && !VA_POR_SSH.test(cmd) && MENCIONA_AZUL_CHAT.test(normalizarCwd(contexto.cwd) ?? "");
  if (dir === AZUL_CHAT || cwdDeAzul || MENCIONA_AZUL_CHAT.test(cmd)) {
    return { proyecto: PROYECTO.AMBIGUO, motivo: `tiene señales de Azul Chat pero no es exactamente una forma del runbook (${FORMA_CANONICA})` };
  }

  const servicio = [...cmd.matchAll(SERVICIO_QUE_MIGRA)].map((m) => m[1])[0] ?? null;
  if (dir === ERP && servicio === ERP.servicio) {
    return { proyecto: PROYECTO.ERP, motivo: `${porCwd ? "directorio de trabajo" : "directorio"} ${ERP.directorio} y servicio ${ERP.servicio}, los dos de ${ERP.nombre}` };
  }
  const falta =
    !dir && !servicio
      ? "no nombra el directorio de despliegue ni el servicio que migra"
      : !dir
        ? "no nombra el directorio de despliegue"
        : servicio
          ? `el servicio \`${servicio}\` no es de ningún proyecto conocido`
          : "no se ve qué servicio de Compose migra";
  return { proyecto: PROYECTO.DESCONOCIDO, motivo: falta };
}
