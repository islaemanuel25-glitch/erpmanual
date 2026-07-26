# Modulo: Productos

**Última actualización:** 2026-07-26 01:08

## Ubicacion
- UI: `app/modulos/productos/page.jsx`
- APIs: `app/api/productos/`
- Componentes: `components/productos/`

## Descripcion
Catalogo centralizado de productos por grupo. Cada ProductoBase se replica como ProductoLocal en cada local del grupo, permitiendo overrides de precio por local.

## Funcionalidad principal
- Listado paginado con filtros (categoria, proveedor, area, estado, busqueda)
- Crear producto (replica automaticamente a locales del grupo)
- Editar producto (base o override local)
- Eliminar producto (solo si no tiene movimientos)
- Gestion de columnas visibles (persistido en localStorage)
- Selector de local para ver precios/stock especificos

## Dependencias

### Usa
- Categorias (categoria_id)
- Proveedores (proveedor_id)
- Areas Fisicas (area_fisica_id)
- Grupos (grupoId)
- Locales (localId, creadoEnLocalId)

### Usado por
- Stock Locales (ProductoLocal → StockLocal)
- Transferencias (TransferenciaDetalle → ProductoLocal)
- POS Transferencias (PosTransferenciaDetalle → ProductoLocal)
- Actualizacion de Precios (precio_costo, precio_venta)

## APIs

### Consume
- `GET /api/catalogos/categorias`
- `GET /api/catalogos/proveedores`
- `GET /api/catalogos/areas-fisicas`

### Expone
- `GET /api/productos/listar?localId=&q=&categoriaId=&proveedorId=&areaFisicaId=&activo=&page=`
- `GET /api/productos/obtener?id=&localId=`
- `POST /api/productos/crear`
- `PUT /api/productos/editar/[id]?localId=`
- `DELETE /api/productos/eliminar/[id]`

## Componentes principales
- `TablaProductos` / `SunmiTablaProductos`: Tabla principal con acciones inline
- `FiltrosProductos`: Barra de filtros
- `ModalProductoFinal`: Modal de crear/editar
- `ColumnManager`: Gestor de columnas visibles

**Nota:** El contexto se elige solo en /inicio y se muestra en Header.

## Estado y hooks
- Estado local con `useState`
- Filtros y columnas persistidos en localStorage

## Permisos requeridos
- `productos.ver`
- `productos.crear`
- `productos.editar`
- `productos.eliminar`

## Modelo de datos

```prisma
model ProductoBase {
  id              Int       @id @default(autoincrement())
  grupoId         Int
  nombre          String
  descripcion     String?
  sku             String?
  codigo_barra    String?
  categoria_id    Int?
  proveedor_id    Int?
  area_fisica_id  Int?
  unidad_medida   UnidadMedida
  factor_pack     Int?
  precio_costo    Decimal   @db.Decimal(12, 2)
  precio_venta    Decimal   @db.Decimal(12, 2)
  margen          Decimal?  @db.Decimal(6, 2)
  activo          Boolean   @default(true)
  // ... mas campos
  @@unique([grupoId, codigo_barra])
}

model ProductoLocal {
  id            Int       @id @default(autoincrement())
  localId       Int
  baseId        Int
  nombre        String?   // override
  precio_costo  Decimal?  // override
  precio_venta  Decimal?  // override
  margen        Decimal?  // override
  activo        Boolean   @default(true)
  @@unique([localId, baseId])
}
```

## Cambios recientes
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- 2026-07-25: feat(combos): permitir activar y desactivar combos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-23: feat(productos,proveedores): visibilidad depósito ↔ locales
- 2026-06-16: fix: asegurar productos del deposito al crear producto
- 2026-06-10: feat: productos — go-to-page, sticky header and optional internal code column
