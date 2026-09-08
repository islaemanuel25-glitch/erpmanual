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
1. Valida TODOS los detalles antes de abrir la transaccion (cantidad, unidad,
   motivo, usuario de sesion y grupo del origen). Si algo falla, no se toca stock.
2. Toma la barrera de estado (`updateMany` condicional) como primera escritura.
3. Suma al destino **solo la cantidad recibida** (convirtiendo bultos a unidades, o
   piezas a kg en fiambre fijo si corresponde).
4. Crea ProductoLocal/StockLocal si no existen en destino.
5. En el origen, en **una sola escritura atomica**: `enTransito -= enviado` y
   `cantidad += (enviado - recibido)`. Ese segundo termino tiene SIGNO: ver
   "La aritmetica" abajo.
6. Si hubo movimiento, crea `AuditoriaStock` dentro de la misma transaccion, con
   la accion que corresponda de las tres (ver "Auditoria").
7. Persiste `recibido` y `confirmadoPorId`; la `cantidad` enviada **no se
   modifica nunca**.
8. Marca transferencia como "Recibida" y, si hubo diferencias, `tieneDiferencias: true`.

#### La aritmetica: `0 <= recibido` y NADA mas

Hasta el 2026-09-08 esta API afirmaba `0 <= recibido <= enviado`. **Ese tope ya no
existe**, y sacarlo fue el punto de la tanda: recibir mas de lo enviado es un
hecho fisico —los bultos traian mas— y el sistema tiene que poder representarlo
sin reescribir el remito.

Con `S` = enviado y `R` = recibido, ambos en unidades fisicas:

```
destino            += R
origen.enTransito  -= S      (salvo linea agregada en recepcion: ver abajo)
origen.cantidad    += (S - R)
```

El tercer termino con signo es todo lo que cambio:

| enviado | recibido | ajuste al origen | que significa |
|---|---|---|---|
| 10 | 8 | `+2` | volvio lo que no llego |
| 10 | 10 | `0` | llego justo |
| 10 | 15 | `-5` | llego de mas: el origen pierde 5 ademas de los 10 que ya perdio |
| 0 | 6 | `-6` | linea agregada: llego algo que el remito no mencionaba |

**El `enviado` NUNCA se convierte en el `recibido`.** Los tres numeros —enviado,
recibido y diferencia— se conservan: convertir uno en otro borraria la evidencia
del desvio.

**El calculo se hace en milesimas enteras** y el `factor_pack` se aplica UNA sola
vez, sobre la resta: `(S - R) x factor`, nunca `(S x factor) - (R x factor)`.

#### Lineas agregadas durante la recepcion

Una linea que aparece al abrir los bultos se marca con
`TransferenciaDetalle.agregadoEnRecepcion = true`, junto con
`agregadoEnRecepcionPorId` y `agregadoEnRecepcionAt`. Su `cantidad` es `0`:
nunca se envio.

**Su `enTransito` NO se toca.** Esa linea nunca formo parte del envio, asi que no
hay reserva que liberar; restarla inventaria un transito que nadie creo. Es la
unica diferencia aritmetica con una linea normal.

Se administran con `POST` y `DELETE /api/transferencias/linea-recepcion`, y el
producto se busca con `GET /api/transferencias/buscar-productos-origen`.

#### Stock negativo

Cuando llega de mas, el origen puede quedar en negativo. **Se respeta la politica
vigente** —`allowNegativeStock`, resuelta con `getConfigLocalEfectiva` sobre el
local origen, el mismo flag que decide si un envio con stock insuficiente se
rechaza— y no se define una regla nueva. Si el grupo no permite negativos y el
origen no tiene stock para cubrir la diferencia, la confirmacion responde
`STOCK_INSUFICIENTE` con la lista de faltantes y **no toca nada**.

#### Auditoria

`AuditoriaStock` distingue los tres casos, y ademas queda vinculada
estructuralmente por `transferenciaId` y `transferenciaDetalleId` —antes el unico
rastro era el texto de `motivo`—:

| accion | cuando |
|---|---|
| `DIFERENCIA_RECEPCION_TRANSFERENCIA` | llego menos: vuelve mercaderia al origen (valor historico, sin cambios) |
| `EXCEDENTE_RECEPCION_TRANSFERENCIA` | llego mas de lo enviado |
| `AGREGADO_RECEPCION_TRANSFERENCIA` | llego un producto que el remito no mencionaba |

**Errores especificos:**

| Codigo | Status | Cuando |
|---|---|---|
| `USUARIO_SESION_INVALIDO` | 401 | La sesion no identifica un usuario (la auditoria lo exige) |
| `GRUPO_ORIGEN_NO_RESUELTO` | 409 | Hay ajustes que aplicar y no se pudo resolver el grupo del origen |
| `STOCK_ORIGEN_NO_ENCONTRADO` | 409 | El producto o su StockLocal no existen en el local de origen |
| `STOCK_INSUFICIENTE` | 400 | Llego de mas y el grupo no permite stock negativo |
| `CANTIDAD_RECIBIDA_INVALIDA` | 400 | Negativo, NaN, string invalido, boolean, array u objeto |
| `LINEA_AGREGADA_CON_CANTIDAD_ENVIADA` | 409 | Una linea marcada como agregada tiene cantidad enviada |
| `UNIDAD_ENVIADA_AUSENTE` / `_DESCONOCIDA` | 409 | El detalle no dice si se envio en BULTO o UNIDAD |
| `AJUSTE_ORIGEN_INVALIDO` | 409 | No se pudo calcular el ajuste de stock del origen |

Todos abortan la transaccion completa: no quedan mutaciones parciales.

### POST /api/transferencias/linea-recepcion

Agrega una linea por un producto que llego y no estaba en el remito.
Permiso `transferencias.recibir`; **solo el DESTINO** de esa transferencia, salvo
admin; solo en estado `Enviada` o `Recibiendo`.

**Body:** `{ transferenciaId, productoLocalId, unidadEnviada?, recibido? }`

- `productoLocalId` es del catalogo del **ORIGEN**, y se comprueba contra ese
  catalogo con el mismo filtro que usa el buscador. El origen sale de la
  transferencia persistida, **nunca del request**.
- Si el producto **ya es una linea** de la transferencia, no se duplica: responde
  `{ ok: true, yaExistia: true, detalleId }` para que se aumente el `recibido` de
  esa linea.
- `unidadEnviada` sin valor asume `UNIDAD`, que es la escala fisica de
  `StockLocal`. Asumir `BULTO` inventaria stock.
- **No mueve stock.** El inventario se toca recien al confirmar.

| Codigo | Status | Cuando |
|---|---|---|
| `PRODUCTO_FUERA_DEL_ORIGEN` | 404 | El producto no esta en el catalogo del origen (o no existe, o no es visible: se contestan igual) |
| `COMBO_NO_TRANSFERIBLE` | 400 | Un combo no tiene stock fisico propio |

### DELETE /api/transferencias/linea-recepcion

Elimina una linea agregada por error, antes de confirmar. **No mueve stock**,
porque esa linea nunca lo movio.

**Body:** `{ transferenciaId, detalleId }`

| Codigo | Status | Cuando |
|---|---|---|
| `LINEA_DEL_REMITO_NO_SE_BORRA` | 409 | Es una linea del envio original: si no llego nada, se carga `recibido = 0` |

### GET /api/transferencias/buscar-productos-origen

Busca en el catalogo del local **ORIGEN** de una transferencia, para agregar un
producto que llego de mas. Permiso `transferencias.recibir`; solo el DESTINO,
salvo admin; solo con la recepcion abierta.

**Query:** `transferenciaId` (obligatorio), `q`, `fromVoice`.

No se reuso `/api/pos-transferencias/buscarProductos` porque ese endpoint exige
que el local buscado sea el de la **sesion**, y en una recepcion el que busca es
el destino mientras el catalogo que necesita es el del origen. Lo que si se
comparte es la busqueda: universo, ranking y mapeo viven en
`lib/productos/buscarCatalogoLocal.js` y los dos endpoints la llaman.

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
