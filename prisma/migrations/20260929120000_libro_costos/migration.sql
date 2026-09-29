-- EL LIBRO DE COSTOS: TABLAS, CAPTURA E INMUTABILIDAD. SIN ACTIVAR.
--
-- Esta migración deja todo listo y NO ENCIENDE NADA. Crea las tablas del libro,
-- su secuencia, las funciones de captura, la protección de lo escrito y la
-- función de activación, `libro_costo_activar()`. No crea los triggers de
-- captura ni escribe el PUNTO_CERO: eso lo hace la activación, en UNA
-- transacción, cuando se decida. Desplegarla no cambia el comportamiento de
-- ninguna escritura existente.
--
-- La activación en producción será una migración propia, que no hace más que
-- `SELECT "libro_costo_activar"();` y se llama `<fecha>_libro_costo_activacion`.
-- El procedimiento, y qué hacer si falla, está en
-- `docs/architecture/libro-de-costos.md`.
--
-- Es aditiva: tres tablas, un enum, una secuencia y funciones. No reescribe ni
-- borra ninguna fila existente y no cambia ninguna columna.

-- CreateEnum
CREATE TYPE "TipoVersionCosto" AS ENUM ('PUNTO_CERO', 'ALTA', 'CAMBIO', 'BAJA');

-- CreateTable
CREATE TABLE "CostoBaseVersion" (
    "version" BIGINT NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "tipo" "TipoVersionCosto" NOT NULL,
    "instante" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "precioCosto" DECIMAL(12,2) NOT NULL,
    "unidadMedida" TEXT NOT NULL,
    "factorPack" INTEGER,
    "pesoReferenciaKg" DECIMAL(10,3),
    "pesoEsFijo" BOOLEAN NOT NULL,
    "modoCompraProveedor" TEXT NOT NULL,
    "modoVentaDeposito" TEXT NOT NULL,
    "esCombo" BOOLEAN NOT NULL,
    "camposCambiados" TEXT[],
    "origen" TEXT NOT NULL,
    "origenRef" TEXT,
    "txid" BIGINT NOT NULL,
    "nombreCongelado" TEXT,
    "codigoBarraCongelado" TEXT,

    CONSTRAINT "CostoBaseVersion_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "CostoUbicacionVersion" (
    "version" BIGINT NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "tipo" "TipoVersionCosto" NOT NULL,
    "instante" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "precioCosto" DECIMAL(12,2),
    "esDeposito" BOOLEAN NOT NULL,
    "camposCambiados" TEXT[],
    "origen" TEXT NOT NULL,
    "origenRef" TEXT,
    "txid" BIGINT NOT NULL,

    CONSTRAINT "CostoUbicacionVersion_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "LibroCostoActivacion" (
    "id" INTEGER NOT NULL,
    "instante" TIMESTAMP(3) NOT NULL,
    "dia" DATE NOT NULL,
    "txid" BIGINT NOT NULL,
    "versionDesde" BIGINT NOT NULL,
    "versionHasta" BIGINT NOT NULL,
    "cantidadBase" INTEGER NOT NULL,
    "cantidadUbicacion" INTEGER NOT NULL,
    "huellaBase" TEXT NOT NULL,
    "huellaUbicacion" TEXT NOT NULL,

    CONSTRAINT "LibroCostoActivacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostoBaseVersion_productoBaseId_instante_version_idx" ON "CostoBaseVersion"("productoBaseId", "instante", "version");

-- CreateIndex
CREATE INDEX "CostoBaseVersion_txid_idx" ON "CostoBaseVersion"("txid");

-- CreateIndex
CREATE INDEX "CostoUbicacionVersion_localId_productoLocalId_instante_vers_idx" ON "CostoUbicacionVersion"("localId", "productoLocalId", "instante", "version");

-- CreateIndex
CREATE INDEX "CostoUbicacionVersion_txid_idx" ON "CostoUbicacionVersion"("txid");

-- ════════════════════════════════════════════════════════════════════════════
-- LO QUE PRISMA NO SABE EXPRESAR
-- ════════════════════════════════════════════════════════════════════════════

-- Una activación, una fila. El 1 no es un contador: es "la" activación.
ALTER TABLE "LibroCostoActivacion" ADD CONSTRAINT "LibroCostoActivacion_una_sola" CHECK ("id" = 1);

-- ── EL ORDEN TOTAL ──────────────────────────────────────────────────────────
--
-- Una secuencia para las DOS tablas. Dos versiones del mismo instante —o de la
-- misma transacción, como una base y la propagación a sus locales— quedan
-- ordenadas igual, sin depender del reloj. Una secuencia puede tener huecos
-- (una transacción revertida consume números): el orden importa, la
-- continuidad no.
CREATE SEQUENCE "libro_costo_seq" AS BIGINT;

-- ════════════════════════════════════════════════════════════════════════════
-- EL RELOJ, EL DÍA Y EL ORIGEN
-- ════════════════════════════════════════════════════════════════════════════
--
-- El reloj y el día son los del libro de stock —`libro_stock_instante()` y
-- `libro_stock_dia()`, America/Argentina/Cordoba—, reusados y no copiados: el
-- Stock Diario va a cruzar las dos historias por día y tienen que cortarlo en
-- el mismo lugar.
--
-- El origen es el que ya declaran los escritores de costo con
-- `declararOrigenDeCosto` (`lib/precios/origenDeCosto.js`): una configuración
-- local a la transacción. Sin declarar, SIN_ORIGEN, que es un valor válido.
CREATE FUNCTION "libro_costo_origen"() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(NULLIF(current_setting('erpazul.costo_origen', true), ''), 'SIN_ORIGEN')
$fn$;

CREATE FUNCTION "libro_costo_origen_ref"() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('erpazul.costo_origen_ref', true), '')
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA ESCRITURA DE UNA VERSIÓN
-- ════════════════════════════════════════════════════════════════════════════
--
-- Cada versión es el ESTADO COMPLETO de la fila, no un parche. Se escribe con
-- VALUES y no con INSERT … SELECT: una fila que no encuentra su JOIN no puede
-- desaparecer en silencio (el defecto que corrigió
-- `20260928180000_libro_stock_baja_atomica` en el libro de stock).
CREATE FUNCTION "libro_costo_base_insertar"(
  p "ProductoBase", p_tipo "TipoVersionCosto", p_campos text[], p_instante timestamp(3), p_baja boolean
) RETURNS void
LANGUAGE sql AS $fn$
  INSERT INTO "CostoBaseVersion" (
    "version", "productoBaseId", "grupoId", "tipo", "instante", "dia",
    "precioCosto", "unidadMedida", "factorPack", "pesoReferenciaKg", "pesoEsFijo",
    "modoCompraProveedor", "modoVentaDeposito", "esCombo",
    "camposCambiados", "origen", "origenRef", "txid",
    "nombreCongelado", "codigoBarraCongelado"
  ) VALUES (
    nextval('libro_costo_seq'), p."id", p."grupoId", p_tipo, p_instante, "libro_stock_dia"(p_instante),
    p."precio_costo", p."unidad_medida"::text, p."factor_pack", p."pesoReferenciaKg", p."pesoEsFijo",
    p."modoCompraProveedor"::text, p."modoVentaDeposito"::text, p."es_combo",
    p_campos, "libro_costo_origen"(), "libro_costo_origen_ref"(), txid_current(),
    CASE WHEN p_baja THEN p."nombre" END, CASE WHEN p_baja THEN p."codigo_barra" END
  )
$fn$;

-- `esDeposito` se congela del Local EN ESE MOMENTO. Si el Local no se encuentra,
-- el libro FALLA CERRADO: la escritura aborta en vez de dejar una ubicación sin
-- escala. La clave foránea de ProductoLocal hace que no pase por ningún camino
-- normal; solo una sentencia que borre la ubicación y su local juntos.
CREATE FUNCTION "libro_costo_ubicacion_insertar"(
  p "ProductoLocal", p_tipo "TipoVersionCosto", p_campos text[], p_instante timestamp(3)
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_es_deposito boolean;
BEGIN
  SELECT l."es_deposito" INTO v_es_deposito FROM "Local" l WHERE l."id" = p."localId";
  IF v_es_deposito IS NULL THEN
    RAISE EXCEPTION 'Libro de costos: el Local % de la ubicación % no existe; la escritura se aborta para no dejar historia sin escala',
      p."localId", p."id" USING ERRCODE = 'raise_exception';
  END IF;
  INSERT INTO "CostoUbicacionVersion" (
    "version", "productoLocalId", "productoBaseId", "localId", "tipo", "instante", "dia",
    "precioCosto", "esDeposito", "camposCambiados", "origen", "origenRef", "txid"
  ) VALUES (
    nextval('libro_costo_seq'), p."id", p."baseId", p."localId", p_tipo, p_instante, "libro_stock_dia"(p_instante),
    p."precio_costo", v_es_deposito, p_campos, "libro_costo_origen"(), "libro_costo_origen_ref"(), txid_current()
  );
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA CAPTURA
-- ════════════════════════════════════════════════════════════════════════════
--
-- ProductoBase: lo que decide el costo y cómo se lee —precio, unidad, factor,
-- peso, peso fijo, modos de compra y de venta, combo— y a qué grupo pertenece.
-- Un UPDATE que no cambia nada de eso no deja versión. Un UPDATE que cambia el
-- `id` es, para el libro, la baja de una fila y el alta de otra.
CREATE FUNCTION "libro_costo_base_registrar"() RETURNS trigger
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

  IF cardinality(v_campos) > 0 THEN
    PERFORM "libro_costo_base_insertar"(NEW, 'CAMBIO', v_campos, v_instante, false);
  END IF;
  RETURN NULL;
END
$fn$;

-- ProductoLocal: su costo propio (NULL = hereda) y a qué local y a qué base
-- pertenece. Cambiar de local o de base es una baja y un alta.
CREATE FUNCTION "libro_costo_ubicacion_registrar"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3) := "libro_stock_instante"();
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM "libro_costo_ubicacion_insertar"(NEW, 'ALTA', '{}', v_instante);
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM "libro_costo_ubicacion_insertar"(OLD, 'BAJA', '{}', v_instante);
    RETURN NULL;
  END IF;

  IF OLD."id" IS DISTINCT FROM NEW."id"
     OR OLD."localId" IS DISTINCT FROM NEW."localId"
     OR OLD."baseId" IS DISTINCT FROM NEW."baseId" THEN
    PERFORM "libro_costo_ubicacion_insertar"(OLD, 'BAJA', '{}', v_instante);
    PERFORM "libro_costo_ubicacion_insertar"(NEW, 'ALTA', '{}', v_instante);
    RETURN NULL;
  END IF;

  IF OLD."precio_costo" IS DISTINCT FROM NEW."precio_costo" THEN
    PERFORM "libro_costo_ubicacion_insertar"(NEW, 'CAMBIO', ARRAY['precio_costo'], v_instante);
  END IF;
  RETURN NULL;
END
$fn$;

-- Local: pasar de local a depósito o al revés cambia cómo se lee el stock de
-- peso fijo de TODAS sus ubicaciones (piezas en el depósito, kilos en un
-- local). Cada ubicación recibe su versión con el estado completo y el
-- `esDeposito` nuevo.
--
-- Las ubicaciones se bloquean ANTES de leer el reloj: así ninguna escritura
-- concurrente de su costo queda con un instante anterior y una versión
-- posterior, y dentro de una ubicación `instante` y `version` siguen creciendo
-- juntos. FOR NO KEY UPDATE y no FOR UPDATE: no frena las claves foráneas que
-- apuntan a ProductoLocal (StockLocal, ventas).
CREATE FUNCTION "libro_costo_local_registrar"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3);
  v_pl       "ProductoLocal";
BEGIN
  PERFORM 1 FROM "ProductoLocal" WHERE "localId" = NEW."id" ORDER BY "id" FOR NO KEY UPDATE;
  v_instante := "libro_stock_instante"();
  FOR v_pl IN SELECT * FROM "ProductoLocal" WHERE "localId" = NEW."id" ORDER BY "id" LOOP
    PERFORM "libro_costo_ubicacion_insertar"(v_pl, 'CAMBIO', ARRAY['esDeposito'], v_instante);
  END LOOP;
  RETURN NULL;
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA HISTORIA NO SE REESCRIBE, Y NO LA ESCRIBE CUALQUIERA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Nadie modifica ni borra una versión: si algo estuvo mal, se corrige con otra
-- versión y las dos quedan a la vista. Estos triggers existen desde ya; el que
-- rechaza TRUNCATE se instala en la activación, cuando hay historia que
-- proteger. Antes de eso las tablas están vacías, y los scripts de desarrollo
-- que vacían la base entera con TRUNCATE siguen funcionando.
CREATE FUNCTION "libro_costo_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'El libro de costos no se modifica: % sobre "%" rechazado', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END
$fn$;

-- Tampoco se inserta a mano: una versión la escriben los triggers de captura
-- —se ve en `pg_trigger_depth()`— o la activación, que lo declara en una
-- configuración local a su transacción. Es un resguardo contra un escritor
-- distraído, no contra uno malicioso: el que puede declarar la configuración
-- puede también desactivar el trigger.
CREATE FUNCTION "libro_costo_solo_el_libro_escribe"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF pg_trigger_depth() > 1 OR current_setting('erpazul.libro_costo_activando', true) = 'si' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El libro de costos solo lo escriben sus triggers: INSERT directo sobre "%" rechazado', TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END
$fn$;

CREATE TRIGGER "CostoBaseVersion_inmutable"
  BEFORE UPDATE OR DELETE ON "CostoBaseVersion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_inmutable"();
CREATE TRIGGER "CostoUbicacionVersion_inmutable"
  BEFORE UPDATE OR DELETE ON "CostoUbicacionVersion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_inmutable"();
CREATE TRIGGER "LibroCostoActivacion_inmutable"
  BEFORE UPDATE OR DELETE ON "LibroCostoActivacion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_inmutable"();

-- Los nombres de trigger no llevan "libro" en minúscula: el diagnóstico del
-- libro de stock inventaría triggers con `LIKE '%libro%'`.
CREATE TRIGGER "CostoBaseVersion_solo_su_captura"
  BEFORE INSERT ON "CostoBaseVersion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_solo_el_libro_escribe"();
CREATE TRIGGER "CostoUbicacionVersion_solo_su_captura"
  BEFORE INSERT ON "CostoUbicacionVersion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_solo_el_libro_escribe"();
CREATE TRIGGER "LibroCostoActivacion_solo_su_captura"
  BEFORE INSERT ON "LibroCostoActivacion"
  FOR EACH ROW EXECUTE FUNCTION "libro_costo_solo_el_libro_escribe"();

-- ════════════════════════════════════════════════════════════════════════════
-- LA HUELLA
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un md5 del estado, fila por fila y en orden de id, con el MISMO formato de los
-- dos lados: sobre las tablas vivas (la fuente) y sobre las versiones PUNTO_CERO.
-- La activación exige que coincidan antes de confirmar, y la huella queda
-- guardada para volver a comprobarla cuando se quiera.
CREATE FUNCTION "libro_costo_huella_fuente"(OUT base text, OUT ubicacion text)
LANGUAGE sql STABLE AS $fn$
  SELECT
    md5(COALESCE((SELECT string_agg(concat_ws('|',
        pb."id", pb."grupoId", pb."precio_costo", pb."unidad_medida"::text,
        COALESCE(pb."factor_pack"::text, '-'), COALESCE(pb."pesoReferenciaKg"::text, '-'),
        pb."pesoEsFijo", pb."modoCompraProveedor"::text, pb."modoVentaDeposito"::text, pb."es_combo"
      ), E'\n' ORDER BY pb."id") FROM "ProductoBase" pb), '')),
    md5(COALESCE((SELECT string_agg(concat_ws('|',
        pl."id", pl."localId", pl."baseId", COALESCE(pl."precio_costo"::text, '-'), l."es_deposito"
      ), E'\n' ORDER BY pl."id") FROM "ProductoLocal" pl JOIN "Local" l ON l."id" = pl."localId"), ''))
$fn$;

CREATE FUNCTION "libro_costo_huella_punto_cero"(OUT base text, OUT ubicacion text)
LANGUAGE sql STABLE AS $fn$
  SELECT
    md5(COALESCE((SELECT string_agg(concat_ws('|',
        v."productoBaseId", v."grupoId", v."precioCosto", v."unidadMedida",
        COALESCE(v."factorPack"::text, '-'), COALESCE(v."pesoReferenciaKg"::text, '-'),
        v."pesoEsFijo", v."modoCompraProveedor", v."modoVentaDeposito", v."esCombo"
      ), E'\n' ORDER BY v."productoBaseId") FROM "CostoBaseVersion" v WHERE v."tipo" = 'PUNTO_CERO'), '')),
    md5(COALESCE((SELECT string_agg(concat_ws('|',
        v."productoLocalId", v."localId", v."productoBaseId", COALESCE(v."precioCosto"::text, '-'), v."esDeposito"
      ), E'\n' ORDER BY v."productoLocalId") FROM "CostoUbicacionVersion" v WHERE v."tipo" = 'PUNTO_CERO'), ''))
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- LA ACTIVACIÓN: EL PUNTO CERO SIN HUECOS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Todo o nada, en la transacción de quien la llama:
--
--   1. Tope de espera de 3 s, local a la transacción. Si una transacción larga
--      está escribiendo productos, la activación falla rápido (SQLSTATE 55P03)
--      en vez de dejar a la aplicación esperando detrás.
--   2. SHARE ROW EXCLUSIVE sobre ProductoBase, ProductoLocal y Local: espera a
--      que terminen las escrituras en curso y frena las nuevas —las lecturas
--      siguen— hasta confirmar. Tomarlo ANTES de copiar cierra el hueco entre
--      "copié el estado" y "el trigger existe". Las tablas del libro, en
--      EXCLUSIVE: dos activaciones simultáneas no pueden pasar las dos.
--   3. Con los candados tomados, se exige que el libro esté vacío y sin
--      activar. Una segunda activación falla: el punto cero es uno solo.
--   4. Los triggers de captura y los que rechazan TRUNCATE.
--   5. El punto cero: un único instante para todas las filas.
--   6. Cantidades y huellas: la fuente y el punto cero tienen que coincidir.
--   7. La fila de activación.
--
-- Si cualquier paso falla, PostgreSQL revierte la transacción entera: no quedan
-- triggers, ni versiones, ni fila de activación. El libro vuelve a NO_ACTIVADO y
-- se puede reintentar. Probado en `scripts/pruebas-db/libroCostos.mjs`.
CREATE FUNCTION "libro_costo_activar"() RETURNS jsonb
LANGUAGE plpgsql AS $fn$
DECLARE
  v_instante timestamp(3);
  v_txid     bigint := txid_current();
  v_desde    bigint;
  v_hasta    bigint;
  v_nb       integer;
  v_nu       integer;
  v_fuente   record;
  v_cero     record;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  LOCK TABLE "ProductoBase", "ProductoLocal", "Local" IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE "CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion" IN EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM "LibroCostoActivacion") THEN
    RAISE EXCEPTION 'LIBRO_COSTO_YA_ACTIVADO: el libro de costos ya tiene su punto cero; no se activa dos veces'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF EXISTS (SELECT 1 FROM "CostoBaseVersion") OR EXISTS (SELECT 1 FROM "CostoUbicacionVersion") THEN
    RAISE EXCEPTION 'LIBRO_COSTO_INCONSISTENTE: hay versiones sin activación; no se activa sobre una historia que no se sabe de dónde salió'
      USING ERRCODE = 'raise_exception';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal AND tgname IN (
      'ProductoBase_costo_version', 'ProductoLocal_costo_version', 'Local_costo_version',
      'CostoBaseVersion_sin_truncate', 'CostoUbicacionVersion_sin_truncate', 'LibroCostoActivacion_sin_truncate')
  ) THEN
    RAISE EXCEPTION 'LIBRO_COSTO_INCONSISTENTE: los triggers de captura ya existen sin activación'
      USING ERRCODE = 'raise_exception';
  END IF;

  PERFORM set_config('erpazul.libro_costo_activando', 'si', true);

  CREATE TRIGGER "ProductoBase_costo_version"
    AFTER INSERT OR UPDATE OF "id", "grupoId", "precio_costo", "unidad_medida", "factor_pack",
      "pesoReferenciaKg", "pesoEsFijo", "modoCompraProveedor", "modoVentaDeposito", "es_combo"
    OR DELETE ON "ProductoBase"
    FOR EACH ROW EXECUTE FUNCTION "libro_costo_base_registrar"();

  CREATE TRIGGER "ProductoLocal_costo_version"
    AFTER INSERT OR UPDATE OF "id", "localId", "baseId", "precio_costo" OR DELETE ON "ProductoLocal"
    FOR EACH ROW EXECUTE FUNCTION "libro_costo_ubicacion_registrar"();

  CREATE TRIGGER "Local_costo_version"
    AFTER UPDATE OF "es_deposito" ON "Local"
    FOR EACH ROW
    WHEN (OLD."es_deposito" IS DISTINCT FROM NEW."es_deposito")
    EXECUTE FUNCTION "libro_costo_local_registrar"();

  CREATE TRIGGER "CostoBaseVersion_sin_truncate"
    BEFORE TRUNCATE ON "CostoBaseVersion"
    FOR EACH STATEMENT EXECUTE FUNCTION "libro_costo_inmutable"();
  CREATE TRIGGER "CostoUbicacionVersion_sin_truncate"
    BEFORE TRUNCATE ON "CostoUbicacionVersion"
    FOR EACH STATEMENT EXECUTE FUNCTION "libro_costo_inmutable"();
  CREATE TRIGGER "LibroCostoActivacion_sin_truncate"
    BEFORE TRUNCATE ON "LibroCostoActivacion"
    FOR EACH STATEMENT EXECUTE FUNCTION "libro_costo_inmutable"();

  v_instante := "libro_stock_instante"();
  v_desde := nextval('libro_costo_seq');

  INSERT INTO "CostoBaseVersion" (
    "version", "productoBaseId", "grupoId", "tipo", "instante", "dia",
    "precioCosto", "unidadMedida", "factorPack", "pesoReferenciaKg", "pesoEsFijo",
    "modoCompraProveedor", "modoVentaDeposito", "esCombo",
    "camposCambiados", "origen", "origenRef", "txid"
  )
  SELECT nextval('libro_costo_seq'), s."id", s."grupoId", 'PUNTO_CERO', v_instante, "libro_stock_dia"(v_instante),
         s."precio_costo", s."unidad_medida"::text, s."factor_pack", s."pesoReferenciaKg", s."pesoEsFijo",
         s."modoCompraProveedor"::text, s."modoVentaDeposito"::text, s."es_combo",
         '{}', 'ACTIVACION_DEL_LIBRO_DE_COSTOS', NULL, v_txid
  FROM (SELECT * FROM "ProductoBase" ORDER BY "id") s;

  INSERT INTO "CostoUbicacionVersion" (
    "version", "productoLocalId", "productoBaseId", "localId", "tipo", "instante", "dia",
    "precioCosto", "esDeposito", "camposCambiados", "origen", "origenRef", "txid"
  )
  SELECT nextval('libro_costo_seq'), s."id", s."baseId", s."localId", 'PUNTO_CERO', v_instante, "libro_stock_dia"(v_instante),
         s."precio_costo", s."es_deposito", '{}', 'ACTIVACION_DEL_LIBRO_DE_COSTOS', NULL, v_txid
  FROM (
    SELECT pl.*, l."es_deposito" FROM "ProductoLocal" pl JOIN "Local" l ON l."id" = pl."localId" ORDER BY pl."id"
  ) s;

  v_hasta := nextval('libro_costo_seq');

  SELECT count(*) INTO v_nb FROM "CostoBaseVersion" WHERE "tipo" = 'PUNTO_CERO';
  SELECT count(*) INTO v_nu FROM "CostoUbicacionVersion" WHERE "tipo" = 'PUNTO_CERO';
  IF v_nb <> (SELECT count(*) FROM "ProductoBase") OR v_nu <> (SELECT count(*) FROM "ProductoLocal") THEN
    RAISE EXCEPTION 'LIBRO_COSTO_PUNTO_CERO_INCOMPLETO: % de % bases y % de % ubicaciones',
      v_nb, (SELECT count(*) FROM "ProductoBase"), v_nu, (SELECT count(*) FROM "ProductoLocal")
      USING ERRCODE = 'raise_exception';
  END IF;

  SELECT * INTO v_fuente FROM "libro_costo_huella_fuente"();
  SELECT * INTO v_cero FROM "libro_costo_huella_punto_cero"();
  IF v_fuente.base <> v_cero.base OR v_fuente.ubicacion <> v_cero.ubicacion THEN
    RAISE EXCEPTION 'LIBRO_COSTO_HUELLA_DISTINTA: el punto cero no reproduce el estado de las tablas'
      USING ERRCODE = 'raise_exception';
  END IF;

  INSERT INTO "LibroCostoActivacion" (
    "id", "instante", "dia", "txid", "versionDesde", "versionHasta",
    "cantidadBase", "cantidadUbicacion", "huellaBase", "huellaUbicacion"
  ) VALUES (
    1, v_instante, "libro_stock_dia"(v_instante), v_txid, v_desde, v_hasta,
    v_nb, v_nu, v_cero.base, v_cero.ubicacion
  );

  PERFORM set_config('erpazul.libro_costo_activando', '', true);

  RETURN jsonb_build_object(
    'instante', v_instante, 'dia', "libro_stock_dia"(v_instante), 'txid', v_txid,
    'versionDesde', v_desde, 'versionHasta', v_hasta,
    'cantidadBase', v_nb, 'cantidadUbicacion', v_nu,
    'huellaBase', v_cero.base, 'huellaUbicacion', v_cero.ubicacion
  );
END
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- EL ESTADO
-- ════════════════════════════════════════════════════════════════════════════
--
-- NO_ACTIVADO: ni fila de activación, ni versiones, ni triggers de captura.
-- ACTIVADO: la fila, los seis triggers, y el punto cero que todavía reproduce su
--   huella guardada.
-- INTENTO_FALLIDO: la migración de activación figura fallida y sin resolver en
--   `_prisma_migrations`, y el libro no está activo. La transacción revirtió
--   todo; lo que falta es resolverla (ver el procedimiento).
-- INCONSISTENTE: cualquier otra combinación. Nunca debería verse.
--
-- `intentos_revertidos` cuenta las activaciones marcadas `--rolled-back`.
CREATE FUNCTION "libro_costo_estado"(OUT estado text, OUT detalle text, OUT intentos_revertidos integer)
LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_activacion "LibroCostoActivacion";
  v_triggers   integer;
  v_versiones  boolean;
  v_fallidos   integer := 0;
  v_cero       record;
BEGIN
  intentos_revertidos := 0;
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL),
             count(*) FILTER (WHERE rolled_back_at IS NOT NULL)
      FROM "_prisma_migrations" WHERE migration_name LIKE '%\_libro\_costo\_activacion'
    $q$ INTO v_fallidos, intentos_revertidos;
  END IF;

  SELECT * INTO v_activacion FROM "LibroCostoActivacion" WHERE "id" = 1;
  SELECT count(*) INTO v_triggers FROM pg_trigger
  WHERE NOT tgisinternal AND tgname IN (
    'ProductoBase_costo_version', 'ProductoLocal_costo_version', 'Local_costo_version',
    'CostoBaseVersion_sin_truncate', 'CostoUbicacionVersion_sin_truncate', 'LibroCostoActivacion_sin_truncate');
  v_versiones := EXISTS (SELECT 1 FROM "CostoBaseVersion") OR EXISTS (SELECT 1 FROM "CostoUbicacionVersion");

  IF v_activacion."id" IS NULL THEN
    IF v_triggers = 0 AND NOT v_versiones THEN
      IF v_fallidos > 0 THEN
        estado := 'INTENTO_FALLIDO';
        detalle := 'la migración de activación falló y no está resuelta; el libro no quedó activo ni con restos';
      ELSE
        estado := 'NO_ACTIVADO';
        detalle := 'sin punto cero: el libro todavía no registra nada';
      END IF;
    ELSE
      estado := 'INCONSISTENTE';
      detalle := format('sin activación, pero con %s triggers de captura y versiones: %s', v_triggers, v_versiones);
    END IF;
    RETURN;
  END IF;

  SELECT * INTO v_cero FROM "libro_costo_huella_punto_cero"();
  IF v_triggers = 6 AND v_cero.base = v_activacion."huellaBase" AND v_cero.ubicacion = v_activacion."huellaUbicacion" THEN
    estado := 'ACTIVADO';
    detalle := format('punto cero %s, %s bases y %s ubicaciones', v_activacion."instante", v_activacion."cantidadBase", v_activacion."cantidadUbicacion");
  ELSE
    estado := 'INCONSISTENTE';
    detalle := format('activado, pero con %s de 6 triggers y huella del punto cero %s',
      v_triggers, CASE WHEN v_cero.base = v_activacion."huellaBase" AND v_cero.ubicacion = v_activacion."huellaUbicacion" THEN 'igual' ELSE 'distinta' END);
  END IF;
END
$fn$;
