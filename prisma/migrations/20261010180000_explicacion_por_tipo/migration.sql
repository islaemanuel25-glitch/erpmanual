-- UNA EXPLICACIÓN POR TIPO DE PAPEL, EL CAE, Y SE VA LA RECETA DE FORMATO (2026-10-10).
--
-- Segunda parte de la lectura interpretada (#165). El costo ya no lo arma el
-- código con una receta de impuestos: el modelo interpreta el papel y el código
-- controla la cuenta. Lo que queda de cada proveedor es CÓMO VIENE SU PAPEL, en
-- castellano, y ahora una por tipo de comprobante: CCU factura A y B armadas
-- distinto, y la de una no puede pisar la de la otra.
--
-- Mueve datos y TIENE DROP. En orden:
--   1. "ComprobanteProveedor"."cae", nullable, con índice único parcial.
--   2. La tabla "ExplicacionPorTipo".
--   3. La explicación que cada proveedor tenía —una sola— pasa a ser la del
--      tipo de papel que más le llegó (el tipo más frecuente entre sus
--      comprobantes no anulados; sin ninguno con letra, SIN_FACTURA), con su
--      versión, su fecha y su autor.
--   4. Las propuestas pendientes llevan su tipo: el de su comprobante, o el de
--      la lectura guardada. Las de la receta estructurada de antes de #165
--      —respuestas sin explicación— se borran: ya no hay con qué confirmarlas.
--   5. Se borran de "RecetaProveedor" las columnas de formato (IVA, interno,
--      percepciones) y la explicación única. Su contenido ya está: la
--      migración 20261010130441_lectura_interpretada lo tradujo a la
--      explicación, y el paso 3 la copió. Quedan la variación normal y si la
--      lista es por bulto, que son reglas de negocio.

-- ── 1. EL CAE ─────────────────────────────────────────────────────────────
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "cae" TEXT;

-- Único por comprobante en la AFIP: dos comprobantes no anulados del mismo
-- grupo con el mismo CAE son el mismo papel subido dos veces.
CREATE UNIQUE INDEX "ComprobanteProveedor_cae_key"
  ON "ComprobanteProveedor" ("grupoId", "cae")
  WHERE "cae" IS NOT NULL AND estado <> 'ANULADO'::"EstadoComprobante";

-- ── 2. LA TABLA ───────────────────────────────────────────────────────────
CREATE TABLE "ExplicacionPorTipo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "tipoComprobante" TEXT NOT NULL,
    "explicacion" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actualizadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaPor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExplicacionPorTipo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExplicacionPorTipo_proveedorId_idx" ON "ExplicacionPorTipo"("proveedorId");

CREATE UNIQUE INDEX "ExplicacionPorTipo_grupoId_proveedorId_tipoComprobante_key"
  ON "ExplicacionPorTipo"("grupoId", "proveedorId", "tipoComprobante");

ALTER TABLE "ExplicacionPorTipo" ADD CONSTRAINT "ExplicacionPorTipo_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. LA EXPLICACIÓN DE CADA PROVEEDOR, AL TIPO QUE MÁS LE LLEGÓ ─────────
--
-- El tipo se normaliza igual que `tipoDePapel` en explicacionPorTipo.js: una
-- letra A, B, C, M o E; cualquier otra cosa es SIN_FACTURA. En empate gana la
-- letra menor, para que el resultado no dependa del orden de las filas.
INSERT INTO "ExplicacionPorTipo"
  ("grupoId", "proveedorId", "tipoComprobante", "explicacion", "version", "actualizadaEn", "actualizadaPor")
SELECT
  r."grupoId",
  r."proveedorId",
  COALESCE((
    SELECT CASE WHEN upper(btrim(c.tipo)) IN ('A', 'B', 'C', 'M', 'E') THEN upper(btrim(c.tipo)) ELSE 'SIN_FACTURA' END AS t
    FROM "ComprobanteProveedor" c
    WHERE c."grupoId" = r."grupoId"
      AND c."proveedorId" = r."proveedorId"
      AND c.estado <> 'ANULADO'::"EstadoComprobante"
    GROUP BY 1
    ORDER BY count(*) DESC, 1 ASC
    LIMIT 1
  ), 'SIN_FACTURA'),
  btrim(r."explicacion"),
  r."version",
  COALESCE(r."explicacionActualizadaEn", r."updatedAt"),
  r."explicacionActualizadaPor"
FROM "RecetaProveedor" r
WHERE btrim(COALESCE(r."explicacion", '')) <> '';

-- ── 4. LAS PROPUESTAS PENDIENTES, CON SU TIPO ─────────────────────────────
DELETE FROM "RecetaPropuestaProveedor"
WHERE btrim(COALESCE(respuestas->>'explicacion', '')) = '';

ALTER TABLE "RecetaPropuestaProveedor" ADD COLUMN "tipoComprobante" TEXT NOT NULL DEFAULT 'SIN_FACTURA';

UPDATE "RecetaPropuestaProveedor" p
SET "tipoComprobante" = CASE
    WHEN upper(btrim(COALESCE(c.tipo, p.lectura->'identidad'->>'tipo', ''))) IN ('A', 'B', 'C', 'M', 'E')
      THEN upper(btrim(COALESCE(c.tipo, p.lectura->'identidad'->>'tipo')))
    ELSE 'SIN_FACTURA'
  END
FROM "RecetaPropuestaProveedor" p2
LEFT JOIN "ComprobanteProveedor" c ON c.id = p2."comprobanteId"
WHERE p2.id = p.id;

DROP INDEX "RecetaPropuestaProveedor_grupoId_proveedorId_key";

CREATE UNIQUE INDEX "RecetaPropuestaProveedor_grupoId_proveedorId_tipoComprobant_key"
  ON "RecetaPropuestaProveedor"("grupoId", "proveedorId", "tipoComprobante");

-- ── 5. SE VA LA RECETA DE FORMATO ─────────────────────────────────────────
ALTER TABLE "RecetaProveedor" DROP COLUMN "alicuotaIvaPct",
DROP COLUMN "explicacion",
DROP COLUMN "explicacionActualizadaEn",
DROP COLUMN "explicacionActualizadaPor",
DROP COLUMN "ivaIncluyeInternoEnLaBase",
DROP COLUMN "ivaPorLinea",
DROP COLUMN "percepciones",
DROP COLUMN "percepcionesEnCosto",
DROP COLUMN "tieneImpuestoInterno",
DROP COLUMN "version";
