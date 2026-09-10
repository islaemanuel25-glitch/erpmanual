// lib/deploy/shaDesplegado.mjs
//
// LA ÚNICA RESPUESTA A "QUÉ CÓDIGO ESTÁ ATENDIENDO AHORA MISMO".
//
// ── POR QUÉ ESTO EXISTE, Y POR QUÉ ES UN SOLO LUGAR ─────────────────────────
//
// El clasificador de migraciones necesita esa respuesta para poder decir qué
// introduce un despliegue POR ENCIMA de lo que hay corriendo. Hasta el
// 2026-09-10 la sacaba de una sola forma: `ssh vps-erp docker inspect …`.
//
// Eso ata el chequeo a estar FUERA del servidor. El 2026-09-10 el despliegue se
// corrió DESDE EL PROPIO VPS —la sesión vive en `srv1431538`—, donde el alias
// `vps-erp` no resuelve. El modo automático salía con 2 sin poder mirar nada, y
// la única salida habría sido la autorización manual. Una puerta que hay que
// abrir en todos los despliegues de un entorno no es una puerta: es el chequeo
// apagado con otro nombre.
//
// La respuesta se resolvió a mano, leyendo el contenedor con `docker inspect` y
// pasando `--desde`. Funcionó, y por eso está acá: **lo que se hizo a mano es lo
// que el código tiene que hacer solo.** Documentar el rodeo como si fuera el
// procedimiento habría dejado el defecto adentro con permiso.
//
// ── LA ESTRATEGIA, Y POR QUÉ MIRA CAPACIDADES Y NO NOMBRES ──────────────────
//
// No pregunta "¿estoy en el VPS?". Preguntar eso obliga a codificar un hostname,
// un usuario o una ruta, y todos ellos mienten el día que algo se muda: una
// sesión en otro servidor con el mismo nombre contestaría que sí, y un VPS
// renombrado contestaría que no.
//
// Pregunta lo único que importa: **¿puedo ver desde acá el contenedor que está
// atendiendo?** Si sí, esa es la fuente y no hace falta salir a la red. Si no,
// se pregunta por ssh, que es lo que ya se hacía.
//
// El sondeo de capacidad y el dato son EL MISMO comando, a propósito. Un sondeo
// aparte —"¿hay docker?"— puede decir que sí y después el dato salir de otro
// lado; acá si el comando anduvo, el dato es suyo.
//
// ── FALLA CERRADO, Y DICE QUÉ HACER ─────────────────────────────────────────
//
// Si ninguna de las dos fuentes sirve, no adivina: lanza, contando qué intentó
// con cada una y cuál es la salida explícita (`--desde <SHA>`). Un resolutor que
// se rinde en silencio es peor que no tenerlo, porque el que despliega cree que
// pasó.

import { execFileSync } from "node:child_process";

/** El contenedor que atiende. Es el mismo nombre que verifica el paso 5. */
export const CONTENEDOR_APP = "erpazul_app";

/** El alias ssh del procedimiento, para cuando de verdad se está afuera. */
export const ALIAS_VPS = "vps-erp";

/**
 * El repositorio de imágenes con el que se despliega.
 *
 * No es decoración: es lo que hace confiable a la lectura LOCAL. Un contenedor
 * llamado `erpazul_app` en una máquina de desarrollo no tiene por qué ser
 * producción, y tomarle el SHA sería inventar la base del rango. Exigir que la
 * imagen venga de este repositorio convierte "hay un contenedor con ese nombre"
 * en "estoy mirando el despliegue de verdad".
 */
export const IMAGEN_PRODUCCION = "ghcr.io/islaemanuel25-glitch/erpmanual";

/** Lo que se levanta cuando no se pudo establecer el SHA. Falla cerrado. */
export class ShaIndeterminado extends Error {}

/**
 * El SHA de 40 que lleva una etiqueta de imagen, o ShaIndeterminado.
 *
 * Vive acá y no en el clasificador porque es parte de la misma pregunta: una
 * etiqueta móvil —`latest`— no sirve como base, porque apunta a lo último que se
 * construyó y mañana señala otra cosa. Es la misma razón por la que producción
 * despliega solo por SHA completo.
 *
 * El clasificador la sigue exportando con este nombre: sus candados la importan
 * de allá y no tenían por qué enterarse de la mudanza.
 */
export function shaDeLaEtiqueta(etiqueta) {
  const m = /:([0-9a-f]{40})\s*$/i.exec(String(etiqueta ?? "").trim());
  if (!m) {
    throw new ShaIndeterminado(
      `la imagen que atiende no está etiquetada con un SHA de 40: ${JSON.stringify(String(etiqueta ?? "").slice(0, 80))}.\n\n` +
        "Sin saber qué código está sirviendo pedidos no se puede decir qué introduce\n" +
        "este despliegue por encima. Si la imagen se etiquetó a mano o con `latest`,\n" +
        "pasá el SHA previo con --desde <SHA>."
    );
  }
  return m[1].toLowerCase();
}

/** El repositorio de una etiqueta, sin el `:tag`. Vacío si no se puede leer. */
export function repositorioDeLaEtiqueta(etiqueta) {
  const texto = String(etiqueta ?? "").trim();
  const i = texto.lastIndexOf(":");
  return i > 0 ? texto.slice(0, i) : "";
}

function primeraLinea(e) {
  return (e?.stderr || e?.message || "").toString().trim().split("\n")[0] || String(e);
}

/**
 * La etiqueta de la imagen del contenedor que atiende, leída ACÁ MISMO.
 *
 * Es exactamente el comando que el paso 2 del despliegue ya corre para anotar la
 * referencia de rollback, y el mismo que el paso 5 usa como tercero de los cinco
 * valores. No hay un dato nuevo que mantener.
 */
export function leerEtiquetaLocal() {
  return execFileSync(
    "docker",
    ["inspect", CONTENEDOR_APP, "--format", "{{.Config.Image}}"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

/** La misma etiqueta, preguntada por ssh. Es el camino de cuando se está afuera. */
export function leerEtiquetaRemota() {
  return execFileSync(
    "ssh",
    [
      "-o", "ConnectTimeout=20", "-o", "BatchMode=yes", ALIAS_VPS,
      `docker inspect ${CONTENEDOR_APP} --format '{{.Config.Image}}'`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

/**
 * QUÉ SHA ESTÁ DESPLEGADO, sin que el que llama tenga que saber dónde está.
 *
 * Devuelve `{ sha, origen, evidencia }`:
 *   · `origen` es "local" o "remoto" — de dónde salió, para poder informarlo;
 *   · `evidencia` dice con qué se lo estableció, para que un informe no tenga
 *     que decir "confiá en mí".
 *
 * El orden no es arbitrario: **primero local**. Si el proceso ve el contenedor
 * que atiende, preguntarle por ssh a la misma máquina agrega un salto de red,
 * una llave y un alias que pueden fallar, para conseguir el mismo dato.
 *
 * Las dos lecturas son inyectables para poder ejercer los tres entornos —dentro
 * del VPS, fuera de él, y sin ninguno de los dos— sin Docker y sin ssh. La
 * simulación del caso que falló el 2026-09-10 afirma además que la vía remota
 * **no se llama**, que es la mitad que un `origen: "local"` no prueba.
 */
export function resolverShaDesplegado(opciones = {}) {
  const {
    leerLocal = leerEtiquetaLocal,
    leerRemoto = leerEtiquetaRemota,
    imagenEsperada = IMAGEN_PRODUCCION,
  } = opciones;

  const intentos = [];

  // ── 1. ACÁ MISMO ────────────────────────────────────────────────────────
  let etiquetaLocal = null;
  try {
    etiquetaLocal = leerLocal();
  } catch (e) {
    intentos.push(`local (docker inspect ${CONTENEDOR_APP}): ${primeraLinea(e)}`);
  }

  if (etiquetaLocal) {
    const repo = repositorioDeLaEtiqueta(etiquetaLocal);
    if (imagenEsperada && repo !== imagenEsperada) {
      // Hay un contenedor con ese nombre pero no es el despliegue: no se toma
      // su SHA y tampoco se sigue de largo hacia ssh como si nada, porque eso
      // taparía una máquina mal configurada con una respuesta correcta.
      throw new ShaIndeterminado(
        `hay un contenedor ${CONTENEDOR_APP} acá, pero su imagen no es la de producción.\n` +
          `  esperada: ${imagenEsperada}\n` +
          `  encontrada: ${repo || "(sin repositorio legible)"}\n\n` +
          "No se toma su SHA como base: sería inventar contra qué se compara. Si la\n" +
          "imagen se retagueó a propósito, pasá el SHA previo con --desde <SHA>."
      );
    }
    return {
      sha: shaDeLaEtiqueta(etiquetaLocal),
      origen: "local",
      evidencia: {
        como: `docker inspect ${CONTENEDOR_APP} --format '{{.Config.Image}}'`,
        etiqueta: etiquetaLocal,
        contenedor: CONTENEDOR_APP,
      },
    };
  }

  // ── 2. POR SSH, QUE ES EL CAMINO DE CUANDO SE ESTÁ AFUERA ───────────────
  let etiquetaRemota = null;
  try {
    etiquetaRemota = leerRemoto();
  } catch (e) {
    intentos.push(`remoto (ssh ${ALIAS_VPS}): ${primeraLinea(e)}`);
  }

  if (etiquetaRemota) {
    return {
      sha: shaDeLaEtiqueta(etiquetaRemota),
      origen: "remoto",
      evidencia: {
        como: `ssh ${ALIAS_VPS} docker inspect ${CONTENEDOR_APP} --format '{{.Config.Image}}'`,
        etiqueta: etiquetaRemota,
        alias: ALIAS_VPS,
        contenedor: CONTENEDOR_APP,
      },
    };
  }

  // ── 3. NINGUNA SIRVIÓ ───────────────────────────────────────────────────
  throw new ShaIndeterminado(
    "no se pudo establecer qué SHA está atendiendo, ni acá ni por ssh.\n" +
      intentos.map((t) => `  · ${t}`).join("\n") +
      "\n\nLa salida explícita es pasar la base a mano, que además queda auditable:\n" +
      "  node scripts/clasificar-migraciones.mjs --desde <SHA_QUE_ESTÁ_ATENDIENDO>\n\n" +
      "El SHA se lee de la imagen del contenedor que atiende, que es el mismo dato\n" +
      "que el paso 2 del despliegue anota como referencia de rollback."
  );
}
