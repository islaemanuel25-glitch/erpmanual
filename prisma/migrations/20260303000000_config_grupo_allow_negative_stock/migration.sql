-- CreateTable
CREATE TABLE "ConfiguracionGrupo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionGrupo_grupoId_key" ON "ConfiguracionGrupo"("grupoId");

-- CreateIndex
CREATE INDEX "ConfiguracionGrupo_grupoId_idx" ON "ConfiguracionGrupo"("grupoId");

-- AddForeignKey
ALTER TABLE "ConfiguracionGrupo" ADD CONSTRAINT "ConfiguracionGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
