# Modulo: Stock Locales

**Última actualización:** 2026-08-25 12:23

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

## Libro histórico físico

**Historia física de stock confiable desde 2026-09-28 00:19:13.587 UTC
(2026-09-27 21:19:13.587 Argentina).**

La BAJA no depende del orden de las sentencias
(`20260928180000_libro_stock_baja_atomica`): una sola sentencia que borra un
StockLocal y su ProductoLocal —o re-vincula la fila— deja su BAJA con la identidad
completa, porque la identidad se recuerda en el momento en que el producto se
borra. Y el libro falla cerrado: si un movimiento no puede escribirse, la
sentencia aborta y la fila de stock no cambia. No es una frontera nueva: el punto
cero es el mismo, y ningún camino de la aplicación había usado ese hueco.

Desde ese instante, cada cambio de `StockLocal.cantidad` o `StockLocal.enTransito`
queda en `MovimientoStock`, escrito por un trigger de PostgreSQL en la misma
transacción que el cambio. El punto cero —12.278 filas `ESTADO_INICIAL`, una por
fila de `StockLocal`, con un único instante— y la evidencia del despliegue están en
`docs/deploy/MIGRACIONES-SIN-APLICAR.md`. El porqué de cada columna, en
`prisma/schema.prisma` junto a `MovimientoStock`. El verificador de solo lectura
es `scripts/verificar-libro-stock.mjs`.

Los escritores todavía no declaran origen, así que sus movimientos quedan como
`SIN_ORIGEN`. Eso no vuelve dudosa la cantidad. La apertura, los movimientos y el
cierre por día sobre este libro todavía no están construidos.

## Cambios recientes
- 2026-08-25: fix(stock): mostrar packs y unidades en movil (#12)
- 2026-07-28: feat(productos): codigo de barras propio por ubicacion
- 2026-07-26: fix(security): cerrar fugas operativas entre ubicaciones
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
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
