-- CONFIRMAR LA PRESENTACIÓN de una fila que quedó por revisar.
--
-- Separa los dos datos que el diseño anterior mezclaba:
--
--   baseConfirmada       qué es el producto del ERP respecto de lo que cotiza el
--                        proveedor. MISMA_PRESENTACION no multiplica el precio;
--                        POR_UNIDAD_SUELTA sí, y solo se admite cuando el archivo
--                        demuestra que el precio es por unidad suelta.
--   unidadesConfirmadas  cuántas unidades contiene esa presentación. Es un dato
--                        del producto, NO un multiplicador del precio.
--
-- El error que corrige: la cantidad se usaba como factor del precio, y así un
-- display cotizado a $5.678 quedaba valuado en $71.545.
--
-- `factorConfirmado` queda sin uso. No se elimina acá porque entre que corre la
-- migración y se recrea el contenedor la app anterior todavía la lee; se elimina
-- en una migración de limpieza posterior.
--
-- Aditiva: dos columnas nullables. No borra ni transforma nada.

ALTER TABLE "ImportacionListaFila" ADD COLUMN "baseConfirmada" TEXT;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "unidadesConfirmadas" INTEGER;
