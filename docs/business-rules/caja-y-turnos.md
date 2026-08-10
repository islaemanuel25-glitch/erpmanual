# Caja y turnos

Cuándo se puede vender, qué es un turno abierto y cómo se cierra una caja. Todas
verificadas en código.

---

## RN-30 — "Turno abierto" no es `cierre = null` · **[CÓDIGO]**

Un turno operativo exige además que **no esté en preparación de cierre**.

`WHERE_TURNO_OPERATIVO` (`lib/caja/cierreRelevo.js:88`) pide
`cierre = null` **y** `cierreEnPreparacionEn = null`. Se aplica dentro del WHERE
de la venta en `app/api/pos-ventas/crear/route.js:119-127`.

El estado se deriva **siempre** con `estadoDelTurno()`
(`lib/caja/cierreRelevo.js:65`). Nunca se calcula a mano en una pantalla.

Los cuatro estados son mutuamente excluyentes y viven en
`lib/turnos/filtrosListado.js:37-53` (`condicionEstado`). "Anuladas" se separa
aunque el turno tenga `cierre` seteado.

---

## RN-31 — Una caja de un día anterior bloquea vender · **[CÓDIGO]**

`app/api/pos-ventas/crear/route.js:150-160`: si
`fechaArgentinaISO(turno.apertura) !== hoyArgentinaISO()`, responde **403**.

---

## RN-32 — Un turno abierto por USUARIO, no por local · **[CÓDIGO]**

`app/api/pos-ventas/turnos/abrir/route.js:33-57` y `:118-129`. Los turnos ajenos
y los ya cortados no bloquean.

Lo respalda un **índice parcial único que vive solo en SQL** y está documentado en
`prisma/schema.prisma:1185-1204`. Prisma no puede declararlo: si alguien recrea el
esquema desde el modelo sin las migraciones, el índice no existe.

---

## RN-33 — El efectivo esperado tiene una sola fórmula · **[CÓDIGO]**

`calcularEfectivoEsperado` (`lib/caja/efectivoEsperado.js:125`). Acumula en
**centavos enteros**.

Los arqueos anteriores **no entran** en la fórmula: está comentado en `:29-31` y
se verifica por ausencia del término en `:131-132`.

---

## RN-34 — El cierre es en dos actos y el esperado se congela · **[CÓDIGO]**

El monto esperado se congela en el corte y **no se recalcula al confirmar**
(`lib/caja/cierreRelevo.js:19-23`, `calcularRetiroEsperado` en `:263`,
`calcularCierreDesdeRetiro` en `:308`).

El cierre clásico rechaza con **409** un turno ya cortado
(`app/api/pos-ventas/turnos/cerrar/route.js:74-84`).

Cierre y retiro son **mutuamente excluyentes** sobre el mismo turno, con textos de
error propios (`cierreRelevo.js:102-111`).

### Plazos

- Corte: **12 horas** (`HORAS_VENCIMIENTO_CIERRE`, `cierreRelevo.js:124`).
  Vencer **no libera nada**.
- Reserva de sobre: **20 minutos** (`MINUTOS_RESERVA_CAMBIO`, `:135`). Esta sí se
  libera.

---

## RN-35 — La reserva es propia por usuario Y por operario · **[CÓDIGO]**

`esReservaPropia` (`lib/caja/cierreRelevo.js:185`). No alcanza con ser el mismo
usuario: también tiene que ser el mismo operario. Es la regla que hace que un
relevo no se lleve puesta la reserva del anterior.

---

## RN-36 — El fondo recibido es lo contado, no lo esperado · **[CÓDIGO]**

`evaluarRecepcionCambio` (`lib/caja/cierreRelevo.js:440-519`): `montoInicial` toma
**lo contado**. Con diferencia, el motivo es **obligatorio**.

Y el caso fino: **mismo importe con otros billetes exige confirmación explícita**
(`RECEPCION.COINCIDE_TOTAL`, `:479-488`). Cuadrar en total no prueba que el
desglose esté bien.

---

## RN-37 — El arqueo se ancla al turno, no al calendario · **[CÓDIGO]**

`proximaAlerta` (`lib/caja/arqueo.js:78`) cuenta desde el último arqueo o desde la
apertura. Los defaults están en `CONFIG_ARQUEO_DEFAULT` (`arqueo.js:20`), con
`arqueoCajaActivo: false`: **viene apagado**.

---

## RN-38 — La anulación de un turno es técnica y conserva todo · **[CÓDIGO]**

`prisma/schema.prisma:1167-1183`: el turno se conserva entero, `montoInicial`
**no se pisa**, y los importes de cierre quedan en NULL.

---

## RN-39 — Corrección de venta: dos niveles · **[CÓDIGO+DOC]**

- **Simple** — solo `clienteId`, `observaciones`, `referenciaInterna`
  (`CAMPOS_SIMPLE`, `lib/pos-ventas/correccion.js:20`). **No cambia el cliente de
  una venta fiada** (`:12-13` y `esVentaFiada`, `:33`).
- **Completa** — solo con el **turno original abierto**, ventana de **30 días**
  (`DIAS_LIMITE_CORRECCION`, `correccion.js:15`), versión optimista e
  idempotencia (`app/api/pos-ventas/venta/[id]/corregir/route.js:100-103`).
  Está detrás de un **feature flag beta fail-closed** (`:52`).

`docs/modulos/reportes-ventas.md` describe esto mismo y **coincide con el código**.

**Sin candados:** `motorCorreccion.js` y `correccionCompletaServer.js` son lo que
reescribe stock, pagos y cuenta corriente, y no tienen un solo test.

---

## RN-40 — Los pagos los manda el servidor · **[CÓDIGO]**

`normalizarYConsolidarPagos` (`lib/pos-ventas/pagos.js:100-135`) exige que la suma
de los montos sea **exactamente** el total, en centavos, y que FIADO sea tender
único.

Las comisiones y los campos legacy se derivan con `aplicarComisiones` (`:142`) y
`derivarCamposVenta` (`:233`). El porcentaje sale de `ConfiguracionGrupo`, con
default 7 (`app/api/pos-ventas/crear/route.js:525-535`).

**[CONTRADICCIÓN]** — `docs/modulos/pos-ventas.md:41` dice "7% para pagos con
tarjeta/MP" como si fuera fijo. Es configurable por grupo; 7 es solo el default.

---

## RN-41 — Los servicios de importe variable · **[CÓDIGO]**

Cantidad fija 1 (`crear/route.js:314-321`). Importe entero entre
`IMPORTE_SERVICIO_MIN = 100` y `IMPORTE_SERVICIO_MAX = 500000`
(`lib/pos-ventas/servicios.js:30-31`, validado en `validarImporteServicio`, `:54`).

**No se pueden fiar** (`crear/route.js:545-550`) y deben cubrirse íntegramente en
efectivo (`validarCoberturaEfectivo`, `:552-562`). Los descuentos **no** pueden
tocarlos: la base elegible es el subtotal sin servicios (`:479-495`).

---

## RN-42 — El descuento por puntos NO se recalcula en el servidor · **[ACCIDENTE POSIBLE]**

Es el único importe del cobro que no es server-authoritative.

`app/api/pos-ventas/crear/route.js:482` toma `descuentoPorPuntos` crudo del body
(`Number(descuentoPorPuntosBody) || 0`). El servidor **sí** valida que
`puntosCanje` no exceda el saldo (`:574-596`, y otra vez dentro de la transacción
en `:971-1006`), pero **nunca verifica que el descuento sea
`puntosCanje × pesoPorPunto`**. El único tope es no exceder la mercadería elegible
(`:487`).

El cálculo lo hace el cliente: `app/modulos/pos-ventas/page.jsx:1946-1954`.

**No se pudo verificar si es intencional.** Se registra como posible accidente, no
como regla. Va al roadmap como **requiere decisión humana**.

---

## RN-43 — La acreditación de puntos es best-effort; el canje no · **[CÓDIGO]**

Asimetría deliberada y verificable:

- **Acreditar** va **fuera** de la transacción y su error se traga con un
  `console.error` sin romper la venta (`crear/route.js:1027-1082`). Idempotente
  por `ventaId` + `tipo: "ACREDITACION"` (`:1056-1059`).
- **Canjear** va **dentro** de la transacción y revalida el saldo ahí adentro
  (`:971-1006`).

Tiene sentido: perder puntos es recuperable, cobrar de menos no.

`puntosAcreditar = Math.floor(subtotalElegible × puntosPorPeso)`, donde el
subtotal elegible descarta servicios, productos excluidos y categorías excluidas
(`:1039-1053`). Si el local no tiene la config `activo: true`, no se acredita nada
(`:1030-1032`).

---

## RN-44 — El descuento del cliente es el mayor, no la suma · **[CÓDIGO]**

`app/api/pos-ventas/crear/route.js:433-439`:
`Math.max(pctCliente, pctMaxTag)`. El descuento propio del cliente y el de sus
etiquetas **nunca se suman**.

---

## RN-45 — Las ventas internas se excluyen de los reportes comerciales · **[CÓDIGO]**

`whereVentaComercial` (`lib/ventas/filtroVentaComercial.js:48-50`) se traduce en
`transferencia: { is: null }`.

Lo aplican reportes de ventas, analytics de clientes y los totales de turno. **No
lo aplica `auditoria-pos-ventas`, a propósito**: es la vista técnica, y está
declarado en `filtroVentaComercial.js:35-37`.

**[ACCIDENTE POSIBLE]** — `app/api/clientes/[id]/ventas/route.js:60` tampoco lo
aplica, y no hay comentario que lo justifique. Si un cliente está vinculado a un
local interno, su historial mezcla ventas internas con comerciales.
