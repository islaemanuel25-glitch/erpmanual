-- ÚLTIMA REVISIÓN DEL PRECIO, POR UBICACIÓN.
--
-- Alimenta el control "Precios +30 días" de la pantalla de Productos: cuántos
-- productos activos tienen el precio sin revisar hace más de un mes.
--
-- ── ES "REVISIÓN", NO "CAMBIO" ──────────────────────────────────────────────
--
-- Mirar un precio hoy y decidir que sigue estando bien lo pone al día aunque el
-- importe no se toque. Por eso hay una columna propia y no se deriva de
-- `updatedAt`: ese campo se mueve con cualquier escritura de la fila —un cambio
-- de nombre, de proveedor, del código propio— y diría que el precio se revisó
-- cuando nadie lo miró.
--
-- ── POR QUÉ EN ProductoLocal Y NO EN ProductoBase ───────────────────────────
--
-- El precio de venta puede ser distinto por local, así que revisar el de un
-- local no dice nada sobre el de otro. `ProductoLocal` ya existe para el depósito
-- y para cada local desde que se crea el producto, así que la fila donde anotarlo
-- siempre está.
--
-- ── ADITIVA, NULLABLE Y SIN BACKFILL ────────────────────────────────────────
--
-- Las filas existentes se quedan en NULL a propósito, y ese null tiene
-- significado: "sin evidencia de revisión". El control las cuenta como
-- pendientes, que es la verdad — nadie registró haber mirado esos precios.
--
-- Rellenarlas con `updatedAt` habría sido fácil y falso: esa fecha puede
-- corresponder a una edición de nombre de hace dos días, y el control diría que
-- el precio está al día sin que nadie lo haya revisado nunca.
--
-- Compatible hacia atrás durante la ventana entre migrar y recrear: el código que
-- está atendiendo no mira esta columna.

ALTER TABLE "ProductoLocal" ADD COLUMN "precioRevisadoAt" TIMESTAMP(3);

-- El control filtra por `precioRevisadoAt` acotado al local y a los activos, y
-- se ejecuta en cada carga de la pantalla de Productos. Los índices de `localId`
-- y `baseId` ya existen; éste acompaña al filtro por fecha.
CREATE INDEX "ProductoLocal_precioRevisadoAt_idx" ON "ProductoLocal"("precioRevisadoAt");
