-- La receta de Mauro: el precio de cada línea YA ES EL FINAL.
--
-- ── DE DÓNDE SALE, MEDIDO ──────────────────────────────────────────────────
--
-- El comprobante que Mauro mandó tiene 21 líneas de cigarrillos. La suma de sus
-- subtotales impresos es 3.774.700, y el total impreso al pie es 3.776.700: dos
-- mil pesos de diferencia sobre casi cuatro millones.
--
-- Con la receta genérica —21 % de IVA sobre cada línea— el cálculo da 4.567.387,
-- o sea 790.687 de más. No es un redondeo ni un cargo al pie: es exactamente el
-- 21 % de la suma de las líneas. El IVA ya venía adentro del precio.
--
-- Tiene sentido para lo que vende: el cigarrillo tiene precio de venta al
-- público fijo, y el distribuidor factura a ese precio.
--
-- Los 2.000 que quedan NO se explican con esta receta y no se tapan con ella.
-- Una diferencia chica y redonda como esa es sospecha de LÍNEA FALTANTE antes
-- que de cargo al pie, y el control de renglones contra el papel está puesto
-- para eso. Queda a la vista, sin resolver.
--
-- ── POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT ────────────────────────────────
--
-- Es un paso de datos que tiene que correr en producción. Las migraciones ya
-- tienen su lugar en el despliegue, quedan registradas y se aplican una sola
-- vez; un script suelto no. Es la regla de CLAUDE.md, sin excepción.
--
-- ── POR QUÉ NO HAY NINGÚN ID ESCRITO A MANO ────────────────────────────────
--
-- Los ids de `Grupo` y `Proveedor` no son los mismos en cada base. La receta se
-- crea donde HAY un comprobante de Mauro, que es exactamente donde hace falta, y
-- el grupo sale de ese comprobante. En una base donde no haya ninguno, esta
-- migración no escribe nada y no falla: no hay a quién ponerle la receta.
--
-- `ON CONFLICT DO NOTHING` sobre (grupoId, proveedorId) hace que no pise una
-- receta que alguien haya editado a mano. Editar gana sobre este valor inicial.

INSERT INTO "RecetaProveedor" (
  "grupoId", "proveedorId",
  "ivaPorLinea", "alicuotaIvaPct",
  "tieneImpuestoInterno", "ivaIncluyeInternoEnLaBase",
  "percepciones", "percepcionesEnCosto",
  "facturaPor", "version",
  "createdAt", "updatedAt"
)
SELECT DISTINCT
  c."grupoId", c."proveedorId",
  -- El IVA no viene por línea NI al pie: viene adentro del precio. Con alícuota
  -- 0 el "final" de cada línea es su propio neto, que es justo lo que pasa.
  false, 0,
  false, false,
  '[]'::jsonb, true,
  'UNIDAD'::"FacturaPor", 1,
  now(), now()
FROM "ComprobanteProveedor" c
JOIN "Proveedor" p ON p.id = c."proveedorId"
WHERE p.nombre = 'Mauro'
ON CONFLICT ("grupoId", "proveedorId") DO NOTHING;
