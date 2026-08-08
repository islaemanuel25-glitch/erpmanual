-- El resultado de la interpretación del precio, persistido en cada fila.
--
-- POR QUÉ SE GUARDA Y NO SE CALCULA AL LEER
-- La pantalla de conciliación necesita FILTRAR por él: la tabla se llama
-- "Pendientes de decisión" y su cola son las filas donde el motor no pudo elegir
-- solo. Calcularlo al leer obligaría a traer todas las filas de la importación
-- para saber cuáles entran, y con eso se pierde la paginación del servidor. Esta
-- importación tiene 917 filas; la próxima puede tener cinco mil.
--
-- Es el mismo tratamiento que ya recibe `estado`: sale de una función pura
-- —`recomendarHipotesis` en vez de `clasificarLinea`— y se escribe al conciliar.
--
-- POR QUÉ NO QUEDA VIEJO
-- Depende de tres cosas: el recargo, el rango de aumento esperado, y el producto
-- vinculado con su costo. Los dos primeros son INMUTABLES una vez creada la
-- importación —no existe ningún endpoint que los modifique— y los dos últimos
-- disparan una reconciliación de la fila cuando cambian.
--
-- NULO significa "conciliada antes de que existiera esta columna". El backfill
-- lo completa; ver scripts/backfill-resultado-interpretacion.mjs.

ALTER TABLE "ImportacionListaFila"
  ADD COLUMN "resultadoInterpretacion" TEXT;

-- El filtro de la cola es "resultado distinto de RECOMENDADA y sin aplicar",
-- sobre una importación. El índice acompaña esa consulta, que es la que corre en
-- cada carga de la pantalla.
CREATE INDEX "ImportacionListaFila_importacionId_resultadoInterpretacion_idx"
  ON "ImportacionListaFila" ("importacionId", "resultadoInterpretacion");
