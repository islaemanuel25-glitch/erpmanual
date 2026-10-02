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
--     local (el índice viejo ya lo impedía; se pregunta igual).
-- Informa, sin frenar: cuántas cajas operativas hay, con y sin operador.
--
-- Lo que imprime son ids de turno, de local y de operador: ningún importe,
-- ningún nombre, ninguna credencial.
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
