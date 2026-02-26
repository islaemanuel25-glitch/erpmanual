# Diagnóstico: Factor pack / stock depósito (pack→unidad) y decimales KG en POS

**Proyecto:** ERP Azul (Next.js App Router + Prisma + Postgres).  
**Objetivo:** Mapeo y diagnóstico sin implementar fixes. Identificar puntos exactos para (A) mover conversión pack→unidad fuera del guardado de producto y (B) habilitar decimales para KG en POS y stocks.

---

## 1. Resumen de modelos Prisma implicados

| Modelo / campo | Tipo en Prisma | Uso |
|----------------|----------------|-----|
| **ProductoBase.factor_pack** | `Int?` | Unidades por bulto (pack/cajón). No se toca al guardar producto para stock. |
| **ProductoBase.unidad_medida** | `UnidadMedida` (unidad \| pack \| cajon \| kg) | Unidad de venta/presentación. |
| **StockLocal.cantidad** | `Decimal @db.Decimal(12, 2)` | Stock actual. **Acepta decimales.** |
| **StockLocal.stockMin** | `Decimal? @db.Decimal(12, 2)` | Mínimo. |
| **StockLocal.stockMax** | `Decimal? @db.Decimal(12, 2)` | Máximo. |
| **VentaDetalle.cantidad** | **`Int`** | Cantidad vendida en POS. **No acepta decimales** → bloquea 0.200 kg. |
| **TransferenciaDetalle.cantidad** | `Decimal(12,2)` | Cantidad enviada. |
| **PosTransferenciaDetalle.sugerido / preparado** | `Decimal?` | Cantidad en POS transferencia. |

Conclusión DB: el único campo que impide decimales en el flujo de venta es **VentaDetalle.cantidad** (Int). Stock y transferencias ya usan Decimal.

---

## 2. Flujo guardado/edición de producto (factorPack, unidadMedida)

### 2.1 Dónde se guardan

| Archivo | Función / tramo | Qué se guarda |
|---------|------------------|---------------|
| **app/api/productos/crear/route.js** | POST, armado de `baseData` | `factor_pack: num(body.factor_pack)`, `unidad_medida`, `modo_pedido` validado por `validarModoPedido(unidad_medida, factor_pack)`. No escribe StockLocal. |
| **app/api/productos/editar/[id]/route.js** | PUT, `editarBase` / merge | `factor_pack`, `unidad_medida`, `validarModoPedido` igual. No toca stock. |
| **lib/mappers/producto.js** | `splitUiToDb` / salida | `factor_pack` en payload. |
| **components/productos/FormProducto.jsx** | Estado y submit | `factor_pack` como número; validación “obligatorio si pack/cajón”. |

En **ninguno** de estos flujos se hace conversión pack→unidad ni se escribe StockLocal. La “interpretación” incorrecta del stock de depósito no viene del guardado de producto, sino de **dónde se escribe y se lee el stock** (ajustes, listados, sugeridos).

---

## 3. Escritura y lectura de stock (depósito y local)

### 3.1 Escritura de stock

| Archivo | Momento | Comportamiento |
|---------|---------|----------------|
| **components/stock_locales/ModalAjuste.jsx** | Usuario ajusta stock | Si depósito + modoStock BULTO + factorPack > 1: calcula `totalUnidades = toUnidades({ cantidad: bultos, unidad: "BULTO", factorPack }) + sueltas` y envía **cantidad: totalUnidades** al API. **Aquí se convierte bultos→unidades antes de guardar.** |
| **app/api/stock_locales/ajustar/route.js** | POST ajuste | Recibe `cantidad`, hace `actual + cantidad` o `actual - cantidad`, escribe en `StockLocal.cantidad`. No convierte: escribe el número recibido. **Si el front envía unidades, el depósito queda guardado en unidades.** |
| **app/api/stock_locales/nuevo/route.js** | Crear producto (stock locales) | Crea `StockLocal` con `cantidad: 0`. No conversión. |
| **app/api/stock_locales/listar/route.js** | Auto-crear ProductoLocal en depósito | Si no existe ProductoLocal para depósito, crea y luego `prisma.stockLocal.create({ cantidad: 0, stockMin: 0, stockMax: 0 })`. No conversión. |
| **app/api/pos-transferencias/recibir/route.js** | Recibir transferencia | Lee detalle en BULTO/UNIDAD, usa `toUnidades({ cantidad, unidad, factorPack })` y hace **increment** de `StockLocal.cantidad` en **unidades**. Aquí la conversión es correcta (recepción). |
| **app/api/pos-transferencias/enviar/route.js** | Enviar POS | Convierte preparado a unidades con `toUnidades` para crear `TransferenciaDetalle` y para validar stock origen. Origen puede ser depósito: descuenta en **unidades**. |
| **app/api/pos-ventas/crear/route.js** | Crear venta | Descuenta `item.cantidad` de `StockLocal` (directo, sin conversión). Si el local vende en kg, ese `cantidad` debería ser decimal. |

Punto crítico para (A): la conversión bulto→unidad que “contamina” el stock de depósito ocurre en **ModalAjuste.jsx** (cálculo de `totalUnidades` y body `cantidad`) y se persiste tal cual en **stock_locales/ajustar**. No ocurre en el guardado de producto.

### 3.2 Lectura de stock

| Archivo | Uso |
|---------|-----|
| **app/api/stock_locales/listar/route.js** | Devuelve `stock: Number(stock.cantidad)` sin distinguir depósito/local. No convierte: asume que el valor guardado es el “stock” a mostrar. |
| **components/stock_locales/TablaStock.jsx** | Si depósito + modoStock BULTO + factorPack > 1: usa **fromUnidades({ unidades: p.stock, factorPack })** para mostrar “X bultos + Y uds”. **Asume que `p.stock` está en unidades.** Si en BD se pasara a guardar bultos, aquí habría que dejar de usar fromUnidades para depósito (o usar solo para presentación desde bultos). |
| **app/api/pos-transferencias/sugeridos/route.js** | Usa `stockActualDestino` (StockLocal.cantidad) como base de `faltanteUnidades = stockMax - stockActualDestino` y luego sugerido en bultos/unidades. **Asume cantidad en unidades.** |
| **app/api/pos-ventas/buscar-producto/route.js** | Devuelve `stock: Number(pl.stock?.[0]?.cantidad ?? 0)` para validar en POS. Asume misma unidad que se vende. |

Conclusión: hoy **todo el sistema asume que StockLocal.cantidad está en “unidades”** (incluido depósito). La única conversión explícita en escritura es en ModalAjuste (bultos→unidades antes de enviar), lo que hace que el depósito quede guardado en unidades; el resto solo lee ese número.

---

## 4. POS ventas: cantidad y persistencia (especialmente KG)

### 4.1 Captura de cantidad en UI

| Archivo | Líneas aprox | Comportamiento |
|---------|--------------|----------------|
| **components/pos-ventas/CarritoVenta.jsx** | 111–114, 154–158 | Input cantidad: `onChange` hace **`parseInt(e.target.value) \|\| 1`** y **`Math.max(1, val)`**. **Fuerza entero y mínimo 1** → impide 0.2 (200 g). No hay `step` en el input (el navegador puede permitir decimales, pero el handler los elimina). |
| **app/modulos/pos-ventas/reducer/posVentaReducer.js** | 62–63, 76–77, 89–90 | ADD_ITEM: `cantidad: 1` y `nuevo.cantidad += 1`. UPDATE_CANTIDAD: asigna `nuevaCantidad` tal cual. El reducer no trunca a entero; el límite viene del input (parseInt) y de que el ítem nuevo entra con 1. |

### 4.2 Persistencia en backend

| Archivo | Comportamiento |
|---------|----------------|
| **app/api/pos-ventas/crear/route.js** | Valida `item.cantidad > 0`, usa `item.cantidad` para decrementar stock y para crear `VentaDetalle`. No hace parseInt/floor en backend. |
| **prisma/schema.prisma** | **VentaDetalle.cantidad** es **Int**. Prisma/Postgres rechazarán o truncarán decimales. |

Conclusión para (B): los bloqueos para decimales KG están en:  
1) **CarritoVenta.jsx** (parseInt + min 1),  
2) **VentaDetalle.cantidad** en schema (Int → debe pasar a Decimal para kg).

---

## 5. Lista de archivos involucrados (paths)

- **Producto (factor_pack / unidad_medida):**  
  `app/api/productos/crear/route.js`, `app/api/productos/editar/[id]/route.js`, `lib/mappers/producto.js`, `components/productos/FormProducto.jsx`

- **Stock (escritura/lectura):**  
  `app/api/stock_locales/ajustar/route.js`, `app/api/stock_locales/listar/route.js`, `app/api/stock_locales/nuevo/route.js`, `app/api/stock_locales/importar/route.js`, `components/stock_locales/ModalAjuste.jsx`, `components/stock_locales/TablaStock.jsx`, `app/api/pos-transferencias/sugeridos/route.js`, `app/api/pos-transferencias/recibir/route.js`, `app/api/pos-transferencias/enviar/route.js`, `app/api/pos-ventas/buscar-producto/route.js`, `app/api/pos-ventas/crear/route.js`

- **Conversiones:**  
  `lib/conversiones/stock.js` (toUnidades, fromUnidades, factorBulto, defaultModoEnvio)

- **POS ventas (cantidad / KG):**  
  `components/pos-ventas/CarritoVenta.jsx`, `app/modulos/pos-ventas/reducer/posVentaReducer.js`, `app/modulos/pos-ventas/page.jsx` (handlers de cantidad), `app/api/pos-ventas/crear/route.js`, `prisma/schema.prisma` (VentaDetalle)

---

## 6. Puntos exactos para (A): mover conversión pack→unidad fuera del guardado de producto

Objetivo: que el depósito guarde stock en la **unidad original** del producto (ej. bultos para pack/cajón); la conversión a unidades solo en transferencias/recepción (y donde haga falta para comparar con stock min/max si estos siguen en otra unidad).

- **components/stock_locales/ModalAjuste.jsx**  
  - Hoy: para depósito + BULTO + factorPack > 1 calcula `totalUnidades` con `toUnidades` y manda `cantidad: totalUnidades` al API.  
  - Cambio: para depósito en modo BULTO, no convertir a unidades; enviar cantidad en bultos (y sueltas si se mantiene el esquema bultos+sueltas), y que el API persista en la unidad “natural” del depósito (o definir un contrato claro: “cantidad en bultos para depósito BULTO”).  
  - Detalle: decidir si el body lleva `cantidadBultos` + `cantidadSueltas` o una sola `cantidad` en “unidad de depósito” y documentarlo.

- **app/api/stock_locales/ajustar/route.js**  
  - Hoy: aplica `cantidad` directo a `StockLocal.cantidad`.  
  - Cambio: si el local es depósito y el producto tiene modoStock BULTO y factor_pack > 1, interpretar `cantidad` como “en bultos” (o en unidad natural) y escribir ese valor, **sin** convertir a unidades. Si el front envía bultos, guardar bultos.

- **app/api/stock_locales/listar/route.js**  
  - Hoy: devuelve `stock: Number(stock.cantidad)` sin contexto de unidad.  
  - Cambio: para ítems de depósito con BULTO + factorPack > 1, devolver cantidad “tal cual” (bultos) o añadir un campo (ej. `unidadStock: "BULTO"`) para que el front sepa cómo interpretar. No convertir a unidades en listar si el depósito guarda en bultos.

- **components/stock_locales/TablaStock.jsx**  
  - Hoy: si depósito + BULTO + factorPack > 1, usa `fromUnidades({ unidades: p.stock })` para mostrar “X bultos + Y uds”.  
  - Cambio: si el depósito pasa a guardar en bultos, `p.stock` ya son bultos (y eventualmente sueltas en otro campo o en la misma cantidad decimal). Ajustar la presentación para no usar fromUnidades sobre “unidades” (p. ej. mostrar directamente bultos o bultos + sueltas si se guardan por separado).

- **app/api/pos-transferencias/sugeridos/route.js**  
  - Hoy: `stockActualDestino` y `stockMax`/`stockMin` se tratan en “unidades” para calcular faltante y sugerido.  
  - Cambio: si en depósito el stock está en bultos, convertir `stockActualDestino` (y si aplica stockMin/stockMax) a unidades solo para el cálculo de faltante/sugerido, o definir stockMin/stockMax en bultos para depósito y calcular todo en bultos en ese flujo. Punto único: **conversión solo en esta lógica de sugeridos**, no al guardar producto ni al escribir en StockLocal en el ajuste.

- **app/api/pos-transferencias/recibir/route.js** y **enviar/route.js**  
  - Mantener: la conversión BULTO→unidades al recibir y al enviar es correcta (transferencia en unidades). No tocar salvo que se unifique criterio de “unidad de StockLocal en depósito” (ej. si en algún momento el origen guardara en bultos, al descontar habría que convertir bultos→unidades para descontar lo enviado).

- **app/api/productos/crear/route.js** y **editar/[id]/route.js**  
  - No tocar para (A): no escriben stock ni convierten; solo guardan `factor_pack` y `unidad_medida`.

Resumen (A): el único lugar donde hoy se “convierte al guardar” es **ModalAjuste** (y lo que **ajustar** persiste). Hay que dejar de enviar “unidades” para depósito BULTO y que ajustar guarde en unidad original; luego adaptar **listar**, **TablaStock** y **sugeridos** para que lean (y eventualmente conviertan solo donde corresponda) sin asumir que todo StockLocal está en unidades.

---

## 7. Puntos exactos para (B): habilitar decimales para KG en POS y stocks

- **prisma/schema.prisma**  
  - **VentaDetalle.cantidad:** cambiar de `Int` a `Decimal @db.Decimal(12, 2)` (o similar). Crear migración. Sin esto, 0.2 kg no se puede persistir.

- **components/pos-ventas/CarritoVenta.jsx** (dos bloques de input de cantidad)  
  - Sustituir **parseInt(e.target.value) || 1** por **parseFloat(e.target.value)** (o Number) y validar que sea un número válido > 0 (ej. mínimo 0.001 o 0.01 para kg).  
  - Sustituir **Math.max(1, val)** por un mínimo que dependa de la unidad (ej. 0.001 para kg, 1 para unidad) o un mínimo genérico pequeño (0.01).  
  - Opcional: atributo **step** según unidad (ej. `step="0.001"` o `step="0.01"` para kg, `step="1"` para unidad) para mejorar UX.

- **app/modulos/pos-ventas/reducer/posVentaReducer.js**  
  - ADD_ITEM: hoy `cantidad: 1`. Para productos en kg se puede dejar 1 por defecto y que el usuario cambie a 0.2, o usar cantidad inicial según unidad (ej. 0.2 o 1). No es obligatorio para permitir decimales; el crítico es no pisar con entero después (eso lo hace CarritoVenta con parseInt).

- **app/api/pos-ventas/crear/route.js**  
  - Aceptar `item.cantidad` decimal (Number no trunca). Tras cambiar VentaDetalle a Decimal, persistirá bien. Validación: `item.cantidad > 0` (o >= 0.001). No usar parseInt/parseFloat que truncen a entero.

- **Stock:** StockLocal y stockMin/stockMax ya son Decimal; no hace falta cambio de schema para que el stock acepte decimales. Revisar solo que en **stock_locales** (ajustar, listar, importar) no se fuercen enteros (Number() está bien; evitar Math.floor/parseInt en cantidades de producto).

Resumen (B): cambios mínimos en **schema (VentaDetalle.cantidad)** y en **CarritoVenta.jsx** (parseFloat + mínimo por unidad o genérico). Reducer y API solo revisar que no fuercen entero.

---

## 8. Riesgos y consideraciones (mínimo impacto)

- **(A)** Si el depósito hoy tiene stock guardado **en unidades**, migrar a “bultos” implica una migración de datos: para cada StockLocal de depósito con producto BULTO y factor_pack > 1, hacer `cantidad_nueva = cantidad_vieja / factor_pack` (y decidir redondeo o sueltas). Si no se migra, al cambiar solo la escritura futura se mezclan interpretaciones (viejos en unidades, nuevos en bultos).
- **(A)** stockMin/stockMax en depósito: hoy se interpretan como “unidades” en sugeridos. Si el depósito pasa a guardar cantidad en bultos, hay que definir si stockMin/stockMax siguen en unidades (y convertir al comparar) o pasan a bultos.
- **(B)** Reportes o exports que asuman VentaDetalle.cantidad entero: revisar tras cambiar a Decimal (formato, agregaciones).
- **(B)** POS offline / cola: si se guarda cantidad en algún formato (ej. JSON), asegurar que se envíe y se persista como número decimal, no entero.

---

*Fin del diagnóstico. Sin código implementado; solo mapeo y puntos exactos para (A) y (B) con mínimo impacto.*
