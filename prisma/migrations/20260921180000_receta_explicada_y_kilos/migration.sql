-- LA RECETA PASA A SER UNA EXPLICACIÓN EN PALABRAS, Y EL PAPEL TRAE KILOS.
--
-- ── POR QUÉ ───────────────────────────────────────────────────────────────
--
-- Hay unos treinta proveedores y cada papel es distinto. La receta que existía
-- cubre impuestos —IVA por línea, alícuota, percepciones— y nada más; lo que
-- cambia de papel a papel es CÓMO SE LEE: qué columna es la cantidad, si hay
-- descuento, si el precio es por kilo. Programar eso por proveedor no escala.
--
-- Ahora se explica en castellano, una sola vez, y esa explicación se le
-- antepone a la IA en cada lectura de ese proveedor.
--
-- MEDIDO ANTES DE CONSTRUIRLO, con el papel real de Paty y la sonda
-- `sonda-explicacion-papel.mjs` (cd05b779): con cuatro frases de explicación,
-- 11 de 11 renglones quedaron bien interpretados —incluidos los tres que se
-- cobran por kilo— y las tres corridas devolvieron los mismos números. Sin
-- explicación, ese mismo papel salía MAL_LEIDO.
--
-- ── Y LOS KILOS ───────────────────────────────────────────────────────────
--
-- Cuando un renglón trae peso, el precio es por kilo y la cantidad son piezas.
-- Esos kilos no se leían, y por eso el fiambre quedaba afuera de la cuenta de
-- la ganancia, con el motivo escrito en el código: "los kilos no están en el
-- papel". Cuando el papel los trae, ahora están.
--
-- ADITIVA: cinco columnas nullable, sin default y sin backfill. Las filas que
-- ya existen quedan en NULL, que es la verdad —de esos papeles no se leyó peso
-- ni bonificación, y esos proveedores todavía no tienen explicación— y es lo
-- que la versión vieja ve durante la ventana: columnas que no lee.
ALTER TABLE "RecetaProveedor" ADD COLUMN "explicacion" TEXT;
ALTER TABLE "RecetaProveedor" ADD COLUMN "explicacionActualizadaEn" TIMESTAMP(3);
ALTER TABLE "RecetaProveedor" ADD COLUMN "explicacionActualizadaPor" INTEGER;

ALTER TABLE "ComprobanteLinea" ADD COLUMN "pesoKg" DECIMAL(12,3);
ALTER TABLE "ComprobanteLinea" ADD COLUMN "bonificacionPct" DECIMAL(5,2);
