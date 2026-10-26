-- ADITIVA: una columna nula. No toca ninguna fila.
--
-- La mercadería que llega sin ningún papel (Mauro, 2026-10-26): "Llegó sin
-- papel" o "No llegó" por línea del pedido que no está en ninguna boleta. Los
-- pedidos de antes quedan en null, que es "nadie contestó".

-- AlterTable
ALTER TABLE "PedidoProveedorDetalle" ADD COLUMN     "llegoSinPapel" BOOLEAN;
