// GUARDA PARA SEEDS QUE BORRAN TODO.
//
// Los seeds de prueba arrancan con un TRUNCATE de todas las tablas. Un error de
// una letra en DATABASE_URL vacía la base equivocada y no hay vuelta atrás, así
// que la condición para dejarlos correr tiene que ser explícita y estrecha.
//
// ── POR QUÉ NO ALCANZA CON BUSCAR "test" EN EL NOMBRE ───────────────────────
//
// La guarda anterior era `/test/i.test(DATABASE_URL)`. Tres problemas:
//
//   · Es por NOMBRE, no por SERVIDOR. Una base remota llamada algo con "test"
//     pasaba igual, y la URL de producción podría contenerlo en el host, en el
//     usuario o en un parámetro sin que el nombre de la base tenga nada que ver.
//   · Es por SUBCADENA. En este Postgres hay cuatro bases que matchean, y tres
//     de ellas guardan escenarios armados a mano que nadie quiere perder:
//     erpazul_combos_manual_test, erpazul_migrate_test, erpazul_migration_test.
//   · No exige INTENCIÓN. Si la variable ya estaba exportada en la terminal, el
//     script corría solo, sin que nadie decidiera nada en ese momento.
//
// ── LAS CUATRO CONDICIONES ──────────────────────────────────────────────────
//
// Tienen que cumplirse TODAS. Cualquiera que falle aborta con código 2 y sin
// tocar la base. No hay flag para saltearlas: para agregar una base hay que
// editar la lista de acá abajo, y eso se ve en el diff.
//
//   1. El servidor es local. Nunca una base remota.
//   2. NODE_ENV no es production.
//   3. El nombre EXACTO de la base está en BASES_DESCARTABLES. Exacto: no
//      "empieza con", no "contiene".
//   4. SEED_DESTRUCTIVO viene seteada y su valor es IGUAL al nombre de la base.
//
// La cuarta es la que exige intención. Pedir que el valor coincida con el nombre
// —y no un "si" o un "1"— obliga a nombrar la base que se va a destruir en el
// mismo comando, y hace que una variable vieja que quedó exportada apuntando a
// otra base falle cerrado en vez de habilitar de más.
//
//   Uso:  SEED_DESTRUCTIVO=erpazul_correccion_test \
//         DATABASE_URL=postgresql://…/erpazul_correccion_test \
//         node scripts/mobile-seed.mjs

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Bases que se pueden vaciar. Nombres EXACTOS.
 *
 * Sólo van acá las que existen para ser destruidas y rearmadas por un arnés. Si
 * una base guarda un escenario que costó armar, no va, por más que se llame
 * "test".
 */
const BASES_DESCARTABLES = new Set([
  // Base de trabajo de los arneses de integración, que ya la truncan ellos.
  "erpazul_term_test",
  // Dedicada a la prueba manual de corrección de ventas. Si no existe, crearla:
  //   createdb erpazul_correccion_test && prisma migrate deploy
  "erpazul_correccion_test",
]);

function abortar(motivo, detalle = "") {
  console.error(`ABORTADO: ${motivo}`);
  if (detalle) console.error(`  ${detalle}`);
  console.error("  Este script hace TRUNCATE de todas las tablas y no corre sin las cuatro condiciones.");
  process.exit(2);
}

/**
 * Verifica que se pueda vaciar la base indicada. Aborta el proceso si no.
 *
 * @param {string} [urlCruda] URL a validar. Se pasa explícitamente desde
 *   scripts/lib/clientePrisma.mjs, que la captura ANTES de que Prisma cargue el
 *   .env. Si se omite cae a process.env, que es como la usan los seeds.
 * @returns {string} el nombre de la base, ya validado.
 */
export function exigirBaseDescartable(urlCruda = process.env.DATABASE_URL) {
  const crudo = urlCruda;
  if (!crudo) abortar("falta DATABASE_URL.");

  let url;
  try {
    url = new URL(crudo);
  } catch {
    // Sin poder leer la URL no se sabe contra qué se está apuntando: cerrado.
    abortar("DATABASE_URL no es una URL válida.");
  }

  if (!HOSTS_LOCALES.has(url.hostname)) {
    abortar(
      "el servidor no es local.",
      `Host recibido: ${url.hostname}. Sólo ${[...HOSTS_LOCALES].join(", ")}.`
    );
  }

  if (process.env.NODE_ENV === "production") {
    abortar("NODE_ENV=production.");
  }

  const base = url.pathname.replace(/^\//, "");
  if (!base) abortar("DATABASE_URL no nombra ninguna base.");

  if (!BASES_DESCARTABLES.has(base)) {
    abortar(
      `la base "${base}" no está en la lista de descartables.`,
      `Permitidas: ${[...BASES_DESCARTABLES].join(", ")}. Para agregar una hay que editar scripts/guardaSeedDestructivo.mjs.`
    );
  }

  const confirmacion = process.env.SEED_DESTRUCTIVO;
  if (!confirmacion) {
    abortar(
      "falta SEED_DESTRUCTIVO.",
      `Para confirmar que querés vaciar esta base: SEED_DESTRUCTIVO=${base}`
    );
  }
  if (confirmacion !== base) {
    abortar(
      "SEED_DESTRUCTIVO no coincide con la base.",
      `SEED_DESTRUCTIVO=${confirmacion} pero DATABASE_URL apunta a ${base}. Tienen que ser iguales.`
    );
  }

  console.error(`Guarda OK: se va a VACIAR la base local "${base}".`);
  return base;
}
