-- PAGOS A PROVEEDORES: la cuenta por pagar de una compra y sus pagos.
--
-- ADITIVA. Dos tablas nuevas, un enum nuevo y sus índices y claves foráneas.
-- No toca ninguna columna ni fila existente: las compras históricas NO reciben
-- cuenta —no hay backfill—, así que en producción las dos tablas nacen vacías y
-- solo se llenan cuando alguien llame a `crearCuentaPorPagarDesdeCompra`.
--
-- Los dos CHECK del final son la base diciendo lo que el código también dice,
-- para que un camino que se saltee la función canónica no pueda dejar un pago
-- imposible:
--
--   · un importe cero o negativo no es un pago ni una deuda;
--   · EFECTIVO lleva turno y movimiento de caja, y los demás medios no llevan
--     ninguno de los dos. Sin eso, un efectivo sin movimiento no descontaría del
--     cajón, y un movimiento colgado de una transferencia lo descontaría sin que
--     haya salido plata física.

-- CreateEnum
CREATE TYPE "MedioPagoProveedor" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO', 'OTRO');

-- CreateTable
CREATE TABLE "CuentaPorPagarProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "pedidoProveedorId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "localGastoId" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "vencimientoProveedor" DATE,
    "fechaPrevistaPago" DATE,
    "creadoPorId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaPorPagarProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoProveedor" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medio" "MedioPagoProveedor" NOT NULL,
    "localOrigenId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "turnoId" INTEGER,
    "cajaMovimientoId" INTEGER,
    "nota" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaPorPagarProveedor_pedidoProveedorId_key" ON "CuentaPorPagarProveedor"("pedidoProveedorId");

-- CreateIndex
CREATE INDEX "CuentaPorPagarProveedor_grupoId_idx" ON "CuentaPorPagarProveedor"("grupoId");

-- CreateIndex
CREATE INDEX "CuentaPorPagarProveedor_localGastoId_idx" ON "CuentaPorPagarProveedor"("localGastoId");

-- CreateIndex
CREATE INDEX "CuentaPorPagarProveedor_proveedorId_idx" ON "CuentaPorPagarProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "PagoProveedor_cajaMovimientoId_key" ON "PagoProveedor"("cajaMovimientoId");

-- CreateIndex
-- El mismo intento de pago no puede entrar dos veces en la misma cuenta.
CREATE UNIQUE INDEX "PagoProveedor_cuentaId_idempotencyKey_key" ON "PagoProveedor"("cuentaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PagoProveedor_localOrigenId_idx" ON "PagoProveedor"("localOrigenId");

-- CreateIndex
CREATE INDEX "PagoProveedor_turnoId_idx" ON "PagoProveedor"("turnoId");

-- AddForeignKey
ALTER TABLE "CuentaPorPagarProveedor" ADD CONSTRAINT "CuentaPorPagarProveedor_pedidoProveedorId_fkey" FOREIGN KEY ("pedidoProveedorId") REFERENCES "PedidoProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagarProveedor" ADD CONSTRAINT "CuentaPorPagarProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagarProveedor" ADD CONSTRAINT "CuentaPorPagarProveedor_localGastoId_fkey" FOREIGN KEY ("localGastoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CuentaPorPagarProveedor" ADD CONSTRAINT "CuentaPorPagarProveedor_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaPorPagarProveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_localOrigenId_fkey" FOREIGN KEY ("localOrigenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_cajaMovimientoId_fkey" FOREIGN KEY ("cajaMovimientoId") REFERENCES "CajaMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Importes positivos.
ALTER TABLE "CuentaPorPagarProveedor" ADD CONSTRAINT "CuentaPorPagarProveedor_total_positivo" CHECK ("total" > 0);
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_monto_positivo" CHECK ("monto" > 0);

-- Efectivo ⇔ turno y movimiento de caja. Por el mismo CHECK, el `SET NULL` de
-- las dos claves foráneas de arriba no puede dejar un efectivo huérfano: borrar
-- el turno o el movimiento de un pago en efectivo falla en vez de desvincularlo.
ALTER TABLE "PagoProveedor" ADD CONSTRAINT "PagoProveedor_efectivo_con_caja" CHECK (
  ("medio" = 'EFECTIVO' AND "turnoId" IS NOT NULL AND "cajaMovimientoId" IS NOT NULL)
  OR ("medio" <> 'EFECTIVO' AND "turnoId" IS NULL AND "cajaMovimientoId" IS NULL)
);
