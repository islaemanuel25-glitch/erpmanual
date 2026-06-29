-- Amplía la precisión de los campos monetarios del modelo Turno de
-- Decimal(10,2) (máx 99.999.999,99) a Decimal(12,2) (máx 9.999.999.999,99)
-- para igualarlos a Venta.total y evitar el error PostgreSQL 22003
-- (numeric field overflow) al cerrar turnos con importes altos.
--
-- Cambio NO destructivo: solo amplía el dominio numérico. No borra,
-- no trunca ni modifica registros existentes.

ALTER TABLE "Turno" ALTER COLUMN "montoInicial" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Turno" ALTER COLUMN "montoEsperadoEfectivo" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Turno" ALTER COLUMN "montoRealEfectivo" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Turno" ALTER COLUMN "diferenciaEfectivo" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Turno" ALTER COLUMN "totalVentasEfectivo" SET DATA TYPE DECIMAL(12,2);
ALTER TABLE "Turno" ALTER COLUMN "totalVentasDigital" SET DATA TYPE DECIMAL(12,2);
