-- CÓMO HAY QUE GIRAR LA FOTO DE UN COMPROBANTE PARA VERLA DERECHA.
--
-- Los grados que eligió una persona tocando «Girar» en el visor. Se suman al
-- giro que dice el EXIF del archivo, que se lee al vuelo: ése es un dato del
-- archivo y no cambia nunca.
--
-- ADITIVA. Una columna nueva, nullable, sin default y sin backfill. Ninguna
-- fila existente se toca y el código viejo no la lee, así que la ventana entre
-- migrar y recrear no cambia nada: las fotos se siguen viendo como hasta hoy.
ALTER TABLE "ComprobanteArchivo" ADD COLUMN "giroGrados" INTEGER;
