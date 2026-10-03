-- COBROS OFFLINE: la evidencia de un cobro declarado por el POS.
--
-- Una tabla NUEVA, vacía, con su enum y sus índices. Aditiva: no toca ninguna
-- tabla existente, no escribe datos y no rellena nada.
--
-- SIN CLAVES FORÁNEAS, a propósito: una FK hacia "Venta", "Local", "Usuario" u
-- "OperadorLocal" tomaría al crearse un candado SHARE ROW EXCLUSIVE sobre esas
-- tablas, que choca con cada venta del POS mientras espera. Además varios ids
-- son declarados por el navegador y pueden no existir. La integridad la dan los
-- dos índices únicos, el candado del local que comparte con /api/pos-ventas/crear
-- y el código (lib/pos-ventas/cobroOfflineServidor.js).
--
-- Sin bloqueos sobre tablas en uso: CREATE TYPE, CREATE TABLE y CREATE INDEX
-- sobre una tabla que nadie lee todavía. Ver DEC-0012 y la nota del despliegue
-- en docs/deploy/MIGRACIONES-SIN-APLICAR.md.

-- CreateEnum
CREATE TYPE "EstadoCobroOffline" AS ENUM ('PENDIENTE', 'REQUIERE_REVISION', 'SINCRONIZADA', 'DESCARTADA');

-- CreateTable
CREATE TABLE "CobroOffline" (
    "id" SERIAL NOT NULL,
    "clientTxnId" TEXT NOT NULL,
    "localId" INTEGER NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "registradoPorUsuarioId" INTEGER NOT NULL,
    "registradoPorOperadorId" INTEGER,
    "cuentaDeclaradaId" INTEGER,
    "operadorDeclaradoId" INTEGER,
    "operadorVerificadoId" INTEGER,
    "turnoId" INTEGER,
    "cobradoEnDispositivo" TIMESTAMP(3),
    "relojDispositivoAlRegistrar" TIMESTAMP(3),
    "registradoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoRegistroEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalDeclarado" DECIMAL(12,2) NOT NULL,
    "formaPagoDeclarada" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "estado" "EstadoCobroOffline" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimoIntentoEn" TIMESTAMP(3),
    "ultimoRechazoStatus" INTEGER,
    "ultimoRechazoCodigo" TEXT,
    "ultimoRechazoMensaje" TEXT,
    "revisionMotivo" TEXT,
    "ventaId" INTEGER,
    "sincronizadaEn" TIMESTAMP(3),
    "resueltoPorUsuarioId" INTEGER,
    "resueltoPorOperadorId" INTEGER,
    "resueltoEn" TIMESTAMP(3),
    "motivoResolucion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobroOffline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CobroOffline_clientTxnId_key" ON "CobroOffline"("clientTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "CobroOffline_ventaId_key" ON "CobroOffline"("ventaId");

-- CreateIndex
CREATE INDEX "CobroOffline_localId_estado_idx" ON "CobroOffline"("localId", "estado");

-- CreateIndex
CREATE INDEX "CobroOffline_turnoId_idx" ON "CobroOffline"("turnoId");

-- CreateIndex
CREATE INDEX "CobroOffline_registradoEn_idx" ON "CobroOffline"("registradoEn");
