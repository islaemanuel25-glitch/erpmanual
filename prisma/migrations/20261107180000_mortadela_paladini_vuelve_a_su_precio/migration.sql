-- INCIDENTE 2026-11-07: LA MORTADELA PALADINI VUELVE A SU PRECIO.
--
-- El cierre del pedido 530 (2026-11-07 00:06, bitácora 7450) escribió el costo
-- de la Mortadela Paladini (ProductoBase 2099) en $41.330,09 el kilo contra los
-- $8.888,89 que tenía: el precio de la PIEZA de 4,5 kg guardado como precio del
-- KILO. La venta se recalculó con el mismo error en la ficha y en las cinco
-- ubicaciones (×4,6). Fue el único producto escrito así: comparados contra el
-- backup pre-0b356f31 (2026-11-06 23:35) y contra pre-f26a2c0f (48 h antes),
-- ningún otro costo ni precio de ninguna ubicación saltó más de 1,8 veces.
--
-- Valores de antes: la ficha, de la propia bitácora 7450 ($8.888,89 y $12.500);
-- cada ubicación, del backup pre-0b356f31. El margen no se tocó nunca y no se
-- toca. Nadie editó el producto después de la 7450 (comprobado en la bitácora).
--
-- Solo escribe si el valor sigue siendo el roto: si alguien lo corrigió a mano
-- antes de aplicar esto, no pisa nada. En una base sin ese producto no hace nada.

SET LOCAL lock_timeout = '3s';

UPDATE "ProductoBase"
SET precio_costo = 8888.89, precio_venta = 12500.00, "updatedAt" = now()
WHERE id = 2099 AND precio_costo = 41330.09 AND precio_venta = 57900.00;

UPDATE "ProductoLocal" AS pl
SET precio_costo = 8888.89, precio_venta = v.venta, "updatedAt" = now()
FROM (VALUES
  (6201, 12500.00, 57900.00),
  (6200, 11600.00, 53800.00),
  (9537, 12500.00, 57900.00),
  (6996, 14500.00, 67300.00),
  (11772, 12500.00, 57900.00)
) AS v(id, venta, rota)
WHERE pl.id = v.id AND pl."baseId" = 2099
  AND pl.precio_costo = 41330.09 AND pl.precio_venta = v.rota;
