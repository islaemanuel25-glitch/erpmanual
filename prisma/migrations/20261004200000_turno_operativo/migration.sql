-- TURNO OPERATIVO: Tesorería verifica el efectivo POR TURNO, no por día.
--
-- La operación real es: un turno operativo del local → sus cajas
-- → sus entregas → se cuenta → se verifica ESE turno. Hasta acá Tesorería
-- agrupaba por día calendario del hecho (`PROVISORIO_DIA_OPERATIVO`) y dejaba
-- verificar juntas cajas de dos turnos. El ERP no tenía el dato: ningún modelo
-- decía de qué turno era una caja, y la hora no alcanza para deducirlo.
--
-- Esta migración agrega el dato, y nada más:
--
--   · `TurnoOperativo`: el CATÁLOGO de turnos de cada local —nombre, orden,
--     activo y una ventana de reconocimiento opcional, "HH:MM" → "HH:MM", que
--     puede cruzar la medianoche—. La ventana NO es la duración del turno: la
--     apertura la usa para proponer el turno, y quien abre confirma o cambia.
--     Cada local da de alta los suyos; esta migración no siembra ninguno.
--   · `Turno.turnoOperativoId` + `Turno.fechaOperativa`: la caja (el modelo
--     `Turno` sigue siendo UNA caja) recibe el turno FINAL elegido al abrirse,
--     y su fecha operativa —la de la jornada de ese turno— la fija el servidor
--     en ese momento.
--   · `VerificacionEfectivo.turnoOperativoId` + `fechaOperativa`: qué turno se
--     verificó, congelado al verificar.
--
-- LAS REGLAS LAS SOSTIENE LA BASE, como en la verificación:
--
--   1. Turno y fecha van juntos o ninguno (CHECK, en las dos tablas).
--   2. La caja y la verificación solo apuntan a un turno de SU local: FK
--      compuesta (turnoOperativoId, localId) → TurnoOperativo(id, localId).
--      Con turnoOperativoId NULL la FK no aplica (MATCH SIMPLE): las cajas y
--      verificaciones viejas quedan como están.
--   3. El turno y la fecha de una caja NO CAMBIAN una vez escritos —ni de NULL
--      a un valor—: un trigger lo impide. Así no hay backfill posible por
--      error, y una verificación no puede quedar apuntando a un turno que la
--      caja ya no tiene.
--   4. Cada entrega de una verificación es de una caja de ESE turno y ESA fecha
--      operativa —o, en una verificación sin turno, de una caja sin turno—: un
--      trigger al insertar la entrega. Dos turnos no se verifican juntos.
--   5. Anular una verificación no cambia el turno que se verificó: se extiende
--      `verificacion_solo_se_anula` con las dos columnas nuevas.
--
-- NO ESCRIBE NINGÚN DATO. No crea turnos en ningún local, no asigna turno a
-- ninguna caja vieja y no toca ninguna verificación existente: todo lo
-- anterior queda en NULL, que significa "anterior al turno operativo", y
-- Tesorería lo muestra como "Sin turno asignado". No se infiere por la hora.
--
-- ── QUÉ HACE `migrate deploy` EN PRODUCCIÓN ────────────────────────────────
--
-- Crea la tabla vacía `TurnoOperativo` con sus índices y su FK a `Local`.
-- Agrega dos columnas NULL, sin default, a `Turno` y a `VerificacionEfectivo`
-- (cambio de catálogo, no reescribe filas), sus índices, sus FK compuestas y
-- sus CHECK —que recorren las filas existentes y las encuentran todas en
-- NULL—, y los triggers. `Turno` es una tabla caliente: lo que la toca va en UN
-- bloque DO con tope de espera de 3 s y el candado tomado primero, igual que
-- `20261002120000_caja_por_operador`. Si hay una transacción larga sobre
-- `Turno`, falla rápido y la base queda como estaba.
--
-- DESPUÉS DE MIGRAR, cada local necesita al menos un turno activo en su
-- catálogo para que se pueda ABRIR caja: las tres rutas de apertura lo exigen.
-- Las cajas ya abiertas siguen operando y cerrando sin cambio. Ver
-- docs/deploy/MIGRACIONES-SIN-APLICAR.md.

-- ── 1 · El catálogo ─────────────────────────────────────────────────────────

CREATE TABLE "TurnoOperativo" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "horaInicioReconocimiento" TEXT,
    "horaFinReconocimiento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TurnoOperativo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TurnoOperativo_nombre_no_vacio_chk" CHECK (btrim("nombre") <> ''),
    -- La ventana: las dos horas o ninguna, "HH:MM" de 00:00 a 23:59, distintas.
    -- Solo integridad: dos turnos con ventanas solapadas se aceptan (al abrir,
    -- la ambigüedad se pregunta).
    CONSTRAINT "TurnoOperativo_ventana_completa_chk" CHECK (
      ("horaInicioReconocimiento" IS NULL) = ("horaFinReconocimiento" IS NULL)
    ),
    CONSTRAINT "TurnoOperativo_ventana_formato_chk" CHECK (
      "horaInicioReconocimiento" IS NULL OR (
        "horaInicioReconocimiento" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "horaFinReconocimiento" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        AND "horaInicioReconocimiento" <> "horaFinReconocimiento"
      )
    )
);

CREATE INDEX "TurnoOperativo_localId_activo_orden_idx" ON "TurnoOperativo"("localId", "activo", "orden");
CREATE UNIQUE INDEX "TurnoOperativo_localId_nombre_key" ON "TurnoOperativo"("localId", "nombre");
CREATE UNIQUE INDEX "TurnoOperativo_id_localId_key" ON "TurnoOperativo"("id", "localId");

-- ON DELETE CASCADE como `ConfiguracionLocal`: es configuración del local. No
-- borra historia: una caja o una verificación que apunten a un turno frenan el
-- borrado por su propia FK (RESTRICT).
ALTER TABLE "TurnoOperativo" ADD CONSTRAINT "TurnoOperativo_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un turno del catálogo no se borra desde la aplicación: se desactiva.

-- ── 2 · La caja y la verificación, en un solo bloque con tope de espera ─────

DO $turno_operativo$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  -- Primero el candado más fuerte que se va a pedir, para no escalar a mitad
  -- de camino. Frena `Turno` solo mientras se agregan dos columnas NULL, dos
  -- índices sobre una tabla chica y una FK y un CHECK que leen columnas vacías.
  LOCK TABLE "Turno" IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE "VerificacionEfectivo" IN ACCESS EXCLUSIVE MODE;

  ALTER TABLE "Turno" ADD COLUMN "fechaOperativa" DATE,
    ADD COLUMN "turnoOperativoId" INTEGER;
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_turno_operativo_completo_chk"
    CHECK (("turnoOperativoId" IS NULL) = ("fechaOperativa" IS NULL));
  CREATE INDEX "Turno_localId_fechaOperativa_idx" ON "Turno"("localId", "fechaOperativa");
  CREATE INDEX "Turno_turnoOperativoId_idx" ON "Turno"("turnoOperativoId");
  ALTER TABLE "Turno" ADD CONSTRAINT "Turno_turnoOperativoId_localId_fkey"
    FOREIGN KEY ("turnoOperativoId", "localId") REFERENCES "TurnoOperativo"("id", "localId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

  ALTER TABLE "VerificacionEfectivo" ADD COLUMN "fechaOperativa" DATE,
    ADD COLUMN "turnoOperativoId" INTEGER;
  ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_turno_operativo_completo_chk"
    CHECK (("turnoOperativoId" IS NULL) = ("fechaOperativa" IS NULL));
  CREATE INDEX "VerificacionEfectivo_turnoOperativoId_fechaOperativa_idx"
    ON "VerificacionEfectivo"("turnoOperativoId", "fechaOperativa");
  ALTER TABLE "VerificacionEfectivo" ADD CONSTRAINT "VerificacionEfectivo_turnoOperativoId_localId_fkey"
    FOREIGN KEY ("turnoOperativoId", "localId") REFERENCES "TurnoOperativo"("id", "localId")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
END
$turno_operativo$;

-- ── 3 · El turno de una caja no cambia una vez escrito ──────────────────────
--
-- Ni por la hora, ni por cruzar la medianoche, ni por un backfill: la caja lo
-- recibe al abrirse y lo conserva. Solo se dispara si el UPDATE nombra una de
-- las dos columnas, así que las escrituras de siempre sobre `Turno` —ventas,
-- retiros, cierre— no pagan nada.
CREATE FUNCTION "turno_operativo_de_caja_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."turnoOperativoId" IS DISTINCT FROM OLD."turnoOperativoId"
     OR NEW."fechaOperativa" IS DISTINCT FROM OLD."fechaOperativa" THEN
    RAISE EXCEPTION 'El turno operativo y la fecha operativa de una caja se fijan al abrirla y no cambian (caja %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Turno_turno_operativo_inmutable" BEFORE UPDATE OF "turnoOperativoId", "fechaOperativa" ON "Turno"
  FOR EACH ROW EXECUTE FUNCTION "turno_operativo_de_caja_inmutable"();

-- ── 4 · Cada entrega es de una caja del turno que se verifica ───────────────
--
-- Se compara con la caja REAL del movimiento, no con la foto: la foto ya la
-- controla `verificacion_entrega_foto_fiel`. Una verificación sin turno solo
-- acepta cajas sin turno; una con turno, solo cajas de ese turno y esa fecha.
CREATE FUNCTION "verificacion_entrega_del_turno_operativo"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  padre RECORD;
  caja RECORD;
BEGIN
  SELECT "turnoOperativoId", "fechaOperativa" INTO padre
    FROM "VerificacionEfectivo" WHERE "id" = NEW."verificacionEfectivoId";
  SELECT t."id", t."turnoOperativoId", t."fechaOperativa" INTO caja
    FROM "CajaMovimiento" m JOIN "Turno" t ON t."id" = m."turnoId"
   WHERE m."id" = NEW."cajaMovimientoId";
  IF caja."turnoOperativoId" IS DISTINCT FROM padre."turnoOperativoId"
     OR caja."fechaOperativa" IS DISTINCT FROM padre."fechaOperativa" THEN
    RAISE EXCEPTION 'La entrega % es de la caja %, de otro turno operativo o de otra fecha operativa que la verificación %',
      NEW."cajaMovimientoId", caja."id", NEW."verificacionEfectivoId"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "VerificacionEfectivoEntrega_turno_operativo" BEFORE INSERT ON "VerificacionEfectivoEntrega"
  FOR EACH ROW EXECUTE FUNCTION "verificacion_entrega_del_turno_operativo"();

-- ── 5 · Anular no cambia el turno que se verificó ───────────────────────────
--
-- La misma función de `20261004120000_verificacion_efectivo`, con las dos
-- columnas nuevas en la lista de lo que la anulación no puede tocar. Se
-- reemplaza acá —esa migración ya está aplicada y no se edita—.
CREATE OR REPLACE FUNCTION "verificacion_solo_se_anula"() RETURNS trigger
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
     OR NEW."createdAt" <> OLD."createdAt"
     OR NEW."turnoOperativoId" IS DISTINCT FROM OLD."turnoOperativoId"
     OR NEW."fechaOperativa" IS DISTINCT FROM OLD."fechaOperativa" THEN
    RAISE EXCEPTION 'Anular una verificación no cambia lo que se verificó (verificación %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
