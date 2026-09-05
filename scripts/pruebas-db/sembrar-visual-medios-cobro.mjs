// SEMBRAR LOS ESCENARIOS QUE HAY QUE PODER VER EN COBROS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/sembrar-visual-medios-cobro.mjs \
//     --pantallas /tmp/pantallas-configuradas.json
//
// ── PARA QUÉ EXISTE ────────────────────────────────────────────────────────
//
// La validación visual necesita ver cuatro condiciones, y tres de ellas no se
// pueden inventar desde la pantalla: un medio oculto, una comisión heredada del
// grupo y una comisión decidida en el local. La cuarta —los defaults— es la
// ausencia de todo esto, así que se fotografía ANTES de correr este script.
//
// ── DÓNDE CORRE Y DÓNDE NO ─────────────────────────────────────────────────
//
// Solo contra una base descartable. `scripts/lib/clientePrisma.mjs` en nivel
// ESCRITURA exige host local y NODE_ENV distinto de production, y aborta con
// código 2 si algo de eso falla. En la práctica esto vive en el runner efímero
// de GitHub Actions, sobre un PostgreSQL que se destruye al terminar.
//
// NO corre contra producción: BORRA los medios de cobro de los locales del
// grupo para dejar el escenario en un estado conocido.
//
// ── POR QUÉ ADEMÁS ESCRIBE UN JSON ─────────────────────────────────────────
//
// Porque las dos pantallas de "editar medio" se direccionan por la clave de
// edición del medio, y esa clave no se puede saber antes de crear las filas.
// Escribirla acá es lo único que evita que el workflow la adivine — que es
// exactamente el contrato que la UI tiene prohibido asumir.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

import fs from "node:fs";

const { claveEdicionDe } = await import("../../lib/pos-ventas/mediosCobro.js");

const arg = (n, def = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const RUTA_COBROS = "/modulos/configuracion/pos-ventas/cobros";

// Las tres comisiones del grupo, distintas entre sí para que se vea cuál hereda
// cada medio. Si fueran iguales, una comisión heredada y una decidida en el
// local se verían con el mismo número y la foto no probaría nada.
const COMISIONES_GRUPO = { comisionDebito: 7, comisionCredito: 10, comisionMercadopago: 5 };

// El escenario. Cada línea existe por una condición que hay que poder ver:
//
//   Efectivo      — sin recargo y sin comisión: el renglón que dice "Sin ..."
//   Mercado Pago  — comisión HEREDADA del grupo (comisionPct null) + recargo
//   Débito        — heredada también, y sin procesador: el otro renglón posible
//   Crédito       — OCULTO y con comisión decidida en el local (override)
//
// Ningún número de acá sale de la pantalla ni del mockup: son datos de prueba.
const MEDIOS = [
  { nombre: "Efectivo", activo: true, orden: 1, tipoContable: "EFECTIVO", procesador: null, comisionPct: null, recargo: 0 },
  { nombre: "Mercado Pago", activo: true, orden: 2, tipoContable: "MERCADOPAGO", procesador: "MERCADOPAGO", comisionPct: null, recargo: 5 },
  { nombre: "Débito", activo: true, orden: 3, tipoContable: "DEBITO", procesador: null, comisionPct: null, recargo: 5 },
  { nombre: "Crédito", activo: false, orden: 4, tipoContable: "CREDITO", procesador: "BANCO", comisionPct: 7, recargo: 10 },
];

async function main() {
  const grupo = await prisma.grupo.findFirst({ orderBy: { id: "asc" } });
  if (!grupo) {
    console.error("ABORTADO: no hay ningún grupo. ¿Corrió `prisma/seed.js` antes?");
    process.exit(2);
  }

  await prisma.configuracionGrupo.upsert({
    where: { grupoId: grupo.id },
    update: COMISIONES_GRUPO,
    create: { grupoId: grupo.id, ...COMISIONES_GRUPO },
  });

  const vinculos = await prisma.grupoLocal.findMany({
    where: { grupoId: grupo.id },
    select: { localId: true },
  });
  const locales = vinculos.map((v) => v.localId);
  if (locales.length === 0) {
    console.error("ABORTADO: el grupo no tiene locales.");
    process.exit(2);
  }

  // TODOS los locales del grupo, y no solo uno, porque el arnés elige su
  // ubicación por su cuenta al fijar el contexto. Sembrar uno solo dejaría la
  // foto a merced de cuál eligió.
  const creados = {};
  for (const localId of locales) {
    await prisma.medioCobroLocal.deleteMany({ where: { localId } });
    await prisma.recargoPagoLocal.deleteMany({ where: { localId } });

    for (const m of MEDIOS) {
      const fila = await prisma.medioCobroLocal.create({
        data: {
          localId,
          nombre: m.nombre,
          activo: m.activo,
          orden: m.orden,
          tipoContable: m.tipoContable,
          procesador: m.procesador,
          comisionPct: m.comisionPct,
        },
      });
      creados[`${localId}:${m.tipoContable}`] = fila;

      await prisma.recargoPagoLocal.create({
        data: { localId, medio: m.tipoContable, porcentaje: m.recargo },
      });
    }
    console.log(`✅ local ${localId}: ${MEDIOS.length} medios y sus recargos`);
  }

  // ── LAS PANTALLAS DE LA SEGUNDA PASADA ───────────────────────────────────
  //
  // La clave de edición se pide con `claveEdicionDe`, que es la MISMA función
  // que usa el servidor para armarla. Componerla acá a mano —"el id como
  // cadena"— sería escribir por segunda vez un contrato que ya existe, y el día
  // que cambie quedarían dos versiones.
  const salida = arg("pantallas");
  if (salida) {
    const primerLocal = locales[0];
    const mp = creados[`${primerLocal}:MERCADOPAGO`];
    const credito = creados[`${primerLocal}:CREDITO`];

    const pantallas = [
      { nombre: "cobros-configurado", url: RUTA_COBROS, sinTabla: true },
      {
        nombre: "editar-medio-comision-heredada",
        url: `${RUTA_COBROS}/${encodeURIComponent(claveEdicionDe(mp))}`,
        sinTabla: true,
      },
      {
        nombre: "editar-medio-comision-local",
        url: `${RUTA_COBROS}/${encodeURIComponent(claveEdicionDe(credito))}`,
        sinTabla: true,
      },
    ];

    fs.writeFileSync(salida, JSON.stringify(pantallas, null, 2));
    console.log(`✅ pantallas de la segunda pasada → ${salida}`);
    for (const p of pantallas) console.log(`   ${p.nombre}  ${p.url}`);
  }
}

let codigo = 0;
try {
  await main();
} catch (err) {
  console.error(err);
  codigo = 1;
} finally {
  await prisma.$disconnect();
}
process.exit(codigo);
