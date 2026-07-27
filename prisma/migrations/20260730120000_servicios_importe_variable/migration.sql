-- Servicios de importe variable (cargas de colectivo / cargas virtuales).
-- Migración ADITIVA y compatible: agrega la modalidad del producto, el % de recargo
-- (default en base + override por local) y el SNAPSHOT histórico en VentaDetalle.
-- NO toca VentaPago, NO modifica ventas históricas, NO crea servicios automáticamente,
-- NO vuelve obligatorio ningún campo histórico (los nuevos de VentaDetalle son nullable
-- o con default seguro). Los productos existentes quedan NORMAL por default.

-- CreateEnum
CREATE TYPE "ModalidadProducto" AS ENUM ('NORMAL', 'IMPORTE_VARIABLE');

-- AlterTable: ProductoBase — modalidad + % de recargo general (default del servicio)
ALTER TABLE "ProductoBase"
  ADD COLUMN "modalidad" "ModalidadProducto" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "recargoServicioDefaultPct" DECIMAL(5,2);

-- AlterTable: ProductoLocal — override por local del % de recargo
ALTER TABLE "ProductoLocal"
  ADD COLUMN "recargoServicioPct" DECIMAL(5,2);

-- AlterTable: VentaDetalle — snapshot histórico del servicio (nullable / default seguro).
-- esServicio permite reconstruir la modalidad de la línea aunque el producto cambie luego.
ALTER TABLE "VentaDetalle"
  ADD COLUMN "esServicio" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "importeBaseServicio" DECIMAL(12,2),
  ADD COLUMN "recargoServicioPct" DECIMAL(5,2),
  ADD COLUMN "recargoServicioImporte" DECIMAL(12,2);
