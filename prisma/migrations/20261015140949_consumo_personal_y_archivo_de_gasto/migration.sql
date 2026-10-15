-- EL CONSUMO DEL PERSONAL Y LA FOTO DE UN GASTO. Aditiva: tres tablas nuevas y
-- una categoría de gasto nueva. No toca ninguna columna ni ninguna fila
-- existente. El efectivo esperado y el cierre no leen ninguna de las tablas.

-- CreateTable
CREATE TABLE "ConsumoPersonal" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "operadorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "gastoId" INTEGER,
    "totalCosto" DECIMAL(12,2) NOT NULL,
    "totalPrecio" DECIMAL(12,2) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoPersonal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoPersonalLinea" (
    "id" SERIAL NOT NULL,
    "consumoId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "productoLocalId" INTEGER,
    "nombre" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "cantidadStock" DECIMAL(12,3),
    "costoLinea" DECIMAL(12,2) NOT NULL,
    "precioLinea" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ConsumoPersonalLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoArchivo" (
    "id" SERIAL NOT NULL,
    "gastoId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "mime" TEXT,
    "tamano" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "ubicacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoArchivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoPersonal_gastoId_key" ON "ConsumoPersonal"("gastoId");

-- CreateIndex
CREATE INDEX "ConsumoPersonal_turnoId_idx" ON "ConsumoPersonal"("turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumoPersonal_localId_idempotencyKey_key" ON "ConsumoPersonal"("localId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ConsumoPersonalLinea_consumoId_idx" ON "ConsumoPersonalLinea"("consumoId");

-- CreateIndex
CREATE UNIQUE INDEX "GastoArchivo_gastoId_orden_key" ON "GastoArchivo"("gastoId", "orden");

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonalLinea" ADD CONSTRAINT "ConsumoPersonalLinea_consumoId_fkey" FOREIGN KEY ("consumoId") REFERENCES "ConsumoPersonal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoArchivo" ADD CONSTRAINT "GastoArchivo_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La categoría del gasto que deja cada consumo del personal. Una fila de
-- catálogo, como las siete iniciales de Gastos; si alguien ya la creó a mano
-- con ese nombre, se usa ésa. Va antes de "Otros", que sigue al final.
INSERT INTO "CategoriaGasto" ("nombre", "orden", "updatedAt") VALUES
  ('Consumo del personal', 90, CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;
