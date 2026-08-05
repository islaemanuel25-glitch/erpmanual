-- APLICACIÓN POR TANDAS — parte 2: el archivo solo lo bloquean las ABIERTAS.
--
-- El índice excluía las canceladas, pero una importación APLICADA seguía
-- ocupando el archivo para siempre: no se podía volver a subir la misma lista
-- del proveedor nunca más, aunque el proceso anterior estuviera terminado.
--
-- Ahora solo ocupan el lugar las importaciones VIVAS —en borrador, conciliadas o
-- parcialmente aplicadas—. La garantía que el índice tiene que dar se conserva
-- entera: sigue siendo imposible tener dos procesos abiertos del mismo archivo,
-- que es el duplicado real. Un proceso terminado es historial, no un conflicto.

DROP INDEX IF EXISTS "importacion_archivo_unica";

CREATE UNIQUE INDEX "importacion_archivo_unica"
  ON "ImportacionListaProveedor" ("grupoId", "proveedorId", "archivoHash")
  WHERE "estado" IN ('BORRADOR', 'CONCILIADA', 'PARCIALMENTE_APLICADA');
