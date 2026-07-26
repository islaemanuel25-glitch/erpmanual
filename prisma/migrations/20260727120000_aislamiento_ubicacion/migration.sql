-- Aislamiento por ubicación (local/depósito) — migración ADITIVA y compatible.
-- Todos los campos nuevos son nullable o con default; no rompe filas existentes.

-- CreateEnum: alcance real de una notificación.
CREATE TYPE "AlcanceNotificacion" AS ENUM ('USUARIO', 'LOCAL', 'DEPOSITO', 'PARTICIPANTES', 'GRUPO');

-- Notificacion: dimensión de ubicación + alcance + permiso requerido.
ALTER TABLE "Notificacion"
  ADD COLUMN "localId" INTEGER,
  ADD COLUMN "origenLocalId" INTEGER,
  ADD COLUMN "destinoLocalId" INTEGER,
  ADD COLUMN "alcance" "AlcanceNotificacion" NOT NULL DEFAULT 'GRUPO',
  ADD COLUMN "permisoRequerido" TEXT;

CREATE INDEX "Notificacion_localId_idx" ON "Notificacion"("localId");
CREATE INDEX "Notificacion_alcance_idx" ON "Notificacion"("alcance");

-- PushSubscription: ubicación de la suscripción.
ALTER TABLE "PushSubscription" ADD COLUMN "localId" INTEGER;
CREATE INDEX "PushSubscription_localId_idx" ON "PushSubscription"("localId");

-- PedidoProveedor: ubicación que creó el pedido = destino de stock al recibir.
ALTER TABLE "PedidoProveedor" ADD COLUMN "creadoEnLocalId" INTEGER;
CREATE INDEX "PedidoProveedor_creadoEnLocalId_idx" ON "PedidoProveedor"("creadoEnLocalId");

-- Estado de lectura de notificaciones POR USUARIO (ausencia = no leída).
CREATE TABLE "NotificacionLectura" (
  "id"             SERIAL NOT NULL,
  "notificacionId" INTEGER NOT NULL,
  "usuarioId"      INTEGER NOT NULL,
  "leidaAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificacionLectura_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificacionLectura_notificacionId_usuarioId_key" ON "NotificacionLectura"("notificacionId", "usuarioId");
CREATE INDEX "NotificacionLectura_usuarioId_idx" ON "NotificacionLectura"("usuarioId");
ALTER TABLE "NotificacionLectura" ADD CONSTRAINT "NotificacionLectura_notificacionId_fkey"
  FOREIGN KEY ("notificacionId") REFERENCES "Notificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: las notificaciones de compras existentes son operación del DEPÓSITO.
-- Se les asigna alcance=DEPOSITO y localId = depósito del grupo, para que dejen de
-- verse en los locales. El resto (no hay otros tipos hoy) queda en GRUPO (default).
UPDATE "Notificacion" n
SET "alcance" = 'DEPOSITO',
    "localId" = gd."localId"
FROM "GrupoDeposito" gd
WHERE gd."grupoId" = n."grupoId"
  AND (n."entidadTipo" = 'COMPRA_PROVEEDOR' OR n."tipo" = 'PEDIDO_PROVEEDOR_ENVIADO');

-- Backfill 2: los pedidos a proveedor existentes se crearon contra el depósito.
-- creadoEnLocalId ← depositoId conserva su visibilidad actual (en el depósito).
UPDATE "PedidoProveedor" SET "creadoEnLocalId" = "depositoId" WHERE "creadoEnLocalId" IS NULL;
