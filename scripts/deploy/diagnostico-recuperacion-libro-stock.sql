-- DIAGNÓSTICO DE RECUPERACIÓN DE `20260927120000_libro_stock`. SOLO LECTURA.
--
-- Contesta UNA pregunta: ¿la activación del libro falló de la única forma que
-- sabemos recuperar?
--
--   modo=recuperar (el default) → imprime RESULTADO: CASO_1_RECUPERABLE y sale con
--     0 solo si se cumplen TODAS las condiciones de abajo. Cualquier otra cosa
--     → RESULTADO: FRENAR y sale con error, así que el `&&` del comando de
--     recuperación no deja correr el resolve.
--   modo=revertida → para DESPUÉS del resolve: confirma que el registro quedó
--     revertido, que no queda nada sin resolver y que no existe ningún objeto del
--     libro. Imprime RESULTADO: REVERTIDA_LIMPIA o FRENAR.
--
-- Corre dentro de una transacción READ ONLY que termina en ROLLBACK: PostgreSQL
-- mismo rechazaría cualquier escritura. No toca `_prisma_migrations`, no resuelve
-- nada y no aplica nada. Lo lee.
--
-- Uso —el comando exacto está en lib/deploy/recuperacionLibroStock.mjs—:
--   psql -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < este-archivo
--
-- NO se apoya en `prisma migrate status`: medido, después de un
-- `resolve --rolled-back` dice "Database schema is up to date!" con el libro
-- todavía sin aplicar.

\set ON_ERROR_STOP 1
\if :{?modo}
\else
  \set modo recuperar
\endif

BEGIN TRANSACTION READ ONLY;

SELECT set_config('erpazul.diagnostico_modo', :'modo', true) AS modo \gset diag_

DO $diagnostico$
DECLARE
  c_libro CONSTANT text := '20260927120000_libro_stock';
  c_anterior CONSTANT text := '20260926195732_correccion_caja';
  -- Las migraciones que el árbol tiene ANTES del libro. Un candado exige que sea
  -- exactamente la lista de prisma/migrations con nombre menor: si se agrega una
  -- anterior al libro o se renombra una, se pone rojo.
  c_anteriores CONSTANT text[] := ARRAY[
    '000000000000_squashed_migrations',
    '20260904120000_ofertas_y_recargos_pago',
    '20260905010000_medios_cobro_configurables',
    '20260905150000_permiso_medios_cobro_dueno_local',
    '20260906190000_comision_sin_configurar',
    '20260907230000_modalidades_por_medio',
    '20260908130000_recepcion_diferencias_positivas',
    '20260908213000_recepcion_control_fisico',
    '20260909170000_presentacion_envio_snapshot',
    '20260910120000_presentacion_adoptada_en_recepcion',
    '20260913120000_acuerdo_deposito_local',
    '20260915120000_borrar_oferta_con_escala_vieja',
    '20260915180000_oferta_redondeo_y_precio_exacto',
    '20260915200000_codigo_barra_unico_por_ubicacion',
    '20260916120000_configuracion_lista_por_proveedor',
    '20260916140000_receta_de_lectura_de_listas',
    '20260917120000_lectura_por_producto_y_fuera_de_rango',
    '20260917130000_modo_de_lista_y_no_lo_cambio',
    '20260917150000_precios_por_columna',
    '20260920120000_recepcion_motivo_y_sueltas',
    '20260920190000_decision_de_precio_por_proveedor',
    '20260920223000_linea_de_factura_revisada',
    '20260921020000_pedido_nacido_de_factura',
    '20260921160000_llamada_lector_detalle',
    '20260921180000_receta_explicada_y_kilos',
    '20260922010000_giro_de_la_foto',
    '20260922040000_recepcion_sobrevive_al_refresco',
    '20260922110000_subtotal_corregido',
    '20260922143000_restaurar_costo_hamburguesa',
    '20260922150000_variacion_normal_de_precios',
    '20260922170000_conceptos_del_pie',
    '20260923120000_costo_con_el_pie_del_245',
    '20260923205422_pagos_a_proveedores',
    '20260924230000_semana_operativa_ubicacion',
    '20260925195156_stock_ingresado_congelado',
    '20260926020000_decision_precio_costo_observado',
    '20260926122404_cierre_sin_conteo',
    '20260926195732_correccion_caja'
  ];
  v_modo       text := current_setting('erpazul.diagnostico_modo');
  v_fallas     text[] := '{}';
  v_pendientes text[];
  v_faltan     text[];
  v_restos     text[];
  v_ultima     record;
  v_aplicadas  int;
  v_revertidas int;
  v_otras_mal  int;
  v_logs       text;
BEGIN
  IF v_modo NOT IN ('recuperar', 'revertida') THEN
    RAISE EXCEPTION 'RESULTADO: FRENAR — modo desconocido "%" (recuperar | revertida)', v_modo;
  END IF;
  RAISE NOTICE 'Diagnóstico de % — modo %', c_libro, v_modo;

  -- ── El registro de Prisma ────────────────────────────────────────────────
  SELECT coalesce(array_agg(migration_name ORDER BY started_at), '{}') INTO v_pendientes
  FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;

  SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
         count(*) FILTER (WHERE rolled_back_at IS NOT NULL),
         count(*) FILTER (WHERE (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)
                             OR (rolled_back_at IS NOT NULL AND applied_steps_count <> 0))
    INTO v_aplicadas, v_revertidas, v_otras_mal
  FROM "_prisma_migrations" WHERE migration_name = c_libro;

  SELECT * INTO v_ultima FROM "_prisma_migrations"
  WHERE migration_name = c_libro ORDER BY started_at DESC LIMIT 1;
  v_logs := coalesce(v_ultima.logs, '');

  SELECT coalesce(array_agg(a ORDER BY a), '{}') INTO v_faltan
  FROM unnest(c_anteriores) a
  WHERE NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations" m
    WHERE m.migration_name = a AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
  );

  -- ── El inventario del libro ──────────────────────────────────────────────
  -- Todo lo que crea la migración, por nombre y por patrón: tablas, sus
  -- secuencias, índices y tipos compuestos (pg_class), el enum, las funciones
  -- libro_stock_*, los triggers y las restricciones. Un candado exige que cada
  -- objeto que la migración crea caiga en alguno de estos patrones.
  SELECT coalesce(array_agg(o ORDER BY o), '{}') INTO v_restos FROM (
    SELECT 'relación ' || c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND (c.relname LIKE 'MovimientoStock%' OR c.relname LIKE 'ReinterpretacionDeStock%')
    UNION ALL
    -- El enum y su arreglo, y el tipo de fila y el tipo arreglo que PostgreSQL
    -- crea solo con cada tabla (`_MovimientoStock`): la prueba de base comparó el
    -- catálogo antes y después, y estos eran los que faltaban.
    SELECT 'tipo ' || t.typname
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND (t.typname IN ('TipoMovimientoStock', '_TipoMovimientoStock')
           OR t.typname LIKE 'MovimientoStock%' OR t.typname LIKE '\_MovimientoStock%'
           OR t.typname LIKE 'ReinterpretacionDeStock%' OR t.typname LIKE '\_ReinterpretacionDeStock%')
    UNION ALL
    SELECT 'función ' || p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'libro\_stock%'
    UNION ALL
    SELECT 'trigger ' || t.tgname
    FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND (t.tgname LIKE '%libro%' OR t.tgname IN ('MovimientoStock_inmutable', 'ReinterpretacionDeStock_inmutable'))
    UNION ALL
    SELECT 'restricción ' || k.conname
    FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
    WHERE n.nspname = 'public' AND (k.conname LIKE 'MovimientoStock%' OR k.conname LIKE 'ReinterpretacionDeStock%')
  ) s(o);

  -- ── Las condiciones ──────────────────────────────────────────────────────
  IF v_modo = 'recuperar' THEN
    IF v_pendientes = ARRAY[c_libro] THEN
      RAISE NOTICE '✓ 1. la única migración fallida sin resolver es %', c_libro;
    ELSE
      RAISE NOTICE '✗ 1. migraciones fallidas sin resolver: %', v_pendientes;
      v_fallas := array_append(v_fallas, 'no-es-la-unica-fallida');
    END IF;

    IF v_ultima.migration_name IS NOT NULL AND v_ultima.finished_at IS NULL
       AND v_ultima.rolled_back_at IS NULL AND v_ultima.applied_steps_count = 0 THEN
      RAISE NOTICE '✓ 2. su último intento no aplicó ningún paso (applied_steps_count = 0)';
    ELSE
      RAISE NOTICE '✗ 2. último intento: terminado %, revertido %, pasos %',
        v_ultima.finished_at, v_ultima.rolled_back_at, v_ultima.applied_steps_count;
      v_fallas := array_append(v_fallas, 'ultimo-intento-no-es-un-fallo-sin-pasos');
    END IF;

    IF v_logs LIKE '%55P03%' THEN
      RAISE NOTICE '✓ 3. SQLSTATE 55P03 en los logs';
    ELSE
      RAISE NOTICE '✗ 3. los logs no traen SQLSTATE 55P03';
      v_fallas := array_append(v_fallas, 'sin-55P03');
    END IF;

    IF v_logs ILIKE '%lock timeout%' AND v_logs LIKE '%LOCK TABLE%StockLocal%' THEN
      RAISE NOTICE '✓ 4. "lock timeout" en el LOCK TABLE de la activación';
    ELSE
      RAISE NOTICE '✗ 4. los logs no muestran el lock timeout del LOCK TABLE de la activación';
      v_fallas := array_append(v_fallas, 'sin-lock-timeout-de-la-activacion');
    END IF;
  ELSE
    IF cardinality(v_pendientes) = 0 THEN
      RAISE NOTICE '✓ 1. no queda ninguna migración fallida sin resolver';
    ELSE
      RAISE NOTICE '✗ 1. migraciones fallidas sin resolver: %', v_pendientes;
      v_fallas := array_append(v_fallas, 'quedan-fallidas-sin-resolver');
    END IF;

    IF v_ultima.migration_name IS NOT NULL AND v_ultima.finished_at IS NULL
       AND v_ultima.rolled_back_at IS NOT NULL AND v_ultima.applied_steps_count = 0 THEN
      RAISE NOTICE '✓ 2. el último intento de % quedó revertido y sin pasos', c_libro;
    ELSE
      RAISE NOTICE '✗ 2. último intento: terminado %, revertido %, pasos %',
        v_ultima.finished_at, v_ultima.rolled_back_at, v_ultima.applied_steps_count;
      v_fallas := array_append(v_fallas, 'ultimo-intento-no-quedo-revertido');
    END IF;
  END IF;

  IF v_aplicadas = 0 AND v_otras_mal = 0 THEN
    RAISE NOTICE '✓ ninguna fila de % dice que se aplicó', c_libro;
  ELSE
    RAISE NOTICE '✗ % fila(s) de % dicen aplicada y % fila(s) incoherentes', v_aplicadas, c_libro, v_otras_mal;
    v_fallas := array_append(v_fallas, 'registro-del-libro-incoherente');
  END IF;

  IF cardinality(v_faltan) = 0 THEN
    RAISE NOTICE '✓ 5. las % migraciones anteriores están aplicadas, incluida %', cardinality(c_anteriores), c_anterior;
  ELSE
    RAISE NOTICE '✗ 5. sin aplicar: %', v_faltan;
    v_fallas := array_append(v_fallas, 'anteriores-sin-aplicar');
  END IF;

  IF cardinality(v_restos) = 0 THEN
    RAISE NOTICE '✓ 6. no existe ningún objeto del libro';
  ELSE
    RAISE NOTICE '✗ 6. objetos del libro presentes: %', v_restos;
    v_fallas := array_append(v_fallas, 'objetos-del-libro-presentes');
  END IF;

  RAISE NOTICE 'Intentos de % ya revertidos antes: %', c_libro, v_revertidas;
  IF v_modo = 'recuperar' AND v_revertidas >= 1 THEN
    RAISE NOTICE 'ESTE ES UN SEGUNDO FALLO: después del resolve, FRENAR LA VENTANA. No hay tercer intento.';
  END IF;

  IF cardinality(v_fallas) = 0 THEN
    IF v_modo = 'recuperar' THEN
      RAISE NOTICE 'RESULTADO: CASO_1_RECUPERABLE';
    ELSE
      RAISE NOTICE 'RESULTADO: REVERTIDA_LIMPIA';
    END IF;
  ELSE
    RAISE EXCEPTION 'RESULTADO: FRENAR — %', array_to_string(v_fallas, ', ');
  END IF;
END
$diagnostico$;

ROLLBACK;
