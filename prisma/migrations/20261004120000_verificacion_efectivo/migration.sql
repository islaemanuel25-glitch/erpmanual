-- TESORERÍA: LA VERIFICACIÓN DEL EFECTIVO ENTREGADO.
--
-- Dos tablas nuevas y vacías, dos enums, sus índices, sus FK, sus CHECK y sus
-- triggers. ADITIVA: no toca ninguna tabla existente salvo para que la apunten
-- FK nuevas (crear una FK desde una tabla vacía toma un candado breve sobre la
-- referenciada y no recorre nada). Sin backfill: ninguna entrega histórica queda
-- verificada; todas quedan pendientes de verificación.
--
-- Una verificación es un HECHO. Lo que la base sostiene sola, sin depender de que
-- el código lo haga bien:
--   1. diferencia = verificado − declarado (CHECK);
--   2. declarado = suma de las fotos de sus entregas, y al menos una entrega
--      (trigger de restricción diferido al commit);
--   3. la foto de cada entrega es la del movimiento al insertarla: monto, turno,
--      local, operador e instante, y la clase según el vínculo estructural
--      (trigger antes de insertar, con el movimiento tomado FOR SHARE);
--   4. una entrega en a lo sumo UNA verificación vigente (índice único parcial
--      sobre `vigente`, que es copia del padre por FK compuesta con ON UPDATE
--      CASCADE: no puede divergir del padre);
--   5. una verificación no mezcla locales (FK compuesta verificación + local);
--   6. nada se edita salvo la anulación, ANULADA es final, y nada se borra
--      (triggers).

-- CreateEnum
CREATE TYPE "EstadoVerificacionEfectivo" AS ENUM ('VIGENTE', 'ANULADA');

-- CreateEnum
CREATE TYPE "ClaseEntregaEfectivo" AS ENUM ('RECAUDACION', 'CIERRE');

-- CreateTable
CREATE TABLE "VerificacionEfectivo" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "importeDeclarado" DECIMAL(12,2) NOT NULL,
    "importeVerificado" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoVerificacionEfectivo" NOT NULL DEFAULT 'VIGENTE',
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "verificadaPorUsuarioId" INTEGER NOT NULL,
    "verificadaPorOperadorId" INTEGER,
    "verificadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorUsuarioId" INTEGER,
    "motivoAnulacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificacionEfectivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificacionEfectivoEntrega" (
    "id" SERIAL NOT NULL,
    "verificacionEfectivoId" INTEGER NOT NULL,
    "cajaMovimientoId" INTEGER NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "montoDeclaradoSnapshot" DECIMAL(12,2) NOT NULL,
    "localIdSnapshot" INTEGER NOT NULL,
    "turnoIdSnapshot" INTEGER NOT NULL,
    "operadorIdSnapshot" INTEGER,
    "claseSnapshot" "ClaseEntregaEfectivo" NOT NULL,
    "instanteEntregaSnapshot" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificacionEfectivoEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificacionEfectivo_localId_verificadaEn_idx" ON "VerificacionEfectivo"("localId", "verificadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "VerificacionEfectivo_localId_idempotencyKey_key" ON "VerificacionEfectivo"("localId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "VerificacionEfectivo_id_vigente_key" ON "VerificacionEfectivo"("id", "vigente");

-- CreateIndex
CREATE UNIQUE INDEX "VerificacionEfectivo_id_localId_key" ON "VerificacionEfectivo"("id", "localId");

-- CreateIndex
CREATE INDEX "VerificacionEfectivoEntrega_cajaMovimientoId_idx" ON "VerificacionEfectivoEntrega"("cajaMovimientoId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificacionEfectivoEntrega_verificacionEfectivoId_cajaMovi_key" ON "VerificacionEfectivoEntrega"("verificacionEfectivoId", "cajaMovimientoId");

-- AddForeignKey
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_verificadaPorUsuarioId_fkey" FOREIGN KEY ("verificadaPorUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_anuladaPorUsuarioId_fkey" FOREIGN KEY ("anuladaPorUsuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- La vigencia del hijo ES la del padre: anular el padre la baja en cascada, y un
-- hijo no puede declarar otra.
ALTER TABLE "VerificacionEfectivoEntrega" ADD CONSTRAINT "VerificacionEfectivoEntrega_verificacionEfectivoId_vigente_fkey" FOREIGN KEY ("verificacionEfectivoId", "vigente") REFERENCES "VerificacionEfectivo"("id", "vigente") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- El local de la foto ES el de la verificación: no se mezclan locales.
ALTER TABLE "VerificacionEfectivoEntrega" ADD CONSTRAINT "VerificacionEfectivoEntrega_verificacionEfectivoId_localId_fkey" FOREIGN KEY ("verificacionEfectivoId", "localIdSnapshot") REFERENCES "VerificacionEfectivo"("id", "localId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
-- RESTRICT: ninguna ruta borra movimientos de caja, y si alguien lo intentara la
-- base lo frena antes de dejar una verificación apuntando a la nada.
ALTER TABLE "VerificacionEfectivoEntrega" ADD CONSTRAINT "VerificacionEfectivoEntrega_cajaMovimientoId_fkey" FOREIGN KEY ("cajaMovimientoId") REFERENCES "CajaMovimiento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE PRISMA NO EXPRESA
-- ═══════════════════════════════════════════════════════════════════════════

-- 1 · La diferencia no puede divergir, y los importes tienen sentido.
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_diferencia_exacta"
  CHECK ("diferencia" = "importeVerificado" - "importeDeclarado");
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_importes_validos"
  CHECK ("importeDeclarado" > 0 AND "importeVerificado" >= 0);
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_clave_no_vacia"
  CHECK (btrim("idempotencyKey") <> '');
ALTER TABLE "VerificacionEfectivoEntrega" ADD CONSTRAINT "VerificacionEfectivoEntrega_monto_positivo"
  CHECK ("montoDeclaradoSnapshot" > 0);

-- `vigente` es el estado, y la anulación viene completa o no viene.
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_vigente_es_estado"
  CHECK ("vigente" = ("estado" = 'VIGENTE'));
ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_anulacion_completa" CHECK (
  ("estado" = 'VIGENTE' AND "anuladaEn" IS NULL AND "anuladaPorUsuarioId" IS NULL AND "motivoAnulacion" IS NULL)
  OR
  ("estado" = 'ANULADA' AND "anuladaEn" IS NOT NULL AND "anuladaPorUsuarioId" IS NOT NULL
     AND "motivoAnulacion" IS NOT NULL AND btrim("motivoAnulacion") <> '')
);

-- 4 · Una entrega en a lo sumo UNA verificación vigente. Las anuladas no cuentan:
-- la misma entrega puede volver a verificarse después de anular.
CREATE UNIQUE INDEX "VerificacionEfectivoEntrega_una_vigente_por_movimiento"
  ON "VerificacionEfectivoEntrega"("cajaMovimientoId") WHERE "vigente";

-- 3 · La foto es la del movimiento real, y la clase la de su vínculo.
--
-- El movimiento se toma FOR SHARE: una corrección que lo esté reescribiendo
-- termina antes, y una que llegue después espera a que esta verificación
-- confirme. La clase se decide como `clasificarMovimientos`: CIERRE si un turno
-- lo declara su retiro de cierre; RECAUDACION si un arqueo lo referencia y no es
-- de cierre. Nunca por el texto del motivo.
CREATE FUNCTION "verificacion_entrega_foto_fiel"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mov RECORD;
  tur RECORD;
  es_cierre BOOLEAN;
  es_recaudacion BOOLEAN;
BEGIN
  IF NOT NEW."vigente" THEN
    RAISE EXCEPTION 'Una entrega se agrega a una verificación vigente, nunca a una anulada (movimiento %)', NEW."cajaMovimientoId"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT "id", "turnoId", "tipo", "monto", "createdAt" INTO mov
    FROM "CajaMovimiento" WHERE "id" = NEW."cajaMovimientoId" FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento de caja % no existe', NEW."cajaMovimientoId" USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT "id", "localId", "operadorId" INTO tur FROM "Turno" WHERE "id" = mov."turnoId";

  IF mov."tipo" <> 'RETIRO' THEN
    RAISE EXCEPTION 'El movimiento % no es un retiro: no es una entrega de efectivo', mov."id" USING ERRCODE = 'check_violation';
  END IF;

  es_cierre := EXISTS (SELECT 1 FROM "Turno" WHERE "retiroCierreMovimientoId" = mov."id");
  es_recaudacion := NOT es_cierre AND EXISTS (SELECT 1 FROM "ArqueoCaja" WHERE "cajaMovimientoRetiroId" = mov."id");
  IF NOT (es_cierre OR es_recaudacion) THEN
    RAISE EXCEPTION 'El movimiento % no es una entrega: no es retiro de cierre ni de recaudación', mov."id" USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW."claseSnapshot" = 'CIERRE') <> es_cierre THEN
    RAISE EXCEPTION 'La clase de la foto (%) no es la del vínculo del movimiento %', NEW."claseSnapshot", mov."id" USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."montoDeclaradoSnapshot" <> mov."monto"
     OR NEW."turnoIdSnapshot" <> mov."turnoId"
     OR NEW."localIdSnapshot" <> tur."localId"
     OR NEW."operadorIdSnapshot" IS DISTINCT FROM tur."operadorId"
     OR NEW."instanteEntregaSnapshot" <> mov."createdAt" THEN
    RAISE EXCEPTION 'La foto de la entrega % no coincide con el movimiento real', mov."id" USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "VerificacionEfectivoEntrega_foto_fiel" BEFORE INSERT ON "VerificacionEfectivoEntrega"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_entrega_foto_fiel"();

-- 2 · El declarado es la suma de las fotos, y hay al menos una. Se comprueba al
-- COMMIT (diferido), cuando el padre y sus entregas ya están todos escritos.
CREATE FUNCTION "verificacion_declarado_es_la_suma"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  vid INTEGER;
  declarado NUMERIC;
  suma NUMERIC;
  cuantas INTEGER;
BEGIN
  -- Un IF y no un CASE: plpgsql prepara la expresión entera, y en la fila del
  -- padre no existe "verificacionEfectivoId". Cada rama se prepara al correr.
  IF TG_TABLE_NAME = 'VerificacionEfectivo' THEN
    vid := NEW."id";
  ELSE
    vid := NEW."verificacionEfectivoId";
  END IF;
  SELECT "importeDeclarado" INTO declarado FROM "VerificacionEfectivo" WHERE "id" = vid;
  SELECT COALESCE(SUM("montoDeclaradoSnapshot"), 0), COUNT(*) INTO suma, cuantas
    FROM "VerificacionEfectivoEntrega" WHERE "verificacionEfectivoId" = vid;
  IF cuantas = 0 THEN
    RAISE EXCEPTION 'La verificación % no cubre ninguna entrega', vid USING ERRCODE = 'check_violation';
  END IF;
  IF suma <> declarado THEN
    RAISE EXCEPTION 'El declarado de la verificación % (%) no es la suma de sus entregas (%)', vid, declarado, suma
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "VerificacionEfectivo_declarado_es_la_suma" AFTER INSERT ON "VerificacionEfectivo"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "verificacion_declarado_es_la_suma"();
CREATE CONSTRAINT TRIGGER "VerificacionEfectivoEntrega_declarado_es_la_suma" AFTER INSERT ON "VerificacionEfectivoEntrega"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "verificacion_declarado_es_la_suma"();

-- 6 · Nada se edita salvo la anulación, y ANULADA es final.
CREATE FUNCTION "verificacion_solo_se_anula"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.*) IS NOT DISTINCT FROM ROW(OLD.*) THEN
    RETURN NEW;
  END IF;
  IF OLD."estado" <> 'VIGENTE' OR NEW."estado" <> 'ANULADA' THEN
    RAISE EXCEPTION 'Una verificación de efectivo no se edita: solo se anula, una vez (verificación %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."localId" <> OLD."localId"
     OR NEW."importeDeclarado" <> OLD."importeDeclarado"
     OR NEW."importeVerificado" <> OLD."importeVerificado"
     OR NEW."diferencia" <> OLD."diferencia"
     OR NEW."verificadaPorUsuarioId" <> OLD."verificadaPorUsuarioId"
     OR NEW."verificadaPorOperadorId" IS DISTINCT FROM OLD."verificadaPorOperadorId"
     OR NEW."verificadaEn" <> OLD."verificadaEn"
     OR NEW."observacion" IS DISTINCT FROM OLD."observacion"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Anular una verificación no cambia lo que se verificó (verificación %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "VerificacionEfectivo_solo_se_anula" BEFORE UPDATE ON "VerificacionEfectivo"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_solo_se_anula"();

-- La foto no se edita. Lo único que cambia es `vigente`, de true a false, y lo
-- cambia la cascada de la anulación del padre.
CREATE FUNCTION "verificacion_entrega_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" <> OLD."id"
     OR NEW."verificacionEfectivoId" <> OLD."verificacionEfectivoId"
     OR NEW."cajaMovimientoId" <> OLD."cajaMovimientoId"
     OR NEW."montoDeclaradoSnapshot" <> OLD."montoDeclaradoSnapshot"
     OR NEW."localIdSnapshot" <> OLD."localIdSnapshot"
     OR NEW."turnoIdSnapshot" <> OLD."turnoIdSnapshot"
     OR NEW."operadorIdSnapshot" IS DISTINCT FROM OLD."operadorIdSnapshot"
     OR NEW."claseSnapshot" <> OLD."claseSnapshot"
     OR NEW."instanteEntregaSnapshot" <> OLD."instanteEntregaSnapshot"
     OR (NEW."vigente" AND NOT OLD."vigente") THEN
    RAISE EXCEPTION 'La foto de una entrega verificada no se edita (entrega %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "VerificacionEfectivoEntrega_inmutable" BEFORE UPDATE ON "VerificacionEfectivoEntrega"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_entrega_inmutable"();

-- Nada se borra: una verificación, vigente o anulada, es historia.
CREATE FUNCTION "verificacion_efectivo_no_se_borra"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Una verificación de efectivo y sus entregas no se borran: se anulan (%, fila %)', TG_TABLE_NAME, OLD."id"
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "VerificacionEfectivo_no_se_borra" BEFORE DELETE ON "VerificacionEfectivo"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_efectivo_no_se_borra"();
CREATE TRIGGER "VerificacionEfectivoEntrega_no_se_borra" BEFORE DELETE ON "VerificacionEfectivoEntrega"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_efectivo_no_se_borra"();
