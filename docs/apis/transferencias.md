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
      "origenNombre": "Deposito Central",
      "origenEsDeposito": true,
      "destinoNombre": "Local Norte",
      "estado": "Enviada",
      "createdAt": "2025-01-15T09:58:00Z",
      "fechaEnvio": "2025-01-15T10:00:00Z",
      "fechaRecepcion": null,
      "tieneDiferencias": false,
      "cantidadItems": 15,
      "cantidadEnviada": 120.5,
      "cantidadRecibida": null,
      "totalCosto": 45000.00,
      "creadaPorNombre": "Ana Gomez"
    }
  ],
  "total": 30,
  "totalPages": 2,
  "totalCostoGlobal": 1500000.00,
  "resumen": {
    "total": 30,
    "enviadas": 8,
    "recibidas": 19,
    "conDiferencias": 3,
    "importeTotal": 1500000.00
  }
}
```

Notas:

- `cantidadRecibida` distingue `null` (nadie registró recepción todavía) de `0`
  (se registró que no llegó nada). La pantalla muestra `—` y `0` respectivamente.
- `resumen` y `totalCostoGlobal` cubren **todo el período filtrado**, no la
  página visible: usan el mismo `where` que el listado, sin paginar. Antes
  `totalCostoGlobal` sumaba solo la página y cambiaba al pasar de página pese a
  llamarse "global".
- `creadaPorNombre` resuelve `Transferencia.creadaPor` (un id de usuario) contra
  `Usuario` en una sola consulta por página.
- El importe de cada remito y el del período salen del **mismo** helper
  (`importeDeDetalle`), así la columna "Importe" y la métrica no pueden divergir.

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
1. Valida TODOS los detalles antes de abrir la transaccion (rango, unidad, motivo,
   usuario de sesion y grupo del origen). Si algo falla, no se toca stock.
2. Toma la barrera de estado (`updateMany` condicional) como primera escritura.
3. Suma al destino **solo la cantidad recibida** (convirtiendo bultos a unidades, o
   piezas a kg en fiambre fijo si corresponde).
4. Crea ProductoLocal/StockLocal si no existen en destino.
5. En el origen, en **una sola escritura atomica**: `enTransito -= enviado` y
   `cantidad += (enviado - recibido)`. La diferencia vuelve al stock del origen.
6. Si la devolucion es mayor a cero, crea `AuditoriaStock` con
   `accion = DIFERENCIA_RECEPCION_TRANSFERENCIA`, dentro de la misma transaccion.
7. Persiste `recibido` y `confirmadoPorId`; la `cantidad` enviada no se modifica.
8. Marca transferencia como "Recibida" y, si hubo diferencias, `tieneDiferencias: true`.

**Errores especificos:**

| Codigo | Status | Cuando |
|---|---|---|
| `USUARIO_SESION_INVALIDO` | 401 | La sesion no identifica un usuario (la auditoria lo exige) |
| `GRUPO_ORIGEN_NO_RESUELTO` | 409 | Hay diferencias para devolver y no se pudo resolver el grupo del origen |
| `STOCK_ORIGEN_NO_ENCONTRADO` | 409 | El producto o su StockLocal no existen en el local de origen |
| `CANTIDAD_RECIBIDA_SUPERA_ENVIADA` | 400 | Se intento recibir mas de lo enviado |
| `CANTIDAD_RECIBIDA_INVALIDA` | 400 | Negativo, NaN, string invalido, boolean, array u objeto |
| `UNIDAD_ENVIADA_AUSENTE` / `_DESCONOCIDA` | 409 | El detalle no dice si se envio en BULTO o UNIDAD |
| `DEVOLUCION_DIFERENCIA_INVALIDA` | 409 | No se pudo calcular la diferencia a devolver |

Todos abortan la transaccion completa: no quedan mutaciones parciales.

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
