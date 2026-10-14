-- Segunda regla de caja (2026-10-14): la caja sin PIN del dueño o Admin y el
-- retiro que el dueño o Admin hace en la caja de otro.
-- Solo agrega columnas nulas: no toca ninguna fila existente. NULL es "caja de
-- operador o caja de cuenta vieja" y "retiro del dueño de la caja", que es lo
-- que fueron todos hasta hoy.

-- AlterTable
ALTER TABLE "RetiroPreparacion" ADD COLUMN     "intervenidoPorUsuarioId" INTEGER;

-- AlterTable
ALTER TABLE "Turno" ADD COLUMN     "operaLaCuenta" BOOLEAN;
