-- CUANDO LA LECTURA DE TODOS LOS DÍAS NO ALCANZA, ENTRA EL MODELO GRANDE.
--
-- Dos cosas nuevas, las dos sin datos que mover:
--
-- 1. `LlamadaLector.escalada`: por cuál de los tres casos se llamó al modelo
--    grande —faltan renglones, no cierra, el proveedor no tiene receta—. Las
--    llamadas de todos los días quedan en null. Es lo que deja contar las del
--    modelo grande aparte, con su hora y su motivo.
--
-- 2. `RecetaPropuestaProveedor`: la receta que propuso el modelo grande y con
--    la que la cuenta del papel cerró, esperando que alguien la confirme. NO va
--    en `RecetaProveedor` porque la existencia de esa fila es el hecho "este
--    proveedor tiene receta confirmada", y nadie la confirmó todavía.
--
-- Columna nueva nullable y tabla nueva vacía: no reescribe ninguna fila.

-- AlterTable
ALTER TABLE "LlamadaLector" ADD COLUMN     "escalada" TEXT;

-- CreateTable
CREATE TABLE "RecetaPropuestaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "respuestas" JSONB NOT NULL,
    "lectura" JSONB NOT NULL,
    "comprobanteId" INTEGER,
    "modelo" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecetaPropuestaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecetaPropuestaProveedor_proveedorId_idx" ON "RecetaPropuestaProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaPropuestaProveedor_grupoId_proveedorId_key" ON "RecetaPropuestaProveedor"("grupoId", "proveedorId");

-- AddForeignKey
ALTER TABLE "RecetaPropuestaProveedor" ADD CONSTRAINT "RecetaPropuestaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
