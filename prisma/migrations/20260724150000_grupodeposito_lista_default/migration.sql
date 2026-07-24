-- Lista default por depósito (GrupoDeposito.listaPrecioDefaultId) — diseño mínimo.
-- La default comercial deja de aplicarse por grupo en el POS; solo el depósito puede tener
-- una default propia (este campo). Los locales venden por ProductoLocal.precio_venta.
-- Migración aditiva e idempotente. NO se aplica en producción en esta etapa.
--
-- ROLLBACK:
--   ALTER TABLE "GrupoDeposito" DROP COLUMN IF EXISTS "listaPrecioDefaultId";
--   (columna nueva y aislada; no altera datos preexistentes ni Cliente.listaPrecioId ni esDefault).

-- 1) Columna nullable
ALTER TABLE "GrupoDeposito" ADD COLUMN IF NOT EXISTS "listaPrecioDefaultId" INTEGER;

-- 2) FK -> ListaPrecio, SET NULL al borrar la lista
DO $$ BEGIN
  ALTER TABLE "GrupoDeposito"
    ADD CONSTRAINT "GrupoDeposito_listaPrecioDefaultId_fkey"
    FOREIGN KEY ("listaPrecioDefaultId") REFERENCES "ListaPrecio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Índice
CREATE INDEX IF NOT EXISTS "GrupoDeposito_listaPrecioDefaultId_idx"
  ON "GrupoDeposito"("listaPrecioDefaultId");

-- 4) Guarda de drift: NO elegir silenciosamente si un grupo tuviera >1 default activa.
--    (El índice parcial ListaPrecio_default_unico_por_grupo ya lo impide; esto es defensivo.)
DO $$
DECLARE
  drift_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO drift_count FROM (
    SELECT "grupoId" FROM "ListaPrecio"
    WHERE "esDefault" = true AND "activo" = true
    GROUP BY "grupoId" HAVING COUNT(*) > 1
  ) t;
  IF drift_count > 0 THEN
    RAISE EXCEPTION
      'grupodeposito_lista_default: % grupo(s) con más de una ListaPrecio esDefault activa (drift). No se asigna default automáticamente; resolver a mano antes de migrar.',
      drift_count;
  END IF;
END $$;

-- 5) Backfill: cada GrupoDeposito toma la default activa de SU grupo (0..1 por el índice parcial).
--    Grupos sin default activa → queda NULL. No pisa valores ya seteados (idempotente).
UPDATE "GrupoDeposito" gd
SET "listaPrecioDefaultId" = lp.id
FROM "ListaPrecio" lp
WHERE lp."grupoId" = gd."grupoId"
  AND lp."esDefault" = true
  AND lp."activo" = true
  AND gd."listaPrecioDefaultId" IS NULL;
