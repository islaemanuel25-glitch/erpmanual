-- DELEGACIÓN DE INTEGRACIÓN: el canje del código de un vínculo por un token de
-- máquina. Ver DEC-0013 y lib/integraciones/vinculos/canje.js.
--
-- Una tabla NUEVA, vacía. Aditiva: no altera "VinculoIntegracion" (ni sus
-- columnas, ni sus CHECK, ni su trigger), no escribe datos y no rellena nada.
-- El código de canje sigue guardado donde ya estaba —"VinculoIntegracion"."codigoHash",
-- único e inmutable—; lo que cambia es para qué sirve, y eso es código.
--
-- Agregar la FK toma un candado SHARE ROW EXCLUSIVE sobre "VinculoIntegracion"
-- por un instante: frena autorizar y revocar vínculos, nada más. ON DELETE
-- RESTRICT por la misma razón que el vínculo: nada se borra, se revoca.
--
-- Lo que Prisma no sabe expresar va al final, a mano: el CHECK del hash y dos
-- triggers.

-- CreateTable
CREATE TABLE "DelegacionIntegracion" (
    "id" SERIAL NOT NULL,
    "vinculoId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "canjeadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegacionIntegracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DelegacionIntegracion_vinculoId_key" ON "DelegacionIntegracion"("vinculoId");

-- CreateIndex
CREATE UNIQUE INDEX "DelegacionIntegracion_tokenHash_key" ON "DelegacionIntegracion"("tokenHash");

-- AddForeignKey
ALTER TABLE "DelegacionIntegracion" ADD CONSTRAINT "DelegacionIntegracion_vinculoId_fkey" FOREIGN KEY ("vinculoId") REFERENCES "VinculoIntegracion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── A mano ──────────────────────────────────────────────────────────────────

-- El token en claro no entra: solo un SHA-256 en hex.
ALTER TABLE "DelegacionIntegracion" ADD CONSTRAINT "DelegacionIntegracion_tokenHash_check"
  CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

-- EL CANJE, DECIDIDO POR LA BASE. La aplicación ya mira lo mismo antes de
-- insertar; esto es lo que vale aunque dos canjes, o un canje y una
-- revocación, corran a la vez:
--
--   · FOR SHARE sobre el vínculo: una revocación concurrente (un UPDATE) espera
--     a que este canje termine, o este canje espera a que ella termine y la ve.
--     No queda una delegación nacida de un vínculo que ya estaba revocado.
--   · Revocado: no se canjea.
--   · Autorizado hace más de 10 minutos: no se canjea. El reloj es el de la
--     base, en UTC, igual que como Prisma guarda "autorizadoEn". El número es
--     VIDA_CODIGO_CANJE_MS de lib/integraciones/vinculos/codigoVinculo.js, y un
--     candado comprueba que los dos digan lo mismo.
--   · "canjeadoEn" lo pone la base: no se puede fechar un canje hacia atrás.
--
-- Un segundo canje del mismo código no llega acá con éxito: lo frena el índice
-- único de "vinculoId", también si los dos corren al mismo tiempo.
CREATE FUNCTION "delegacion_integracion_canje_valido"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v RECORD;
  ahora TIMESTAMP(3) := (now() AT TIME ZONE 'UTC');
BEGIN
  SELECT "revocadoEn", "autorizadoEn" INTO v
    FROM "VinculoIntegracion" WHERE "id" = NEW."vinculoId"
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Una delegación necesita un vínculo existente (vínculo %)', NEW."vinculoId"
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v."revocadoEn" IS NOT NULL THEN
    RAISE EXCEPTION 'No se canjea el código de un vínculo revocado (vínculo %)', NEW."vinculoId"
      USING ERRCODE = 'check_violation';
  END IF;
  IF ahora > v."autorizadoEn" + interval '10 minutes' THEN
    RAISE EXCEPTION 'El código de canje venció (vínculo %)', NEW."vinculoId"
      USING ERRCODE = 'check_violation';
  END IF;
  NEW."canjeadoEn" := ahora;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "DelegacionIntegracion_canje_valido" BEFORE INSERT ON "DelegacionIntegracion"
  FOR EACH ROW EXECUTE FUNCTION "delegacion_integracion_canje_valido"();

-- Una delegación no se edita ni se borra. Se invalida revocando su vínculo, y
-- queda la historia de qué se canjeó y cuándo.
CREATE FUNCTION "delegacion_integracion_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Una delegación de integración no se edita ni se borra: se revoca su vínculo (delegación %)', OLD."id"
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER "DelegacionIntegracion_inmutable" BEFORE UPDATE OR DELETE ON "DelegacionIntegracion"
  FOR EACH ROW EXECUTE FUNCTION "delegacion_integracion_inmutable"();
