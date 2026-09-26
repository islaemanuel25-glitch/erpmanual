-- EL COSTO DEL CATÁLOGO QUE SE MIRÓ AL DECIDIR UN PRECIO.
--
-- Una decisión de precio guardaba el precio de la factura y el costo de la
-- LÍNEA del pedido, no el del catálogo. Si el catálogo se movía entre la
-- decisión y el cierre, nada lo notaba: una aceptación tomada mirando 1.300 se
-- aplicaba igual con el catálogo en 1.500. Con este dato, la decisión vale solo
-- mientras el catálogo siga en el mismo número.
--
-- ── ESTRICTAMENTE ADITIVA ─────────────────────────────────────────────────
--
-- Una columna NULLABLE, sin default, sin UPDATE y sin backfill. Las decisiones
-- existentes quedan en NULL, que quiere decir "no se guardó contra qué catálogo
-- se tomó": no se reconstruye, porque el catálogo de hoy no es el de ese día.
-- La versión anterior no lee esta columna.

-- AlterTable
ALTER TABLE "DecisionDePrecioProveedor" ADD COLUMN "costoMaestroObservado" DECIMAL(12,2);
