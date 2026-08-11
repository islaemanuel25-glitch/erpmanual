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
-- ── LOS OTROS DOS, AGREGADOS DESPUÉS ───────────────────────────────────────
--
-- "Crema de Leche Cremac" y "Mogul Tubito Mix Frutal" tenían la misma
-- contradicción cargada. Los dos son `pack` comprados por BULTO: no son
-- fiambre, y ahí `pesoEsFijo` es ruido que no decide nada.
--
-- Pasaron por la MISMA verificación de las diez decisiones, uno por uno, con la
-- marca en verdadero y en falso: cambian CERO en los dos.
--
-- El sugerido de compra, que es el único lector aislado de `pesoEsFijo` y el
-- que había que mirar con cuidado, ni siquiera los alcanza: ese cálculo vive
-- dentro de `if (modoCompra === "UNIDAD")` en
-- app/api/compras-proveedor/productos/route.js:184, y los dos se compran por
-- BULTO. No es que los valores coincidan — es que la rama no se ejecuta.
--
-- ── LO QUE NO TOCA, A PROPÓSITO ────────────────────────────────────────────
--
-- El stock. "Albondigas" tiene -35,445 y "Mogul Tubito" -344,620 en el
-- depósito; son parte de INC-0003 y se miran aparte.
--
-- Tampoco toca `pesoReferenciaKg`, que en "Mogul Tubito" vale 620 —un valor sin
-- sentido para un pack— pero que hoy no lo lee nadie para ese producto por la
-- misma guarda de arriba. Limpiarlo es otra decisión.

UPDATE "ProductoBase"
   SET "pesoEsFijo" = false
 WHERE nombre IN (
         'Albondigas Caseras x Caja',
         'Crema de Leche Cremac',
         'Mogul Tubito Mix Frutal'
       )
   AND "modoVentaDeposito" = 'PESO'
   AND "pesoEsFijo" = true;
