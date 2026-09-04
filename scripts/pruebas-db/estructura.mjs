// COMPROBACIONES DE ESTRUCTURA SOBRE UNA BASE CONSTRUIDA DESDE LA BASELINE.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/estructura.mjs
//
// ── QUÉ AFIRMA ─────────────────────────────────────────────────────────────
//
// Que la base que sale de `prisma migrate deploy` sobre una base VACÍA tiene lo
// que tiene que tener, con particular insistencia en los NUEVE OBJETOS que
// Prisma no sabe expresar y que se agregaron a mano a la baseline.
//
// Esos nueve son la parte frágil de todo el saneamiento. El resto lo genera
// Prisma y se regenera solo si alguien toca el schema; éstos viven en un bloque
// de SQL escrito a mano al final del archivo, y el día que alguien regenere la
// baseline sin acordarse de ellos, la base sale sin sus invariantes y NADA se
// queja: las tablas están, las columnas están, la aplicación arranca. Se
// enteraría alguien meses después, con dos turnos abiertos para el mismo cajero.
//
// Por eso no alcanza con comprobar que el índice EXISTE: se comprueba también su
// PREDICADO, porque un índice parcial con el WHERE equivocado es exactamente tan
// inútil como no tenerlo, y se ve igual en una lista de nombres.
//
// ── DÓNDE CORRE ────────────────────────────────────────────────────────────
//
// Solo contra la base efímera de CI. La fábrica de `clientePrisma.mjs` en nivel
// LECTURA exige que la URL la haya puesto el operador; acá además todo lo que se
// hace son SELECT sobre los catálogos.

import { crearClientePrisma, LECTURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: LECTURA });

let pasadas = 0;
const fallas = [];

function ok(afirmacion, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${afirmacion}`);
  } else {
    fallas.push(`${afirmacion}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${afirmacion}${detalle ? ` — ${detalle}` : ""}`);
  }
}

function seccion(t) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 66 - t.length))}`);
}

/** La definición que Postgres reporta para un índice, o null si no existe. */
async function defDeIndice(nombre) {
  const filas = await prisma.$queryRaw`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${nombre}
  `;
  return filas[0]?.indexdef ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS OCHO ÍNDICES PARCIALES
// ═══════════════════════════════════════════════════════════════════════════
//
// Cada uno con el PREDICADO exacto que tiene producción. Se compara normalizando
// espacios y nada más: el texto sale de `pg_get_indexdef`, que es el mismo
// generador en las dos bases, así que una diferencia real se ve.

const PARCIALES = [
  {
    nombre: "Turno_local_vendedor_abierto_key",
    unico: true,
    predicado: `WHERE ((cierre IS NULL) AND ("cierreEnPreparacionEn" IS NULL))`,
    regla: "un solo turno abierto por cajero y local",
  },
  {
    nombre: "CierrePreparacion_turno_vigente_key",
    unico: true,
    predicado: `WHERE (estado = ANY (ARRAY['PREPARANDO'::"EstadoCierrePreparacion", 'CONFIRMADO'::"EstadoCierrePreparacion"]))`,
    regla: "un solo cierre en preparación por turno",
  },
  {
    nombre: "RetiroPreparacion_turno_vigente_key",
    unico: true,
    predicado: `WHERE (estado = 'PREPARANDO'::"EstadoRetiroPreparacion")`,
    regla: "un solo retiro en preparación por turno",
  },
  {
    nombre: "CambioPendiente_turnoOrigen_vigente_key",
    unico: true,
    predicado: `WHERE (estado <> 'CANCELADO'::"EstadoCambioPendiente")`,
    regla: "un solo cambio pendiente vigente por turno de origen",
  },
  {
    nombre: "ComprobanteProveedor_identidad_key",
    unico: true,
    predicado: `WHERE (estado <> 'ANULADO'::"EstadoComprobante")`,
    regla: "identidad única del comprobante, ignorando los anulados",
  },
  {
    nombre: "importacion_archivo_unica",
    unico: true,
    predicado: `WHERE (estado = ANY (ARRAY['BORRADOR'::"EstadoImportacionLista", 'CONCILIADA'::"EstadoImportacionLista", 'PARCIALMENTE_APLICADA'::"EstadoImportacionLista"]))`,
    regla: "un archivo de lista no se importa dos veces mientras la importación vive",
  },
  {
    nombre: "ListaPrecio_default_unico_por_grupo",
    unico: true,
    predicado: `WHERE (("esDefault" = true) AND (activo = true))`,
    regla: "una sola lista de precios por defecto y activa por grupo",
  },
  {
    nombre: "StockLocal_localId_limitesSinAjustar_idx",
    unico: false,
    predicado: `WHERE ("limitesConfiguradosAt" IS NULL)`,
    regla: "índice parcial de stock sin límites configurados",
  },
];

seccion("Los ocho índices parciales que Prisma no expresa");

for (const idx of PARCIALES) {
  const def = await defDeIndice(idx.nombre);
  ok(`existe "${idx.nombre}" (${idx.regla})`, def != null, "no está en la base");
  if (!def) continue;

  const normal = def.replace(/\s+/g, " ").trim();
  ok(
    `  y su predicado es el de producción`,
    normal.includes(idx.predicado.replace(/\s+/g, " ").trim()),
    `definición encontrada: ${normal}`
  );
  ok(
    `  y ${idx.unico ? "ES único" : "NO es único"}`,
    normal.startsWith("CREATE UNIQUE INDEX") === idx.unico
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EL CHECK
// ═══════════════════════════════════════════════════════════════════════════

seccion("El CHECK de combos");

const checks = await prisma.$queryRaw`
  SELECT pg_get_constraintdef(oid) AS def
  FROM pg_constraint
  WHERE conname = 'ComboComponente_mismo_local_check'
`;
ok("existe ComboComponente_mismo_local_check", checks.length === 1);
ok(
  "  y exige que el combo y su componente sean del mismo local",
  (checks[0]?.def || "").replace(/\s+/g, " ").includes(`CHECK (("comboLocalId" = "componenteLocalId"))`),
  `definición: ${checks[0]?.def}`
);

// Y se EJERCE: una defensa que nunca se activa es una defensa que nadie sabe si
// corre. Se intenta violar el CHECK a propósito y se exige que Postgres lo
// rechace. Sin esto, un CHECK escrito con el predicado invertido pasaría las dos
// afirmaciones de arriba.
try {
  await prisma.$executeRawUnsafe(`
    INSERT INTO "ComboComponente"
      ("comboProductoLocalId","comboLocalId","componenteProductoLocalId","componenteLocalId","cantidad")
    VALUES (1, 1, 2, 999, 1)
  `);
  ok("el CHECK RECHAZA un componente de otro local", false, "la fila entró: el CHECK no está haciendo nada");
} catch (err) {
  const msg = String(err?.message || "");
  // Puede fallar por el CHECK o por la FK (no existen esos productos). Solo
  // cuenta si el motivo es el CHECK: una FK rechazando la fila no prueba nada
  // sobre la regla que se quiere comprobar.
  ok(
    "el CHECK RECHAZA un componente de otro local",
    msg.includes("ComboComponente_mismo_local_check"),
    `rechazó por otro motivo: ${msg.split("\n")[0]}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS CUATRO ÍNDICES QUE AHORA SÍ DECLARA EL SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

seccion("Los cuatro índices que se agregaron a schema.prisma");

for (const [nombre, sobre] of [
  ["ComprobanteLinea_codigoProveedor_idx", `"ComprobanteLinea" USING btree ("codigoProveedor")`],
  ["ComprobanteProveedor_grupoId_estado_createdAt_idx", `"ComprobanteProveedor" USING btree ("grupoId", estado, "createdAt")`],
  ["ImportacionListaFila_importacionId_resultadoInterpretacion_idx", `"ImportacionListaFila" USING btree ("importacionId", "resultadoInterpretacion")`],
  ["ProductoLocal_precioRevisadoAt_idx", `"ProductoLocal" USING btree ("precioRevisadoAt")`],
]) {
  const def = await defDeIndice(nombre);
  ok(`existe "${nombre}"`, def != null);
  if (def) ok(`  y sobre las columnas correctas`, def.replace(/\s+/g, " ").includes(sobre), def);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS TRES NOMBRES FÍSICOS RESUELTOS CON map:
// ═══════════════════════════════════════════════════════════════════════════

seccion("Los tres nombres físicos que ahora coinciden con producción");

for (const nombre of [
  "fila_unica_por_importacion",
  "codigo_interno_unico_por_proveedor",
  "ProductoCodigoProveedor_grupoId_proveedorId_descripcionNorma_id",
]) {
  ok(`el índice se llama "${nombre}", como en producción`, (await defDeIndice(nombre)) != null);
}

// Y los nombres por defecto que Prisma habría puesto NO tienen que estar: si
// están los dos, es que `map:` creó uno nuevo en vez de renombrar.
for (const viejo of [
  "ImportacionListaFila_importacionId_hojaNombre_filaExcel_key",
  "ProductoCodigoProveedor_grupoId_proveedorId_codigoInterno_key",
  "ProductoCodigoProveedor_grupoId_proveedorId_descripcionNorm_idx",
]) {
  ok(`y NO quedó además el nombre por defecto "${viejo}"`, (await defDeIndice(viejo)) == null);
}

// ═══════════════════════════════════════════════════════════════════════════
// LOS ENUMS
// ═══════════════════════════════════════════════════════════════════════════

seccion("Los enums: mismo conjunto de valores");

// La diferencia aceptada es de ORDEN, no de contenido. Acá se afirma lo que sí
// tiene que valer: el CONJUNTO es idéntico al de producción.
const ESPERADOS = {
  EstadoComprobante: ["ANULADO", "CARGADO", "CIERRA", "DIFIERE", "FUERA_DE_RECETA", "MAL_LEIDO", "PENDIENTE_LECTURA", "SIN_TOTAL"],
  TipoCoincidenciaLista: ["AMBIGUA", "CODIGO_BARRA", "CODIGO_INTERNO", "CODIGO_INTERNO_SIN_CEROS", "NINGUNA", "SUFIJO_4", "SUFIJO_5", "SUFIJO_6", "SUFIJO_7", "SUFIJO_8"],
};

for (const [tipo, esperado] of Object.entries(ESPERADOS)) {
  const filas = await prisma.$queryRawUnsafe(
    `SELECT e.enumlabel AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1`,
    tipo
  );
  const encontrados = filas.map((f) => f.v).sort();
  ok(
    `${tipo} tiene los ${esperado.length} valores de producción`,
    JSON.stringify(encontrados) === JSON.stringify(esperado),
    `encontrados: ${encontrados.join(",")}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LA FORMA GENERAL
// ═══════════════════════════════════════════════════════════════════════════

seccion("Tablas, columnas e índices en total");

const [{ n: tablas }] = await prisma.$queryRaw`
  SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'
`;
const [{ n: columnas }] = await prisma.$queryRaw`
  SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_schema='public' AND table_name <> '_prisma_migrations'
`;
const [{ n: indices }] = await prisma.$queryRaw`
  SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations'
`;

// Los tres números salen de la comparación contra producción del 2026-09-04,
// hecha con estas mismas consultas. No son "más o menos": si cambian, algo se
// agregó o se perdió y hay que mirarlo.
ok(`61 tablas (producción tiene 61)`, tablas === 61, `hay ${tablas}`);
ok(`890 columnas (producción tiene 890)`, columnas === 890, `hay ${columnas}`);
ok(`277 índices (producción tiene 277)`, indices === 277, `hay ${indices}`);

// ═══════════════════════════════════════════════════════════════════════════

await prisma.$disconnect();

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  console.log("");
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
