# Verificación funcional modoVentaDeposito

**Alcance:** Verificación únicamente. No implementación.

---

## CASO 1 — MORTADELA (modoVentaDeposito = PIEZA)

**Producto:** unidad_medida = kg, modoCompraProveedor = UNIDAD, pesoReferenciaKg = 4.5, pesoEsFijo = true, modoVentaDeposito = PIEZA.

**Esperado:** POS depósito vende por pieza; transferencia opera por pieza; local recibe/vende por kg.

| Área | Estado | Detalle |
|------|--------|---------|
| **POS depósito vende por pieza** | Parcial | `app/api/pos-ventas/buscar-producto/route.js` usa `esFiambreFijo(pl.base)` (modoVentaDeposito === "PIEZA" o pesoEsFijo). Si es true, devuelve `unidadMedida = "unidad"`, precio por pieza, `esFiambreFijo: true`. El front no abre ModalPesoKg (solo cuando `unidadMedida === "kg"`), así que el usuario ingresa cantidad en piezas (1, 2…). **Problema:** `pos-ventas/crear` recibe `item.cantidad` y descuenta ese valor de StockLocal. No hay conversión piezas → kg. El stock está en kg, por lo que se descontarían 2 en lugar de 9 kg. **Conclusión:** UX correcta (vende por pieza), descuento de stock incorrecto. |
| **Transferencia opera por pieza** | No cumple | En `components/pos-transferencias/nueva/PreparadosTable.jsx` y `TablaSugeridos.jsx` el botón "Piezas" se muestra cuando **esFiambre && !esFijo** (líneas 457 y 451). Para Mortadela, esFijo = true, por lo que el botón **no** se muestra y el depósito no puede elegir "por piezas" en la transferencia. Comportamiento invertido respecto al esperado. Además, en `detalle/agregar` cuando unidadBody === "PIEZA" y **esFijo**, no se convierte a kg (solo se convierte cuando !esFijo). Si se enviara PIEZA por API, se guardaría 2 (piezas) y luego enviar/confirmar descontarían 2 kg en lugar de 9. |
| **Local recibe/vende por kg** | Sí | Recepción y POS local usan cantidad en kg; no dependen de modoVentaDeposito. |

**Resumen Caso 1:** POS depósito muestra venta por pieza pero el descuento de stock es en “número crudo” (piezas como si fueran kg). Transferencias no permiten operar por pieza en la UI (botón oculto para fiambre fijo) y, si se usara PIEZA por API para fijo, el stock quedaría mal.

---

## CASO 2 — SALAME VARIABLE (modoVentaDeposito = PESO)

**Producto:** unidad_medida = kg, modoCompraProveedor = UNIDAD, pesoReferenciaKg > 0, pesoEsFijo = false, modoVentaDeposito = PESO.

**Esperado:** POS depósito pide peso; transferencia opera por peso; local vende por peso.

| Área | Estado | Detalle |
|------|--------|---------|
| **POS depósito pide peso** | Sí | `esFiambreFijo(base)` es false (modoVentaDeposito !== "PIEZA", pesoEsFijo false). buscar-producto no fuerza unidadMedida a "unidad", queda "kg". handleAgregar abre ModalPesoKg y se ingresa cantidad en kg. crear descuenta esa cantidad (kg). Correcto. |
| **Transferencia opera por peso** | No cumple | En la UI, "Piezas" se muestra cuando **esFiambre && !esFijo**. Para Salame variable, esFijo = false, así que el botón **sí** se muestra y el depósito puede elegir "Piezas". Lo esperado es que solo opere por peso (kg), sin opción piezas. |
| **Local vende por peso** | Sí | POS local usa unidad_medida kg; sin impacto. |

**Resumen Caso 2:** POS depósito correcto. En transferencias se ofrece "Piezas" cuando no debería (debería solo peso).

---

## CASO 3 — MORTADELA CON VENTA DEPÓSITO POR PESO (modoVentaDeposito = PESO)

**Producto:** Igual que Caso 1 pero modoVentaDeposito = PESO.

**Esperado:** POS depósito pide peso; no vende por pieza.

| Área | Estado | Detalle |
|------|--------|---------|
| **POS depósito pide peso** | Sí | `esFiambreFijo(base)` es false (modoVentaDeposito === "PESO"). buscar-producto mantiene unidadMedida = "kg", se abre ModalPesoKg. Correcto. |
| **No vende por pieza** | Sí | Sin cambio de unidad a "unidad" ni precio por pieza; solo kg. Correcto. |

**Resumen Caso 3:** Comportamiento correcto.

---

## FALLBACK ACTIVO O NO

**Sí, fallback activo.**

En `lib/conversiones/stock.js`, `esFiambreFijo(base)`:

- Primero usa **modoVentaDeposito**: si existe, devuelve `base.modoVentaDeposito === "PIEZA"`.
- Si no hay modoVentaDeposito (productos no migrados), usa **pesoEsFijo**: `return base.pesoEsFijo === true`.

Así, productos sin modoVentaDeposito configurado siguen comportándose por pesoEsFijo.

---

## RIESGOS

1. **POS depósito + venta por pieza (Caso 1):** Se envía cantidad en piezas y `pos-ventas/crear` descuenta ese valor como si fuera kg. Stock en depósito queda incoherente (ej. 2 piezas descontadas como 2 kg en lugar de 9 kg).
2. **Transferencias UI:** El botón "Piezas" está condicionado a **esFiambre && !esFijo**, por lo que: (a) Mortadela PIEZA (esFijo true) no ve la opción piezas; (b) Salame PESO (esFijo false) sí la ve. Debería ser al revés: mostrar "Piezas" solo cuando **esFiambreFijo** (modoVentaDeposito = PIEZA o pesoEsFijo).
3. **detalle/agregar con PIEZA y esFijo:** Si llega unidad PIEZA y esFiambreFijo, no se convierte a kg y se guarda el número en piezas. En enviar/confirmar-recepcion se usa esa cantidad contra StockLocal (en kg), generando descuento/ingreso erróneo (ej. 2 en lugar de 9 kg).
4. **Consistencia:** Mientras el stock de depósito y local sea siempre en kg, toda cantidad enviada a crear (POS) o guardada en detalle (transferencias) debe estar en kg; la conversión piezas → kg debe aplicarse antes de persistir o descontar.

---

## BUILD

No se modificó código. El estado del build es el actual del proyecto (sin re-ejecutar `npm run build` para esta verificación).

---

## RESUMEN

| Caso | POS depósito | Transferencia | Local |
|------|--------------|---------------|--------|
| 1 Mortadela PIEZA | Muestra pieza; descuento stock incorrecto (piezas como kg) | No ofrece "Piezas" (botón oculto); si se usara PIEZA en API, stock mal | OK |
| 2 Salame PESO | OK (peso) | Ofrece "Piezas" (no debería) | OK |
| 3 Mortadela PESO | OK (peso) | N/A | OK |

---

# Corrección final modoVentaDeposito (aplicada)

## ARCHIVOS TOCADOS

- **app/api/pos-ventas/crear/route.js** — Conversión piezas→kg al descontar en depósito cuando modoVentaDeposito = PIEZA.
- **app/api/pos-transferencias/detalle/agregar/route.js** — Siempre convertir PIEZA→kg; respuesta con modoVentaDeposito.
- **app/api/pos-transferencias/detalle/editar/route.js** — Siempre convertir PIEZA→kg; respuesta con modoVentaDeposito.
- **app/api/pos-transferencias/sugeridos/route.js** — Sugerido por modoVentaDeposito PIEZA; respuesta modoVentaDeposito; quitado esFiambreFijo.
- **app/api/pos-transferencias/detalle/route.js** — Respuesta con modoVentaDeposito en lugar de esFiambreFijo.
- **app/api/pos-transferencias/recibir/route.js** — Eliminada conversión extra (cantidad ya en kg).
- **app/api/pos-transferencias/agregarItem/route.js** — Respuesta con modoVentaDeposito.
- **components/pos-transferencias/nueva/PreparadosTable.jsx** — Mostrar/uso Piezas según modoVentaDeposito === "PIEZA".
- **components/pos-transferencias/nueva/TablaSugeridos.jsx** — Idem.

## ERROR 1 CORREGIDO

En **pos-ventas/crear**: se obtiene el local (es_deposito) y por cada producto base modoVentaDeposito y pesoReferenciaKg. Si el local es depósito y modoVentaDeposito === "PIEZA" y pesoReferenciaKg > 0, se calcula `cantidadParaStock = item.cantidad * pesoReferenciaKg`; en caso contrario se usa `item.cantidad`. El descuento en StockLocal y la validación de stock usan `cantidadParaStock`. La VentaDetalle sigue guardando `item.cantidad` (piezas o kg según corresponda).

## ERROR 2 CORREGIDO

En **TablaSugeridos** y **PreparadosTable**: la opción "Piezas" (botón y modo) se muestra solo cuando **esFiambre && modoVentaDeposito === "PIEZA"** (variable `ventaDepositoPieza`). Se dejó de usar esFiambreFijo y !esFijo. Las APIs de sugeridos, detalle GET, agregar, editar y agregarItem devuelven **modoVentaDeposito** para que la UI decida.

## ERROR 3 CORREGIDO

En **detalle/agregar** y **detalle/editar**: cuando la unidad recibida es PIEZA, **siempre** se convierte a kg con `piezasToKg(cantidad, pesoReferenciaKg)` antes de persistir; se guarda unidad UNIDAD. Se eliminó la rama que guardaba el número crudo para "fiambre fijo".

## LOGICA FINAL STOCK

- **StockLocal** y cantidades de **TransferenciaDetalle** / **PosTransferenciaDetalle** son siempre en **kg** (o unidades/bultos para productos no fiambre).
- **modoVentaDeposito** define cómo opera el depósito: PIEZA (entrada en piezas, se convierte a kg al persistir/descontar) o PESO (entrada en kg).
- **pesoEsFijo** no define el modo de venta ni si se muestra Piezas en transferencias; solo es dato de referencia.
- Donde se persiste o descuenta stock real con entrada en piezas, se aplica **piezas → kg** con `piezasToKg(piezas, pesoReferenciaKg)`.

## BUILD

Linter sin errores. Build no re-ejecutado en esta sesión (el usuario puede correr `npm run build`).
