-- Segunda forma de derivar el precio de venta, POR UBICACIÓN.
--
-- MARGEN_PORCENTUAL es el default y es lo que hacen todos los registros que ya
-- existen: costo × (1 + margen/100). Nada cambia de comportamiento con esta
-- migración; solo queda disponible la otra regla.
--
-- RECARGO_FIJO_UNIDAD suma una cantidad fija de pesos al costo UNITARIO en vez de
-- aplicar un porcentaje. `recargoFijoUnidad` queda NULL en modo margen.

-- CreateEnum
CREATE TYPE "ReglaPrecio" AS ENUM ('MARGEN_PORCENTUAL', 'RECARGO_FIJO_UNIDAD');

-- AlterTable
ALTER TABLE "ProductoLocal"
  ADD COLUMN "reglaPrecio" "ReglaPrecio" NOT NULL DEFAULT 'MARGEN_PORCENTUAL',
  ADD COLUMN "recargoFijoUnidad" DECIMAL(12,2);
