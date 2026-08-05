-- VINCULACIÓN MANUAL DE FILAS DE UNA LISTA DE PROVEEDOR
--
-- Cuando un código de la lista no machea con ningún producto, el administrador
-- puede resolverlo a mano eligiendo el producto. Ese acto crea un vínculo
-- permanente en ProductoCodigoProveedor que va a usarse en todas las listas
-- futuras del proveedor, así que tiene que quedar registrado quién lo decidió.
--
-- POR QUÉ ACÁ Y NO EN LA BITÁCORA
--
-- El interceptor de auditoría tiene una allow-list y ProductoCodigoProveedor no
-- está en ella. Sin estos tres campos, crear un vínculo desde esta pantalla no
-- dejaría ningún rastro de autoría. Agregar el modelo a la bitácora sería un
-- cambio de alcance mayor —afecta a todos los endpoints que tocan códigos de
-- proveedor—, así que por ahora la autoría vive en la fila que la originó.
--
-- ES ADITIVA. Tres columnas nullable en una tabla que hoy no tiene filas en
-- producción. Sin backfill, sin índices nuevos, sin tocar nada existente.

ALTER TABLE "ImportacionListaFila" ADD COLUMN "vinculadoPorUsuarioId" INTEGER;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "vinculadoEn" TIMESTAMP(3);
-- SUGERENCIA_CODIGO_BARRAS | BUSQUEDA_MANUAL. Texto y no enum: si mañana
-- aparece un tercer origen, no queremos una migración para nombrarlo.
ALTER TABLE "ImportacionListaFila" ADD COLUMN "origenVinculo" TEXT;
