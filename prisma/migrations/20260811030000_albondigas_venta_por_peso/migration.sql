-- Corrige la ficha de "Albondigas Caseras x Caja", que tenía cargada una
-- contradicción: venta en depósito por PESO y `pesoEsFijo` en verdadero al mismo
-- tiempo.
--
-- ── POR QUÉ IMPORTABA ──────────────────────────────────────────────────────
--
-- Hasta el 2026-08-11 convivían dos definiciones de "fiambre de pieza fija":
-- la del motor priorizaba `modoVentaDeposito` y la de la pantalla combinaba con
-- OR. Este producto era el ÚNICO del catálogo que caía justo en la diferencia,
-- así que se MOSTRABA en piezas y se DESCONTABA en kilos. Las definiciones se
-- unificaron en el commit anterior (la pantalla pasó a seguir al motor); esto
-- limpia el dato que originaba la ambigüedad.
--
-- ── POR QUÉ NO HAY QUE MIGRAR NINGÚN NÚMERO DE STOCK ───────────────────────
--
-- Verificado EJECUTANDO, no deducido: se corrió el producto real de erpazul_al
-- por las diez decisiones del sistema que miran estos campos, con la marca en
-- verdadero y en falso. CAMBIAN CERO. El producto ya se descontaba en kilos
-- —`modoVentaDeposito` manda y dice PESO—, así que el número guardado significa
-- exactamente lo mismo antes y después.
--
-- El único lector aislado de `pesoEsFijo` en todo el repo es el sugerido de
-- compra, que elige entre `pesoReferenciaKg` y `pesoPromedioKg`. Para este
-- producto los dos valen 1, así que tampoco se mueve.
--
-- ── POR QUÉ SE FILTRA POR NOMBRE Y NO POR ID ───────────────────────────────
--
-- El id 857 es el de erpazul_al y NO tiene por qué ser el mismo en producción:
-- un UPDATE por id le pegaría a otro producto. Se filtra por nombre y además
-- por la contradicción, así que si en producción ese producto no existe o ya
-- está bien cargado, esta migración no toca ninguna fila. Es deliberado.
--
-- ── LO QUE NO TOCA, A PROPÓSITO ────────────────────────────────────────────
--
-- Hay otros DOS productos con la misma contradicción cargada —"Crema de Leche
-- Cremac" y "Mogul Tubito Mix Frutal"—, pero los dos son `pack` comprados por
-- BULTO: no son fiambre, y ahí `pesoEsFijo` es ruido que no decide nada. No se
-- limpian sin que Emanuel lo decida.
--
-- Tampoco toca el stock: este producto tiene -35,445 en el depósito, que es
-- parte del problema de negativos anotado en docs/incidents/ y se mira aparte.

UPDATE "ProductoBase"
   SET "pesoEsFijo" = false
 WHERE nombre = 'Albondigas Caseras x Caja'
   AND "modoVentaDeposito" = 'PESO'
   AND "pesoEsFijo" = true;
