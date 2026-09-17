-- LO QUE EMANUEL CONTESTA UNA VEZ, Y EL COSTO QUE ACEPTÓ FUERA DE RANGO.
--
-- Dos hechos que el módulo no tenía dónde guardar, y los dos salen del mismo
-- problema: la pantalla preguntaba lo mismo todos los meses, y cuando alguien
-- contestaba no quedaba registro de QUÉ sabía al contestar.
--
-- ── 1. LecturaProductoProveedor ────────────────────────────────────────────
--
-- Cómo se lee el precio de UN producto en las listas de UN proveedor: por unidad
-- o por caja, y con qué cantidad. Se guarda cuando la persona lo contesta en el
-- recorrido de a uno, y desde la lista siguiente ese producto se lee solo.
--
-- No habilita nada por sí sola: la lectura guardada se usa únicamente si el
-- costo que produce cae en el rango del proveedor. Si queda afuera, la fila
-- vuelve a la cola y se pregunta de nuevo. Guardar una respuesta no es guardar
-- un permiso.
--
-- Va en tabla propia y no como columnas de `ProductoCodigoProveedor` porque son
-- dos hechos distintos: aquélla contesta QUIÉN ES el producto y la escribe
-- también el módulo de Facturas; ésta contesta CÓMO SE LEE SU PRECIO y es una
-- decisión de Listas. Mezcladas, revincular un código borraría la lectura.
--
-- ── 2. Las dos columnas de `ImportacionListaFila` ──────────────────────────
--
-- `fueraDeRangoAceptadaEn` registra que a la persona le avisaron que ese costo
-- NO cae en el rango del proveedor y siguió igual. Es un hecho DISTINTO de
-- `confirmadoEn`, que solo dice que contestó cómo leer el precio.
--
-- Sin esa distinción no se podía separar "lo eligió sabiendo" de "apretó un
-- botón que decía solo $11.083,72". Así fue como la importación #5 de M Y F
-- terminó mostrando "112 productos listos · Todos aumentan entre +2,6 % y
-- +1.008,5 %" sobre un proveedor con rango de 2 a 15: la pantalla vieja ofrecía
-- la lectura absurda con un toque y sin el porcentaje, y después nadie volvía a
-- mirar el rango — ni al contar, ni al aplicar.
--
-- ── ES PURAMENTE ADITIVA ───────────────────────────────────────────────────
--
-- Una tabla nueva y dos columnas nuevas, las dos nullable. No hay DROP, no hay
-- UPDATE, no hay DELETE, no hay backfill y ninguna fila existente cambia. El
-- código viejo sigue insertando filas válidas durante toda la ventana entre
-- migrar y recrear.
--
-- Y las filas que YA están confirmadas quedan con `fueraDeRangoAceptadaEn` en
-- NULL, que es lo correcto y no un hueco: a nadie le avisaron nada cuando las
-- confirmó. Las que además quedaron fuera del rango dejan de contarse como
-- listas y vuelven a la cola, que es exactamente lo que se busca.

CREATE TABLE "LecturaProductoProveedor" (
  "id"                     SERIAL PRIMARY KEY,
  "grupoId"                INTEGER NOT NULL,
  "proveedorId"            INTEGER NOT NULL,
  "productoBaseId"         INTEGER NOT NULL,
  "clave"                  TEXT NOT NULL,
  "multiplicador"          INTEGER NOT NULL,
  "cantidad"               INTEGER,
  "confirmadaPorUsuarioId" INTEGER,
  "confirmadaEn"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LecturaProductoProveedor_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LecturaProductoProveedor_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LecturaProductoProveedor_productoBaseId_fkey"
    FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "lectura_unica_por_producto_y_proveedor"
  ON "LecturaProductoProveedor" ("grupoId", "proveedorId", "productoBaseId");
CREATE INDEX "LecturaProductoProveedor_grupoId_proveedorId_idx"
  ON "LecturaProductoProveedor" ("grupoId", "proveedorId");
CREATE INDEX "LecturaProductoProveedor_productoBaseId_idx"
  ON "LecturaProductoProveedor" ("productoBaseId");

ALTER TABLE "ImportacionListaFila"
  ADD COLUMN "fueraDeRangoAceptadaEn"           TIMESTAMP(3),
  ADD COLUMN "fueraDeRangoAceptadaPorUsuarioId" INTEGER;
