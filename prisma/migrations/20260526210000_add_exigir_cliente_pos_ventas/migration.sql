-- AlterTable
ALTER TABLE "ConfiguracionGrupo"
ADD COLUMN "exigirClienteVentasDeposito" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exigirClienteVentasLocal" BOOLEAN NOT NULL DEFAULT false;
