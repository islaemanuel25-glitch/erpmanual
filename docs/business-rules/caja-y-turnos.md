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

### Vencido se decide por `venceEn`, no por la etiqueta · **[CÓDIGO]** · *desde 2026-09-26*

La etiqueta `VENCIDO` la escribe `marcarCortesVencidos` recién cuando alguien abre
la bandeja de pendientes. Las reglas no la leen: preguntan a `cierreAtrasado`, que
mira `venceEn`. Cancelar exige un corte **vigente** (`cierreCancelable`); cerrar sin
conteo exige uno **vencido** (`cierreCerrableSinConteo`). Confirmar acepta los dos.

### Cerrar sin conteo · **[CÓDIGO]** · *desde 2026-09-26*

La resolución administrativa de un corte vencido cuyo conteo ya no existe
(`app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js`). **Un dato
desconocido no es cero.**

- Solo para un corte vencido por tiempo, con motivo obligatorio y el permiso
  `pos.cerrar_sin_conteo`, que no va a ningún rol de sistema.
- El turno queda CERRADO con el **esperado congelado** del corte, la cantidad de
  ventas congelada y el cambio separado antes del corte. **Lo contado, la
  diferencia y el retiro final quedan en NULL.**
- **No** crea arqueo FINAL, **no** crea el movimiento de retiro y **no** toca el sobre
  de cambio.
- El corte queda `CERRADO_SIN_CONTEO`, con `cerradoSinConteoEn`,
  `cerradoSinConteoPorUsuarioId` y `motivoCierreSinConteo`. Nada de lo que congeló se
  pisa.
- La evidencia va a `AuditoriaBitacora` (`caja.cerrar_sin_conteo`) en la misma
  transacción.
- Las pantallas muestran **"Sin contar"** y **"No disponible"**, nunca un cero:
  `turnoSinConteo` y `TEXTO_SIN_CONTAR` en `lib/caja/cierreRelevo.js`.

`scripts/cerrar-turno-vencido.mjs` tiene `--aplicar` **bloqueado**: cerraba
mandando el esperado como contado, que fabrica una diferencia de cero.

**Pendiente:** los turnos ABIERTOS de un día anterior —que nunca tomaron su
corte— no tienen todavía una salida honesta; esta resolución no los cubre.

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

### El error ×1000: un monto escrito donde va una cantidad · **[CÓDIGO]** · *desde 2026-09-26*

La grilla pide **cuántos billetes** hay de cada denominación. En producción se
escribió varias veces el monto en la fila: 23000 en la de $1.000 para dejar
$23.000, y quedó guardado $23.000.000. El motivo obligatorio de RN-36 no lo
frenó: el sobrante se explicó con cualquier texto y entró.

`evaluarDesproporcionDesglose` (`lib/caja/desgloseServidor.js`) compara el
total cargado contra la referencia que el sistema tiene en ese punto. Con
**2 veces o más** (`FACTOR_DESPROPORCION`), pide **escribir el total contado en
pesos** y solo sigue si coincide al centavo con lo cargado. No corrige nunca el
número, no bloquea un conteo confirmado y no mira hacia abajo, porque una
referencia contaminada por este mismo error no debe impedir registrar la verdad.

La misma función la usan la grilla (`TablaDenominaciones`) y las cinco rutas.
Las referencias por ruta:
- la recepción usa lo que dice el sobre;
- los dos cortes, de cierre y de retiro, usan el efectivo esperado recalculado adentro de la transacción;
- las dos confirmaciones usan el retiro esperado congelado (el cierre del orden anterior usa el efectivo esperado congelado).

**La apertura sin sobre** (`turnos/abrir-sin-cambio`) no tiene ninguna
referencia monetaria, así que se protege por **cantidad por fila**: más de
**500 billetes** en una denominación (`UMBRAL_CANTIDAD_EXTRAORDINARIA`) pide la
misma confirmación en pesos. *Desde 2026-09-26.* El 500 sale del relevamiento
de producción: ninguna fila legítima pasa de 387 y las 25 filas por encima de
500 son todas incidentes. El tope duro de 100.000 sigue igual. Las rutas con
referencia no usan este umbral.

Se descartó usar "el último cambio dejado en el local" como referencia:
- un sobre de $0 se publica a propósito;
- no hay límite de antigüedad;
- los sobres contaminados por este mismo error siguen siendo "el último", y un sobre inflado dejaría pasar un error en silencio;
- cuando no hay sobre, no hay referencia.

Probado contra Postgres en `scripts/pruebas-db/cierreCaja.mjs`, sección E, y
contraprobado en CC-13 a CC-18.

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

## RN-42 — El descuento por puntos LO RECALCULA EL SERVIDOR · **[CÓDIGO]** · *desde 2026-08-10*

Era el único importe del cobro que **no** era server-authoritative: el servidor
validaba que `puntosCanje` no excediera el saldo —dos veces— pero tomaba el peso
del descuento crudo del body. Se controlaba cuántos puntos se gastaban y no cuánta
plata valían, así que un canje de 1 punto podía descontar el subtotal entero.

Ahora el servidor **lee `pesoPorPunto` de `PuntosConfigLocal` y recalcula**. Si el
importe recibido no coincide, **rechaza el cobro** con un mensaje que dice los dos
números y qué hacer. La fórmula vive una sola vez en `lib/pos-ventas/puntos.js` y
la comparten el POS y el servidor.

**Qué valor manda:** el del servidor al momento del cobro, no el que el navegador
tenía cargado. `pesoPorPunto` se puede editar en cualquier momento desde la
pantalla de fidelidad, así que entre que el cajero abre el canje y aprieta cobrar
puede haber cambiado. Se rechaza en vez de corregir en silencio: corregir
cambiaría el total que el cajero ya leyó en pantalla, con una persona enfrente.

La comparación lleva **un centavo de tolerancia**, porque `pts × pesoPorPunto` en
coma flotante da residuos y rechazar una venta legítima por ruido binario sería
peor que el problema. Candado: `lib/pos-ventas/puntos.test.mjs`, con el caso
manipulado.

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

**Corregido el 2026-08-10:** `app/api/clientes/[id]/ventas` tampoco lo aplicaba,
y el historial de un cliente vinculado a un local interno mezclaba sus
transferencias con sus compras. Resultó que la ruta estaba clasificada como
TÉCNICA a propósito —ver C-13—, así que se movió de categoría de forma deliberada
y el candado de clasificación se reescribió. Ahora filtra por defecto y las
internas se piden con `?incluirInternas=1`.

Verificado contra `erpazul_al`: el cliente 1 tiene 333 ventas, 287 comerciales y
46 internas; la interna 4033 no aparece por defecto y sí con el parámetro.
