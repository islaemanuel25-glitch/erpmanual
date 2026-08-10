# DEC-0004 — TERMINADA se puede revertir; CANCELADA no

**Estado:** Vigente

## Contexto

Una importación de lista de proveedor que ya no se iba a trabajar más tenía dos
salidas y ninguna servía:

- **CANCELADA** la saca del flujo pero **no se puede revertir**. Está bien para
  una lista que nunca escribió un costo; es una trampa para una que escribió 279.
- **Quedarse abierta para siempre**, ocupando el archivo y contando pendientes que
  nadie va a resolver.

## Decisión

Un estado nuevo, **TERMINADA**, con su fecha y su autor, misma convención que
cancelada. Es el cierre de una lista que **sí trabajó**: no acepta confirmar ni
aplicar, pero **sí acepta revertir**.

Esa es toda la diferencia con CANCELADA, y es la razón de que exista. Por eso vive
en **dos listas y no en una con un caso especial adentro**: `ESTADOS_ABIERTOS`
decide quién acepta trabajo y `ESTADOS_REVERTIBLES` quién acepta deshacer.

Además: deshacer una TERMINADA **la reabre** (vuelve a `PARCIALMENTE_APLICADA`),
porque si no las filas quedarían sin aplicar y sin forma de aplicarlas nunca.

## Motivo

Aplicar era una puerta de una sola dirección: no había forma de volver. El día que
se apliquen 279 costos de una y uno salga mal, eso es el problema.

Y cerrar una lista que escribió costos sin poder deshacerla es peor que dejarla
abierta.

## Consecuencias

- Se reusó el endpoint `finalizar`, que ya existía, hacía exactamente esto y
  **nadie llamaba desde la pantalla**. No se escribió uno nuevo al lado.
- Candado que falla si alguien unifica las dos listas de estados "porque son casi
  iguales".
- Verificado ejecutando el caso que podía morder: revertir una TERMINADA sobre la
  que ya escribió una lista posterior **omite** los productos pisados con motivo
  `COSTO_CAMBIADO`, en vez de pisar los precios nuevos. La previa pasó de 279 a
  277. No hizo falta agregar ninguna guarda: la regla de comparar contra lo último
  escrito ya lo resuelve.
- El candado del inventario de estados salió rojo, que es su trabajo, y se
  actualizó deliberadamente.

## Evidencia

- Commit `68cc4d1` *feat(listas): TERMINADA cierra el trabajo sin cerrar la vuelta
  atrás*.
- Migración `prisma/migrations/20260809200000_importacion_terminada/`.
- `lib/proveedores/listas/persistencia.js` — `ESTADOS_ABIERTOS` (79),
  `ESTADOS_REVERTIBLES` (99), `esImportacionRevertible` (101).
- El planificador puro de la reversión: `lib/proveedores/listas/reversion.js`,
  commit `0bb37c0`.
