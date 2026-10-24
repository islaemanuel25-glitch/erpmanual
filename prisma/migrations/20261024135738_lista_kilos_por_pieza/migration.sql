-- LOS KILOS DE LA PIEZA, PARA LOS PRODUCTOS QUE GUARDAN EL COSTO POR KILO.
--
-- GRANIX BOCADITO CHOC. BLANCO 2KG (Dab, 2026-10-24): el producto guarda su
-- costo por kilo y la lista lo cotiza por pieza de 2 kg, en bulto de 2. El motor
-- lo bloqueaba entero. Ahora la tarjeta pregunta cuántos kilos trae la pieza y
-- el precio se pasa a kilo.
--
-- `kilosPorPieza` es la respuesta, recordada para ese producto con ese
-- proveedor; `kilosConfirmados` es entre cuántos kilos se dividió el precio en
-- la lectura que se usó en esta fila, para que aplicar recalcule lo mismo.
-- Decimales los dos: una pieza puede traer 2,5 kg, y las columnas que ya
-- existían son enteras.
--
-- ADITIVA: dos columnas nullable, sin tocar ninguna fila. NADA se escribe en
-- `ProductoBase`.

-- AlterTable
ALTER TABLE "ImportacionListaFila" ADD COLUMN     "kilosConfirmados" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "LecturaProductoProveedor" ADD COLUMN     "kilosPorPieza" DECIMAL(10,3);
