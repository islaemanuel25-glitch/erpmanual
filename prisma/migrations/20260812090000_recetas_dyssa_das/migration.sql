-- Las recetas de DYSSA y DAS, transcriptas de sus facturas reales.
--
-- ── ESTO ES TRANSCRIBIR, NO SUPONER ────────────────────────────────────────
--
-- Los dos comprobantes se leyeron y CIERRAN A LOS CENTAVOS con estas recetas.
-- Sus números están en `lector/cobertura.test.mjs`, que es el candado que usa
-- las dos facturas reales, y de ahí salen los porcentajes:
--
--   DYSSA A 0011-00794708 — neto 428.063,23, IVA 89.893,28, interno 28.455,16,
--     total 572.095,46. Las dos percepciones son 12.841,90 cada una, y
--     428.063,23 × 3 % = 12.841,90. De ahí el 3 %, no de una suposición.
--
--   DAS A 0021-00011125 — neto 185.795,93, IVA 39.017,15, total 230.386,96.
--     La percepción es 5.573,88, y 185.795,93 × 3 % = 5.573,88.
--
-- Mauro ya la tiene desde `20260812040000_receta_mauro`. Las otras cuarenta las
-- va a cargar Emanuel desde la pantalla cuando le llegue una factura de cada
-- uno: no se inventan recetas de proveedores cuyo papel nadie vio.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ───────────────────────────────────────────────
--
-- Es un paso de datos que corre en producción. La regla de CLAUDE.md no tiene
-- excepción, y además existe el precedente de la receta de Mauro.
--
-- ── EL NOMBRE VA EXACTO, Y NO ES UN DETALLE ────────────────────────────────
--
-- En producción hay un proveedor "Das" y otro "Daska". Un LIKE '%das%' le
-- pondría a Daska la receta de Das, y Daska pasaría a leerse con una receta que
-- nadie miró contra su papel. Igualdad exacta.
--
-- El grupo sale de la tabla, no escrito a mano: los ids no son los mismos en
-- cada base. Si mañana hay dos grupos, cada uno recibe la suya, que es lo
-- correcto — la receta es por grupo aunque el proveedor sea compartido.
--
-- `ON CONFLICT DO NOTHING` para no pisar una receta que alguien haya editado a
-- mano: editar gana sobre este valor inicial.

-- DYSSA: el IVA viene en cada renglón, y además cobra impuesto interno por
-- unidad. El IVA se calcula sobre el neto SOLO, sin el interno — medido, y si
-- fuera al revés el comprobante no cerraría.
INSERT INTO "RecetaProveedor" (
  "grupoId", "proveedorId",
  "ivaPorLinea", "alicuotaIvaPct",
  "tieneImpuestoInterno", "ivaIncluyeInternoEnLaBase",
  "percepciones", "percepcionesEnCosto",
  "facturaPor", "version",
  "createdAt", "updatedAt"
)
SELECT g.id, p.id,
  true, 21,
  true, false,
  '[{"nombre":"IIBB","pct":3},{"nombre":"IVA","pct":3}]'::jsonb, true,
  'UNIDAD'::"FacturaPor", 1,
  now(), now()
FROM "Grupo" g
CROSS JOIN "Proveedor" p
WHERE p.nombre = 'Dyssa'
ON CONFLICT ("grupoId", "proveedorId") DO NOTHING;

-- DAS: las líneas van sin IVA y el IVA aparece una sola vez al pie. Sin
-- impuesto interno. Una percepción de IVA del 3 %.
INSERT INTO "RecetaProveedor" (
  "grupoId", "proveedorId",
  "ivaPorLinea", "alicuotaIvaPct",
  "tieneImpuestoInterno", "ivaIncluyeInternoEnLaBase",
  "percepciones", "percepcionesEnCosto",
  "facturaPor", "version",
  "createdAt", "updatedAt"
)
SELECT g.id, p.id,
  false, 21,
  false, false,
  '[{"nombre":"IVA","pct":3}]'::jsonb, true,
  'UNIDAD'::"FacturaPor", 1,
  now(), now()
FROM "Grupo" g
CROSS JOIN "Proveedor" p
WHERE p.nombre = 'Das'
ON CONFLICT ("grupoId", "proveedorId") DO NOTHING;
