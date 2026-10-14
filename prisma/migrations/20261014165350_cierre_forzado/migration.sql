-- Cierre forzado: un Admin o el dueño cierra la caja de otro operador.
-- Solo agrega columnas nulas: no toca ninguna fila existente. NULL = cierre
-- normal, que es lo que fueron todos los cierres hasta hoy.

-- AlterTable
ALTER TABLE "CierrePreparacion" ADD COLUMN     "forzadoPorUsuarioId" INTEGER;

-- AlterTable
ALTER TABLE "Turno" ADD COLUMN     "cierreForzadoPorId" INTEGER;
