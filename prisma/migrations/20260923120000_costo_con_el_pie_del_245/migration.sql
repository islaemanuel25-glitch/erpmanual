-- LOS CUATRO COSTOS DEL PEDIDO 245 QUE SE ESCRIBIERON SIN LA PERCEPCIÓN.
--
-- ── QUÉ PASÓ ──────────────────────────────────────────────────────────────
--
-- El pedido 245 de Arcor se cerró el 2026-09-22 con el código anterior a
-- `9af324bf`, o sea cuando el precio de cada producto era neto + IVA y los
-- conceptos del pie solo servían para controlar el total. Su comprobante 17
-- imprime "PERC. IVA 5329 $12.386,34" sobre un neto de $412.877,48: un 3,0000 %
-- que no llegó a ningún costo.
--
-- Cuatro renglones se cerraron con "Aceptar el precio nuevo" —los únicos que
-- escribieron costo desde el papel— y quedaron deflactados en 2,48 %, que es
-- ese 3 % medido sobre el precio con IVA (3 / 1,21).
--
-- Los quince renglones que se cerraron con "Dejar el que tenía" NO se tocan: su
-- costo no salió del papel, así que la percepción no los alcanza. Es la
-- decisión de Emanuel y sigue valiendo tal cual.
--
-- ── DE DÓNDE SALEN LOS VALORES ────────────────────────────────────────────
--
-- **Calculados con las funciones del ERP, no a mano.** `repartoDelPie` y
-- `analizarPrecioDeLinea` dan el costo; `precioDesdeMargen` da el precio de
-- venta de cada ubicación con SU margen y SU redondeo, que es exactamente lo
-- que haría `actualizarCostoRealProducto` si el cierre corriera hoy. La corrida
-- que los produjo es `scripts/sonda-costo-con-el-pie.mjs`, que no escribe nada
-- y se puede volver a correr para comprobar estos números.
--
-- El precio de venta se mueve porque el camino normal lo mueve: `costoMaestro`
-- recalcula la venta desde el margen CONFIGURADO en cada ubicación. Dejar el
-- costo arriba y la venta abajo comprimiría el margen un 2,48 % en silencio, que
-- es lo que ese módulo tiene escrito que no hay que hacer.
--
-- ── POR QUÉ UNA MIGRACIÓN ─────────────────────────────────────────────────
--
-- Por la regla de CLAUDE.md: un paso de datos que corre en producción va como
-- migración, nunca como script suelto. Queda registrada y se aplica una vez.
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE lleva en el WHERE el costo Y la venta que se están corrigiendo.
-- Si alguien ya lo arregló, o si el precio es otro porque se editó a mano,
-- **no toca esa fila**: es idempotente y no puede pisar una corrección
-- posterior. Por eso los locales van en sentencias separadas por precio: dentro
-- de una misma ficha hay ubicaciones con margen 41,01 y otras con 30.

-- ── base 1715 · MOGUL COLMILLOS 30g · $6.131,82 → $6.283,85 ───────────────
UPDATE "ProductoBase"
   SET precio_costo = 6283.85, precio_venta = 8900, "updatedAt" = NOW()
 WHERE id = 1715 AND precio_costo = 6131.82 AND precio_venta = 8700;
UPDATE "ProductoLocal"
   SET precio_costo = 6283.85, precio_venta = 8900, "updatedAt" = NOW()
 WHERE "baseId" = 1715 AND precio_costo = 6131.82 AND precio_venta = 8700;
UPDATE "ProductoLocal"
   SET precio_costo = 6283.85, precio_venta = 8200, "updatedAt" = NOW()
 WHERE "baseId" = 1715 AND precio_costo = 6131.82 AND precio_venta = 8000;

-- ── base 1716 · MOGUL MONSTRUITOS 30g · $6.131,82 → $6.283,85 ─────────────
UPDATE "ProductoBase"
   SET precio_costo = 6283.85, precio_venta = 8800, "updatedAt" = NOW()
 WHERE id = 1716 AND precio_costo = 6131.82 AND precio_venta = 8600;
UPDATE "ProductoLocal"
   SET precio_costo = 6283.85, precio_venta = 8800, "updatedAt" = NOW()
 WHERE "baseId" = 1716 AND precio_costo = 6131.82 AND precio_venta = 8600;

-- ── base 1111 · MOGUL CEREBRITOS 30G · $6.131,82 → $6.283,85 ──────────────
UPDATE "ProductoBase"
   SET precio_costo = 6283.85, precio_venta = 8900, "updatedAt" = NOW()
 WHERE id = 1111 AND precio_costo = 6131.82 AND precio_venta = 8700;
UPDATE "ProductoLocal"
   SET precio_costo = 6283.85, precio_venta = 8900, "updatedAt" = NOW()
 WHERE "baseId" = 1111 AND precio_costo = 6131.82 AND precio_venta = 8700;
UPDATE "ProductoLocal"
   SET precio_costo = 6283.85, precio_venta = 8200, "updatedAt" = NOW()
 WHERE "baseId" = 1111 AND precio_costo = 6131.82 AND precio_venta = 8000;

-- ── base 2029 · Furtilla Extreme x500 · $6.968,54 → $7.141,31 ─────────────
UPDATE "ProductoBase"
   SET precio_costo = 7141.31, precio_venta = 10000, "updatedAt" = NOW()
 WHERE id = 2029 AND precio_costo = 6968.54 AND precio_venta = 9800;
UPDATE "ProductoLocal"
   SET precio_costo = 7141.31, precio_venta = 10000, "updatedAt" = NOW()
 WHERE "baseId" = 2029 AND precio_costo = 6968.54 AND precio_venta = 9800;

-- ── EL RASTRO, EN EL RENGLÓN QUE ORIGINÓ CADA COSTO ───────────────────────
--
-- `costoFinalUnitario` es el costo que ESA línea produjo. Quedó con el número
-- viejo, así que sin esto el renglón seguiría diciendo que facturó $6.131,82
-- mientras el producto vale $6.283,85 — dos respuestas para la misma pregunta,
-- y la que se mira para auditar es la del renglón.
--
-- `costoPrevioAplicacion` NO se toca: significa "lo que el producto tenía justo
-- antes de que esta línea lo pisara", y eso fue $5.815 / $6.106 / $5.930, no el
-- número que esta migración corrige. Escribir ahí $6.131,82 sería falso.
--
-- Las decisiones de `DecisionDePrecioProveedor` TAMPOCO se tocan, y es a
-- propósito: guardan los dos precios "tal como se le mostraron a quien
-- decidió". Reescribirlos falsearía el registro. Que hoy no coincidan con la
-- factura es cierto y es lo que el motor de decisiones tiene que ver: la
-- próxima vez que estos productos aparezcan en un papel de Arcor, preguntará de
-- nuevo mostrando que antes se había aceptado otro número.
UPDATE "ComprobanteLinea"
   SET "costoFinalUnitario" = 6283.85
 WHERE id IN (260, 268, 274) AND "comprobanteId" = 17 AND "costoFinalUnitario" = 6131.82;
UPDATE "ComprobanteLinea"
   SET "costoFinalUnitario" = 7141.31
 WHERE id = 269 AND "comprobanteId" = 17 AND "costoFinalUnitario" = 6968.54;
