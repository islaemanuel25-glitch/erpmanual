-- GASTOS: el gasto de una ubicación, sus pagos y el catálogo de categorías.
--
-- ADITIVA. Tres tablas nuevas, un enum nuevo, sus índices, claves foráneas y
-- CHECK, y las siete categorías iniciales. No toca ninguna columna ni fila
-- existente. En particular NO convierte ningún RETIRO de caja histórico en un
-- gasto: un retiro manual con motivo "luz" sigue siendo un retiro, porque nadie
-- registró que fuera un gasto y el sistema no lo va a inventar.
--
-- Los CHECK del final son la base diciendo lo que el código también dice, para
-- que un camino que se saltee `lib/finanzas/gastosServer.js` no pueda dejar un
-- gasto o un pago imposible. Son los mismos de `PagoProveedor`.

-- CreateEnum
CREATE TYPE "MedioPagoGasto" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'MERCADO_PAGO', 'OTRO');

-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "beneficiario" TEXT,
    "comprobanteNumero" TEXT,
    "comprobanteFecha" DATE,
    "vencimiento" DATE,
    "fechaPrevistaPago" DATE,
    "creadoPorId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoGasto" (
    "id" SERIAL NOT NULL,
    "gastoId" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medio" "MedioPagoGasto" NOT NULL,
    "localOrigenId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "turnoId" INTEGER,
    "cajaMovimientoId" INTEGER,
    "nota" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaGasto_nombre_key" ON "CategoriaGasto"("nombre");

-- CreateIndex
CREATE INDEX "Gasto_grupoId_idx" ON "Gasto"("grupoId");

-- CreateIndex
CREATE INDEX "Gasto_categoriaId_idx" ON "Gasto"("categoriaId");

-- CreateIndex
CREATE INDEX "Gasto_localId_fecha_idx" ON "Gasto"("localId", "fecha");

-- CreateIndex
-- El mismo intento de alta no crea dos gastos en la misma ubicación.
CREATE UNIQUE INDEX "Gasto_localId_idempotencyKey_key" ON "Gasto"("localId", "idempotencyKey");

-- CreateIndex
-- Un movimiento de caja es de a lo sumo un pago de gasto.
CREATE UNIQUE INDEX "PagoGasto_cajaMovimientoId_key" ON "PagoGasto"("cajaMovimientoId");

-- CreateIndex
CREATE INDEX "PagoGasto_localOrigenId_idx" ON "PagoGasto"("localOrigenId");

-- CreateIndex
CREATE INDEX "PagoGasto_turnoId_idx" ON "PagoGasto"("turnoId");

-- CreateIndex
-- El mismo intento de pago no puede entrar dos veces en el mismo gasto.
CREATE UNIQUE INDEX "PagoGasto_gastoId_idempotencyKey_key" ON "PagoGasto"("gastoId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_localOrigenId_fkey" FOREIGN KEY ("localOrigenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_cajaMovimientoId_fkey" FOREIGN KEY ("cajaMovimientoId") REFERENCES "CajaMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Importes positivos, y un gasto dice qué fue.
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_total_positivo" CHECK ("total" > 0);
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_concepto_no_vacio" CHECK (btrim("concepto") <> '');
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_monto_positivo" CHECK ("monto" > 0);

-- Efectivo ⇔ turno y movimiento de caja. Por el mismo CHECK, el `SET NULL` de
-- las dos claves foráneas de arriba no puede dejar un efectivo huérfano: borrar
-- el turno o el movimiento de un pago en efectivo falla en vez de desvincularlo.
ALTER TABLE "PagoGasto" ADD CONSTRAINT "PagoGasto_efectivo_con_caja" CHECK (
  ("medio" = 'EFECTIVO' AND "turnoId" IS NOT NULL AND "cajaMovimientoId" IS NOT NULL)
  OR ("medio" <> 'EFECTIVO' AND "turnoId" IS NULL AND "cajaMovimientoId" IS NULL)
);

-- Las categorías iniciales. Son filas de un catálogo nuevo, no un backfill de
-- datos existentes: la tabla nace con ellas. "Otros" va al final.
INSERT INTO "CategoriaGasto" ("nombre", "orden", "updatedAt") VALUES
  ('Servicios', 10, CURRENT_TIMESTAMP),
  ('Alquiler', 20, CURRENT_TIMESTAMP),
  ('Sueldos', 30, CURRENT_TIMESTAMP),
  ('Mantenimiento', 40, CURRENT_TIMESTAMP),
  ('Insumos y limpieza', 50, CURRENT_TIMESTAMP),
  ('Impuestos', 60, CURRENT_TIMESTAMP),
  ('Otros', 100, CURRENT_TIMESTAMP);
