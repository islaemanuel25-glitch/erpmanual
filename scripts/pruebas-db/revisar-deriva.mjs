// ¿`prisma migrate diff` ENCUENTRA ALGUNA DERIVA ENTRE LAS MIGRACIONES Y EL
// SCHEMA?
//
//   node scripts/pruebas-db/revisar-deriva.mjs <archivo.sql>
//
// ── LO QUE SE ESPERABA Y LO QUE PASÓ, PORQUE LA DIFERENCIA ENSEÑA ──────────
//
// La primera versión de este script daba por sentado que el diff iba a proponer
// BORRAR los nueve objetos que la baseline agrega a mano —los ocho índices
// parciales y el CHECK—, porque `schema.prisma` no puede declararlos. Con esa
// idea se escribió una lista de "diferencias inevitables" y se toleraban.
//
// Se midió, y no es así: el diff sale VACÍO. Prisma no ve esos objetos en
// ninguno de los dos lados. Los índices parciales y los CHECK están fuera de su
// modelo de datos, así que ni los lee de la base sombra ni los espera del
// schema, y por lo tanto no los reporta como diferencia.
//
// La consecuencia práctica es doble y conviene tenerla escrita:
//
//   1. Se puede exigir DERIVA CERO de verdad. No hay ninguna diferencia
//      inevitable que tolerar, así que cualquier sentencia en el diff es un
//      problema real.
//
//   2. Y la que importa: **`migrate diff` NO protege los nueve objetos.** Si
//      alguien regenera la baseline y se olvida del bloque manual, este chequeo
//      sigue en verde — porque Prisma tampoco los veía antes. Quien los cuida es
//      `estructura.mjs`, que los busca en la base construida y compara sus
//      predicados. Los dos chequeos no se solapan: miran cosas distintas, y
//      confundirlos sería quedarse sin el único que mira ésa.

import fs from "node:fs";

const archivo = process.argv[2];
if (!archivo) {
  console.error("Falta el archivo con la salida de `prisma migrate diff --script`.");
  process.exit(2);
}

const sql = fs.readFileSync(archivo, "utf8");

// Sentencias reales: sin comentarios ni líneas vacías. La salida de Prisma para
// "no hay nada que hacer" es exactamente `-- This is an empty migration.`, que
// al sacar los comentarios queda en cero.
const sentencias = sql
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"))
  .join(" ")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

if (sentencias.length === 0) {
  console.log("Sin deriva: las migraciones y schema.prisma construyen lo mismo.");
  console.log(
    "\nRecordatorio: esto NO dice nada sobre los 9 objetos del bloque manual de la\n" +
      "baseline. Prisma no los ve. De ésos se ocupa scripts/pruebas-db/estructura.mjs."
  );
  process.exit(0);
}

console.log(`DERIVA: ${sentencias.length} sentencia(s) que nadie declaró.\n`);
for (const s of sentencias) console.log(`  ✗ ${s};`);
console.log(
  "\nAlgo del schema no está en las migraciones, o al revés. Si el cambio es a" +
    "\npropósito, va en una migración nueva; si no, hay que entender de dónde salió."
);
process.exit(1);
