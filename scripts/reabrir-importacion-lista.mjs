// scripts/reabrir-importacion-lista.mjs
//
// Reabre una importación que quedó cerrada por haber aplicado una tanda.
//
// ── QUÉ PASÓ ────────────────────────────────────────────────────────────────
//
// El endpoint de aplicación ponía `estado = APLICADA` siempre, sin mirar si
// quedaban filas. Con 101 aplicadas y 816 pendientes, la importación quedó
// cerrada: no se podía seleccionar, ni vincular, ni aplicar una segunda tanda,
// porque las tres compuertas exigían el estado CONCILIADA.
//
// ── QUÉ HACE ESTE SCRIPT, Y QUÉ NO ──────────────────────────────────────────
//
// Cambia UNA cosa: el estado de la cabecera, de APLICADA a PARCIALMENTE_APLICADA,
// y solo si de verdad quedan filas pendientes.
//
// NO toca las filas. NO toca costos, precios ni productos. NO reprocesa la
// conciliación. NO cambia ninguna coincidencia. Las filas ya aplicadas quedan
// exactamente como están: su marca `aplicada` es lo que impide que se vuelvan a
// aplicar, y esa marca no se toca.
//
// Por defecto SIMULA. Para escribir hay que pasar --escribir.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/reabrir-importacion-lista.mjs --id 3 [--escribir]

import { PrismaClient } from "@prisma/client";

import { resumirProgreso } from "../lib/proveedores/listas/macheo.js";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const ID = Number(args[args.indexOf("--id") + 1]);
const ESCRIBIR = args.includes("--escribir");
if (!Number.isInteger(ID) || ID <= 0) {
  console.error("Falta --id <importacionId>");
  process.exit(1);
}

async function main() {
  const cab = await prisma.importacionListaProveedor.findUnique({
    where: { id: ID },
    include: { proveedor: { select: { nombre: true } } },
  });
  if (!cab) {
    console.error(`No existe la importación ${ID}.`);
    process.exit(1);
  }

  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID },
    select: { aplicada: true, excluidaManual: true, estado: true },
  });
  const p = resumirProgreso(filas);

  console.log(`\n=== REABRIR IMPORTACIÓN ${ID} ===`);
  console.log(`proveedor : ${cab.proveedor.nombre}`);
  console.log(`archivo   : ${cab.archivoNombre}`);
  console.log(`estado    : ${cab.estado}`);
  console.log(`modo      : ${ESCRIBIR ? "ESCRIBIR" : "SIMULACIÓN"}`);
  console.log("");
  console.log(`  aplicadas          : ${p.aplicadas}`);
  console.log(`  listas pendientes  : ${p.listasPendientes}`);
  console.log(`  requieren revisión : ${p.requierenRevision}`);
  console.log(`  sin vincular       : ${p.sinVincular}`);
  console.log(`  ambiguas           : ${p.ambiguas}`);
  console.log(`  excluidas          : ${p.excluidas}`);
  console.log(`  PENDIENTES         : ${p.pendientes}`);
  console.log(`  total de filas     : ${filas.length}`);

  if (cab.estado !== "APLICADA") {
    console.log(`\nNo hay nada que reabrir: el estado es ${cab.estado}, no APLICADA.`);
    await prisma.$disconnect();
    return;
  }

  if (p.pendientes === 0) {
    console.log("\nNo quedan filas pendientes: la importación está bien cerrada. No se reabre.");
    await prisma.$disconnect();
    return;
  }

  console.log(`\nCorresponde reabrir: hay ${p.pendientes} filas pendientes de decisión.`);
  console.log("Las filas NO se tocan. Solo cambia el estado de la cabecera.");

  if (!ESCRIBIR) {
    console.log("\nSIMULACIÓN: no se escribió nada. Agregá --escribir.");
    await prisma.$disconnect();
    return;
  }

  // Foto de las aplicadas ANTES, para poder afirmar después que no se movieron.
  const antes = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID, aplicada: true },
    select: { id: true, costoAplicado: true, ventaNueva: true, aplicadaEn: true, resultadoAplicacion: true },
    orderBy: { id: "asc" },
  });

  await prisma.$transaction(async (tx) => {
    const actual = await tx.importacionListaProveedor.findUnique({
      where: { id: ID },
      select: { estado: true },
    });
    if (actual.estado !== "APLICADA") throw new Error(`El estado cambió a ${actual.estado}. Se aborta.`);

    await tx.importacionListaProveedor.update({
      where: { id: ID },
      data: { estado: "PARCIALMENTE_APLICADA" },
    });
  }, { maxWait: 10000, timeout: 60000 });

  const despues = await prisma.importacionListaFila.findMany({
    where: { importacionId: ID, aplicada: true },
    select: { id: true, costoAplicado: true, ventaNueva: true, aplicadaEn: true, resultadoAplicacion: true },
    orderBy: { id: "asc" },
  });

  const iguales = JSON.stringify(antes) === JSON.stringify(despues);
  console.log(`\nESCRITO: la importación ${ID} quedó en PARCIALMENTE_APLICADA.`);
  console.log(`Las ${despues.length} filas aplicadas quedaron intactas: ${iguales ? "sí" : "NO — REVISAR"}`);
  console.log("No se modificó ningún costo, precio ni producto.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
