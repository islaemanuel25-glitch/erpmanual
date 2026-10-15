-- QUÉ SE PAGÓ CON UNA SALIDA DE CAJA. Aditiva: un enum nuevo y una columna
-- nullable. Ningún movimiento existente se toca: los anteriores quedan sin tipo
-- y se muestran "Sin clasificar". El efectivo esperado no la lee.

CREATE TYPE "TipoEgresoCaja" AS ENUM ('PROVEEDOR', 'SUELDO', 'GASTO', 'AL_DEPOSITO', 'RETIRO_DUENO');

ALTER TABLE "CajaMovimiento" ADD COLUMN "tipoEgreso" "TipoEgresoCaja";
