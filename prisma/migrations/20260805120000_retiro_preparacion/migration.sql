-- RETIRO DE RECAUDACIÓN CON CORTE CONGELADO
--
-- Hasta ahora el retiro no tenía preparación persistida: el conteo vivía en el
-- navegador y el efectivo esperado se recalculaba dentro de la transacción de
-- confirmación. Resultado: las ventas que entraban mientras el cajero contaba se
-- sumaban al esperado y le aparecían como faltante.
--
-- Esta tabla es el espejo de CierrePreparacion, con una diferencia semántica que
-- justifica que sea una tabla aparte y no un estado más de aquélla: un retiro NO
-- cierra el turno, NO lo libera y NO publica ningún sobre de cambio. La caja
-- sigue vendiendo con el cambio separado, y las ventas posteriores se acumulan
-- encima.
--
-- ES ADITIVA. No toca ninguna tabla existente salvo por la clave foránea hacia
-- ArqueoCaja, que vive del lado de esta tabla. No hay backfill: los retiros ya
-- registrados siguen siendo ArqueoCaja PARCIAL sin preparación asociada, y se
-- muestran exactamente igual que antes.

-- ── Estados ────────────────────────────────────────────────────────────────
--
-- Tres y no cuatro. El cierre tiene además VENCIDO porque un corte de cierre
-- congela el turno y alguien tiene que ir a resolverlo; un retiro abandonado no
-- traba nada —la caja sigue operando— así que no necesita marca de atraso.
CREATE TYPE "EstadoRetiroPreparacion" AS ENUM ('PREPARANDO', 'CONFIRMADO', 'CANCELADO');

CREATE TABLE "RetiroPreparacion" (
    "id"    SERIAL NOT NULL,
    "token" TEXT   NOT NULL,

    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,

    "iniciadoPorUsuarioId"  INTEGER NOT NULL,
    "iniciadoPorOperadorId" INTEGER,
    "corteEn"               TIMESTAMP(3) NOT NULL,

    "estado" "EstadoRetiroPreparacion" NOT NULL DEFAULT 'PREPARANDO',

    -- El número que no se recalcula.
    "efectivoEsperadoCorte" DECIMAL(12,2) NOT NULL,

    -- Frontera por id, no por timestamp: dos filas del mismo milisegundo son
    -- indistinguibles por fecha.
    "ultimaVentaId"      INTEGER,
    "ultimoMovimientoId" INTEGER,

    -- El cambio separado ANTES del corte. NOT NULL: un retiro sin cambio
    -- declarado no existe en el orden nuevo, aunque el importe sea cero.
    "desgloseCambio" JSONB         NOT NULL,
    "totalCambio"    DECIMAL(12,2) NOT NULL,

    -- esperado − cambio, congelado.
    "efectivoRetiradoEsperado" DECIMAL(12,2) NOT NULL,

    -- El conteo del retiro, al confirmar.
    "desgloseRetiroContado" JSONB,
    "totalRetiroContado"    DECIMAL(12,2),

    -- retiro contado + cambio separado. Es el total equivalente del cajón que se
    -- copia a ArqueoCaja.efectivoContado, para no cambiarle el significado
    -- histórico a esa columna.
    "totalCajonDerivado" DECIMAL(12,2),

    "diferencia"  DECIMAL(12,2),
    "observacion" TEXT,

    "idempotencyKey" TEXT NOT NULL,

    "confirmadoEn" TIMESTAMP(3),
    "arqueoCajaId" INTEGER,

    "canceladoEn"           TIMESTAMP(3),
    "canceladoPorUsuarioId" INTEGER,
    "motivoCancelacion"     TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetiroPreparacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetiroPreparacion_token_key" ON "RetiroPreparacion"("token");

-- Un arqueo no puede pertenecer a dos preparaciones.
CREATE UNIQUE INDEX "RetiroPreparacion_arqueoCajaId_key" ON "RetiroPreparacion"("arqueoCajaId");

-- ── UN RETIRO EN PREPARACIÓN POR TURNO ─────────────────────────────────────
--
-- PARCIAL a propósito, y la diferencia con un @@unique común es toda la
-- funcionalidad: una caja hace varios retiros a lo largo del día y todos
-- conviven en esta tabla. Lo que no puede haber es dos a medio contar sobre el
-- mismo turno, porque los dos congelarían el mismo esperado y cada uno se
-- llevaría la misma recaudación.
--
-- Prisma no sabe expresar `WHERE` en @@unique, así que este índice vive
-- únicamente acá. Mismo patrón que "CierrePreparacion_turno_vigente_key" y
-- "Turno_local_vendedor_abierto_key".
CREATE UNIQUE INDEX "RetiroPreparacion_turno_vigente_key"
    ON "RetiroPreparacion"("turnoId")
    WHERE "estado" = 'PREPARANDO';

CREATE INDEX "RetiroPreparacion_turnoId_idx" ON "RetiroPreparacion"("turnoId");
CREATE INDEX "RetiroPreparacion_localId_estado_idx" ON "RetiroPreparacion"("localId", "estado");
CREATE INDEX "RetiroPreparacion_corteEn_idx" ON "RetiroPreparacion"("corteEn");

-- El turno se borra en cascada, igual que CierrePreparacion: la preparación no
-- tiene sentido sin él. El local NO, porque borrar un local con historia debe
-- fallar en vez de llevarse los cortes por delante.
ALTER TABLE "RetiroPreparacion"
    ADD CONSTRAINT "RetiroPreparacion_turnoId_fkey"
    FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetiroPreparacion"
    ADD CONSTRAINT "RetiroPreparacion_localId_fkey"
    FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RetiroPreparacion"
    ADD CONSTRAINT "RetiroPreparacion_arqueoCajaId_fkey"
    FOREIGN KEY ("arqueoCajaId") REFERENCES "ArqueoCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
