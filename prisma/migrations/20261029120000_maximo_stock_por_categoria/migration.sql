-- EL STOCK MÁXIMO REALISTA DE CADA CATEGORÍA, POR UBICACIÓN.
--
-- Regla de Emanuel (2026-10-29): cada local y el depósito, por separado,
-- dicen cuánto es lo máximo realista de una categoría —Fiambres 15 kg, Masitas
-- 50 un—. Lo que el sistema tenga por encima aparece en el filtro "Stock alto"
-- del Control de stock. Una categoría sin fila no se revisa.
--
-- ADITIVA: una tabla nueva, vacía. Nada la lee hasta que alguien guarda un
-- máximo, y la versión que está atendiendo no la conoce.

-- CreateTable
CREATE TABLE "MaximoStockCategoria" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "maximo" DECIMAL(12,3) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaximoStockCategoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaximoStockCategoria_localId_categoriaId_key" ON "MaximoStockCategoria"("localId", "categoriaId");

-- AddForeignKey
ALTER TABLE "MaximoStockCategoria" ADD CONSTRAINT "MaximoStockCategoria_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaximoStockCategoria" ADD CONSTRAINT "MaximoStockCategoria_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "Categoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
