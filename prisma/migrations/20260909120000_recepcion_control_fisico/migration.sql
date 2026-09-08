-- ═══════════════════════════════════════════════════════════════════════════
-- LA RECEPCIÓN COMO CONTROL FÍSICO: REVISIÓN PERSISTIDA Y PACK INCOMPLETO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Dos hechos que el modelo no podía representar, y los dos aparecen con un
-- remito de 150 productos que alguien recorre con la mercadería en la mano.
--
-- ── A · "REVISADO" NO ES `recibido != null` ───────────────────────────────
--
-- Son dos cosas distintas: alguien puede haber empezado a escribir una cantidad
-- y no haber terminado de contar. "Revisado" significa que esta persona TERMINÓ
-- de verificar físicamente este producto, y de eso depende si la transferencia
-- se puede confirmar.
--
-- Y no puede vivir en el estado de React: con 150 productos, cerrar el navegador
-- y volver tiene que conservar el avance. Va con autor y fecha porque sin ellos,
-- dentro de un mes, un checklist a medias es indistinguible de un error de datos
-- — el mismo motivo por el que `agregadoEnRecepcion` lleva los suyos.
--
-- La fecha además ORDENA: los revisados se muestran en el orden real en que
-- aparecieron físicamente.
--
-- ── B · EL PACK INCOMPLETO NO SE ESCRIBE CON UN DECIMAL ───────────────────
--
-- Salieron 6 PACK de 6 —36 unidades— y llegaron 5 packs enteros más 5 sueltas:
-- 35 unidades. Guardar `recibido = 5.833` sería un error de exactitud, no de
-- redondeo:
--
--     5.833 × 6 = 34.998
--
-- En un `Decimal(12,3)` eso NO es 35. El destino quedaría con dos milésimas de
-- menos y el origen con dos de más, en cada pack incompleto, para siempre. Por
-- eso son dos datos explícitos y el total se calcula multiplicando una sola vez:
--
--     recibido = 5, recibidoUnidadesSueltas = 5   →   5 × 6 + 5 = 35   exacto
--
-- ── ADITIVA, Y SE PUEDE COMPROBAR LEYENDO ────────────────────────────────
--
-- Cuatro columnas nulables o con default, una FK nulable y un índice. NO hay un
-- solo DROP, ni un UPDATE, ni un DELETE, ni un INSERT, ni backfill. Ninguna
-- transferencia histórica se toca ni se reinterpreta: quedan con
-- `revisadoEnRecepcion = false` y sin sueltas, que es la verdad —ninguna se
-- revisó con este mecanismo porque no existía—.
--
-- Y NO se inventa quién revisó ni cuándo. Las transferencias ya Recibidas son
-- históricas y no necesitan fingir un checklist que no existía; lo que la
-- pantalla hace con ellas es asunto de la presentación, no de esta migración.
--
-- El código viejo sigue funcionando durante toda la ventana entre migrar y
-- recrear: no nombra ninguna de estas columnas y ninguna es obligatoria.

-- ───────────────────────────────────────────────────────────────────────────
-- A. El control físico terminado
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "revisadoEnRecepcion" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "revisadoEnRecepcionPorId" INTEGER;
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "revisadoEnRecepcionAt" TIMESTAMP(3);

-- SET NULL, igual que las otras dos autorías de esta tabla: borrar un usuario no
-- puede borrar el hecho de que el control se hizo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransferenciaDetalle_revisadoEnRecepcionPorId_fkey'
  ) THEN
    ALTER TABLE "TransferenciaDetalle"
      ADD CONSTRAINT "TransferenciaDetalle_revisadoEnRecepcionPorId_fkey"
      FOREIGN KEY ("revisadoEnRecepcionPorId") REFERENCES "Usuario"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- B. El pack incompleto
-- ───────────────────────────────────────────────────────────────────────────
--
-- Nulable a propósito: la enorme mayoría de las líneas no tiene pack incompleto,
-- y en una línea enviada en UNIDAD el desglose no existe —la validación lo
-- rechaza con UNIDADES_SUELTAS_SIN_BULTO—. `NULL` y `0` significan lo mismo acá
-- y el helper los normaliza; lo que no puede pasar es que exista un valor sobre
-- una presentación que no agrupa.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "recibidoUnidadesSueltas" DECIMAL(12,3);

-- ───────────────────────────────────────────────────────────────────────────
-- C. El índice que sostiene la guarda de confirmación
-- ───────────────────────────────────────────────────────────────────────────
--
-- Confirmar ahora pregunta "¿queda algún producto ORIGINAL sin revisar?" en cada
-- intento, filtrando por transferencia y por el flag. Es la única consulta nueva
-- que corre siempre, y es la única que se indexa.
--
-- NO se indexa `revisadoEnRecepcionPorId`: nadie consulta "qué revisó tal
-- persona", y un índice que nadie usa solo cuesta escrituras en cada guardado.
CREATE INDEX IF NOT EXISTS "TransferenciaDetalle_transferenciaId_revisadoEnRecepcion_idx"
  ON "TransferenciaDetalle"("transferenciaId", "revisadoEnRecepcion");

-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE, DICHO PARA QUE NO HAYA QUE DEDUCIRLO
-- ───────────────────────────────────────────────────────────────────────────
--
-- No toca `cantidad`: el remito original es histórico y no se reescribe.
-- No toca `recibido` de ninguna fila existente.
-- No hace backfill de `revisadoEnRecepcion` sobre transferencias abiertas: si al
-- desplegar hay una recepción a medio hacer, sus productos quedan en `false` y
-- el operador los va a tener que recorrer con la herramienta nueva. Eso se
-- decide antes del despliegue, no acá.
