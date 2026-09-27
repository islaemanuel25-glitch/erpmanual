// VERIFICADOR DEL LIBRO HISTÓRICO FÍSICO DE STOCK. SOLO LECTURA.
//
//   DATABASE_URL=… node --import ./scripts/alias-loader.mjs scripts/verificar-libro-stock.mjs
//
// Contesta por separado:
//
//   A) INTEGRIDAD FÍSICA — rojo si falta un trigger, si una cadena se corta,
//      retrocede o sigue después de una baja, si una fila viva no tiene cadena o
//      su último saldo no coincide con StockLocal. Sale con código 1.
//   B) CLASIFICACIÓN DE ORIGEN — cuántos movimientos son SIN_ORIGEN y cuántas
//      reinterpretaciones de unidad hubo. Se informa; nunca cambia el código de
//      salida.
//
// Las reglas viven en `lib/stock/libro/verificador.js`. Nivel LECTURA: la URL la
// pone el operador y no se escribe nada, así que puede mirar cualquier base.

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: LECTURA });

const { verificarLibroStock, informeDelLibro } = await import("../lib/stock/libro/verificador.js");

let codigo = 0;
try {
  const resultado = await verificarLibroStock(prisma);
  console.log(informeDelLibro(resultado));
  codigo = resultado.integridad.ok ? 0 : 1;
} catch (err) {
  // Un verificador que no pudo mirar no pasó: falla cerrado.
  console.error(`No se pudo verificar el libro de stock: ${err?.message || err}`);
  codigo = 2;
} finally {
  await prisma.$disconnect();
}
process.exit(codigo);
