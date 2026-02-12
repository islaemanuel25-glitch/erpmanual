# APIs - Transferencias y POS

## Transferencias (formales)

### GET /api/transferencias/listar

Listado de transferencias con filtros.

**Query params:**
- `estado` - Pendiente, Enviada, Recibiendo, Recibida
- `localId` - Filtrar por local involucrado
- `fechaDesde`, `fechaHasta` - Rango de fechas
- `page` - Pagina

**Response:**
```json
{
  "ok": true,
  "items": [
    {
      "id": 1,
      "origenId": 1,
      "origenNombre": "Deposito Central",
      "destinoId": 2,
      "destinoNombre": "Local Norte",
      "estado": "Enviada",
      "fechaEnvio": "2025-01-15T10:00:00Z",
      "fechaRecepcion": null,
      "itemsEnviados": 15,
      "costoTotal": 45000.00
    }
  ],
  "total": 30,
  "totalPages": 2,
  "totalCostoGlobal": 1500000.00
}
```

### GET /api/transferencias/detalle?id=

Detalle completo con items.

**Response:**
```json
{
  "ok": true,
  "item": {
    "id": 1,
    "estado": "Enviada",
    "origen": { "id": 1, "nombre": "Deposito Central" },
    "destino": { "id": 2, "nombre": "Local Norte" },
    "resumen": {
      "itemsEnviados": 15,
      "itemsRecibidos": 0,
      "costoTotal": 45000.00
    },
    "items": [
      {
        "id": 101,
        "productoNombre": "Coca Cola 500ml",
        "cantidad": 10.00,
        "recibido": null,
        "precioCosto": 800.00,
        "unidadEnviada": "BULTO",
        "motivoPrincipal": null,
        "motivoDetalle": null
      }
    ]
  }
}
```

### POST /api/transferencias/guardar-recepcion

Guardar cantidades recibidas (sin confirmar).

**Body:**
```json
{
  "transferenciaId": 1,
  "items": [
    {
      "id": 101,
      "recibido": 9.00,
      "motivoPrincipal": "Faltante",
      "motivoDetalle": "Faltaba 1 bulto en el pallet"
    }
  ]
}
```

### POST /api/transferencias/confirmar-recepcion

Confirma recepcion y actualiza stock. Opera en transaccion.

**Body:**
```json
{ "transferenciaId": 1 }
```

**Logica:**
1. Descuenta stock del origen
2. Suma stock al destino (convirtiendo bultos a unidades si corresponde)
3. Crea ProductoLocal/StockLocal si no existen en destino
4. Marca transferencia como "Recibida"
5. Si hay diferencias, marca `tieneDiferencias: true`

### GET /api/transferencias/pdf?id=

Genera PDF del envio. Retorna binario `application/pdf`.

### GET /api/transferencias/pdf-recepcion?id=

Genera PDF de recepcion con columnas enviado/recibido/diferencia.

---

## POS Transferencias (pedidos rapidos)

### GET /api/pos-transferencias/nueva?destinoId=&origenId=

Obtiene borrador existente o crea uno nuevo.

**Response:**
```json
{
  "ok": true,
  "item": {
    "id": 5,
    "estado": "Borrador",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

### GET /api/pos-transferencias/detalle?posId=

Detalle del POS con items preparados.

**Response:**
```json
{
  "ok": true,
  "item": {
    "encabezado": { "id": 5, "origen": "...", "destino": "..." },
    "detalles": [
      {
        "id": 201,
        "productoLocalId": 50,
        "productoNombre": "Coca Cola 500ml",
        "sugerido": 5.00,
        "preparado": 4.00,
        "unidadSugerida": "BULTO",
        "unidadPreparada": "BULTO"
      }
    ],
    "totales": { "items": 15, "sugeridos": 75, "preparados": 68 }
  }
}
```

### GET /api/pos-transferencias/sugeridos?destinoId=&posId=

Calcula productos faltantes: `stockMax - stockActual`.

### POST /api/pos-transferencias/agregarItem

**Body:**
```json
{
  "posId": 5,
  "productoLocalId": 50,
  "cantidad": 4,
  "tipo": "preparado"
}
```

### POST /api/pos-transferencias/enviar

Convierte POS en Transferencia formal.

**Body:**
```json
{ "posId": 5 }
```

**Logica:**
1. Valida que hay items preparados
2. Crea Transferencia con estado "Enviada"
3. Crea TransferenciaDetalle por cada item
4. Respeta modo_envio del producto (SOLO_BULTO, MIXTO, SOLO_UNIDAD)
5. Elimina POS y sus detalles

### POST /api/pos-transferencias/cancelar

Elimina borrador POS que no fue enviado.

**Body:**
```json
{ "posId": 5 }
```
