-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE: EL ERP AZUL COMPLETO, DESDE UNA BASE VACÍA.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── QUÉ REEMPLAZA Y POR QUÉ ────────────────────────────────────────────────
--
-- Las 105 migraciones anteriores NO podían reproducir una base vacía. Ninguna
-- crea `Venta`, `VentaDetalle`, `Cliente` ni `Turno`, y diecinueve hacen ALTER
-- sobre tablas que nadie crea: el historial empieza a mitad de camino, con un
-- `CREATE TABLE "PrecioUpdate"` de diciembre de 2024. La base de producción
-- existe porque se creó por fuera de ese historial.
--
-- No es una teoría: `20241202000000_add_venta_campos` también falló EN
-- PRODUCCIÓN el 2026-03-21 con `relation "Venta" does not exist`, quedó sin
-- terminar, y el 2026-04-27 se la marcó revertida y aplicada a mano. Esa fila
-- duplicada sigue en `_prisma_migrations` y no se toca.
--
-- Esto no parchea las 105. Las reemplaza por una baseline deliberada que
-- construye la estructura actual desde cero. Las viejas siguen en el historial
-- de Git; salieron del directorio activo porque Prisma intentaría ejecutarlas
-- después de ésta.
--
-- ── DE DÓNDE SALE ──────────────────────────────────────────────────────────
--
-- La primera parte la generó `prisma migrate diff --from-empty
-- --to-schema-datamodel prisma/schema.prisma` sobre el schema de `main`, es
-- decir SIN Ofertas ni recargos por medio de pago: esas estructuras todavía no
-- están desplegadas, y una baseline que las incluyera haría que Prisma las diera
-- por existentes el día que esto se marque como aplicado en producción.
--
-- La segunda parte, al final, son nueve objetos copiados tal cual de producción
-- que `schema.prisma` no puede describir. Están explicados uno por uno allá.
--
-- ── QUÉ NO TRAE, Y ESTÁ BIEN QUE NO ────────────────────────────────────────
--
-- Ninguna de las ocho migraciones de datos del historial viejo. Se auditaron las
-- 105 y las ocho son `INSERT ... SELECT` o `UPDATE ... WHERE` sobre filas que ya
-- existían: sobre una base vacía las ocho son no-ops, cero filas. Ninguna es
-- dato imprescindible para que una instalación nueva funcione. Los roles y la
-- configuración inicial los pone `prisma/seed.js`, que es su lugar.
--
-- ── LO QUE QUEDA DISTINTO DE PRODUCCIÓN, MEDIDO Y ACEPTADO ─────────────────
--
-- Comparadas con las mismas consultas contra las dos bases: tablas idénticas
-- (61), columnas idénticas (890), constraints y los 269 índices idénticos.
-- Quedan dos diferencias conocidas y sin efecto funcional:
--
--   · `EstadoComprobante` y `TipoCoincidenciaLista` tienen los MISMOS valores en
--     distinto ORDEN. Es la huella de `ALTER TYPE ... ADD VALUE`, que agrega al
--     final. Se comprobó que ningún código ordena ni compara por rango sobre
--     `ComprobanteProveedor.estado` ni `ImportacionListaFila.tipoCoincidencia`.
--
--   · `ListaPrecio_grupoId_nombre_key` es un CONSTRAINT en producción y un
--     ÍNDICE ÚNICO acá. La garantía de unicidad es la misma y ninguna de las
--     cinco FK que apuntan a `ListaPrecio` usa esas columnas: las cinco van
--     contra `id`.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "DiaPedido" AS ENUM ('Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo');

-- CreateEnum
CREATE TYPE "UnidadMedida" AS ENUM ('unidad', 'pack', 'cajon', 'kg');

-- CreateEnum
CREATE TYPE "ModoPedido" AS ENUM ('BULTO', 'UNIDAD');

-- CreateEnum
CREATE TYPE "ModoEnvio" AS ENUM ('SOLO_BULTO', 'MIXTO', 'SOLO_UNIDAD');

-- CreateEnum
CREATE TYPE "ModoStock" AS ENUM ('BULTO', 'UNIDAD');

-- CreateEnum
CREATE TYPE "ModoVentaDeposito" AS ENUM ('PIEZA', 'PESO');

-- CreateEnum
CREATE TYPE "ModalidadProducto" AS ENUM ('NORMAL', 'IMPORTE_VARIABLE');

-- CreateEnum
CREATE TYPE "EstadoPedidoProveedor" AS ENUM ('BORRADOR', 'CONFIRMADO', 'ENVIADO', 'RECIBIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "PrecioUpdateMetodo" AS ENUM ('MANUAL', 'AUMENTO', 'REGLAS', 'PEGADO', 'XLSX', 'SCAN', 'MARGEN_MASIVO');

-- CreateEnum
CREATE TYPE "PrecioUpdatePricingMode" AS ENUM ('KEEP_VENTA', 'RECALC_BY_MARGIN', 'SET_VENTA');

-- CreateEnum
CREATE TYPE "ReglaPrecio" AS ENUM ('MARGEN_PORCENTUAL', 'RECARGO_FIJO_UNIDAD');

-- CreateEnum
CREATE TYPE "MedioPago" AS ENUM ('EFECTIVO', 'MERCADOPAGO', 'DEBITO', 'CREDITO', 'FIADO');

-- CreateEnum
CREATE TYPE "EstadoEntregaRetiro" AS ENUM ('PENDIENTE_ENTREGA', 'ENTREGADO');

-- CreateEnum
CREATE TYPE "EstadoCierrePreparacion" AS ENUM ('PREPARANDO', 'CONFIRMADO', 'CANCELADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "EstadoRetiroPreparacion" AS ENUM ('PREPARANDO', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "EstadoCambioPendiente" AS ENUM ('DISPONIBLE', 'RESERVADO', 'RECIBIDO', 'CANCELADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "ListaPrecioTipoBase" AS ENUM ('PRECIO_VENTA', 'COSTO', 'MANUAL_AUTORIZADO');

-- CreateEnum
CREATE TYPE "TipoPrecioAplicado" AS ENUM ('PRECIO_VENTA', 'COSTO_MAS_MARGEN', 'COSTO_PURO', 'MANUAL_AUTORIZADO', 'OVERRIDE_PRODUCTO');

-- CreateEnum
CREATE TYPE "AlcanceNotificacion" AS ENUM ('USUARIO', 'LOCAL', 'DEPOSITO', 'PARTICIPANTES', 'GRUPO');

-- CreateEnum
CREATE TYPE "EstadoImportacionLista" AS ENUM ('BORRADOR', 'CONCILIADA', 'APLICADA', 'DESCARTADA', 'CANCELADA', 'PARCIALMENTE_APLICADA', 'TERMINADA');

-- CreateEnum
CREATE TYPE "TipoCoincidenciaLista" AS ENUM ('CODIGO_INTERNO', 'CODIGO_INTERNO_SIN_CEROS', 'SUFIJO_8', 'SUFIJO_7', 'SUFIJO_6', 'SUFIJO_5', 'SUFIJO_4', 'CODIGO_BARRA', 'AMBIGUA', 'NINGUNA');

-- CreateEnum
CREATE TYPE "EstadoFilaLista" AS ENUM ('LISTO_PARA_ACTUALIZAR', 'SIN_CAMBIOS', 'NO_MACHEADO', 'CODIGO_DUPLICADO', 'FACTOR_DUDOSO', 'EXCLUIDO', 'BLOQUEADO', 'ERROR');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE_LECTURA', 'MAL_LEIDO', 'SIN_TOTAL', 'CARGADO', 'CIERRA', 'DIFIERE', 'FUERA_DE_RECETA', 'ANULADO');

-- CreateEnum
CREATE TYPE "FacturaPor" AS ENUM ('UNIDAD', 'BULTO');

-- CreateTable
CREATE TABLE "Rol" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "permisos" JSONB NOT NULL DEFAULT '[]',
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
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
    "listaPrecioDefaultId" INTEGER,
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
    "politicaLimiteCredito" TEXT NOT NULL DEFAULT 'ADVERTIR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionLocal" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "allowNegativeStock" BOOLEAN,
    "exigirClienteVenta" BOOLEAN,
    "exigirOperador" BOOLEAN,
    "aparienciaJson" JSONB,
    "mostrarStockPos" BOOLEAN,
    "arqueoCajaActivo" BOOLEAN,
    "intervaloArqueoMinutos" INTEGER,
    "toleranciaPostergacionMinutos" INTEGER,
    "postergacionCajeroMinutos" INTEGER,
    "requiereAutorizacionPostergacion" BOOLEAN,
    "fondoObjetivoCaja" DECIMAL(12,2),
    "tarjetaPrecioUnitario" BOOLEAN,
    "tarjetaOcultarEquivalencia" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionLocal_pkey" PRIMARY KEY ("id")
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
    "creadoEnLocalId" INTEGER,
    "umbralRevisarPct" DECIMAL(6,3),
    "umbralSospechaBajaPct" DECIMAL(6,3),
    "dias_pedido" "DiaPedido"[] DEFAULT ARRAY[]::"DiaPedido"[],
    "parserListaId" TEXT,
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
    "creadoEnLocalId" INTEGER,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "sku" TEXT,
    "codigo_barra" TEXT,
    "codigo_barra_secundario" TEXT,
    "categoria_id" INTEGER,
    "proveedor_id" INTEGER,
    "proveedor2_id" INTEGER,
    "proveedor3_id" INTEGER,
    "area_fisica_id" INTEGER,
    "unidad_medida" "UnidadMedida" NOT NULL,
    "factor_pack" INTEGER,
    "modo_pedido" "ModoPedido" NOT NULL DEFAULT 'BULTO',
    "modo_envio" "ModoEnvio",
    "modo_stock" "ModoStock" NOT NULL DEFAULT 'BULTO',
    "peso_kg" DECIMAL(10,3),
    "volumen_ml" DECIMAL(10,2),
    "modoCompraProveedor" "ModoPedido" NOT NULL DEFAULT 'BULTO',
    "pesoReferenciaKg" DECIMAL(10,3),
    "pesoEsFijo" BOOLEAN NOT NULL DEFAULT false,
    "modoVentaDeposito" "ModoVentaDeposito" NOT NULL DEFAULT 'PESO',
    "pesoPromedioKg" DECIMAL(10,3),
    "actualizaPromedioPorRecepcion" BOOLEAN NOT NULL DEFAULT true,
    "precio_costo" DECIMAL(12,2) NOT NULL,
    "precio_venta" DECIMAL(12,2) NOT NULL,
    "margen" DECIMAL(6,2),
    "precio_sugerido" DECIMAL(12,2),
    "iva_porcentaje" DECIMAL(5,2),
    "fecha_vencimiento" TIMESTAMP(3),
    "redondeo_100" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "imagen_url" TEXT,
    "es_combo" BOOLEAN NOT NULL DEFAULT false,
    "modalidad" "ModalidadProducto" NOT NULL DEFAULT 'NORMAL',
    "recargoServicioDefaultPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductoCodigoProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "descripcionProveedor" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "origenAlta" TEXT,
    "metodoDeteccion" TEXT,
    "descripcionNormalizada" TEXT,
    "presentacionProveedor" TEXT,
    "unidadesPorPresentacion" INTEGER,
    "confirmadaPorUsuarioId" INTEGER,
    "confirmadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoCodigoProveedor_pkey" PRIMARY KEY ("id")
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
    "reglaPrecio" "ReglaPrecio" NOT NULL DEFAULT 'MARGEN_PORCENTUAL',
    "recargoFijoUnidad" DECIMAL(12,2),
    "recargoServicioPct" DECIMAL(5,2),
    "codigo_barra_propio" TEXT,
    "precioRevisadoAt" TIMESTAMP(3),
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
    "cantidad" DECIMAL(12,3) NOT NULL,
    "enTransito" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stockMin" DECIMAL(12,2),
    "stockMax" DECIMAL(12,2),
    "limitesConfiguradosAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComboComponente" (
    "id" SERIAL NOT NULL,
    "comboProductoLocalId" INTEGER NOT NULL,
    "comboLocalId" INTEGER NOT NULL,
    "componenteProductoLocalId" INTEGER NOT NULL,
    "componenteLocalId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComboComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaPrecio" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER,
    "grupoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipoBase" "ListaPrecioTipoBase" NOT NULL DEFAULT 'PRECIO_VENTA',
    "margenPorcentaje" DECIMAL(6,2),
    "esDefault" BOOLEAN NOT NULL DEFAULT false,
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

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" SERIAL NOT NULL,
    "origenId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "fechaEnvio" TIMESTAMP(3),
    "fechaRecepcion" TIMESTAMP(3),
    "creadaPor" INTEGER,
    "posTransferenciaId" INTEGER,
    "ventaId" INTEGER,
    "tieneDiferencias" BOOLEAN NOT NULL DEFAULT false,
    "canceladaEn" TIMESTAMP(3),
    "canceladaPorId" INTEGER,
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaDetalle" (
    "id" SERIAL NOT NULL,
    "transferenciaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "recibido" DECIMAL(12,3),
    "precioCosto" DECIMAL(12,2),
    "unidadEnviada" "ModoPedido",
    "motivoDiferencia" TEXT,
    "motivoPrincipal" TEXT,
    "motivoDetalle" TEXT,
    "confirmadoPorId" INTEGER,
    "fechaRecepcion" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferenciaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTransferencia" (
    "id" SERIAL NOT NULL,
    "origenId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Borrador',
    "origenManual" BOOLEAN NOT NULL DEFAULT false,
    "solicitadoAt" TIMESTAMP(3),
    "solicitadoPorUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTransferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTransferenciaDetalle" (
    "id" SERIAL NOT NULL,
    "posTransferenciaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "sugerido" DECIMAL(12,2),
    "preparado" DECIMAL(12,2),
    "tipo" TEXT NOT NULL DEFAULT 'sugerido',
    "unidadSugerida" "ModoPedido" NOT NULL DEFAULT 'BULTO',
    "unidadPreparada" "ModoPedido",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTransferenciaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioUpdate" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "usuarioId" INTEGER,
    "metodo" "PrecioUpdateMetodo" NOT NULL,
    "pricingMode" "PrecioUpdatePricingMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioUpdateItem" (
    "id" SERIAL NOT NULL,
    "precioUpdateId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "costoAnterior" DECIMAL(12,2) NOT NULL,
    "costoNuevo" DECIMAL(12,2) NOT NULL,
    "ventaAnterior" DECIMAL(12,2) NOT NULL,
    "ventaNueva" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioUpdateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER,
    "localVinculadoId" INTEGER,
    "listaPrecioId" INTEGER,
    "nombre" TEXT NOT NULL,
    "documento" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "direccion" TEXT,
    "observaciones" TEXT,
    "limiteCredito" DECIMAL(12,2),
    "descuentoPorcentaje" DECIMAL(5,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagCliente" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "descuentoPorcentaje" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TagCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteTag" (
    "clienteId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "ClienteTag_pkey" PRIMARY KEY ("clienteId","tagId")
);

-- CreateTable
CREATE TABLE "MovimientoCuenta" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "ventaId" INTEGER,
    "correccionId" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimientoCuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venta" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "vendedorId" INTEGER NOT NULL,
    "operadorId" INTEGER,
    "clienteId" INTEGER,
    "listaPrecioId" INTEGER,
    "turnoId" INTEGER,
    "numero" INTEGER NOT NULL,
    "clientTxnId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuentoAutomatico" DECIMAL(12,2),
    "descuentoManual" DECIMAL(12,2),
    "descuentoPorPuntos" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "comisionBancaria" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "comisionPct" DECIMAL(5,2),
    "netoRecibido" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gananciaBruta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gananciaNeta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "formaPago" TEXT NOT NULL,
    "esFiado" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "corregida" BOOLEAN NOT NULL DEFAULT false,
    "ultimaCorreccionId" INTEGER,
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorId" INTEGER,
    "motivoAnulacion" TEXT,
    "observaciones" TEXT,
    "referenciaInterna" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaCorreccion" (
    "id" SERIAL NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "usuarioId" INTEGER,
    "operadorId" INTEGER,
    "localId" INTEGER,
    "grupoId" INTEGER,
    "turnoIdOriginal" INTEGER,
    "turnoIdCorreccion" INTEGER,
    "turnoCerrado" BOOLEAN NOT NULL DEFAULT false,
    "versionAntes" INTEGER NOT NULL,
    "versionDespues" INTEGER NOT NULL,
    "totalAnterior" DECIMAL(12,2) NOT NULL,
    "totalNuevo" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "snapshotAntes" JSONB NOT NULL,
    "snapshotDespues" JSONB NOT NULL,
    "diffProductos" JSONB,
    "diffPagos" JSONB,
    "impactoStock" JSONB,
    "impactoCaja" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaCorreccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaDetalle" (
    "id" SERIAL NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "listaPrecioId" INTEGER,
    "nombre" TEXT NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "precioCosto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "ganancia" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "comisionLinea" DECIMAL(12,2),
    "tipoPrecioAplicado" "TipoPrecioAplicado" NOT NULL DEFAULT 'PRECIO_VENTA',
    "margenAplicado" DECIMAL(6,2),
    "esServicio" BOOLEAN NOT NULL DEFAULT false,
    "importeBaseServicio" DECIMAL(12,2),
    "recargoServicioPct" DECIMAL(5,2),
    "recargoServicioImporte" DECIMAL(12,2),
    "productoLocalId" INTEGER,
    "cantidadStock" DECIMAL(12,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaDetalleComponente" (
    "id" SERIAL NOT NULL,
    "ventaDetalleId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "productoLocalId" INTEGER,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "precioCosto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaDetalleComponente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VentaPago" (
    "id" SERIAL NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "medio" "MedioPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "comisionPct" DECIMAL(5,2),
    "comision" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "neto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turno" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "vendedorId" INTEGER NOT NULL,
    "operadorId" INTEGER,
    "cerradoPorId" INTEGER,
    "apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cierre" TIMESTAMP(3),
    "montoInicial" DECIMAL(12,2) NOT NULL,
    "montoEsperadoEfectivo" DECIMAL(12,2),
    "montoRealEfectivo" DECIMAL(12,2),
    "diferenciaEfectivo" DECIMAL(12,2),
    "totalVentasEfectivo" DECIMAL(12,2),
    "totalVentasDigital" DECIMAL(12,2),
    "cantidadVentas" INTEGER,
    "efectivoRetiradoCierre" DECIMAL(12,2),
    "fondoDejadoCierre" DECIMAL(12,2),
    "retiroCierreMovimientoId" INTEGER,
    "destinoRetiroCierre" TEXT,
    "recibidoPorCierre" TEXT,
    "fondoSugeridoApertura" DECIMAL(12,2),
    "fondoRecibidoApertura" DECIMAL(12,2),
    "diferenciaFondoApertura" DECIMAL(12,2),
    "observacionFondoApertura" TEXT,
    "fondoOrigenTurnoId" INTEGER,
    "fondoConsumidoEnTurnoId" INTEGER,
    "cierreEnPreparacionEn" TIMESTAMP(3),
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorId" INTEGER,
    "motivoAnulacion" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoCaja" (
    "id" SERIAL NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "operadorId" INTEGER,
    "realizadoPorId" INTEGER NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "efectivoEsperado" DECIMAL(12,2) NOT NULL,
    "efectivoContado" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "observacion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'PARCIAL',
    "alertaProgramadaPara" TIMESTAMP(3),
    "minutosDemora" INTEGER,
    "fuePostergado" BOOLEAN NOT NULL DEFAULT false,
    "postergadoPorId" INTEGER,
    "motivoPostergacion" TEXT,
    "cantidadPostergaciones" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "efectivoRetirado" DECIMAL(12,2),
    "fondoObjetivo" DECIMAL(12,2),
    "fondoDejado" DECIMAL(12,2),
    "cajaMovimientoRetiroId" INTEGER,
    "estadoEntrega" "EstadoEntregaRetiro",
    "destino" TEXT,
    "recibidoPor" TEXT,
    "entregadoAt" TIMESTAMP(3),
    "entregadoPorId" INTEGER,
    "observacionEntrega" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArqueoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoPostergacion" (
    "id" SERIAL NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "alertaProgramadaPara" TIMESTAMP(3) NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "minutosDemora" INTEGER NOT NULL DEFAULT 0,
    "postergadoPorId" INTEGER NOT NULL,
    "motivo" TEXT,
    "autorizadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArqueoPostergacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CierrePreparacion" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "iniciadoPorUsuarioId" INTEGER NOT NULL,
    "iniciadoPorOperadorId" INTEGER,
    "iniciadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "corteEn" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoCierrePreparacion" NOT NULL DEFAULT 'PREPARANDO',
    "efectivoEsperadoCorte" DECIMAL(12,2) NOT NULL,
    "ultimaVentaId" INTEGER,
    "ultimoMovimientoId" INTEGER,
    "cantidadVentasCorte" INTEGER NOT NULL DEFAULT 0,
    "desgloseCambio" JSONB,
    "totalCambio" DECIMAL(12,2),
    "efectivoRetiradoEsperado" DECIMAL(12,2),
    "desgloseRetiroContado" JSONB,
    "totalRetiroContado" DECIMAL(12,2),
    "desgloseContado" JSONB,
    "totalContado" DECIMAL(12,2),
    "retiroFinal" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "observacion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "confirmadoEn" TIMESTAMP(3),
    "arqueoFinalId" INTEGER,
    "canceladoEn" TIMESTAMP(3),
    "canceladoPorUsuarioId" INTEGER,
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CierrePreparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetiroPreparacion" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "iniciadoPorUsuarioId" INTEGER NOT NULL,
    "iniciadoPorOperadorId" INTEGER,
    "corteEn" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoRetiroPreparacion" NOT NULL DEFAULT 'PREPARANDO',
    "efectivoEsperadoCorte" DECIMAL(12,2) NOT NULL,
    "ultimaVentaId" INTEGER,
    "ultimoMovimientoId" INTEGER,
    "desgloseCambio" JSONB NOT NULL,
    "totalCambio" DECIMAL(12,2) NOT NULL,
    "efectivoRetiradoEsperado" DECIMAL(12,2) NOT NULL,
    "desgloseRetiroContado" JSONB,
    "totalRetiroContado" DECIMAL(12,2),
    "totalCajonDerivado" DECIMAL(12,2),
    "diferencia" DECIMAL(12,2),
    "observacion" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "confirmadoEn" TIMESTAMP(3),
    "arqueoCajaId" INTEGER,
    "canceladoEn" TIMESTAMP(3),
    "canceladoPorUsuarioId" INTEGER,
    "motivoCancelacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetiroPreparacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CambioPendiente" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "cierrePreparacionId" INTEGER NOT NULL,
    "turnoOrigenId" INTEGER NOT NULL,
    "operadorOrigenId" INTEGER,
    "dejadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(12,2) NOT NULL,
    "desglose" JSONB NOT NULL,
    "observacion" TEXT,
    "estado" "EstadoCambioPendiente" NOT NULL DEFAULT 'DISPONIBLE',
    "reservadoPorUsuarioId" INTEGER,
    "reservadoPorOperadorId" INTEGER,
    "reservadoEn" TIMESTAMP(3),
    "reservaVenceEn" TIMESTAMP(3),
    "turnoDestinoId" INTEGER,
    "recibidoPorUsuarioId" INTEGER,
    "recibidoPorOperadorId" INTEGER,
    "recibidoEn" TIMESTAMP(3),
    "totalRecibido" DECIMAL(12,2),
    "desgloseRecibido" JSONB,
    "diferencia" DECIMAL(12,2),
    "motivoDiferencia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CambioPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CajaMovimiento" (
    "id" SERIAL NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CajaMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntosConfigLocal" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "reglasJson" JSONB,
    "redencionJson" JSONB,
    "exclusionesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PuntosConfigLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientePuntoMovimiento" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "direccion" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "ventaId" INTEGER,
    "correccionId" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientePuntoMovimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosVentaCounter" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosVentaCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "depositoId" INTEGER NOT NULL,
    "creadoEnLocalId" INTEGER,
    "proveedorId" INTEGER NOT NULL,
    "estado" "EstadoPedidoProveedor" NOT NULL DEFAULT 'BORRADOR',
    "notas" TEXT,
    "fechaConfirmado" TIMESTAMP(3),
    "fechaEnviado" TIMESTAMP(3),
    "fechaRecibido" TIMESTAMP(3),
    "fechaAnulado" TIMESTAMP(3),
    "totalFactura" DECIMAL(12,2),
    "totalReal" DECIMAL(12,2),
    "nroFactura" TEXT,
    "fechaFactura" TIMESTAMP(3),
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoProveedorDetalle" (
    "id" SERIAL NOT NULL,
    "pedidoId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "unidad" "ModoPedido" NOT NULL DEFAULT 'BULTO',
    "cantidadRecibida" DECIMAL(12,2),
    "kgRecibidos" DECIMAL(12,3),
    "precioCosto" DECIMAL(18,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoProveedorDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionGrupo" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "allowNegativeStock" BOOLEAN NOT NULL DEFAULT false,
    "requireMotivoAjusteStock" BOOLEAN NOT NULL DEFAULT false,
    "requireMotivoLimitesStock" BOOLEAN NOT NULL DEFAULT false,
    "exigirClienteVentasDeposito" BOOLEAN NOT NULL DEFAULT false,
    "exigirClienteVentasLocal" BOOLEAN NOT NULL DEFAULT false,
    "comisionDebito" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "comisionCredito" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "comisionMercadopago" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionGrupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaStock" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "cantidadAnterior" DECIMAL(14,3),
    "cantidadNueva" DECIMAL(14,3),
    "stockMinAnterior" DECIMAL(12,2),
    "stockMinNuevo" DECIMAL(12,2),
    "stockMaxAnterior" DECIMAL(12,2),
    "stockMaxNuevo" DECIMAL(12,2),
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaBitacora" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioId" INTEGER,
    "operadorId" INTEGER,
    "localId" INTEGER,
    "grupoId" INTEGER,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "entidadNombre" TEXT,
    "cambios" JSONB,

    CONSTRAINT "AuditoriaBitacora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperadorLocal" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperadorLocal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperadorEnLocal" (
    "operadorId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,

    CONSTRAINT "OperadorEnLocal_pkey" PRIMARY KEY ("operadorId","localId")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT,
    "href" TEXT,
    "entidadTipo" TEXT,
    "entidadId" INTEGER,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localId" INTEGER,
    "origenLocalId" INTEGER,
    "destinoLocalId" INTEGER,
    "alcance" "AlcanceNotificacion" NOT NULL DEFAULT 'GRUPO',
    "permisoRequerido" TEXT,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificacionLectura" (
    "id" SERIAL NOT NULL,
    "notificacionId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "leidaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificacionLectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "localId" INTEGER,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportacionListaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "localOperativoId" INTEGER NOT NULL,
    "archivoNombre" TEXT NOT NULL,
    "archivoTamano" INTEGER NOT NULL,
    "archivoHash" TEXT NOT NULL,
    "archivoUbicacion" TEXT,
    "parser" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "recargoPct" DECIMAL(6,3) NOT NULL,
    "umbralVariacionPct" DECIMAL(6,3) NOT NULL,
    "aumentoEsperadoMinPct" DECIMAL(6,3),
    "aumentoEsperadoMaxPct" DECIMAL(6,3),
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
    "canceladaEn" TIMESTAMP(3),
    "canceladaPorUsuarioId" INTEGER,
    "terminadaEn" TIMESTAMP(3),
    "terminadaPorUsuarioId" INTEGER,
    "aplicadaPorUsuarioId" INTEGER,
    "aplicadas" INTEGER NOT NULL DEFAULT 0,
    "omitidas" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionListaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "precioConIva" DECIMAL(18,6) NOT NULL,
    "precioSinIva" DECIMAL(18,6),
    "productoBaseId" INTEGER,
    "codigoProveedorId" INTEGER,
    "tipoCoincidencia" "TipoCoincidenciaLista" NOT NULL DEFAULT 'NINGUNA',
    "sufijoDigitos" INTEGER,
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
    "resultadoInterpretacion" TEXT,
    "seleccionable" BOOLEAN NOT NULL DEFAULT false,
    "seleccionada" BOOLEAN NOT NULL DEFAULT false,
    "excluidaManual" BOOLEAN NOT NULL DEFAULT false,
    "baseConfirmada" TEXT,
    "multiplicadorConfirmado" INTEGER,
    "cantidadPresentacion" INTEGER,
    "aumentoEsperadoMinPct" DECIMAL(6,3),
    "aumentoEsperadoMaxPct" DECIMAL(6,3),
    "unidadesConfirmadas" INTEGER,
    "factorConfirmado" INTEGER,
    "confirmadoPorUsuarioId" INTEGER,
    "confirmadoEn" TIMESTAMP(3),
    "vinculadoPorUsuarioId" INTEGER,
    "vinculadoEn" TIMESTAMP(3),
    "origenVinculo" TEXT,
    "aplicada" BOOLEAN NOT NULL DEFAULT false,
    "costoAplicado" DECIMAL(12,2),
    "aplicadaEn" TIMESTAMP(3),
    "aplicadaPorUsuarioId" INTEGER,
    "resultadoAplicacion" TEXT,
    "motivoAplicacion" TEXT,
    "costoPrevioAplicacion" DECIMAL(12,2),
    "ventaAnterior" DECIMAL(12,2),
    "ventaNueva" DECIMAL(12,2),
    "revertidaEn" TIMESTAMP(3),
    "revertidaPorUsuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportacionListaFila_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "RecetaLecturaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "receta" JSONB NOT NULL,
    "explicacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmadaPorUsuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecetaLecturaProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "pedidoId" INTEGER,
    "localOperativoId" INTEGER NOT NULL,
    "usuarioId" INTEGER,
    "tipo" TEXT,
    "puntoVenta" TEXT,
    "numero" TEXT,
    "fecha" TIMESTAMP(3),
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
    "lineasEnElPapel" INTEGER,
    "lineasTranscriptas" INTEGER,
    "modeloLectura" TEXT,
    "leidoEn" TIMESTAMP(3),
    "intentosLectura" INTEGER NOT NULL DEFAULT 0,
    "cerroEnIntento" INTEGER,
    "usoRespaldo" BOOLEAN NOT NULL DEFAULT false,
    "motivoPaseRespaldo" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSalida" INTEGER,
    "costoMicroUsd" INTEGER,
    "confirmadoEn" TIMESTAMP(3),
    "venceEn" TIMESTAMP(3),
    "imagenBorradaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprobanteProveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteArchivo" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "mime" TEXT,
    "hash" TEXT NOT NULL,
    "ubicacion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComprobanteArchivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteLinea" (
    "id" SERIAL NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,
    "textoCrudo" TEXT NOT NULL,
    "codigoProveedor" TEXT,
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
    "precioPedidoPrevio" DECIMAL(18,6),
    "claseDiferencia" TEXT,
    "diferenciaPct" DECIMAL(6,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprobanteLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlamadaLector" (
    "id" SERIAL NOT NULL,
    "modelo" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "comprobanteId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlamadaLector_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_nombre_key" ON "Rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Grupo_nombre_key" ON "Grupo"("nombre");

-- CreateIndex
CREATE INDEX "GrupoDeposito_listaPrecioDefaultId_idx" ON "GrupoDeposito"("listaPrecioDefaultId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoDeposito_grupoId_localId_key" ON "GrupoDeposito"("grupoId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoLocal_localId_key" ON "GrupoLocal"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoLocal_grupoId_localId_key" ON "GrupoLocal"("grupoId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionLocal_localId_key" ON "ConfiguracionLocal"("localId");

-- CreateIndex
CREATE INDEX "ConfiguracionLocal_localId_idx" ON "ConfiguracionLocal"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_cuit_key" ON "Proveedor"("cuit");

-- CreateIndex
CREATE INDEX "Proveedor_creadoEnLocalId_idx" ON "Proveedor"("creadoEnLocalId");

-- CreateIndex
CREATE INDEX "ProductoBase_grupoId_idx" ON "ProductoBase"("grupoId");

-- CreateIndex
CREATE INDEX "ProductoBase_grupoId_codigo_barra_secundario_idx" ON "ProductoBase"("grupoId", "codigo_barra_secundario");

-- CreateIndex
CREATE INDEX "ProductoBase_creadoEnLocalId_idx" ON "ProductoBase"("creadoEnLocalId");

-- CreateIndex
CREATE INDEX "ProductoBase_categoria_id_idx" ON "ProductoBase"("categoria_id");

-- CreateIndex
CREATE INDEX "ProductoBase_proveedor_id_idx" ON "ProductoBase"("proveedor_id");

-- CreateIndex
CREATE INDEX "ProductoBase_proveedor2_id_idx" ON "ProductoBase"("proveedor2_id");

-- CreateIndex
CREATE INDEX "ProductoBase_proveedor3_id_idx" ON "ProductoBase"("proveedor3_id");

-- CreateIndex
CREATE INDEX "ProductoBase_area_fisica_id_idx" ON "ProductoBase"("area_fisica_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoBase_grupoId_codigo_barra_key" ON "ProductoBase"("grupoId", "codigo_barra");

-- CreateIndex
CREATE INDEX "ProductoCodigoProveedor_grupoId_proveedorId_codigoInterno_idx" ON "ProductoCodigoProveedor"("grupoId", "proveedorId", "codigoInterno");

-- CreateIndex
CREATE INDEX "ProductoCodigoProveedor_grupoId_proveedorId_descripcionNorma_id" ON "ProductoCodigoProveedor"("grupoId", "proveedorId", "descripcionNormalizada");

-- CreateIndex
CREATE INDEX "ProductoCodigoProveedor_productoBaseId_idx" ON "ProductoCodigoProveedor"("productoBaseId");

-- CreateIndex
CREATE INDEX "ProductoCodigoProveedor_proveedorId_idx" ON "ProductoCodigoProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_interno_unico_por_proveedor" ON "ProductoCodigoProveedor"("grupoId", "proveedorId", "codigoInterno");

-- CreateIndex
CREATE INDEX "ProductoLocal_localId_idx" ON "ProductoLocal"("localId");

-- CreateIndex
CREATE INDEX "ProductoLocal_baseId_idx" ON "ProductoLocal"("baseId");

-- CreateIndex
CREATE INDEX "ProductoLocal_precioRevisadoAt_idx" ON "ProductoLocal"("precioRevisadoAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoLocal_localId_baseId_key" ON "ProductoLocal"("localId", "baseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoLocal_id_localId_key" ON "ProductoLocal"("id", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoLocal_localId_codigo_barra_propio_key" ON "ProductoLocal"("localId", "codigo_barra_propio");

-- CreateIndex
CREATE INDEX "StockLocal_localId_idx" ON "StockLocal"("localId");

-- CreateIndex
CREATE INDEX "StockLocal_productoId_idx" ON "StockLocal"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocal_localId_productoId_key" ON "StockLocal"("localId", "productoId");

-- CreateIndex
CREATE INDEX "ComboComponente_componentePL_idx" ON "ComboComponente"("componenteProductoLocalId", "componenteLocalId");

-- CreateIndex
CREATE INDEX "ComboComponente_comboLocalId_idx" ON "ComboComponente"("comboLocalId");

-- CreateIndex
CREATE UNIQUE INDEX "ComboComponente_combo_componente_key" ON "ComboComponente"("comboProductoLocalId", "componenteProductoLocalId");

-- CreateIndex
CREATE INDEX "ListaPrecio_localId_idx" ON "ListaPrecio"("localId");

-- CreateIndex
CREATE INDEX "ListaPrecio_grupoId_idx" ON "ListaPrecio"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "ListaPrecio_localId_nombre_key" ON "ListaPrecio"("localId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ListaPrecio_grupoId_nombre_key" ON "ListaPrecio"("grupoId", "nombre");

-- CreateIndex
CREATE INDEX "ProductoListaPrecio_listaPrecioId_idx" ON "ProductoListaPrecio"("listaPrecioId");

-- CreateIndex
CREATE INDEX "ProductoListaPrecio_baseId_idx" ON "ProductoListaPrecio"("baseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoListaPrecio_listaPrecioId_baseId_key" ON "ProductoListaPrecio"("listaPrecioId", "baseId");

-- CreateIndex
CREATE UNIQUE INDEX "Transferencia_ventaId_key" ON "Transferencia"("ventaId");

-- CreateIndex
CREATE INDEX "Transferencia_origenId_idx" ON "Transferencia"("origenId");

-- CreateIndex
CREATE INDEX "Transferencia_destinoId_idx" ON "Transferencia"("destinoId");

-- CreateIndex
CREATE INDEX "Transferencia_estado_idx" ON "Transferencia"("estado");

-- CreateIndex
CREATE INDEX "Transferencia_createdAt_idx" ON "Transferencia"("createdAt");

-- CreateIndex
CREATE INDEX "Transferencia_posTransferenciaId_idx" ON "Transferencia"("posTransferenciaId");

-- CreateIndex
CREATE INDEX "TransferenciaDetalle_transferenciaId_idx" ON "TransferenciaDetalle"("transferenciaId");

-- CreateIndex
CREATE INDEX "TransferenciaDetalle_productoId_idx" ON "TransferenciaDetalle"("productoId");

-- CreateIndex
CREATE INDEX "PosTransferencia_origenId_idx" ON "PosTransferencia"("origenId");

-- CreateIndex
CREATE INDEX "PosTransferencia_destinoId_idx" ON "PosTransferencia"("destinoId");

-- CreateIndex
CREATE INDEX "PosTransferencia_usuarioId_idx" ON "PosTransferencia"("usuarioId");

-- CreateIndex
CREATE INDEX "PosTransferencia_estado_idx" ON "PosTransferencia"("estado");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_posTransferenciaId_idx" ON "PosTransferenciaDetalle"("posTransferenciaId");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_productoId_idx" ON "PosTransferenciaDetalle"("productoId");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_tipo_idx" ON "PosTransferenciaDetalle"("tipo");

-- CreateIndex
CREATE INDEX "PrecioUpdate_grupoId_idx" ON "PrecioUpdate"("grupoId");

-- CreateIndex
CREATE INDEX "PrecioUpdate_proveedorId_idx" ON "PrecioUpdate"("proveedorId");

-- CreateIndex
CREATE INDEX "PrecioUpdateItem_productoBaseId_idx" ON "PrecioUpdateItem"("productoBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_localVinculadoId_key" ON "Cliente"("localVinculadoId");

-- CreateIndex
CREATE INDEX "Cliente_grupoId_idx" ON "Cliente"("grupoId");

-- CreateIndex
CREATE INDEX "Cliente_localId_idx" ON "Cliente"("localId");

-- CreateIndex
CREATE INDEX "Cliente_grupoId_localId_idx" ON "Cliente"("grupoId", "localId");

-- CreateIndex
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- CreateIndex
CREATE INDEX "Cliente_listaPrecioId_idx" ON "Cliente"("listaPrecioId");

-- CreateIndex
CREATE INDEX "TagCliente_localId_idx" ON "TagCliente"("localId");

-- CreateIndex
CREATE UNIQUE INDEX "TagCliente_localId_nombre_key" ON "TagCliente"("localId", "nombre");

-- CreateIndex
CREATE INDEX "ClienteTag_clienteId_idx" ON "ClienteTag"("clienteId");

-- CreateIndex
CREATE INDEX "ClienteTag_tagId_idx" ON "ClienteTag"("tagId");

-- CreateIndex
CREATE INDEX "MovimientoCuenta_grupoId_localId_clienteId_idx" ON "MovimientoCuenta"("grupoId", "localId", "clienteId");

-- CreateIndex
CREATE INDEX "MovimientoCuenta_clienteId_idx" ON "MovimientoCuenta"("clienteId");

-- CreateIndex
CREATE INDEX "MovimientoCuenta_localId_idx" ON "MovimientoCuenta"("localId");

-- CreateIndex
CREATE INDEX "MovimientoCuenta_createdAt_idx" ON "MovimientoCuenta"("createdAt");

-- CreateIndex
CREATE INDEX "MovimientoCuenta_userId_idx" ON "MovimientoCuenta"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCuenta_ventaId_tipo_correccionId_key" ON "MovimientoCuenta"("ventaId", "tipo", "correccionId");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_clientTxnId_key" ON "Venta"("clientTxnId");

-- CreateIndex
CREATE INDEX "Venta_localId_idx" ON "Venta"("localId");

-- CreateIndex
CREATE INDEX "Venta_fecha_idx" ON "Venta"("fecha");

-- CreateIndex
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");

-- CreateIndex
CREATE INDEX "Venta_turnoId_idx" ON "Venta"("turnoId");

-- CreateIndex
CREATE INDEX "Venta_clientTxnId_idx" ON "Venta"("clientTxnId");

-- CreateIndex
CREATE INDEX "Venta_operadorId_idx" ON "Venta"("operadorId");

-- CreateIndex
CREATE INDEX "Venta_listaPrecioId_idx" ON "Venta"("listaPrecioId");

-- CreateIndex
CREATE INDEX "Venta_anuladaEn_idx" ON "Venta"("anuladaEn");

-- CreateIndex
CREATE UNIQUE INDEX "Venta_localId_numero_key" ON "Venta"("localId", "numero");

-- CreateIndex
CREATE INDEX "VentaCorreccion_ventaId_idx" ON "VentaCorreccion"("ventaId");

-- CreateIndex
CREATE INDEX "VentaCorreccion_usuarioId_idx" ON "VentaCorreccion"("usuarioId");

-- CreateIndex
CREATE INDEX "VentaCorreccion_createdAt_idx" ON "VentaCorreccion"("createdAt");

-- CreateIndex
CREATE INDEX "VentaCorreccion_tipo_idx" ON "VentaCorreccion"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "VentaCorreccion_ventaId_idempotencyKey_key" ON "VentaCorreccion"("ventaId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "VentaDetalle_ventaId_idx" ON "VentaDetalle"("ventaId");

-- CreateIndex
CREATE INDEX "VentaDetalle_productoBaseId_idx" ON "VentaDetalle"("productoBaseId");

-- CreateIndex
CREATE INDEX "VentaDetalle_listaPrecioId_idx" ON "VentaDetalle"("listaPrecioId");

-- CreateIndex
CREATE INDEX "VentaDetalleComponente_ventaDetalleId_idx" ON "VentaDetalleComponente"("ventaDetalleId");

-- CreateIndex
CREATE INDEX "VentaDetalleComponente_productoBaseId_idx" ON "VentaDetalleComponente"("productoBaseId");

-- CreateIndex
CREATE INDEX "VentaDetalleComponente_productoLocalId_idx" ON "VentaDetalleComponente"("productoLocalId");

-- CreateIndex
CREATE INDEX "VentaPago_ventaId_idx" ON "VentaPago"("ventaId");

-- CreateIndex
CREATE INDEX "VentaPago_medio_idx" ON "VentaPago"("medio");

-- CreateIndex
CREATE UNIQUE INDEX "VentaPago_ventaId_medio_key" ON "VentaPago"("ventaId", "medio");

-- CreateIndex
CREATE UNIQUE INDEX "Turno_fondoOrigenTurnoId_key" ON "Turno"("fondoOrigenTurnoId");

-- CreateIndex
CREATE INDEX "Turno_localId_idx" ON "Turno"("localId");

-- CreateIndex
CREATE INDEX "Turno_vendedorId_idx" ON "Turno"("vendedorId");

-- CreateIndex
CREATE INDEX "Turno_apertura_idx" ON "Turno"("apertura");

-- CreateIndex
CREATE INDEX "Turno_operadorId_idx" ON "Turno"("operadorId");

-- CreateIndex
CREATE INDEX "Turno_localId_vendedorId_cierre_cierreEnPreparacionEn_idx" ON "Turno"("localId", "vendedorId", "cierre", "cierreEnPreparacionEn");

-- CreateIndex
CREATE UNIQUE INDEX "ArqueoCaja_cajaMovimientoRetiroId_key" ON "ArqueoCaja"("cajaMovimientoRetiroId");

-- CreateIndex
CREATE INDEX "ArqueoCaja_turnoId_idx" ON "ArqueoCaja"("turnoId");

-- CreateIndex
CREATE INDEX "ArqueoCaja_localId_idx" ON "ArqueoCaja"("localId");

-- CreateIndex
CREATE INDEX "ArqueoCaja_fechaHora_idx" ON "ArqueoCaja"("fechaHora");

-- CreateIndex
CREATE INDEX "ArqueoCaja_tipo_idx" ON "ArqueoCaja"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ArqueoCaja_turnoId_idempotencyKey_key" ON "ArqueoCaja"("turnoId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_turnoId_idx" ON "ArqueoPostergacion"("turnoId");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_localId_idx" ON "ArqueoPostergacion"("localId");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_venceEn_idx" ON "ArqueoPostergacion"("venceEn");

-- CreateIndex
CREATE UNIQUE INDEX "CierrePreparacion_token_key" ON "CierrePreparacion"("token");

-- CreateIndex
CREATE UNIQUE INDEX "CierrePreparacion_arqueoFinalId_key" ON "CierrePreparacion"("arqueoFinalId");

-- CreateIndex
CREATE INDEX "CierrePreparacion_turnoId_idx" ON "CierrePreparacion"("turnoId");

-- CreateIndex
CREATE INDEX "CierrePreparacion_localId_estado_idx" ON "CierrePreparacion"("localId", "estado");

-- CreateIndex
CREATE INDEX "CierrePreparacion_grupoId_idx" ON "CierrePreparacion"("grupoId");

-- CreateIndex
CREATE INDEX "CierrePreparacion_venceEn_idx" ON "CierrePreparacion"("venceEn");

-- CreateIndex
CREATE UNIQUE INDEX "RetiroPreparacion_token_key" ON "RetiroPreparacion"("token");

-- CreateIndex
CREATE UNIQUE INDEX "RetiroPreparacion_arqueoCajaId_key" ON "RetiroPreparacion"("arqueoCajaId");

-- CreateIndex
CREATE INDEX "RetiroPreparacion_turnoId_idx" ON "RetiroPreparacion"("turnoId");

-- CreateIndex
CREATE INDEX "RetiroPreparacion_localId_estado_idx" ON "RetiroPreparacion"("localId", "estado");

-- CreateIndex
CREATE INDEX "RetiroPreparacion_corteEn_idx" ON "RetiroPreparacion"("corteEn");

-- CreateIndex
CREATE UNIQUE INDEX "CambioPendiente_cierrePreparacionId_key" ON "CambioPendiente"("cierrePreparacionId");

-- CreateIndex
CREATE UNIQUE INDEX "CambioPendiente_turnoDestinoId_key" ON "CambioPendiente"("turnoDestinoId");

-- CreateIndex
CREATE INDEX "CambioPendiente_localId_estado_idx" ON "CambioPendiente"("localId", "estado");

-- CreateIndex
CREATE INDEX "CambioPendiente_grupoId_idx" ON "CambioPendiente"("grupoId");

-- CreateIndex
CREATE INDEX "CambioPendiente_reservaVenceEn_idx" ON "CambioPendiente"("reservaVenceEn");

-- CreateIndex
CREATE INDEX "CambioPendiente_turnoOrigenId_idx" ON "CambioPendiente"("turnoOrigenId");

-- CreateIndex
CREATE INDEX "CajaMovimiento_turnoId_idx" ON "CajaMovimiento"("turnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PuntosConfigLocal_localId_key" ON "PuntosConfigLocal"("localId");

-- CreateIndex
CREATE INDEX "PuntosConfigLocal_grupoId_idx" ON "PuntosConfigLocal"("grupoId");

-- CreateIndex
CREATE INDEX "PuntosConfigLocal_localId_idx" ON "PuntosConfigLocal"("localId");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_grupoId_localId_clienteId_idx" ON "ClientePuntoMovimiento"("grupoId", "localId", "clienteId");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_localId_idx" ON "ClientePuntoMovimiento"("localId");

-- CreateIndex
CREATE INDEX "ClientePuntoMovimiento_createdAt_idx" ON "ClientePuntoMovimiento"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientePuntoMovimiento_ventaId_tipo_correccionId_key" ON "ClientePuntoMovimiento"("ventaId", "tipo", "correccionId");

-- CreateIndex
CREATE UNIQUE INDEX "PosVentaCounter_localId_key" ON "PosVentaCounter"("localId");

-- CreateIndex
CREATE INDEX "PosVentaCounter_localId_idx" ON "PosVentaCounter"("localId");

-- CreateIndex
CREATE INDEX "PosVentaCounter_grupoId_idx" ON "PosVentaCounter"("grupoId");

-- CreateIndex
CREATE INDEX "PedidoProveedor_grupoId_idx" ON "PedidoProveedor"("grupoId");

-- CreateIndex
CREATE INDEX "PedidoProveedor_depositoId_idx" ON "PedidoProveedor"("depositoId");

-- CreateIndex
CREATE INDEX "PedidoProveedor_creadoEnLocalId_idx" ON "PedidoProveedor"("creadoEnLocalId");

-- CreateIndex
CREATE INDEX "PedidoProveedor_proveedorId_idx" ON "PedidoProveedor"("proveedorId");

-- CreateIndex
CREATE INDEX "PedidoProveedor_estado_idx" ON "PedidoProveedor"("estado");

-- CreateIndex
CREATE INDEX "PedidoProveedor_createdAt_idx" ON "PedidoProveedor"("createdAt");

-- CreateIndex
CREATE INDEX "PedidoProveedorDetalle_pedidoId_idx" ON "PedidoProveedorDetalle"("pedidoId");

-- CreateIndex
CREATE INDEX "PedidoProveedorDetalle_productoLocalId_idx" ON "PedidoProveedorDetalle"("productoLocalId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionGrupo_grupoId_key" ON "ConfiguracionGrupo"("grupoId");

-- CreateIndex
CREATE INDEX "ConfiguracionGrupo_grupoId_idx" ON "ConfiguracionGrupo"("grupoId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_localId_key" ON "TicketConfig"("localId");

-- CreateIndex
CREATE INDEX "TicketConfig_localId_idx" ON "TicketConfig"("localId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_grupoId_localId_idx" ON "AuditoriaStock"("grupoId", "localId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_productoLocalId_idx" ON "AuditoriaStock"("productoLocalId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_createdAt_idx" ON "AuditoriaStock"("createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_createdAt_idx" ON "AuditoriaBitacora"("createdAt");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_localId_idx" ON "AuditoriaBitacora"("localId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_usuarioId_idx" ON "AuditoriaBitacora"("usuarioId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_operadorId_idx" ON "AuditoriaBitacora"("operadorId");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_entidad_idx" ON "AuditoriaBitacora"("entidad");

-- CreateIndex
CREATE INDEX "AuditoriaBitacora_accion_idx" ON "AuditoriaBitacora"("accion");

-- CreateIndex
CREATE UNIQUE INDEX "OperadorLocal_nombre_key" ON "OperadorLocal"("nombre");

-- CreateIndex
CREATE INDEX "OperadorEnLocal_localId_idx" ON "OperadorEnLocal"("localId");

-- CreateIndex
CREATE INDEX "Notificacion_grupoId_idx" ON "Notificacion"("grupoId");

-- CreateIndex
CREATE INDEX "Notificacion_usuarioId_idx" ON "Notificacion"("usuarioId");

-- CreateIndex
CREATE INDEX "Notificacion_grupoId_leida_idx" ON "Notificacion"("grupoId", "leida");

-- CreateIndex
CREATE INDEX "Notificacion_localId_idx" ON "Notificacion"("localId");

-- CreateIndex
CREATE INDEX "Notificacion_alcance_idx" ON "Notificacion"("alcance");

-- CreateIndex
CREATE INDEX "NotificacionLectura_usuarioId_idx" ON "NotificacionLectura"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificacionLectura_notificacionId_usuarioId_key" ON "NotificacionLectura"("notificacionId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_grupoId_idx" ON "PushSubscription"("grupoId");

-- CreateIndex
CREATE INDEX "PushSubscription_usuarioId_idx" ON "PushSubscription"("usuarioId");

-- CreateIndex
CREATE INDEX "PushSubscription_localId_idx" ON "PushSubscription"("localId");

-- CreateIndex
CREATE INDEX "PushSubscription_endpoint_idx" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_grupoId_activo_idx" ON "PushSubscription"("grupoId", "activo");

-- CreateIndex
CREATE INDEX "ImportacionListaProveedor_grupoId_proveedorId_archivoHash_idx" ON "ImportacionListaProveedor"("grupoId", "proveedorId", "archivoHash");

-- CreateIndex
CREATE INDEX "ImportacionListaProveedor_grupoId_proveedorId_createdAt_idx" ON "ImportacionListaProveedor"("grupoId", "proveedorId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportacionListaProveedor_grupoId_estado_idx" ON "ImportacionListaProveedor"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "ImportacionListaProveedor_usuarioId_idx" ON "ImportacionListaProveedor"("usuarioId");

-- CreateIndex
CREATE INDEX "ImportacionListaFila_importacionId_estado_idx" ON "ImportacionListaFila"("importacionId", "estado");

-- CreateIndex
CREATE INDEX "ImportacionListaFila_importacionId_codigoNormalizado_idx" ON "ImportacionListaFila"("importacionId", "codigoNormalizado");

-- CreateIndex
CREATE INDEX "ImportacionListaFila_productoBaseId_idx" ON "ImportacionListaFila"("productoBaseId");

-- CreateIndex
CREATE INDEX "ImportacionListaFila_importacionId_filaExcel_idx" ON "ImportacionListaFila"("importacionId", "filaExcel");

-- CreateIndex
CREATE INDEX "ImportacionListaFila_importacionId_resultadoInterpretacion_idx" ON "ImportacionListaFila"("importacionId", "resultadoInterpretacion");

-- CreateIndex
CREATE UNIQUE INDEX "fila_unica_por_importacion" ON "ImportacionListaFila"("importacionId", "hojaNombre", "filaExcel");

-- CreateIndex
CREATE INDEX "RecetaProveedor_proveedorId_idx" ON "RecetaProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaProveedor_grupoId_proveedorId_key" ON "RecetaProveedor"("grupoId", "proveedorId");

-- CreateIndex
CREATE INDEX "RecetaLecturaProveedor_proveedorId_idx" ON "RecetaLecturaProveedor"("proveedorId");

-- CreateIndex
CREATE UNIQUE INDEX "RecetaLecturaProveedor_grupoId_proveedorId_nombre_key" ON "RecetaLecturaProveedor"("grupoId", "proveedorId", "nombre");

-- CreateIndex
CREATE INDEX "ComprobanteProveedor_grupoId_proveedorId_puntoVenta_numero_idx" ON "ComprobanteProveedor"("grupoId", "proveedorId", "puntoVenta", "numero");

-- CreateIndex
CREATE INDEX "ComprobanteProveedor_grupoId_pedidoId_idx" ON "ComprobanteProveedor"("grupoId", "pedidoId");

-- CreateIndex
CREATE INDEX "ComprobanteProveedor_grupoId_estado_idx" ON "ComprobanteProveedor"("grupoId", "estado");

-- CreateIndex
CREATE INDEX "ComprobanteProveedor_grupoId_estado_createdAt_idx" ON "ComprobanteProveedor"("grupoId", "estado", "createdAt");

-- CreateIndex
CREATE INDEX "ComprobanteProveedor_venceEn_imagenBorradaEn_idx" ON "ComprobanteProveedor"("venceEn", "imagenBorradaEn");

-- CreateIndex
CREATE INDEX "ComprobanteArchivo_comprobanteId_idx" ON "ComprobanteArchivo"("comprobanteId");

-- CreateIndex
CREATE INDEX "ComprobanteArchivo_hash_idx" ON "ComprobanteArchivo"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobanteArchivo_comprobanteId_orden_key" ON "ComprobanteArchivo"("comprobanteId", "orden");

-- CreateIndex
CREATE INDEX "ComprobanteLinea_comprobanteId_orden_idx" ON "ComprobanteLinea"("comprobanteId", "orden");

-- CreateIndex
CREATE INDEX "ComprobanteLinea_productoLocalId_idx" ON "ComprobanteLinea"("productoLocalId");

-- CreateIndex
CREATE INDEX "ComprobanteLinea_pedidoDetalleId_idx" ON "ComprobanteLinea"("pedidoDetalleId");

-- CreateIndex
CREATE INDEX "ComprobanteLinea_codigoProveedor_idx" ON "ComprobanteLinea"("codigoProveedor");

-- CreateIndex
CREATE INDEX "LlamadaLector_creadoEn_modelo_idx" ON "LlamadaLector"("creadoEn", "modelo");

-- AddForeignKey
ALTER TABLE "GrupoDeposito" ADD CONSTRAINT "GrupoDeposito_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoDeposito" ADD CONSTRAINT "GrupoDeposito_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoDeposito" ADD CONSTRAINT "GrupoDeposito_listaPrecioDefaultId_fkey" FOREIGN KEY ("listaPrecioDefaultId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoLocal" ADD CONSTRAINT "GrupoLocal_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoLocal" ADD CONSTRAINT "GrupoLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracionLocal" ADD CONSTRAINT "ConfiguracionLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_creadoEnLocalId_fkey" FOREIGN KEY ("creadoEnLocalId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_area_fisica_id_fkey" FOREIGN KEY ("area_fisica_id") REFERENCES "AreaFisica"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_creadoEnLocalId_fkey" FOREIGN KEY ("creadoEnLocalId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_proveedor2_id_fkey" FOREIGN KEY ("proveedor2_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_proveedor3_id_fkey" FOREIGN KEY ("proveedor3_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoLocal" ADD CONSTRAINT "ProductoLocal_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "ProductoBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoLocal" ADD CONSTRAINT "ProductoLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocal" ADD CONSTRAINT "StockLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocal" ADD CONSTRAINT "StockLocal_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponente" ADD CONSTRAINT "ComboComponente_comboPL_fkey" FOREIGN KEY ("comboProductoLocalId", "comboLocalId") REFERENCES "ProductoLocal"("id", "localId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComboComponente" ADD CONSTRAINT "ComboComponente_componentePL_fkey" FOREIGN KEY ("componenteProductoLocalId", "componenteLocalId") REFERENCES "ProductoLocal"("id", "localId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoListaPrecio" ADD CONSTRAINT "ProductoListaPrecio_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_posTransferenciaId_fkey" FOREIGN KEY ("posTransferenciaId") REFERENCES "PosTransferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "Transferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_solicitadoPorUserId_fkey" FOREIGN KEY ("solicitadoPorUserId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_posTransferenciaId_fkey" FOREIGN KEY ("posTransferenciaId") REFERENCES "PosTransferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecioUpdateItem" ADD CONSTRAINT "PrecioUpdateItem_precioUpdateId_fkey" FOREIGN KEY ("precioUpdateId") REFERENCES "PrecioUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_localVinculadoId_fkey" FOREIGN KEY ("localVinculadoId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagCliente" ADD CONSTRAINT "TagCliente_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteTag" ADD CONSTRAINT "ClienteTag_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteTag" ADD CONSTRAINT "ClienteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TagCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuenta" ADD CONSTRAINT "MovimientoCuenta_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuenta" ADD CONSTRAINT "MovimientoCuenta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuenta" ADD CONSTRAINT "MovimientoCuenta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuenta" ADD CONSTRAINT "MovimientoCuenta_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoCuenta" ADD CONSTRAINT "MovimientoCuenta_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalleComponente" ADD CONSTRAINT "VentaDetalleComponente_ventaDetalleId_fkey" FOREIGN KEY ("ventaDetalleId") REFERENCES "VentaDetalle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalleComponente" ADD CONSTRAINT "VentaDetalleComponente_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaDetalleComponente" ADD CONSTRAINT "VentaDetalleComponente_productoLocalId_fkey" FOREIGN KEY ("productoLocalId") REFERENCES "ProductoLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VentaPago" ADD CONSTRAINT "VentaPago_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turno" ADD CONSTRAINT "Turno_cerradoPorId_fkey" FOREIGN KEY ("cerradoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_realizadoPorId_fkey" FOREIGN KEY ("realizadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_postergadoPorId_fkey" FOREIGN KEY ("postergadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_entregadoPorId_fkey" FOREIGN KEY ("entregadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_cajaMovimientoRetiroId_fkey" FOREIGN KEY ("cajaMovimientoRetiroId") REFERENCES "CajaMovimiento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_postergadoPorId_fkey" FOREIGN KEY ("postergadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierrePreparacion" ADD CONSTRAINT "CierrePreparacion_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CierrePreparacion" ADD CONSTRAINT "CierrePreparacion_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiroPreparacion" ADD CONSTRAINT "RetiroPreparacion_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiroPreparacion" ADD CONSTRAINT "RetiroPreparacion_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetiroPreparacion" ADD CONSTRAINT "RetiroPreparacion_arqueoCajaId_fkey" FOREIGN KEY ("arqueoCajaId") REFERENCES "ArqueoCaja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_cierrePreparacionId_fkey" FOREIGN KEY ("cierrePreparacionId") REFERENCES "CierrePreparacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_turnoOrigenId_fkey" FOREIGN KEY ("turnoOrigenId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CambioPendiente" ADD CONSTRAINT "CambioPendiente_turnoDestinoId_fkey" FOREIGN KEY ("turnoDestinoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CajaMovimiento" ADD CONSTRAINT "CajaMovimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntosConfigLocal" ADD CONSTRAINT "PuntosConfigLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_ventaId_fkey" FOREIGN KEY ("ventaId") REFERENCES "Venta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientePuntoMovimiento" ADD CONSTRAINT "ClientePuntoMovimiento_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosVentaCounter" ADD CONSTRAINT "PosVentaCounter_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosVentaCounter" ADD CONSTRAINT "PosVentaCounter_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoProveedor" ADD CONSTRAINT "PedidoProveedor_depositoId_fkey" FOREIGN KEY ("depositoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoProveedor" ADD CONSTRAINT "PedidoProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoProveedorDetalle" ADD CONSTRAINT "PedidoProveedorDetalle_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoProveedorDetalle" ADD CONSTRAINT "PedidoProveedorDetalle_productoLocalId_fkey" FOREIGN KEY ("productoLocalId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfiguracionGrupo" ADD CONSTRAINT "ConfiguracionGrupo_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaStock" ADD CONSTRAINT "AuditoriaStock_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaStock" ADD CONSTRAINT "AuditoriaStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperadorEnLocal" ADD CONSTRAINT "OperadorEnLocal_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperadorEnLocal" ADD CONSTRAINT "OperadorEnLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificacionLectura" ADD CONSTRAINT "NotificacionLectura_notificacionId_fkey" FOREIGN KEY ("notificacionId") REFERENCES "Notificacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionListaProveedor" ADD CONSTRAINT "ImportacionListaProveedor_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionListaFila" ADD CONSTRAINT "ImportacionListaFila_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionListaProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportacionListaFila" ADD CONSTRAINT "ImportacionListaFila_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaProveedor" ADD CONSTRAINT "RecetaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecetaLecturaProveedor" ADD CONSTRAINT "RecetaLecturaProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteProveedor" ADD CONSTRAINT "ComprobanteProveedor_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteArchivo" ADD CONSTRAINT "ComprobanteArchivo_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteLinea" ADD CONSTRAINT "ComprobanteLinea_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "ComprobanteProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════════════════════════════════════════════════════════════════
-- LO QUE PRISMA NO SABE EXPRESAR, Y QUE SIN ESTO SE PERDERÍA EN SILENCIO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Todo lo de arriba lo generó `prisma migrate diff --from-empty`. Lo de acá NO:
-- son nueve objetos que existen en producción, que `schema.prisma` no puede
-- describir, y que una base construida solo desde el schema NO tendría.
--
-- No son optimizaciones. Son INVARIANTES: reglas que la base hace cumplir y que
-- la aplicación da por ciertas. Un entorno sin ellas parece correcto, arranca,
-- pasa los candados — y deja que dos turnos queden abiertos para el mismo
-- cajero, o que un grupo tenga dos listas de precios por defecto. Se enteraría
-- alguien, meses después, mirando datos que no cierran.
--
-- El DDL está copiado TAL CUAL de producción, leído con `pg_get_indexdef` y
-- `pg_get_constraintdef`. No se reescribió ni se "mejoró" ninguno: el objetivo
-- es que una base nueva sea igual a la que ya existe, no parecida.
--
-- Cada uno dice de qué migración histórica salió y qué regla protege.

-- ── Un solo turno abierto por cajero y local ───────────────────────────────
-- De `20260805120000_retiro_preparacion`.
-- Sin esto, el mismo cajero puede tener dos turnos abiertos en el mismo local y
-- las ventas se reparten entre los dos: el arqueo de cada uno cierra por
-- separado y el faltante no aparece en ninguno. El WHERE es la parte que Prisma
-- no expresa — la unicidad vale solo mientras el turno está vivo, porque los
-- cerrados históricos repiten (localId, vendedorId) todos los días.
CREATE UNIQUE INDEX "Turno_local_vendedor_abierto_key" ON public."Turno" USING btree ("localId", "vendedorId") WHERE ((cierre IS NULL) AND ("cierreEnPreparacionEn" IS NULL));

-- ── Un solo cierre en preparación por turno ────────────────────────────────
-- De `20260805120000_retiro_preparacion`.
-- El cierre con relevo toma un corte congelado y deja al turno sin operar
-- mientras el cajero cuenta. Dos cierres en preparación sobre el mismo turno
-- serían dos cortes distintos del mismo dinero.
CREATE UNIQUE INDEX "CierrePreparacion_turno_vigente_key" ON public."CierrePreparacion" USING btree ("turnoId") WHERE (estado = ANY (ARRAY['PREPARANDO'::"EstadoCierrePreparacion", 'CONFIRMADO'::"EstadoCierrePreparacion"]));

-- ── Un solo retiro en preparación por turno ────────────────────────────────
-- De `20260805140000_cambio_vigente_por_turno`.
-- Mismo motivo que el cierre: dos retiros abiertos sobre el mismo turno sacan
-- dos veces la misma plata del esperado.
CREATE UNIQUE INDEX "RetiroPreparacion_turno_vigente_key" ON public."RetiroPreparacion" USING btree ("turnoId") WHERE (estado = 'PREPARANDO'::"EstadoRetiroPreparacion");

-- ── Un solo cambio pendiente vigente por turno de origen ───────────────────
-- De `20260805140000_cambio_vigente_por_turno`.
-- Los cancelados quedan afuera del WHERE a propósito: se pueden repetir, porque
-- ya no reservan nada.
CREATE UNIQUE INDEX "CambioPendiente_turnoOrigen_vigente_key" ON public."CambioPendiente" USING btree ("turnoOrigenId") WHERE (estado <> 'CANCELADO'::"EstadoCambioPendiente");

-- ── Identidad única de un comprobante, ignorando los anulados ──────────────
-- De `20260811150000_recepcion_por_comprobante`.
-- Un proveedor no emite dos veces el mismo punto de venta y número. Pero un
-- comprobante ANULADO tiene que poder volver a cargarse con la misma identidad,
-- así que el WHERE lo saca del índice. Ésta es la técnica que el propio schema
-- menciona en su comentario: "Prisma no sabe expresar un WHERE en @@unique".
CREATE UNIQUE INDEX "ComprobanteProveedor_identidad_key" ON public."ComprobanteProveedor" USING btree ("grupoId", "proveedorId", "puntoVenta", numero) WHERE (estado <> 'ANULADO'::"EstadoComprobante");

-- ── Un archivo de lista no se importa dos veces mientras la importación vive ─
-- De `20260805200000_importacion_listas_proveedor`.
-- Evita aplicar dos veces la misma lista de precios del proveedor. Las
-- terminadas y canceladas salen del WHERE: el mismo archivo se puede volver a
-- subir en otra importación.
CREATE UNIQUE INDEX importacion_archivo_unica ON public."ImportacionListaProveedor" USING btree ("grupoId", "proveedorId", "archivoHash") WHERE (estado = ANY (ARRAY['BORRADOR'::"EstadoImportacionLista", 'CONCILIADA'::"EstadoImportacionLista", 'PARCIALMENTE_APLICADA'::"EstadoImportacionLista"]));

-- ── Una sola lista de precios por defecto y activa por grupo ───────────────
-- De `20260512000000_listas_precios_comerciales`.
-- Con dos, el precio que ve un cliente sin lista asignada depende de cuál
-- devuelva primero la consulta. Es un precio no determinístico.
CREATE UNIQUE INDEX "ListaPrecio_default_unico_por_grupo" ON public."ListaPrecio" USING btree ("grupoId") WHERE (("esDefault" = true) AND (activo = true));

-- ── Índice parcial de stock sin límites configurados ───────────────────────
-- De `20260824010000_stock_limites_configurados_at`.
-- El único de los ocho que NO es único: es de rendimiento, para la pantalla que
-- lista lo que falta configurar. Va igual, porque la baseline tiene que
-- construir la misma base, no una equivalente.
CREATE INDEX "StockLocal_localId_limitesSinAjustar_idx" ON public."StockLocal" USING btree ("localId") WHERE ("limitesConfiguradosAt" IS NULL);

-- ── Un combo y su componente son del MISMO local ───────────────────────────
-- De `20260725120000_combos_componente_e1`.
-- El único CHECK del esquema. Sin él, un combo puede armarse con el producto de
-- otra boca: al venderlo se descontaría stock de un local ajeno. Las FK
-- compuestas de ComboComponente apuntan a `ProductoLocal(id, localId)` justo
-- para que este CHECK sea posible.
ALTER TABLE "ComboComponente" ADD CONSTRAINT "ComboComponente_mismo_local_check" CHECK (("comboLocalId" = "componenteLocalId"));
