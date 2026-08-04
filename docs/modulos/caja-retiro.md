# Retiro de recaudación con corte congelado

Sacar la recaudación del cajón dejando un cambio para seguir vendiendo, sin
cerrar la caja y sin parar de cobrar.

---

## El problema que resuelve

Hasta agosto de 2026 el retiro **no tenía corte**. El efectivo esperado se
recalculaba en cada lectura y otra vez, definitivamente, dentro de la transacción
que confirmaba.

Contar un cajón lleva veinte minutos y el POS sigue vendiendo. Al confirmar se
comparaba un conteo de las 19:00 contra un esperado de las 19:20, así que el
cajero aparecía con un **faltante por plata que entró después de que cerrara la
pila**. Y si "cuadraba" recontando el cajón entero, se llevaba ventas posteriores
a su propio corte.

El ejemplo con el que se reprodujo: esperado $150.000, se cuenta y se separan
$30.000 de cambio, entran $20.000 en ventas mientras se cuenta. El retiro debía
ser $120.000 con diferencia cero, y el sistema imputaba un faltante de $23.000.

---

## El orden correcto

1. se aparta físicamente el cambio que queda en la caja;
2. se cuenta ese cambio por denominaciones;
3. se toma el corte;
4. **la caja sigue vendiendo** con ese cambio;
5. se cuenta únicamente el dinero retirado;
6. se compara contra el retiro esperado congelado.

## En qué se diferencia del cierre

Comparten la mecánica del congelamiento: esperado, frontera por id, acceso por
token, confirmación transaccional. No comparten la semántica, y por eso son dos
tablas y dos módulos:

| | Cierre | Retiro |
|---|---|---|
| Congela el turno | Sí | **No** |
| Libera el POS | Sí | No hace falta: nunca lo tomó |
| Publica un sobre de cambio | Sí | **No**: la plata se queda en el mismo turno |
| Cuántos por turno | Uno | Varios a lo largo del día |
| Estados | 4 (incluye `VENCIDO`) | 3 |

`RetiroPreparacion` no tiene `VENCIDO` porque un retiro abandonado no traba nada:
la caja sigue operando con el cambio separado. El cierre sí lo tiene, porque su
corte congela el turno y alguien tiene que ir a destrabarlo.

---

## El modelo

`RetiroPreparacion` guarda, al cortar:

- `efectivoEsperadoCorte` — el número que no se recalcula.
- `desgloseCambio` y `totalCambio` — el cambio apartado, inmutable desde acá.
- `efectivoRetiradoEsperado` = `efectivoEsperadoCorte − totalCambio`.
- `ultimaVentaId` y `ultimoMovimientoId` — frontera **por id, no por fecha**.
- `token` — llave aleatoria de 32 bytes.
- `idempotencyKey` — derivada del id de la preparación, `retiro-prep-<id>`.

Y al confirmar:

- `desgloseRetiroContado` y `totalRetiroContado` — la única pila que se cuenta.
- `totalCajonDerivado` = `totalRetiroContado + totalCambio`.
- `diferencia` = `totalRetiroContado − efectivoRetiradoEsperado`.

### La clave de idempotencia no sale del turno

El cierre puede derivarla del `turnoId` porque un turno se cierra una sola vez.
Una caja, en cambio, hace varios retiros en la misma jornada: si la clave fuera
`retiro-<turnoId>`, el segundo retiro del día chocaría contra la
`@@unique([turnoId, idempotencyKey])` de `ArqueoCaja` y sería imposible.

### Un retiro en preparación por turno

`RetiroPreparacion_turno_vigente_key` es un índice **parcial** sobre `turnoId`
`WHERE estado = 'PREPARANDO'`. No "un retiro por turno" —todos los del día
conviven— sino "uno a medio contar". Dos cortes simultáneos congelarían el mismo
esperado y cada uno se llevaría la misma recaudación.

Prisma no expresa `WHERE` en `@@unique`: el índice vive sólo en la migración
`20260805120000_retiro_preparacion`.

---

## Exclusión mutua con el cierre

Un turno **no puede** tener a la vez un cierre y un retiro en preparación: los dos
congelan el mismo esperado, y el segundo en confirmar restaría un retiro que el
primero no vio. Los dos se atribuirían la misma plata.

- `cierres/iniciar` consulta `RetiroPreparacion` en estado `PREPARANDO`
  **dentro del lock** y rechaza con 409, devolviendo el token del retiro para
  poder terminarlo.
- `retiros/iniciar` usa `contextoArqueo`, que ya rechaza con 409 un turno con
  `cierreEnPreparacionEn`, y revalida `WHERE_TURNO_OPERATIVO` dentro de la
  transacción.

Un retiro en preparación **permite** vender y mover plata; lo único que bloquea
es otro retiro y el inicio de un cierre.

---

## La actividad posterior se informa, no se aplica

La pantalla de conteo muestra un aviso cuando entraron ventas o movimientos
después del corte:

> Hubo operaciones después del corte. No forman parte de este retiro.

Es informativo y nada más: **ningún importe cambia**. La versión anterior hacía
lo contrario —detectaba el movimiento con `compararHuellas` y adoptaba un
esperado nuevo, pidiendo reconfirmar—, y eso era exactamente lo que producía el
faltante falso.

La detección es por id, comparando la frontera congelada contra los últimos ids
del turno.

---

## Compatibilidad

`ArqueoCaja.efectivoContado` sigue siendo **todo el efectivo del cajón**: se
escribe con `totalCajonDerivado`. El `CajaMovimiento` de tipo `RETIRO`, en
cambio, descuenta **sólo lo retirado**.

El cambio **no genera movimiento de caja**: esa plata no salió del cajón. Ya está
contemplada en el corte —el retiro esperado la descuenta— y registrarla además
como movimiento la restaría dos veces.

El esperado corriente posterior sigue usando la fórmula acumulativa de siempre:
todo el turno menos los retiros confirmados. Con el ejemplo, la caja queda con
$50.000: los $30.000 de cambio más los $20.000 vendidos después.

### El endpoint viejo

`POST /api/pos-ventas/retiros/registrar` quedó **fuera de servicio** y responde
409 con `flujoObsoleto: true`. Se conserva la ruta en vez de borrarla porque una
pestaña abierta con la pantalla vieja puede seguir viva después del despliegue, y
su POST tiene que fallar con un mensaje entendible en lugar de un 404 mudo.

Los retiros ya registrados por esa vía **no se tocan**: siguen siendo `ArqueoCaja`
`PARCIAL` sin preparación asociada y se leen exactamente igual que siempre.

### Borradores

El borrador del conteo pasó a la **v4**: clave por token y un solo desglose, el
del retiro. Las versiones anteriores **no se migran**: traducir un conteo del
cajón entero a un conteo del retiro exigiría restarle el cambio, y eso afirmaría
una separación de billetes que la persona nunca hizo con las manos. Se descartan
avisando.

---

## Endpoints

- `POST /api/pos-ventas/retiros/iniciar` — separa el cambio y toma el corte.
- `GET  /api/pos-ventas/retiros/[token]` — lee el corte congelado.
- `POST /api/pos-ventas/retiros/[token]/confirmar` — cuenta sólo lo retirado.
- `POST /api/pos-ventas/retiros/[token]/cancelar` — deshace, sin mover plata.

## Pantallas

- `/modulos/pos-ventas/retiros/nuevo` — preparar: separar y contar el cambio.
- `/modulos/pos-ventas/retiros/[token]` — contar el dinero retirado.

## Pruebas

- `lib/caja/ordenCambioPrevio.test.mjs` — aritmética, componentes y garantías.
- `scripts/integracion-cambio-previo.mjs` — integración real contra PostgreSQL,
  incluido el ejemplo de $150.000 punta a punta.
