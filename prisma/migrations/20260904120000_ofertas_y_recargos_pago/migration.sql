-- OFERTAS COMERCIALES Y RECARGO POR MEDIO DE PAGO.
--
-- ── ES ADITIVA Y NO REINTERPRETA NADA ────────────────────────────────────────
--
-- Tres tablas nuevas, una tabla de configuración nueva, un enum nuevo y nueve
-- columnas nullable sobre `Venta` y `VentaDetalle`. NINGUNA columna existente se
-- borra, se renombra ni cambia de significado. En particular NO se tocan
-- `ConfiguracionGrupo.comisionDebito`, `comisionCredito` ni `comisionMercadopago`:
-- esas siguen siendo la comisión bancaria y nada de esta migración las lee.
--
-- COMPATIBLE HACIA ATRÁS durante la ventana entre migrar y recrear: la versión
-- de la aplicación que hoy está atendiendo no nombra ninguna de estas columnas
-- ni tablas, así que sigue vendiendo exactamente igual mientras existan vacías.
--
-- ── NO HAY BACKFILL, Y ES UNA DECISIÓN ───────────────────────────────────────
--
-- Las ventas anteriores quedan con las nueve columnas en NULL. Un NULL acá dice
-- la verdad: esa venta se cobró en un mundo donde no había ofertas ni recargos.
-- Escribir `descuentoPromocional = 0` y `totalAntesRecargo = total` en las
-- ~8.000 ventas existentes convertiría una ausencia en una afirmación, y
-- después no habría forma de distinguir "no hubo oferta" de "hubo oferta de
-- cero pesos".
--
-- ── POR QUÉ `Oferta` NO TIENE COLUMNA `estado` ───────────────────────────────
--
-- Los estados que ve la gente (BORRADOR, PROGRAMADA, ACTIVA, REVISAR, VENCIDA,
-- FINALIZADA) se derivan de `publicadaEn`, `finalizadaEn`, la ventana y las
-- líneas marcadas. Es el mismo criterio de `Venta.anuladaEn`: un estado guardado
-- más las fechas que lo determinan son dos fuentes de verdad, y el día que
-- discrepan no hay forma de saber cuál manda. Además así no hace falta un
-- proceso que a medianoche pase ofertas de PROGRAMADA a ACTIVA — una oferta que
-- arranca a las 8 está activa a las 8 porque la comparación da eso.
--
-- ── POR QUÉ EL RECARGO ES POR LOCAL Y LA COMISIÓN POR GRUPO ──────────────────
--
-- El recargo es una decisión comercial de cada boca (un local puede cobrar 5 %
-- por débito y otro no cobrar nada). La comisión bancaria sale de un contrato
-- con el procesador, que es uno solo para toda la cadena. Ponerlos en el mismo
-- lugar obligaría a elegir un alcance equivocado para uno de los dos.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Enum de condición de pago de la oferta
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CondicionPagoOferta') THEN
    CREATE TYPE "CondicionPagoOferta" AS ENUM ('SOLO_EFECTIVO', 'CUALQUIER_MEDIO');
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Oferta
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Oferta" (
  "id"                 SERIAL NOT NULL,
  "grupoId"            INTEGER NOT NULL,
  "localId"            INTEGER NOT NULL,
  "nombre"             TEXT NOT NULL,
  "condicionPago"      "CondicionPagoOferta" NOT NULL DEFAULT 'CUALQUIER_MEDIO',
  "inicioEn"           TIMESTAMP(3) NOT NULL,
  "finEn"              TIMESTAMP(3) NOT NULL,
  "observaciones"      TEXT,
  "publicadaEn"        TIMESTAMP(3),
  "publicadaPorId"     INTEGER,
  "finalizadaEn"       TIMESTAMP(3),
  "finalizadaPorId"    INTEGER,
  "motivoFinalizacion" TEXT,
  "renovadaDesdeId"    INTEGER,
  "creadoPorId"        INTEGER,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Oferta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Oferta_grupoId_idx" ON "Oferta"("grupoId");
CREATE INDEX IF NOT EXISTS "Oferta_localId_idx" ON "Oferta"("localId");
-- La consulta caliente del POS es "ofertas de este local vigentes ahora": sin
-- este índice, cada búsqueda de producto recorrería todas las ofertas del local,
-- incluidas las de hace un año.
CREATE INDEX IF NOT EXISTS "Oferta_localId_inicioEn_finEn_idx" ON "Oferta"("localId", "inicioEn", "finEn");
-- El barrido de vencimientos pregunta por finEn en una ventana corta.
CREATE INDEX IF NOT EXISTS "Oferta_finEn_idx" ON "Oferta"("finEn");

-- ───────────────────────────────────────────────────────────────────────────
-- 3. OfertaLinea
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OfertaLinea" (
  "id"                     SERIAL NOT NULL,
  "ofertaId"               INTEGER NOT NULL,
  "productoLocalId"        INTEGER NOT NULL,
  "productoBaseId"         INTEGER NOT NULL,
  "precioOferta"           DECIMAL(12,2) NOT NULL,
  "precioNormalReferencia" DECIMAL(12,2) NOT NULL,
  "costoReferencia"        DECIMAL(12,2) NOT NULL,
  "revisionPendienteDesde" TIMESTAMP(3),
  "costoAlDetectar"        DECIMAL(12,2),
  "revisadaEn"             TIMESTAMP(3),
  "revisadaPorId"          INTEGER,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfertaLinea_pkey" PRIMARY KEY ("id")
);

-- Un producto no puede estar dos veces en la misma oferta: serían dos precios
-- para lo mismo dentro de una sola configuración.
CREATE UNIQUE INDEX IF NOT EXISTS "OfertaLinea_ofertaId_productoLocalId_key"
  ON "OfertaLinea"("ofertaId", "productoLocalId");
CREATE INDEX IF NOT EXISTS "OfertaLinea_ofertaId_idx" ON "OfertaLinea"("ofertaId");
CREATE INDEX IF NOT EXISTS "OfertaLinea_productoLocalId_idx" ON "OfertaLinea"("productoLocalId");
CREATE INDEX IF NOT EXISTS "OfertaLinea_revisionPendienteDesde_idx" ON "OfertaLinea"("revisionPendienteDesde");

-- ───────────────────────────────────────────────────────────────────────────
-- 4. OfertaEvento — libro de cambios, inmutable
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OfertaEvento" (
  "id"            SERIAL NOT NULL,
  "ofertaId"      INTEGER NOT NULL,
  "ofertaLineaId" INTEGER,
  "tipo"          TEXT NOT NULL,
  "usuarioId"     INTEGER,
  "valorAnterior" JSONB,
  "valorNuevo"    JSONB,
  "nota"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OfertaEvento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OfertaEvento_ofertaId_idx" ON "OfertaEvento"("ofertaId");
CREATE INDEX IF NOT EXISTS "OfertaEvento_createdAt_idx" ON "OfertaEvento"("createdAt");
CREATE INDEX IF NOT EXISTS "OfertaEvento_tipo_idx" ON "OfertaEvento"("tipo");

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RecargoPagoLocal — el recargo que el comercio le cobra AL CLIENTE
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RecargoPagoLocal" (
  "id"               SERIAL NOT NULL,
  "localId"          INTEGER NOT NULL,
  "medio"            "MedioPago" NOT NULL,
  "porcentaje"       DECIMAL(5,2) NOT NULL DEFAULT 0,
  "actualizadoPorId" INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RecargoPagoLocal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecargoPagoLocal_localId_medio_key" ON "RecargoPagoLocal"("localId", "medio");
CREATE INDEX IF NOT EXISTS "RecargoPagoLocal_localId_idx" ON "RecargoPagoLocal"("localId");

-- NO se siembran filas. Un local sin fila no le cobra recargo a nadie, que es
-- exactamente cómo se comportan hoy los locales. Sembrar un 5 % "de ejemplo"
-- empezaría a cobrarle de más a clientes reales en la primera venta después de
-- desplegar.

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Snapshot en la venta
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Venta"
  ADD COLUMN IF NOT EXISTS "descuentoPromocional" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "totalAntesRecargo"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "recargoPagoPct"       DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "recargoPagoImporte"   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "recargoPagoMedio"     "MedioPago";

ALTER TABLE "VentaDetalle"
  ADD COLUMN IF NOT EXISTS "precioNormal"         DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "ofertaId"             INTEGER,
  ADD COLUMN IF NOT EXISTS "ofertaNombre"         TEXT,
  ADD COLUMN IF NOT EXISTS "descuentoPromocional" DECIMAL(12,2);

CREATE INDEX IF NOT EXISTS "VentaDetalle_ofertaId_idx" ON "VentaDetalle"("ofertaId");

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Claves foráneas
-- ───────────────────────────────────────────────────────────────────────────
--
-- `VentaDetalle.ofertaId` va con ON DELETE SET NULL y no con RESTRICT: una
-- oferta que se borra NUNCA puede llevarse ni bloquear una venta histórica. El
-- nombre de la oferta queda congelado en `ofertaNombre`, así que la venta se
-- puede leer completa aunque la configuración ya no exista.
--
-- `OfertaLinea` va con CASCADE hacia `Oferta` y hacia `ProductoLocal`: una línea
-- de oferta sin su oferta o sin su producto no significa nada. Ojo que esto es
-- la CONFIGURACIÓN, no el historial — el historial vive en VentaDetalle y no se
-- toca.

ALTER TABLE "Oferta" DROP CONSTRAINT IF EXISTS "Oferta_grupoId_fkey";
ALTER TABLE "Oferta" ADD CONSTRAINT "Oferta_grupoId_fkey"
  FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Oferta" DROP CONSTRAINT IF EXISTS "Oferta_localId_fkey";
ALTER TABLE "Oferta" ADD CONSTRAINT "Oferta_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfertaLinea" DROP CONSTRAINT IF EXISTS "OfertaLinea_ofertaId_fkey";
ALTER TABLE "OfertaLinea" ADD CONSTRAINT "OfertaLinea_ofertaId_fkey"
  FOREIGN KEY ("ofertaId") REFERENCES "Oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfertaLinea" DROP CONSTRAINT IF EXISTS "OfertaLinea_productoLocalId_fkey";
ALTER TABLE "OfertaLinea" ADD CONSTRAINT "OfertaLinea_productoLocalId_fkey"
  FOREIGN KEY ("productoLocalId") REFERENCES "ProductoLocal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfertaEvento" DROP CONSTRAINT IF EXISTS "OfertaEvento_ofertaId_fkey";
ALTER TABLE "OfertaEvento" ADD CONSTRAINT "OfertaEvento_ofertaId_fkey"
  FOREIGN KEY ("ofertaId") REFERENCES "Oferta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecargoPagoLocal" DROP CONSTRAINT IF EXISTS "RecargoPagoLocal_localId_fkey";
ALTER TABLE "RecargoPagoLocal" ADD CONSTRAINT "RecargoPagoLocal_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VentaDetalle" DROP CONSTRAINT IF EXISTS "VentaDetalle_ofertaId_fkey";
ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_ofertaId_fkey"
  FOREIGN KEY ("ofertaId") REFERENCES "Oferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
