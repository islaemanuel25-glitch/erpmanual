/*
  Warnings:

  - You are about to drop the column `diaPedidos` on the `Proveedor` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Proveedor" DROP COLUMN "diaPedidos",
ADD COLUMN     "dias_pedido" "DiaPedido"[] DEFAULT ARRAY[]::"DiaPedido"[];
