-- VÍNCULOS DE INTEGRACIÓN: una persona autoriza a una aplicación externa
-- (Azul Chat) a consultar el ERP en su nombre. Ver DEC-0013 y
-- lib/integraciones/vinculos/.
--
-- Una tabla NUEVA, vacía, con su enum. Aditiva: no altera ninguna tabla
-- existente, no escribe datos y no rellena nada.
--
-- CON CLAVES FORÁNEAS a "Usuario", a diferencia de CobroOffline: acá los dos ids
-- son de personas del ERP —la que autorizó y la que revocó—, nunca declarados
-- por un navegador, y la integridad es la razón de ser de la tabla. Agregar la
-- FK toma un candado SHARE ROW EXCLUSIVE sobre "Usuario" por un instante: frena
-- escrituras sobre usuarios (altas, ediciones), no lecturas ni el login. ON
-- DELETE RESTRICT porque la aplicación nunca borra usuarios —los da de baja con
-- `activo = false`— y un borrado no puede llevarse la historia de quién
-- autorizó qué.
--
-- Lo que Prisma no sabe expresar va al final, a mano: el índice único PARCIAL,
-- dos CHECK y el trigger que hace que un vínculo solo se revoque.

-- CreateEnum
CREATE TYPE "AplicacionIntegracion" AS ENUM ('AZUL_CHAT');

-- CreateTable
CREATE TABLE "VinculoIntegracion" (
    "id" SERIAL NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "aplicacion" "AplicacionIntegracion" NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "autorizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoEn" TIMESTAMP(3),
    "revocadoPorId" INTEGER,

    CONSTRAINT "VinculoIntegracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VinculoIntegracion_codigoHash_key" ON "VinculoIntegracion"("codigoHash");

-- CreateIndex
CREATE INDEX "VinculoIntegracion_usuarioId_aplicacion_idx" ON "VinculoIntegracion"("usuarioId", "aplicacion");

-- CreateIndex
CREATE INDEX "VinculoIntegracion_revocadoPorId_idx" ON "VinculoIntegracion"("revocadoPorId");

-- AddForeignKey
ALTER TABLE "VinculoIntegracion" ADD CONSTRAINT "VinculoIntegracion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VinculoIntegracion" ADD CONSTRAINT "VinculoIntegracion_revocadoPorId_fkey" FOREIGN KEY ("revocadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- A MANO: lo que schema.prisma no puede declarar.
-- ═══════════════════════════════════════════════════════════════════════════

-- UN SOLO VÍNCULO VIGENTE por usuario y aplicación. Volver a autorizar revoca el
-- anterior y crea otro en la misma transacción; dos autorizaciones simultáneas
-- no pueden dejar dos vigentes.
CREATE UNIQUE INDEX "VinculoIntegracion_vigente_key" ON "VinculoIntegracion"("usuarioId", "aplicacion")
  WHERE "revocadoEn" IS NULL;

-- Lo que se guarda del código es su SHA-256 en hex, y nada más. Un valor con
-- otra forma sería, casi seguro, el código en claro.
ALTER TABLE "VinculoIntegracion" ADD CONSTRAINT "VinculoIntegracion_codigoHash_check"
  CHECK ("codigoHash" ~ '^[0-9a-f]{64}$');

-- Revocado = cuándo Y quién, los dos o ninguno; y no antes de autorizar.
ALTER TABLE "VinculoIntegracion" ADD CONSTRAINT "VinculoIntegracion_revocacion_check"
  CHECK (
    ("revocadoEn" IS NULL) = ("revocadoPorId" IS NULL)
    AND ("revocadoEn" IS NULL OR "revocadoEn" >= "autorizadoEn")
  );

-- UN VÍNCULO NO SE EDITA NI SE BORRA: SE REVOCA, UNA VEZ. Lo único que puede
-- cambiar es "revocadoEn"/"revocadoPorId", de NULL a un valor. Revocar es el
-- rollback lógico; la historia de quién autorizó y quién cortó queda entera.
CREATE FUNCTION "vinculo_integracion_solo_se_revoca"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un vínculo de integración no se borra: se revoca (vínculo %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF ROW(NEW.*) IS NOT DISTINCT FROM ROW(OLD.*) THEN
    RETURN NEW;
  END IF;
  IF OLD."revocadoEn" IS NOT NULL OR NEW."revocadoEn" IS NULL THEN
    RAISE EXCEPTION 'Un vínculo de integración solo se revoca, una vez (vínculo %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" <> OLD."id"
     OR NEW."usuarioId" <> OLD."usuarioId"
     OR NEW."aplicacion" <> OLD."aplicacion"
     OR NEW."codigoHash" <> OLD."codigoHash"
     OR NEW."autorizadoEn" <> OLD."autorizadoEn" THEN
    RAISE EXCEPTION 'Revocar un vínculo no cambia lo que se autorizó (vínculo %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "VinculoIntegracion_solo_se_revoca" BEFORE UPDATE OR DELETE ON "VinculoIntegracion"
  FOR EACH ROW EXECUTE FUNCTION "vinculo_integracion_solo_se_revoca"();
