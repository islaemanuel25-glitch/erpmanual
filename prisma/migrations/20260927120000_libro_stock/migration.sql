-- EL LIBRO HISTÓRICO FÍSICO DE STOCK Y SU PUNTO CERO.
--
-- Desde que esta migración confirma, cada cambio real de `StockLocal.cantidad` o
-- de `StockLocal.enTransito` deja una fila en "MovimientoStock", escrita por
-- PostgreSQL dentro de la MISMA transacción que el cambio. Lo que había antes se
-- registra una sola vez, como ESTADO_INICIAL: el primer estado que el libro
-- conoce, no una entrada de mercadería.
--
-- Es aditiva: dos tablas nuevas, sus funciones y cinco triggers. No reescribe
-- ninguna fila existente, no borra nada y no cambia ninguna columna. Las rutas no
-- se tocan: las que todavía no declaran origen quedan como SIN_ORIGEN.
--
-- Qué NO hace, a propósito:
--   · No registra costo. La historia física no depende de la valorización.
--   · No convierte cantidades cuando cambia la unidad. Solo deja constancia.
--   · No toca `AuditoriaStock`, que sigue guardando el motivo humano del ajuste.
--   · No protege contra TRUNCATE: los triggers de fila no lo ven. Solo lo usan
--     los scripts destructivos de desarrollo, con base en lista blanca, y el
--     verificador lo detecta como cadena abierta sin fila viva.
--
-- El detalle de cada decisión está en el schema, en `lib/stock/libro/` y en el
-- verificador `scripts/verificar-libro-stock.mjs`.

-- CreateEnum
CREATE TYPE "TipoMovimientoStock" AS ENUM ('ESTADO_INICIAL', 'ALTA', 'CAMBIO', 'BAJA');

-- CreateTable
CREATE TABLE "MovimientoStock" (
    "id" SERIAL NOT NULL,
    "stockLocalId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "tipo" "TipoMovimientoStock" NOT NULL,
    "cantidadAnterior" DECIMAL(12,3),
    "cantidadPosterior" DECIMAL(12,3),
    "enTransitoAnterior" DECIMAL(12,3),
    "enTransitoPosterior" DECIMAL(12,3),
    "instante" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "origen" TEXT NOT NULL,
    "origenRef" TEXT,
    "nombreCongelado" TEXT,
    "codigoBarraCongelado" TEXT,
    "unidadMedidaCongelada" TEXT,

    CONSTRAINT "MovimientoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReinterpretacionDeStock" (
    "id" SERIAL NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" INTEGER NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorPosterior" TEXT,
    "filasConStock" INTEGER NOT NULL,
    "instante" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "origen" TEXT NOT NULL,
    "origenRef" TEXT,

    CONSTRAINT "ReinterpretacionDeStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MovimientoStock_localId_productoLocalId_id_idx" ON "MovimientoStock"("localId", "productoLocalId", "id");

-- CreateIndex
CREATE INDEX "MovimientoStock_localId_dia_idx" ON "MovimientoStock"("localId", "dia");

-- CreateIndex
CREATE INDEX "ReinterpretacionDeStock_entidad_entidadId_idx" ON "ReinterpretacionDeStock"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "ReinterpretacionDeStock_dia_idx" ON "ReinterpretacionDeStock"("dia");

-- ════════════════════════════════════════════════════════════════════════════
-- EL RELOJ Y EL DÍA
-- ════════════════════════════════════════════════════════════════════════════
--
-- `clock_timestamp()` y no `now()`: `now()` es el inicio de la transacción, y una
-- venta que empezó a las 23:59:59 y consiguió la fila a las 00:00:01 cambió el
-- stock en el día nuevo. Leído desde un trigger de fila, el candado de esa fila
-- ya está tomado, así que para un mismo producto el orden del reloj es el orden
-- en que cambió la cantidad.
--
-- El instante se redondea a milisegundos —`TIMESTAMP(3)`, como toda la base— y
-- el día se calcula DEL INSTANTE YA REDONDEADO. Calcularlo del reloj crudo haría
-- que 23:59:59.9996 quedara con instante del día siguiente y día del anterior.
--
-- La zona va escrita: `America/Argentina/Cordoba`, la misma de
-- `lib/fechas/rangoArgentina.js`. No depende de la zona de la sesión ni de Node.
CREATE FUNCTION "libro_stock_instante"() RETURNS timestamp(3)
LANGUAGE sql VOLATILE AS $fn$
  SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
$fn$;

-- STABLE y no IMMUTABLE: las reglas de una zona IANA pueden cambiar con una
-- actualización de tzdata, así que el resultado no está fijo para siempre.
CREATE FUNCTION "libro_stock_dia"(p_instante timestamp) RETURNS date
LANGUAGE sql STABLE AS $fn$
  SELECT ((p_instante AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Cordoba')::date
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- EL ORIGEN DECLARADO
-- ════════════════════════════════════════════════════════════════════════════
--
-- Lo declara la aplicación con `set_config(..., true)`, local a la transacción:
-- muere con ella y no contamina la próxima que use la misma conexión. Ver
-- `declararOrigenDeStock` en `lib/stock/libro/libroStock.js`. Sin declarar, el
-- movimiento queda como SIN_ORIGEN: la cantidad es verdadera, la causa no está
-- clasificada todavía.
CREATE FUNCTION "libro_stock_origen"() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(NULLIF(current_setting('erpazul.stock_origen', true), ''), 'SIN_ORIGEN')
$fn$;

CREATE FUNCTION "libro_stock_origen_ref"() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('erpazul.stock_origen_ref', true), '')
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA CAPTURA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Preserva el hecho físico y nada más: valores anteriores y posteriores, reloj,
-- día, origen declarado y, en la baja, la identidad mínima del producto. No
-- decide nada de negocio y no llama a ninguna regla que viva en JavaScript.
--
-- Un UPDATE que no cambia ni la cantidad ni el tránsito —los límites, por
-- ejemplo— no deja movimiento. Un UPDATE que mueve la fila a otro producto u
-- otra ubicación se registra como lo que es para el libro: la baja de una cadena
-- y el alta de otra.
CREATE FUNCTION "libro_stock_registrar"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3) := "libro_stock_instante"();
  v_dia      date         := "libro_stock_dia"(v_instante);
  v_origen   text         := "libro_stock_origen"();
  v_ref      text         := "libro_stock_origen_ref"();
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
    END IF;
    RETURN NULL;
  END IF;

  -- La baja: la fila se borra, o deja de ser esta cadena.
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    INSERT INTO "MovimientoStock" (
      "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
      "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
      "instante", "dia", "origen", "origenRef",
      "nombreCongelado", "codigoBarraCongelado", "unidadMedidaCongelada"
    )
    SELECT OLD."id", OLD."localId", OLD."productoId", pl."baseId", 'BAJA',
           OLD."cantidad", NULL, OLD."enTransito", NULL,
           v_instante, v_dia, v_origen, v_ref,
           pb."nombre", pb."codigo_barra", pb."unidad_medida"::text
    FROM "ProductoLocal" pl
    JOIN "ProductoBase" pb ON pb."id" = pl."baseId"
    WHERE pl."id" = OLD."productoId";
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
  END IF;

  RETURN NULL;
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA REINTERPRETACIÓN
-- ════════════════════════════════════════════════════════════════════════════
--
-- Los campos que cambian QUÉ SIGNIFICA `StockLocal.cantidad` sin cambiar el
-- número, relevados en la auditoría de la etapa 1.c.2: en ProductoBase
-- `unidad_medida`, `modoVentaDeposito`, `pesoReferenciaKg`, `modoCompraProveedor`
-- y `pesoEsFijo`; en Local, `es_deposito`.
--
-- No se decide acá si el cambio reinterpreta de verdad. Eso lo decide
-- `esFiambreFijo` en `lib/conversiones/stock.js`, y duplicarlo en SQL sería tener
-- dos funciones que deciden lo mismo. Se registra cada cambio de cada uno de esos
-- campos, con su valor anterior y el nuevo, y cuántas filas de stock tenían algo
-- en ese momento. Nada se convierte y nada se bloquea.
CREATE FUNCTION "libro_stock_reinterpretacion"(
  p_entidad text, p_entidad_id integer, p_campo text,
  p_anterior text, p_posterior text, p_filas integer
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3) := "libro_stock_instante"();
BEGIN
  INSERT INTO "ReinterpretacionDeStock" (
    "entidad", "entidadId", "campo", "valorAnterior", "valorPosterior",
    "filasConStock", "instante", "dia", "origen", "origenRef"
  ) VALUES (
    p_entidad, p_entidad_id, p_campo, p_anterior, p_posterior,
    p_filas, v_instante, "libro_stock_dia"(v_instante),
    "libro_stock_origen"(), "libro_stock_origen_ref"()
  );
END
$fn$;

CREATE FUNCTION "libro_stock_reinterpretacion_producto"() RETURNS trigger
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
  RETURN NULL;
END
$fn$;

CREATE FUNCTION "libro_stock_reinterpretacion_local"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_filas integer;
BEGIN
  SELECT count(*) INTO v_filas
  FROM "StockLocal" sl
  WHERE sl."localId" = NEW."id" AND (sl."cantidad" <> 0 OR sl."enTransito" <> 0);

  PERFORM "libro_stock_reinterpretacion"('Local', NEW."id", 'es_deposito',
    OLD."es_deposito"::text, NEW."es_deposito"::text, v_filas);
  RETURN NULL;
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- EL LIBRO NO SE REESCRIBE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un movimiento no se edita ni se borra: si algo estuvo mal, lo que corresponde
-- es otro movimiento que lo corrija, y los dos quedan a la vista.
CREATE FUNCTION "libro_stock_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'El libro de stock no se modifica: % sobre "%" rechazado', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END
$fn$;

CREATE TRIGGER "MovimientoStock_inmutable"
  BEFORE UPDATE OR DELETE ON "MovimientoStock"
  FOR EACH ROW EXECUTE FUNCTION "libro_stock_inmutable"();

CREATE TRIGGER "ReinterpretacionDeStock_inmutable"
  BEFORE UPDATE OR DELETE ON "ReinterpretacionDeStock"
  FOR EACH ROW EXECUTE FUNCTION "libro_stock_inmutable"();

-- ════════════════════════════════════════════════════════════════════════════
-- LA ACTIVACIÓN: EL PUNTO CERO SIN HUECOS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Mientras esta migración corre, la app vieja sigue vendiendo. El peligro es una
-- escritura que caiga entre "copié el estado inicial" y "el trigger existe": no
-- quedaría ni en la copia ni en el libro.
--
-- Por eso, en este orden y en UNA sola sentencia:
--
--   1. Tope de espera de 3 s, local a la transacción. Si hay una transacción
--      larga escribiendo stock, la migración falla rápido en vez de dejar al POS
--      esperando detrás de ella.
--   2. `LOCK TABLE ... SHARE ROW EXCLUSIVE` sobre StockLocal, ProductoBase y
--      Local. Espera a que terminen las escrituras en curso y frena las nuevas
--      —las lecturas siguen— hasta que la migración confirma. Es el mismo modo
--      que toma CREATE TRIGGER; tomarlo ANTES de copiar es lo que cierra el
--      hueco.
--   3. Los triggers.
--   4. El estado inicial, con un único instante para todas las filas, leído
--      después del candado.
--
-- Es un bloque DO porque un DO es una sola sentencia y PostgreSQL la ejecuta
-- entera o nada, la envuelva Prisma en una transacción o no. Probado en
-- `scripts/pruebas-db/libroStock.mjs`.
--
-- ACTIVACION:INICIO
DO $activacion$
DECLARE
  v_instante timestamp(3);
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  LOCK TABLE "StockLocal", "ProductoBase", "Local" IN SHARE ROW EXCLUSIVE MODE;

  CREATE TRIGGER "StockLocal_libro"
    AFTER INSERT OR UPDATE OR DELETE ON "StockLocal"
    FOR EACH ROW EXECUTE FUNCTION "libro_stock_registrar"();

  CREATE TRIGGER "ProductoBase_libro_reinterpretacion"
    AFTER UPDATE OF "unidad_medida", "modoVentaDeposito", "pesoReferenciaKg", "modoCompraProveedor", "pesoEsFijo" ON "ProductoBase"
    FOR EACH ROW
    WHEN (OLD."unidad_medida" IS DISTINCT FROM NEW."unidad_medida"
       OR OLD."modoVentaDeposito" IS DISTINCT FROM NEW."modoVentaDeposito"
       OR OLD."pesoReferenciaKg" IS DISTINCT FROM NEW."pesoReferenciaKg"
       OR OLD."modoCompraProveedor" IS DISTINCT FROM NEW."modoCompraProveedor"
       OR OLD."pesoEsFijo" IS DISTINCT FROM NEW."pesoEsFijo")
    EXECUTE FUNCTION "libro_stock_reinterpretacion_producto"();

  CREATE TRIGGER "Local_libro_reinterpretacion"
    AFTER UPDATE OF "es_deposito" ON "Local"
    FOR EACH ROW
    WHEN (OLD."es_deposito" IS DISTINCT FROM NEW."es_deposito")
    EXECUTE FUNCTION "libro_stock_reinterpretacion_local"();

  v_instante := "libro_stock_instante"();

  INSERT INTO "MovimientoStock" (
    "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
    "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
    "instante", "dia", "origen", "origenRef"
  )
  SELECT sl."id", sl."localId", sl."productoId", pl."baseId", 'ESTADO_INICIAL',
         NULL, sl."cantidad", NULL, sl."enTransito",
         v_instante, "libro_stock_dia"(v_instante), 'ACTIVACION_DEL_LIBRO', NULL
  FROM "StockLocal" sl
  JOIN "ProductoLocal" pl ON pl."id" = sl."productoId"
  ORDER BY sl."id";
END
$activacion$;
-- ACTIVACION:FIN
