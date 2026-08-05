-- APLICACIÓN DE COSTOS DE LISTAS DE PROVEEDOR
--
-- Estrictamente aditiva: solo ADD COLUMN, todas nullables o con default. No
-- borra, no transforma y no reescribe ninguna fila existente. Una importación
-- ya conciliada sigue leyéndose igual: los campos nuevos quedan en NULL / 0,
-- que es exactamente "todavía no se aplicó".

-- Cabecera: quién aplicó y cómo salió la corrida.
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "aplicadaPorUsuarioId" INTEGER;
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "aplicadas" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "omitidas" INTEGER NOT NULL DEFAULT 0;

-- Fila: historial de la aplicación, incluido el motivo cuando NO se aplicó.
ALTER TABLE "ImportacionListaFila" ADD COLUMN "aplicadaEn" TIMESTAMP(3);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "aplicadaPorUsuarioId" INTEGER;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "resultadoAplicacion" TEXT;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "motivoAplicacion" TEXT;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "costoPrevioAplicacion" DECIMAL(12,2);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "ventaAnterior" DECIMAL(12,2);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "ventaNueva" DECIMAL(12,2);
