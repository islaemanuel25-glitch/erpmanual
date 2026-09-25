-- LO QUE UNA LÍNEA DE COMPRA SUMÓ AL STOCK, CONGELADO AL RECIBIRLA.
--
-- Hasta acá la línea guardaba `cantidadRecibida` en la escala de compra —3
-- bultos— y lo que entró de verdad al stock —90 unidades— solo existía un
-- instante, adentro del cierre. Para saberlo después había que multiplicar por
-- el `factor_pack` de HOY, que no es el de ese día.
--
-- ── ESTRICTAMENTE ADITIVA ─────────────────────────────────────────────────
--
-- Un enum nuevo y dos columnas NULLABLE, sin default y sin backfill. Ninguna
-- fila existente se toca: las compras ya recibidas quedan en NULL, que quiere
-- decir "ERP Azul no guardaba este dato", y no se reconstruyen — rellenarlas
-- sería escribir con el producto de hoy justo lo que la columna existe para no
-- depender de él.
--
-- La versión anterior no lee estas columnas, así que la ventana entre migrar y
-- recrear no cambia nada.

-- CreateEnum
CREATE TYPE "UnidadFisicaStock" AS ENUM ('UNIDAD', 'KG', 'PIEZA');

-- AlterTable
ALTER TABLE "PedidoProveedorDetalle" ADD COLUMN     "stockIngresado" DECIMAL(12,3),
ADD COLUMN     "stockIngresadoUnidad" "UnidadFisicaStock";
