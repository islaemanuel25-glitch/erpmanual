-- Reshape de AuditoriaBitacora: una fila por acción de negocio, cambios legibles.
-- La tabla está vacía en dev (feature sin mergear), el drop de columnas es seguro.

-- DropColumn
ALTER TABLE "AuditoriaBitacora" DROP COLUMN "metodo";
ALTER TABLE "AuditoriaBitacora" DROP COLUMN "antes";
ALTER TABLE "AuditoriaBitacora" DROP COLUMN "despues";

-- AddColumn
ALTER TABLE "AuditoriaBitacora" ADD COLUMN "entidadNombre" TEXT;
ALTER TABLE "AuditoriaBitacora" ADD COLUMN "cambios" JSONB;
