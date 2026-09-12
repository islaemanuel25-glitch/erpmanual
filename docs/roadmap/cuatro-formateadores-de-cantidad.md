# Cuatro copias del mismo formateador de cantidad

**Anotado el 2026-09-12, durante la tanda del peso con tres decimales. NO está
hecho, y es a propósito: Emanuel pidió que la unificación no se coma el cambio.**

## Las cuatro

El mismo formateador —número con coma decimal, hasta tres decimales— está escrito
cuatro veces, con distinta letra y en distinto archivo:

1. `lib/transferencias/presentacionEnvio.js` → `fmt`, privada. Es la que pinta el
   rótulo del envío, así que es la que la tanda del peso tocó. Ahora acepta un
   mínimo de decimales y tiene al lado la decisión —`decimalesDeCantidad`— de que
   en KG van tres.
2. `lib/transferencias/recepcionUI.js` → `fmtCant`, privada. **Convertida**: la
   única que la tanda tuvo que tocar además de la primera, porque
   `correccionDeCantidad` dibuja los dos lados de una flecha y el izquierdo salía
   con otra precisión que el derecho —"3,25 → 3,100 KG"—. Hoy delega en
   `fmtCantidadDeEnvio`.
3. `components/transferencias/detallePresentacion.jsx` → `fmtCantidad`,
   **exportada**. La usan la ficha de escritorio y la tabla del detalle.
4. `components/transferencias/TarjetaRecepcionMovil.jsx` → `fmtCant`, privada.

## Por qué no se unificaron las cuatro en esta tanda

Porque la 3 la consume **escritorio**, y cambiarle el formateador mueve la tabla
del detalle y la ficha grande — dos superficies que esta tanda no toca y cuya
huella se exige en cero. Eso es una tanda propia, con su huella antes y después,
no un arrastre.

Y porque la regla nueva no es "tres decimales siempre": es "tres decimales en
KG". Un formateador que recibe un número pelado no puede decidirlo —ponerle tres
fijos convertiría "6 PACK x24" en "6,000 PACK x24"—, así que la unificación no es
mover una función: es que los cuatro consumidores le pasen la presentación. Eso
toca cuatro archivos y dos pantallas.

## Qué falta, concretamente

- Que la 4 —la de la tarjeta móvil— delegue en `fmtCantidadDeEnvio`. Es la más
  barata: la tarjeta ya tiene el descriptor a mano. **Hoy no da un resultado
  distinto**, porque la tarjeta usa `fmtCant` solo para el lado izquierdo de la
  flecha, que ya pasa por `correccionDeCantidad`. Si algún día la usa para un
  peso, ahí aparece la diferencia.
- Que la 3 —la exportada— delegue también, con la huella de escritorio a 1366
  antes y después. Es la que tiene consumidores fuera de recepción.
- Y recién con las cuatro convergidas, borrar `fmt` como privada y dejar
  `fmtCantidadDeEnvio` como la única.

## Cómo se sabrá que está mal si alguien lo hace a medias

El síntoma es un renglón con dos precisiones en la misma frase, que es
exactamente el que la tanda del peso encontró: `3,25 → 3,100 KG`. Si aparece uno
así, hay un consumidor que quedó con su copia.
