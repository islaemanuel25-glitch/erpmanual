-- EL NOMBRE DEL BULTO (2026-11-04). Tercer nivel de empaque, tanda 7.
--
-- Emanuel aprobó que el depósito vea "1 cartón" y no "1 bulto" ni "1 pack". No
-- había ningún campo que nombrara el bulto de un producto —`unidad_medida` dice
-- pack o cajón, que es la categoría, no el nombre—, así que se agrega uno.
--
-- Aditiva: una columna nula. Todas las filas quedan en NULL, que significa "el
-- rótulo de hoy": nada de lo que se ve cambia. Nadie la escribe hasta la tanda 9,
-- cuando la ficha la carga junto con `sueltos_por_unidad` y `nombre_unidad`. Es
-- solo un rótulo: no cambia ninguna cantidad ni costo, así que ningún libro la
-- mira. La versión que sigue atendiendo no la lee ni la escribe.

-- AlterTable
ALTER TABLE "ProductoBase" ADD COLUMN     "nombre_bulto" TEXT;
