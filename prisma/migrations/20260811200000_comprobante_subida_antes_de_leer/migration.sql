-- La subida ocurre ANTES de la lectura, y el modelo no lo contemplaba.
--
-- ── QUÉ PROBLEMA ARREGLA ───────────────────────────────────────────────────
--
-- `ComprobanteProveedor` se diseñó asumiendo que un comprobante se crea cuando
-- ya se conoce su identidad: tipo, punto de venta, número y fecha, todos NOT
-- NULL. Pero esos cuatro datos salen de LEER el papel, y el papel se lee después
-- de subirlo. Con el modelo anterior, la subida no tenía qué escribir.
--
-- La salida fácil habría sido poner "" o "SIN NUMERO" hasta que se lea. Es peor
-- de lo que parece: además de inventar un dato, haría chocar entre sí a dos
-- comprobantes sin leer, porque el índice único de identidad los vería iguales.
-- Con NULL no pasa: en PostgreSQL dos NULL no son iguales, así que muchos
-- pendientes conviven, y el único empieza a regir en cuanto hay número.
--
-- ── LOS DOS ESTADOS NUEVOS ─────────────────────────────────────────────────
--
-- PENDIENTE_LECTURA — nace acá todo comprobante subido.
--
-- MAL_LEIDO — se leyó y la aritmética NO cerró dentro del centavo. Va separado
-- de DIFIERE a propósito, y no es una sutileza: en DIFIERE el PAPEL no cierra y
-- se muestra igual con la diferencia a la vista, porque es información real del
-- proveedor. En MAL_LEIDO lo que no cierra es la LECTURA, y un número que puede
-- haber sido inventado por el modelo no puede proponer un costo. Un solo estado
-- para los dos casos haría que un invento se leyera como un dato del proveedor.
--
-- ── POR QUÉ ESTA MIGRACIÓN ES SEGURA ───────────────────────────────────────
--
-- Las tres tablas de comprobante están VACÍAS en producción —se crearon hoy y
-- todavía no hay ninguna pantalla que escriba en ellas—, así que aflojar un NOT
-- NULL no puede romper ninguna fila existente. Y aflojarlo es compatible hacia
-- atrás por definición: lo que antes entraba, sigue entrando.
--
-- `ALTER TYPE ... ADD VALUE` corre dentro de la transacción de la migración
-- porque PostgreSQL 12+ lo permite. La restricción que sí queda es que el valor
-- nuevo no se puede USAR en la misma transacción, y acá no se usa: solo se
-- declara.

-- ── Estados nuevos ─────────────────────────────────────────────────────────
ALTER TYPE "EstadoComprobante" ADD VALUE IF NOT EXISTS 'PENDIENTE_LECTURA';
ALTER TYPE "EstadoComprobante" ADD VALUE IF NOT EXISTS 'MAL_LEIDO';

-- ── La identidad se conoce recién al leer ──────────────────────────────────
ALTER TABLE "ComprobanteProveedor" ALTER COLUMN "tipo" DROP NOT NULL;
ALTER TABLE "ComprobanteProveedor" ALTER COLUMN "puntoVenta" DROP NOT NULL;
ALTER TABLE "ComprobanteProveedor" ALTER COLUMN "numero" DROP NOT NULL;
ALTER TABLE "ComprobanteProveedor" ALTER COLUMN "fecha" DROP NOT NULL;

-- ── Quién leyó, cuándo, y cuánto costó ─────────────────────────────────────
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "modeloLectura" TEXT;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "leidoEn" TIMESTAMP(3);
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "intentosLectura" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "tokensEntrada" INTEGER;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "tokensSalida" INTEGER;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "costoMicroUsd" INTEGER;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "archivoMime" TEXT;

-- Para listar lo que falta leer sin recorrer la tabla entera.
CREATE INDEX "ComprobanteProveedor_grupoId_estado_createdAt_idx"
    ON "ComprobanteProveedor"("grupoId", "estado", "createdAt");
