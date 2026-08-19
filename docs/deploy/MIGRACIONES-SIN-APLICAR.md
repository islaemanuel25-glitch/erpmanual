# Migraciones que están en `main` y NO en producción

**Este archivo se lee en el paso 0 de `/deploy`, antes del backup.** Existe para
que el próximo despliegue sepa que trae migraciones **antes de arrancar**, y no
lo descubra a mitad de camino cuando el clasificador le informe un rango que ya
no es de cero.

Es una lista viva, no un histórico: **cuando una migración se aplica en
producción, se borra de acá** en el mismo commit que confirma el despliegue. Un
archivo que acumula filas viejas deja de decir qué falta y pasa a ser otra cosa
que hay que interpretar.

Si la lista está vacía, el despliegue es solo de código.

---

## Pendientes

**Ninguna.** Producción está al día: 98 migraciones en el árbol y 98 aplicadas,
comprobado con `prisma migrate status` el 2026-08-19.

---

## Con qué viaja el corte pendiente, al 2026-08-19

Producción está en `9979d00d0a90db0b125b483d71adcff506a87497`. Lo que entra son
cinco commits, de `ae1f686` a `f6d006f`, y **NO trae migraciones**: el
clasificador informó "Archivos a mirar: 0" con la base tomada de la imagen que
atiende.

**Cuidado con una lectura fácil: `prisma/schema.prisma` SÍ cambió, y aun así no
hay migración.** El cambio es un comentario sobre la columna
`ConfiguracionLocal.tarjetaPrecioUnitario`, que explica por qué quedó sin uso.
Comprobado con `prisma migrate diff` contra la base: la columna no aparece en el
diff. (El diff sí muestra una deriva de dos índices en `ImportacionListaFila`,
**preexistente y ajena a esta tanda** — está desde antes y no se tocó.)

### Lo que se va a ver, que esta vez es mucho

1. **La tarjeta del catálogo corrige el precio y su rótulo** (`ad10fcf`). Mostraba
   la escala en la que está GUARDADO el precio —cómo se compra— en vez de la
   escala en la que se vende. Eran **5.450 de 10.521 filas activas, el 51,8 %**.

   Concretamente: en los cuatro locales, todos los productos de pack pasan de
   "$31.900,00 por bulto" a "$1.400,00 por unidad", que es lo que cobra el
   mostrador. En el depósito cambian los que tienen `modo_envio = SOLO_UNIDAD`.

   **Y corrige números, no solo etiquetas: 2.021 filas del depósito estaban
   mostrando un precio distinto del que cobra el POS.**

   Las únicas que NO se arreglan son **35 filas** de fiambre de pieza fija en el
   depósito, que se siguen mostrando por kilo. Está explicado en
   `lib/precios/escalaDeVenta.js`.

2. **Desaparece un interruptor de la pantalla de apariencia** (`f6d006f`):
   "Mostrar siempre el precio por unidad". Quedó sin efecto con el cambio
   anterior. El otro —ocultar la equivalencia— se queda y sigue funcionando. Si
   algún local lo tenía prendido, no va a notar nada: está medido que prenderlo
   ya no cambiaba la tarjeta.

3. **Nada visible** en los otros tres: sacar ramas muertas de código, el plan de
   las tandas del precio y la lista de migraciones.

### Estado de los chequeos previos, todos corridos el 2026-08-19

- `origin/main` y el HEAD local coinciden, cero commits sin empujar.
- Suite 3.525 en verde contra el commit, con un `todo` conocido.
- `npm run build` limpio.
- Trinquete de hardcodeo sin cambios.
- Las 15 huellas a 1366 idénticas a la línea de base.
- Sonda de cascada VERDE.
- Sonda de la tarjeta de producto VERDE, con contraprueba.
- Clasificador de migraciones: 0 archivos en el rango.

**Lo que falta es lo que solo se hace desplegando**: el backup validado del paso
1, la referencia de rollback del paso 2, y esperar a que Actions publique la
imagen. Nada de eso se adelantó.
