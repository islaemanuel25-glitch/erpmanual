// lib/deploy/guardiaMigraciones.js
//
// La decisión de la guardia de migraciones, separada del hook que la ejecuta.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL HOOK ──────────────────────────────────
//
// Estaba toda pegada al lector de stdin, y eso la volvía imposible de testear:
// para ejercer un caso había que levantar un proceso y hablarle por tubería. Un
// control que decide si algo toca producción tiene que tener candados que se
// puedan leer, así que la parte que decide vive acá y es una función pura.
//
// El hook queda con lo que de verdad necesita el sistema operativo: leer la
// entrada, correr el clasificador cuando hace falta, y escribir la respuesta.
//
// ── LOS TRES CAMINOS ────────────────────────────────────────────────────────
//
// 1. `prisma db push`  → DENIEGA SIEMPRE, sin puerta de escape.
// 2. `prisma migrate deploy` con autorización manual → deja pasar, PERO AVISA.
// 3. `prisma migrate deploy` sin autorizar → manda a clasificar.
//
// Cualquier otro comando no es asunto de la guardia y pasa sin decir nada.

/** Un `prisma db push` se reconoce por las dos piezas, no por una. */
export const NOMBRA_PRISMA = /\bprisma\b/;
export const ES_DB_PUSH = /\bdb\s+push\b/;

/** `migrate deploy` es el de producción. `migrate dev` es local y no entra acá. */
export const ES_MIGRACION_DE_PRODUCCION = /\bmigrate\s+deploy\b/;

/** La autorización explícita, adelante del comando y visible en la línea. */
export const AUTORIZADO = /\bDEPLOY_MIGRACION_AUTORIZADA\s*=\s*1\b/;

/**
 * `prisma db push` no tiene autorización posible, a diferencia de
 * `migrate deploy`.
 *
 * El motivo es que los dos no se parecen en lo que dejan atrás. `migrate deploy`
 * aplica archivos de migración que están escritos, versionados y revisables, y
 * que se aplican una sola vez; se puede mirar antes qué entra y queda registro
 * de qué entró. `db push` no aplica nada de eso: mira `schema.prisma`, calcula
 * la diferencia contra la base y la ejecuta, sin dejar archivo. Si esa
 * diferencia incluye tirar una columna, la tira con los datos adentro y no
 * queda ni la sentencia que lo hizo.
 *
 * Es decisión de Emanuel del 2026-08-10, con estas palabras: "db push no lo
 * quiero nunca, en ningún caso. Si algún día hace falta, lo hablamos." Se tapó
 * al sacar los pedidos de permiso: hasta ese día el cartel era el control que
 * lo frenaba, y al desaparecer quedaba pasando en silencio.
 *
 * NO se le agrega una variable de escape. Si algún día hay que correrlo, se
 * cambia esta función a propósito y se dice por qué en el commit — que es
 * exactamente el trámite que se quiere que cueste.
 */
export function esDbPush(comando) {
  return NOMBRA_PRISMA.test(comando) && ES_DB_PUSH.test(comando);
}

const RAZON_DB_PUSH =
  "FRENADO Y SIN AUTORIZACIÓN POSIBLE: `prisma db push` está bloqueado en este " +
  "repo, siempre.\n\n" +
  "Calcula la diferencia entre schema.prisma y la base y la ejecuta sin dejar " +
  "archivo de migración. Si esa diferencia incluye tirar una columna, se lleva " +
  "los datos y no queda ni la sentencia que lo hizo.\n\n" +
  "No existe variable que lo habilite, a propósito. Lo que se quiere hacer con " +
  "`db push` se hace con una migración: se escribe, se revisa y queda " +
  "registrada. Si de verdad hace falta correrlo, es una conversación con " +
  "Emanuel y un cambio deliberado a lib/deploy/guardiaMigraciones.js — no un " +
  "flag.";

const AVISO_DB_PUSH =
  "GUARDIA: se frenó un `prisma db push`. Está bloqueado siempre y no tiene " +
  "autorización posible.";

const RAZON_AUTORIZADA =
  "Migración AUTORIZADA a mano con DEPLOY_MIGRACION_AUTORIZADA=1. La guardia NO " +
  "clasificó nada: la compatibilidad durante la ventana entre migrar y recrear " +
  "queda bajo la confirmación de Emanuel.\n\n" +
  "ESTO HAY QUE DECÍRSELO EN EL REPORTE, con estas palabras o parecidas: que se " +
  "usó la autorización manual, sobre qué comando, y que por eso el clasificador " +
  "no miró las migraciones que entraron. Antes el cartel de permiso era su " +
  "segundo control; sin cartel, este aviso es el único.";

const AVISO_AUTORIZADA =
  "GUARDIA: se usó la autorización manual de migraciones " +
  "(DEPLOY_MIGRACION_AUTORIZADA=1). El clasificador no revisó qué migraciones " +
  "entran.";

/**
 * Qué hacer con un comando, sin correr nada.
 *
 * Devuelve `accion`:
 *   "deny"       → se rechaza y no se consulta a nadie
 *   "allow"      → pasa
 *   "clasificar" → hay que correr el clasificador para poder decidir
 *
 * `aviso` es el texto que se le muestra a Emanuel en pantalla, o null cuando no
 * hay nada que mostrar. Se devuelve aparte de `razon` porque no son lo mismo:
 * la razón la lee quien está trabajando, el aviso lo ve él.
 */
export function decidirPorComando(comando) {
  const cmd = String(comando ?? "");

  // Primero de todo, y antes de mirar la autorización: no hay orden de los
  // factores que habilite un db push. Si un comando trajera las dos cosas,
  // gana el rechazo.
  if (esDbPush(cmd)) {
    return { accion: "deny", razon: RAZON_DB_PUSH, aviso: AVISO_DB_PUSH };
  }

  if (!ES_MIGRACION_DE_PRODUCCION.test(cmd)) {
    return { accion: "allow", razon: "", aviso: null };
  }

  if (AUTORIZADO.test(cmd)) {
    return { accion: "allow", razon: RAZON_AUTORIZADA, aviso: AVISO_AUTORIZADA };
  }

  return { accion: "clasificar", razon: "", aviso: null };
}
