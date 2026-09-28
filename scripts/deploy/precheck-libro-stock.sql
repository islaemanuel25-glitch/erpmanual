-- PRECHECK ANTES DE MIGRAR `20260927120000_libro_stock`. SOLO LECTURA.
--
-- Reduce la probabilidad de que la activación se choque con su tope de 3 s. NO
-- reemplaza la recuperación: entre este chequeo y el LOCK TABLE pueden pasar
-- segundos, y en esos segundos puede entrar una transacción larga.
--
-- Sale con error —y entonces NO se inicia ninguna migración— si:
--   · hay una migración fallida sin resolver (el deploy se frenaría igual, P3009);
--   · hay una transacción abierta hace más de 2 s en esta base;
--   · otra sesión tiene tomado un candado que choca con SHARE ROW EXCLUSIVE sobre
--     StockLocal, ProductoBase o Local.
-- Informa, sin frenar: cuántas filas tiene StockLocal (la duración esperada de
-- la activación depende de eso) y la salud básica de PostgreSQL.
--
-- Transacción READ ONLY terminada en ROLLBACK. El comando exacto está en
-- lib/deploy/recuperacionLibroStock.mjs (COMANDO_PRECHECK).

\set ON_ERROR_STOP 1

BEGIN TRANSACTION READ ONLY;

DO $precheck$
DECLARE
  v_fallas      text[] := '{}';
  v_pendientes  text[];
  v_largas      text[];
  v_candados    text[];
  v_filas       bigint;
  v_arranque    timestamptz;
  v_conexiones  int;
BEGIN
  SELECT coalesce(array_agg(migration_name), '{}') INTO v_pendientes
  FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  IF cardinality(v_pendientes) = 0 THEN
    RAISE NOTICE '✓ ninguna migración fallida sin resolver';
  ELSE
    RAISE NOTICE '✗ migraciones fallidas sin resolver: %', v_pendientes;
    v_fallas := array_append(v_fallas, 'migracion-fallida-sin-resolver');
  END IF;

  SELECT coalesce(array_agg(format('pid %s, %s s, %s: %s', pid,
           round(extract(epoch FROM now() - xact_start)), state,
           left(regexp_replace(query, '\s+', ' ', 'g'), 80))), '{}')
    INTO v_largas
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
    AND xact_start IS NOT NULL AND now() - xact_start > interval '2 seconds';
  IF cardinality(v_largas) = 0 THEN
    RAISE NOTICE '✓ ninguna transacción abierta hace más de 2 s';
  ELSE
    RAISE NOTICE '✗ transacciones abiertas hace más de 2 s: %', v_largas;
    v_fallas := array_append(v_fallas, 'transaccion-larga');
  END IF;

  -- Los modos que chocan con SHARE ROW EXCLUSIVE: todos menos AccessShare y
  -- RowShare (las lecturas y los SELECT ... FOR UPDATE esperando no lo frenan).
  SELECT coalesce(array_agg(format('pid %s: %s sobre %s (%s)', l.pid, l.mode, c.relname,
           CASE WHEN l.granted THEN 'tomado' ELSE 'esperando' END)), '{}')
    INTO v_candados
  -- pg_locks es de TODO el servidor: sin filtrar por base, un OID de otra base
  -- podría coincidir con una de estas tablas.
  FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
  WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND c.relname IN ('StockLocal', 'ProductoBase', 'Local')
    AND l.pid <> pg_backend_pid()
    AND l.mode NOT IN ('AccessShareLock', 'RowShareLock');
  IF cardinality(v_candados) = 0 THEN
    RAISE NOTICE '✓ nadie tiene tomado un candado que choque sobre StockLocal, ProductoBase o Local';
  ELSE
    RAISE NOTICE '✗ candados que chocan: %', v_candados;
    v_fallas := array_append(v_fallas, 'candado-sobre-tablas-del-libro');
  END IF;

  SELECT count(*) INTO v_filas FROM "StockLocal";
  RAISE NOTICE '· StockLocal: % filas (medido en desarrollo: 4k 28 ms, 10k 64 ms, 50k 283 ms, 100k 764 ms)', v_filas;

  SELECT pg_postmaster_start_time() INTO v_arranque;
  SELECT count(*) INTO v_conexiones FROM pg_stat_activity WHERE datname = current_database();
  RAISE NOTICE '· PostgreSQL %, arriba desde %, % conexiones a esta base, en recuperación: %',
    current_setting('server_version'), v_arranque, v_conexiones, pg_is_in_recovery();
  IF pg_is_in_recovery() THEN
    v_fallas := array_append(v_fallas, 'base-en-recuperacion');
  END IF;

  IF cardinality(v_fallas) = 0 THEN
    RAISE NOTICE 'PRECHECK: VERDE — se puede iniciar la migración';
  ELSE
    RAISE EXCEPTION 'PRECHECK: ROJO — NO iniciar migraciones: %', array_to_string(v_fallas, ', ');
  END IF;
END
$precheck$;

ROLLBACK;
