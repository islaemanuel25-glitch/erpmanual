-- CreateTable
CREATE TABLE "TagCliente" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteTag" (
    "clienteId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ClienteTag_pkey" PRIMARY KEY ("clienteId","tagId")
);

-- CreateIndex
CREATE INDEX "TagCliente_localId_idx" ON "TagCliente"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "TagCliente_localId_nombre_key" ON "TagCliente"("localId", "nombre");

-- CreateIndex
CREATE INDEX "ClienteTag_clienteId_idx" ON "ClienteTag"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteTag_tagId_idx" ON "ClienteTag"("tagId");

-- AddForeignKey
ALTER TABLE "TagCliente" ADD CONSTRAINT "TagCliente_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteTag" ADD CONSTRAINT "ClienteTag_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteTag" ADD CONSTRAINT "ClienteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

