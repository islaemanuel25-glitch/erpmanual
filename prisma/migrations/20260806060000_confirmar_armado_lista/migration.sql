-- CONFIRMAR EL ARMADO de una fila que quedó por revisar.
--
-- Las filas en FACTOR_DUDOSO ya tienen producto: lo que les falta es el factor,
-- porque el archivo y el ERP declaran armados distintos, o porque el proveedor
-- cotiza por display. Sin ese número no hay costo, y la fila no tenía ninguna
-- salida operativa desde la pantalla.
--
-- El factor confirmado se guarda EN LA FILA. Escribirlo en ProductoBase
-- reescribiría la ficha del producto para todo el ERP a partir de una lista de
-- precios, que es un efecto mucho mayor que el que el usuario está pidiendo.
--
-- Aditiva: tres columnas nullables. No borra ni transforma nada.

ALTER TABLE "ImportacionListaFila" ADD COLUMN "factorConfirmado" INTEGER;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "confirmadoPorUsuarioId" INTEGER;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "confirmadoEn" TIMESTAMP(3);
