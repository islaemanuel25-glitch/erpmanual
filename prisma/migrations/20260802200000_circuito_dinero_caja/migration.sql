-- Circuito del dinero físico de caja: retiro al cerrar, fondo que queda y
-- recepción de ese fondo en la apertura siguiente.
--
-- ADITIVA Y REVERSIBLE. Todas las columnas son NULLABLE y ninguna tiene DEFAULT
-- que reescriba filas: los 167 turnos ya cerrados quedan exactamente como están,
-- con estos campos en NULL, y se siguen leyendo igual que antes.
--
-- No toca Venta, VentaPago, CajaMovimiento ni ArqueoCaja.

-- Reparto del efectivo contado al cerrar: retirado + fondo dejado = contado.
ALTER TABLE "Turno" ADD COLUMN "efectivoRetiradoCierre"   DECIMAL(12,2);
ALTER TABLE "Turno" ADD COLUMN "fondoDejadoCierre"        DECIMAL(12,2);
ALTER TABLE "Turno" ADD COLUMN "retiroCierreMovimientoId" INTEGER;
ALTER TABLE "Turno" ADD COLUMN "destinoRetiroCierre"      TEXT;
ALTER TABLE "Turno" ADD COLUMN "recibidoPorCierre"        TEXT;

-- Recepción del fondo al abrir: lo sugerido por el cierre anterior contra lo que
-- el cajero contó de verdad.
ALTER TABLE "Turno" ADD COLUMN "fondoSugeridoApertura"    DECIMAL(12,2);
ALTER TABLE "Turno" ADD COLUMN "fondoRecibidoApertura"    DECIMAL(12,2);
ALTER TABLE "Turno" ADD COLUMN "diferenciaFondoApertura"  DECIMAL(12,2);
ALTER TABLE "Turno" ADD COLUMN "observacionFondoApertura" TEXT;
ALTER TABLE "Turno" ADD COLUMN "fondoOrigenTurnoId"       INTEGER;
ALTER TABLE "Turno" ADD COLUMN "fondoConsumidoEnTurnoId"  INTEGER;

-- El fondo que dejó un cierre lo puede tomar UN solo turno. Lo garantiza la base,
-- no la aplicación: dos aperturas concurrentes no pueden consumir el mismo fondo
-- ni aunque pasen la validación al mismo tiempo. En Postgres los NULL no colisionan
-- entre sí, así que los turnos sin fondo previo no se ven afectados.
CREATE UNIQUE INDEX "Turno_fondoOrigenTurnoId_key" ON "Turno"("fondoOrigenTurnoId");
