-- CreateTable
CREATE TABLE "OperadorLocal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperadorLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperadorEnLocal" (
    "operadorId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,

    CONSTRAINT "OperadorEnLocal_pkey" PRIMARY KEY ("operadorId","localId")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperadorLocal_nombre_key" ON "OperadorLocal"("nombre");

-- CreateIndex
CREATE INDEX "OperadorEnLocal_localId_idx" ON "OperadorEnLocal"("localId");

-- AddForeignKey
ALTER TABLE "OperadorEnLocal" ADD CONSTRAINT "OperadorEnLocal_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperadorEnLocal" ADD CONSTRAINT "OperadorEnLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
