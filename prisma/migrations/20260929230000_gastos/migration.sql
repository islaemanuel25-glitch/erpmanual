-- GASTOS: el gasto de una ubicación, sus pagos y el catálogo de categorías.
--
-- ADITIVA. Cuatro tablas nuevas, un enum nuevo, sus índices, claves foráneas y
-- CHECK, las siete categorías iniciales, y la exclusividad del movimiento de
-- caja entre los dos pagos —dos triggers sobre cada tabla de pagos, incluida
-- `PagoProveedor`, y la copia de sus vínculos a la tabla nueva—. No cambia
-- ninguna columna ni fila existente. En particular NO convierte ningún RETIRO de
-- caja histórico en un gasto: un retiro manual con motivo "luz" sigue siendo un
-- retiro, porque nadie registró que fuera un gasto y el sistema no lo va a
-- inventar.
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

-- ── UN MOVIMIENTO DE CAJA ES DE A LO SUMO UN PAGO, DE CUALQUIER TIPO ──────
--
-- `PagoProveedor_cajaMovimientoId_key` y `PagoGasto_cajaMovimientoId_key`
-- impiden dos pagos del mismo tipo sobre un retiro. No impiden uno de cada tipo:
-- son dos índices en dos tablas, y ninguno ve al otro. Esta tabla es el índice
-- común, y su clave primaria es el movimiento.
--
-- POR QUÉ UN ÍNDICE Y NO UN CHEQUEO. Un trigger que mire la otra tabla antes de
-- dejar pasar es "consulto y después inserto": dos transacciones concurrentes
-- miran a la vez, ninguna ve a la otra y las dos confirman. Con un bloqueo de la
-- fila del movimiento alcanza en READ COMMITTED, pero no en REPEATABLE READ,
-- donde la segunda sigue leyendo con la foto de antes. Un índice único no lee
-- con foto: la segunda inserción espera a que la primera termine y, si la
-- primera confirmó, falla. Vale en cualquier nivel de aislamiento.

-- CreateTable
CREATE TABLE "CajaMovimientoDePago" (
    "cajaMovimientoId" INTEGER NOT NULL,
    "pagoProveedorId" INTEGER,
    "pagoGastoId" INTEGER,

    CONSTRAINT "CajaMovimientoDePago_pkey" PRIMARY KEY ("cajaMovimientoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "CajaMovimientoDePago_pagoProveedorId_key" ON "CajaMovimientoDePago"("pagoProveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "CajaMovimientoDePago_pagoGastoId_key" ON "CajaMovimientoDePago"("pagoGastoId");

-- AddForeignKey
ALTER TABLE "CajaMovimientoDePago" ADD CONSTRAINT "CajaMovimientoDePago_cajaMovimientoId_fkey" FOREIGN KEY ("cajaMovimientoId") REFERENCES "CajaMovimiento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- La fila se va con su pago: borrar un pago libera su movimiento.
ALTER TABLE "CajaMovimientoDePago" ADD CONSTRAINT "CajaMovimientoDePago_pagoProveedorId_fkey" FOREIGN KEY ("pagoProveedorId") REFERENCES "PagoProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaMovimientoDePago" ADD CONSTRAINT "CajaMovimientoDePago_pagoGastoId_fkey" FOREIGN KEY ("pagoGastoId") REFERENCES "PagoGasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cada fila es de exactamente UN pago.
ALTER TABLE "CajaMovimientoDePago" ADD CONSTRAINT "CajaMovimientoDePago_un_solo_pago" CHECK (num_nonnulls("pagoProveedorId", "pagoGastoId") = 1);

-- La llena la base, no el código: cualquier camino que inserte un pago con
-- movimiento —la app, un script, SQL a mano— pasa por acá. El choque contra la
-- clave primaria se vuelve a lanzar con un mensaje que dice qué pasó. Va como
-- 23000 y no como el 23505 original porque Prisma, ante un 23505, descarta el
-- mensaje y deja solo "Unique constraint failed": el motivo no llegaría a nadie.
CREATE FUNCTION "caja_movimiento_de_un_solo_pago"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW."cajaMovimientoId" IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    IF TG_TABLE_NAME = 'PagoProveedor' THEN
      INSERT INTO "CajaMovimientoDePago" ("cajaMovimientoId", "pagoProveedorId") VALUES (NEW."cajaMovimientoId", NEW."id");
    ELSE
      INSERT INTO "CajaMovimientoDePago" ("cajaMovimientoId", "pagoGastoId") VALUES (NEW."cajaMovimientoId", NEW."id");
    END IF;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'El movimiento de caja % ya es de otro pago: un retiro es de a lo sumo un pago, a proveedor o de gasto', NEW."cajaMovimientoId"
      USING ERRCODE = 'integrity_constraint_violation', CONSTRAINT = 'CajaMovimientoDePago_pkey', TABLE = TG_TABLE_NAME;
  END;
  RETURN NULL;
END
$fn$;

-- Un pago no cambia de movimiento: la fila de arriba seguiría apuntando al
-- anterior y el nuevo quedaría sin dueño registrado. Ningún camino del código lo
-- hace; si alguno lo necesitara, es una decisión nueva y no un ajuste.
CREATE FUNCTION "pago_sin_cambio_de_movimiento"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF OLD."cajaMovimientoId" IS DISTINCT FROM NEW."cajaMovimientoId" THEN
    RAISE EXCEPTION 'Un pago no cambia de movimiento de caja (pago % de %)', OLD."id", TG_TABLE_NAME
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER "PagoProveedor_movimiento_exclusivo" AFTER INSERT ON "PagoProveedor"
  FOR EACH ROW EXECUTE FUNCTION "caja_movimiento_de_un_solo_pago"();
CREATE TRIGGER "PagoGasto_movimiento_exclusivo" AFTER INSERT ON "PagoGasto"
  FOR EACH ROW EXECUTE FUNCTION "caja_movimiento_de_un_solo_pago"();
CREATE TRIGGER "PagoProveedor_movimiento_fijo" BEFORE UPDATE OF "cajaMovimientoId" ON "PagoProveedor"
  FOR EACH ROW EXECUTE FUNCTION "pago_sin_cambio_de_movimiento"();
CREATE TRIGGER "PagoGasto_movimiento_fijo" BEFORE UPDATE OF "cajaMovimientoId" ON "PagoGasto"
  FOR EACH ROW EXECUTE FUNCTION "pago_sin_cambio_de_movimiento"();

-- Los pagos a proveedores en efectivo que ya existen entran a la tabla. Va
-- DESPUÉS de los triggers, para que un pago que entre mientras corre la
-- migración no quede en el hueco entre la copia y el trigger; si ya lo registró
-- el trigger, la copia lo saltea. No hay conflicto posible entre dos pagos:
-- `PagoProveedor.cajaMovimientoId` ya es UNIQUE y `PagoGasto` nace vacía.
INSERT INTO "CajaMovimientoDePago" ("cajaMovimientoId", "pagoProveedorId")
SELECT "cajaMovimientoId", "id" FROM "PagoProveedor" WHERE "cajaMovimientoId" IS NOT NULL
ON CONFLICT DO NOTHING;

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
