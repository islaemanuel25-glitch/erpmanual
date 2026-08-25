-- STOCK: UNA MARCA PROPIA PARA "LOS LÍMITES YA SE AJUSTARON"
--
-- Un límite guardado en 0 es un valor CONFIGURADO válido, así que mirar los
-- valores no contesta si alguien los ajustó alguna vez. Y el null tampoco: cinco
-- rutas creaban la fila con stockMin/stockMax en 0 mientras otras tres la creaban
-- en null. Abrir la pantalla de stock, sin tocar nada, creaba filas con ceros.
--
-- Esta columna es un hecho propio y no derivado. La escribe
-- /api/stock_locales/ajustar con modo "limites", que es la ruta que los dos
-- modales usan de verdad; /api/stock_locales/limites es una duplicada que hoy no
-- se consume y se mantiene coherente, pero no es la escritora.

ALTER TABLE "StockLocal" ADD COLUMN "limitesConfiguradosAt" TIMESTAMP(3);

-- ── BACKFILL 1: LO QUE LA AUDITORÍA PUEDE PROBAR ────────────────────────────
--
-- El guardado de límites escribe una fila en AuditoriaStock con accion='LIMITES'
-- —tanto la ruta viva, /ajustar con modo "limites", como la duplicada—, así que
-- su presencia prueba que alguien pasó por ahí. Se toma la fecha de la auditoría
-- MÁS RECIENTE, que es la del último ajuste.
--
-- Esto es lo que rescata el caso que los valores no pueden: una fila en 0/0 CON
-- auditoría es un cero deliberado y tiene que quedar configurada. En erpazul_dev
-- hay exactamente una así.
--
-- AuditoriaStock.productoLocalId apunta al mismo ProductoLocal que
-- StockLocal.productoId, y ProductoLocal ya está acotado por local, así que el
-- join por ese id no puede cruzar ubicaciones.
UPDATE "StockLocal" sl
SET "limitesConfiguradosAt" = a."ultima"
FROM (
  SELECT "productoLocalId", MAX("createdAt") AS "ultima"
  FROM "AuditoriaStock"
  WHERE "accion" = 'LIMITES'
  GROUP BY "productoLocalId"
) a
WHERE sl."productoId" = a."productoLocalId";

-- ── BACKFILL 2: LA RED PARA LAS BASES SIN ESA AUDITORÍA ─────────────────────
--
-- La auditoría es completa para el camino del guardado de límites, pero NINGUNA otra ruta que
-- toca stockMin/stockMax escribe AuditoriaStock —importar, nuevo, import/apply,
-- sync-productos—. En erpazul_dev todas esas escriben 0 al CREAR la fila, así que
-- no dejan límites reales sin auditar; pero eso es una propiedad de ESTA base y
-- no una garantía para producción ni para una base restaurada de otra época.
--
-- Por eso, un valor positivo cuenta como configurado aunque no haya auditoría: si
-- alguien puso un mínimo de 5, ese límite existe, y tratarlo como "sin ajustar"
-- lo mandaría a la card equivocada.
--
-- Va DESPUÉS del backfill 1 y con IS NULL, así que no pisa las fechas reales que
-- aquél ya escribió: donde hay auditoría, gana la fecha de la auditoría.
--
-- `updatedAt` es lo más cercano a "cuándo se tocó esta fila" que existe sin la
-- auditoría. No es la fecha del ajuste de límites y no se la hace pasar por tal:
-- es una cota superior conocida.
UPDATE "StockLocal"
SET "limitesConfiguradosAt" = "updatedAt"
WHERE "limitesConfiguradosAt" IS NULL
  AND (
    COALESCE("stockMin", 0) > 0
    OR COALESCE("stockMax", 0) > 0
  );

-- ── LO QUE QUEDA EN NULL, QUE ES LO QUE SE QUERÍA ───────────────────────────
--
--   · stockMin y stockMax en null sin auditoría  → nunca configurado
--   · stockMin = 0 y stockMax = 0 sin auditoría  → nunca configurado
--
-- Esas son las filas que la card "Límites sin ajustar" tiene que mostrar.

-- El índice parcial es para la card: la consulta de conteo pregunta por
-- "limitesConfiguradosAt IS NULL" acotada por local, y sin esto sería un barrido
-- de la tabla en cada entrada a la pantalla.
CREATE INDEX "StockLocal_localId_limitesSinAjustar_idx"
  ON "StockLocal" ("localId")
  WHERE "limitesConfiguradosAt" IS NULL;
