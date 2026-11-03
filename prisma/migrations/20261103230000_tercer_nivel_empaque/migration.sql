-- EL TERCER NIVEL DE EMPAQUE, TANDA 2: LAS COLUMNAS (2026-11-03).
--
-- Cartón → atado → suelto. El plan completo está en
-- docs/roadmap/tercer-nivel-empaque.md. Esta migración NO CAMBIA NINGÚN
-- COMPORTAMIENTO: agrega columnas nulas que nadie escribe todavía, y enseña a
-- los dos libros a mirar la que importa.
--
-- ── LAS COLUMNAS ──────────────────────────────────────────────────────────
--
--   · ProductoBase.sueltos_por_unidad — cuántos sueltos trae la unidad. NULL = 1.
--   · ProductoBase.nombre_unidad — "atado", "caja". NULL = "unidades".
--   · ProductoLocal.precio_venta_suelto — el precio del suelto en la ubicación.
--   · VentaDetalle.sueltosPorUnidadCongelado y
--     TransferenciaDetalle.sueltosPorUnidadCongelado — el N del momento, igual
--     que hoy se congela el factor (trampa 1 del plan).
--   · CostoBaseVersion.sueltosPorUnidad — para que el libro de costos sepa con
--     qué escala se leía el costo de cada versión.
--
-- Todas las filas existentes quedan en NULL, que es la verdad: ningún producto
-- tiene sueltos, ninguna venta ni transferencia se hizo con sueltos y ninguna
-- versión de costo los conocía.
--
-- ── LOS CHECKS ────────────────────────────────────────────────────────────
--
-- El vacío ya significa "1", "unidades" y "no se vende suelto". Un 1, un texto
-- en blanco o un precio cero dirían lo mismo de otra forma, y dos formas de
-- decir lo mismo es como nacen los contadores que miran solo una. Como todas
-- las columnas nacen en NULL, los CHECK no pueden fallar sobre datos viejos.
--
-- ── LOS DOS LIBROS ────────────────────────────────────────────────────────
--
-- `sueltos_por_unidad` cambia QUÉ SIGNIFICA StockLocal.cantidad sin cambiar el
-- número: con 20 sueltos por unidad, la columna pasa a contar cigarrillos. Por
-- eso el libro de stock lo registra como REINTERPRETACIÓN, igual que
-- `unidad_medida` o el peso de referencia, y el libro de costos lo captura como
-- parte de la escala de cada versión.
--
-- Las dos capturas se REDEFINEN acá con el campo agregado; las funciones
-- quedan idénticas a las de sus migraciones de origen
-- (`20260927120000_libro_stock` y `20260929120000_libro_costos`) más ese
-- campo. Los triggers se recrean SOLO si ya existen: esta migración no activa
-- ningún libro, y en una base donde un libro no está activado no le crea la
-- captura —eso es de la activación, que además escribe el punto cero—.
--
-- `nombre_unidad` es solo un rótulo: no cambia ninguna cantidad ni ningún
-- costo, así que ninguno de los dos libros lo mira.
--
-- No es aditiva para el clasificador del despliegue: reemplaza funciones y
-- recrea triggers. No reescribe ni borra ninguna fila.

-- Que un bloqueo largo de ProductoBase no deje la migración esperando con el
-- POS frenado detrás: si no consigue el candado en 3 s, falla y se reintenta.
SET LOCAL lock_timeout = '3s';

-- ════════════════════════════════════════════════════════════════════════════
-- LAS COLUMNAS
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "ProductoBase" ADD COLUMN     "sueltos_por_unidad" INTEGER,
ADD COLUMN     "nombre_unidad" TEXT;

-- AlterTable
ALTER TABLE "ProductoLocal" ADD COLUMN     "precio_venta_suelto" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "VentaDetalle" ADD COLUMN     "sueltosPorUnidadCongelado" INTEGER;

-- AlterTable
ALTER TABLE "TransferenciaDetalle" ADD COLUMN     "sueltosPorUnidadCongelado" INTEGER;

-- AlterTable
ALTER TABLE "CostoBaseVersion" ADD COLUMN     "sueltosPorUnidad" INTEGER;

-- ════════════════════════════════════════════════════════════════════════════
-- LOS CHECKS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_sueltos_por_unidad_mayor_que_1"
  CHECK ("sueltos_por_unidad" IS NULL OR "sueltos_por_unidad" > 1);

ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_nombre_unidad_no_vacio"
  CHECK ("nombre_unidad" IS NULL OR btrim("nombre_unidad") <> '');

ALTER TABLE "ProductoLocal" ADD CONSTRAINT "ProductoLocal_precio_venta_suelto_positivo"
  CHECK ("precio_venta_suelto" IS NULL OR "precio_venta_suelto" > 0);

ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_sueltosPorUnidadCongelado_mayor_que_1"
  CHECK ("sueltosPorUnidadCongelado" IS NULL OR "sueltosPorUnidadCongelado" > 1);

ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_sueltosPorUnidadCongelado_mayor_que_1"
  CHECK ("sueltosPorUnidadCongelado" IS NULL OR "sueltosPorUnidadCongelado" > 1);

-- ════════════════════════════════════════════════════════════════════════════
-- EL LIBRO DE STOCK: sueltos_por_unidad REINTERPRETA
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "libro_stock_reinterpretacion_producto"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_filas integer;
BEGIN
  SELECT count(*) INTO v_filas
  FROM "StockLocal" sl
  JOIN "ProductoLocal" pl ON pl."id" = sl."productoId"
  WHERE pl."baseId" = NEW."id" AND (sl."cantidad" <> 0 OR sl."enTransito" <> 0);

  IF OLD."unidad_medida" IS DISTINCT FROM NEW."unidad_medida" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'unidad_medida',
      OLD."unidad_medida"::text, NEW."unidad_medida"::text, v_filas);
  END IF;
  IF OLD."modoVentaDeposito" IS DISTINCT FROM NEW."modoVentaDeposito" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'modoVentaDeposito',
      OLD."modoVentaDeposito"::text, NEW."modoVentaDeposito"::text, v_filas);
  END IF;
  IF OLD."pesoReferenciaKg" IS DISTINCT FROM NEW."pesoReferenciaKg" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'pesoReferenciaKg',
      OLD."pesoReferenciaKg"::text, NEW."pesoReferenciaKg"::text, v_filas);
  END IF;
  IF OLD."modoCompraProveedor" IS DISTINCT FROM NEW."modoCompraProveedor" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'modoCompraProveedor',
      OLD."modoCompraProveedor"::text, NEW."modoCompraProveedor"::text, v_filas);
  END IF;
  IF OLD."pesoEsFijo" IS DISTINCT FROM NEW."pesoEsFijo" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'pesoEsFijo',
      OLD."pesoEsFijo"::text, NEW."pesoEsFijo"::text, v_filas);
  END IF;
  IF OLD."sueltos_por_unidad" IS DISTINCT FROM NEW."sueltos_por_unidad" THEN
    PERFORM "libro_stock_reinterpretacion"('ProductoBase', NEW."id", 'sueltos_por_unidad',
      OLD."sueltos_por_unidad"::text, NEW."sueltos_por_unidad"::text, v_filas);
  END IF;
  RETURN NULL;
END
$fn$;

DO $libro_stock$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'ProductoBase' AND t.tgname = 'ProductoBase_libro_reinterpretacion'
  ) THEN
    DROP TRIGGER "ProductoBase_libro_reinterpretacion" ON "ProductoBase";
    CREATE TRIGGER "ProductoBase_libro_reinterpretacion"
      AFTER UPDATE OF "unidad_medida", "modoVentaDeposito", "pesoReferenciaKg", "modoCompraProveedor", "pesoEsFijo", "sueltos_por_unidad" ON "ProductoBase"
      FOR EACH ROW
      WHEN (OLD."unidad_medida" IS DISTINCT FROM NEW."unidad_medida"
         OR OLD."modoVentaDeposito" IS DISTINCT FROM NEW."modoVentaDeposito"
         OR OLD."pesoReferenciaKg" IS DISTINCT FROM NEW."pesoReferenciaKg"
         OR OLD."modoCompraProveedor" IS DISTINCT FROM NEW."modoCompraProveedor"
         OR OLD."pesoEsFijo" IS DISTINCT FROM NEW."pesoEsFijo"
         OR OLD."sueltos_por_unidad" IS DISTINCT FROM NEW."sueltos_por_unidad")
      EXECUTE FUNCTION "libro_stock_reinterpretacion_producto"();
  END IF;
END
$libro_stock$;

-- ════════════════════════════════════════════════════════════════════════════
-- EL LIBRO DE COSTOS: sueltos_por_unidad ES PARTE DE LA ESCALA
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION "libro_costo_base_insertar"(
  p "ProductoBase", p_tipo "TipoVersionCosto", p_campos text[], p_instante timestamp(3), p_baja boolean
) RETURNS void
LANGUAGE sql AS $fn$
  INSERT INTO "CostoBaseVersion" (
    "version", "productoBaseId", "grupoId", "tipo", "instante", "dia",
    "precioCosto", "unidadMedida", "factorPack", "pesoReferenciaKg", "pesoEsFijo",
    "modoCompraProveedor", "modoVentaDeposito", "esCombo", "sueltosPorUnidad",
    "camposCambiados", "origen", "origenRef", "txid",
    "nombreCongelado", "codigoBarraCongelado"
  ) VALUES (
    nextval('libro_costo_seq'), p."id", p."grupoId", p_tipo, p_instante, "libro_stock_dia"(p_instante),
    p."precio_costo", p."unidad_medida"::text, p."factor_pack", p."pesoReferenciaKg", p."pesoEsFijo",
    p."modoCompraProveedor"::text, p."modoVentaDeposito"::text, p."es_combo", p."sueltos_por_unidad",
    p_campos, "libro_costo_origen"(), "libro_costo_origen_ref"(), txid_current(),
    CASE WHEN p_baja THEN p."nombre" END, CASE WHEN p_baja THEN p."codigo_barra" END
  )
$fn$;

CREATE OR REPLACE FUNCTION "libro_costo_base_registrar"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3) := "libro_stock_instante"();
  v_campos   text[] := '{}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "libro_costo_base_insertar"(NEW, 'ALTA', '{}', v_instante, false);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM "libro_costo_base_insertar"(OLD, 'BAJA', '{}', v_instante, true);
    RETURN NULL;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id" THEN
    PERFORM "libro_costo_base_insertar"(OLD, 'BAJA', '{}', v_instante, true);
    PERFORM "libro_costo_base_insertar"(NEW, 'ALTA', '{}', v_instante, false);
    RETURN NULL;
  END IF;

  IF OLD."grupoId" IS DISTINCT FROM NEW."grupoId" THEN v_campos := v_campos || 'grupoId'::text; END IF;
  IF OLD."precio_costo" IS DISTINCT FROM NEW."precio_costo" THEN v_campos := v_campos || 'precio_costo'::text; END IF;
  IF OLD."unidad_medida" IS DISTINCT FROM NEW."unidad_medida" THEN v_campos := v_campos || 'unidad_medida'::text; END IF;
  IF OLD."factor_pack" IS DISTINCT FROM NEW."factor_pack" THEN v_campos := v_campos || 'factor_pack'::text; END IF;
  IF OLD."pesoReferenciaKg" IS DISTINCT FROM NEW."pesoReferenciaKg" THEN v_campos := v_campos || 'pesoReferenciaKg'::text; END IF;
  IF OLD."pesoEsFijo" IS DISTINCT FROM NEW."pesoEsFijo" THEN v_campos := v_campos || 'pesoEsFijo'::text; END IF;
  IF OLD."modoCompraProveedor" IS DISTINCT FROM NEW."modoCompraProveedor" THEN v_campos := v_campos || 'modoCompraProveedor'::text; END IF;
  IF OLD."modoVentaDeposito" IS DISTINCT FROM NEW."modoVentaDeposito" THEN v_campos := v_campos || 'modoVentaDeposito'::text; END IF;
  IF OLD."es_combo" IS DISTINCT FROM NEW."es_combo" THEN v_campos := v_campos || 'es_combo'::text; END IF;
  IF OLD."sueltos_por_unidad" IS DISTINCT FROM NEW."sueltos_por_unidad" THEN v_campos := v_campos || 'sueltos_por_unidad'::text; END IF;

  IF cardinality(v_campos) > 0 THEN
    PERFORM "libro_costo_base_insertar"(NEW, 'CAMBIO', v_campos, v_instante, false);
  END IF;
  RETURN NULL;
END
$fn$;

DO $libro_costo$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'ProductoBase' AND t.tgname = 'ProductoBase_costo_version'
  ) THEN
    DROP TRIGGER "ProductoBase_costo_version" ON "ProductoBase";
    CREATE TRIGGER "ProductoBase_costo_version"
      AFTER INSERT OR UPDATE OF "id", "grupoId", "precio_costo", "unidad_medida", "factor_pack",
        "pesoReferenciaKg", "pesoEsFijo", "modoCompraProveedor", "modoVentaDeposito", "es_combo", "sueltos_por_unidad"
      OR DELETE ON "ProductoBase"
      FOR EACH ROW EXECUTE FUNCTION "libro_costo_base_registrar"();
  END IF;
END
$libro_costo$;
