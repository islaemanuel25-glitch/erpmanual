# APIs - Productos y Precios

## Productos CRUD

### GET /api/productos/listar

Listado paginado de productos con filtros.

**Query params:**
- `localId` (requerido) - Local para mostrar overrides
- `page` - Pagina (default: 1)
- `q` - Busqueda por nombre, codigo_barra o SKU
- `categoriaId` - Filtrar por categoria
- `proveedorId` - Filtrar por proveedor
- `areaFisicaId` - Filtrar por area fisica
- `activo` - "true" o "false"

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": 1,
      "baseId": 1,
      "nombre": "Coca Cola 500ml",
      "codigoBarra": "7790895000102",
      "sku": null,
      "categoriaId": 2,
      "proveedorId": 1,
      "categoriaNombre": "Bebidas",
      "proveedorNombre": "Distribuidora X",
      "precioCosto": 800.00,
      "precioVenta": 1200.00,
      "margen": 50.00,
      "unidadMedida": "pack",
      "factorPack": 12,
      "activo": true
    }
  ],
  "total": 150,
  "totalPages": 6
}
```

### POST /api/productos/crear

Crea ProductoBase y replica a todos los locales del grupo.

**Body:**
```json
{
  "nombre": "Coca Cola 500ml",
  "sku": "CC500",
  "codigo_barra": "7790895000102",
  "categoria_id": 2,
  "proveedor_id": 1,
  "area_fisica_id": null,
  "unidad_medida": "pack",
  "factor_pack": 12,
  "precio_costo": 800.00,
  "precio_venta": 1200.00,
  "localId": 1
}
```

### PUT /api/productos/editar/[id]

Edita producto base o override local (si se pasa `?localId=`).

### DELETE /api/productos/eliminar/[id]

Elimina producto solo si no tiene movimientos (transferencias, POS).

---

## Precios - Preview

### POST /api/productos/precios/preview

Previsualiza cambios de precio sin modificar la DB.

**Body:**
```json
{
  "proveedorId": 5,
  "metodo": "AUMENTO",
  "pricingMode": "KEEP_VENTA",
  "increase": { "kind": "PCT", "value": 10 }
}
```

**Metodos soportados:**
- `AUMENTO` - Porcentaje o valor absoluto: `increase: { kind: "PCT"|"ABS", value: N }`
- `REGLAS` - Reglas por categoria/nombre: `rules: [{ match: {...}, increase: {...} }]`
- `PEGADO` - Texto pegado: `pastedText: "codigo|nombre|costo|venta\n..."`
- `MANUAL` - Edicion directa: `manualEdits: [{ productoBaseId, costoNuevo, ventaNueva }]`

**Pricing modes:**
- `KEEP_VENTA` - Mantener precio de venta actual
- `RECALC_BY_MARGIN` - Recalcular venta por margen existente
- `SET_VENTA` - Usar venta enviada por el metodo

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "productoBaseId": 123,
      "nombre": "Coca Cola 500ml",
      "codigoBarra": "7790895000102",
      "margen": 50.0,
      "costoAnterior": 800.00,
      "costoNuevo": 880.00,
      "ventaAnterior": 1200.00,
      "ventaNueva": 1200.00,
      "alertas": []
    }
  ],
  "summary": { "total": 42, "metodo": "AUMENTO", "pricingMode": "KEEP_VENTA" },
  "alertas": { "criticas": 0, "advertencias": 2 }
}
```

**Alertas posibles:**
- `precio_en_0` - Precio nuevo <= 0 (critica)
- `baja` - Precio nuevo < anterior (advertencia)
- `cambio_raro` - Cambio >= 40% (advertencia)

---

## Precios - Apply

### POST /api/productos/precios/apply

Aplica cambios en transaccion. Crea PrecioUpdate + PrecioUpdateItem y actualiza ProductoBase.

**Body:**
```json
{
  "proveedorId": 5,
  "metodo": "AUMENTO",
  "pricingMode": "SET_VENTA",
  "items": [
    {
      "productoBaseId": 123,
      "costoAnterior": 800.00,
      "costoNuevo": 880.00,
      "ventaAnterior": 1200.00,
      "ventaNueva": 1320.00
    }
  ]
}
```

**Metodos validos:** MANUAL, AUMENTO, XLSX, SCAN, REGLAS, PEGADO

**Response:**
```json
{
  "ok": true,
  "message": "Actualizacion aplicada: 42 productos.",
  "updateId": 15,
  "applied": 42
}
```

**Transaccion:**
1. Crea registro PrecioUpdate
2. Para cada item: actualiza precio_costo y precio_venta en ProductoBase
3. Crea PrecioUpdateItem con valores anteriores y nuevos
4. Si algun item falla, rollback completo

---

## Precios - History

### GET /api/productos/precios/history

Historial de actualizaciones de precio para el grupo activo.

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": 15,
      "fecha": "2025-01-15T14:30:00Z",
      "proveedorId": 5,
      "proveedorNombre": "Distribuidora X",
      "metodo": "AUMENTO",
      "pricingMode": "SET_VENTA",
      "itemsCount": 42
    }
  ]
}
```
