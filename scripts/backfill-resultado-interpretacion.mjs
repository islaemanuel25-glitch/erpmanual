// Rellena `resultadoInterpretacion` en las filas conciliadas antes de que la
// columna existiera.
//
// ── LA PRECAUCIÓN QUE DECIDE SI ESTO SIRVE ──────────────────────────────────
//
// El recargo y el rango de aumento esperado son POR IMPORTACIÓN e inmutables:
// se fijan al crearla y no hay endpoint que los cambie. Así que cada importación
// tiene los suyos y probablemente sean distintos entre sí.
//
// Si el backfill tomara los de la última importación, o un valor por defecto,
// las canceladas quedarían con un resultado que NUNCA tuvieron. Y como nadie las
// mira, nadie se enteraría: un dato inventado, guardado, con apariencia de
// calculado.
//
// Por eso los parámetros se leen de la cabecera de CADA importación, dentro del
// bucle, y el script aborta si a alguna le faltan en vez de completarlos con un
// default.
//
// ── POR QUÉ TAMBIÉN LAS CANCELADAS ──────────────────────────────────────────
//
// No se abren y nadie las trabaja, así que su resultado no se usa. Se rellenan
// igual para que la columna no quede con valores en unas filas y NULL en otras:
// dentro de seis meses, ese NULL obligaría a averiguar si significa "no se
// calculó nunca" o "el motor no pudo decidir".
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/backfill-resultado-interpretacion.mjs [--aplicar]
//
// Sin --aplicar simula: cuenta qué escribiría, sin escribir.

import { crearClientePrisma, LECTURA, ESCRITURA } from "./lib/clientePrisma.mjs";
import { analizarFila } from "../lib/proveedores/listas/confirmarPresentacion.js";

const APLICAR = process.argv.includes("--aplicar");
const prisma = await crearClientePrisma({ nivel: APLICAR ? ESCRITURA : LECTURA });

const log = (...a) => console.log(...a);

async function main() {
  log(APLICAR ? "MODO: APLICAR (escribe)" : "MODO: SIMULACIÓN (no escribe)");

  const importaciones = await prisma.importacionListaProveedor.findMany({
    select: {
      id: true, estado: true, recargoPct: true,
      aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
    },
    orderBy: { id: "asc" },
  });
  log(`importaciones: ${importaciones.length}`);

  let total = 0;
  const porResultado = {};

  for (const imp of importaciones) {
    // Se aborta en vez de completar con un default: una importación sin rango es
    // un dato que hay que mirar, no uno que se pueda suponer.
    if (imp.aumentoEsperadoMinPct === null || imp.aumentoEsperadoMaxPct === null) {
      throw new Error(`La importación ${imp.id} no tiene rango esperado. Revisar antes de rellenar.`);
    }

    const rango = {
      minPct: Number(imp.aumentoEsperadoMinPct),
      maxPct: Number(imp.aumentoEsperadoMaxPct),
    };
    log(`\n── importación ${imp.id} (${imp.estado}) · recargo ${imp.recargoPct} % · rango ${rango.minPct}–${rango.maxPct} %`);

    const filas = await prisma.importacionListaFila.findMany({
      where: { importacionId: imp.id },
      select: {
        id: true, descripcionProveedor: true, unidadProveedor: true,
        unidadesPorBulto: true, precioConIva: true, recargoPct: true,
        productoBaseId: true,
      },
    });

    // Los productos de las filas, para poder analizar. Una consulta por
    // importación, no una por fila.
    const baseIds = [...new Set(filas.map((f) => f.productoBaseId).filter(Boolean))];
    const bases = baseIds.length
      ? await prisma.productoBase.findMany({
          where: { id: { in: baseIds } },
          select: {
            id: true, unidad_medida: true, factor_pack: true,
            modoCompraProveedor: true, precio_costo: true,
          },
        })
      : [];
    const porId = new Map(bases.map((b) => [b.id, b]));

    const cambios = new Map();
    for (const f of filas) {
      const base = f.productoBaseId ? porId.get(f.productoBaseId) : null;
      // Sin producto no hay nada que interpretar: el resultado queda nulo, que es
      // distinto de "no se calculó".
      if (!base) continue;

      // El recargo de LA FILA, que es el que el motor le aplicó, y el rango de
      // ESTA importación. Nunca los de otra.
      const a = analizarFila({
        fila: f,
        base,
        recargoPct: f.recargoPct,
        rango,
      });
      if (!a?.resultado) continue;
      cambios.set(f.id, a.resultado);
      porResultado[a.resultado] = (porResultado[a.resultado] ?? 0) + 1;
    }

    log(`   filas: ${filas.length} · con producto: ${filas.filter((f) => f.productoBaseId).length} · a escribir: ${cambios.size}`);
    total += cambios.size;

    if (APLICAR && cambios.size) {
      // Agrupado por valor: tres updateMany en vez de novecientos update.
      const porValor = new Map();
      for (const [filaId, valor] of cambios) {
        if (!porValor.has(valor)) porValor.set(valor, []);
        porValor.get(valor).push(filaId);
      }
      for (const [valor, ids] of porValor) {
        const r = await prisma.importacionListaFila.updateMany({
          where: { id: { in: ids } },
          data: { resultadoInterpretacion: valor },
        });
        log(`   ${valor}: ${r.count}`);
      }
    }
  }

  log(`\n── total ──`);
  log(`filas a escribir: ${total}`);
  for (const [k, v] of Object.entries(porResultado)) log(`   ${k}: ${v}`);
  if (!APLICAR) log("\n(simulación: no se escribió nada. Correr con --aplicar)");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
