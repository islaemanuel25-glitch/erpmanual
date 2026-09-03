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

Ninguna.

---

Producción está al día en **105**, comprobado con `prisma migrate status` el
2026-09-03 después de desplegar
`6eb3f36447e5aa08348ae203658a6039dea7c57f` — el merge de
`hotfix/productos-retorno-solo-mobile`: la restauración de posición es del
celular, y el escritorio vuelve a donde volvía. **Solo código.**

Corte de **9 segundos como máximo** —el reloj arrancó junto al `up -d` y ese
número incluye la ida y vuelta del ssh, así que el corte real es menor—. Cinco
valores coincidentes, `erpazul_app` con **cero reinicios**, `erpazul_db` **no
recreado** —sigue con el arranque del 2026-08-17, todo con `--no-deps app`—,
logs sin un solo error, `APP_IMAGE` sin filtrarse dentro del contenedor y el
árbol del VPS limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:81541c3727262cd5172057b9200174ceffd6ef0d`
(imagen `sha256:9032d7522dbc…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-6eb3f364_20260903_012730.sql.gz`, 3.532.270 bytes.
El quinto no aplica: no hay migración.

Sin migraciones: el rango `81541c37..6eb3f364` no toca `prisma/`, el clasificador
informó "Archivos a mirar: 0" con el rango tomado de la imagen que atendía, y
este archivo ya decía que no había pendientes. Los cuatro conteos dieron **105**
—árbol local, árbol del VPS, aplicadas en la base y el contenedor descartable—.

### EL ÁRBOL DEL MERGE ES EL DE LA RAMA PROBADA

Comprobado antes del corte y no después: el merge `6eb3f364` tiene dos padres
—`8a2e68f8` y `6e5e55cd`—, su árbol es `7283f315`, **el mismo** que el de la
punta de la rama, y el diff entre los dos está vacío. Lo que se desplegó es
exactamente lo que se probó.

### EL ASUNTO DEL MERGE DICE `@`, Y NO SE CORRIGIÓ A PROPÓSITO

En `git log --oneline` el merge `6eb3f364` aparece con el asunto `@`. No es un
commit vacío ni un error de contenido: el mensaje entero está adentro, dos líneas
más abajo. Lo que pasó es que el mensaje se pasó con la sintaxis de here-string de
PowerShell —`@'…'@`— desde Bash, que no la conoce, así que los dos marcadores
entraron como texto: uno arriba de todo y otro al final.

**No se rehízo el merge, y ese es el punto.** Arreglar el asunto cambia el SHA, y
ese SHA es el que quedó en la etiqueta de la imagen, en el `APP_BUILD_ID` y en
`/api/version`: reescribirlo rompería los cinco valores por un renglón de
cosmética. La corrección vale para el próximo mensaje, no para éste.

### EL CÓDIGO VIAJÓ, Y ACÁ HAY MARCADOR EN LOS DOS SENTIDOS

De aparición: la cadena `"movil"` con sus comillas, el valor del marcador de
origen que estrena esta tanda. Es un literal y no un identificador —el build
minifica los identificadores—, y es **ASCII puro**, para que un acento roto al
viajar por ssh no dé un vacío que se lea como "no llegó". Sin comillas no sirve:
`movil` suelto da 3 archivos en la imagen vieja, porque aparece adentro de otras
palabras. En la imagen que atiende da **6** y en la vieja **0**; `"origen"` da lo
mismo, 6 contra 0.

De desaparición, que es la mitad que esta tanda vino a hacer: `data-ancla` —el
atributo con el que se encuentra una fila o una card al volver— pasó de **47
archivos a 8**. La marca dejó la tabla de escritorio y quedó solo donde
corresponde, en la vista del celular.

El control `"productos-scroll"` da **2 en las dos imágenes**, que es lo que
prueba que la búsqueda funciona en ambas, y una cadena inventada da 0 en las dos.

**Y UN PRIMER INTENTO DE CONTROL SE DESCARTÓ.** La primera medición usó
`productos:selectedProductId` y dio 1 contra 0 — un resultado que parecía
confirmar el viaje del código y no significaba nada, porque el control estaba
midiendo mal: la comilla del comando se había comido en el camino por ssh. Con
`grep -F` y el entrecomillado arreglado, el mismo control da 2 y 2. Es la regla
del skill: si el control de un marcador no da positivo en las dos imágenes, el
marcador no contestó la pregunta.

### EL CONTROL POSTERIOR

`/modulos/productos` en **200**, y también con la query completa
—`?page=2&q=a&sortKey=precioVenta&sortDir=desc`— y con `?tipo=combos`. El editor
de producto en **200** con y sin el marcador nuevo
—`/modulos/productos/1176/editar?page=2&q=a&origen=movil`—, y el editor de combo
en **200** con y sin query, que son los dos caminos que esta tanda separa.
`/api/productos/listar` en **401** —vive y pide sesión— y `/login` en 200. Logs
sin un solo error después de pedirlas. Cascada **verde** antes y después del
corte.

### LO QUE NO SE EJERCIÓ CONTRA PRODUCCIÓN

**No se abrió el listado con una sesión real**, así que el ciclo de editar y
volver no se recorrió contra el sitio. La verificación funcional está hecha
contra un servidor de desarrollo con datos reales antes del corte: la sonda del
retorno con **102 afirmaciones y 0 rojas** a 390×844 y a 1366×900 —los caminos de
vuelta del celular, el retorno de escritorio con la tabla desplazada de verdad a
300 px, y los dos destinos del combo de escritorio—, la sonda de la tarjeta en
verde, y la de cascada verde contra el build local.

### LAS DOS SONDAS ARRANCARON EN ROJO, Y NO ERA LA TANDA

Vale anotarlo porque es la tercera vez que un arnés frena por su entorno y no por
lo que mide. Las dos sondas de pantalla dijeron "no hay datos" de forma
determinista. La causa: el servidor de desarrollo devolvía **500 en sus propios
chunks**, porque en la sesión anterior se le borró el `.next` por debajo mientras
corría. Lo que lo separó de un defecto real fue preguntar tres cosas distintas en
vez de una: la API contestaba **200 con filas**, la pantalla quedaba en la cáscara
sin hidratar, y **no había una sola excepción en la consola** — un defecto de
render habría dejado rastro. Reiniciado el servidor limpio, las dos pasaron a
verde sin tocar una línea de código.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy.

---

Antes de éste, producción estuvo en
`81541c3727262cd5172057b9200174ceffd6ef0d` — el merge de
`fix/productos-restaurar-posicion`: volver de editar deja al mismo producto
donde estaba. **Solo código.**

Corte de **4 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` **no recreado** —sigue con el arranque del 2026-08-17,
todo con `--no-deps app`—, logs sin un solo error, `APP_IMAGE` sin filtrarse
dentro del contenedor y el árbol del VPS limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:78ae684dd74fb5f63843f829324eb76b8106b48d`
(imagen `sha256:8a05a03ecac3…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-81541c37_20260902_232105.sql.gz`, 3,4 MB. El quinto
no aplica: no hay migración.

Sin migraciones: el rango `78ae684d..81541c37` no toca `prisma/`, el clasificador
informó "Archivos a mirar: 0" con el rango tomado de la imagen que atendía, y
este archivo ya decía que no había pendientes. Los cuatro conteos dieron **105**
—árbol local, árbol del VPS, aplicadas en la base y el contenedor descartable—.

### EL ÁRBOL DEL MERGE ES EL DE LA RAMA PROBADA

Comprobado antes del corte y no después: el merge `81541c37` tiene dos padres
—`c12de2c7` y `299ed958`—, su árbol es `53244b93`, **el mismo** que el de la
punta de la rama, y el diff entre los dos está vacío. Lo que se desplegó es
exactamente lo que se probó.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

Dos marcadores, los dos cadenas y no identificadores: `data-ancla` —el atributo
con el que se encuentra una card o una fila al volver— y el rótulo `Último
editado`.

En la imagen que atiende aparecen en **47** y **3** archivos del build; en la
imagen vieja, corrida en un contenedor descartable, en **0** los dos. El control
`Para revisar` da **4 en las dos**, que es lo que prueba que la búsqueda funciona
en ambas, y una cadena inventada da 0.

### EL CONTROL POSTERIOR

`/modulos/productos` en **200**, y también con la query completa
—`?page=2&q=a&sortKey=precioVenta&sortDir=desc`—. El editor de producto
`/modulos/productos/1176/editar?page=2` en **200** y el de combo
`/modulos/productos/editar-combo/6550?tipo=combos` en **200**, que son los dos
caminos que esta tanda arregla. `/api/productos/listar` en **401** —vive y pide
sesión— y `/login` en 200. Logs sin un solo error después de pedirlas. Cascada
**verde** antes y después del corte.

### LO QUE NO SE EJERCIÓ CONTRA PRODUCCIÓN

**No se abrió el listado con una sesión real**, así que el ciclo de editar y
volver no se recorrió contra el sitio. La verificación funcional está hecha
contra un servidor de desarrollo con datos reales antes del corte, con las tres
sondas en verde: la del retorno con **79 afirmaciones** a 390×844 y a 1366×900
—los cuatro caminos de vuelta, el combo, la entrada por otra URL con un estado
pendiente, volver de la ficha, y la comparación de altura con 12 px de
tolerancia—, la del carrusel con 51, y la de la tarjeta.

Un caso queda anotado como **NO ALCANZABLE** y no como aprobado: con dos combos
en la lista, el contenedor llega a su tope —83 de 83 px de sobrante— y no existe
scroll que ponga el segundo a media pantalla.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy.

---

Antes de éste, producción estuvo en
`78ae684dd74fb5f63843f829324eb76b8106b48d` — el merge de
`hotfix/carrusel-unico`, que corrige un defecto de interpretación del despliegue
anterior: las ocho modalidades vuelven al MISMO carrusel de "Para revisar", en
vez de vivir en un segundo bloque. **Solo código.**

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` **no recreado** —sigue con el arranque del 2026-08-17,
todo con `--no-deps app`—, logs sin un solo error, `/login` en 200, `APP_IMAGE`
sin filtrarse dentro del contenedor y el árbol del VPS limpio. Rollback
disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:f7e2d7c3a55f5d7deb876c7cb1296475e6cf09db`
(imagen `sha256:ee1fa790ae98…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-78ae684d_20260902_211544.sql.gz`, 3,4 MB. El quinto
no aplica: no hay migración.

Sin migraciones: el rango `f7e2d7c3..78ae684d` no toca `prisma/`, el clasificador
informó "Archivos a mirar: 0" con el rango tomado de la imagen que atendía, y
este archivo ya decía que no había pendientes. Los cuatro conteos dieron **105**
—árbol local, árbol del VPS, aplicadas en la base y el contenedor descartable—,
que es lo que distingue "estaba todo aplicado" de "la imagen no conoce la
migración".

### EL CÓDIGO VIAJÓ, Y ACÁ EL MARCADOR ES DE DESAPARICIÓN

Esta tanda SACA un bloque, así que el marcador es al revés: algo que tiene que
haber dejado de estar. Es la cadena `"Presentaciones"` con sus comillas —el
título del segundo bloque—, anclada así porque suelta matchearía
`setPresentaciones` y `contarPresentacionesDesdePrisma`, que siguen existiendo
como identificadores.

En la imagen vieja aparece en **2** archivos del build; en la que atiende, en
**0**. El control `"Para revisar"` da **4 en las dos**, que es lo que prueba que
la búsqueda funciona en las dos imágenes, y una cadena inventada da 0.

### UNA COMPROBACIÓN QUE SE DESCARTÓ ENTERA, Y POR QUÉ

Se intentó confirmarlo también por comportamiento, buscando `Presentaciones` en
el HTML que produccción sirve para `/modulos/productos`. Dio **0** — y no
significa nada: el **control dio 0 también**. La pantalla es un componente de
cliente detrás de sesión, así que lo que se sirve sin credenciales es una cáscara
de 10 KB donde no está ninguna de las dos palabras.

Se descartó la comprobación entera en vez de quedarse con el cero que
convenía. Es la regla del skill: si el control de un marcador da vacío, el
marcador no contestó la pregunta.

### UN ROJO QUE FRENÓ EL DESPLIEGUE, Y ESTA VEZ ERA DE VERDAD

La sonda de la tarjeta se puso roja antes del corte: su afirmación 14a exigía que
el bloque de "Para revisar" dibujara CUATRO cards, y con el carrusel único el
bloque lleva doce. No se aflojó el número — se reescribió sabiendo qué cambió:
ahora afirma sobre la PRIMERA PÁGINA, y se le agregaron dos mitades que faltaban
(que ninguna de las cuatro primeras sea una modalidad, y que el bloque lleve las
doce en tres páginas). Va en el commit `78ae684d`.

### LO QUE SE EJERCIÓ CONTRA PRODUCCIÓN, Y LO QUE NO

Sin sesión: `/modulos/productos` en 200, también con `?presVenta=venta-pack` y
con el cruce; `/api/productos/controles` y `/api/productos/listar` en **401**
—viven y piden sesión—; logs sin un solo error. Cascada **verde** antes y después
del corte.

**No se abrió el carrusel en producción con una sesión real.** La verificación
funcional está hecha contra un servidor de desarrollo con datos reales antes del
corte: la sonda del carrusel con **51 afirmaciones y 0 rojas** a 390 px —un solo
carrusel, tres páginas, tres indicadores, Atrás, Adelante, recargas, el cruce y
el desborde en cinco momentos— y la sonda de la tarjeta en verde.

**Los 26 px del buscador están medidos y aceptados.** A 390 px el campo arranca
en y=294 con el carrusel original de cuatro cards, en y=499 con los dos bloques
que estaban desplegados, y en **y=320** con esto. La diferencia contra el
original es la fila de tres indicadores, que el pedido pide expresamente y que el
carrusel de cuatro cards no tenía porque no había más de una página. Emanuel la
aprobó explícitamente.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy.

---

Antes de éste, producción estuvo en
`f7e2d7c3a55f5d7deb876c7cb1296475e6cf09db` — el merge del PR #23, el bloque
Presentaciones del catálogo. **Solo código.**

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` **no recreado** —sigue con el arranque del 2026-08-17,
todo con `--no-deps app`—, logs sin un solo error, `/login` en 200, `APP_IMAGE`
sin filtrarse dentro del contenedor y el árbol del VPS limpio. Rollback
disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:b13e748e3a79064f931b7086a7f8956c888dc7a3`
(imagen `sha256:ca4889bb7732…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-f7e2d7c3_20260902_195933.sql.gz`, 3,4 MB. El quinto
no aplica: no hay migración.

Sin migraciones, comprobado de tres formas antes de tocar nada: el rango
`b13e748e..f7e2d7c3` no toca `prisma/`, el clasificador informó "Archivos a
mirar: 0" con el rango tomado de la imagen que atendía, y este archivo ya decía
que no había pendientes. El contenedor descartable contó **105**, el mismo número
que el árbol y que las aplicadas en la base — que es lo que distingue "estaba
todo aplicado" de "la imagen no conoce la migración", porque las dos imprimen el
mismo "No pending migrations to apply" con salida 0.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS Y CON DOS MARCADORES

`presVenta` —el parámetro de URL que estrena el filtro por presentación— y
`venta-pieza` —uno de los ocho identificadores del catálogo—. Los dos son
literales y no identificadores, y los dos son ASCII puro.

En la imagen que atiende aparecen en **3** archivos del build cada uno; en la
imagen vieja, corrida en un contenedor descartable, en **0**. Los controles
—`Falta regla`, que da 3 en las dos, y `por pieza`, que da 36 y 31— prueban que
la búsqueda funciona en las dos imágenes, y una cadena inventada da 0, que prueba
que no devuelve cualquier cosa.

**Y UN MARCADOR SE DESCARTÓ, QUE ES LO QUE VALE ANOTAR.** El primero elegido fue
`Compra por pieza`, el rótulo de una card. Dio **0 en las dos imágenes**, y eso
NO era que el código no viajó: en el catálogo `titulo` y `detalle` son dos
cadenas separadas que la card une como **dos hijos de JSX**, así que esa frase
entera no existe en ningún archivo del build. Es la misma familia que la regla de
no juntar dos hijos de JSX en una cadena: lo que se ve junto en pantalla puede no
estar junto en el código. El marcador se descartó entero en vez de buscarle una
explicación.

### LO QUE SE EJERCIÓ CONTRA PRODUCCIÓN, Y LO QUE NO

Sin sesión: `/modulos/productos` en 200, y también con `?presVenta=venta-pack` y
con el cruce `?presVenta=venta-pack&presCompra=compra-kg` — o sea que la pantalla
renderiza con los parámetros nuevos. `/api/productos/controles` y
`/api/productos/listar?presVenta=venta-pack` contestan **401**: viven y piden
sesión en vez de romperse. Los logs no tienen un solo error después de pedirlas.
El andamio de la tarjeta contesta **404** y `/inicio` **200**, así que el guardia
de entorno sigue puesto. Cascada **verde** antes y después del corte.

**No se abrió el bloque en producción con una sesión real**, así que las ocho
cards no se tocaron contra el sitio. La verificación funcional está hecha contra
un servidor local con datos reales antes del corte: la sonda de presentaciones
con **39 afirmaciones y 0 rojas** a 390 px —tocar, Atrás, Adelante, recargar el
enlace de compra, recargar el cruce, escribir en el buscador y medir el desborde
en cinco momentos—, la sonda de la tarjeta en verde, y la de Postgres con **13 de
13** contra `erpazul_dev`.

### UN ROJO DEL ARNÉS QUE NO ERA UN DEFECTO, Y CÓMO SE DISTINGUIÓ

La sonda de la tarjeta frenó con "el andamio no dibujó ninguna cara". No era la
tanda: se la había apuntado a un servidor levantado con `next start`, o sea
entorno de producción, donde `app/andamio-producto-card` contesta 404 **por su
guardia de entorno** —el comportamiento comprobado y documentado el 2026-08-15—.
El control lo separó de un servidor caído: `/inicio` contestaba 200 en el mismo
servidor. Vuelta a correr contra un servidor de desarrollo, **verde**.

Vale como recordatorio de que el criterio "si no puede medir es rojo y frena" es
el correcto: frenó, se miró por qué, y recién ahí se siguió.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy; la última
sigue siendo la del 2026-08-25.

---

Antes de éste, producción estaba al día en **105**, comprobado con
`prisma migrate status` el
2026-09-01 después de desplegar
`b13e748e3a79064f931b7086a7f8956c888dc7a3` — el merge del PR #21, que hace
configurable por local si el POS le muestra el stock al cajero, con la migración
`20260831150000_mostrar_stock_pos_por_local` **aplicada**.

La entrada de esa migración se borra de la lista de pendientes porque se cumplió
la condición que ella misma fijaba: el árbol tiene 105 y el contenedor
descartable informó "105 migrations found" y "Database schema is up to date!". Y
se aplicó DE VERDAD, que es otra cosa: imprimió `Applying migration` y las
aplicadas en la base subieron de **104 a 105** — un "No pending migrations to
apply" con salida 0 se ve igual y significa lo contrario.

### EL EFECTO, COMPROBADO CONTRA `information_schema` EN LOS DOS SENTIDOS

Antes de migrar, la columna `mostrarStockPos` de `ConfiguracionLocal` daba **0**
filas en `information_schema.columns`; después da **1**, `boolean`, `is_nullable
= YES` y **sin default**, que es exactamente lo que la migración pedía. Y las
filas que quedaron con valor son **0**: no hubo backfill, como estaba escrito.
Ninguna tabla existente fue tocada.

### ⚠️ Y ESTE DESPLIEGUE CAMBIÓ LO QUE VE EL CAJERO, EN TODOS LOS LOCALES

Era el efecto buscado y está anotado desde antes del corte, pero conviene que
quede escrito acá también, porque es lo que alguien va a ir a buscar cuando
pregunte por qué el POS se ve distinto.

Todas las filas de `ConfiguracionLocal` quedaron con la columna en `null`, y
`null` significa apagado: **el stock dejó de verse en el POS de todos los
locales**, hasta que alguien lo encienda uno por uno desde
Configuración → POS Ventas. No es el patrón de `exigirOperador` ni el de
`arqueoCajaActivo`, donde `null` conserva lo que ya pasaba.

Corte de **4 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` **no recreado** —arrancado el 2026-08-17 y sigue con
ese mismo arranque, todo el despliegue con `--no-deps app`—, logs sin un solo
error, `/modulos/pos-ventas` en 200, `/api/config/pos-ventas-cliente` en 401
—existe y pide sesión, no 500— y el árbol del VPS limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:da20d21cd6f7b14919304788628eafe7cec77480`
(imagen `sha256:d2f5a9ce07c5…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-b13e748e_20260901_030730.sql.gz`, 3,3 MB. El quinto
no aplica: es aditiva pura, no borra ni transforma ningún dato, así que no hay
valor que buscar adentro del dump.

El clasificador corrió **antes del backup**, con el rango tomado de la imagen que
atendía —`da20d21c..HEAD`—: informó "Archivos a mirar: 1", clasificó **aditiva** y
salió con 0. No es el caso degenerado: nombró la migración correcta.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

El marcador es la cadena de interfaz `Mostrar stock en POS Ventas`, el rótulo del
interruptor que estrena esta tanda. Es un literal y no un identificador —el build
minifica los identificadores— y es **ASCII puro**, para que un acento roto al
viajar por ssh no dé un vacío que se lea como "no llegó".

En la imagen que atiende aparece en **2** archivos del build; en la imagen vieja,
corrida en un contenedor descartable, en **0**. El control
`Exigir operario para operar el POS` —que existía desde antes— da **2 en las
dos**, que es lo que prueba que la búsqueda funciona y no que el grep esté
fallando en la imagen vieja.

La sonda de cascada dio **verde contra producción** antes y después del corte.

### LO QUE NO SE PUDO HACER, Y NO SE DA POR BUENO

**No se abrió el POS en producción con una sesión real**, así que el interruptor
no se tocó contra el sitio: no se vio el stock apagarse ni encenderse desde
Configuración → POS Ventas. No hay credenciales productivas en la máquina desde
la que se desplegó, y el pedido de esta tanda fue expresamente no extraerlas del
almacén.

Lo que sí se comprobó sin sesión: la pantalla del POS contesta 200, la ruta de
configuración contesta 401 —o sea que vive y pide sesión—, los logs no tienen un
solo error después de pedirlas, y la columna existe con la forma correcta. La
verificación del comportamiento está en los **16 candados** de
`components/pos-ventas/stockNoVisible.test.mjs`, corridos contra el commit
—no contra el escritorio— dentro de una suite de **4433 candados, 4432 en verde,
0 en rojo y 1 todo conocido**.

**Queda pendiente, y lo puede hacer cualquiera con sesión en diez segundos:**
abrir un local, encender el interruptor, y confirmar que el stock vuelve a verse
en el POS de ESE local y sigue oculto en los otros.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy.

---

Antes de éste, producción estaba al día en **104**, comprobado con
`prisma migrate status` el
2026-08-27 después de desplegar
`de921481b56894433b9e2ff7e7cf1527a8764eb1` — el arreglo de los dos defectos que
aparecieron con el importador en producción: el endpoint que devolvía una página
HTML y la foto que no traía tabla cruda. **Solo código.**

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` healthy y **no recreado** —todo con `--no-deps app`—,
logs sin un solo error, `/login` en 200, `APP_IMAGE` sin filtrarse dentro del
contenedor y el árbol del VPS limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:a63b66e57b444139eaedd89b4bea965cb83f97ef`
(imagen `sha256:44ec2ac076b5…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre en las últimas 20 líneas, **62 tablas**—:
`/srv/produccion/backups/pre-de921481_20260827_212153.sql.gz`, 3,0 MB. El quinto
no aplica: no hay migración de datos.

Sin migraciones, comprobado de tres formas antes de tocar nada: el rango
`a63b66e5..HEAD` no toca `prisma/`, el clasificador informó "Archivos a mirar: 0"
con el rango tomado de la imagen que atendía, y este archivo ya decía que no
había pendientes. El contenedor descartable contó **104**, el mismo número que el
árbol — que es lo que distingue "estaba todo aplicado" de "la imagen no conoce la
migración", porque las dos imprimen el mismo "No pending migrations to apply" con
salida 0.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

El marcador es la cadena de interfaz `renglones que quedaron afuera`, del botón
que estrena esta tanda para abrir la lista completa de omitidos. Es un literal y
no un identificador —el build minifica los identificadores— y es **ASCII puro**,
para que un acento roto al viajar por ssh no dé un vacío que se lea como "no
llegó".

Cero apariciones en **todo el árbol** del commit que estaba desplegado. En la
imagen que atiende aparece en **2** archivos del build. El control
`afuera por la receta` —que existía desde antes— aparece en los mismos dos, y una
cadena inventada da vacío: la búsqueda encuentra lo que está y no devuelve
cualquier cosa.

Y la ruta nueva se comprobó por COMPORTAMIENTO, que es más fuerte que un grep:
`/api/compras-proveedor/importar/transcribir` contesta **401 con
`application/json`**. Que conteste JSON y no una página es, además, justo lo que
esta tanda vino a arreglar.

### LO QUE NO SE PUDO HACER, Y NO SE DA POR BUENO

**No se abrió el importador en producción con una sesión real**, así que el
camino completo —subir una foto, explicar cómo se lee y ver las 16 enviadas con
las 15 omitidas— no se ejerció contra el sitio. No hay credenciales productivas
en la máquina desde la que se desplegó.

La verificación funcional está hecha contra desarrollo antes del corte: la sonda
del importador con **135 afirmaciones y 0 rojas**, tres corridas idénticas, a
390×844 y 1366×900, contra un build `next start` con sesión real del usuario de
sonda. Y con sus dos contrapruebas: devuelto el `.json()` a ciegas la sonda
reproduce el síntoma exacto de producción, y sacada la retranscripción frena
diciendo que degradó en silencio. La cascada dio **verde contra producción**
antes y después del corte.

**Y LA CAUSA RAÍZ DEL HTML SIGUE SIN CONFIRMAR.** Lo que se desplegó no es el
arreglo de la causa: es el arreglo de que la pantalla no podía distinguir. La
próxima vez que pase, el mensaje va a decir la operación y el código en vez de
`Unexpected token '<'`. Queda anotado como pendiente de diagnóstico.

**Ninguna autorización manual de migraciones**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea de hoy; la última
sigue siendo la del 2026-08-25.

---

Antes de éste, producción estaba al día en **104**, comprobado con
`prisma migrate status` el 2026-08-27 después de desplegar
`a63b66e57b444139eaedd89b4bea965cb83f97ef` — el merge de los candados de
magnitud y las recetas de lectura del importador de pedidos, con la migración
`20260828010000_receta_lectura_proveedor` **aplicada**.

La entrada de esa migración se borra de la lista de pendientes porque se cumplió
la condición que ella misma fijaba: el árbol tiene 104 y `migrate status` informa
104 y "Database schema is up to date!". Y se aplicó DE VERDAD, que es otra cosa:
el contenedor descartable imprimió `Applying migration` y las aplicadas en la
base subieron de **103 a 104** — un "No pending migrations to apply" con salida 0
se ve igual y significa lo contrario.

Aditiva pura, así que no hay ids que cruzar. Lo que sí se comprobó contra
`information_schema`: la tabla `RecetaLecturaProveedor` **existe**, donde antes
del corte la misma consulta devolvía cero. Ninguna tabla existente fue tocada.

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` healthy y **no recreado** —todo el despliegue con
`--no-deps app`—, logs sin un solo error, `/login` en 200, `APP_IMAGE` sin
filtrarse dentro del contenedor y el árbol del VPS limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:4434cbb65b3c5938802a1d024125c072703406c3`
(imagen `sha256:0703c9eccce2…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre presente en las últimas 20 líneas, **61
tablas**—: `/srv/produccion/backups/pre-a63b66e5_20260827_152429.sql.gz`, 3,0 MB.
El quinto no aplica: no borra ni transforma ningún dato, así que no hay valor que
buscar adentro del dump.

El clasificador corrió **antes del backup**, con el rango tomado de la imagen que
atendía —`4434cbb6..HEAD`—: un archivo, clasificado **aditiva**, salida 0. No es
el caso degenerado ni el del archivo sin commitear: informó "Archivos a mirar: 1"
y nombró la migración correcta.

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

El marcador es la cadena de interfaz `Usar solo esta vez`, el botón que estrena
el panel conversacional. Es un literal y no un identificador —el build de
producción minifica los identificadores, así que no afirman nada— y es **ASCII
puro**, que evita que un acento se rompa al viajar por ssh y dé un vacío que se
lea como "no llegó".

Cero apariciones en **todo el árbol** del commit que estaba desplegado, no solo
en el archivo esperado. En la imagen que atiende aparece en **2** archivos del
build, el chunk de servidor y el de cliente. El control `Sugeridos para esta`
—que existía desde antes— aparece en los mismos dos, que es lo que prueba que la
búsqueda funciona; y una cadena inventada da vacío, que es lo que prueba que no
devuelve cualquier cosa.

### UN TROPIEZO DEL MÉTODO QUE VALE ANOTAR: `cmd | tail` DEVUELVE EL CÓDIGO DE `tail`

La suite se corrió con `… --test … | tail -18` y la corrida informó **salida 0**.
Ese cero era del `tail`, no del runner: una tubería devuelve el estado del último
comando. La suite podría haber estado en rojo y se habría leído como verde, y
encima el `tail` se había comido las líneas del resumen, así que tampoco había
totales para desmentirlo.

Se volvió a correr redirigiendo a un archivo y leyendo el código del propio
runner: **0**, con **4289 candados, 4288 en verde, 0 en rojo y 1 todo conocido**
—el de `panelDecision`, que sigue anotado—. Es la misma familia que "el código de
salida de `migrate deploy` no prueba que se aplicó nada": un cero puede venir de
otro lado.

### LO QUE NO SE PUDO HACER, Y NO SE DA POR BUENO

**No se abrió el importador en producción con una sesión real**, así que ni el
panel conversacional ni el bloqueo por importe incoherente se ejercieron contra
el sitio. No hay credenciales productivas en la máquina desde la que se desplegó.

La verificación funcional de este contenido está hecha contra desarrollo antes
del corte: la sonda del importador con **100 afirmaciones y 0 rojas**, tres
corridas idénticas, a 390×844 y 1366×900, y con su contraprueba —reintroducido el
defecto de la tolerancia se pone roja sola—. La de cascada da **verde contra
producción** después del corte.

**Ninguna autorización manual de migraciones en este despliegue**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea con la fecha de hoy.
La última sigue siendo la del 2026-08-25.

Reapareció el warning `The "POSTGRES_PASSWORD" variable is not set`. Es el
pendiente conocido y preexistente de interpolación, y es exactamente el motivo
por el que nunca se recrea el servicio `db`.

---

Antes de ésta, producción estaba al día: **103 migraciones en el árbol y 103
aplicadas**, comprobado el 2026-08-27 después de desplegar
`4434cbb65b3c5938802a1d024125c072703406c3` — la marca por raíz en el motor de
candidatos y la separación entre la unidad del papel y la del pedido. **Solo
código.**

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` healthy y **no recreado** —todo el despliegue con
`--no-deps app`—, logs sin un solo error, `/login` en 200 y el árbol del VPS
limpio. Rollback disponible en
`ghcr.io/islaemanuel25-glitch/erpmanual:4d8a1b4a83aee69ab950c03fdd0532a3ac74ba39`
(imagen `sha256:1dfd4696dfd9…`). No hizo falta.

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre presente en las últimas 20 líneas, **61
tablas**—: `/srv/produccion/backups/pre-4434cbb6_20260827_111729.sql.gz`,
3.071.869 bytes. El quinto no aplica: no hay migración de datos.

Sin migraciones, comprobado de tres formas antes de tocar nada: el rango
`4d8a1b4a..4434cbb6` no toca `prisma/`, el clasificador informó "Archivos a
mirar: 0" con el rango tomado de la imagen que atendía, y este archivo ya decía
que no había pendientes. El contenedor descartable contó **103**, el mismo
número que el árbol — que es lo que distingue "no había nada que aplicar" de "la
imagen no conoce la migración".

### EL CÓDIGO VIAJÓ, COMPROBADO EN LOS DOS SENTIDOS

El marcador es la cadena de interfaz `expresado en`, de la pregunta que esta
tanda estrena —"La factura dice 10. ¿Está expresado en?"—. Es un literal y no un
identificador, que el build minifica y por lo tanto no afirma nada.

En la imagen que atiende aparece en **2** archivos del build; en la imagen vieja,
corrida en un contenedor descartable, en **0**. El control `Producto del sistema`
—que existía desde antes— da **2 en las dos**, que es lo que prueba que la
búsqueda funciona y no que el grep esté fallando.

### LO QUE NO SE PUDO HACER, Y NO SE DA POR BUENO

**No se abrió el importador en producción con una sesión real.** No hay
credenciales productivas en la máquina desde la que se desplegó. Lo que sí se
comprobó sin sesión: `/modulos/compras-proveedor/importar`, `nueva`, `recepcion`
y `/modulos/productos` contestan 200; `comprobantes/listar` contesta 401 e
`importar/analizar` contesta 405 —existe y es POST—; los logs no tienen un solo
error después de pedirlas; y la sonda de cascada contra producción da verde.

La verificación funcional de este contenido está hecha contra desarrollo antes
del corte: la sonda del importador con **54 afirmaciones y 0 rojas**, cuatro
corridas, a 390×844 y 1366×900.

**Ninguna autorización manual de migraciones en este despliegue**:
`.claude/migraciones-autorizadas.log` no tiene ninguna línea con la fecha de hoy.
La última es del 2026-08-25.

---

Antes de éste, producción estaba al día en **103**, comprobado con
`prisma migrate status` el 2026-08-27 después de
desplegar `671a76297d09c3cdec398b35c44aafcb4b5862b1` — la identidad compartida
del producto por proveedor, con la migración
`20260827010000_identidad_compartida_proveedor` **aplicada**.

La entrada de esa migración se borra acá porque se cumplió la condición que ella
misma fijaba: `migrate status` contra producción informa 103 y "Database schema
is up to date!". Y se aplicó DE VERDAD, que es otra cosa: el contenedor
descartable imprimió "Applying migration" y el conteo subió de 102 a 103 — un
"No pending migrations to apply" con salida 0 se ve igual y significa lo
contrario.

### El efecto, comprobado contra la base

No era una migración de datos, así que no hay ids que cruzar. Lo que sí se
comprobó, leyendo producción desde un contenedor descartable:

- **las seis columnas existen y se pueden consultar** con la API de Prisma;
- sobre 593 filas de `ProductoCodigoProveedor`, **cero tienen `metodoDeteccion`**.
  Ese cero es el resultado esperado y no un descuido: la migración no rellena
  nada, porque de los vínculos viejos no consta por qué camino entraron.

### LA TABLA DE MIGRACIONES TIENE 104 FILAS Y NO ES UN PROBLEMA

Conviene saberlo antes de que alguien lo mire de apuro y crea que falta algo.
`_prisma_migrations` tiene **104 filas para 103 migraciones**, porque
`20241202000000_add_venta_campos` aparece dos veces: un intento marcado como
revertido el 2026-04-27 y el aplicado con éxito **seis milisegundos después**,
el mismo día.

Prisma cuenta por nombre distinto no revertido, y ahí da 103. La forma correcta
de preguntarlo es `COUNT(DISTINCT migration_name) WHERE finished_at IS NOT NULL
AND rolled_back_at IS NULL`; contar filas a secas da 104 y asusta sin motivo.

---

Antes de ésta, producción estaba al día en **102**, comprobado el 2026-08-25
después de desplegar `1e1ad11fe8d60f2d2d667d1089b3231b942a930b` — la experiencia móvil de
Stock por local y su resumen de estados, con la migración
`20260824010000_stock_limites_configurados_at` **aplicada**.

La entrada de esa migración se borra acá porque se cumplió la condición que ella
misma fijaba: `migrate status` contra producción informa 102 y "Database schema
is up to date!".

### Lo que dejó el backfill, medido y no supuesto

Fue una migración de DATOS, así que se comprobó contra la base **antes y después**
y se cruzaron los **ids**, no los totales. Sobre 11.647 filas de `StockLocal`:

- `0/0` **con** auditoría → configurado: esperadas 5, quedaron 5, ninguna mal;
- valor positivo **sin** auditoría → configurado: esperadas 0, quedaron 0. **Esa
  segunda pasada del backfill no tuvo ni una fila que ejercerla**, igual que en
  desarrollo. No es un problema, pero significa que ese caso se verificó como
  "cero y sigue cero", no como una comprobación positiva;
- `0/0` **sin** auditoría → sin configurar: esperadas 56, quedaron 56;
- `null/null` **sin** auditoría → sin configurar: esperadas 9.068, quedaron 9.068.

**El cruce de ids cerró por los dos lados**: 2.523 filas esperadas configuradas y
2.523 configuradas, con **cero** de la lista sin tocar y **cero** tocadas fuera de
la lista. Un conteo global que coincide puede tapar unas de más y otras de menos;
esto no.

Un desnivel que conviene conocer para que no se lea mal más adelante: hay **2.524**
`productoLocalId` con auditoría de LIMITES y **2.523** filas configuradas. Es un
producto auditado cuya fila de `StockLocal` ya no existe, no una fila que el
backfill se haya salteado. El mismo desnivel de uno estaba en desarrollo.

El índice parcial `StockLocal_localId_limitesSinAjustar_idx` quedó creado y la
columna es nullable, comprobado contra `pg_indexes` e `information_schema`.

Corte de **4 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` healthy y **no recreado**, logs sin errores, `/login` en
200 y el árbol del VPS limpio.

**El backup previo lleva su quinto chequeo**, que en una migración de datos no es
opcional: se comprobó que el dump contiene las 11.647 filas de `StockLocal` con
sus `stockMin`/`stockMax` viejos, las 5 filas del caso que solo la auditoría
rescata, y 3.112 filas de `AuditoriaStock` con `LIMITES`. Está en
`/srv/produccion/backups/pre-1e1ad11f_20260825_025750.sql.gz`.

---

### Antes de este despliegue

Producción estuvo en `03e41244a751842210e17c6ae6a5093a022fe52f` con 101
migraciones — la coordinación de carga de Productos (el listado primero, los
contadores de "Para revisar" después) más la corrección de la sonda que la
vigila. **Solo código.**

Corte de **2 segundos**. Cinco valores coincidentes, `erpazul_app` con **cero
reinicios**, `erpazul_db` healthy y **no recreado** —todo el despliegue fue con
`--no-deps app`—, logs sin errores nuevos, `/login` en 200, `APP_IMAGE` sin
filtrarse dentro del contenedor y el árbol del VPS limpio. **No hubo rollback**,
y quedó disponible a
`ghcr.io/islaemanuel25-glitch/erpmanual:e8e236127e634e648582a9c60d5ef5d2d52a31b5`
(imagen `sha256:175f7038be1b…`).

Backup previo validado con los cuatro chequeos —`pg_dump` con `pipefail` en 0,
`gzip -t` limpio, marca de cierre presente, 61 tablas—:
`/srv/produccion/backups/pre-03e41244_20260823_215705.sql.gz`, 2.829.309 bytes.

Sin migraciones, comprobado de tres formas antes de tocar nada:
`git diff --name-only e8e23612..03e41244 -- prisma/` no devolvió nada, el
clasificador informó "Archivos a mirar: 0" con el rango tomado de la imagen que
atendía, y este archivo ya decía que no había pendientes. El contenedor
descartable contó **101**, el mismo número que el árbol — que es lo que distingue
"no había nada que aplicar" de "la imagen no conoce la migración". Y `migrate
status` al cierre volvió a informar 101 y "Database schema is up to date!".

Reapareció el warning `The "POSTGRES_PASSWORD" variable is not set` en los
comandos de compose. Es el **pendiente conocido y preexistente** de
interpolación, no algo que trajera esta tanda, y es exactamente el motivo por el
que nunca se recrea el servicio `db`.

### ESTE DESPLIEGUE FRENÓ UNA VEZ, Y FRENÓ BIEN

El primer intento —sobre `3cc3c337`, el merge de la coordinación de carga— no
llegó a tocar producción: la sonda predeploy de la tarjeta dio **rojo** en su
afirmación 14j, que compara el contador de la card contra el total del listado.
Leía `null` y el listado traía 1766, determinista en dos corridas.

**La sonda estaba esperando lo que ya no correspondía.** Tras navegar por URL
aguardaba solo a que aparecieran las tarjetas del listado, y eso alcanzaba
mientras listado y controles salían a la vez. Justamente esta tanda los separa,
así que cuando las tarjetas aparecen las cards siguen calculando. El rojo
señalaba la coherencia de los números, que era lo único que NO estaba mal.

Se corrigió en `8c80ac16` —PR #10, mergeado antes de reintentar— y el despliegue
salió con `03e41244`, que contiene las dos cosas. Vale como recordatorio de por
qué la sonda se corre desde el árbol local: desplegar el merge viejo habría
dejado la corrección afuera y habría vuelto a frenar por lo mismo.

Predeploy de esta corrida: cascada **verde** contra producción y contra el build
local, y la sonda de tarjeta **verde**, con 14j comparando **1766 contra 1766**
—el mismo punto que antes leía `null`—. Después del corte, cascada verde otra vez
contra producción, y las rutas de Productos respondiendo: `/modulos/productos` en
200, `listar` y `controles` en 401 sin sesión, que es rechazar bien.

### DOS COSAS QUE NO SE PUDIERON VERIFICAR, Y NO SE DAN POR BUENAS

**El marcador de contenido dentro de la imagen no se pudo armar.** Los dos
archivos de esta tanda que entran al build —`app/modulos/productos/page.jsx` y
`lib/productos/ordenDeCargaProductos.js`— no agregan ninguna CADENA: aportan solo
identificadores, y el build de producción los minifica. Lo único que suman es la
ruta del import y la palabra `"object"`, ninguna útil como marcador. Las cadenas
que sí aparecen en el diff son todas del archivo de candados, que no viaja al
build.

O sea que acá **no hay evidencia de contenido**, solo de consistencia: los cinco
valores y el `APP_BUILD_ID` de la propia imagen. Es exactamente el caso que el
procedimiento manda declarar en vez de suponer.

**La medición del orden listado→controles no se ejerció en producción.**
`scripts/sonda-productos-orden-de-carga.mjs` hace login real y manipula la
interfaz, y su encabezado dice que no se corre contra producción. El orden está
medido y contraprobado en desarrollo —listado 1360→1990 ms, controles arrancando
a los 2342, holgura de +352 ms— y **no** en el sitio real.

### LOS DOS BINARIOS DE u2netp SE VERIFICARON ANTES DEL CORTE, NO DESPUÉS

Esta tanda mete 18 MB de binarios nuevos en la imagen, así que la pregunta
—¿llegaron?— se contestó con un contenedor descartable de la imagen nueva
**antes** de recrear nada. Si faltaban, el corte no salía.

Adentro de la imagen, con sha256 idéntico al de `MANIFIESTO.json`:

    u2netp.onnx                    4.574.861 B   309c8469…
    ort-wasm-simd-threaded.wasm   13.479.978 B   d1ab1b94…

Y después del corte, servidos por el dominio: los dos en 200 y con el mismo
número de bytes, más `MANIFIESTO.json` en 200. Las dos licencias también
viajaron intactas —1073 y 11357 bytes—, o sea que la marca `-text` del
`.gitattributes` sobrevivió al build; sin ella, git las habría convertido a CRLF
y el candado U15 estaría rojo en cualquier clon de Windows.

Las fotos de producto siguen accesibles: el volumen conserva su centinela y sus
archivos, y `/api/productos/foto/[archivo]` responde **401** sin sesión — que es
rechazar bien, no romperse.

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
