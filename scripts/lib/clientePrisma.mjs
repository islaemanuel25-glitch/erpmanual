// LA ÚNICA FORMA DE OBTENER UN CLIENTE PRISMA DENTRO DE scripts/.
//
// ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
//
// `new PrismaClient()` sin argumentos no falla cuando falta DATABASE_URL: usa la
// del .env. Y el .env apunta a la base de desarrollo. Así, un script de
// mantenimiento lanzado sin variable no aborta — escribe en erpazul_dev y
// termina informando éxito. Lo mismo pasaría con cualquier otra base que el .env
// llegue a apuntar.
//
// Peor: `@prisma/client` carga el .env AL IMPORTARSE, así que para cuando el
// script mira `process.env.DATABASE_URL` ya no puede distinguir entre "la puso el
// operador" y "la puso el .env". Las dos se ven idénticas.
//
// ── CÓMO SE DISTINGUEN LAS DOS ──────────────────────────────────────────────
//
// Este módulo NO importa `@prisma/client` de forma estática: lo carga con
// import() dinámico recién cuando ya validó todo. Como nadie cargó el .env
// todavía, el DATABASE_URL que se captura al evaluar este módulo es
// necesariamente el que puso el operador. Si no puso ninguno, es null y se
// aborta.
//
// (El orden de las líneas no es lo que lo garantiza: en ESM los imports se
// evalúan antes que el cuerpo del módulo, aunque estén escritos después. Lo que
// lo garantiza es que el único import estático de acá —la guarda— tampoco toca
// Prisma.)
//
// De ahí sale la única regla de uso: importar este módulo ANTES que cualquier
// cosa que arrastre a Prisma. En la práctica, primero.
//
//   import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
//   const prisma = await crearClientePrisma({ nivel: ESCRITURA });
//
// ── LOS TRES NIVELES ────────────────────────────────────────────────────────
//
//   lectura     — solo exige que la URL venga del operador.
//   escritura   — además: servidor local y NODE_ENV distinto de production.
//   destructivo — además: nombre exacto en lista blanca y SEED_DESTRUCTIVO.
//                 Delega en guardaSeedDestructivo.mjs, que es donde vive esa
//                 lista; no se duplica acá.
//
// Todos fallan CERRADO: si algo no se cumple se aborta con código 2 y sin abrir
// conexión. No hay flag para saltear un nivel.

import { exigirBaseDescartable } from "../guardaSeedDestructivo.mjs";

const URL_DEL_OPERADOR = process.env.DATABASE_URL ?? null;

export const LECTURA = "lectura";
export const ESCRITURA = "escritura";
export const DESTRUCTIVO = "destructivo";

const NIVELES = new Set([LECTURA, ESCRITURA, DESTRUCTIVO]);
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function abortar(motivo, detalle = "") {
  console.error(`ABORTADO: ${motivo}`);
  if (detalle) console.error(`  ${detalle}`);
  process.exit(2);
}

/** Nombre de la base, o aborta si la URL no sirve. */
function parsear(crudo) {
  let url;
  try {
    url = new URL(crudo);
  } catch {
    abortar("DATABASE_URL no es una URL válida.");
  }
  return url;
}

/**
 * Devuelve un PrismaClient atado a la URL validada para el nivel pedido.
 *
 * @param {object}  opciones
 * @param {string}  opciones.nivel  LECTURA | ESCRITURA | DESTRUCTIVO
 * @param {string} [opciones.url]   URL explícita. Por defecto, la que el operador
 *                                  puso en el entorno ANTES de arrancar el script.
 * @returns {Promise<import("@prisma/client").PrismaClient>}
 */
export async function crearClientePrisma({ nivel, url } = {}) {
  if (!NIVELES.has(nivel)) {
    abortar(
      `nivel inválido: ${JSON.stringify(nivel)}.`,
      `Usar uno de: ${[...NIVELES].join(", ")}.`
    );
  }

  const crudo = url ?? URL_DEL_OPERADOR;
  if (!crudo) {
    abortar(
      "falta DATABASE_URL.",
      "Este script no hereda la base del .env: hay que decir contra cuál corre.\n" +
        "  Ejemplo: DATABASE_URL=postgresql://…/erpazul_dev node scripts/<script>"
    );
  }

  const parsed = parsear(crudo);
  const base = parsed.pathname.replace(/^\//, "");
  if (!base) abortar("DATABASE_URL no nombra ninguna base.");

  if (nivel === ESCRITURA || nivel === DESTRUCTIVO) {
    if (!HOSTS_LOCALES.has(parsed.hostname)) {
      abortar(
        "el servidor no es local.",
        `Host recibido: ${parsed.hostname}. Este nivel solo corre contra ${[...HOSTS_LOCALES].join(", ")}.`
      );
    }
    if (process.env.NODE_ENV === "production") {
      abortar("NODE_ENV=production.");
    }
  }

  // El nivel destructivo agrega lista blanca + variable de intención. Se le pasa
  // la URL capturada acá para que valide lo mismo que validamos nosotros.
  if (nivel === DESTRUCTIVO) exigirBaseDescartable(crudo);

  // Recién ahora se carga Prisma: si algo falló, el .env nunca llegó a leerse.
  const { PrismaClient } = await import("@prisma/client");

  if (nivel !== LECTURA) {
    console.error(`Base: "${base}" en ${parsed.hostname} — nivel ${nivel}.`);
  }

  return new PrismaClient({ datasources: { db: { url: crudo } }, log: [] });
}
