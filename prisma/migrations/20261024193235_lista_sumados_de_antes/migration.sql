-- DE DATOS, ADITIVA E IDEMPOTENTE: reconstruye la marca de "sumado" de los
-- «✓ Sí» hechos ANTES de que existiera `ProductoSumadoALaLista` (2026-10-24).
--
-- ── EL CASO ───────────────────────────────────────────────────────────────
--
-- Entre el despliegue de 77c4646f ("Pueden ser de…") y el de f0c8abc0 (la
-- tabla de sumados), «✓ Sí» vinculaba el producto y le sumaba el proveedor,
-- pero no dejaba la marca. Esos productos no aparecen en «Aceptados» ni con la
-- etiqueta "Sumado a Dab", y «Deshacer» no los alcanza.
--
-- ── CÓMO SE RECONOCEN, CON DATOS QUE YA EXISTEN ──────────────────────────
--
-- No hay historia de los lugares de proveedor (el Libro de costos versiona solo
-- el costo), así que "el proveedor ocupa un lugar que antes no tenía" se
-- reconoce por la huella que dejaba la transacción del «✓ Sí», que era la ÚNICA
-- que escribía `ProductoBase` al vincular:
--
--   1. un renglón de esta lista atado al producto, sin aplicar, vinculado
--      DESPUÉS de que "Pueden ser de…" existiera (la migración de 77c4646f
--      terminó: su `finished_at` en `_prisma_migrations`);
--   2. el producto tocado en esa misma transacción: su `updatedAt` cae entre el
--      `vinculadoEn` del renglón y 5 segundos después. Vincular desde la
--      revisión no toca el producto; aplicar sí, por eso se exige sin aplicar;
--   3. el proveedor de la lista en alguno de sus tres lugares;
--   4. ningún código de este proveedor para el producto anterior al vínculo:
--      «Pueden ser de…» solo ofrecía productos sin vínculo con él.
--
-- El lugar que llenó es el que hoy tiene a ese proveedor: el «✓ Sí» lo puso en
-- un lugar libre, y antes no estaba en ninguno.
--
-- Lo que NO reconoce, y queda como estaba: un producto al que después se le
-- aplicó un costo o se le editó la ficha (su `updatedAt` se movió), y uno cuyo
-- renglón se desató después desde la revisión.
--
-- ── IDEMPOTENTE Y SIN PISAR NADA ─────────────────────────────────────────
--
-- Solo INSERT, con ON CONFLICT DO NOTHING sobre la única (lista, producto):
-- correrla dos veces no agrega nada, y un sumado anotado por la aplicación no
-- se toca. No toca `ProductoBase`, renglones ni códigos.
--
-- ── REPOSICIÓN ───────────────────────────────────────────────────────────
--
-- Lo que agrega se reconoce por `sumadoPorUsuarioId` NULL: la aplicación
-- siempre anota quién (la sesión). Para volver atrás:
--
--   DELETE FROM "ProductoSumadoALaLista" WHERE "sumadoPorUsuarioId" IS NULL;
--
-- Borrar la marca no cambia vínculos ni proveedores: solo saca el producto de
-- «Aceptados» y la etiqueta de la revisión, que es como estaba antes.
--
-- ── POR QUÉ UN BLOQUE `DO` ───────────────────────────────────────────────
--
-- La ventana sale de `_prisma_migrations`, que existe en toda base desplegada
-- pero NO en la base sombra con que `prisma migrate dev` reprueba las
-- migraciones, ni en una recién creada: ahí una consulta directa no compila
-- ("The underlying table for model `_prisma_migrations` does not exist", visto
-- al aplicarla). Sin esa tabla no hay «✓ Sí» de antes que reconstruir, así que
-- el bloque no hace nada.

DO $bloque$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE $consulta$
INSERT INTO "ProductoSumadoALaLista"
  ("grupoId", "importacionId", "productoBaseId", "lugarDelProveedor", "sumadoPorUsuarioId", "sumadoEn")
SELECT DISTINCT ON (f."importacionId", f."productoBaseId")
  i."grupoId",
  f."importacionId",
  f."productoBaseId",
  CASE
    WHEN pb."proveedor_id" = i."proveedorId" THEN 'proveedor_id'
    WHEN pb."proveedor2_id" = i."proveedorId" THEN 'proveedor2_id'
    ELSE 'proveedor3_id'
  END,
  NULL,
  f."vinculadoEn"
FROM "ImportacionListaFila" f
JOIN "ImportacionListaProveedor" i ON i."id" = f."importacionId"
JOIN "ProductoBase" pb ON pb."id" = f."productoBaseId"
WHERE f."vinculadoEn" IS NOT NULL
  AND f."aplicada" = false
  AND f."vinculadoEn" >= (
    SELECT m."finished_at" FROM "_prisma_migrations" m
    WHERE m."migration_name" = '20261024164309_lista_renglon_que_no_es_el_producto'
      AND m."finished_at" IS NOT NULL AND m."rolled_back_at" IS NULL
    ORDER BY m."finished_at" ASC
    LIMIT 1
  )
  AND pb."updatedAt" >= f."vinculadoEn"
  AND pb."updatedAt" < f."vinculadoEn" + INTERVAL '5 seconds'
  AND i."proveedorId" IN (pb."proveedor_id", pb."proveedor2_id", pb."proveedor3_id")
  AND NOT EXISTS (
    SELECT 1 FROM "ProductoCodigoProveedor" c
    WHERE c."proveedorId" = i."proveedorId"
      AND c."productoBaseId" = pb."id"
      AND c."createdAt" < f."vinculadoEn"
  )
ORDER BY f."importacionId", f."productoBaseId", f."vinculadoEn" ASC
ON CONFLICT ("importacionId", "productoBaseId") DO NOTHING
  $consulta$;
END
$bloque$;
