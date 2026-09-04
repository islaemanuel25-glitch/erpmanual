// ¿LO QUE `prisma migrate diff` PROPONE ES SOLO LO INEVITABLE?
//
//   node scripts/pruebas-db/revisar-deriva.mjs <archivo.sql>
//
// ── POR QUÉ NO ALCANZA CON `--exit-code` ───────────────────────────────────
//
// `migrate diff` compara lo que producen las migraciones contra lo que declara
// `schema.prisma`. La baseline crea NUEVE objetos que el schema no puede
// describir —ocho índices parciales y un CHECK—, así que el diff SIEMPRE los va
// a ver de más y proponer borrarlos.
//
// Con `--exit-code` a secas, ese paso quedaría rojo para siempre. Y un paso que
// está siempre rojo deja de informar: a la tercera vez nadie lo mira, y la
// deriva de verdad —una columna que alguien agregó al schema y no migró— entra
// escondida detrás del rojo de siempre.
//
// Así que en vez de tolerar el rojo se mira el CONTENIDO: se exige que lo único
// que el diff proponga sea borrar esos nueve, nombrados uno por uno. Cualquier
// otra sentencia pone esto en rojo.
//
// Es la misma idea que el comparador contra producción: las diferencias
// esperadas se enumeran con su motivo, no se aceptan en bloque.

import fs from "node:fs";

const archivo = process.argv[2];
if (!archivo) {
  console.error("Falta el archivo con la salida de `prisma migrate diff --script`.");
  process.exit(2);
}

const sql = fs.readFileSync(archivo, "utf8");

/**
 * Los nueve objetos que el schema no puede declarar. El diff solo puede
 * proponer BORRARLOS: son los que la baseline agrega a mano.
 */
const INEVITABLES = [
  "Turno_local_vendedor_abierto_key",
  "CierrePreparacion_turno_vigente_key",
  "RetiroPreparacion_turno_vigente_key",
  "CambioPendiente_turnoOrigen_vigente_key",
  "ComprobanteProveedor_identidad_key",
  "importacion_archivo_unica",
  "ListaPrecio_default_unico_por_grupo",
  "StockLocal_localId_limitesSinAjustar_idx",
  "ComboComponente_mismo_local_check",
];

// Sentencias reales: sin comentarios ni líneas vacías. Se parte por `;` porque
// el script de Prisma es una sentencia por línea o por bloque.
const sentencias = sql
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"))
  .join(" ")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

const noEsperadas = [];
const esperadas = [];

for (const s of sentencias) {
  const nombra = INEVITABLES.find((o) => s.includes(o));
  // Solo cuenta como esperada si además es un DROP: que el diff proponga CREAR
  // uno de los nueve significaría que la baseline se quedó sin ellos, que es
  // exactamente el accidente que todo esto quiere impedir.
  if (nombra && /^\s*(DROP\s+INDEX|ALTER\s+TABLE[\s\S]*DROP\s+CONSTRAINT)/i.test(s)) {
    esperadas.push(`${nombra}  ←  ${s.slice(0, 80)}`);
  } else {
    noEsperadas.push(s);
  }
}

console.log(`Sentencias en el diff: ${sentencias.length}`);
console.log(`  esperadas (los 9 que el schema no puede declarar): ${esperadas.length}`);
for (const e of esperadas) console.log(`    · ${e}`);

if (noEsperadas.length > 0) {
  console.log(`\nDERIVA REAL — ${noEsperadas.length} sentencia(s) que nadie declaró:\n`);
  for (const s of noEsperadas) console.log(`  ✗ ${s};`);
  console.log(
    "\nAlgo del schema no está en las migraciones, o al revés. Si el cambio es a" +
      "\npropósito, va en una migración nueva; si no, hay que entender de dónde salió."
  );
  process.exit(1);
}

// Y la otra mitad, que es la que se olvida: que los nueve ESTÉN. Si la baseline
// perdiera su bloque manual, el diff no propondría borrarlos y este script daría
// verde por ausencia. `estructura.mjs` lo comprueba contra la base de verdad;
// acá se comprueba la coherencia entre los dos.
const faltantes = INEVITABLES.filter((o) => !esperadas.some((e) => e.startsWith(o)));
if (faltantes.length > 0) {
  console.log(`\nFALTAN EN EL DIFF: ${faltantes.join(", ")}`);
  console.log(
    "El diff no propone borrarlos, así que las migraciones no los crean.\n" +
      "La baseline perdió su bloque de SQL manual."
  );
  process.exit(1);
}

console.log("\nSin deriva: lo único que el diff propone son los 9 objetos inevitables.");
