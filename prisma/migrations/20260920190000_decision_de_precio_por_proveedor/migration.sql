-- LO QUE YA SE DECIDIÓ SOBRE EL PRECIO DE UN PRODUCTO DE UN PROVEEDOR.
--
-- ── EL PROBLEMA, MEDIDO ─────────────────────────────────────────────────────
--
-- Que la pantalla pregunte por un precio distinto está bien. Lo que no está
-- bien es que no se acuerde de la respuesta: la diferencia entre lo que factura
-- el proveedor y el costo interno es la ganancia del depósito, o sea que es
-- estable y vuelve IDÉNTICA en cada factura. Hoy no se guarda en ningún lado, y
-- la próxima recepción vuelve a preguntar lo mismo sobre el mismo número.
--
-- Medido sobre el comprobante 5 del pedido 232: TRECE de sus quince renglones
-- tienen el precio distinto, y ninguna de las trece respuestas sobrevive.
--
-- ── ES PURAMENTE ADITIVA ────────────────────────────────────────────────────
--
-- Una tabla nueva y nada más. No hay ALTER sobre ninguna existente, no hay
-- UPDATE, no hay DELETE, no hay INSERT y no hay backfill: no se puede
-- reconstruir qué decidió alguien en una recepción vieja, y suponerlo sería
-- inventar el dato que la tabla existe para registrar. Nace vacía, y hasta que
-- alguien decida algo la pantalla se comporta exactamente como hoy.
--
-- El código viejo no la nombra, así que durante toda la ventana entre migrar y
-- recrear no cambia nada.
--
-- ── ES LA MISMA FORMA QUE `ProductoQueNoSeCambia` ───────────────────────────
--
-- Esa tabla resolvió el mismo problema para el otro módulo: "no lo cambio"
-- valía para UNA lista y la lista siguiente volvía a preguntar. Grupo,
-- proveedor, producto, única por los tres, quién decidió y cuándo. Acá se copia
-- tal cual, y lo único que se agrega son los dos números de la comparación.
--
-- ── POR QUÉ SE GUARDAN LOS DOS PRECIOS ──────────────────────────────────────
--
-- Una decisión vale mientras el papel siga diciendo lo mismo CONTRA lo mismo.
-- Con los dos lados guardados se puede distinguir "cambió la factura" de
-- "cambió mi costo", que para quien mira son dos cosas distintas; con uno solo
-- habría que adivinar cuál de los dos se movió.
--
-- Son DECIMAL(18,6) porque es la escala de los otros dos unitarios del circuito
-- —`PedidoProveedorDetalle.precioCosto` y `ComprobanteLinea.netoUnitario`—: un
-- precio de bulto derivado de un pack con factor no divisor no entra en dos
-- decimales, y guardarlo redondeado haría fallar la comparación que esta tabla
-- existe para sostener.
CREATE TABLE "DecisionDePrecioProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "precioFacturado" DECIMAL(18,6) NOT NULL,
    "precioPropio" DECIMAL(18,6) NOT NULL,
    "comprobanteLineaId" INTEGER,
    "decididaPorUsuarioId" INTEGER,
    "decididaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionDePrecioProveedor_pkey" PRIMARY KEY ("id")
);

-- UNA decisión por producto y proveedor: la última manda. El índice se crea
-- sobre una tabla que esta misma migración acaba de crear, así que nace vacía y
-- no puede chocar con duplicados que ya existan.
CREATE UNIQUE INDEX "decision_precio_unica_por_proveedor" ON "DecisionDePrecioProveedor"("grupoId", "proveedorId", "productoBaseId");
CREATE INDEX "DecisionDePrecioProveedor_grupoId_proveedorId_idx" ON "DecisionDePrecioProveedor"("grupoId", "proveedorId");
CREATE INDEX "DecisionDePrecioProveedor_productoBaseId_idx" ON "DecisionDePrecioProveedor"("productoBaseId");

ALTER TABLE "DecisionDePrecioProveedor" ADD CONSTRAINT "DecisionDePrecioProveedor_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionDePrecioProveedor" ADD CONSTRAINT "DecisionDePrecioProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionDePrecioProveedor" ADD CONSTRAINT "DecisionDePrecioProveedor_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
