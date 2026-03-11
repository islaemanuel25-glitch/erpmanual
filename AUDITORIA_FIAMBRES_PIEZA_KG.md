# Auditoría Fiambres (Pieza → KG)

**Objetivo:** Diagnosticar si el sistema soporta correctamente el caso: producto fiambre que se compra por pieza al proveedor, el depósito mueve por pieza, y el local vende por kg en POS.

**Ejemplo:** Mortadela — compra: pieza; peso por pieza: 4,5 kg (fijo); depósito envía: piezas; local vende: kg.

**Alcance:** Solo diagnóstico. No implementar ni cambiar código.

---

## COMPRA PROVEEDOR

**Archivo:** `app/api/compras-proveedor/recibir/[id]/route.js`  
**Tablas:** `PedidoProveedor`, `PedidoProveedorDetalle`, `ProductoBase`, `StockLocal`, `ProductoLocal` (depósito).

- **Impacto en stock:** Si `modoCompraProveedor === "UNIDAD"`, el incremento en el depósito se hace en **kg**, no en piezas.
- **Cálculo:**  
  - Se usa `kgRecibidosMap[det.id]` si el cliente envía kg reales.  
  - Si no, **fallback:** `kgReales = cantRecibida * pesoReferenciaKg` (ej. 10 piezas × 4,5 = 45 kg).  
  - `incremento = kgReales` → se hace `StockLocal.cantidad: { increment: incremento }` en el **depósito**.
- **Dónde ocurre la conversión pieza → kg:** En este endpoint, en el bloque `if (modoCompra === "UNIDAD")` (líneas ~168–179). No hay otra conversión posterior para este flujo.
- **Si se reciben 10 piezas:** Con `pesoReferenciaKg = 4.5` y sin `kgRecibidos` en el body, se usan 10 × 4,5 = **45 kg** y el stock del depósito aumenta 45 (en kg). Si se envían `kgRecibidos` por ítem, se usan esos valores y opcionalmente se actualiza `pesoPromedioKg` si `actualizaPromedioPorRecepcion` es true.

**Conclusión:** La compra a proveedor para fiambre (UNIDAD + pesoReferenciaKg) está bien resuelta: el stock del depósito queda en **kg**.

---

## STOCK DEPOSITO

**Tabla:** `StockLocal` (campo `cantidad`).  
**Modelo:** `prisma/schema.prisma` — `StockLocal { localId, productoId, cantidad, stockMin, stockMax }`.

- **Unidad real del stock:** Para el producto fiambre (mortadela), después de recibir la compra, `StockLocal.cantidad` en el depósito está en **kg** (por lo implementado en compras-proveedor/recibir).
- **Relación pieza ↔ kg:** El sistema **no** guarda “piezas” en stock. Solo guarda un número (`cantidad`). La convención “1 pieza = pesoReferenciaKg” existe en **ProductoBase** (`pesoReferenciaKg`, `pesoEsFijo`, `pesoPromedioKg`) pero **no** se usa en ningún módulo de transferencias ni en sugeridos para interpretar “stock en piezas” ni para convertir piezas ↔ kg.
- **Representación:** El stock se puede interpretar como **kg** (coherente con compra y con venta en POS por kg). No hay vista ni lógica que muestre/edite “stock en piezas” usando `pesoReferenciaKg` en depósito.

**Conclusión:** En depósito el stock está en **kg**. El sistema “sabe” 1 pieza = pesoReferenciaKg solo a nivel de producto (compra); en depósito no hay conversión pieza ↔ kg en pantallas ni en APIs de transferencias.

---

## TRANSFERENCIA DEPOSITO → LOCAL

**Flujo:** Depósito arma una **PosTransferencia** (estado Borrador/Preparando/Solicitado), luego **envía** → se crea una **Transferencia** clásica con sus **TransferenciaDetalle**. El local **recibe** usando **confirmar-recepcion** (no `pos-transferencias/recibir` para estas transferencias creadas desde POS, porque ese endpoint exige estado "Pendiente" y desde POS se crea con estado "Enviada").

**Archivos relevantes:**

- **Sugeridos:** `app/api/pos-transferencias/sugeridos/route.js`  
  - Faltante = `stockMax - stockActualDestino` (ambos de `StockLocal.cantidad` del **destino**). Para mortadela en el local, ese stock está en kg → el sugerido es en **kg** (ej. 9).  
  - Usa `modo_pedido` y `factor_pack`; **no** usa `modoCompraProveedor` ni `pesoReferenciaKg`.
- **Agregar ítem:** `app/api/pos-transferencias/detalle/agregar/route.js`  
  - Guarda `sugerido`, `preparado`, `unidadSugerida`, `unidadPreparada` en **PosTransferenciaDetalle**. No hay lógica fiambre (piezas → kg).
- **Enviar:** `app/api/pos-transferencias/enviar/route.js`  
  - Toma `cantidadRaw` = preparado o sugerido (ej. 9) y `unidadPreparada` (ej. "UNIDAD").  
  - Convierte con `toUnidades({ cantidad, unidad, factorPack })` de `lib/conversiones/stock.js`: para UNIDAD y factor_pack 1 devuelve la misma cantidad.  
  - **No** usa `modoCompraProveedor` ni `pesoReferenciaKg`.  
  - Crea **TransferenciaDetalle** con `cantidad: item.cantidadRaw`, `unidadEnviada: item.unidadEnviada`.  
  - **No** descuenta stock en origen aquí; el descuento ocurre en **confirmar-recepcion**.

**Conversión en el flujo:**  
`lib/conversiones/stock.js` solo tiene **BULTO ↔ UNIDAD** (con `factor_pack`). No existe conversión **piezas → kg** usando `pesoReferenciaKg`.

- **Envío “2 piezas”:** Si el usuario en depósito ingresara “2” pensando en 2 piezas, el sistema trataría ese “2” como **2 unidades** (y con factor_pack 1, como 2 en stock). Para mortadela el stock en depósito está en **kg**, por lo que “2” se interpretaría como **2 kg**, no como 2×4,5 = 9 kg. No hay pantalla/endpoint que permita “enviar 2 piezas” y convierta automáticamente a 9 kg.

**Conclusión:** El flujo depósito → local funciona **solo si las cantidades se cargan ya en kg** (ej. 9 kg). No está soportado “enviar 2 piezas” con conversión automática 2×4,5 = 9 kg. Los campos `modoCompraProveedor` y `pesoReferenciaKg` **no** participan en transferencias.

---

## RECEPCION LOCAL

**Endpoint efectivo:** `app/api/transferencias/confirmar-recepcion/route.js` (el módulo `app/modulos/transferencias/[id]/page.jsx` llama a este con `transferenciaId`).

- **Datos usados:** Por cada `TransferenciaDetalle`: `cantidad` (enviada), `unidadEnviada` (BULTO/UNIDAD), `factor_pack` del producto.  
- **Conversión:** `recibidaUnidades = (unidadEnviada === "BULTO" && factor > 1) ? recibida * factor : recibida`. Para mortadela (UNIDAD, factor 1) → `recibidaUnidades = cantidad` (ej. 9).  
- **Stock en destino:** Se hace `increment: recibidaUnidades` en `StockLocal` del local.  
- **Stock en origen:** Se hace `decrement: recibidaUnidades` en `StockLocal` del depósito.

Si la transferencia se armó con cantidad **9** (kg), el local recibe 9 kg y el depósito se descuenta 9 kg. No hay uso de `pesoReferenciaKg` ni “piezas” en este endpoint.

**Nota:** `app/api/pos-transferencias/recibir/route.js` exige `transferencia.estado === "Pendiente"`. Las transferencias creadas desde POS se crean con estado **"Enviada"**, por lo que ese endpoint no se usa para recibir las que vienen de la POS; la recepción real es vía **confirmar-recepcion**.

**Conclusión:** La recepción en el local es coherente con cantidades en **kg**: se suman/restan los mismos números. No hay inconsistencia pieza/kg en este paso, siempre que la cantidad enviada esté ya expresada en kg.

---

## POS VENTA

**Archivo:** `app/api/pos-ventas/crear/route.js`  
**Tablas:** `Venta`, `VentaDetalle`, `StockLocal`.

- El carrito envía `items[]` con `cantidad` y `productoBaseId`. La API obtiene `ProductoLocal` del local y hace `decrement: item.cantidad` sobre `StockLocal` (por `localId` y `productoId` del ProductoLocal).
- No hay conversión por unidad de medida en este endpoint: se asume que `item.cantidad` está en la unidad en que el local maneja el stock (para mortadela, **kg**).
- **Buscar producto:** `app/api/pos-ventas/buscar-producto/route.js` devuelve `unidadMedida` (ej. "kg") y el front suele mostrar/precio por kg; la cantidad que se envía al crear la venta es en kg.

**Conclusión:** POS trabaja en **kg** para productos con `unidad_medida = kg`: se descuenta la misma cantidad que está en `StockLocal`. No hay mezcla con piezas en este flujo.

---

## CAMPOS USADOS REALMENTE

| Campo | Dónde se usa | Rol en flujo fiambre |
|-------|----------------|----------------------|
| **unidad_medida** | ProductoBase; sugeridos (defaultModoEnvio); POS buscar/crear; conversiones default. | Define “kg” para venta y sugeridos; no convierte pieza→kg en transferencias. |
| **modoCompraProveedor** | Solo `app/api/compras-proveedor/recibir/[id]/route.js`. | Decide si al recibir compra se usa kg (UNIDAD) o unidades por factor_pack (BULTO). |
| **pesoReferenciaKg** | Solo compras-proveedor/recibir. | Fallback para kg cuando no vienen `kgRecibidos`: cantRecibida * pesoReferenciaKg. |
| **pesoEsFijo** | No se usa en código de flujo (solo existe en schema). | No participa. |
| **pesoPromedioKg** | Compras-proveedor/recibir: actualización opcional si `actualizaPromedioPorRecepcion`. | Solo en recepción de compra; no en transferencias ni POS. |
| **pesoPromedioKg / actualizaPromedioPorRecepcion** | Compras recibir. | No afectan transferencias ni POS. |
| **modo_envio** | pos-transferencias (validarEnvio); sugeridos (default); POS buscar. | Restringe BULTO/UNIDAD al preparar envío; no relacionado con piezas/kg. |
| **modo_pedido** | pos-transferencias/sugeridos (sugerido en bultos o unidades). | No usa pesoReferenciaKg. |
| **factor_pack** | lib/conversiones/stock (toUnidades/fromUnidades); enviar; recibir; confirmar-recepcion. | Solo conversión BULTO↔UNIDAD; no piezas↔kg. |

**Resumen:** En el flujo fiambre (pieza en compra, kg en depósito y local, venta por kg), los únicos que intervienen en la **conversión** son `modoCompraProveedor` y `pesoReferenciaKg` en **compras-proveedor/recibir**. En transferencias (sugeridos, agregar, enviar, recibir/confirmar-recepcion) y en POS **no** se usan `modoCompraProveedor`, `pesoReferenciaKg` ni `pesoEsFijo`.

---

## PROBLEMAS DETECTADOS

1. **Depósito no puede enviar “por piezas” con conversión automática**  
   Si el usuario en depósito carga “2” pensando en 2 piezas de mortadela, el sistema interpreta 2 como 2 kg (o 2 “unidades” con factor 1). No hay conversión 2 piezas → 9 kg. Debe cargarse 9 (kg) a mano.

2. **Sugeridos en kg, no en piezas**  
   El sugerido se calcula como faltante en kg (stockMax - stockActual en destino). No hay opción “sugerir en piezas” usando pesoReferenciaKg (ej. “sugerir 2 piezas” = 9 kg).

3. **pos-transferencias/recibir no se usa para transferencias creadas desde POS**  
   Esas transferencias se crean con estado "Enviada"; `pos-transferencias/recibir` exige "Pendiente", por lo que la recepción real es vía `transferencias/confirmar-recepcion`. Riesgo de confusión o doble uso si en el futuro se cambia el estado inicial.

4. **Sin conversión pieza ↔ kg en lib/conversiones/stock**  
   Solo existe BULTO ↔ UNIDAD (factor_pack). Para fiambre sería necesario algo tipo “piezas × pesoReferenciaKg → kg” en enviar/recibir/confirmar si se quisiera operar en piezas en depósito.

5. **Riesgo de error de usuario**  
   Si en depósito cargan “2” creyendo que son piezas y el sistema lo toma como 2 kg, el local recibe 2 kg y el depósito queda con 2 kg menos de lo debido (deberían ser 9 kg); el stock quedaría inconsistente con la realidad física.

---

## DIAGNOSTICO FINAL

- **Compra a proveedor (pieza → kg):** Soportada. El stock del depósito queda en kg; la conversión se hace en `app/api/compras-proveedor/recibir/[id]/route.js` usando `modoCompraProveedor`, `pesoReferenciaKg` y opcionalmente `kgRecibidos`.
- **Stock en depósito:** Correcto en kg; no hay representación ni entrada en “piezas” usando pesoReferenciaKg.
- **Transferencia depósito → local:** Funciona **solo si las cantidades se ingresan en kg**. No hay soporte para “enviar X piezas” con conversión automática a kg; `modoCompraProveedor` y `pesoReferenciaKg` no se usan en ningún endpoint de pos-transferencias ni en confirmar-recepcion.
- **Recepción en local:** Correcta cuando la cantidad enviada está en kg; no hay inconsistencia pieza/kg en este paso.
- **POS venta:** Correcta; descuenta en kg y no mezcla con piezas.

**Conclusión:** El flujo fiambre **funciona de punta a punta en kg** (compra → depósito → transferencia → recepción → venta), pero **no** soporta que el depósito opere o ingrese cantidades en “piezas” con conversión automática a kg. Para soportar “depósito envía 2 piezas” (y que se registre y reciba como 9 kg) haría falta usar `modoCompraProveedor` y `pesoReferenciaKg` en el flujo de transferencias (sugeridos, agregar, enviar y/o confirmar-recepcion) y/o en `lib/conversiones/stock`.

---

# Implementación fiambres (pieza → kg) — Entregable

## ARCHIVOS TOCADOS

- **lib/conversiones/stock.js** — `esProductoFiambre`, `piezasToKg`, `kgToPiezas`.
- **app/api/pos-transferencias/detalle/agregar/route.js** — Aceptar `unidad` PIEZA; convertir a kg y guardar UNIDAD.
- **app/api/pos-transferencias/detalle/editar/route.js** — Aceptar PIEZA en sugerido/preparado; convertir a kg.
- **app/api/pos-transferencias/sugeridos/route.js** — Incluir en cada ítem `esFiambre` y `pesoReferenciaKg`.
- **app/api/pos-transferencias/detalle/route.js** (GET) — Incluir en cada detalle `esFiambre` y `pesoReferenciaKg`.
- **components/pos-transferencias/nueva/PreparadosTable.jsx** — Toggle “Piezas”/“Kg”, equivalencia y envío en PIEZA.
- **components/pos-transferencias/nueva/TablaSugeridos.jsx** — Toggle “Piezas”/“Kg”, equivalencia y `onEditSugerido` con PIEZA.

No tocados: base de datos, Prisma, POS ventas, compra proveedor, `enviar`, `confirmar-recepcion` (siguen recibiendo cantidad en kg).

## LOGICA FINAL PIEZA A KG

- **Condición fiambre:** `unidad_medida === "kg"` y `modoCompraProveedor === "UNIDAD"` y `pesoReferenciaKg > 0`.
- **Fórmula:** `kg = piezas * pesoReferenciaKg` (por ahora no se usa `pesoEsFijo` ni `pesoPromedioKg`).
- En agregar/editar, si el body trae cantidad con unidad **PIEZA** y el producto es fiambre, se convierte con `piezasToKg` y se persiste **kg** con unidad **UNIDAD**. El resto del flujo (enviar, confirmar-recepcion) sigue en kg.

## EN QUE PARTE DEL FLUJO SE CONVIERTE

- **Al agregar ítem:** `detalle/agregar` — si `unidadBody === "PIEZA"` y producto es fiambre, `sugerido`/`preparado` se convierten con `piezasToKg` y se guardan en BD como kg con `unidadSugerida`/`unidadPreparada` = UNIDAD.
- **Al editar ítem:** `detalle/editar` — si `unidadPreparada` o `unidadSugerida` es PIEZA y producto es fiambre, el valor numérico se convierte con `piezasToKg` y se guarda como kg con UNIDAD.
- En **enviar** y **confirmar-recepcion** no hay conversión: siempre trabajan con la cantidad ya guardada en kg (UNIDAD).

## IMPACTO EN STOCK

- **PosTransferenciaDetalle** y **TransferenciaDetalle** guardan siempre cantidad en **kg** (o en unidades/bultos para no fiambre). No se persiste “piezas”.
- Al enviar y recibir se descuenta/suma la misma cantidad en kg en **StockLocal** (origen y destino). Sin cambio respecto al flujo anterior.

## RIESGOS

- Productos no fiambre que reciban por error unidad PIEZA: se rechaza con 400 en agregar/editar.
- Si el front envía PIEZA para un producto sin `pesoReferenciaKg` o sin ser fiambre, la API responde error; la UI solo muestra “Piezas” cuando `esFiambre && pesoReferenciaKg > 0`.
- La página de nueva transferencia sigue enviando `productoLocalId: productoLocalOrigenId` al agregar; si el backend espera id de destino, eso es preexistente y no se modificó.

## BUILD

- `npm run build` ejecutado: compilación correcta (Next.js 16, Turbopack).
