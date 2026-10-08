-- LA RECETA DE DYSSA, AL DÍA CON SU BOLETA.
--
-- ── QUÉ CAMBIA Y POR QUÉ ────────────────────────────────────────────────────
--
-- La receta de `20260812090000_recetas_dyssa_das` salió de una factura de DYSSA
-- con UNA sola alícuota: "IIBB 3 %" e "IVA 3 %" sobre el neto total. La boleta
-- del 2026-10-08 trae dos grupos —la harina al 10,5 y el resto al 21— y la
-- percepción de IVA (RG 5329) va por grupo: 3 % sobre el neto del 21 y 1,5 %
-- sobre el del 10,5. El IIBB es 3,5 % del neto total. Los tres salen de
-- dividir lo impreso por su base, no de suponer:
--
--   Percepción IVA  13.002,82 / 433.427,46 (Neto 21 %)   = 3,00 %
--   Percepción IVA     695,39 /  46.359,60 (Neto 10,5 %) = 1,50 %
--   Percepción IIBB 16.792,55 / 479.787,06 (neto total)  = 3,50 %
--
-- Las percepciones de la receta son el RESPALDO: si el pie imprime el
-- importe, manda lo impreso. Sirven para el papel que no lo trae.
--
-- El resto de la receta se reafirma como ya estaba: IVA por renglón —y desde
-- esta tanda el lector lee la alícuota de CADA renglón—, impuesto interno por
-- unidad aparte, el IVA sobre el neto solo, y las percepciones adentro del
-- costo. El descuento por renglón y los renglones de "Neto" del pie como bases
-- no son campos de la receta: los resuelve el código para todos los
-- proveedores.
--
-- NO se toca la explicación en palabras ni la variación normal: son de
-- Emanuel y esta tanda no las cambió.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ───────────────────────────────────────────────
--
-- Es un paso de datos que corre en producción. Así entra por /deploy, con su
-- backup y el clasificador, y queda registrado.
--
-- ── EL NOMBRE VA EXACTO ────────────────────────────────────────────────────
--
-- 'Dyssa', igual que la migración que creó la receta. En producción hay "Das"
-- y "Daska": un LIKE le cambiaría la receta a quien no corresponde.
--
-- ── EL VERSIONADO SE RESPETA ───────────────────────────────────────────────
--
-- `version` sube en uno, como cuando se edita desde la pantalla: los
-- comprobantes ya leídos conservan la versión y la receta con que se leyeron.
-- Si en algún grupo DYSSA todavía no tenía receta, se crea con versión 1.

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
  '[{"nombre":"Percepción IVA RG 5329 (grupo 21%)","pct":3,"alicuotaPct":21},{"nombre":"Percepción IVA RG 5329 (grupo 10,5%)","pct":1.5,"alicuotaPct":10.5},{"nombre":"Percepción IIBB","pct":3.5}]'::jsonb, true,
  'UNIDAD'::"FacturaPor", 1,
  now(), now()
FROM "Grupo" g
CROSS JOIN "Proveedor" p
WHERE p.nombre = 'Dyssa'
ON CONFLICT ("grupoId", "proveedorId") DO UPDATE SET
  "ivaPorLinea" = EXCLUDED."ivaPorLinea",
  "alicuotaIvaPct" = EXCLUDED."alicuotaIvaPct",
  "tieneImpuestoInterno" = EXCLUDED."tieneImpuestoInterno",
  "ivaIncluyeInternoEnLaBase" = EXCLUDED."ivaIncluyeInternoEnLaBase",
  "percepciones" = EXCLUDED."percepciones",
  "percepcionesEnCosto" = EXCLUDED."percepcionesEnCosto",
  "facturaPor" = EXCLUDED."facturaPor",
  "version" = "RecetaProveedor"."version" + 1,
  "updatedAt" = now();
