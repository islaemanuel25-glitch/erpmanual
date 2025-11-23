-- CreateEnum
CREATE TYPE "DiaPedido" AS ENUM ('Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('unidad', 'pack', 'cajon', 'kg');

-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "permisos" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoDeposito" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoDeposito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoLocal" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrupoLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Local" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'local',
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "cuil" TEXT,
    "ciudad" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_deposito" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rolId" INTEGER NOT NULL,
    "localId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "diaPedidos" "DiaPedido",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaFisica" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaFisica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoBase" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "sku" TEXT,
    "codigo_barra" TEXT,
    "categoria_id" INTEGER,
    "proveedor_id" INTEGER,
    "area_fisica_id" INTEGER,
    "unidad_medida" "UnidadMedida" NOT NULL,
    "factor_pack" INTEGER,
    "peso_kg" DECIMAL(10,3),
    "volumen_ml" DECIMAL(10,2),
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "margen" DECIMAL(6,2),
    "precio_sugerido" DECIMAL(12,2),
    "iva_porcentaje" DECIMAL(5,2),
    "fecha_vencimiento" TIMESTAMP(3),
    "redondeo_100" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,
    "es_combo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoLocal" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "baseId" INTEGER NOT NULL,
    "nombre" TEXT,
    "descripcion" TEXT,
    "precio_costo" DECIMAL(12,2),
    "precio_venta" DECIMAL(12,2),
    "margen" DECIMAL(6,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocal" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaPrecio" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "margen_default" DECIMAL(6,2),
    "redondeo_100" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListaPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoListaPrecio" (
    "id" SERIAL NOT NULL,
    "listaPrecioId" INTEGER NOT NULL,
    "baseId" INTEGER NOT NULL,
    "precio_final" DECIMAL(12,2),
    "margen_especial" DECIMAL(6,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoListaPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_nombre_key" ON "Grupo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoDeposito_grupoId_localId_key" ON "GrupoDeposito"("grupoId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoLocal_grupoId_localId_key" ON "GrupoLocal"("grupoId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoLocal_localId_key" ON "GrupoLocal"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_cuit_key" ON "Proveedor"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoBase_grupoId_codigo_barra_key" ON "ProductoBase"("grupoId", "codigo_barra");

-- CreateIndex
CREATE UNIQUE INDEX "ListaPrecio_localId_nombre_key" ON "ListaPrecio"("localId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoListaPrecio_listaPrecioId_baseId_key" ON "ProductoListaPrecio"("listaPrecioId", "baseId");

-- AddForeignKey
ALTER TABLE "GrupoDeposito" ADD CONSTRAINT "GrupoDeposito_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoDeposito" ADD CONSTRAINT "GrupoDeposito_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoLocal" ADD CONSTRAINT "GrupoLocal_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoLocal" ADD CONSTRAINT "GrupoLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_area_fisica_id_fkey" FOREIGN KEY ("area_fisica_id") REFERENCES "AreaFisica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoLocal" ADD CONSTRAINT "ProductoLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoLocal" ADD CONSTRAINT "ProductoLocal_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "ProductoBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocal" ADD CONSTRAINT "StockLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocal" ADD CONSTRAINT "StockLocal_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
