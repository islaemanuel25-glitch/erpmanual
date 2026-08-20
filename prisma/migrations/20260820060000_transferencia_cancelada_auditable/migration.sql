-- CANCELACIÓN DE TRANSFERENCIAS: quién, cuándo y por qué.
--
-- Hasta hoy cancelar una transferencia solo cambiaba el estado a "Cancelada". El
-- código lo decía sin rodeos: "no hay campos fechaCancelacion/canceladaPor en el
-- schema, se usa updatedAt como registro implícito de cuándo se canceló".
--
-- POR QUÉ `updatedAt` NO SIRVE PARA ESTO. Se mueve con cualquier escritura
-- posterior, así que ni siquiera prueba la fecha de la cancelación; y quién la
-- hizo y por qué no estaban registrados en ningún lado. Una transferencia
-- cancelada era indistinguible, un mes después, de un error de datos.
--
-- ADITIVA Y NULLABLE. Las tres columnas nacen en null. Hay UNA transferencia ya
-- cancelada en producción y se queda en null a propósito: no se inventa un autor
-- ni un motivo que nadie escribió. Un null acá significa "se canceló antes de que
-- esto se registrara", que es la verdad.
--
-- COMPATIBLE HACIA ATRÁS durante la ventana entre migrar y recrear: el código que
-- está atendiendo no mira estas columnas.
--
-- Mismo patrón que `Venta.anuladaEn`: el estado se deriva de la fecha y no hay un
-- booleano en paralelo. Y `canceladaPorId` es un entero suelto y no una FK,
-- siguiendo el precedente de `Transferencia.creadaPor` y `VentaCorreccion.usuarioId`.

ALTER TABLE "Transferencia" ADD COLUMN "canceladaEn" TIMESTAMP(3);
ALTER TABLE "Transferencia" ADD COLUMN "canceladaPorId" INTEGER;
ALTER TABLE "Transferencia" ADD COLUMN "motivoCancelacion" TEXT;

-- Los agregados del período preguntan `estado <> 'Cancelada'` para el movimiento
-- operativo. Ya existe un índice sobre `estado`, así que no hace falta uno nuevo.
