-- CreateTable
CREATE TABLE "PuntosConfigLocal" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "reglasJson" JSONB,
    "redencionJson" JSONB,
    "exclusionesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuntosConfigLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePuntoMovimiento" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "direccion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "ventaId" INTEGER,
    "userId" INTEGER,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientePuntoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PuntosConfigLocal_localId_key" ON "PuntosConfigLocal"("localId");

-- CreateIndex
CREATE INDEX "PuntosConfigLocal_grupoId_idx" ON "PuntosConfigLocal"("grupoId");

-- CreateIndex
CREATE INDEX "PuntosConfigLocal_localId_idx" ON "PuntosConfigLocal"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientePuntoMovimiento_ventaId_tipo_key" ON "ClientePuntoMovimiento"("ventaId", "tipo");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_grupoId_localId_clienteId_idx" ON "ClientePuntoMovimiento"("grupoId", "localId", "clienteId");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_localId_idx" ON "ClientePuntoMovimiento"("localId");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_createdAt_idx" ON "ClientePuntoMovimiento"("createdAt");

-- AddForeignKey
ALTER TABLE "PuntosConfigLocal" ADD CONSTRAINT "PuntosConfigLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
