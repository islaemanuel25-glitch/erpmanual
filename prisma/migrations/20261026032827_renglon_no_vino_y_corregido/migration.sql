-- ADITIVA: una columna nula y una booleana con default false. No rellena ni
-- toca ninguna fila: todo renglón ya leído queda "vino" y "no tocado a mano".
--
-- La salida a mano cuando la lectura falla (Emanuel, 2026-10-26): "No vino"
-- saca un producto leído del comprobante, y `corregidoAManoEn` marca lo que tocó
-- una persona para que el recálculo al abrir el pedido no lo vuelva a pisar.

-- AlterTable
ALTER TABLE "ComprobanteLinea" ADD COLUMN     "corregidoAManoEn" TIMESTAMP(3),
ADD COLUMN     "noVino" BOOLEAN NOT NULL DEFAULT false;
