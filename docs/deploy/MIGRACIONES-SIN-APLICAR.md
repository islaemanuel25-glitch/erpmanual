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

**Ninguna.** Producción está al día: 101 migraciones en el árbol y 101 aplicadas,
comprobado con `prisma migrate status` el 2026-08-22 después de desplegar
`af506512b0639601039dc812fd80fb584c9c20ae` — el merge del PR #5, que completa
Productos móvil y fue **solo de código**.

Sin migraciones, comprobado antes de tocar nada de las tres formas de siempre:
`git diff --name-only 8b0bab0a..af506512 -- prisma/` no devolvió nada, el
clasificador informó "Archivos a mirar: 0" con el rango tomado de la imagen que
atendía, y este archivo ya decía que no había pendientes. El contenedor
descartable contó **101**, el mismo número que el árbol.

El corte fue de **2 segundos**. Cero reinicios, logs sin errores, `/login` en
200 y el árbol del VPS limpio.

### Y ACÁ EL MARCADOR COSTÓ TRES INTENTOS, QUE ES LO QUE HAY QUE RECORDAR

Comprobar que el cambio VIAJÓ es otra pregunta que los cinco valores, y esta vez
la búsqueda se equivocó dos veces antes de medir algo:

1. **El marcador elegido a ojo no servía.** `w-[44px]` —el lado de la miniatura—
   ya existía en el commit desplegado, dentro de `min-w-[44px]` y de
   `sm:!w-[44px]`. Buscado suelto habría dado positivo en la imagen vieja.
   Anclado como regla de la hoja, `.w-\[44px\]{`, sí distingue: ninguna de esas
   dos genera ese selector.
2. **La primera corrida dio cero en las DOS imágenes, control incluido.** Eso no
   es "no está": es que la búsqueda no funcionó. El patrón iba sin las barras de
   escape que Tailwind pone en el selector —lo que hay en el archivo es
   `.w-\[44px\]{`— así que no matcheaba nada en ningún lado.

Con el patrón correcto la comparación quedó en los dos sentidos, que es lo único
que la hace valer: en la imagen **vieja** el marcador da 0 y el control
—`.w-\[202px\]{`, que existía desde antes— da 1; en la **nueva** los dos dan 1.

Y las dos pantallas se ejercieron contra producción sin sesión, que es hasta
donde se llega desde acá: `/modulos/productos`, `/modulos/pos-ventas` y
`/modulos/productos/nuevo` contestan 200, sus tres rutas de datos contestan 401
—o sea que viven y piden sesión— y los logs del contenedor no tienen un solo
error después de pedirlas. **Lo que NO se hizo es abrirlas con una sesión real
de producción**: no hay credenciales en esta máquina. La verificación visual a
390 px de este mismo contenido se hizo contra desarrollo, antes del corte.

---

Antes de ése, producción estaba al día: 101 migraciones en el árbol y 101 aplicadas,
comprobado con `prisma migrate status` el 2026-08-22 después de desplegar
`8b0bab0a8fb96b461e7aaf3b0a9f489cb1e83753` — la restauración de la interfaz de
Productos móvil, que fue **solo de código**.

Ese despliegue tampoco trajo migraciones, comprobado igual que el anterior:
`git diff --name-only daedcbfd..origin/main -- prisma/` no devolvió nada, el
clasificador informó "Archivos a mirar: 0" con el rango tomado de la imagen que
atendía, y este archivo ya decía que no había pendientes. El contenedor
descartable informó **101 migrations found**, el mismo número que el árbol.

El corte fue de **2 segundos**, con el reloj arrancando inmediatamente después
del `up -d`. Cero reinicios y los logs sin errores.

Y se comprobó que el cambio VIAJÓ, no solo que los cinco valores coinciden —que
son preguntas distintas—: la clase `min-h-[51.5px]` no existía en el commit
desplegado y aparece en la hoja de la imagen nueva, con `min-h-[44px]` de
control positivo en el mismo archivo para probar que la búsqueda encuentra lo
que está. Se eligió una CADENA de CSS y no un identificador, que el build
minifica y por lo tanto no afirma nada.

---

Antes de ésa, producción estaba al día: 101 migraciones en el árbol y 101 aplicadas,
comprobado con `prisma migrate status` el 2026-08-22 después de desplegar
`daedcbfddea4da28e41fd589defc90cc7e54ecbd` — la tanda de Productos móvil, que
fue **solo de código**.

Ese despliegue no trajo ninguna migración y eso se comprobó de tres formas antes
de tocar nada: `git diff --name-only 45e6dae6..HEAD -- prisma/` no devolvió nada,
el clasificador informó "Archivos a mirar: 0" con el rango sano —tomado de la
imagen que atendía, no del HEAD del VPS—, y este archivo ya decía que no había
pendientes.

Y aun así el conteo se comparó, porque el código de salida no prueba nada: el
árbol tiene 101 y el contenedor descartable informó **101 migrations found**. Ese
número es lo que distingue "estaba todo aplicado" de "la imagen no conoce la
migración", que salen iguales en la salida.

---

Antes de ésa, producción estaba al día: 101 migraciones en el árbol y 101 aplicadas,
comprobado con `prisma migrate status` el 2026-08-21 después de desplegar
`45e6dae6a34055ca2c746102c5bd7c585a174277`.

La última fue `20260821030000_producto_local_precio_revisado` —la columna
`ProductoLocal.precioRevisadoAt` y su índice— y **se aplicó de verdad**: el
contenedor descartable informó "101 migrations found", el mismo número que el
árbol, y dijo `Applying migration`. Eso es lo que distingue "se aplicó" de "la
imagen no la conocía", que salen iguales en el código de salida.

Y las dos cosas que crea se verificaron **una por una contra
`information_schema`**, no por el código de salida: la columna existe como
`timestamp(3)` que acepta nulos, y el índice existe como
`ProductoLocal_precioRevisadoAt_idx`, btree sobre esa columna.

**NO SE HIZO BACKFILL, Y ESO SE VE EN LOS NÚMEROS.** Medido contra producción
justo después: `precioRevisadoAt` está en `null` en las 2.610 filas del depósito,
así que el control "Precios +30 días" arranca marcando casi todo el catálogo
—2.068 de 2.070 en "mini el 7", 2.361 de 2.363 en "Casiano casas"—. Los dos que
no marca en cada ubicación son los servicios de importe variable, que quedan
afuera de los cuatro controles a propósito.

Es el comportamiento esperado y **no se corrige marcando productos como
revisados**: `null` significa "sin evidencia de revisión" y rellenarlo
inventaría revisiones que nadie hizo. El número baja solo, a medida que alguien
revise precios de verdad.

---

Antes de ésta, producción estaba al día: 100 migraciones en el árbol y 100 aplicadas,
comprobado con `prisma migrate status` el 2026-08-20 después de desplegar
`1a6db117f2cc071619cdf105f927257f36bb2c93`.

La última fue `20260820060000_transferencia_cancelada_auditable` —las tres
columnas de cancelación de `Transferencia`— y **se aplicó de verdad**: la salida
dijo "Applying migration", el contenedor descartable contó 100 igual que el
árbol, y las tres columnas se verificaron una por una contra
`information_schema` después de migrar.

La comprobación que quedaba anotada se corrió **entre migrar y recrear**, que es
la única ventana en la que se puede: el `select` de la ruta de cancelar con los
campos nuevos, el `select` del detalle, y el `update` de cancelación dentro de una
transacción revertida a propósito. Después se releyó la fila para confirmar que
no quedó nada escrito de la prueba.

La #97, que ya estaba cancelada, conserva los tres campos en null. No se
backfilleó: un null ahí significa "se canceló antes de que esto se registrara",
que es la verdad, y la pantalla lo dice con esas palabras.

---

Antes de ésta, producción estaba al día: 99 migraciones en el árbol y 99 aplicadas,
comprobado con `prisma migrate status` el 2026-08-20 después de desplegar
`e7c03c70f34e2c9518d9cc1eeb735d6009b8f4fb`.

La última fue `20260820020000_venta_anulada` —las tres columnas de anulación de
`Venta` más su índice—, y **se aplicó de verdad**: `migrate deploy` imprimió
"Applying migration" y el contenedor descartable contó 99, el mismo número que el
árbol. Eso es lo que distingue "se aplicó" de "la imagen no la conocía", que
salen iguales en el código de salida.

El paso que quedaba anotado —ejercer contra Postgres el `select` de la ruta de
anular con los campos nuevos— se corrió **entre migrar y recrear**, que es la
única ventana en la que se puede: el select completo, el filtro comercial con la
columna nueva y el `update` de anulación dentro de una transacción revertida a
propósito. Los tres con los argumentos validados y sin escribir nada.

Los despliegues del 2026-08-19 y el de la madrugada del 20 —`b6cc9db`,
`289a036`, `9f425b0`, `94428ca` y `73e80d7`— fueron de solo código: el
clasificador informó cero archivos en todos los rangos y el contenedor
descartable contó las mismas 98 que el árbol, que es lo que distingue "no había
nada que aplicar" de "la imagen no conoce la migración".
