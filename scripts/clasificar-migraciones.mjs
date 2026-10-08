// scripts/clasificar-migraciones.mjs
//
// FRENA UN DESPLIEGUE cuyas migraciones romperían a la versión que sigue
// atendiendo tráfico.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El despliegue aplica las migraciones con un contenedor descartable de la
// imagen NUEVA y recién después recrea la app. Entre esos dos pasos el esquema
// ya es el nuevo y el código que corre todavía es el viejo. Son segundos, pero
// hay tráfico real: una columna borrada ahí es un 500 por cada pedido que la
// seleccione.
//
// La regla es que toda migración que pase por el flujo normal sea compatible
// hacia atrás durante esa ventana. Lo que se creía —"todas las migraciones de
// este repo son aditivas"— es FALSO: de 81, catorce tienen sentencias
// destructivas y se desplegaron así igual. No rompió nada, pero eso es poco
// tráfico y suerte, no una garantía. De ahí que la regla necesite un candado y
// no un párrafo.
//
// ── QUÉ HACE Y QUÉ NO ───────────────────────────────────────────────────────
//
// Mira TEXTO. Busca patrones conocidos y marca lo que coincide. No entiende SQL
// y no pretende entenderlo: no hay un parser acá y no se va a agregar uno para
// esto. Su trabajo es FRENAR, no autorizar. Que salga con 0 no dice que el
// despliegue sea compatible: dice que no encontró ninguna de las palabras que
// sabe buscar. Eso lo imprime el propio script al salir bien, para que no haya
// que ir a leer un documento para enterarse.
//
// ── FALLA CERRADO ───────────────────────────────────────────────────────────
//
// Si no puede determinar el rango —no llega al VPS, el ssh falla, el SHA no
// existe, el directorio no está donde espera— sale con 2 y dice por qué. Nunca
// pasa por no haber podido mirar: un chequeo que se rinde en silencio es peor
// que no tenerlo, porque el que despliega cree que pasó.
//
// ── USO ─────────────────────────────────────────────────────────────────────
//
//   node scripts/clasificar-migraciones.mjs --vps [--hasta <SHA>] [--repo <ruta absoluta>]
//       El modo del despliegue. El ORIGEN es el SHA de la IMAGEN QUE ESTÁ
//       ATENDIENDO —no el HEAD de git del VPS, que el paso 1 ya movió—. El
//       DESTINO y el REPOSITORIO dependen de dónde corre (ver "LOS TRES DATOS DEL
//       RANGO", más abajo).
//
//   node scripts/clasificar-migraciones.mjs --desde <SHA> [--hasta <SHA>] [--repo <ruta absoluta>]
//       El mismo análisis con el origen dado a mano. `--hasta` es el HEAD del
//       repositorio por default.
//
//   node scripts/clasificar-migraciones.mjs --dir <ruta>
//       Clasifica todos los migration.sql que haya bajo esa ruta, sin git. Es
//       el modo que usan los candados contra las fixtures.
//
// ── LOS TRES DATOS DEL RANGO, Y DE DÓNDE SALE CADA UNO ──────────────────────
//
// Hasta el 2026-10-08 el repositorio era siempre el árbol donde vive este
// script. En el VPS eso es el clon de trabajo desde el que corre Claude Code
// —no /srv/produccion/erpazul—, y ese clon puede estar atrasado: el SHA que
// atiende no estaba en su historial, el rango salía INDETERMINADO aunque el SHA
// fuera válido en el checkout de producción, y el DESTINO era el HEAD de ese
// clon, que no tiene por qué ser lo que se está desplegando.
//
// Ahora el directorio desde el que se ejecuta y el repositorio que se consulta
// son dos cosas separadas, y los tres datos se resuelven explícitos:
//
//   ORIGEN        la imagen que atiende `erpazul_app` (o `--desde`).
//   DESTINO       en el VPS con `--vps`: la imagen a la que apunta `APP_IMAGE`
//                 en /srv/produccion/erpazul/.env, que es la que usa el
//                 contenedor descartable de `migrate deploy` (el paso 2 la
//                 apunta antes de migrar). Fuera del VPS: el HEAD del
//                 repositorio. `--hasta` manda sobre los dos.
//   REPOSITORIO   en el VPS con `--vps`: /srv/produccion/erpazul. Fuera del VPS,
//                 o sin `--vps`: este árbol. `--repo` manda sobre los dos.
//
// Todo git corre con `-C <repositorio>`, nunca sobre el directorio actual, y
// las migraciones se leen DEL COMMIT DESTINO (`git show`), no del árbol de
// trabajo: el árbol puede estar en otro commit o tener cambios sin commitear,
// y lo que se aplica es lo que trae la imagen del destino.
//
// El repositorio se valida antes de usarlo: tiene que existir, ser la raíz de
// un repo git, y los dos commits tienen que estar en su historial con un
// package.json que se llame "erpmanual" y un prisma/migrations. Si algo de eso
// falla, INDETERMINADO: nunca se adivina otro repositorio.
//
// ── CÓDIGOS DE SALIDA ───────────────────────────────────────────────────────
//
//   0  no encontró nada de lo que sabe buscar        (NO es una autorización)
//   1  encontró al menos una sentencia marcada       (el despliegue se frena)
//   2  no pudo determinar el rango o leer los archivos (falla cerrado)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const ALIAS_VPS = "vps-erp";
const CONTENEDOR_APP = "erpazul_app";

export const SALIDA = { LIMPIO: 0, MARCADO: 1, INDETERMINADO: 2 };

/**
 * Los patrones, con el motivo por el que cada uno rompe a la versión vieja.
 *
 * El motivo no es decoración: es lo que la persona necesita leer para decidir
 * si confirma. "DROP COLUMN" sin más obliga a ir a buscar por qué importa.
 */
export const PATRONES = [
  {
    nombre: "DROP COLUMN",
    re: /\bDROP\s+COLUMN\b/i,
    motivo: "la versión vieja sigue seleccionando esa columna: cada consulta que la nombre falla",
  },
  {
    nombre: "DROP TABLE",
    re: /\bDROP\s+TABLE\b/i,
    motivo: "la versión vieja sigue consultando esa tabla",
  },
  {
    nombre: "DROP CONSTRAINT",
    re: /\bDROP\s+CONSTRAINT\b/i,
    motivo: "puede sacar una foreign key o un unique del que la versión vieja depende",
  },
  {
    nombre: "DROP INDEX",
    re: /\bDROP\s+INDEX\b/i,
    motivo: "degrada consultas de la versión vieja, y si era único deja entrar duplicados",
  },
  {
    nombre: "DROP TYPE",
    re: /\bDROP\s+TYPE\b/i,
    motivo: "la versión vieja sigue escribiendo valores de ese tipo",
  },
  {
    nombre: "RENAME",
    re: /\bRENAME\s+(COLUMN|TO|VALUE|CONSTRAINT)\b/i,
    motivo: "renombrar es borrar y crear a la vez: la versión vieja busca el nombre anterior",
  },
  {
    nombre: "SET NOT NULL",
    re: /\bSET\s+NOT\s+NULL\b/i,
    motivo: "la versión vieja inserta sin ese campo y el INSERT pasa a fallar",
  },
  {
    nombre: "ADD COLUMN NOT NULL sin DEFAULT",
    re: /\bADD\s+COLUMN\b[^;]*\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)/i,
    motivo: "la versión vieja no manda ese campo y no hay default que la cubra",
  },
  {
    nombre: "cambio de tipo de columna",
    re: /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
    motivo: "un tipo más angosto trunca o rechaza lo que la versión vieja escribe",
  },
  {
    nombre: "DROP DEFAULT",
    re: /\bDROP\s+DEFAULT\b/i,
    motivo: "la versión vieja contaba con ese default para no mandar el campo",
  },
  {
    nombre: "TRUNCATE",
    re: /\bTRUNCATE\b/i,
    motivo: "borra datos en producción; no es una migración de esquema",
  },
  {
    nombre: "DELETE FROM",
    re: /\bDELETE\s+FROM\b/i,
    motivo: "paso de datos destructivo dentro de una migración de esquema",
  },
  {
    nombre: "UPDATE de datos",
    re: /^\s*UPDATE\s+/im,
    motivo: "reescribe filas existentes; hay que mirar si la versión vieja las lee mientras tanto",
  },
];

/**
 * Saca comentarios antes de buscar.
 *
 * Sin esto, una migración que EXPLICA en un comentario por qué NO borra la
 * columna queda marcada por su propia explicación. Reemplaza por espacios y no
 * por vacío para no pegar dos palabras que estaban separadas por un comentario.
 */
export function sinComentarios(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Qué patrones marca un texto SQL, con la línea que los disparó. */
export function clasificarSql(sql) {
  const limpio = sinComentarios(sql);
  const lineas = limpio.split(/\r?\n/);
  const hallazgos = [];
  for (const p of PATRONES) {
    // El patrón se prueba contra el archivo entero porque hay sentencias que
    // ocupan varias líneas —un ADD COLUMN ... NOT NULL se parte seguido—, y
    // después se busca la línea para poder mostrarla.
    if (!p.re.test(limpio)) continue;
    const reLinea = new RegExp(p.re.source, p.re.flags.replace(/[gm]/g, ""));
    const i = lineas.findIndex((l) => reLinea.test(l));
    hallazgos.push({
      patron: p.nombre,
      motivo: p.motivo,
      linea: i >= 0 ? i + 1 : null,
      texto: i >= 0 ? lineas[i].trim() : "(la sentencia ocupa varias líneas)",
    });
  }
  return hallazgos;
}

class Indeterminado extends Error {}

function correr(programa, argumentos, comoFalla) {
  try {
    return execFileSync(programa, argumentos, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch (e) {
    const detalle = (e.stderr || e.message || "").toString().trim().split("\n")[0];
    throw new Indeterminado(`${comoFalla}: ${detalle}`);
  }
}

/**
 * EL SHA QUE ESTÁ ATENDIENDO, sacado de la imagen del contenedor vivo.
 *
 * ── POR QUÉ NO EL HEAD DE GIT DEL VPS, QUE ES LO QUE PREGUNTABA ANTES ──────
 *
 * El paso 1 del despliegue hace `git merge --ff-only` en el VPS, así que para
 * cuando corre `migrate deploy` —paso 4— ese HEAD ya es el SHA NUEVO. El
 * clasificador comparaba el árbol contra sí mismo, salía INDETERMINADO por rango
 * degenerado, y la guardia frenaba.
 *
 * Eso pasa en TODOS los despliegues, traigan migraciones o no. Y ahí está el
 * daño real, que no es la molestia: si la única salida es
 * `DEPLOY_MIGRACION_AUTORIZADA=1`, la autorización manual deja de ser la
 * excepción y se vuelve un paso más del procedimiento. **Una puerta que se abre
 * en todos los despliegues no es una puerta.** Dos autorizaciones seguidas el
 * 2026-08-13 fueron el aviso.
 *
 * La imagen del contenedor que atiende NO la mueve el paso 1: la mueve el paso
 * 5, que es el que recrea la app, y para entonces la ventana ya se cerró. Es
 * además el dato semánticamente correcto: lo que importa durante la ventana es
 * qué CÓDIGO está sirviendo pedidos, no qué commit tiene checkouteado el repo
 * del servidor. Los dos coinciden casi siempre; el casi es este caso.
 *
 * Y es el mismo SHA que el procedimiento ya anota como referencia de rollback en
 * el paso 2, así que no hay un dato nuevo que mantener.
 *
 * Si el ssh falla, si el contenedor no está, o si la etiqueta no es un SHA de 40
 * —`latest`, una imagen construida a mano— no se adivina: INDETERMINADO.
 *
 * ── Y DESDE ADENTRO DEL VPS NO HAY SSH, QUE ES LA OTRA MITAD ───────────────
 *
 * `vps-erp` es un alias del ssh de la máquina de trabajo. Corriendo EN el
 * servidor no existe, así que este chequeo salía INDETERMINADO por "Could not
 * resolve hostname" — no porque no pudiera decidir, sino porque se estaba
 * preguntando por teléfono algo que tenía al lado.
 *
 * Y es exactamente el mismo daño que el párrafo de arriba describe: frena TODOS
 * los despliegues hechos desde el servidor y la única salida vuelve a ser la
 * autorización manual. La puerta que se abre siempre, otra vez, por otra causa.
 * Encontrado el 2026-09-15, desplegando desde el VPS.
 *
 * Por eso ahora mira primero si el contenedor está acá. La condición no es
 * "¿hay docker?" —una máquina de desarrollo también tiene, y puede tener un
 * contenedor con el mismo nombre— sino **si en esta máquina vive el directorio
 * de despliegue**. Esa es la firma del servidor de producción y de ningún otro
 * lado, así que no hay forma de leer por error la imagen de un docker local.
 */
const DIR_DESPLIEGUE = "/srv/produccion/erpazul";

/** ¿Esta máquina ES el servidor de producción? */
function estamosEnElVps() {
  return (
    fs.existsSync(DIR_DESPLIEGUE) &&
    fs.existsSync(path.join(DIR_DESPLIEGUE, "docker-compose.prod.yml"))
  );
}

function shaQueAtiende() {
  const etiqueta = estamosEnElVps()
    ? correr(
        "docker",
        ["inspect", CONTENEDOR_APP, "--format", "{{.Config.Image}}"],
        `no se pudo leer la imagen del contenedor ${CONTENEDOR_APP} con el docker local`
      )
    : correr(
        "ssh",
        [
          "-o", "ConnectTimeout=20", "-o", "BatchMode=yes", ALIAS_VPS,
          `docker inspect ${CONTENEDOR_APP} --format '{{.Config.Image}}'`,
        ],
        `no se pudo leer la imagen del contenedor ${CONTENEDOR_APP} por ssh`
      );
  return shaDeLaEtiqueta(etiqueta);
}

/**
 * El SHA de 40 que lleva una etiqueta de imagen, o INDETERMINADO.
 *
 * Aparte para poder ejercerlo sin ssh. Una etiqueta móvil —`latest`— no sirve
 * como base: apunta a lo último que se construyó y mañana señala otra cosa, que
 * es la misma razón por la que producción despliega solo por SHA completo.
 */
export function shaDeLaEtiqueta(etiqueta) {
  const m = /:([0-9a-f]{40})\s*$/i.exec(String(etiqueta ?? "").trim());
  if (!m) {
    throw new Indeterminado(
      `la imagen que atiende no está etiquetada con un SHA de 40: ${JSON.stringify(String(etiqueta ?? "").slice(0, 80))}.\n\n` +
        "Sin saber qué código está sirviendo pedidos no se puede decir qué introduce\n" +
        "este despliegue por encima. Si la imagen se etiquetó a mano o con `latest`,\n" +
        "pasá el SHA previo con --desde <SHA>."
    );
  }
  return m[1].toLowerCase();
}

/**
 * EL DESTINO EN EL VPS: la imagen a la que apunta `APP_IMAGE`.
 *
 * Es la imagen del contenedor descartable que corre `migrate deploy` —el paso 2
 * del despliegue la apunta antes de migrar—, así que es exactamente lo que se
 * va a aplicar. Se lee SOLO esa línea del .env y no se imprime nada más: el
 * archivo tiene secretos. Si no hay una línea `APP_IMAGE` con un SHA de 40, no
 * se adivina: INDETERMINADO.
 */
export function shaDelAppImage(dirDespliegue) {
  let texto;
  try {
    texto = fs.readFileSync(path.join(dirDespliegue, ".env"), "utf8");
  } catch {
    throw new Indeterminado(`no se pudo leer ${path.join(dirDespliegue, ".env")} para saber a qué imagen apunta APP_IMAGE`);
  }
  const lineas = texto.split(/\r?\n/).filter((l) => /^\s*(?:export\s+)?APP_IMAGE\s*=/.test(l));
  if (lineas.length !== 1) {
    throw new Indeterminado(
      `${path.join(dirDespliegue, ".env")} tiene ${lineas.length} líneas APP_IMAGE y tiene que tener exactamente una: no se sabe qué imagen va a migrar`
    );
  }
  const valor = lineas[0].replace(/^\s*(?:export\s+)?APP_IMAGE\s*=\s*/, "").trim().replace(/^(["'])(.*)\1$/, "$2");
  const m = /:([0-9a-f]{40})$/i.exec(valor);
  if (!m) {
    throw new Indeterminado(
      "APP_IMAGE no apunta a una imagen etiquetada con un SHA de 40, así que no se sabe qué migraciones\n" +
        "trae la imagen que va a migrar. El paso 2 del despliegue la apunta al SHA completo antes de migrar."
    );
  }
  return m[1].toLowerCase();
}

/**
 * LA IMAGEN QUE VA A MIGRAR, y no solo la que dice el .env.
 *
 * docker compose interpola `${APP_IMAGE}` con la variable del ENTORNO antes que
 * con la del .env. Si el entorno la define y no coincide, el contenedor de
 * `migrate deploy` sale de otra imagen que la que se clasificó: INDETERMINADO.
 * Definida y vacía también cuenta: el `:-erpazul-app` del compose pasaría a la
 * imagen del build local de emergencia.
 *
 * Lo que esto NO ve está escrito en el skill `/deploy`: una variable que el
 * shell del comando agrega después (un `export` del perfil, un `APP_IMAGE=`
 * delante del comando) y que una etiqueta no prueba el contenido de la imagen.
 */
export function shaDeLaImagenAMigrar(dirDespliegue, entorno = process.env) {
  const delArchivo = shaDelAppImage(dirDespliegue);
  if (Object.prototype.hasOwnProperty.call(entorno, "APP_IMAGE")) {
    const m = /:([0-9a-f]{40})$/i.exec(String(entorno.APP_IMAGE ?? "").trim());
    if (!m || m[1].toLowerCase() !== delArchivo) {
      throw new Indeterminado(
        "APP_IMAGE está definida en el entorno y no coincide con la del .env de producción.\n" +
          "docker compose usa la del entorno, así que la imagen que migraría no es la que se\n" +
          "clasificaría. Sacala del entorno o hacé que coincidan."
      );
    }
  }
  return delArchivo;
}

/**
 * QUÉ REPOSITORIO, QUÉ ORIGEN Y QUÉ DESTINO — sin efectos, para poder probarlo.
 *
 * `modoVps` es el modo del despliegue (`--vps`); `enVps`, si esta máquina es el
 * servidor de producción. Lo explícito (`--repo`, `--desde`, `--hasta`) manda.
 */
export function planDeResolucion({ modoVps, enVps, repo, desde, hasta, raiz, dirDespliegue }) {
  const enElServidor = Boolean(modoVps && enVps);
  return {
    repo: repo ?? (enElServidor ? dirDespliegue : raiz),
    origen: desde ? { tipo: "explicito", valor: desde } : { tipo: "imagen-que-atiende" },
    destino: hasta
      ? { tipo: "explicito", valor: hasta }
      : enElServidor
        ? { tipo: "app-image", dir: dirDespliegue }
        : { tipo: "head" },
  };
}

/** Git sobre un repositorio DADO. Nunca sobre el directorio actual. */
function git(repo, argumentos, comoFalla) {
  return correr("git", ["-C", repo, ...argumentos], comoFalla);
}

/**
 * ¿Este directorio es la raíz de un repositorio git? Si no, INDETERMINADO.
 *
 * Que sea la RAÍZ importa: `git -C` dentro de una carpeta de otro repo (un
 * `/srv/produccion/erpazul` borrado adentro de un repo más grande, por ejemplo)
 * contestaría por el repo de arriba.
 */
export function validarRepositorio(repo) {
  if (!repo || !path.isAbsolute(repo)) {
    throw new Indeterminado(`el repositorio tiene que ser una ruta absoluta, y llegó ${JSON.stringify(repo)}: no se resuelve contra el directorio actual`);
  }
  if (!fs.existsSync(repo)) {
    throw new Indeterminado(`no existe ${repo}: no es el repo del ERP, y no se busca otro`);
  }
  const top = git(repo, ["rev-parse", "--show-toplevel"], `${repo} no es un repositorio git: no es el repo del ERP`);
  if (fs.realpathSync(top) !== fs.realpathSync(repo)) {
    throw new Indeterminado(`${repo} no es la raíz de un repositorio git (la raíz es ${top}): no es el repo del ERP`);
  }
}

/** El commit existe en el repositorio, es del ERP y trae prisma/migrations. Devuelve el SHA completo. */
function commitDelErp(repo, ref, rol) {
  const sha = git(
    repo,
    ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    `el SHA de ${rol} no existe en ${repo} (${ref}). Si es el clon equivocado o está atrasado, no se adivina otro`
  );
  let nombre;
  try {
    nombre = JSON.parse(git(repo, ["show", `${sha}:package.json`], "sin package.json"))?.name;
  } catch {
    nombre = undefined;
  }
  if (nombre !== NOMBRE_DEL_PAQUETE_ERP) {
    throw new Indeterminado(`en ${repo}, el commit de ${rol} (${sha.slice(0, 12)}) no es del repo del ERP: su package.json no se llama "${NOMBRE_DEL_PAQUETE_ERP}"`);
  }
  git(repo, ["cat-file", "-e", `${sha}:prisma/migrations`], `en ${repo}, el commit de ${rol} (${sha.slice(0, 12)}) no tiene prisma/migrations`);
  return sha;
}

/** Los migration.sql que `hasta` introduce por encima de `desde`, en ese repositorio. */
function migracionesDelRango(repo, desde, hasta) {
  const salida = git(
    repo,
    ["diff", "--no-ext-diff", "--name-only", "--diff-filter=ACMR", `${desde}..${hasta}`, "--", "prisma/migrations"],
    "git diff falló al calcular el rango"
  );
  return salida
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.endsWith("migration.sql"));
}

/** El contenido de una migración COMO ESTÁ EN EL COMMIT DESTINO, no como esté el árbol de trabajo. */
function leerDelCommit(repo, sha, rel) {
  return git(repo, ["show", `${sha}:${rel}`], `no se pudo leer ${rel} del commit ${sha.slice(0, 12)}`);
}

/** Todos los migration.sql bajo una ruta. Modo sin git, para las fixtures. */
function migracionesDelDirectorio(dir) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(abs)) throw new Indeterminado(`el directorio no existe: ${abs}`);
  const encontradas = [];
  const recorrer = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.name === "migration.sql") encontradas.push(path.relative(ROOT, p).replace(/\\/g, "/"));
    }
  };
  recorrer(abs);
  return encontradas;
}

/** Lector del modo `--dir`, el único que lee del disco. Los modos con rango leen del commit. */
function leer(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    throw new Indeterminado(`la migración se listó pero no está en el disco: ${rel}`);
  }
  return fs.readFileSync(abs, "utf8");
}

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
};
const flag = (n) => process.argv.includes(`--${n}`);

/**
 * EL TERCER PUNTO CIEGO: el rango degenerado.
 *
 * Si la base y el extremo son el MISMO commit, `git diff base..hasta` no
 * devuelve nada — y eso se imprime igual que "este despliegue no trae
 * migraciones". Son cosas opuestas y se ven idénticas.
 *
 * Pasa de una forma concreta y no rebuscada: el procedimiento de despliegue
 * hacía `git merge --ff-only` en el VPS ANTES de correr el clasificador, así
 * que para cuando el script preguntaba "¿en qué SHA está el VPS?", el VPS ya
 * estaba en el SHA nuevo. Comparaba el árbol contra sí mismo. Ocurrió el
 * 2026-08-11, en un despliegue que sí traía una migración de datos: el
 * clasificador informó "Archivos a mirar: 0" y la guardia automática, que corre
 * este mismo script, tampoco frenó nada.
 *
 * **Desde el 2026-08-13 la base sale de la imagen que atiende y no del HEAD de
 * git**, así que ese caso concreto ya no ocurre en un despliegue normal. Este
 * chequeo se queda igual: sigue cubriendo `--desde` mal pasado, y un contenedor
 * recreado antes de tiempo. Lo que dejó de pasar es que saltara SIEMPRE.
 *
 * Es el TERCER caso en que "0 archivos" no significa lo que parece:
 *   1. La migración está escrita pero sin commitear — el rango se calcula con
 *      `git diff`, y lo que no está en un commit no aparece.
 *   2. El directorio de migraciones no está donde el script cree — cubierto
 *      arriba con el `existsSync`.
 *   3. El rango es degenerado — esto.
 *
 * Los tres terminan igual: un cero tranquilizador sobre un despliegue que sí
 * trae migraciones. Por eso este caso NO sale con 0: sale con INDETERMINADO,
 * que es como falla el resto del script cuando no pudo mirar.
 */
export function esRangoDegenerado(shaBase, shaHasta) {
  if (!shaBase || !shaHasta) return false;
  return String(shaBase).trim() === String(shaHasta).trim();
}

/**
 * ¿ES EL REPO DEL ERP?
 *
 * Los modos `--vps` y `--desde` comparan contra un SHA del ERP —el de la imagen
 * que atiende `erpazul_app`, o uno dado a mano— y leen `prisma/migrations`. Eso
 * solo tiene sentido en el repo del ERP: en otro (Azul Chat, una copia del
 * script) el SHA no está en el historial o, peor, las migraciones que se
 * clasifican son de otra base. Por eso se exige la identidad declarada del
 * paquete (`"name": "erpmanual"`) y el directorio de migraciones, y si no
 * coinciden se sale INDETERMINADO en vez de clasificar algo ajeno.
 *
 * Desde el 2026-10-08 se mira EN CADA COMMIT del rango (`commitDelErp`) y no en
 * el árbol de trabajo donde vive el script: el árbol que se ejecuta y el
 * repositorio que se consulta ya no son el mismo.
 *
 * No se usa el remoto de git: el clon del VPS no está obligado a tenerlo igual,
 * y un chequeo que falla en el servidor de despliegue empuja a la autorización
 * manual, que es lo que no se quiere.
 */
export const NOMBRE_DEL_PAQUETE_ERP = "erpmanual";

function principal() {
  const dir = arg("dir");
  const modoVps = flag("vps");

  let archivos;
  let origen;
  let lector = leer;

  if (dir) {
    archivos = migracionesDelDirectorio(dir);
    origen = `directorio ${dir}`;
  } else if (modoVps || arg("desde")) {
    const plan = planDeResolucion({
      modoVps,
      enVps: estamosEnElVps(),
      repo: arg("repo"),
      desde: arg("desde"),
      hasta: arg("hasta"),
      raiz: ROOT,
      dirDespliegue: DIR_DESPLIEGUE,
    });

    // El repositorio primero: si no es el del ERP, ni el origen ni el destino
    // significan nada en él.
    validarRepositorio(plan.repo);

    const base = commitDelErp(
      plan.repo,
      plan.origen.tipo === "explicito" ? plan.origen.valor : shaQueAtiende(),
      "origen"
    );
    const hasta = commitDelErp(
      plan.repo,
      plan.destino.tipo === "explicito"
        ? plan.destino.valor
        : plan.destino.tipo === "app-image"
          ? shaDeLaImagenAMigrar(plan.destino.dir)
          : "HEAD",
      "destino"
    );

    // Antes de mirar nada: que el rango no sea el vacío disfrazado de "limpio".
    if (esRangoDegenerado(base, hasta)) {
      throw new Indeterminado(
        `el rango es degenerado: la base y el extremo son el mismo commit (${base.slice(0, 12)}).\n\n` +
          (plan.origen.tipo === "explicito"
            ? "La base que se pasó con --desde ya es el destino, así que no hay nada que comparar."
            : plan.destino.tipo === "app-image"
              ? "APP_IMAGE todavía apunta a la imagen que está atendiendo: el paso 2 del despliegue\n" +
                "no se hizo, y migrar ahora usaría la imagen vieja. Para mirar un release ANTES del\n" +
                "paso 2, pasá el destino a mano: --hasta <SHA> (y --repo <clon que lo tenga> si\n" +
                "/srv/produccion/erpazul todavía no lo trajo)."
              : "La imagen que está atendiendo YA es este mismo commit: no hay nada que\n" +
                "desplegar por encima. Si igual estás desplegando, mirá si el contenedor se\n" +
                "recreó antes de tiempo, o pasá el SHA previo con --desde <SHA>.") +
          "\n\nNo se sale con 0 a propósito: un rango vacío y un despliegue sin migraciones\n" +
          "se imprimen igual, y este script existe para que esos dos no se confundan."
      );
    }

    archivos = migracionesDelRango(plan.repo, base, hasta);
    lector = (rel) => leerDelCommit(plan.repo, hasta, rel);
    origen =
      `${base.slice(0, 12)}..${hasta.slice(0, 12)} en ${plan.repo}` +
      ` (origen: ${plan.origen.tipo === "explicito" ? "--desde" : "la imagen que atiende"};` +
      ` destino: ${plan.destino.tipo === "explicito" ? "--hasta" : plan.destino.tipo === "app-image" ? "APP_IMAGE" : "HEAD del repositorio"})`;
  } else {
    throw new Indeterminado("hace falta --vps, --desde <SHA> o --dir <ruta>. Sin rango no se clasifica nada");
  }

  console.log(`Clasificando migraciones de: ${origen}`);
  console.log(`Archivos a mirar: ${archivos.length}`);

  const marcadas = [];
  for (const rel of archivos) {
    const hallazgos = clasificarSql(lector(rel));
    if (hallazgos.length) marcadas.push({ rel, hallazgos });
    console.log(`  ${hallazgos.length ? "NO ADITIVA" : "aditiva   "}  ${rel}`);
  }

  if (marcadas.length) {
    console.log("");
    console.log(`FRENO: ${marcadas.length} migración(es) marcada(s).`);
    for (const m of marcadas) {
      console.log("");
      console.log(`  ${m.rel}`);
      for (const h of m.hallazgos) {
        console.log(`    · ${h.patron}${h.linea ? ` (línea ${h.linea})` : ""}`);
        console.log(`      ${h.texto}`);
        console.log(`      por qué: ${h.motivo}`);
      }
    }
    console.log("");
    console.log("El despliegue NO continúa. Puede ser un falso positivo —un índice que ya");
    console.log("no usa nadie lo es— pero confirmarlo es de Emanuel, no del que despliega.");
    console.log("Informarle qué migración es, qué sentencia la marcó y por qué rompería a");
    console.log("la versión que está atendiendo, y esperar confirmación explícita.");
    return SALIDA.MARCADO;
  }

  console.log("");
  console.log("Sin coincidencias.");
  console.log("");
  console.log("ESTO NO ES UNA AUTORIZACIÓN. El análisis es textual: busca palabras");
  console.log("conocidas y nada más. No lee adentro de un bloque DO $$, no evalúa si un");
  console.log("CREATE UNIQUE INDEX va a chocar con datos duplicados que ya existen, y no");
  console.log("detecta una incompatibilidad que no use ninguna de esas palabras. Este");
  console.log("script frena; autorizar lo hace Emanuel.");
  return SALIDA.LIMPIO;
}

// Solo corre como programa. Importado —desde los candados— exporta y no sale.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exit(principal());
  } catch (e) {
    if (e instanceof Indeterminado) {
      console.error("");
      console.error("INDETERMINADO: no se pudo establecer qué migraciones entran.");
      console.error(`  ${e.message}`);
      console.error("");
      console.error("El despliegue NO continúa. Un chequeo que no pudo mirar no es un chequeo");
      console.error("que pasó.");
      process.exit(SALIDA.INDETERMINADO);
    }
    console.error("INDETERMINADO: error inesperado.");
    console.error(e?.stack || e);
    process.exit(SALIDA.INDETERMINADO);
  }
}
