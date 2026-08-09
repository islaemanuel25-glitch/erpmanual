-- REVERTIR UNA APLICACIÓN de lista de proveedor.
--
-- Hasta acá aplicar era una puerta de una sola dirección: el costo se escribía
-- en el producto —y arrastraba el precio de venta por margen— y no había forma
-- de volver. El día que se apliquen 279 costos de una y uno salga mal, eso es el
-- problema.
--
-- Estas dos columnas registran la vuelta:
--
--   revertidaEn            cuándo se revirtió. NULO SIGNIFICA QUE NUNCA SE
--                          REVIRTIÓ. No hay un booleano al lado: la fecha ya lo
--                          dice, y dos hechos para lo mismo se contradicen el
--                          día que uno se escribe y el otro no.
--   revertidaPorUsuarioId  quién la revirtió. Misma convención de autoría que
--                          `aplicadaPorUsuarioId`, `confirmadoPorUsuarioId` y
--                          `vinculadoPorUsuarioId`: la tabla ya la usa.
--
-- El historial de la aplicación NO se toca al revertir —costo previo, costo
-- aplicado, venta anterior, venta escrita y fecha quedan como estaban—: son la
-- prueba de qué se escribió. Lo que vuelve a cambiar es `aplicada`, que pasa a
-- false para que la fila cuente de nuevo como pendiente y se pueda corregir y
-- volver a aplicar.
--
-- ADITIVA: dos columnas nullable y nada más. El despliegue migra con un
-- contenedor descartable ANTES de recrear la app, así que la imagen vieja tiene
-- que poder seguir corriendo contra este schema mientras dura el cambio, y con
-- columnas nullable que no lee, puede.

ALTER TABLE "ImportacionListaFila" ADD COLUMN "revertidaEn" TIMESTAMP(3);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "revertidaPorUsuarioId" INTEGER;
