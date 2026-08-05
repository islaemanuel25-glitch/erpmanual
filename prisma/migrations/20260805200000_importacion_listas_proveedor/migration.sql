-- IMPORTACIÓN DE LISTAS DE PRECIOS DE PROVEEDOR
--
-- Un administrador sube el Excel del proveedor, el sistema lo concilia contra el
-- catálogo y GUARDA el resultado. Todavía no se aplica ningún costo: lo que queda
-- persistido es una PROPUESTA revisable, y la cabecera más las filas son la
-- auditoría de esa propuesta.
--
-- POR QUÉ SE GUARDAN TAMBIÉN LAS FILAS QUE NO SE PUEDEN APLICAR
--
-- Una lista de Arcor trae 917 productos y solo una parte queda lista. Si se
-- guardara únicamente esa parte, las otras quedarían sin explicación: por qué un
-- código no macheó, por qué un display quedó dudoso, por qué un producto en kg
-- quedó bloqueado. Esa explicación es lo que permite corregir el catálogo.
--
-- ES ADITIVA. Dos tablas nuevas, tres enums nuevos y una columna nullable en
-- Proveedor. No toca ninguna tabla existente, no borra nada y no necesita
-- backfill: sin importaciones previas, no hay nada que rellenar.

-- ── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "EstadoImportacionLista" AS ENUM ('BORRADOR', 'CONCILIADA', 'APLICADA', 'DESCARTADA');

CREATE TYPE "TipoCoincidenciaLista" AS ENUM ('CODIGO_INTERNO', 'CODIGO_INTERNO_SIN_CEROS', 'AMBIGUA', 'NINGUNA');

CREATE TYPE "EstadoFilaLista" AS ENUM (
  'LISTO_PARA_ACTUALIZAR', 'SIN_CAMBIOS', 'NO_MACHEADO', 'CODIGO_DUPLICADO',
  'FACTOR_DUDOSO', 'EXCLUIDO', 'BLOQUEADO', 'ERROR'
);

-- ── Proveedor: qué parser usa ──────────────────────────────────────────────
--
-- Identificador EXPLÍCITO, cargado por el administrador. Reconocer al proveedor
-- por el texto de su nombre sería frágil y peligroso: dos proveedores pueden
-- llamarse parecido y un parser equivocado leería un código de barras como si
-- fuera un precio. Nullable: un proveedor sin este dato no admite importación.
ALTER TABLE "Proveedor" ADD COLUMN "parserListaId" TEXT;

-- ── Cabecera ───────────────────────────────────────────────────────────────

CREATE TABLE "ImportacionListaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "localOperativoId" INTEGER NOT NULL,

    "archivoNombre" TEXT NOT NULL,
    "archivoTamano" INTEGER NOT NULL,
    "archivoHash" TEXT NOT NULL,
    -- Nullable a propósito: el proyecto todavía no tiene almacenamiento
    -- permanente de archivos. Escribir el binario en el disco del contenedor lo
    -- perdería al recrearlo, así que por ahora no se guarda y la conciliación
    -- queda completa igual. Cuando exista un almacenamiento real, esto lo apunta.
    "archivoUbicacion" TEXT,

    "parser" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,

    "recargoPct" DECIMAL(6,3) NOT NULL,
    "umbralVariacionPct" DECIMAL(6,3) NOT NULL,
    "modoPrecioVenta" TEXT NOT NULL DEFAULT 'NO_TOCAR',

    "estado" "EstadoImportacionLista" NOT NULL DEFAULT 'BORRADOR',

    "totalFilas" INTEGER NOT NULL DEFAULT 0,
    "listoParaActualizar" INTEGER NOT NULL DEFAULT 0,
    "sinCambios" INTEGER NOT NULL DEFAULT 0,
    "noMacheadas" INTEGER NOT NULL DEFAULT 0,
    "codigoDuplicado" INTEGER NOT NULL DEFAULT 0,
    "factorDudoso" INTEGER NOT NULL DEFAULT 0,
    "excluidas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadas" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "sugerenciasCodigoBarras" INTEGER NOT NULL DEFAULT 0,
    "variacionAlta" INTEGER NOT NULL DEFAULT 0,
    "faltantes" INTEGER NOT NULL DEFAULT 0,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conciliadaEn" TIMESTAMP(3),
    "aplicadaEn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionListaProveedor_pkey" PRIMARY KEY ("id")
);

-- IDEMPOTENCIA REAL, a nivel base. Dos pedidos simultáneos con el mismo archivo
-- no pueden crear dos importaciones: el segundo choca contra este índice. Un
-- findFirst previo solo cubre el caso secuencial, no la carrera.
CREATE UNIQUE INDEX "importacion_archivo_unica" ON "ImportacionListaProveedor"("grupoId", "proveedorId", "archivoHash");
CREATE INDEX "ImportacionListaProveedor_grupoId_proveedorId_createdAt_idx" ON "ImportacionListaProveedor"("grupoId", "proveedorId", "createdAt");
CREATE INDEX "ImportacionListaProveedor_grupoId_estado_idx" ON "ImportacionListaProveedor"("grupoId", "estado");
CREATE INDEX "ImportacionListaProveedor_usuarioId_idx" ON "ImportacionListaProveedor"("usuarioId");

ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_grupoId_fkey"
  FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_proveedorId_fkey"
  FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Filas ──────────────────────────────────────────────────────────────────

CREATE TABLE "ImportacionListaFila" (
    "id" SERIAL NOT NULL,
    "importacionId" INTEGER NOT NULL,

    "filaExcel" INTEGER NOT NULL,
    "hojaNombre" TEXT NOT NULL,

    "codigoCrudo" TEXT NOT NULL,
    "codigoNormalizado" TEXT NOT NULL,
    "codigoComparableSinCeros" TEXT,
    "codigoBarraProveedor" TEXT,
    "descripcionProveedor" TEXT NOT NULL,
    "categoriaCruda" TEXT,

    "unidadProveedor" TEXT NOT NULL,
    "unidadesPorBulto" INTEGER,
    -- Seis decimales: el archivo real trae valores como 1404.602001 y truncarlos
    -- falsearía la propuesta que se le muestra al usuario.
    "precioConIva" DECIMAL(18,6) NOT NULL,
    "precioSinIva" DECIMAL(18,6),

    "productoBaseId" INTEGER,
    "codigoProveedorId" INTEGER,
    "tipoCoincidencia" "TipoCoincidenciaLista" NOT NULL DEFAULT 'NINGUNA',
    -- Sugerido por código de barras. NO es un vínculo: hay que confirmarlo.
    "sugerenciaProductoBaseId" INTEGER,
    "sugerenciaCodigoBarra" TEXT,

    "costoAnterior" DECIMAL(12,2),
    "recargoPct" DECIMAL(6,3) NOT NULL,
    "montoRecargo" DECIMAL(18,6),
    "precioConRecargo" DECIMAL(18,6),
    "factorErp" INTEGER,
    "costoUnitarioCalculado" DECIMAL(18,6),
    "costoMaestroPropuesto" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "diferenciaPct" DECIMAL(12,4),
    "variacionAlta" BOOLEAN NOT NULL DEFAULT false,

    "estado" "EstadoFilaLista" NOT NULL,
    "motivo" TEXT,

    "seleccionable" BOOLEAN NOT NULL DEFAULT false,
    "seleccionada" BOOLEAN NOT NULL DEFAULT false,
    -- Se llenan en la etapa de aplicación. Acá nacen en false/null.
    "aplicada" BOOLEAN NOT NULL DEFAULT false,
    "costoAplicado" DECIMAL(12,2),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionListaFila_pkey" PRIMARY KEY ("id")
);

-- Una fila física del Excel no puede entrar dos veces en la misma importación.
CREATE UNIQUE INDEX "fila_unica_por_importacion" ON "ImportacionListaFila"("importacionId", "hojaNombre", "filaExcel");
CREATE INDEX "ImportacionListaFila_importacionId_estado_idx" ON "ImportacionListaFila"("importacionId", "estado");
CREATE INDEX "ImportacionListaFila_importacionId_codigoNormalizado_idx" ON "ImportacionListaFila"("importacionId", "codigoNormalizado");
CREATE INDEX "ImportacionListaFila_productoBaseId_idx" ON "ImportacionListaFila"("productoBaseId");
CREATE INDEX "ImportacionListaFila_importacionId_filaExcel_idx" ON "ImportacionListaFila"("importacionId", "filaExcel");

ALTER TABLE "ImportacionListaFila" ADD CONSTRAINT "ImportacionListaFila_importacionId_fkey"
  FOREIGN KEY ("importacionId") REFERENCES "ImportacionListaProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImportacionListaFila" ADD CONSTRAINT "ImportacionListaFila_productoBaseId_fkey"
  FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
