-- ═══════════════════════════════════════════════════════════════════════════
-- QUIÉN Y CUÁNDO ADOPTÓ LA PRESENTACIÓN DE UNA LÍNEA HISTÓRICA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── EL PROBLEMA ───────────────────────────────────────────────────────────
--
-- La migración anterior —`20260909170000_presentacion_envio_snapshot`— agregó
-- cinco columnas que significan "así SALIÓ la mercadería del origen". Se llenan
-- al despachar.
--
-- Pero hay transferencias creadas ANTES de que eso existiera que siguen
-- abiertas. La #176 tiene líneas como:
--
--     COCA COLA 2L — cantidad 40, unidadEnviada UNIDAD
--
-- aunque hoy ese producto se trabaja en CAJÓN x8. El operador tiene cinco
-- cajones en la mano y la pantalla le pide contar 40 unidades.
--
-- La salida NO es rellenar el histórico: nadie registró cómo salió, y dividir 40
-- por el factor de hoy sería afirmar un hecho que nadie observó. La salida es
-- que el operador ADOPTE explícitamente, para contar, la presentación que el
-- depósito usa hoy.
--
-- ── POR QUÉ HACEN FALTA ESTAS DOS COLUMNAS ────────────────────────────────
--
-- Esa adopción llena los MISMOS cinco campos del snapshot. Sin una marca, la
-- línea pasaría a afirmar que su presentación se registró al despachar — falso,
-- y dentro de un mes indistinguible de una que sí se registró.
--
-- `presentacionAdoptadaAt` es el único hecho nuevo que hace falta: las otras dos
-- procedencias ya se distinguen con lo que la fila tiene —sin
-- `presentacionEnvio` es reconstruida, con `agregadoEnRecepcion` es un no
-- declarado—. Ver `origenDePresentacion` en
-- `lib/transferencias/adopcionDePresentacion.js`.
--
-- El autor va al lado por el mismo motivo que `agregadoEnRecepcionPorId` y
-- `revisadoEnRecepcionPorId`: una decisión sin autor ni momento no se audita.
--
-- ── ADITIVA, Y SE PUEDE COMPROBAR LEYENDO ─────────────────────────────────
--
-- Dos columnas NULABLES y una clave foránea. NO hay DROP, ni UPDATE, ni DELETE,
-- ni INSERT, ni NOT NULL, ni backfill.
--
-- Ninguna línea existente fue adoptada, porque no se podía. Y una fila con
-- snapshot y sin esta marca se lee como despacho, que es exactamente lo que era:
-- el default correcto no necesita escribirse.
--
-- El código anterior sigue funcionando durante toda la ventana entre migrar y
-- recrear: no nombra ninguna de estas dos columnas y ninguna es obligatoria.

ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "presentacionAdoptadaAt" TIMESTAMP(3);

ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "presentacionAdoptadaPorId" INTEGER;

-- La clave foránea, con el mismo criterio que las otras tres autorías de esta
-- tabla: `ON DELETE SET NULL` no corresponde —el usuario no se borra— y la
-- referencia se declara para que la auditoría no dependa de un entero suelto.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'TransferenciaDetalle_presentacionAdoptadaPorId_fkey'
  ) THEN
    ALTER TABLE "TransferenciaDetalle"
      ADD CONSTRAINT "TransferenciaDetalle_presentacionAdoptadaPorId_fkey"
      FOREIGN KEY ("presentacionAdoptadaPorId") REFERENCES "Usuario"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE, DICHO PARA QUE NO HAYA QUE DEDUCIRLO
-- ───────────────────────────────────────────────────────────────────────────
--
-- No toca `cantidad`: la cantidad física histórica sigue siendo la autoridad y
-- es la que movió stock.
-- No toca ninguno de los cinco campos del snapshot de despacho.
-- No rellena ninguna fila existente.
-- No borra, no renombra y no crea índices: nadie filtra por estas columnas — se
-- leen junto con la fila que ya se está trayendo.
