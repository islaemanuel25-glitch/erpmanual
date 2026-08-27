-- IDENTIDAD COMPARTIDA DEL PRODUCTO POR PROVEEDOR.
--
-- Cinco columnas nuevas sobre la tabla que ya existe. NO se crea otra tabla: la
-- asociación proveedor↔producto ya vivía acá, y duplicarla habría dejado dos
-- lugares donde dice a qué producto apunta un código.
--
-- ── ES ADITIVA Y COMPATIBLE HACIA ATRÁS ──────────────────────────────────────
--
-- Las cinco son NULLABLE y sin default calculado, así que la versión anterior
-- de la aplicación —que sigue atendiendo durante la ventana entre migrar y
-- recrear— lee y escribe esta tabla exactamente como antes. Ninguna consulta
-- existente las nombra.
--
-- ── NO SE RELLENA NADA ───────────────────────────────────────────────────────
--
-- Los vínculos que ya están quedan con las cinco en NULL. No se deduce
-- `metodoDeteccion` a partir de `origenAlta` ni se copia `descripcionProveedor`
-- a la normalizada: de los vínculos viejos no consta por qué camino entraron, y
-- completarlos sería inventar justamente el dato que estas columnas existen para
-- registrar. Un nulo se deja en paz.
--
-- El predicado `nivelDeCerteza` ya contempla el nulo: un vínculo sin método
-- declarado cuenta como INFERIDA, que es el nivel más bajo que sigue siendo un
-- vínculo.

ALTER TABLE "ProductoCodigoProveedor"
  ADD COLUMN IF NOT EXISTS "metodoDeteccion" TEXT,
  ADD COLUMN IF NOT EXISTS "descripcionNormalizada" TEXT,
  ADD COLUMN IF NOT EXISTS "presentacionProveedor" TEXT,
  ADD COLUMN IF NOT EXISTS "unidadesPorPresentacion" INTEGER,
  ADD COLUMN IF NOT EXISTS "confirmadaPorUsuarioId" INTEGER,
  ADD COLUMN IF NOT EXISTS "confirmadaEn" TIMESTAMP(3);

-- El índice del alias: sin él, machear por descripción exacta obligaría a
-- recorrer todos los vínculos del proveedor en cada renglón.
CREATE INDEX IF NOT EXISTS "ProductoCodigoProveedor_grupoId_proveedorId_descripcionNorma_idx"
  ON "ProductoCodigoProveedor" ("grupoId", "proveedorId", "descripcionNormalizada");
