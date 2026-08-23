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
comprobado con `prisma migrate status` el 2026-08-23 después de desplegar
`45e0b8c5da101689733ef18b40812ec9762594fd` — la corrección de la caché compartida
de las fotos de producto. **Solo código.**

Corte de **4 segundos**. Cinco valores coincidentes, cero reinicios, logs sin
errores, `/login` en 200 y el árbol del VPS limpio.

Sin migraciones, comprobado de tres formas antes de tocar nada:
`git diff --name-only ecba0408..45e0b8c5 -- prisma/` no devolvió nada, el
clasificador informó "Archivos a mirar: 0" con el rango tomado de la imagen que
atendía, y este archivo ya decía que no había pendientes. El contenedor
descartable contó **101**, el mismo número que el árbol — que es lo que distingue
"no había nada que aplicar" de "la imagen no conoce la migración".

### LA FOTO DE UN PRODUCTO YA NO SE PUEDE GUARDAR EN UNA CACHÉ COMPARTIDA

El incidente que esta tanda cierra: `/api/productos/foto/[archivo]` comprobaba
`productos.ver` y respondía `Cache-Control: public`. Cloudflare guardó la
respuesta y la servía desde el borde a peticiones **sin sesión**, que ya no
llegaban al servidor. Medido el 2026-08-23 antes de arreglarlo: 200 sin
credenciales, `cf-cache-status: HIT`, `Age: 11572`.

El permiso nunca falló. Lo que pasó es que dejó de correr, porque el tráfico
dejó de llegarle. La ruta ahora responde `private, max-age=31536000, immutable`
—el navegador la sigue guardando, una caché compartida no puede— más
`Cloudflare-CDN-Cache-Control: no-store`, que es la única cabecera que sobrevive
a una Cache Rule del panel que ignore lo que manda el origen.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

Con las cadenas exactas de las cabeceras, que son literales y no identificadores
—un identificador no sirve de marcador porque el build lo minifica—.

En la imagen que atiende: `Cloudflare-CDN-Cache-Control` aparece,
`private, max-age=31536000, immutable` aparece, y `public, max-age=31536000`
**no**. En la imagen vieja, corrida en un contenedor descartable, exactamente al
revés. El control `max-age=31536000, immutable` aparece en las dos, que es lo que
prueba que la búsqueda funciona.

### LA PURGA ERA UN PASO APARTE, Y CON ORDEN

Cambiar la cabecera no desaloja lo que Cloudflare ya tenía, y el `max-age` que se
había mandado era de un año. La purga va **después** de desplegar: al revés no
sirve, porque el origen todavía contesta `public` y la primera petición
autenticada lo vuelve a guardar con el reloj en cero.

Se comprobó ese estado intermedio en vez de suponerlo: recién desplegado, la url
exacta seguía dando 200 con `Age: 49969` y `cf-cache-status: HIT`, mientras la
misma foto con un parámetro agregado —que Cloudflare no podía tener guardada— ya
daba 401. O sea que el código nuevo servía y lo único que quedaba era la entrada
vieja.

**Emanuel purgó esa url a mano desde el panel.** No se purgó desde la máquina de
despliegue: no hay credenciales de Cloudflare ahí y no se inventan. El
procedimiento completo —los tres caminos, cómo sacar la lista de urls del volumen
y cómo verificar— está en
[`docs/RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md`](../RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md).

### INCIDENTE CERRADO, CON LA MEDICIÓN DE CIERRE

Pedida **tres veces sin sesión ni cookies**,
`https://operix.cloud/api/productos/foto/p181-bed80329.webp` devolvió las tres:

- HTTP **401**;
- `cf-cache-status: BYPASS` — nunca `HIT`;
- **sin `Age`** — antes venía con 49969;
- cuerpo `{"ok":false,"error":"No autenticado"}`, 37 bytes de json. Los primeros
  bytes son `{ " o k "` y no `RIFF`: no es una imagen. Antes eran 64.814 bytes de
  WebP;
- y no volvió a convertirse en `HIT` ni en 200 en ninguna de las repeticiones.

Desapareció también el `Cache-Control: public` que traía la respuesta cacheada.

**Lo que NO se observó, y hay que decirlo:** las dos cabeceras nuevas sobre una
respuesta **200** en producción. Solo salen en el camino bueno, que exige sesión,
y no hay credenciales productivas en la máquina desde la que se desplegó. Lo que
sí hay es que las cadenas exactas están adentro de la imagen desplegada, y que el
mismo código medido en el cable en desarrollo devolvió
`cache-control: private, max-age=31536000, immutable` y
`cloudflare-cdn-cache-control: no-store`, con el sha256 de lo que bajó idéntico al
del archivo en disco. Falta un vistazo con sesión real, de diez segundos.

### LOS CANDADOS QUE QUEDARON

Uno específico de la ruta y uno general: **ninguna ruta que comprueba permiso
puede declararse cacheable por una caché compartida**, aplicado al censo de las
147 rutas con GET. Los candados de ese censo preguntaban si la ruta comprueba;
éste pregunta si esa comprobación llega a correr, que es lo que ninguno miraba.

---

Antes de ése, producción estaba al día: 101 migraciones en el árbol y 101
aplicadas, comprobado con `prisma migrate status` el 2026-08-23 después de
desplegar `ecba0408b7335d77ddafa5448bb0b4acead5e65d` — la tanda de quitar el fondo
de la foto de producto. **Solo código.**

Corte de **4 segundos**. Cinco valores coincidentes, cero reinicios, logs sin
errores, `/login` en 200 y el árbol del VPS limpio. El contenedor descartable
contó 101, igual que el árbol.

El cambio viajó, comprobado con el texto de interfaz "Quitando el fondo" —cero
apariciones en el commit que estaba desplegado, dos chunks en la imagen nueva—,
con "Cargar foto" de control dando positivo en las dos.

**Lo que no se pudo hacer:** la carga de una foto de punta a punta en producción,
que necesita una sesión real. Es el mismo pendiente que arrastran los despliegues
anteriores de este módulo. El flujo completo —con la lectura de los bytes del
archivo producido, para confirmar que el recorte no sale en JPEG— está verde
contra desarrollo.

---

Antes de ése, producción estaba al día: 101 migraciones en el árbol y 101 aplicadas,
comprobado con `prisma migrate status` el 2026-08-23 después de desplegar
`9b37d0b4110fe05f61597192a7aba4f12c6f174a` — el merge del PR #7, que corrige la
edición de combos en el celular. **Solo código.**

Corte de **2 segundos**. Cinco valores coincidentes, cero reinicios, logs sin
errores, `/login` en 200 y el árbol del VPS limpio.

### EL FIX SE VERIFICÓ LEYENDO EL CÓDIGO DESPLEGADO, NO CONTANDO

Contar apariciones no alcanzó y conviene que quede escrito por qué: el primer
intento comparó cuántas veces aparecía `.productoLocalId` en los chunks —13
contra 12— y con esa diferencia de uno no se puede atribuir nada, porque el
mismo nombre lo usan otras pantallas. Acotarlo por una cadena de la pantalla
tampoco sirvió a la primera: el chunk que contenía el texto del buscador daba
cero en TODOS los controles, o sea que la búsqueda no estaba mirando el archivo
que se creía.

Lo que sí sirvió fue identificar el chunk que CAMBIÓ —los nombres son hash del
contenido, así que se comparan las dos listas— y después leer el código
minificado alrededor de la ruta del combo. Ahí el fix se lee entero:

En la imagen VIEJA:

    onEditar:()=>at(e.id??e.productoLocalId)

En la que está desplegada AHORA:

    onEditar:()=>{e?.esCombo===!0?t4(e.localProductoId):at(e.id)}

donde `t4` es `abrirEditarCombo`, que hace
`` g.push(`/modulos/productos/editar-combo/${e}`) ``, y `at` es `abrirEditar`.
Las tres cosas que había que comprobar están a la vista: el producto normal va al
editor normal con `e.id`, el combo va a editar-combo con `e.localProductoId`, y
la rama del combo NO tiene ningún camino hacia el id del producto base. El
contador de `esCombo===!0?` da 0 en la vieja y 1 en la nueva.

### Y APARECIÓ UNA FOTO REAL EN EL VOLUMEN

`p181-bed80329.webp`. O sea que alguien ya cargó una foto de producto desde la
aplicación, con el camino completo —cámara, achicado, subida, escritura en el
volumen—. Eso cierra el pendiente que había quedado del despliegue anterior: era
lo único de la tanda de fotos que no se había ejercido contra producción.

### Lo que NO se pudo hacer

**No se abrió Productos móvil en producción con una sesión real.** No hay
credenciales productivas en esta máquina. La prueba del flujo completo —crear un
combo, tocar Editar, ver el FormCombo precargado y guardar— se corrió contra
desarrollo antes del corte, con once afirmaciones en verde y captura a 390 px.

Sin migraciones, comprobado antes de tocar nada de las tres formas de siempre.
El contenedor descartable contó **101**, el mismo número que el árbol.

El corte fue de **2 segundos**. Cero reinicios y los logs sin errores.

### ESTA TANDA TRAJO INFRAESTRUCTURA, Y ESO NO SE VE EN EL RANGO

Es la primera que necesita un paso en el VPS **antes** de levantar la app: crear
el volumen `erpazul_fotos_productos`. Un despliegue de solo código no lo habría
necesitado, y el clasificador de migraciones no mira volúmenes — así que si
alguien lo hubiera saltado, la aplicación habría levantado bien y se habría
negado a guardar fotos, con el motivo escrito pero sin que nadie lo esperara.

Lo que se hizo, en orden y antes de recrear nada:

1. `docker volume create erpazul_fotos_productos`.
2. El centinela `.volumen-fotos-productos` adentro.
3. **Y LOS PERMISOS, QUE NO ESTABAN EN EL RUNBOOK.** El volumen recién creado
   queda `755 root:root`, y el contenedor corre como `node` (1000:1000): la
   aplicación no habría podido escribir. Se igualó al de comprobantes —`775
   1000:1000`— y se comprobó ESCRIBIENDO con ese usuario, no mirando el modo.

### LA PERSISTENCIA SE COMPROBÓ RECREANDO, NO LEYENDO

Se escribió un archivo en el volumen, se recreó el contenedor con
`--force-recreate` y se volvió a leer: **sobrevivió, con su contenido intacto**.
Es la única prueba que distingue un volumen montado del disco del contenedor, y
sin ella "el directorio existe" no dice nada.

### EL BACKUP DE FOTOS CORRIÓ DE VERDAD, Y FALTABA INSTALARLO

El timer no corre el script del repo sino una copia en `~/bin`, y esa copia era
la versión vieja. El script nuevo **carga dos archivos** —`comunes.sh` y
`respaldar-fotos.sh`— así que copiar solo el principal lo habría roto al
arrancar. Se instalaron los tres, con la copia anterior guardada como
`vps-backup-erpazul.sh.pre887d247a`.

Corrido a mano, el backup completo salió con 0 y empaquetó las fotos. Después se
restauró en un volumen **descartable** y se verificó: centinela presente, la
cantidad restaurada igual a la registrada, y el contenido del archivo intacto. El
volumen descartable se borró.

### LO QUE SE LIMPIÓ, PARA NO DEJAR DATOS INVENTADOS

El archivo que se usó para probar la persistencia y la restauración se sacó del
volumen productivo, junto con el paquete que lo contenía y la huella. El backup
se volvió a correr con el volumen limpio e informó **0 fotos**, que es la verdad
hoy: todavía nadie cargó ninguna.

### EL CAMBIO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

Esta tanda saca cosas, así que el marcador es al revés: `top:-22px` —el
pseudo-elemento del botón que se eliminó— está **1 vez en la imagen vieja y 0 en
la nueva**, con `.w-\[202px\]{` de control dando 1 en las dos, que es lo que
prueba que la búsqueda funciona.

Y las rutas nuevas se comprobaron por comportamiento, que es más fuerte que un
grep: `/api/productos/foto/subir` contesta 405 —existe y es POST— y
`/api/productos/foto/<nombre>` contesta 401 —existe y pide permiso—, contra una
ruta inventada que contesta 404.

### LO QUE NO SE PUDO HACER, Y NO SE MAQUILLA

**NO se abrió Productos móvil a 390 px en producción con una sesión real.** No
hay credenciales productivas en la máquina desde la que se desplegó, y adivinar
gasta el límite de login y puede trabar una cuenta.

Lo que sí se comprobó sin sesión: las tres pantallas contestan 200, sus rutas de
datos contestan 401 —o sea que viven y piden sesión—, los logs no tienen un solo
error después de pedirlas, y la sonda de cascada contra producción da verde. La
verificación visual a 390 px de este mismo contenido está hecha contra
desarrollo, antes del corte.

**Queda pendiente, y hace falta que lo haga alguien con sesión:** abrir Productos
móvil a 390 px, tocar el bloque del precio de un producto con pack para ver que
alterna, y cargar una foto de punta a punta para confirmar que se guarda en el
volumen y se ve en la tarjeta. Eso último es lo único que todavía no se ejerció
con el camino completo.

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
