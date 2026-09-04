// SIEMBRA EN LA BASE EFÍMERA EL HISTORIAL QUE TIENE PRODUCCIÓN, PARA VER QUÉ
// DIRÍA EL DESPLIEGUE.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/simular-historial-produccion.mjs
//
// ── QUÉ PREGUNTA CONTESTA ──────────────────────────────────────────────────
//
// Producción tiene 105 migraciones registradas en `_prisma_migrations`, y desde
// el saneamiento el directorio activo tiene UNA. Antes de tocar producción hay
// que saber qué hace `prisma migrate deploy` frente a filas que ya no existen
// como archivo — si sigue de largo, si avisa, o si se planta.
//
// Se contesta MIDIÉNDOLO sobre una base descartable, no deduciéndolo de la
// documentación. Es la misma regla que el resto del repo: verificar ejecutando.
//
// ── LO QUE ESTO NO ES ──────────────────────────────────────────────────────
//
// No toca producción ni de cerca. Escribe en la base efímera del runner, que se
// destruye con el job. `clientePrisma.mjs` en nivel ESCRITURA exige host local y
// `NODE_ENV` distinto de production, así que apuntado a otro lado aborta con
// código 2 antes de abrir la conexión.
//
// Tampoco corrige nada de producción: la fila duplicada histórica de
// `20241202000000_add_venta_campos` —que allá falló y se resolvió a mano— no se
// replica acá, porque lo que se quiere medir es el caso general.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const crypto = await import("node:crypto");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LISTA = path.join(RAIZ, "docs/deploy/estructura-produccion/migraciones-historicas.txt");

const nombres = fs
  .readFileSync(LISTA, "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

console.log(`Sembrando ${nombres.length} filas históricas en _prisma_migrations…`);

// El checksum no se corresponde con ningún archivo, y es a propósito: acá lo que
// se simula es "hay filas cuyo archivo ya no está", que es exactamente la
// situación de producción después del saneamiento. Un checksum inventado no
// cambia el caso, porque Prisma ni siquiera llega a compararlo: el archivo no
// existe.
for (const nombre of nombres) {
  const id = crypto.randomUUID();
  const checksum = crypto.createHash("sha256").update(nombre).digest("hex");
  await prisma.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations"
       (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
     VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)
     ON CONFLICT (id) DO NOTHING`,
    id,
    checksum,
    nombre
  );
}

const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations"`;
console.log(`_prisma_migrations tiene ahora ${n} filas (105 históricas + la baseline aplicada).`);

await prisma.$disconnect();
