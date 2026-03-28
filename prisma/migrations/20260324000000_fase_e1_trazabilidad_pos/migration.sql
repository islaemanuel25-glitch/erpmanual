-- Fase E1: Trazabilidad POS
-- Todas las columnas son nullable para compatibilidad con datos existentes.

-- 1. Venta: operadorId + desglose descuento + comisionPct
ALTER TABLE "Venta" ADD COLUMN "operadorId" INTEGER;
ALTER TABLE "Venta" ADD COLUMN "descuentoAutomatico" DECIMAL(12,2);
ALTER TABLE "Venta" ADD COLUMN "descuentoManual" DECIMAL(12,2);
ALTER TABLE "Venta" ADD COLUMN "descuentoPorPuntos" DECIMAL(12,2);
ALTER TABLE "Venta" ADD COLUMN "comisionPct" DECIMAL(5,2);

-- FK Venta.operadorId -> OperadorLocal
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index
CREATE INDEX "Venta_operadorId_idx" ON "Venta"("operadorId");

-- 2. VentaDetalle: comisionLinea
ALTER TABLE "VentaDetalle" ADD COLUMN "comisionLinea" DECIMAL(12,2);

-- 3. Turno: operadorId + cerradoPorId
ALTER TABLE "Turno" ADD COLUMN "operadorId" INTEGER;
ALTER TABLE "Turno" ADD COLUMN "cerradoPorId" INTEGER;

-- FK Turno.operadorId -> OperadorLocal
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK Turno.cerradoPorId -> Usuario
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index
CREATE INDEX "Turno_operadorId_idx" ON "Turno"("operadorId");
