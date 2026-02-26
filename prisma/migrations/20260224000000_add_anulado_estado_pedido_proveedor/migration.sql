-- Add ANULADO to EstadoPedidoProveedor enum
ALTER TYPE "EstadoPedidoProveedor" ADD VALUE IF NOT EXISTS 'ANULADO';
