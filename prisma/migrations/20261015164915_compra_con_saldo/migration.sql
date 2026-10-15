-- UNA COMPRA RECIBIDA CON DEUDA, CONFIRMADA A SABIENDAS. Aditiva: una tabla
-- nueva. No toca ninguna columna ni ninguna fila existente, y el código
-- anterior no la lee. Guarda quién confirmó dejar saldo al recibir, cuándo, y
-- el total, lo pagado y el saldo de ese momento.

-- CreateTable
CREATE TABLE "CompraConSaldo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "pedidoProveedorId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "pagado" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL,
    "confirmadoPorId" INTEGER NOT NULL,
    "confirmadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompraConSaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompraConSaldo_pedidoProveedorId_key" ON "CompraConSaldo"("pedidoProveedorId");

-- CreateIndex
CREATE INDEX "CompraConSaldo_localId_confirmadoEn_id_idx" ON "CompraConSaldo"("localId", "confirmadoEn", "id");

-- AddForeignKey
ALTER TABLE "CompraConSaldo" ADD CONSTRAINT "CompraConSaldo_pedidoProveedorId_fkey" FOREIGN KEY ("pedidoProveedorId") REFERENCES "PedidoProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraConSaldo" ADD CONSTRAINT "CompraConSaldo_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
