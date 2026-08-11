-- UN COMPROBANTE, VARIAS IMÁGENES.
--
-- ── EL PROBLEMA, QUE NO SE VE HASTA QUE SE PRUEBA CON UNA FACTURA REAL ─────
--
-- El modelo asumía UN archivo por comprobante. Pero una factura larga viene en
-- VARIAS FOTOS: la de DAS son dos, el encabezado con las líneas y el pie con los
-- totales.
--
-- Con un archivo por comprobante, el total a verificar queda en una imagen y las
-- líneas que tiene que sumar en la otra. La lectura sería correcta y la cuenta
-- NUNCA cerraría, así que la puerta la marcaría como MAL_LEIDO para siempre —
-- con el modelo habiendo leído perfecto. El peor tipo de falla: la que culpa a
-- la pieza equivocada.
--
-- Ahora las fotos van a `ComprobanteArchivo`, en orden, y se mandan JUNTAS al
-- lector en un solo pedido, como el papel que son.
--
-- ── POR QUÉ EL HASH SE MUEVE ──────────────────────────────────────────────
--
-- Estaba en el comprobante. Con varias fotos por comprobante tiene que vivir
-- POR FOTO: si no, dos páginas distintas del mismo papel se leerían como un
-- duplicado, o —peor— la segunda página pisaría el hash de la primera y la red
-- contra subir dos veces la misma foto dejaría de existir.
--
-- ── PARA QUE EL NÚMERO DE ACIERTO SALGA SOLO ──────────────────────────────
--
-- La medición del acierto se hace con las facturas REALES que entren por la
-- pantalla. Para que después de veinte facturas el número esté sin que nadie
-- prepare nada, hay que guardarlo desde la primera:
--
--   · `cerroEnIntento` — en qué intento cerró por primera vez. 1 = a la primera.
--     Null = nunca cerró. Es un número y no un booleano porque "cerró" y "cerró
--     a la primera" son preguntas distintas, y `intentosLectura` no alcanza:
--     releer uno que ya había cerrado lo sube igual.
--   · `usoRespaldo` y `motivoPaseRespaldo` — cuántas veces hubo que ir al
--     segundo lector y por qué. `modeloLectura` ya dice cuál leyó, pero contarlo
--     no tiene que depender de deducirlo del nombre del modelo.
--
-- ── POR QUÉ ES SEGURO BORRAR LAS COLUMNAS VIEJAS ──────────────────────────
--
-- Las tres tablas de comprobante están VACÍAS en producción, y ninguna versión
-- desplegada escribe en ellas: la ruta de subida se escribió DESPUÉS del último
-- despliegue. Verificar el conteo en cero antes de aplicar esto es parte del
-- procedimiento, no un detalle — si hubiera una sola fila, esto perdería su
-- imagen sin dejar rastro.

-- ── Las fotos, una tabla propia ────────────────────────────────────────────
CREATE TABLE "ComprobanteArchivo" (
    "id"            SERIAL       NOT NULL,
    "comprobanteId" INTEGER      NOT NULL,
    "orden"         INTEGER      NOT NULL,
    "nombre"        TEXT         NOT NULL,
    "tamano"        INTEGER      NOT NULL,
    "mime"          TEXT,
    "hash"          TEXT         NOT NULL,
    "ubicacion"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteArchivo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ComprobanteArchivo_comprobanteId_orden_key"
    ON "ComprobanteArchivo"("comprobanteId", "orden");
CREATE INDEX "ComprobanteArchivo_comprobanteId_idx" ON "ComprobanteArchivo"("comprobanteId");
CREATE INDEX "ComprobanteArchivo_hash_idx" ON "ComprobanteArchivo"("hash");

-- Borrar el comprobante se lleva sus fotos: son parte de él, no algo aparte.
ALTER TABLE "ComprobanteArchivo"
    ADD CONSTRAINT "ComprobanteArchivo_comprobanteId_fkey"
    FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteProveedor"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Lo que se guarda para medir el acierto con facturas reales ─────────────
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "cerroEnIntento" INTEGER;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "usoRespaldo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ComprobanteProveedor" ADD COLUMN "motivoPaseRespaldo" TEXT;

-- ── Las columnas de un solo archivo se van ─────────────────────────────────
DROP INDEX IF EXISTS "ComprobanteProveedor_grupoId_proveedorId_archivoHash_idx";
ALTER TABLE "ComprobanteProveedor" DROP COLUMN IF EXISTS "archivoNombre";
ALTER TABLE "ComprobanteProveedor" DROP COLUMN IF EXISTS "archivoTamano";
ALTER TABLE "ComprobanteProveedor" DROP COLUMN IF EXISTS "archivoHash";
ALTER TABLE "ComprobanteProveedor" DROP COLUMN IF EXISTS "archivoUbicacion";
ALTER TABLE "ComprobanteProveedor" DROP COLUMN IF EXISTS "archivoMime";
