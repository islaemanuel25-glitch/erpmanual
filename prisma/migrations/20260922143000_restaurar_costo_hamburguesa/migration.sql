-- DEVOLVER EL COSTO DE LA HAMBURGUESA PATY AL QUE TENÍA ANTES DEL CIERRE.
--
-- ── QUÉ PASÓ ──────────────────────────────────────────────────────────────
--
-- El cierre del pedido 242, el 2026-09-22 a las 13:42:03 UTC, escribió el costo
-- de "Hamburguesa Paty Clasica x2" (ProductoBase 298) en **$1.851.090**: tomó
-- los $61.703 del bulto de 30 y los multiplicó OTRA VEZ por 30. Al recalcularse
-- el precio de venta por el margen del 30 %, la venta pasó de **$80.300** a
-- **$2.406.500**, en la ficha y en las CINCO ubicaciones.
--
-- Emanuel había decidido en esa recepción "Dejás tu precio · $61.703", o sea
-- que el costo no tenía que moverse en absoluto.
--
-- ── DE DÓNDE SALEN LOS VALORES ────────────────────────────────────────────
--
-- **Del backup `pre-66cc426e_20260922_133516.sql.gz`**, sacado a las 13:35:16
-- UTC, siete minutos antes del cierre. No se deducen de la fórmula del margen:
-- se leen de lo que el producto TENÍA. Medido ahí: la ficha y las cinco filas
-- de ProductoLocal (298, 2298, 7092, 9642, 11877) tenían costo 61703.00 y venta
-- 80300.00, y ninguna se había tocado desde el 2026-08-26.
--
-- ── POR QUÉ UNA MIGRACIÓN Y NO LA PANTALLA DE EDITAR ──────────────────────
--
-- Porque `PUT /api/productos/editar` REESCRIBE la ficha entera con lo que le
-- llega, y armar ese cuerpo a mano —el formulario manda veintitantos campos en
-- otra convención de nombres que la que devuelve `obtener`— es exactamente la
-- forma de borrar un dato sin querer. Acá se tocan DOS COLUMNAS y se nombran
-- las seis filas.
--
-- Y por la regla de CLAUDE.md: un paso de datos que corre en producción va como
-- migración, nunca como script suelto. Queda registrada y se aplica una vez.
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE lleva en el WHERE el valor que se está corrigiendo. Si alguien ya
-- lo arregló a mano, o si el costo es otro, **no toca nada**: la migración es
-- idempotente y no puede pisar una corrección posterior.
--
-- No hubo ventas del producto desde las 13:42:03 UTC —medido: cero— así que no
-- hay ninguna línea de venta con el precio inflado que haya que revisar.

UPDATE "ProductoBase"
   SET precio_costo = 61703.00,
       precio_venta = 80300.00,
       "updatedAt"  = NOW()
 WHERE id = 298
   AND precio_costo = 1851090
   AND precio_venta = 2406500;

UPDATE "ProductoLocal"
   SET precio_costo = 61703.00,
       precio_venta = 80300.00,
       "updatedAt"  = NOW()
 WHERE "baseId" = 298
   AND precio_costo = 1851090
   AND precio_venta = 2406500;
