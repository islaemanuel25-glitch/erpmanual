-- RETIRO DE DINERO — Etapa 1. Migración ADITIVA.
--
-- No toca ni una fila existente. Todas las columnas nuevas son NULL, y ese NULL
-- significa "esta operación no registraba retiros", no "se retiró cero": los
-- arqueos históricos fueron conteos puros y afirmar 0 sería inventar un dato.

-- CreateEnum
CREATE TYPE "EstadoEntregaRetiro" AS ENUM ('PENDIENTE_ENTREGA', 'ENTREGADO');

-- AlterTable: ArqueoCaja gana el circuito del retiro
ALTER TABLE "ArqueoCaja"
  ADD COLUMN "efectivoRetirado"       DECIMAL(12,2),
  ADD COLUMN "fondoObjetivo"          DECIMAL(12,2),
  ADD COLUMN "fondoDejado"            DECIMAL(12,2),
  ADD COLUMN "cajaMovimientoRetiroId" INTEGER,
  ADD COLUMN "estadoEntrega"          "EstadoEntregaRetiro",
  ADD COLUMN "destino"                TEXT,
  ADD COLUMN "recibidoPor"            TEXT,
  ADD COLUMN "entregadoAt"            TIMESTAMP(3),
  ADD COLUMN "entregadoPorId"         INTEGER,
  ADD COLUMN "observacionEntrega"     TEXT;

-- AlterTable: fondo objetivo por local. NULL = no configurado (cae a montoInicial).
ALTER TABLE "ConfiguracionLocal" ADD COLUMN "fondoObjetivoCaja" DECIMAL(12,2);

-- AlterTable: CajaMovimiento.monto de (10,2) a (12,2).
--
-- Era el único campo monetario del circuito en (10,2); Turno y ArqueoCaja usan
-- (12,2). El retiro automático copia acá un importe nacido en un campo (12,2),
-- así que un valor válido en el origen podía no entrar en el destino y abortar
-- la transacción entera. Ensanchar un `numeric` en Postgres no reescribe la
-- tabla ni puede perder datos: solo amplía el rango admitido.
ALTER TABLE "CajaMovimiento" ALTER COLUMN "monto" TYPE DECIMAL(12,2);

-- CreateIndex: 1:1 REAL. Dos retiros no pueden apuntar al mismo movimiento, así
-- que el doble descuento queda impedido por la base y no solo por el código.
CREATE UNIQUE INDEX "ArqueoCaja_cajaMovimientoRetiroId_key" ON "ArqueoCaja"("cajaMovimientoRetiroId");

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_cajaMovimientoRetiroId_fkey"
  FOREIGN KEY ("cajaMovimientoRetiroId") REFERENCES "CajaMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_entregadoPorId_fkey"
  FOREIGN KEY ("entregadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
