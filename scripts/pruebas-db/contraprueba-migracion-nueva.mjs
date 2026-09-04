// CONTRAPRUEBA: ¿PRISMA APLICA SOLO LAS MIGRACIONES NUEVAS?
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/contraprueba-migracion-nueva.mjs
//
// ── QUÉ PRUEBA, Y POR QUÉ NO ALCANZA CON LO ANTERIOR ───────────────────────
//
// Que el saneamiento funciona HACIA ADELANTE. Todo lo demás comprueba el estado
// de hoy: que la baseline construye la base, que no hay deriva, que los nueve
// objetos están. Nada de eso dice qué va a pasar la próxima vez que alguien
// escriba una migración.
//
// El escenario que se reproduce es exactamente el de producción después del
// `migrate resolve` del 2026-09-04:
//
//     105 filas históricas SIN archivo
//   + la baseline marcada como aplicada
//   + una migración nueva posterior
//   = Prisma tiene que aplicar SOLO la nueva.
//
// Si Prisma se plantara por las filas sin archivo, o intentara correr la
// baseline sobre una base que ya tiene todo, el próximo despliegue del ERP se
// caería. Eso hay que saberlo ahora y no esa noche.
//
// ── LA MIGRACIÓN FICTICIA ES DE MENTIRA Y SE BORRA ─────────────────────────
//
// Se crea al vuelo, crea una tabla que no existe en ningún lado, y el script la
// borra al terminar pase lo que pase. NO se commitea: una migración de prueba en
// el directorio activo terminaría corriendo en producción.
//
// Solo contra la base efímera de CI. `clientePrisma.mjs` en nivel ESCRITURA
// exige host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const fs = await import("node:fs");
const path = await import("node:path");
const { execFileSync } = await import("node:child_process");
const { fileURLToPath } = await import("node:url");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOMBRE = "29991231000000_contraprueba_migracion_posterior";
const DIR = path.join(RAIZ, "prisma", "migrations", NOMBRE);

let pasadas = 0;
const fallas = [];
const ok = (t, c, d = "") => {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
};

const prisma_cli = (...args) =>
  execFileSync("npx", ["prisma", ...args], { cwd: RAIZ, encoding: "utf8", stdio: "pipe" });

async function filas() {
  const r = await prisma.$queryRaw`SELECT count(*)::int AS n FROM "_prisma_migrations"`;
  return r[0].n;
}

try {
  // ── Punto de partida: el historial de producción ────────────────────────
  const antes = await filas();
  console.log(`\n── Punto de partida ${"─".repeat(50)}`);
  console.log(`   _prisma_migrations: ${antes} filas`);
  ok("hay 105 históricas + la baseline", antes === 106, `hay ${antes}`);

  const estado0 = prisma_cli("migrate", "status");
  ok(
    "con 105 filas sin archivo, Prisma NO se planta",
    /Database schema is up to date/.test(estado0),
    estado0.trim().split("\n").slice(-2).join(" ")
  );

  // ── Aparece una migración nueva ─────────────────────────────────────────
  console.log(`\n── Aparece una migración posterior ${"─".repeat(35)}`);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DIR, "migration.sql"),
    `-- Migración de mentira, creada y borrada por la contraprueba.\n` +
      `-- Fechada en 2999 para que ordene DESPUÉS de cualquier migración real.\n` +
      `CREATE TABLE "ContrapruebaTablaFicticia" (\n` +
      `  "id" SERIAL NOT NULL,\n` +
      `  CONSTRAINT "ContrapruebaTablaFicticia_pkey" PRIMARY KEY ("id")\n` +
      `);\n`
  );

  const estado1 = prisma_cli("migrate", "status");
  ok(
    "Prisma la detecta como PENDIENTE",
    /following migration|have not yet been applied|not yet been applied/i.test(estado1),
    estado1.trim().split("\n").slice(-3).join(" ")
  );
  ok("y la nombra", estado1.includes(NOMBRE));

  // ── Y se aplica SOLO ella ───────────────────────────────────────────────
  console.log(`\n── El despliegue ${"─".repeat(52)}`);
  const salida = prisma_cli("migrate", "deploy");
  console.log(salida.trim().split("\n").map((l) => `     ${l}`).join("\n"));

  ok("aplica la nueva", salida.includes(`Applying migration \`${NOMBRE}\``));
  ok(
    "y NO vuelve a aplicar la baseline",
    !salida.includes("Applying migration `000000000000_squashed_migrations`"),
    "intentó reaplicar la baseline sobre una base que ya tiene todo"
  );
  ok(
    "ni ninguna de las 105 históricas",
    (salida.match(/Applying migration/g) || []).length === 1,
    `aplicó ${(salida.match(/Applying migration/g) || []).length} migraciones`
  );

  // ── Y el efecto llegó a la base ─────────────────────────────────────────
  const tabla = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM pg_tables
    WHERE schemaname='public' AND tablename='ContrapruebaTablaFicticia'`;
  ok("la tabla de la migración nueva existe", tabla[0].n === 1);

  const despues = await filas();
  ok(`_prisma_migrations pasó de ${antes} a ${despues} filas`, despues === antes + 1);

  const historicas = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM "_prisma_migrations"
    WHERE migration_name <> ${NOMBRE}`;
  ok("las filas anteriores siguen todas", historicas[0].n === antes);
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stderr || err?.message || err}`);
  console.error(err?.stderr || err);
} finally {
  // Pase lo que pase: la migración de mentira NO queda en el árbol.
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n(la migración ficticia se borró: ${fs.existsSync(DIR) ? "NO — revisar" : "sí"})`);
  await prisma.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
