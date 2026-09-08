-- ═══════════════════════════════════════════════════════════════════════════
-- RECEPCIÓN CON DIFERENCIAS POSITIVAS Y LÍNEAS AGREGADAS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hasta acá una recepción solo podía recibir MENOS de lo enviado. Faltaban dos
-- casos físicos que ocurren de verdad al abrir los bultos:
--
--   · llegó MÁS de lo que decía el remito;
--   · llegó un producto que el remito NI SIQUIERA menciona.
--
-- ── ADITIVA, Y ESO SE PUEDE COMPROBAR LEYENDO ─────────────────────────────
--
-- Tres columnas nulables o con default, dos referencias nulables y cuatro
-- índices. NO hay un solo DROP, ni un UPDATE, ni un backfill. Ninguna
-- transferencia histórica se toca ni se reinterpreta: quedan con
-- `agregadoEnRecepcion = false`, que es la verdad —ninguna línea vieja se pudo
-- agregar en recepción, porque no existía la función—.
--
-- El código viejo sigue funcionando durante toda la ventana entre migrar y
-- recrear: no nombra ninguna de estas columnas y ninguna es obligatoria.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. La línea que se agregó al abrir los bultos
-- ───────────────────────────────────────────────────────────────────────────
--
-- POR QUÉ UN BOOLEANO Y NO `cantidad = 0`. Porque `cantidad = 0` es una
-- coincidencia aritmética y no un hecho registrado: no dice QUIÉN la agregó ni
-- CUÁNDO, y ese dato no se reconstruye después. Es justo lo que una auditoría
-- pregunta cuando aparece stock que nadie mandó.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "agregadoEnRecepcion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "agregadoEnRecepcionPorId" INTEGER;
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "agregadoEnRecepcionAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransferenciaDetalle_agregadoEnRecepcionPorId_fkey'
  ) THEN
    ALTER TABLE "TransferenciaDetalle"
      ADD CONSTRAINT "TransferenciaDetalle_agregadoEnRecepcionPorId_fkey"
      FOREIGN KEY ("agregadoEnRecepcionPorId") REFERENCES "Usuario"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "TransferenciaDetalle_agregadoEnRecepcionPorId_idx"
  ON "TransferenciaDetalle"("agregadoEnRecepcionPorId");

-- ───────────────────────────────────────────────────────────────────────────
-- 2. De qué recepción salió un movimiento de stock
-- ───────────────────────────────────────────────────────────────────────────
--
-- El único rastro que había era el TEXTO de `AuditoriaStock.motivo`, con los
-- números adentro de una frase en castellano. Sirve para leerlo; no sirve para
-- preguntarle nada a la base. "Todos los movimientos de la transferencia 97" no
-- se puede contestar sin parsear prosa.
--
-- Nulables porque la enorme mayoría de los movimientos de stock no vienen de una
-- transferencia —un ajuste manual, una venta— y esas filas quedan intactas.
ALTER TABLE "AuditoriaStock" ADD COLUMN IF NOT EXISTS "transferenciaId" INTEGER;
ALTER TABLE "AuditoriaStock" ADD COLUMN IF NOT EXISTS "transferenciaDetalleId" INTEGER;

-- SET NULL en las dos: borrar una transferencia NO puede borrar la historia de
-- que su stock se movió. Es el mismo contrato que las FK de identidad de
-- `VentaPago`: se pierde la referencia y el texto congelado sigue explicando.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditoriaStock_transferenciaDetalleId_fkey'
  ) THEN
    ALTER TABLE "AuditoriaStock"
      ADD CONSTRAINT "AuditoriaStock_transferenciaDetalleId_fkey"
      FOREIGN KEY ("transferenciaDetalleId") REFERENCES "TransferenciaDetalle"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "AuditoriaStock_transferenciaId_idx"
  ON "AuditoriaStock"("transferenciaId");
CREATE INDEX IF NOT EXISTS "AuditoriaStock_transferenciaDetalleId_idx"
  ON "AuditoriaStock"("transferenciaDetalleId");

-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE, DICHO PARA QUE NO HAYA QUE DEDUCIRLO
-- ───────────────────────────────────────────────────────────────────────────
--
-- `transferenciaId` queda SIN foreign key a propósito, y no es un olvido: una FK
-- a `Transferencia` con `SET NULL` borraría el vínculo al cancelar y borrar una
-- transferencia, que es justo el caso donde la auditoría más importa. El id
-- queda como referencia operativa y el `motivo` sigue conservando el texto. La
-- que sí lleva FK es la del detalle, porque el detalle se borra en cascada con
-- su transferencia y ahí un id colgado señalaría una fila que no existe.
--
-- No se toca `AccionStock`: `AuditoriaStock.accion` es un `String`, así que los
-- dos valores nuevos —`EXCEDENTE_RECEPCION_TRANSFERENCIA` y
-- `AGREGADO_RECEPCION_TRANSFERENCIA`— no necesitan migración. El histórico
-- conserva `DIFERENCIA_RECEPCION_TRANSFERENCIA` con el significado que siempre
-- tuvo: faltó mercadería.
