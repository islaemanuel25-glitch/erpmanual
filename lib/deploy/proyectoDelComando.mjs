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
// ── CÓMO SE IDENTIFICA UN PROYECTO ──────────────────────────────────────────
//
// Por DOS señales independientes del propio comando, que tienen que coincidir:
//
//   · el directorio de despliegue, nombrado como ruta absoluta y completa
//     (`/srv/produccion/erpazul`, `/srv/produccion/azul-chat`): en un `cd`, en
//     `-f <dir>/docker-compose.prod.yml` o en `--project-directory`; y si el
//     comando no nombra ninguno y no va por `ssh`, el directorio de trabajo de
//     la sesión;
//   · el servicio de Compose que corre el `prisma migrate deploy` (`app` en el
//     ERP, `azul-chat-app` en Azul Chat).
//
// No alcanza con una sola, y no se mira el nombre de una carpeta suelta, el
// hostname ni el `ssh`: los dos proyectos viven en el mismo VPS.
//
// ── QUÉ SE HACE CON CADA RESULTADO (lo decide guardiaMigraciones.mjs) ───────
//
//   · AZUL_CHAT, con las dos señales de Azul Chat y ninguna del ERP: la guardia
//     del ERP NO lo clasifica, porque su rango no dice nada de esa base. Pasa
//     avisando y deja rastro. Azul Chat tiene sus controles propios.
//   · ERP: la guardia del ERP entera, como siempre.
//   · DESCONOCIDO —falta una señal, o el servicio no es ninguno de los
//     conocidos—: la guardia del ERP entera, como siempre. Lo desconocido NO se
//     asume de otro proyecto: la exención exige identificación positiva.
//   · AMBIGUO —señales de los dos proyectos, o que se contradicen, o más de un
//     `migrate deploy` en la línea—: se rechaza, con o sin autorización manual.
//
// Las señales se leen del TEXTO del comando, con los mismos límites que la
// guardia entera: un envoltorio que esconda el comando la esquiva (está en el
// skill `/deploy`, "Esa guardia NO hace obligatorio el chequeo").

/** Los proyectos que se despliegan en el VPS, con su firma. */
export const PROYECTOS_DEL_VPS = Object.freeze([
  Object.freeze({ id: "ERP", nombre: "ERP Azul", directorio: "/srv/produccion/erpazul", servicio: "app" }),
  Object.freeze({ id: "AZUL_CHAT", nombre: "Azul Chat", directorio: "/srv/produccion/azul-chat", servicio: "azul-chat-app" }),
]);

export const PROYECTO = Object.freeze({ ERP: "ERP", AZUL_CHAT: "AZUL_CHAT", DESCONOCIDO: "DESCONOCIDO", AMBIGUO: "AMBIGUO" });

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * El directorio como ruta COMPLETA: antes, un borde (inicio, espacio, comilla,
 * `=`, `:` o un separador de shell); después, fin, espacio, comilla, `/`, `;`,
 * `&`, `|` o `)`. Así `/srv/produccion/azul-chat-viejo` o
 * `/srv/produccion/erpazul2` no cuentan, y `x/srv/produccion/erpazul` tampoco.
 */
const firmaDeDirectorio = (dir) => new RegExp(`(?:^|[\\s'"=:;&|(])${escapar(dir)}(?=$|[\\s'"/;&|)])`);

/** `run [opciones] <servicio> [npx] prisma[@versión] migrate deploy`: el servicio que migra. */
const SERVICIO_QUE_MIGRA = /\brun\b(?:\s+-[^\s]+)*\s+([A-Za-z0-9][\w.-]*)\s+(?:npx\s+)?prisma(?:@[\w.-]+)?\s+migrate\s+deploy\b/g;
const MIGRATE_DEPLOY = /\bmigrate\s+deploy\b/g;

/** `ssh` como comando: lo que sigue corre en otra máquina. */
const VA_POR_SSH = /(?:^|[\s;&|(])ssh\s/;

/**
 * El directorio de trabajo de la sesión como señal, cuando el comando no nombra
 * ninguno: en Claude Code el `cd` de un comando persiste en los siguientes, y el
 * runbook de Azul Chat hace el `cd` en una línea y migra en otra. Vale solo si
 * es el directorio de despliegue o uno de adentro, y solo si el comando NO va
 * por `ssh`: ahí el directorio local no dice nada de dónde corre.
 */
function proyectoPorCwd(cwd, cmd) {
  if (!cwd || VA_POR_SSH.test(cmd)) return null;
  const c = String(cwd).replace(/\/+$/, "");
  return PROYECTOS_DEL_VPS.find((p) => c === p.directorio || c.startsWith(`${p.directorio}/`)) ?? null;
}

/**
 * El proyecto de un comando que corre `prisma migrate deploy`.
 *
 * `contexto.cwd` es el directorio de trabajo de la sesión (el que manda Claude
 * Code en el evento del hook); se usa solo si el comando no nombra directorio.
 *
 * Devuelve `{ proyecto, motivo }`, con `proyecto` uno de `PROYECTO`. Un comando
 * sin `migrate deploy` no es asunto de esta función: devuelve DESCONOCIDO.
 */
export function identificarProyecto(comando, contexto = {}) {
  const cmd = String(comando ?? "");
  const despliegues = cmd.match(MIGRATE_DEPLOY)?.length ?? 0;
  if (despliegues === 0) return { proyecto: PROYECTO.DESCONOCIDO, motivo: "el comando no corre `migrate deploy`" };
  if (despliegues > 1) return { proyecto: PROYECTO.AMBIGUO, motivo: "hay más de un `migrate deploy` en el mismo comando" };

  const nombrados = PROYECTOS_DEL_VPS.filter((p) => firmaDeDirectorio(p.directorio).test(cmd));
  const porCwd = nombrados.length === 0 ? proyectoPorCwd(contexto.cwd, cmd) : null;
  const porDirectorio = porCwd ? [porCwd] : nombrados;
  if (porDirectorio.length > 1) {
    return { proyecto: PROYECTO.AMBIGUO, motivo: `el comando nombra los directorios de ${porDirectorio.map((p) => p.nombre).join(" y ")}` };
  }

  const servicios = [...cmd.matchAll(SERVICIO_QUE_MIGRA)].map((m) => m[1]);
  const servicio = servicios[0] ?? null;
  const porServicio = PROYECTOS_DEL_VPS.find((p) => p.servicio === servicio) ?? null;
  const dir = porDirectorio[0] ?? null;

  if (dir && porServicio && dir !== porServicio) {
    return { proyecto: PROYECTO.AMBIGUO, motivo: `el directorio es de ${dir.nombre} y el servicio que migra es de ${porServicio.nombre}` };
  }
  if (dir && porServicio) {
    const deDonde = porCwd ? "directorio de trabajo" : "directorio";
    return { proyecto: dir.id, motivo: `${deDonde} ${dir.directorio} y servicio ${porServicio.servicio}, los dos de ${dir.nombre}` };
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
