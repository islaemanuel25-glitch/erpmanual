-- Recepción por comprobante: receta del proveedor, comprobante y sus líneas.
--
-- ── ES ADITIVA ─────────────────────────────────────────────────────────────
--
-- Tres tablas y dos enums NUEVOS. No toca ninguna tabla existente salvo para
-- agregar las claves foráneas hacia Proveedor, que no cambian sus filas. La
-- versión que atiende durante la ventana del despliegue no conoce nada de esto
-- y no puede molestarle.

CREATE TYPE "EstadoComprobante" AS ENUM ('CARGADO', 'CIERRA', 'DIFIERE', 'FUERA_DE_RECETA', 'ANULADO');
CREATE TYPE "FacturaPor" AS ENUM ('UNIDAD', 'BULTO');

CREATE TABLE "RecetaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "ivaPorLinea" BOOLEAN NOT NULL DEFAULT false,
    "alicuotaIvaPct" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "tieneImpuestoInterno" BOOLEAN NOT NULL DEFAULT false,
    "ivaIncluyeInternoEnLaBase" BOOLEAN NOT NULL DEFAULT false,
    "percepciones" JSONB NOT NULL DEFAULT '[]',
    "percepcionesEnCosto" BOOLEAN NOT NULL DEFAULT true,
    "facturaPor" "FacturaPor" NOT NULL DEFAULT 'UNIDAD',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecetaProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComprobanteProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "pedidoId" INTEGER,
    "localOperativoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" TEXT NOT NULL,
    "puntoVenta" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "cuitLeido" TEXT,
    "netoLeido" DECIMAL(12,2),
    "ivaLeido" DECIMAL(12,2),
    "internoLeido" DECIMAL(12,2),
    "percepcionesLeido" DECIMAL(12,2),
    "totalLeido" DECIMAL(12,2),
    "diferenciaCentavos" INTEGER,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'CARGADO',
    "recetaVersion" INTEGER,
    "recetaUsada" JSONB,
    "archivoNombre" TEXT,
    "archivoTamano" INTEGER,
    "archivoHash" TEXT,
    "archivoUbicacion" TEXT,
    "confirmadoEn" TIMESTAMP(3),
    "borradoProgramadoEn" TIMESTAMP(3),
    "avisoBorradoDesde" TIMESTAMP(3),
    "avisoBorradoRespondidoEn" TIMESTAMP(3),
    "imagenBorradaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComprobanteProveedor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComprobanteLinea" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "textoCrudo" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "netoUnitario" DECIMAL(18,6) NOT NULL,
    "subtotalImpreso" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2),
    "internoUnitario" DECIMAL(18,6),
    "ivaPct" DECIMAL(5,2),
    "productoLocalId" INTEGER,
    "pedidoDetalleId" INTEGER,
    "costoFinalUnitario" DECIMAL(18,6),
    "costoPrevioAplicacion" DECIMAL(12,2),
    "costoEscrito" BOOLEAN NOT NULL DEFAULT false,
    "claseDiferencia" TEXT,
    "diferenciaPct" DECIMAL(6,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComprobanteLinea_pkey" PRIMARY KEY ("id")
);

-- Una receta por proveedor y grupo.
CREATE UNIQUE INDEX "RecetaProveedor_grupoId_proveedorId_key" ON "RecetaProveedor"("grupoId", "proveedorId");
CREATE INDEX "RecetaProveedor_proveedorId_idx" ON "RecetaProveedor"("proveedorId");

CREATE INDEX "ComprobanteProveedor_grupoId_proveedorId_puntoVenta_numero_idx" ON "ComprobanteProveedor"("grupoId", "proveedorId", "puntoVenta", "numero");
CREATE INDEX "ComprobanteProveedor_grupoId_pedidoId_idx" ON "ComprobanteProveedor"("grupoId", "pedidoId");
CREATE INDEX "ComprobanteProveedor_grupoId_estado_idx" ON "ComprobanteProveedor"("grupoId", "estado");
CREATE INDEX "ComprobanteProveedor_grupoId_proveedorId_archivoHash_idx" ON "ComprobanteProveedor"("grupoId", "proveedorId", "archivoHash");

-- ── LA IDENTIDAD DEL COMPROBANTE, Y POR QUÉ EL ÍNDICE ES PARCIAL ──────────
--
-- Proveedor + punto de venta + número. El mismo comprobante subido dos veces
-- choca contra este índice y se rechaza en la base, no en el código: un
-- `findFirst` previo solo cubre el caso secuencial y dos subidas simultáneas se
-- le escapan. Es la misma lección que dejó el índice de archivo de las listas.
--
-- EXCLUYE los ANULADO a propósito: si alguien anula un comprobante mal cargado,
-- el mismo número tiene que poder volver a subirse. Sin el WHERE, anular
-- dejaría ese número quemado para siempre.
--
-- Vive acá y no en @@unique porque Prisma no sabe expresar un WHERE.
CREATE UNIQUE INDEX "ComprobanteProveedor_identidad_key"
    ON "ComprobanteProveedor"("grupoId", "proveedorId", "puntoVenta", "numero")
    WHERE "estado" <> 'ANULADO';

CREATE INDEX "ComprobanteLinea_comprobanteId_orden_idx" ON "ComprobanteLinea"("comprobanteId", "orden");
CREATE INDEX "ComprobanteLinea_productoLocalId_idx" ON "ComprobanteLinea"("productoLocalId");
CREATE INDEX "ComprobanteLinea_pedidoDetalleId_idx" ON "ComprobanteLinea"("pedidoDetalleId");

ALTER TABLE "RecetaProveedor" ADD CONSTRAINT "RecetaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComprobanteProveedor" ADD CONSTRAINT "ComprobanteProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Borrar un comprobante se lleva sus líneas: no tienen vida propia.
ALTER TABLE "ComprobanteLinea" ADD CONSTRAINT "ComprobanteLinea_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
