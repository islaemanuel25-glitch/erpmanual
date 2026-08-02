-- Anulación técnica de turnos: aperturas por error o de prueba que nunca movieron
-- dinero y que no deben registrarse como cierres.
--
-- ADITIVA. Tres columnas NULLABLE, sin DEFAULT, sin índices, sin backfill: los
-- turnos existentes quedan con las tres en NULL y se leen exactamente igual que
-- antes. No borra ni modifica ninguna fila.
--
-- Un turno anulado conserva TODO: su `montoInicial` (evidencia de qué se cargó),
-- sus ventas y sus movimientos. Lo que queda en NULL son los importes de cierre,
-- porque NULL significa "no se contó" y cero significaría "se contó y dio cero".

ALTER TABLE "Turno" ADD COLUMN "anuladoEn"       TIMESTAMP(3);
ALTER TABLE "Turno" ADD COLUMN "anuladoPorId"    INTEGER;
ALTER TABLE "Turno" ADD COLUMN "motivoAnulacion" TEXT;
