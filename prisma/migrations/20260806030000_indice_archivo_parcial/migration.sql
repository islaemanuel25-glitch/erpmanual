-- CANCELAR UNA IMPORTACIÓN — parte 2: liberar el archivo.
--
-- El problema que resuelve: el índice único de archivo no miraba el estado, así
-- que una importación equivocada bloqueaba ese Excel para siempre y el flujo
-- natural —"me equivoqué, la cancelo y la vuelvo a subir"— era imposible.
--
-- El índice pasa de total a PARCIAL. La garantía contra carreras se conserva
-- intacta: sigue siendo imposible que existan DOS importaciones vivas del mismo
-- archivo. Lo único que cambia es que una cancelada deja de ocupar el lugar.
--
-- Va en una migración aparte porque usa el valor 'CANCELADA' del enum, que la
-- migración anterior acaba de crear: Postgres exige que esté confirmado.

DROP INDEX IF EXISTS "importacion_archivo_unica";

CREATE UNIQUE INDEX "importacion_archivo_unica"
  ON "ImportacionListaProveedor" ("grupoId", "proveedorId", "archivoHash")
  WHERE "estado" <> 'CANCELADA';

-- Índice de búsqueda, que antes lo daba el único total.
CREATE INDEX IF NOT EXISTS "ImportacionListaProveedor_grupoId_proveedorId_archivoHash_idx"
  ON "ImportacionListaProveedor" ("grupoId", "proveedorId", "archivoHash");
