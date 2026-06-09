-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT,
    "href" TEXT,
    "entidadTipo" TEXT,
    "entidadId" INTEGER,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notificacion_grupoId_idx" ON "Notificacion"("grupoId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_idx" ON "Notificacion"("usuarioId");

-- CreateIndex
CREATE INDEX "Notificacion_grupoId_leida_idx" ON "Notificacion"("grupoId", "leida");
