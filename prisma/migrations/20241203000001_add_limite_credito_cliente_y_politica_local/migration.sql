-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN "limiteCredito" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Local" ADD COLUMN "politicaLimiteCredito" TEXT NOT NULL DEFAULT 'ADVERTIR';

