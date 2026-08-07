// Recálculo masivo CONTROLADO de precios de venta a partir del margen configurado.
//
// POR QUÉ EXISTE: el arreglo de la propagación actúa sobre los cambios de costo
// FUTUROS. Los productos cuyo costo ya subió sin arrastrar el precio quedaron mal
// en la base y ningún despliegue los corrige solo. Este script los detecta y, con
// una bandera explícita, los recalcula.
//
// QUÉ HACE Y QUÉ NO:
//   · Recalcula precio_venta = costo efectivo + margen CONFIGURADO + redondeo de la
//     ficha, para cada ProductoLocal por separado. El margen del local manda; si no
//     tiene, se usa el de la ficha.
//   · NUNCA reconstruye un margen dividiendo precio_venta por precio_costo. Si no
//     hay margen configurado en ningún lado, la fila NO se toca: se informa aparte,
//     porque un precio sin regla es un precio puesto a mano y decidirlo es del
//     negocio, no del script.
//   · No toca costos. No toca márgenes. Solo precio_venta.
//
// USO (el modo por defecto es simulación, no escribe nada):
//   DATABASE_URL=... node scripts/recalcular-precios-por-margen.mjs
//   DATABASE_URL=... node scripts/recalcular-precios-por-margen.mjs --solo-bajo-costo
//   DATABASE_URL=... node scripts/recalcular-precios-por-margen.mjs --aplicar --confirmo
//
//   --solo-bajo-costo  limita la acción a las filas que HOY venden por debajo del
//                      costo. Es el primer pase recomendado en producción: arregla
//                      lo que está sangrando sin mover el resto de la lista.
//   --aplicar          escribe. Exige además --confirmo.
//   --limite N         corta después de N filas (para probar de a poco).

// LA BASE SE DICE, NO SE HEREDA: la valida scripts/lib/clientePrisma.mjs. La
// simulación es de solo lectura y por eso puede correrse contra cualquier base,
// que es como se usa para auditar producción; --aplicar sube a nivel escritura y
// entonces exige servidor local, además del --confirmo que ya pedía.
import { crearClientePrisma, LECTURA, ESCRITURA } from "./lib/clientePrisma.mjs";
import { precioDesdeMargen, hayReglaAutomatica } from "../lib/precios/precioDesdeMargen.js";

const arg = (n) => process.argv.includes(`--${n}`);
const valor = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const APLICAR = arg("aplicar");
const CONFIRMO = arg("confirmo");
const SOLO_BAJO_COSTO = arg("solo-bajo-costo");
const LIMITE = valor("limite") ? Number(valor("limite")) : null;

if (APLICAR && !CONFIRMO) {
  console.error("--aplicar exige --confirmo. Corré primero sin banderas para ver la simulación.");
  process.exit(2);
}

const prisma = await crearClientePrisma({ nivel: APLICAR ? ESCRITURA : LECTURA });
// Seguro después de la fábrica: si el operador no puso la variable, ya abortó.
const nombreBase = (() => {
  try { return new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""); } catch { return "(?)"; }
})();

const n = (v) => (v == null ? null : Number(v));

async function main() {
  console.log(`Base: ${nombreBase}`);
  console.log(`Modo: ${APLICAR ? "APLICAR (escribe)" : "simulación (no escribe)"}` +
    `${SOLO_BAJO_COSTO ? " · solo filas por debajo del costo" : ""}`);
  console.log("");

  const filas = await prisma.productoLocal.findMany({
    select: {
      id: true, localId: true, baseId: true, margen: true,
      precio_costo: true, precio_venta: true,
      local: { select: { nombre: true } },
      base: { select: { nombre: true, margen: true, precio_costo: true, redondeo_100: true, es_combo: true } },
    },
    orderBy: [{ baseId: "asc" }, { localId: "asc" }],
  });

  const aCorregir = [];
  const sinMargen = [];
  let yaCorrectas = 0;
  let combos = 0;

  for (const f of filas) {
    if (f.base?.es_combo) { combos++; continue; }

    // Costo efectivo de la ubicación: su override, y si no el de la ficha.
    const costo = n(f.precio_costo) ?? n(f.base?.precio_costo);
    const venta = n(f.precio_venta) ?? null;
    if (costo == null || costo <= 0) continue;

    const bajoCosto = venta != null && venta < costo;
    if (SOLO_BAJO_COSTO && !bajoCosto) continue;

    const margenConfigurado = f.margen != null ? f.margen : f.base?.margen;

    if (!hayReglaAutomatica(margenConfigurado)) {
      if (bajoCosto) {
        sinMargen.push({
          baseId: f.baseId, producto: f.base?.nombre, local: f.local?.nombre,
          costo, venta,
        });
      }
      continue;
    }

    const { aplica, precioFinal } = precioDesdeMargen({
      costo,
      margenConfigurado,
      redondeo100: f.base?.redondeo_100 === true,
    });
    if (!aplica) continue;

    if (venta != null && Math.abs(venta - precioFinal) < 0.005) { yaCorrectas++; continue; }

    aCorregir.push({
      id: f.id, baseId: f.baseId, producto: f.base?.nombre, local: f.local?.nombre,
      costo, venta, nuevo: precioFinal, margen: Number(margenConfigurado), bajoCosto,
    });
  }

  const objetivo = LIMITE ? aCorregir.slice(0, LIMITE) : aCorregir;

  console.log(`Filas ProductoLocal analizadas: ${filas.length} (combos omitidos: ${combos})`);
  console.log(`Ya coinciden con su margen: ${yaCorrectas}`);
  console.log(`A recalcular: ${aCorregir.length}${LIMITE ? ` (se procesarán ${objetivo.length} por --limite)` : ""}`);
  console.log(`  · de esas, vendiendo HOY por debajo del costo: ${aCorregir.filter((x) => x.bajoCosto).length}`);
  console.log(`Sin margen configurado y por debajo del costo (NO se tocan, requieren decisión): ${sinMargen.length}`);
  console.log("");

  const muestra = objetivo.slice(0, 25);
  if (muestra.length) {
    console.log("Muestra de lo que cambiaría:");
    for (const x of muestra) {
      console.log(`  ${x.bajoCosto ? "⚠ " : "  "}[${x.local}] ${x.producto} — costo ${x.costo}, margen ${x.margen}% : ${x.venta} → ${x.nuevo}`);
    }
    if (objetivo.length > muestra.length) console.log(`  … y ${objetivo.length - muestra.length} más`);
    console.log("");
  }

  if (sinMargen.length) {
    console.log("Sin margen configurado y vendiendo bajo costo (revisión manual):");
    for (const x of sinMargen.slice(0, 25)) {
      console.log(`  ⚠ [${x.local}] ${x.producto} — costo ${x.costo}, venta ${x.venta}`);
    }
    if (sinMargen.length > 25) console.log(`  … y ${sinMargen.length - 25} más`);
    console.log("");
  }

  if (!APLICAR) {
    console.log("Simulación: no se escribió nada. Para aplicar: --aplicar --confirmo");
    return;
  }

  let escritas = 0;
  for (const x of objetivo) {
    await prisma.productoLocal.update({ where: { id: x.id }, data: { precio_venta: x.nuevo } });
    escritas++;
  }
  console.log(`Aplicado: ${escritas} fila(s) de ProductoLocal actualizadas.`);
  console.log("Ni los costos ni los márgenes fueron modificados.");
}

main()
  .catch((e) => { console.error("ERROR:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
