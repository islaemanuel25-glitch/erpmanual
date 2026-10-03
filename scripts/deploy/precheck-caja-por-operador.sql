-- PRECHECK ANTES DE MIGRAR `20261002120000_caja_por_operador`. SOLO LECTURA.
--
-- La migración reemplaza el índice "una caja operativa por CUENTA y local" por
-- "una por OPERADOR y local" (más la de cuenta para los turnos sin operador). Si
-- hoy hay un operador con dos cajas operativas en el mismo local —el índice
-- viejo lo permitía con dos cuentas distintas—, la migración ABORTA con su
-- propia guardia y no toca nada. Pero abortada queda como migración FALLIDA, y
-- /deploy no tiene autorizado `migrate resolve` para ésta: el despliegue se
-- frenaría a mitad de camino.
--
-- Este chequeo hace la misma pregunta que la guardia ANTES de iniciar nada, para
-- que el conflicto se resuelva con la aplicación —cerrando la caja que sobra— y
-- no con la base. No elige, no cierra y no escribe.
--
-- Sale con error —y entonces NO se inicia ninguna migración— si:
--   · hay una migración fallida sin resolver;
--   · hay un operador con más de una caja operativa en el mismo local;
--   · hay una cuenta con más de una caja operativa SIN operador en el mismo
--     local (el índice viejo ya lo impedía; se pregunta igual);
--   · hay una transacción abierta hace más de 2 s en esta base, u otra sesión
--     tiene sobre `Turno` un candado que no sea de lectura. La migración toma
--     `Turno` en ACCESS EXCLUSIVE con un tope de 3 s: con eso a la vista
--     fallaría por el tope, y una migración fallida frena el despliegue. Es el
--     mismo criterio que `precheck-libro-stock.sql`. NO reemplaza al tope: entre
--     este chequeo y la migración pueden pasar segundos.
--
-- ADVIERTE, sin frenar —la migración es válida igual—: las cajas operativas SIN
-- operador en un local que EXIGE operador. Después del cambio, un turno sin
-- operador es la caja de la cuenta, y un cajero que entra con su PIN ya no la
-- alcanza: no puede vender, mover, arquear ni cerrarla. Solo Admin o el Dueño
-- del local pueden administrarla (cerrarla, arquearla). Conviene cerrarlas antes
-- de desplegar, o avisarle al Dueño. Informa también el total de cajas
-- operativas, con y sin operador.
--
-- Lo que imprime son ids de turno, de local y de cuenta u operador: ningún
-- importe, ningún nombre, ninguna credencial.
--
-- Transacción READ ONLY terminada en ROLLBACK. Se corre con el mismo comando
-- que `precheck-libro-stock.sql`, cambiando el archivo; está escrito en
-- docs/deploy/MIGRACIONES-SIN-APLICAR.md.

\set ON_ERROR_STOP 1

BEGIN TRANSACTION READ ONLY;

DO $precheck$
DECLARE
  v_fallas          text[] := '{}';
  v_pendientes      text[];
  v_por_operador    text[];
  v_por_cuenta      text[];
  v_con_operador    bigint;
  v_sin_operador    bigint;
  v_largas          text[];
  v_candados        text[];
  v_inalcanzables   text[];
BEGIN
  SELECT coalesce(array_agg(migration_name), '{}') INTO v_pendientes
  FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  IF cardinality(v_pendientes) = 0 THEN
    RAISE NOTICE '✓ ninguna migración fallida sin resolver';
  ELSE
    RAISE NOTICE '✗ migraciones fallidas sin resolver: %', v_pendientes;
    v_fallas := array_append(v_fallas, 'migracion-fallida-sin-resolver');
  END IF;

  -- La MISMA condición que la guardia y que los índices nuevos: sin cerrar y sin
  -- el corte de cierre tomado.
  SELECT coalesce(array_agg(format('local %s, operador %s: turnos %s', "localId", "operadorId", ids)
                            ORDER BY "localId", "operadorId"), '{}')
    INTO v_por_operador
  FROM (
    SELECT "localId", "operadorId", string_agg(id::text, ', ' ORDER BY id) AS ids
      FROM "Turno"
     WHERE "cierre" IS NULL AND "cierreEnPreparacionEn" IS NULL AND "operadorId" IS NOT NULL
     GROUP BY "localId", "operadorId"
    HAVING count(*) > 1
  ) g;
  IF cardinality(v_por_operador) = 0 THEN
    RAISE NOTICE '✓ ningún operador tiene más de una caja operativa en el mismo local';
  ELSE
    RAISE NOTICE '✗ operadores con más de una caja operativa: %', v_por_operador;
    RAISE NOTICE '  cerrar desde la aplicación las que sobran (decide una persona) y volver a correr este chequeo';
    v_fallas := array_append(v_fallas, 'operador-con-dos-cajas');
  END IF;

  SELECT coalesce(array_agg(format('local %s, cuenta %s: turnos %s', "localId", "vendedorId", ids)
                            ORDER BY "localId", "vendedorId"), '{}')
    INTO v_por_cuenta
  FROM (
    SELECT "localId", "vendedorId", string_agg(id::text, ', ' ORDER BY id) AS ids
      FROM "Turno"
     WHERE "cierre" IS NULL AND "cierreEnPreparacionEn" IS NULL AND "operadorId" IS NULL
     GROUP BY "localId", "vendedorId"
    HAVING count(*) > 1
  ) g;
  IF cardinality(v_por_cuenta) = 0 THEN
    RAISE NOTICE '✓ ninguna cuenta tiene más de una caja operativa sin operador en el mismo local';
  ELSE
    RAISE NOTICE '✗ cuentas con más de una caja operativa sin operador: %', v_por_cuenta;
    v_fallas := array_append(v_fallas, 'cuenta-con-dos-cajas');
  END IF;

  -- Lo que haría fallar el tope de 3 s de la migración. Mismo criterio que
  -- precheck-libro-stock.sql.
  SELECT coalesce(array_agg(format('pid %s, %s s, %s', pid,
           round(extract(epoch FROM now() - xact_start)), state)), '{}')
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

  -- La migración toma `Turno` en ACCESS EXCLUSIVE, que choca con TODO. Las
  -- lecturas sueltas (AccessShare) duran milisegundos y no se cuentan; lo que se
  -- cuenta es lo que sostiene una transacción: escrituras y FOR UPDATE.
  SELECT coalesce(array_agg(format('pid %s: %s (%s)', l.pid, l.mode,
           CASE WHEN l.granted THEN 'tomado' ELSE 'esperando' END)), '{}')
    INTO v_candados
  FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
  WHERE l.database = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND c.relname = 'Turno'
    AND l.pid <> pg_backend_pid()
    AND l.mode <> 'AccessShareLock';
  IF cardinality(v_candados) = 0 THEN
    RAISE NOTICE '✓ nadie tiene tomado un candado de escritura sobre Turno';
  ELSE
    RAISE NOTICE '✗ candados sobre Turno: %', v_candados;
    v_fallas := array_append(v_fallas, 'candado-sobre-turno');
  END IF;

  -- ADVERTENCIA, NO FALLA. Una caja operativa sin operador en un local que
  -- exige operador (`exigirOperador` null o true: null es el valor histórico y
  -- vale true, ver operarioObligatorio en lib/config/acceso.js). Después del
  -- cambio es la caja de la cuenta: un cajero con PIN ya no la alcanza.
  SELECT coalesce(array_agg(format('local %s, cuenta %s: turno %s', t."localId", t."vendedorId", t.id)
                            ORDER BY t."localId", t.id), '{}')
    INTO v_inalcanzables
  FROM "Turno" t
  LEFT JOIN "ConfiguracionLocal" cl ON cl."localId" = t."localId"
  WHERE t."cierre" IS NULL AND t."cierreEnPreparacionEn" IS NULL AND t."operadorId" IS NULL
    AND cl."exigirOperador" IS DISTINCT FROM false;
  IF cardinality(v_inalcanzables) = 0 THEN
    RAISE NOTICE '✓ ninguna caja abierta sin operador en un local que exige operador';
  ELSE
    RAISE NOTICE '⚠ REVISAR ANTES DE DESPLEGAR — cajas abiertas SIN operador en locales que EXIGEN operador: %', v_inalcanzables;
    RAISE NOTICE '  después del cambio, solo Admin o el Dueño del local podrán administrarlas (vender no podrá nadie con PIN). Cerrarlas antes, o avisar al Dueño. No frena la migración.';
  END IF;

  SELECT count(*) FILTER (WHERE "operadorId" IS NOT NULL), count(*) FILTER (WHERE "operadorId" IS NULL)
    INTO v_con_operador, v_sin_operador
  FROM "Turno" WHERE "cierre" IS NULL AND "cierreEnPreparacionEn" IS NULL;
  RAISE NOTICE '· cajas operativas ahora: % con operador, % sin operador', v_con_operador, v_sin_operador;

  IF cardinality(v_fallas) = 0 THEN
    RAISE NOTICE 'PRECHECK: VERDE — se puede iniciar la migración';
  ELSE
    RAISE EXCEPTION 'PRECHECK: ROJO — NO iniciar migraciones: %', array_to_string(v_fallas, ', ');
  END IF;
END
$precheck$;

ROLLBACK;
