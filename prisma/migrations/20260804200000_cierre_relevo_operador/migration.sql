-- CIERRE CON RELEVO DE OPERADOR — Subetapa B. Migración ADITIVA.
--
-- No toca ni una fila existente y no hay backfill. `Turno.cierreEnPreparacionEn`
-- nace NULL en los ~miles de turnos que ya existen, y NULL significa exactamente
-- "sin corte", que es lo que eran todos hasta hoy. El cierre clásico sigue
-- funcionando sin cambios mientras se construye el nuevo.

-- CreateEnum
CREATE TYPE "EstadoCierrePreparacion" AS ENUM ('PREPARANDO', 'CONFIRMADO', 'CANCELADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "EstadoCambioPendiente" AS ENUM ('DISPONIBLE', 'RESERVADO', 'RECIBIDO', 'CANCELADO', 'VENCIDO');

-- AlterTable: el turno gana su tercer estado.
--
-- No se agrega un enum `estado`: el modelo ya deriva el estado de la presencia de
-- `cierre` y `anuladoEn`, y una segunda fuente de verdad podría contradecir a la
-- primera. NULL = sin corte.
ALTER TABLE "Turno" ADD COLUMN "cierreEnPreparacionEn" TIMESTAMP(3);

-- CreateIndex: el POS pregunta "¿tengo turno operativo?" en cada carga.
CREATE INDEX "Turno_localId_vendedorId_cierre_cierreEnPreparacionEn_idx"
  ON "Turno"("localId", "vendedorId", "cierre", "cierreEnPreparacionEn");

-- ═══════════════════════════════════════════════════════════════════════════
-- REDEFINICIÓN DEL ÍNDICE "UN TURNO ABIERTO POR USUARIO"
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SIN ESTO, TODA LA FUNCIONALIDAD ES IMPOSIBLE.
--
-- El índice de 20260803010000 impide dos turnos con `cierre IS NULL` del mismo
-- usuario en el mismo local. Un turno que tomó el corte de cierre TAMBIÉN tiene
-- `cierre IS NULL` —esa es su definición: cortado pero no cerrado—, así que la
-- base rechazaría la apertura del relevo con un P2002 y el mostrador quedaría
-- bloqueado exactamente igual que antes. La validación en la aplicación no
-- alcanza: el candado está en Postgres.
--
-- La regla que se quiere sostener no cambia: una persona no lleva dos cajas
-- OPERATIVAS a la vez. Lo que cambia es la definición de operativa, que ahora
-- excluye a los turnos congelados. Un usuario puede tener a lo sumo un turno
-- operativo y, además, uno en preparación de cierre esperando su conteo.
--
-- Se reemplaza en una sola transacción implícita de la migración: DROP y CREATE
-- seguidos, sin ventana en la que no haya ninguna garantía activa.
DROP INDEX IF EXISTS "Turno_local_vendedor_abierto_key";

CREATE UNIQUE INDEX "Turno_local_vendedor_abierto_key"
    ON "Turno" ("localId", "vendedorId")
 WHERE "cierre" IS NULL AND "cierreEnPreparacionEn" IS NULL;

-- CreateTable: el corte congelado.
CREATE TABLE "CierrePreparacion" (
    "id"                    SERIAL NOT NULL,
    "token"                 TEXT NOT NULL,
    "turnoId"               INTEGER NOT NULL,
    "localId"               INTEGER NOT NULL,
    "grupoId"               INTEGER NOT NULL,
    "iniciadoPorUsuarioId"  INTEGER NOT NULL,
    "iniciadoPorOperadorId" INTEGER,
    "iniciadoEn"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corteEn"               TIMESTAMP(3) NOT NULL,
    "estado"                "EstadoCierrePreparacion" NOT NULL DEFAULT 'PREPARANDO',
    "efectivoEsperadoCorte" DECIMAL(12,2) NOT NULL,
    "ultimaVentaId"         INTEGER,
    "ultimoMovimientoId"    INTEGER,
    "cantidadVentasCorte"   INTEGER NOT NULL DEFAULT 0,
    "desgloseContado"       JSONB,
    "desgloseCambio"        JSONB,
    "totalContado"          DECIMAL(12,2),
    "totalCambio"           DECIMAL(12,2),
    "retiroFinal"           DECIMAL(12,2),
    "observacion"           TEXT,
    "idempotencyKey"        TEXT NOT NULL,
    "venceEn"               TIMESTAMP(3) NOT NULL,
    "confirmadoEn"          TIMESTAMP(3),
    "arqueoFinalId"         INTEGER,
    "canceladoEn"           TIMESTAMP(3),
    "canceladoPorUsuarioId" INTEGER,
    "motivoCancelacion"     TEXT,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CierrePreparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable: el cambio físico que espera al próximo operador.
CREATE TABLE "CambioPendiente" (
    "id"                     SERIAL NOT NULL,
    "localId"                INTEGER NOT NULL,
    "grupoId"                INTEGER NOT NULL,
    "cierrePreparacionId"    INTEGER NOT NULL,
    "turnoOrigenId"          INTEGER NOT NULL,
    "operadorOrigenId"       INTEGER,
    "dejadoEn"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total"                  DECIMAL(12,2) NOT NULL,
    "desglose"               JSONB NOT NULL,
    "observacion"            TEXT,
    "estado"                 "EstadoCambioPendiente" NOT NULL DEFAULT 'DISPONIBLE',
    "reservadoPorUsuarioId"  INTEGER,
    "reservadoPorOperadorId" INTEGER,
    "reservadoEn"            TIMESTAMP(3),
    "reservaVenceEn"         TIMESTAMP(3),
    "turnoDestinoId"         INTEGER,
    "recibidoPorUsuarioId"   INTEGER,
    "recibidoPorOperadorId"  INTEGER,
    "recibidoEn"             TIMESTAMP(3),
    "totalRecibido"          DECIMAL(12,2),
    "desgloseRecibido"       JSONB,
    "diferencia"             DECIMAL(12,2),
    "motivoDiferencia"       TEXT,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CambioPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CierrePreparacion_token_key" ON "CierrePreparacion"("token");
CREATE UNIQUE INDEX "CierrePreparacion_arqueoFinalId_key" ON "CierrePreparacion"("arqueoFinalId");

-- ÍNDICE PARCIAL: un corte VIGENTE por turno.
--
-- Dos "iniciar cierre" simultáneos no pueden crear dos cortes del mismo turno,
-- aunque el lock de fila fallara. Pero es PARCIAL a propósito: un corte
-- CANCELADO es uno que se deshizo —el turno volvió a operar— y tiene que poder
-- tomar otro. Con un UNIQUE común, cancelar por error quemaba el turno para
-- siempre y no quedaba forma de volver a cerrarlo.
--
-- Prisma no soporta WHERE en @@unique, así que este índice vive solo en SQL,
-- igual que "Turno_local_vendedor_abierto_key". Si alguna vez se corre
-- `prisma migrate dev`, revisar que no lo proponga como drift y lo elimine.
CREATE UNIQUE INDEX "CierrePreparacion_turno_vigente_key"
  ON "CierrePreparacion"("turnoId")
  WHERE "estado" IN ('PREPARANDO', 'CONFIRMADO');

CREATE INDEX "CierrePreparacion_turnoId_idx" ON "CierrePreparacion"("turnoId");
CREATE INDEX "CierrePreparacion_localId_estado_idx" ON "CierrePreparacion"("localId", "estado");
CREATE INDEX "CierrePreparacion_grupoId_idx" ON "CierrePreparacion"("grupoId");
CREATE INDEX "CierrePreparacion_venceEn_idx" ON "CierrePreparacion"("venceEn");

-- CreateIndex
CREATE UNIQUE INDEX "CambioPendiente_cierrePreparacionId_key" ON "CambioPendiente"("cierrePreparacionId");
CREATE UNIQUE INDEX "CambioPendiente_turnoOrigenId_key" ON "CambioPendiente"("turnoOrigenId");
-- LA GARANTÍA DURA CONTRA EL DOBLE CONSUMO: dos turnos no pueden tomar el mismo
-- sobre de cambio ni aunque fallen todas las validaciones de la aplicación.
CREATE UNIQUE INDEX "CambioPendiente_turnoDestinoId_key" ON "CambioPendiente"("turnoDestinoId");
CREATE INDEX "CambioPendiente_localId_estado_idx" ON "CambioPendiente"("localId", "estado");
CREATE INDEX "CambioPendiente_grupoId_idx" ON "CambioPendiente"("grupoId");
CREATE INDEX "CambioPendiente_reservaVenceEn_idx" ON "CambioPendiente"("reservaVenceEn");

-- AddForeignKey
ALTER TABLE "CierrePreparacion" ADD CONSTRAINT "CierrePreparacion_turnoId_fkey"
  FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CierrePreparacion" ADD CONSTRAINT "CierrePreparacion_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_cierrePreparacionId_fkey"
  FOREIGN KEY ("cierrePreparacionId") REFERENCES "CierrePreparacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_turnoOrigenId_fkey"
  FOREIGN KEY ("turnoOrigenId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_turnoDestinoId_fkey"
  FOREIGN KEY ("turnoDestinoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;
