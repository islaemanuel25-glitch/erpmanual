// COMPARA LA BASE CONSTRUIDA DESDE LA BASELINE CONTRA LA ESTRUCTURA DE
// PRODUCCIÓN, Y NO DEJA PASAR NINGUNA DIFERENCIA QUE NO ESTÉ DECLARADA.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/comparar-con-produccion.mjs
//
// ── CONTRA QUÉ COMPARA ─────────────────────────────────────────────────────
//
// Contra `docs/deploy/estructura-produccion/`, que es un retrato de la base de
// producción tomado el 2026-09-04 con consultas de SOLO LECTURA sobre
// `pg_tables`, `information_schema.columns`, `pg_enum`, `pg_indexes` y
// `pg_constraint`. Son nombres de tablas, columnas, índices y enums: no hay un
// solo dato ni una sola credencial ahí adentro.
//
// El retrato está commiteado a propósito. Un CI que se conectara a producción
// para comparar sería un CI con acceso a producción, que es exactamente lo que
// no puede existir. Un archivo que se actualiza a mano y con revisión hace el
// mismo trabajo sin abrir esa puerta.
//
// ── LAS DIFERENCIAS ESPERADAS ESTÁN ENUMERADAS, NO TOLERADAS EN BLOQUE ─────
//
// Cada una figura abajo con su motivo. Cualquier otra pone el script en rojo.
// La distinción importa: "ignorar las diferencias de enums" habría tapado
// también una diferencia de VALORES, que sí sería funcional.

import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: LECTURA });

const fs = await import("node:fs");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RETRATO = path.join(RAIZ, "docs/deploy/estructura-produccion");

const leer = (n) =>
  fs
    .readFileSync(path.join(RETRATO, n), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !l.includes("_prisma_migrations"))
    .sort();

// ═══════════════════════════════════════════════════════════════════════════
// LO ESPERADO, UNO POR UNO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Diferencias conocidas, con su clasificación y su motivo. `clave` es la línea
 * exacta que se espera ver como diferencia; si aparece, se informa y no cuenta.
 * Si NO aparece, tampoco es un error: significa que la diferencia se resolvió.
 */
const ESPERADAS = [
  {
    lado: "solo-en-produccion",
    archivo: "constraints",
    contiene: "ListaPrecio_grupoId_nombre_key",
    clase: "solo catalogación",
    motivo:
      "Producción lo tiene como CONSTRAINT y la base nueva como ÍNDICE ÚNICO. " +
      "La garantía de unicidad es idéntica y las cinco FK que apuntan a " +
      "ListaPrecio van todas contra `id`, no contra (grupoId, nombre).",
  },
];

/**
 * Los dos enums cuyo ORDEN difiere. Se comparan por CONJUNTO, que es lo que sí
 * tiene que coincidir. El orden es consecuencia de `ALTER TYPE ... ADD VALUE`,
 * que agrega al final, y no lo mira ningún código: se comprobó que nada ordena
 * ni compara por rango sobre `ComprobanteProveedor.estado` ni sobre
 * `ImportacionListaFila.tipoCoincidencia`.
 */
const ENUMS_SOLO_CONJUNTO = new Set(["EstadoComprobante", "TipoCoincidenciaLista"]);

// ═══════════════════════════════════════════════════════════════════════════

let problemas = 0;
const notas = [];

function comparar(titulo, archivo, actuales) {
  const esperadas = leer(`${archivo}.txt`);
  const a = new Set(actuales);
  const e = new Set(esperadas);
  const soloProd = esperadas.filter((x) => !a.has(x));
  const soloNueva = actuales.filter((x) => !e.has(x));

  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 60 - titulo.length))}`);
  console.log(`   producción: ${esperadas.length}   base nueva: ${actuales.length}`);

  if (soloProd.length === 0 && soloNueva.length === 0) {
    console.log("   ✓ idénticas");
    return;
  }

  for (const [lado, lista] of [
    ["solo-en-produccion", soloProd],
    ["solo-en-la-base-nueva", soloNueva],
  ]) {
    for (const linea of lista) {
      const esperada = ESPERADAS.find(
        (x) => x.lado === lado && x.archivo === archivo && linea.includes(x.contiene)
      );
      if (esperada) {
        notas.push(`[${esperada.clase}] ${linea}\n      ${esperada.motivo}`);
        console.log(`   • esperada (${esperada.clase}): ${linea.slice(0, 90)}`);
      } else {
        problemas += 1;
        console.log(`   ✗ NO DECLARADA (${lado}): ${linea}`);
      }
    }
  }
}

// ── Tablas ────────────────────────────────────────────────────────────────
const tablas = (
  await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`
)
  .map((r) => r.tablename)
  .filter((t) => t !== "_prisma_migrations")
  .sort();
comparar("Tablas", "tablas", tablas);

// ── Columnas ──────────────────────────────────────────────────────────────
const columnas = (
  await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY 1,2`
)
  .map((r) => `${r.table_name}.${r.column_name}`)
  .sort();
comparar("Columnas", "columnas", columnas);

// ── Índices ───────────────────────────────────────────────────────────────
const indices = (
  await prisma.$queryRaw`
    SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1`
)
  .map((r) => `${r.tablename} :: ${r.indexdef}`)
  .filter((l) => !l.includes("_prisma_migrations"))
  .sort();
comparar("Índices", "indices", indices);

// ── Constraints ───────────────────────────────────────────────────────────
const constraints = (
  await prisma.$queryRaw`
    SELECT conrelid::regclass::text AS t, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`
)
  .map((r) => `${r.t} :: ${r.conname} :: ${r.def}`)
  .filter((l) => !l.includes("_prisma_migrations"))
  .sort();
comparar("Constraints", "constraints", constraints);

// ── Enums: conjunto siempre, orden solo donde corresponde ─────────────────
console.log(`\n── Enums ${"─".repeat(56)}`);
const enumsProd = new Map(
  leer("enums.txt").map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i), l.slice(i + 1).split(",")];
  })
);
const filasEnum = await prisma.$queryRaw`
  SELECT t.typname AS tipo, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS valores
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname='public'
  GROUP BY t.typname ORDER BY 1`;

console.log(`   producción: ${enumsProd.size}   base nueva: ${filasEnum.length}`);

for (const { tipo, valores } of filasEnum) {
  const nuevos = valores.split(",");
  const viejos = enumsProd.get(tipo);
  if (!viejos) {
    problemas += 1;
    console.log(`   ✗ NO DECLARADA: el enum ${tipo} no existe en producción`);
    continue;
  }
  const mismoConjunto = JSON.stringify([...nuevos].sort()) === JSON.stringify([...viejos].sort());
  if (!mismoConjunto) {
    problemas += 1;
    console.log(`   ✗ FUNCIONAL: ${tipo} tiene otros VALORES`);
    console.log(`       producción: ${viejos.join(",")}`);
    console.log(`       base nueva: ${nuevos.join(",")}`);
    continue;
  }
  const mismoOrden = valores === viejos.join(",");
  if (mismoOrden) continue;
  if (ENUMS_SOLO_CONJUNTO.has(tipo)) {
    notas.push(
      `[solo orden] enum ${tipo}: mismos valores, distinto orden.\n` +
        `      Huella de ALTER TYPE ... ADD VALUE. Ningún código ordena ni compara por rango sobre él.`
    );
    console.log(`   • esperada (solo orden): ${tipo}`);
  } else {
    problemas += 1;
    console.log(`   ✗ NO DECLARADA: el enum ${tipo} cambió de orden y no está en la lista`);
  }
}
for (const tipo of enumsProd.keys()) {
  if (!filasEnum.some((f) => f.tipo === tipo)) {
    problemas += 1;
    console.log(`   ✗ FUNCIONAL: falta el enum ${tipo}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

await prisma.$disconnect();

console.log(`\n${"═".repeat(72)}`);
if (notas.length > 0) {
  console.log("DIFERENCIAS ESPERADAS Y DOCUMENTADAS:\n");
  for (const n of notas) console.log(`  · ${n}\n`);
}
if (problemas > 0) {
  console.log(`DIFERENCIAS NO DECLARADAS: ${problemas}`);
  console.log("Ninguna diferencia se acepta sin estar escrita arriba con su motivo.");
  process.exit(1);
}
console.log("Sin diferencias fuera de las declaradas.");
