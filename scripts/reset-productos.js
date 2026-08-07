// Borra TODOS los productos y sus datos relacionados. Es el script de mayor radio
// de destrucción del repo, así que va a nivel DESTRUCTIVO: además de
// CONFIRM_RESET_PRODUCTOS —que se conserva— la fábrica exige servidor local,
// nombre de base en la lista blanca y SEED_DESTRUCTIVO igual a ese nombre.
//
//   CONFIRM_RESET_PRODUCTOS=true SEED_DESTRUCTIVO=<base> DATABASE_URL=…/<base> \
//     node scripts/reset-productos.js
import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";

// La confirmación propia se evalúa ANTES de pedir el cliente: sin ella no se
// abre conexión ni se valida nada más.
if (process.env.CONFIRM_RESET_PRODUCTOS !== "true") {
  console.error(
    "Abortado. Ejecutar con:\n  CONFIRM_RESET_PRODUCTOS=true node scripts/reset-productos.js"
  );
  process.exit(1);
}

const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

async function main() {

  console.log("=== RESET PRODUCTOS ===");
  console.log("Esto eliminara TODOS los productos y datos relacionados.");
  console.log("Usuarios, roles, locales, grupos y configuracion NO se tocan.\n");

  // Orden de borrado: hijos primero, padres al final.
  // Cada tabla se borra con deleteMany dentro de una transaccion.
  const tablas = [
    // Dependencias de VentaDetalle / Venta
    "VentaDetalle",
    "Venta",
    // Dependencias de Transferencia
    "TransferenciaDetalle",
    "Transferencia",
    // Dependencias de PosTransferencia
    "PosTransferenciaDetalle",
    "PosTransferencia",
    // Dependencias de PedidoProveedor
    "PedidoProveedorDetalle",
    "PedidoProveedor",
    // Dependencias de PrecioUpdate
    "PrecioUpdateItem",
    "PrecioUpdate",
    // Auditoria y stock
    "AuditoriaStock",
    "StockLocal",
    // Precios por lista
    "ProductoListaPrecio",
    "ListaPrecio",
    // ProductoLocal y ProductoBase
    "ProductoLocal",
    "ProductoBase",
  ];

  // Contar antes
  console.log("Estado actual:");
  const conteos = {};
  for (const t of tablas) {
    const modelo = t.charAt(0).toLowerCase() + t.slice(1);
    try {
      conteos[t] = await prisma[modelo].count();
      console.log(`  ${t}: ${conteos[t]} registros`);
    } catch {
      conteos[t] = 0;
      console.log(`  ${t}: (tabla no encontrada, se omite)`);
    }
  }

  console.log("\nEliminando...");

  await prisma.$transaction(async (tx) => {
    for (const t of tablas) {
      const modelo = t.charAt(0).toLowerCase() + t.slice(1);
      try {
        const result = await tx[modelo].deleteMany({});
        console.log(`  ${t}: ${result.count} eliminados`);
      } catch (err) {
        // Si el modelo no existe en el client, saltar
        if (err.message?.includes("undefined")) {
          console.log(`  ${t}: omitido (no existe en schema)`);
        } else {
          throw err;
        }
      }
    }
  });

  // Reiniciar autoincrement (PostgreSQL)
  console.log("\nReiniciando secuencias (autoincrement)...");
  const tablasDB = [
    // snake_case de los nombres de tabla en PostgreSQL
    "VentaDetalle",
    "Venta",
    "TransferenciaDetalle",
    "Transferencia",
    "PosTransferenciaDetalle",
    "PosTransferencia",
    "PedidoProveedorDetalle",
    "PedidoProveedor",
    "PrecioUpdateItem",
    "PrecioUpdate",
    "AuditoriaStock",
    "StockLocal",
    "ProductoListaPrecio",
    "ListaPrecio",
    "ProductoLocal",
    "ProductoBase",
  ];

  for (const t of tablasDB) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER SEQUENCE "${t}_id_seq" RESTART WITH 1`
      );
      console.log(`  ${t}_id_seq: OK`);
    } catch {
      console.log(`  ${t}_id_seq: omitido (secuencia no encontrada)`);
    }
  }

  // Resetear PosVentaCounter (numeracion de tickets)
  try {
    await prisma.posVentaCounter.deleteMany({});
    console.log("  PosVentaCounter: reseteado");
  } catch {
    // no existe o sin datos
  }

  console.log("\nReset completado.");
}

main()
  .catch((e) => {
    console.error("Error fatal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
