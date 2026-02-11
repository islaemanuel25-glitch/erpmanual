-- Extiende los métodos disponibles para historial/aplicación de actualizaciones de precios
ALTER TYPE "PrecioUpdateMetodo" ADD VALUE IF NOT EXISTS 'REGLAS';
ALTER TYPE "PrecioUpdateMetodo" ADD VALUE IF NOT EXISTS 'PEGADO';
