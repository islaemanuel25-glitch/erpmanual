-- CUÁNTO SE LE MUEVE EL PRECIO A ESTE PROVEEDOR SIN QUE SEA RARO.
--
-- ── POR QUÉ ES DEL PROVEEDOR Y NO UN NÚMERO DEL SISTEMA ───────────────────
--
-- Un 9 % de diferencia entre lo que cobra el papel y el costo que uno tiene es
-- normal en un proveedor que actualiza todos los meses, y es una señal de que
-- algo se leyó mal en uno que no movió un precio en medio año. El mismo número
-- no puede significar las dos cosas, así que lo decide cada proveedor.
--
-- Por defecto **10 %**, que es la decisión de Emanuel para los que todavía no
-- lo tengan cargado.
--
-- ── PARA QUÉ SE USA ───────────────────────────────────────────────────────
--
-- Para decidir qué viene marcado en la hoja de Corregir cuando los dos precios
-- difieren, y para frenar el cierre cuando el costo que se escribiría cae fuera
-- de esa variación sin que nadie lo haya elegido en esa recepción. Reemplaza al
-- freno de "más de tres veces" que se había puesto en `b345ba3e`, que era un
-- número del sistema y no del proveedor.
--
-- ADITIVA: una columna con default, sin backfill destructivo. Las filas que ya
-- están toman el 10 % por el DEFAULT, que es exactamente lo que se quiere. El
-- código viejo no la lee, así que la ventana entre migrar y recrear no cambia
-- nada.

ALTER TABLE "RecetaProveedor"
  ADD COLUMN "variacionNormalPct" DECIMAL(5,2) NOT NULL DEFAULT 10;
