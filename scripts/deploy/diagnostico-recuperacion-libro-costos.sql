-- DIAGNÓSTICO DE RECUPERACIÓN DE `20260929200000_libro_costo_activacion`. SOLO LECTURA.
--
-- Contesta UNA pregunta: ¿la activación del Libro de Costos falló de la única
-- forma que sabemos recuperar —no consiguió su candado en 3 s— y no dejó nada?
--
--   modo=recuperar (el default) → imprime RESULTADO: CASO_1_RECUPERABLE y sale con
--     0 solo si se cumplen TODAS las condiciones de abajo. Cualquier otra cosa
--     → RESULTADO: FRENAR y sale con error, así que el `&&` del comando de
--     recuperación no deja correr el resolve.
--   modo=revertida → para DESPUÉS del resolve: confirma que el registro quedó
--     revertido, que no queda nada sin resolver, que el libro sigue vacío y que
--     `libro_costo_estado()` volvió a NO_ACTIVADO. Imprime RESULTADO:
--     REVERTIDA_LIMPIA o FRENAR.
--
-- Corre dentro de una transacción READ ONLY que termina en ROLLBACK: PostgreSQL
-- mismo rechazaría cualquier escritura. No toca `_prisma_migrations`, no resuelve
-- nada, no activa nada. Lo lee.
--
-- Uso —el comando exacto está en lib/deploy/recuperacionLibroCostos.mjs—:
--   psql -X -q -v ON_ERROR_STOP=1 -v modo=recuperar -f - < este-archivo
--
-- De dónde sale cada condición, medido y no supuesto (2026-09-29, con
-- `scripts/pruebas-db/recuperacionLibroCostos.mjs`): ante el lock timeout,
-- Prisma deja en `logs` el SQLSTATE 55P03, "lock timeout", el `LOCK TABLE` y
-- la línea "PL/pgSQL function libro_costo_activar()"; y en `checksum` el sha256
-- del migration.sql. `migrate status` NO sirve de prueba: después del
-- `--rolled-back` dice "up to date" con el libro sin activar.

\set ON_ERROR_STOP 1
\if :{?modo}
\else
  \set modo recuperar
\endif

BEGIN TRANSACTION READ ONLY;

SELECT set_config('erpazul.diagnostico_modo', :'modo', true) AS modo \gset diag_

DO $diagnostico$
DECLARE
  c_activacion CONSTANT text := '20260929200000_libro_costo_activacion';
  c_instalacion CONSTANT text := '20260929120000_libro_costos';
  -- El sha256 de cada migration.sql, que es lo que Prisma guarda en `checksum`.
  -- Un candado exige que coincidan con los archivos del árbol: la fila fallida
  -- tiene que ser de ESTE archivo, y la función que falló, de ESTA instalación.
  c_checksum_activacion CONSTANT text := '6c8ff5e8bc51515c256a04edf5baf281c8a9eb3e43cad39333176b7c8a443a4c';
  c_checksum_instalacion CONSTANT text := '99efddd30ed1b927354ca37cdbc167b390ec97432385f5a6fa42142f1843c461';
  -- Los seis triggers que crea la activación: los mismos que mira
  -- `libro_costo_estado()`. Un candado exige que sean los de libroCostos.js.
  c_triggers CONSTANT text[] := ARRAY[
    'ProductoBase_costo_version',
    'ProductoLocal_costo_version',
    'Local_costo_version',
    'CostoBaseVersion_sin_truncate',
    'CostoUbicacionVersion_sin_truncate',
    'LibroCostoActivacion_sin_truncate'
  ];
  -- Las migraciones que el árbol tiene ANTES de la activación. Un candado exige
  -- que sea exactamente la lista de prisma/migrations con nombre menor.
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
    '20260926195732_correccion_caja',
    '20260927120000_libro_stock',
    '20260928150000_stock_diario_indice',
    '20260928180000_libro_stock_baja_atomica',
    '20260929120000_libro_costos'
  ];
  v_modo        text := current_setting('erpazul.diagnostico_modo');
  v_fallas      text[] := '{}';
  v_pendientes  text[];
  v_faltan      text[];
  v_ultima      record;
  v_aplicadas   int;
  v_revertidas  int;
  v_otras_mal   int;
  v_logs        text;
  v_instalada   boolean;
  v_restos      text[] := '{}';
  v_estado      record;
  v_n           bigint;
BEGIN
  IF v_modo NOT IN ('recuperar', 'revertida') THEN
    RAISE EXCEPTION 'RESULTADO: FRENAR — modo desconocido "%" (recuperar | revertida)', v_modo;
  END IF;
  RAISE NOTICE 'Diagnóstico de % — modo %', c_activacion, v_modo;

  -- ── El registro de Prisma ────────────────────────────────────────────────
  SELECT coalesce(array_agg(migration_name ORDER BY started_at), '{}') INTO v_pendientes
  FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL;

  SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL),
         count(*) FILTER (WHERE rolled_back_at IS NOT NULL),
         count(*) FILTER (WHERE (finished_at IS NOT NULL AND rolled_back_at IS NOT NULL)
                             OR (rolled_back_at IS NOT NULL AND applied_steps_count <> 0))
    INTO v_aplicadas, v_revertidas, v_otras_mal
  FROM "_prisma_migrations" WHERE migration_name = c_activacion;

  SELECT * INTO v_ultima FROM "_prisma_migrations"
  WHERE migration_name = c_activacion ORDER BY started_at DESC LIMIT 1;
  v_logs := coalesce(v_ultima.logs, '');

  SELECT coalesce(array_agg(a ORDER BY a), '{}') INTO v_faltan
  FROM unnest(c_anteriores) a
  WHERE NOT EXISTS (
    SELECT 1 FROM "_prisma_migrations" m
    WHERE m.migration_name = a AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL
  );

  -- ── Las condiciones del intento ──────────────────────────────────────────
  IF v_modo = 'recuperar' THEN
    IF v_pendientes = ARRAY[c_activacion] THEN
      RAISE NOTICE '✓ 1. la única migración fallida sin resolver es %', c_activacion;
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

    IF v_logs ILIKE '%lock timeout%' AND v_logs LIKE '%LOCK TABLE%'
       AND v_logs LIKE '%function libro_costo_activar()%' THEN
      RAISE NOTICE '✓ 4. "lock timeout" en un LOCK TABLE de libro_costo_activar(), antes de su primera escritura';
    ELSE
      RAISE NOTICE '✗ 4. los logs no muestran el lock timeout de un LOCK TABLE de libro_costo_activar()';
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
      RAISE NOTICE '✓ 2. el último intento de % quedó revertido y sin pasos', c_activacion;
    ELSE
      RAISE NOTICE '✗ 2. último intento: terminado %, revertido %, pasos %',
        v_ultima.finished_at, v_ultima.rolled_back_at, v_ultima.applied_steps_count;
      v_fallas := array_append(v_fallas, 'ultimo-intento-no-quedo-revertido');
    END IF;
  END IF;

  IF v_ultima.checksum = c_checksum_activacion THEN
    RAISE NOTICE '✓ 5. el intento es del archivo exacto de la activación (checksum)';
  ELSE
    RAISE NOTICE '✗ 5. el checksum del intento (%) no es el del archivo de la activación', v_ultima.checksum;
    v_fallas := array_append(v_fallas, 'checksum-distinto');
  END IF;

  IF v_aplicadas = 0 AND v_otras_mal = 0 THEN
    RAISE NOTICE '✓ ninguna fila de % dice que se aplicó', c_activacion;
  ELSE
    RAISE NOTICE '✗ % fila(s) de % dicen aplicada y % fila(s) incoherentes', v_aplicadas, c_activacion, v_otras_mal;
    v_fallas := array_append(v_fallas, 'registro-de-la-activacion-incoherente');
  END IF;

  IF cardinality(v_faltan) = 0 AND EXISTS (
    SELECT 1 FROM "_prisma_migrations" WHERE migration_name = c_instalacion
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL AND checksum = c_checksum_instalacion
  ) THEN
    RAISE NOTICE '✓ 6. las % migraciones anteriores están aplicadas, y la instalación con su checksum', cardinality(c_anteriores);
  ELSE
    RAISE NOTICE '✗ 6. sin aplicar: %, o la instalación no es la del árbol', v_faltan;
    v_fallas := array_append(v_fallas, 'anteriores-sin-aplicar');
  END IF;

  -- ── El libro: lo que la activación escribe no tiene que existir ──────────
  v_instalada := to_regclass('"CostoBaseVersion"') IS NOT NULL AND to_regclass('"CostoUbicacionVersion"') IS NOT NULL
    AND to_regclass('"LibroCostoActivacion"') IS NOT NULL AND to_regprocedure('libro_costo_estado()') IS NOT NULL
    AND to_regprocedure('libro_costo_activar()') IS NOT NULL;
  IF NOT v_instalada THEN
    RAISE NOTICE '✗ 7. faltan tablas o funciones de la instalación del libro';
    v_fallas := array_append(v_fallas, 'instalacion-incompleta');
  ELSE
    SELECT count(*) INTO v_n FROM "CostoBaseVersion";
    IF v_n > 0 THEN v_restos := array_append(v_restos, format('%s versiones de base', v_n)); END IF;
    SELECT count(*) INTO v_n FROM "CostoUbicacionVersion";
    IF v_n > 0 THEN v_restos := array_append(v_restos, format('%s versiones de ubicación', v_n)); END IF;
    SELECT count(*) INTO v_n FROM "LibroCostoActivacion";
    IF v_n > 0 THEN v_restos := array_append(v_restos, format('%s filas de activación', v_n)); END IF;
    -- Por nombre, y por la función a la que apuntan: un trigger de captura con
    -- otro nombre también es captura.
    SELECT v_restos || coalesce(array_agg(DISTINCT 'trigger ' || t.tgname ORDER BY 'trigger ' || t.tgname), '{}') INTO v_restos
    FROM pg_trigger t
    WHERE NOT t.tgisinternal AND (
      t.tgname = ANY (c_triggers)
      OR t.tgfoid IN (SELECT oid FROM pg_proc WHERE proname IN
           ('libro_costo_base_registrar', 'libro_costo_ubicacion_registrar', 'libro_costo_local_registrar'))
    );
    IF cardinality(v_restos) = 0 THEN
      RAISE NOTICE '✓ 7. el libro está vacío: ni versiones, ni punto cero, ni fila de activación, ni triggers de captura';
    ELSE
      RAISE NOTICE '✗ 7. restos de una activación: %', v_restos;
      v_fallas := array_append(v_fallas, 'restos-de-activacion');
    END IF;

    -- La pregunta canónica del propio libro.
    SELECT * INTO v_estado FROM "libro_costo_estado"();
    IF (v_modo = 'recuperar' AND v_estado.estado = 'INTENTO_FALLIDO')
       OR (v_modo = 'revertida' AND v_estado.estado = 'NO_ACTIVADO') THEN
      RAISE NOTICE '✓ 8. libro_costo_estado(): % (%)', v_estado.estado, v_estado.detalle;
    ELSE
      RAISE NOTICE '✗ 8. libro_costo_estado(): % (%)', v_estado.estado, v_estado.detalle;
      v_fallas := array_append(v_fallas, 'estado-del-libro-no-coincide');
    END IF;
  END IF;

  RAISE NOTICE 'Intentos de % ya revertidos antes: %', c_activacion, v_revertidas;
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
