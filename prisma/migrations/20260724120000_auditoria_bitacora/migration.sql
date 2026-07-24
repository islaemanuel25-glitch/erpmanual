-- CreateTable
CREATE TABLE "AuditoriaBitacora" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    "operadorId" INTEGER,
    "localId" INTEGER,
    "grupoId" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "metodo" TEXT,
    "antes" JSONB,
    "despues" JSONB,

    CONSTRAINT "AuditoriaBitacora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_createdAt_idx" ON "AuditoriaBitacora"("createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_localId_idx" ON "AuditoriaBitacora"("localId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_usuarioId_idx" ON "AuditoriaBitacora"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_operadorId_idx" ON "AuditoriaBitacora"("operadorId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_entidad_idx" ON "AuditoriaBitacora"("entidad");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_accion_idx" ON "AuditoriaBitacora"("accion");
