# Circuito de caja: apertura, retiro, cierre con relevo y cambio pendiente

Este documento describe el circuito completo del dinero físico de una caja: con
qué abre, qué pasa adentro, qué sale del local y qué queda para el turno
siguiente.

Reemplaza al cierre por modal y a la apertura por importe manual. Los dos
mecanismos anteriores siguen en el repositorio como vía administrativa acotada
—ver *Legado*— pero no son el flujo habitual.

---

## El problema que resuelve

Cerrar caja bloqueaba el mostrador. El cajero que se va tiene que contar el cajón
billete por billete —diez minutos largos— y mientras tanto nadie podía vender,
porque el turno seguía abierto y el POS estaba tomado por el modal de cierre.

El cierre se parte en dos actos separados en el tiempo:

- **Corte**: instantáneo. Congela el efectivo esperado y la frontera de qué
  ventas y movimientos pertenecen a este turno. El turno deja de operar y el
  relevo ya puede abrir el suyo.
- **Confirmación**: cuando el cajero terminó de contar, en su propia pestaña,
  usando el número congelado en el corte.

---

## Los tres estados del turno

Se derivan de dos campos y **nunca** se comparan a mano: la fuente única es
`estadoDelTurno()` en `lib/caja/cierreRelevo.js`.

- **ABIERTO** — `cierre` es null y `cierreEnPreparacionEn` es null.
- **CIERRE EN PREPARACIÓN** — `cierre` es null y `cierreEnPreparacionEn` no.
- **CERRADO** — `cierre` no es null.
- **ANULADO** — `anuladoEn` no es null. Se evalúa primero, porque un turno
  anulado también tiene `cierre` seteado.

Un turno en preparación de cierre **no vende, no admite Caja +/−, no admite
retiros y no se puede cerrar por el flujo clásico**. Tampoco figura como caja
abierta en listados ni en auditoría.

### El índice que lo hace posible

`Turno_local_vendedor_abierto_key` es un índice parcial de Postgres que impide
dos turnos operativos del mismo usuario en el mismo local. Su condición incluye
`cierreEnPreparacionEn IS NULL`: sin eso, la base rechazaría la apertura del
relevo, porque un turno cortado sigue con `cierre IS NULL`.

---

## El orden físico: el cambio se separa ANTES del corte

Éste es el orden, y no es negociable:

1. se aparta físicamente el cambio que queda en la caja para seguir vendiendo;
2. se cuenta ese cambio por denominaciones;
3. se toma el corte, que congela esperado, fronteras y cambio;
4. la caja sigue operando con ese cambio;
5. se cuenta **únicamente** el dinero retirado;
6. se compara contra el retiro esperado congelado.

Hasta agosto de 2026 el orden era el inverso: se contaba todo el cajón y el
cambio se elegía al final, sobre la pila ya contada. Eso obligaba a contar el
cajón entero mientras el local seguía cobrando sobre ese mismo cajón, y en el
retiro —que no congelaba nada— producía un faltante por plata que había entrado
después de que el cajero cerrara la pila.

## El corte congela el período

Al tomar el corte se guarda en `CierrePreparacion`:

- `efectivoEsperadoCorte`, calculado con la fórmula única de
  `lib/caja/efectivoEsperado.js`. **No se recalcula al confirmar.**
- `desgloseCambio` y `totalCambio`: el cambio ya apartado. **Inmutable desde
  acá**, porque su sobre queda publicado en el mismo acto.
- `efectivoRetiradoEsperado` = `efectivoEsperadoCorte − totalCambio`. Es el
  segundo número que no se recalcula, y es contra éste que se compara el conteo.
- `ultimaVentaId` y `ultimoMovimientoId`: la frontera va **por ID, no por
  timestamp**. Dos filas creadas en el mismo milisegundo son indistinguibles por
  fecha y una venta que entra justo durante el corte caería de los dos lados o
  de ninguno.
- `token`: llave aleatoria de 32 bytes con la que se accede a la pantalla.

`efectivoRetiradoEsperado` **puede dar negativo** y no se recorta: pasa cuando se
deja como cambio más plata de la que el sistema esperaba encontrar. Recortarlo a
cero rompería la identidad que hace visible el sobrante.

**Las ventas y los movimientos posteriores al corte pertenecen al turno nuevo.**
No aparecen en el cierre ni aunque se recargue la pantalla horas después.

Que el esperado no se recalcule es toda la razón de ser del flujo: entre el corte
y la confirmación el relevo estuvo vendiendo, y recalcular le imputaría al cajero
saliente plata que nunca tuvo en la mano.

### Por qué el acceso va por token y no por operador activo

El operario vive en la cookie `erpazul_operador_activo`, que es del **navegador
entero, no de la pestaña**. Cuando el relevo hace login en la pestaña del POS, la
pestaña del cierre —que revalida al recuperar el foco— pasaría a ver al operador
nuevo, y el conteo terminaría firmado por quien no contó.

La pantalla del cierre no lee esa cookie en ningún momento. La autoría es la que
el servidor grabó al tomar el corte. El token no reemplaza a la autenticación: se
exigen igual sesión, permiso `pos.usar` y local del contexto activo, y un token
de otro local devuelve 404.

### Vencimiento

Un corte sin confirmar pasa a `VENCIDO` a las 12 horas. **Vencer no libera nada**:
el corte sigue congelado, el turno sigue sin operar y el cierre se puede
confirmar igual. Es una marca de atraso para que alguien lo resuelva.

Es lo contrario de la reserva de un cambio, que sí vuelve a estar disponible al
vencer: una reserva abandonada no movió plata, el sobre sigue en el cajón.

---

## El conteo, siempre por denominaciones

No existe un campo de importe total en ninguna de las tres pantallas —retiro,
cierre y apertura—. El total sale de sumar las filas.

Denominaciones: $20.000, $10.000, $2.000, $1.000, $500, $200, $100, más
"Monedas / otros" como **importe directo** (admite decimales). No hay billete de
$5.000: el BCRA nunca lo emitió.

**El total lo calcula siempre el servidor** (`validarDesgloseServidor`). Un total
mandado por el cliente se ignora. Una denominación desconocida se rechaza en vez
de ignorarse: ignorarla convertiría un error de contrato en plata que desaparece
del conteo sin aviso.

El cajero no elige cuánto retirar: elige **qué billetes deja como cambio**, y el
retiro es una consecuencia aritmética. Con el orden actual esa elección se hace
antes de cortar, así que después sólo queda una pila por contar.

    retiro esperado  = efectivo esperado al corte − cambio separado
    diferencia       = retiro contado − retiro esperado
    total del cajón  = retiro contado + cambio separado

La diferencia da **exactamente lo mismo** que daba el orden anterior
(`contado − esperado`), porque `contado = retiro + cambio`. Cambia el trabajo
físico, no el número.

### Las columnas históricas no cambian de significado

`ArqueoCaja.efectivoContado` y `Turno.montoRealEfectivo` siguen siendo **todo el
efectivo del cajón** al momento del corte. Lo que cambió es que ahora se
*derivan* —`retiro contado + cambio separado`— en vez de contarse de una sola
vez. El retiro contado va a un campo propio, `totalRetiroContado`.

Esto es deliberado y es el riesgo más silencioso de todo el cambio: si los
registros nuevos guardaran ahí sólo el retiro, quedarían dos semánticas
conviviendo en la misma columna sin ninguna marca que las distinga, y ningún
reporte se enteraría.

---

## El cambio pendiente

El `CambioPendiente` se crea **al tomar el corte**, no al confirmar, en estado
`DISPONIBLE` y con el importe y el desglose que se apartaron.

Ésa es la razón de ser del relevo: el operador entrante puede tomar el cambio,
abrir su turno y vender **mientras el saliente todavía cuenta**. Si el sobre
naciera al confirmar, el relevo esperaría de brazos cruzados justamente durante
los diez minutos que este flujo existe para aprovechar.

### El cambio es inmutable desde el corte

Después de cortar no se puede editar ni el total ni las denominaciones. La
confirmación toma el cambio de la fila congelada e **ignora** cualquier
`desgloseCambio` que venga en el pedido.

Cancelar el corte sólo se permite si el sobre sigue `DISPONIBLE`, sin reserva y
sin turno destino. Si el relevo ya lo reservó —lo está contando— o ya lo recibió
—abrió su turno con esa plata—, cancelar dejaría la misma plata contada en dos
turnos y se rechaza con 409. Al cancelar, el sobre pasa a `CANCELADO`: no se
borra, porque que un cambio se publicó y se retiró de circulación es parte de la
historia de la caja.

Un turno puede tener **varios** sobres a lo largo de su vida —uno por cada corte
cancelado, más el vigente— así que la unicidad es parcial:
`CambioPendiente_turnoOrigen_vigente_key` sobre `turnoOrigenId`
`WHERE estado <> 'CANCELADO'`.

**No se crea ningún CajaMovimiento por el cambio dejado.** Esa plata no salió: se
queda ahí. Ya está contemplada en el reparto `retiro + cambio = contado`, y
registrarla además como movimiento la descontaría por segunda vez.

### Selección manual

El operador entrante **elige de una lista** cuál sobre está recibiendo. No hay
herencia automática: la cadena anterior (`fondoOrigenTurnoId` y compañía) trataba
de adivinar qué cierre correspondía a qué cajón y por eso se desactivó. Esos
campos se conservan intactos por compatibilidad histórica y **no se escriben**.

### Reserva

Ver el detalle de un sobre **no lo reserva**. La reserva ocurre solo al pulsar
"Tomar este cambio", y es un UPDATE condicional —`WHERE estado = DISPONIBLE`—
que es atómico por sí mismo: si dos operadores lo tocan a la vez, uno afecta una
fila y el otro cero.

**La reserva es del usuario Y del operario.** En una computadora del mostrador
`erpazul_sesion` identifica al dispositivo y lo comparten todos; la persona es el
operario del PIN. Comparando solo el usuario, cualquiera podía consumir la
reserva de otro. Cuando el local no exige operario, la comparación cae al usuario
solo, que ahí es la identidad más fina que existe.

Una reserva viva por persona: se abre un turno con un cajón. La reserva vence a
los 20 minutos y vuelve a `DISPONIBLE`.

### Recepción

El operador cuenta lo que recibió y el sistema compara **por total y por
denominación**:

- **Coincide** — mismo importe y mismos billetes.
- **Coincide el total, cambia la composición** — diez de $1.000 y cinco de
  $2.000 suman lo mismo, pero con los de $2.000 no se puede dar vuelto de
  $1.000. No bloquea, pero exige confirmación explícita y queda registrado.
- **Faltante** o **sobrante** — exigen motivo antes de abrir.

**`Turno.montoInicial` es siempre el total realmente contado**, nunca el
declarado por el cierre anterior. Si el sistema impusiera lo esperado, una
diferencia de recepción quedaría escondida y reaparecería como faltante al
cerrar, culpando al cajero equivocado.

La diferencia de composición no necesita columna propia: los dos desgloses están
guardados en la fila, así que la comparación se deriva y no puede quedar
desincronizada.

---

## El circuito del dinero

`lib/caja/circuitoDinero.js` arma el circuito y verifica que cierre.

Tres cosas parecen iguales y no lo son:

- **Retiro de recaudación** — salió del cajón durante el turno. Es un
  CajaMovimiento y descuenta del esperado.
- **Retiro final** — salió al cerrar. También es un CajaMovimiento.
- **Cambio dejado** — **no salió**. Se quedó en el cajón.

**El cambio dejado no es gasto ni retiro. El cambio recibido no es ingreso
nuevo.** Es una transferencia de saldo entre turnos: en el total del local no
suma ni resta, cambia de dueño y no de lugar.

### Ejemplo

Turno A abre con $30.000, vende $100.000 en efectivo y hace un retiro parcial de
$70.000.

    30.000 + 100.000 − 70.000 = 60.000 esperado

Cuenta $60.000, deja $30.000 de cambio y retira los otros $30.000.

    60.000 contado − 30.000 cambio = 30.000 retiro final

Dinero que **salió del local**: 70.000 + 30.000 = **$100.000**.

Los $30.000 de cambio pasan al turno B como `montoInicial` y **no aumentan la
recaudación**. En el turno B no se registran como ingreso manual.

### Fuentes, una por concepto

| Concepto | Fuente |
|---|---|
| Ventas en efectivo | `Venta` / `VentaPago`, fórmula de `efectivoEsperado.js` |
| Ingresos y retiros manuales | `CajaMovimiento` sin vínculo a arqueo |
| Retiros de recaudación | `CajaMovimiento` vinculado por `ArqueoCaja.cajaMovimientoRetiroId` |
| Retiro final | `CajaMovimiento` de `Turno.retiroCierreMovimientoId` |
| Cambio dejado y recibido | `CambioPendiente` |
| Apertura real | `Turno.montoInicial` |
| Diferencia de recepción | `CambioPendiente.diferencia` |
| Corte congelado | `CierrePreparacion` |

**Un traspaso de cambio nunca se deduce por coincidencia de importes ni de
horarios.** El vínculo es por id: `turnoOrigenId` y `turnoDestinoId`, los dos
`@unique` en la base.

---

## Recuperación

Un corte ya congeló un turno: si nadie encuentra ese cierre, la caja queda
trabada sin que se sepa por qué.

- **Cierres pendientes** — `/modulos/pos-ventas/cierres`, accesible desde Cajas.
  Lista operador, turno, hora del corte, esperado congelado, estado y si está
  atrasado, con "Continuar cierre".
- **Cambios pendientes** — `/modulos/turnos/cambios-pendientes`, vista de
  consulta con la cadena completa: disponibles, reservados, recibidos,
  cancelados y vencidos.
- `turnos/actual` devuelve el token del cierre propio, para volver sin guardar
  la URL.

El token viaja solo en esas dos superficies. Los listados generales de cajas no
lo exponen.

### Borradores

El conteo se guarda en el navegador y no crea nada en la base.

- **Cierre** — clave por **token**, porque lo puede terminar alguien que no lo
  empezó. Vence a las 48 h.
- **Apertura** — clave por **cambio + usuario + operario**, porque la reserva es
  de una persona concreta: si vence y otro toma el sobre, el conteo del primero
  no puede aparecerle. Vence a las 2 h.

---

## Legado

`ModalCierreTurno.jsx`, `ModalAperturaTurno.jsx`, `/api/pos-ventas/turnos/cerrar`
y `/api/pos-ventas/turnos/abrir` siguen en el repositorio y **no son el flujo
habitual**. No se eliminaron todavía por riesgo de consumidores no detectados
(cola offline, integraciones).

Garantías vigentes:

- `turnos/cerrar` **rechaza con 409 cualquier turno con corte tomado**. Recalcula
  el esperado, que es justo lo que el corte congeló.
- `turnos/abrir` **no puede consumir un CambioPendiente**: ni lo lee ni lo marca.
- El POS no abre ninguno de los dos modales.
