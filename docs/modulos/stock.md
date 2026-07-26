# Modulo: Stock Locales

**Última actualización:** 2026-07-25 21:21

## Ubicacion
- UI: `app/modulos/stock_locales/page.jsx`
- APIs: `app/api/stock_locales/`
- Componentes: `components/stock_locales/`

## Descripcion
Gestion de inventario por local. Permite ver stock actual, ajustar cantidades y configurar limites min/max. Los depositos muestran stock en bultos, los locales en unidades.

## Funcionalidad principal
- Ver stock por local con filtros (categoria, proveedor, area, con/sin stock, faltantes)
- Ajustar stock (sumar/restar cantidades)
- Configurar limites minimos y maximos
- Importacion masiva de productos
- Deteccion automatica de faltantes (stock < stockMin)

## Dependencias

### Usa
- Productos (ProductoLocal)
- Locales (localId)
- Categorias, Proveedores, Areas Fisicas (filtros)

### Usado por
- Transferencias (descuenta/suma stock al confirmar recepcion)
- POS Transferencias (lee stock para sugeridos)

## APIs

### Consume
- `GET /api/locales/listar`

### Expone
- `GET /api/stock_locales/listar?localId=&q=&categoria=&proveedor=&area=&conStock=&sinStock=&faltantes=&page=`
- `GET /api/stock_locales/obtener?id=`
- `POST /api/stock_locales/nuevo`
- `POST /api/stock_locales/ajustar` — modo: "ajuste"|"limites", tipo: "sumar"|"restar"
- `POST /api/stock_locales/importar`
- `POST /api/stock_locales/limites`

## Componentes principales
- `TablaStock`: Tabla de stock con paginacion
- `FiltrosStock`: Filtros de busqueda y categoria
- `ModalAjuste`: Modal para ajustar cantidades
- `ModalLimites`: Modal para configurar min/max

## Estado y hooks
- Estado local con `useState`
- `localSeleccionado` persistido en localStorage

## Permisos requeridos
- `stock.ver`

## Modelo de datos

```prisma
model StockLocal {
  id          Int      @id @default(autoincrement())
  localId     Int
  productoId  Int      // FK a ProductoLocal
  cantidad    Decimal  @db.Decimal(12, 2)
  stockMin    Decimal? @db.Decimal(12, 2)
  stockMax    Decimal? @db.Decimal(12, 2)
  @@unique([localId, productoId])
}
```

## Conversion de unidades

Depositos almacenan en bultos, locales en unidades:

```
precioUnitario = precioCosto / factor_pack
stockUnidades = stockBultos * factor_pack
```

## Cambios recientes
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-23: feat(productos,proveedores): visibilidad depósito ↔ locales
- 2026-06-16: perf: paginar stock deposito en base de datos
- 2026-06-15: perf: paginar stock locales en base de datos
- 2026-06-15: perf: filtrar estados de stock locales en base de datos
- 2026-06-15: refactor: ordenar stock locales sin cambiar comportamiento
- 2026-06-15: perf: paginar stock locales en base de datos
- 2026-06-15: perf: filtrar estados de stock locales en base de datos
- 2026-06-15: refactor: ordenar stock locales sin cambiar comportamiento
- 2026-06-10: fix(fiambre): stock operativo del deposito en PIEZAS para fiambre fijo por pieza
- 2026-06-10: fix(fiambre): mostrar piezas reales en depósito y topar carrito por piezas
