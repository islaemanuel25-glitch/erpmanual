-- EL N CONGELADO DE LOS COMPONENTES DE COMBO (2026-11-04). Tercer nivel de
-- empaque, tanda 9 — docs/roadmap/tercer-nivel-empaque.md.
--
-- `VentaDetalleComponente.cantidad` está en la escala de `StockLocal` del
-- momento de la venta. Desde la tanda 9 la ficha puede cargar sueltos por
-- unidad, y al hacerlo el stock se multiplica: anular después un combo vendido
-- antes devolvería 1 donde el stock ya cuenta 20. Las líneas comunes ya guardan
-- su N (`VentaDetalle.sueltosPorUnidadCongelado`, tanda 2); los componentes no
-- tenían dónde. La tanda 5 lo dejó anotado para esta migración.
--
-- Aditiva: una columna nula y su CHECK. Todas las filas quedan en NULL, que
-- significa 1: lo que vale toda venta hecha antes de que un producto tuviera
-- sueltos. La versión que sigue atendiendo no la lee ni la escribe.

-- AlterTable
ALTER TABLE "VentaDetalleComponente" ADD COLUMN     "sueltosPorUnidadCongelado" INTEGER;

ALTER TABLE "VentaDetalleComponente" ADD CONSTRAINT "VentaDetalleComponente_sueltosPorUnidadCongelado_mayor_que_1"
  CHECK ("sueltosPorUnidadCongelado" IS NULL OR "sueltosPorUnidadCongelado" > 1);
