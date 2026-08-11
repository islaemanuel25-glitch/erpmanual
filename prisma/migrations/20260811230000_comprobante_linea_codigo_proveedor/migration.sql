-- El código de artículo del proveedor, en la línea del comprobante.
--
-- ── QUÉ FALTABA ────────────────────────────────────────────────────────────
--
-- La factura de DYSSA trae "Cód Art" (010027, 010193…), el lector lo lee desde
-- el principio —está en el contrato— y la ruta lo TIRABA al guardar la línea.
--
-- La consecuencia no se veía: el primer escalón de la cascada de vínculo, el
-- único que no interpreta nada porque el proveedor y nosotros hablamos del
-- mismo número, no podía funcionar nunca. Toda línea caía a sugerencia por
-- texto, que es la parte que a propósito NO vincula sola. O sea que la
-- conciliación automática estaba desactivada de hecho, sin que nada lo dijera.
--
-- Se descubrió armando una captura: buscando una línea que vinculara sola por
-- código, no había ninguna posible.
--
-- ── ES ADITIVA Y NULABLE ───────────────────────────────────────────────────
--
-- Nulable porque no todas las facturas traen código: la de DAS no lo trae. Sin
-- código la cascada sigue funcionando por alias y por texto, como hasta ahora.
--
-- Las filas que ya existen quedan en NULL y NO se rellenan: el dato se perdió al
-- leerlas y suponerlo sería inventarlo. Se recupera releyendo el comprobante,
-- que es barato y deja el rastro del intento.

ALTER TABLE "ComprobanteLinea" ADD COLUMN "codigoProveedor" TEXT;

-- Para machear por código sin recorrer la tabla.
CREATE INDEX "ComprobanteLinea_codigoProveedor_idx"
    ON "ComprobanteLinea"("codigoProveedor");
