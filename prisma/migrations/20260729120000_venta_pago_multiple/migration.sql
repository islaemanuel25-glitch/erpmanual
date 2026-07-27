-- Pagos múltiples (pago dividido): tabla VentaPago como fuente de verdad de la
-- distribución del cobro. Aditiva y compatible: NO toca ni vuelve obligatorios los
-- campos legacy de Venta (formaPago/esFiado/comisionBancaria/comisionPct/netoRecibido).

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'MERCADOPAGO', 'DEBITO', 'CREDITO', 'FIADO');

-- CreateTable
CREATE TABLE "VentaPago" (
    "id" SERIAL NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "comisionPct" DECIMAL(5,2),
    "comision" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique 1 tender por medio + índices de agregación)
CREATE UNIQUE INDEX "VentaPago_ventaId_medio_key" ON "VentaPago"("ventaId", "medio");
CREATE INDEX "VentaPago_ventaId_idx" ON "VentaPago"("ventaId");
CREATE INDEX "VentaPago_medio_idx" ON "VentaPago"("medio");

-- AddForeignKey (Cascade: eliminar una venta arrastra sus pagos)
ALTER TABLE "VentaPago" ADD CONSTRAINT "VentaPago_ventaId_fkey"
    FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL: 1 tender por cada venta histórica. Normalización EXPLÍCITA del
-- formaPago legacy. Guard: si aparece un formaPago desconocido, ABORTA la
-- migración (no se manda silenciosamente a "otros"). Idempotente: no crea un
-- segundo tender si ya existe uno para la venta.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  desconocidos INTEGER;
BEGIN
  SELECT count(*) INTO desconocidos
  FROM "Venta" v
  WHERE v."esFiado" = false
    AND lower(btrim(v."formaPago")) NOT IN
        ('efectivo', 'mercadopago', 'mercado pago', 'mp', 'debito', 'credito', 'fiado');
  IF desconocidos > 0 THEN
    RAISE EXCEPTION 'Backfill VentaPago abortado: % venta(s) con formaPago desconocido. Normalizar antes de migrar.', desconocidos;
  END IF;
END $$;

INSERT INTO "VentaPago" ("ventaId", "medio", "monto", "comisionPct", "comision", "neto", "createdAt")
SELECT
  v."id",
  CASE
    WHEN v."esFiado" = true THEN 'FIADO'::"MedioPago"
    WHEN lower(btrim(v."formaPago")) = 'efectivo' THEN 'EFECTIVO'::"MedioPago"
    WHEN lower(btrim(v."formaPago")) IN ('mercadopago', 'mercado pago', 'mp') THEN 'MERCADOPAGO'::"MedioPago"
    WHEN lower(btrim(v."formaPago")) = 'debito' THEN 'DEBITO'::"MedioPago"
    WHEN lower(btrim(v."formaPago")) = 'credito' THEN 'CREDITO'::"MedioPago"
    WHEN lower(btrim(v."formaPago")) = 'fiado' THEN 'FIADO'::"MedioPago"
  END AS medio,
  v."total",
  v."comisionPct",
  COALESCE(v."comisionBancaria", 0),
  -- neto histórico coherente: total - comisión (idéntico a lo que calcula el POS).
  (v."total" - COALESCE(v."comisionBancaria", 0)),
  v."fecha"
FROM "Venta" v
WHERE NOT EXISTS (
  SELECT 1 FROM "VentaPago" vp WHERE vp."ventaId" = v."id"
);
