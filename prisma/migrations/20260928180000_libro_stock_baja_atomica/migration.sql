-- LA BAJA DEL LIBRO NO DEPENDE DEL ORDEN DE LAS SENTENCIAS.
--
-- ── EL DEFECTO ──────────────────────────────────────────────────────────────
--
-- `libro_stock_registrar` es un trigger AFTER de fila sobre StockLocal. Los
-- triggers AFTER de fila corren al FINAL de la sentencia. La BAJA sacaba el
-- `productoBaseId` de ProductoLocal y la identidad congelada (nombre, código,
-- unidad) de ProductoBase, con un `INSERT … SELECT … JOIN`. Si UNA sola sentencia
-- borraba el StockLocal y también su ProductoLocal —un WITH con dos DELETE, o un
-- UPDATE que re-vincula la fila más el DELETE del producto viejo—, para cuando el
-- trigger corría el ProductoLocal ya no era visible: el SELECT no devolvía filas,
-- el INSERT no insertaba nada y la fila de stock desaparecía SIN BAJA. La clave
-- foránea RESTRICT no lo frenaba porque también se comprueba al final de la
-- sentencia, cuando el StockLocal ya se había ido. El verificador lo detectaba
-- después ("cadena-abierta-sin-fila"), pero el movimiento estaba perdido.
--
-- Ningún camino de la aplicación lo hacía: las dos rutas que borran productos
-- borran StockLocal y ProductoLocal en sentencias separadas. Es una corrección
-- preventiva. NO crea una nueva frontera de confiabilidad: el punto cero sigue
-- siendo el de `20260927120000_libro_stock`, que esta migración no toca.
--
-- ── LA CORRECCIÓN ───────────────────────────────────────────────────────────
--
--   1. La identidad se RECUERDA en el momento en que deja de existir. Dos
--      triggers BEFORE DELETE de fila, sobre ProductoLocal y ProductoBase,
--      guardan su identidad en una configuración LOCAL A LA TRANSACCIÓN
--      (`set_config(…, true)`): muere con la transacción, se revierte con ella
--      o con su savepoint, y no pasa a otra conexión. No escriben ninguna tabla.
--   2. La BAJA busca la identidad primero donde siempre —ProductoLocal y
--      ProductoBase vivos, así que el caso normal da exactamente lo mismo que
--      antes— y solo si ya no están, en lo recordado.
--   3. El libro FALLA CERRADO: si un movimiento no puede escribirse —la BAJA sin
--      identidad, o un ALTA o CAMBIO cuyo INSERT no inserta—, la sentencia aborta
--      con un error. La fila de stock no puede cambiar ni desaparecer sin su
--      movimiento. Antes, el INSERT … SELECT que no encontraba nada se callaba.
--
-- Nada más cambia: el reloj, el día, el origen, los tipos, los valores
-- anteriores y posteriores, el orden y los triggers existentes son los mismos.
-- El trigger "StockLocal_libro" sigue apuntando a la misma función, que se
-- reemplaza con CREATE OR REPLACE. No se reescribe ninguna fila del libro ni se
-- crea ningún ESTADO_INICIAL.
--
-- Sin tope de espera, a propósito: CREATE TRIGGER sobre ProductoLocal y
-- ProductoBase espera a que terminen las escrituras en curso sobre ESAS dos
-- tablas y detiene las nuevas hasta confirmar —no a las lecturas, ni a
-- StockLocal, que es lo que escribe el POS—. Un tope haría fallar la migración,
-- y esta migración no tiene un procedimiento de recuperación tipado.

-- ════════════════════════════════════════════════════════════════════════════
-- RECORDAR LA IDENTIDAD ANTES DE QUE SE BORRE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Las claves de la configuración llevan el id: `erpazul.libro_pb_<id>` y
-- `erpazul.libro_pl_<id>`. Los ids son SERIAL y no se reusan, así que dentro de
-- una transacción una clave nombra una sola fila.

CREATE FUNCTION "libro_stock_recordar_producto_base"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM set_config(
    'erpazul.libro_pb_' || OLD."id",
    jsonb_build_object(
      'baseId', OLD."id",
      'nombre', OLD."nombre",
      'codigo', OLD."codigo_barra",
      'unidad', OLD."unidad_medida"::text
    )::text,
    true
  );
  RETURN OLD;
END
$fn$;

CREATE FUNCTION "libro_stock_recordar_producto_local"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_identidad jsonb;
BEGIN
  -- La identidad del producto base, viva; o recordada, si el base se borró antes
  -- dentro de la misma sentencia.
  SELECT jsonb_build_object(
           'baseId', pb."id",
           'nombre', pb."nombre",
           'codigo', pb."codigo_barra",
           'unidad', pb."unidad_medida"::text
         )
  INTO v_identidad
  FROM "ProductoBase" pb WHERE pb."id" = OLD."baseId";

  IF v_identidad IS NULL THEN
    v_identidad := NULLIF(current_setting('erpazul.libro_pb_' || OLD."baseId", true), '')::jsonb;
  END IF;

  PERFORM set_config(
    'erpazul.libro_pl_' || OLD."id",
    (jsonb_build_object('baseId', OLD."baseId") || coalesce(v_identidad - 'baseId', '{}'::jsonb))::text,
    true
  );
  RETURN OLD;
END
$fn$;

CREATE TRIGGER "ProductoBase_libro_identidad"
  BEFORE DELETE ON "ProductoBase"
  FOR EACH ROW EXECUTE FUNCTION "libro_stock_recordar_producto_base"();

CREATE TRIGGER "ProductoLocal_libro_identidad"
  BEFORE DELETE ON "ProductoLocal"
  FOR EACH ROW EXECUTE FUNCTION "libro_stock_recordar_producto_local"();

-- ════════════════════════════════════════════════════════════════════════════
-- LA IDENTIDAD DE UNA BAJA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Primero lo vivo, exactamente como antes. Después lo recordado. Si no hay nada,
-- error: una BAJA sin identidad no se escribe a medias ni se saltea.
CREATE FUNCTION "libro_stock_identidad_de_baja"(p_producto_local integer) RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_base      integer;
  v_recordada jsonb;
  v_identidad jsonb;
BEGIN
  SELECT pl."baseId" INTO v_base FROM "ProductoLocal" pl WHERE pl."id" = p_producto_local;

  IF v_base IS NULL THEN
    v_recordada := NULLIF(current_setting('erpazul.libro_pl_' || p_producto_local, true), '')::jsonb;
    v_base := (v_recordada ->> 'baseId')::integer;
  END IF;

  IF v_base IS NOT NULL THEN
    SELECT jsonb_build_object(
             'baseId', pb."id",
             'nombre', pb."nombre",
             'codigo', pb."codigo_barra",
             'unidad', pb."unidad_medida"::text
           )
    INTO v_identidad
    FROM "ProductoBase" pb WHERE pb."id" = v_base;

    IF v_identidad IS NULL THEN
      v_identidad := jsonb_build_object('baseId', v_base)
        || coalesce(NULLIF(current_setting('erpazul.libro_pb_' || v_base, true), '')::jsonb - 'baseId', v_recordada - 'baseId');
    END IF;
  END IF;

  IF v_identidad IS NULL OR v_identidad ->> 'baseId' IS NULL OR v_identidad ->> 'nombre' IS NULL THEN
    RAISE EXCEPTION 'Libro de stock: no se puede registrar la BAJA de la fila de ProductoLocal %: su identidad no está disponible', p_producto_local
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN v_identidad;
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA CAPTURA, CON LA BAJA ROBUSTA Y FALLANDO CERRADO
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mismo cuerpo que en `20260927120000_libro_stock` para el CAMBIO y el ALTA —el
-- mismo INSERT, carácter por carácter, lo exige un candado—, más la comprobación
-- de que insertó. La BAJA toma la identidad de `libro_stock_identidad_de_baja`.
CREATE OR REPLACE FUNCTION "libro_stock_registrar"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3) := "libro_stock_instante"();
  v_dia      date         := "libro_stock_dia"(v_instante);
  v_origen   text         := "libro_stock_origen"();
  v_ref      text         := "libro_stock_origen_ref"();
  v_filas    integer;
  v_identidad jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."localId" = NEW."localId"
     AND OLD."productoId" = NEW."productoId"
     AND OLD."id" = NEW."id" THEN
    IF OLD."cantidad" IS DISTINCT FROM NEW."cantidad"
       OR OLD."enTransito" IS DISTINCT FROM NEW."enTransito" THEN
      INSERT INTO "MovimientoStock" (
        "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
        "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
        "instante", "dia", "origen", "origenRef"
      )
      SELECT NEW."id", NEW."localId", NEW."productoId", pl."baseId", 'CAMBIO',
             OLD."cantidad", NEW."cantidad", OLD."enTransito", NEW."enTransito",
             v_instante, v_dia, v_origen, v_ref
      FROM "ProductoLocal" pl WHERE pl."id" = NEW."productoId";
      GET DIAGNOSTICS v_filas = ROW_COUNT;
      IF v_filas <> 1 THEN
        RAISE EXCEPTION 'Libro de stock: no se pudo registrar el CAMBIO de la fila de StockLocal %', NEW."id"
          USING ERRCODE = 'raise_exception';
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  -- La baja: la fila se borra, o deja de ser esta cadena.
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    v_identidad := "libro_stock_identidad_de_baja"(OLD."productoId");
    INSERT INTO "MovimientoStock" (
      "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
      "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
      "instante", "dia", "origen", "origenRef",
      "nombreCongelado", "codigoBarraCongelado", "unidadMedidaCongelada"
    ) VALUES (
      OLD."id", OLD."localId", OLD."productoId", (v_identidad ->> 'baseId')::integer, 'BAJA',
      OLD."cantidad", NULL, OLD."enTransito", NULL,
      v_instante, v_dia, v_origen, v_ref,
      v_identidad ->> 'nombre', v_identidad ->> 'codigo', v_identidad ->> 'unidad'
    );
  END IF;

  -- El alta: nace una fila, o una cadena nueva.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO "MovimientoStock" (
      "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
      "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
      "instante", "dia", "origen", "origenRef"
    )
    SELECT NEW."id", NEW."localId", NEW."productoId", pl."baseId", 'ALTA',
           NULL, NEW."cantidad", NULL, NEW."enTransito",
           v_instante, v_dia, v_origen, v_ref
    FROM "ProductoLocal" pl WHERE pl."id" = NEW."productoId";
    GET DIAGNOSTICS v_filas = ROW_COUNT;
    IF v_filas <> 1 THEN
      RAISE EXCEPTION 'Libro de stock: no se pudo registrar el ALTA de la fila de StockLocal %', NEW."id"
        USING ERRCODE = 'raise_exception';
    END IF;
  END IF;

  RETURN NULL;
END
$fn$;
