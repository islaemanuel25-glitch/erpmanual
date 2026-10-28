-- GUARDAR EL PIE QUE SE LEYÓ DE LA FACTURA DE ARCOR DEL PEDIDO #362.
--
-- ── QUÉ PASÓ ──────────────────────────────────────────────────────────────
--
-- El comprobante 38 (Arcor, pedido 362, 10 renglones, total $677.040,48) se
-- leyó con el esquema interpretado, que hasta este arreglo solo le pedía al
-- modelo el TOTAL del pie. El modelo repartió bien el IVA y la percepción en el
-- costo de cada renglón —la cuenta cerró contra el total—, pero el IVA y la
-- PERC. IVA no quedaron guardados, y la recepción decía "Este papel no trae
-- impuestos y este proveedor suele traerlos". El lector ya los pide
-- (`esquemaInterpretado`); esta lectura se hizo antes.
--
-- ── DE DÓNDE SALEN LOS VALORES ────────────────────────────────────────────
--
-- De la foto del papel, verificada por Emanuel y releída el 2026-10-28:
-- SUBTOTAL 546.000,38 · DESCUENTO 0,00 · IVA 114.660,08 · PERC. IVA 5329
-- 16.380,02 · PER. IIBB 0,00 · TOTAL 677.040,48. Lo que el papel imprime en
-- cero no se guarda, igual que lo que pide el lector.
--
-- Los renglones NO se tocan: sus importes son los netos del papel y su costo
-- final ya lleva el IVA y la percepción repartidos (suma $677.040,04 contra
-- $677.040,48 impresos, dentro de la tolerancia del redondeo).
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- El WHERE nombra el comprobante, su proveedor y su total, y exige que el pie
-- siga vacío: si alguien ya lo cargó, o si la fila es otra, no toca nada.
--
-- ── VUELTA ATRÁS ──────────────────────────────────────────────────────────
--
--   UPDATE "ComprobanteProveedor"
--      SET "netoLeido" = NULL, "ivaLeido" = NULL, "conceptosDelPieLeidos" = '[]'::jsonb
--    WHERE "id" = 38 AND "ivaLeido" = 114660.08;

UPDATE "ComprobanteProveedor"
   SET "netoLeido" = 546000.38,
       "ivaLeido" = 114660.08,
       "conceptosDelPieLeidos" = '[{"nombre": "PERC. IVA 5329", "importe": 16380.02, "resta": false}]'::jsonb
 WHERE "id" = 38
   AND "proveedorId" = 20
   AND "totalLeido" = 677040.48
   AND "netoLeido" IS NULL
   AND "ivaLeido" IS NULL
   AND ("conceptosDelPieLeidos" IS NULL OR "conceptosDelPieLeidos" = '[]'::jsonb);
