# Modulo: Actualizacion de Precios

## Ubicacion
- UI: `app/modulos/productos/actualizacion-precios/page.jsx`
- Componente principal: `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`
- APIs: `app/api/productos/precios/`
- Hook: `components/productos/actualizacion-precios/hooks/useActualizacionPrecios.js`

## Descripcion
Actualizacion masiva de precios de compra y venta por proveedor. Dos metodos: edicion manual con porcentaje por fila, o importacion/exportacion via Excel.

## Funcionalidad principal

### Tab "Por Proveedor"
- Seleccionar proveedor y cargar productos
- Definir % de aumento global o por producto individual
- Calculo en tiempo real: compraNueva = compraActual * (1 + %/100)
- Calculo de venta: ventaNueva = compraNueva * (1 + margen/100)
- Precios formateados como $ 1.234,56
- Aplicar cambios al servidor

### Tab "Excel"
- Descargar XLSX con productos del proveedor (codigo_barra, nombre, compra, venta, margen)
- Subir XLSX modificado
- Matcheo automatico por codigo de barra
- Preview de cambios antes de aplicar
- Aplicar cambios desde Excel

## Dependencias

### Usa
- Proveedores (proveedorId)
- Productos (ProductoBase: precio_costo, precio_venta, margen, codigo_barra)
- Grupos (grupoId de sesion)
- SelectorGrupoActivo (cambio de grupo sin reload)

### Genera
- PrecioUpdate + PrecioUpdateItem (historial de cambios)

## APIs

### Consume
- `GET /api/proveedores/opciones`
- `GET /api/catalogos/proveedores` (fallback)

### Expone
- `POST /api/productos/precios/preview` — previsualizar cambios sin modificar DB
- `POST /api/productos/precios/apply` — aplicar cambios en transaccion
- `GET /api/productos/precios/history` — historial de actualizaciones
- `GET /api/productos/precios/history/[id]` — detalle de actualizacion

## Componentes principales
- `ActualizacionPreciosPage`: Pagina completa con 2 tabs
- `SelectorGrupoActivo`: Selector de grupo (callback onGrupoChanged)

## Estado y hooks
- Estado local simple (sin hook externo para la pagina principal)
- `useActualizacionPrecios`: Hook disponible con resetState, preview, apply, history

## Permisos requeridos
- Autenticacion + grupo activo seleccionado

## Modelo de datos

```prisma
model PrecioUpdate {
  id           Int                     @id @default(autoincrement())
  grupoId      Int
  proveedorId  Int?
  usuarioId    Int?
  metodo       PrecioUpdateMetodo
  pricingMode  PrecioUpdatePricingMode
  createdAt    DateTime                @default(now())
}

model PrecioUpdateItem {
  id              Int     @id @default(autoincrement())
  precioUpdateId  Int
  productoBaseId  Int
  costoAnterior   Decimal @db.Decimal(12, 2)
  costoNuevo      Decimal @db.Decimal(12, 2)
  ventaAnterior   Decimal @db.Decimal(12, 2)
  ventaNueva      Decimal @db.Decimal(12, 2)
}

enum PrecioUpdateMetodo {
  MANUAL
  AUMENTO
  REGLAS
  PEGADO
  XLSX
  SCAN
}

enum PrecioUpdatePricingMode {
  KEEP_VENTA
  RECALC_BY_MARGIN
  SET_VENTA
}
```

## Body del endpoint apply

```json
{
  "proveedorId": 5,
  "metodo": "AUMENTO",
  "pricingMode": "SET_VENTA",
  "items": [
    {
      "productoBaseId": 123,
      "costoAnterior": 1000,
      "costoNuevo": 1100,
      "ventaAnterior": 1500,
      "ventaNueva": 1650
    }
  ]
}
```
