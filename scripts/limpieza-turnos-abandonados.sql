-- scripts/limpieza-turnos-abandonados.sql
--
-- ANULACIÓN TÉCNICA de cinco aperturas abandonadas o de prueba en producción.
-- Confirmadas por el dueño: ninguna movió dinero real.
--
--   147 Mini unidas        · 0 ventas · fondo $0        · abandonado
--   148 Minimarket Ayala   · 1 venta de prueba $5.000   · "Carga de colectivo"
--   153 Casiano casas      · 0 ventas · fondo $0        · abandonado
--   159 Mini unidas        · 0 ventas · fondo FICTICIO $230.000
--   174 Casiano casas      · 0 ventas · fondo $0        · abandonado
--
-- QUÉ HACE Y QUÉ NO
--   · Conserva las cinco filas y todos sus datos. NINGÚN DELETE.
--   · NO toca `montoInicial`: los $230.000 del turno 159 quedan como evidencia
--     de qué se cargó. Pisarlos borraría el rastro del error.
--   · NO crea ArqueoCaja ni CajaMovimiento: no hubo conteo ni movimiento de plata.
--   · NO deja fondo para el turno siguiente (`fondoDejadoCierre` NULL en 148/159,
--     0 en los tres sin actividad, según lo aprobado).
--   · NO borra la venta 1293 del turno 148: se trata aparte.
--
-- POR QUÉ NULL Y NO CERO EN 148 Y 159
--   NULL significa "no se contó"; cero significaría "se contó y dio cero". Poner
--   cero contra un fondo de $230.000 fabricaría un faltante de $230.000 que nadie
--   debe, y ese número entraría en la auditoría por operador de Estefania.
--
-- USO (una sola transacción; cualquier guarda que falle aborta TODO):
--   docker exec -i erpazul_db psql -U erpazul -d erpazul -v ON_ERROR_STOP=1 \
--     -v ejecutor=1 -f limpieza-turnos-abandonados.sql
--
--   `ejecutor` = id del Usuario que queda registrado en `anuladoPorId` y
--   `cerradoPorId`. Sin ese parámetro el script no corre.

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- Las variables de psql (`:ejecutor`) NO se interpolan dentro de un bloque
-- DO $$...$$ —el cuerpo es una cadena para el servidor, psql no lo toca—, así que
-- el valor se guarda como parámetro de sesión y los bloques lo leen de ahí.
SELECT set_config('erpazul.ejecutor', :'ejecutor', true);

-- ── GUARDA 1 · El ejecutor tiene que existir ────────────────────────────────
DO $$
DECLARE eje int := current_setting('erpazul.ejecutor')::int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Usuario" WHERE id = eje) THEN
    RAISE EXCEPTION 'ABORTA: el usuario ejecutor % no existe', eje;
  END IF;
END $$;

-- ── GUARDA 2 · Las columnas de anulación tienen que estar aplicadas ─────────
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name = 'Turno'
        AND column_name IN ('anuladoEn','anuladoPorId','motivoAnulacion')) <> 3 THEN
    RAISE EXCEPTION 'ABORTA: falta la migración 20260802220000_anulacion_turnos';
  END IF;
END $$;

-- ── GUARDA 3 · Los cinco siguen abiertos y sin anular ───────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "Turno"
   WHERE id IN (147,148,153,159,174) AND cierre IS NULL AND "anuladoEn" IS NULL;
  IF n <> 5 THEN
    RAISE EXCEPTION 'ABORTA: se esperaban 5 turnos abiertos y sin anular, hay %', n;
  END IF;
END $$;

-- ── GUARDA 4 · Nada cambió desde la auditoría ──────────────────────────────
-- Ventas: solo el 148 tiene una (la 1293). Movimientos y arqueos: ninguno.
-- Importes: los mismos que se auditaron.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "Venta" WHERE "turnoId" IN (147,153,159,174);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: aparecieron % ventas en turnos que no tenían', n; END IF;

  SELECT count(*) INTO n FROM "Venta" WHERE "turnoId" = 148;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTA: el turno 148 tiene % ventas, se esperaba 1', n; END IF;

  SELECT count(*) INTO n FROM "Venta" WHERE "turnoId" = 148 AND id = 1293 AND total = 5000.00;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTA: la venta 1293 del turno 148 cambió'; END IF;

  SELECT count(*) INTO n FROM "CajaMovimiento" WHERE "turnoId" IN (147,148,153,159,174);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: aparecieron % movimientos de caja', n; END IF;

  SELECT count(*) INTO n FROM "ArqueoCaja" WHERE "turnoId" IN (147,148,153,159,174);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: aparecieron % arqueos', n; END IF;

  SELECT count(*) INTO n FROM "Turno"
   WHERE (id = 147 AND "montoInicial" = 0)
      OR (id = 148 AND "montoInicial" = 0)
      OR (id = 153 AND "montoInicial" = 0)
      OR (id = 159 AND "montoInicial" = 230000.00)
      OR (id = 174 AND "montoInicial" = 0);
  IF n <> 5 THEN RAISE EXCEPTION 'ABORTA: cambió el montoInicial de algún turno (coinciden %)', n; END IF;

  SELECT count(*) INTO n FROM "Turno"
   WHERE id IN (147,148,153,159,174)
     AND ("montoEsperadoEfectivo" IS NOT NULL OR "montoRealEfectivo" IS NOT NULL
          OR "diferenciaEfectivo" IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: algún turno ya tiene importes de cierre'; END IF;
END $$;

-- ── 147, 153, 174 · Sin actividad: cierre en cero ──────────────────────────
UPDATE "Turno" SET
  cierre                   = now(),
  "cerradoPorId"           = :ejecutor,
  "anuladoEn"              = now(),
  "anuladoPorId"           = :ejecutor,
  "motivoAnulacion"        = 'Apertura abandonada sin actividad',
  "montoEsperadoEfectivo"  = 0,
  "montoRealEfectivo"      = 0,
  "diferenciaEfectivo"     = 0,
  "efectivoRetiradoCierre" = 0,
  "fondoDejadoCierre"      = 0,
  "cantidadVentas"         = 0,
  observaciones            = 'Turno anulado administrativamente por apertura abandonada sin actividad.'
WHERE id IN (147,153,174) AND cierre IS NULL AND "anuladoEn" IS NULL;

-- ── 159 · Fondo ficticio: importes en NULL, montoInicial intacto ───────────
UPDATE "Turno" SET
  cierre                   = now(),
  "cerradoPorId"           = :ejecutor,
  "anuladoEn"              = now(),
  "anuladoPorId"           = :ejecutor,
  "motivoAnulacion"        = 'Apertura de prueba con fondo ficticio de $230.000',
  "montoEsperadoEfectivo"  = NULL,
  "montoRealEfectivo"      = NULL,
  "diferenciaEfectivo"     = NULL,
  "efectivoRetiradoCierre" = NULL,
  "fondoDejadoCierre"      = NULL,
  observaciones            = 'Turno anulado administrativamente: apertura de prueba con fondo ficticio de $230.000. El dinero nunca existió físicamente.'
WHERE id = 159 AND cierre IS NULL AND "anuladoEn" IS NULL;

-- ── 148 · Prueba del servicio: la venta 1293 NO se toca acá ────────────────
UPDATE "Turno" SET
  cierre                   = now(),
  "cerradoPorId"           = :ejecutor,
  "anuladoEn"              = now(),
  "anuladoPorId"           = :ejecutor,
  "motivoAnulacion"        = 'Prueba del servicio Carga de colectivo por $5.000',
  "montoEsperadoEfectivo"  = NULL,
  "montoRealEfectivo"      = NULL,
  "diferenciaEfectivo"     = NULL,
  "efectivoRetiradoCierre" = NULL,
  "fondoDejadoCierre"      = NULL,
  observaciones            = 'Turno anulado administrativamente: prueba del servicio Carga de colectivo por $5.000. No fue una operación comercial real.'
WHERE id = 148 AND cierre IS NULL AND "anuladoEn" IS NULL;

-- ── GUARDA 5 · Exactamente 5 filas anuladas, ni una más ────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM "Turno" WHERE "anuladoEn" IS NOT NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'ABORTA: quedaron % turnos anulados, se esperaban 5', n; END IF;

  SELECT count(*) INTO n FROM "Turno"
   WHERE id IN (147,148,153,159,174) AND cierre IS NOT NULL AND "anuladoEn" IS NOT NULL;
  IF n <> 5 THEN RAISE EXCEPTION 'ABORTA: solo % de los 5 quedaron cerrados y anulados', n; END IF;

  -- El 159 conserva su evidencia y no fabricó ningún faltante.
  SELECT count(*) INTO n FROM "Turno"
   WHERE id = 159 AND "montoInicial" = 230000.00 AND "diferenciaEfectivo" IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTA: el turno 159 no quedó como se esperaba'; END IF;

  -- Nadie más se vio afectado.
  SELECT count(*) INTO n FROM "ArqueoCaja" WHERE "turnoId" IN (147,148,153,159,174);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: se creó algún arqueo'; END IF;
  SELECT count(*) INTO n FROM "CajaMovimiento" WHERE "turnoId" IN (147,148,153,159,174);
  IF n <> 0 THEN RAISE EXCEPTION 'ABORTA: se creó algún movimiento de caja'; END IF;
  SELECT count(*) INTO n FROM "Venta" WHERE id = 1293;
  IF n <> 1 THEN RAISE EXCEPTION 'ABORTA: la venta 1293 desapareció'; END IF;
END $$;

-- ── GUARDA 6 · Como máximo un turno operativo abierto por local ────────────
DO $$
DECLARE m int;
BEGIN
  SELECT coalesce(max(c),0) INTO m FROM (
    SELECT count(*) AS c FROM "Turno"
     WHERE cierre IS NULL AND "anuladoEn" IS NULL GROUP BY "localId") q;
  IF m > 1 THEN RAISE EXCEPTION 'ABORTA: algún local quedó con % turnos abiertos', m; END IF;
END $$;

COMMIT;

-- ── Verificación posterior (solo lectura) ──────────────────────────────────
\echo === LOS CINCO TURNOS ===
SELECT id, "localId", cierre IS NOT NULL AS cerrado, "anuladoEn" IS NOT NULL AS anulado,
       "montoInicial", "montoEsperadoEfectivo", "montoRealEfectivo", "diferenciaEfectivo",
       "fondoDejadoCierre", "motivoAnulacion"
  FROM "Turno" WHERE id IN (147,148,153,159,174) ORDER BY id;

\echo === TURNOS OPERATIVOS ABIERTOS POR LOCAL ===
SELECT t."localId", l.nombre, count(*) AS abiertos
  FROM "Turno" t JOIN "Local" l ON l.id = t."localId"
 WHERE t.cierre IS NULL AND t."anuladoEn" IS NULL
 GROUP BY t."localId", l.nombre ORDER BY t."localId";

\echo === NADA MAS CAMBIO ===
SELECT (SELECT count(*) FROM "Turno")           AS turnos,
       (SELECT count(*) FROM "Venta")           AS ventas,
       (SELECT count(*) FROM "ArqueoCaja")      AS arqueos,
       (SELECT count(*) FROM "CajaMovimiento")  AS movimientos;
