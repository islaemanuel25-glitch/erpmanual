-- Operario obligatorio configurable POR LOCAL.
-- Additive + compatible: columna nullable, sin default de DB.
-- Semántica en código (lib/config/local.js): NULL = true = operario obligatorio
-- (comportamiento histórico). No requiere backfill de filas: las filas
-- existentes (y las nuevas creadas sin el campo) quedan en NULL y se resuelven
-- como "obligatorio", idéntico al estado previo. Aislado por local: cambiarlo en
-- una ubicación no afecta a ninguna otra (ConfiguracionLocal tiene @unique localId).
ALTER TABLE "ConfiguracionLocal" ADD COLUMN "exigirOperador" BOOLEAN;
