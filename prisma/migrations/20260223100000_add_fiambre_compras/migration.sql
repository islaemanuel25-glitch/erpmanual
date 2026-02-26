-- ProductoBase: nuevos campos para modo fiambre en compras a proveedor
ALTER TABLE "ProductoBase"
  ADD COLUMN IF NOT EXISTS "modoCompraProveedor" "ModoPedido" NOT NULL DEFAULT 'BULTO';

ALTER TABLE "ProductoBase"
  ADD COLUMN IF NOT EXISTS "pesoReferenciaKg" DECIMAL(10,3);

ALTER TABLE "ProductoBase"
  ADD COLUMN IF NOT EXISTS "pesoEsFijo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ProductoBase"
  ADD COLUMN IF NOT EXISTS "pesoPromedioKg" DECIMAL(10,3);

ALTER TABLE "ProductoBase"
  ADD COLUMN IF NOT EXISTS "actualizaPromedioPorRecepcion" BOOLEAN NOT NULL DEFAULT true;

-- PedidoProveedorDetalle: kg recibidos para fiambre
ALTER TABLE "PedidoProveedorDetalle"
  ADD COLUMN IF NOT EXISTS "kgRecibidos" DECIMAL(12,3);
