# DEC-0010 — Qué motor quita el fondo de las fotos de producto

**Fecha:** 2026-08-22
**Estado:** SUPERADO el 2026-08-23 — u2netp entró como motor principal. Lo de
abajo se conserva porque explica por qué NO había entrado antes y qué se
descartó; lo que rige hoy está en "Lo que pasó después" al final.
**Alcance:** la foto de un producto, cargada desde el celular en `FormProducto`

## El problema

Una foto sacada en el depósito trae el estante, la mano, la caja de al lado y la
luz del tubo. En la tarjeta de producto esa foto entra en un cuadrado de 44 px:
lo que se ve es el estante, no el producto. Quitar el fondo es lo que hace que la
miniatura sirva para reconocer algo.

La restricción que ordenó la búsqueda la puso Emanuel y es previa a cualquier
comparación técnica: **sin servicios externos pagos, sin mandar las fotos a un
tercero y sin dependencias AGPL.** Eso descarta motores antes de mirarles la
calidad, y por eso se evalúa primero la licencia y el destino de la foto.

## Los motores que se miraron

### remove.bg y equivalentes por API — DESCARTADO por la restricción

Calidad muy buena, cero trabajo de integración. Manda la foto de cada producto a
un servidor de un tercero y cobra por volumen. Las dos cosas están excluidas por
el encargo, así que no se evaluó más allá.

### BRIA RMBG 1.4 / 2.0 — DESCARTADO por licencia

Es el modelo que hoy da el mejor resultado en fotos de producto, y por eso se
miró primero. La licencia es **no comercial**: el uso en un ERP que factura queda
afuera. No hay forma de acomodarlo pagando poco, porque la licencia comercial es
un acuerdo aparte con el proveedor.

### IMG.LY `background-removal-js` — DESCARTADO por licencia y por peso

**AGPL**, que el encargo excluye expresamente, y los modelos pesan entre 40 y
80 MB. Sobre la red de un celular en el depósito, eso es la primera carga de la
pantalla de productos.

### BiRefNet — DESCARTADO por peso

Licencia MIT, o sea que por ese lado entra. El problema es el tamaño: el ONNX
completo son 973 MB, la versión "lite" 224 MB y la de media precisión 115 MB.
Ninguna de las tres se puede bajar a un teléfono para recortar una foto.

### u2netp sobre onnxruntime-web — VIABLE, candidato pendiente, NO aprobado

Apache-2.0, **4,7 MB** de modelo, entrada de 320×320, alrededor de 30 ms por
imagen en CPU. Corre en el navegador, así que la foto no sale del teléfono.
Cuesta una dependencia nueva —`onnxruntime-web`, unos 3 MB en su build mínima de
WASM— y un archivo de modelo servido desde el mismo dominio.

Es el único de la lista que cumple las tres restricciones a la vez. No se
implementó **todavía** por lo que se explica abajo.

### El recorte por bordes, sin dependencias — LO QUE SE IMPLEMENTÓ

Está en [`lib/productos/quitarFondo.js`](../../lib/productos/quitarFondo.js). El
color del fondo sale del promedio de las cuatro esquinas; desde los bordes se
hace un relleno iterativo que borra todo lo que se le parezca dentro de una
tolerancia; los píxeles del límite quedan con transparencia parcial para que el
contorno no salga con escalera.

Cero dependencias, cero bytes de descarga, cero costo, y la foto no se mueve del
teléfono.

## Por qué se eligió el de bordes para la primera versión

No porque sea mejor que u2netp: no lo es. Por tres razones que se pueden
verificar.

**La primera es que el flujo aprobado no necesita que el motor acierte siempre.**
La pantalla muestra el recorte ANTES de subir nada y ofrece usar la original.
Con revisión de por medio, un motor que acierta en la mayoría de las fotos y
reconoce cuándo falló resuelve el problema; sin revisión, haría falta uno que no
falle nunca, y ése no existe.

**La segunda es que la costura ya está.** La pantalla importa `quitarFondo` y no
sabe nada de píxeles —eso lo afirma un candado—, así que cambiar de motor es
cambiar un archivo. Meter la dependencia nueva antes de tener el flujo probado
sería pagarla sin saber si hace falta.

**La tercera es que hay que medir sobre fotos reales antes de gastar 8 MB de
descarga.** Todavía no hay ninguna foto de producto cargada en producción: el
volumen se creó recién. Comparar los dos motores sobre casos armados a mano no
contesta la pregunta que importa, que es cómo salen las fotos que saca Emanuel
en el depósito, con esa luz y esos estantes.

## Dónde falla el motor elegido, medido

Los números salen de correr el motor sobre casos armados a propósito. Están en
[`lib/productos/quitarFondo.test.mjs`](../../lib/productos/quitarFondo.test.mjs)
como candados, para que el día que cambie el motor esto se ponga rojo — y
ponerse rojo va a significar que el motor nuevo lo resolvió.

Anda bien, y lo confirma la revisión:

- caja rectangular sobre fondo liso: quita el 55,6 %, el producto queda entero
- producto chico, 11 % del cuadro: quita el 88,9 %, entero
- producto muy chico, 5 % del cuadro: quita el 95,3 %, entero
- botella con vidrio y reflejo: quita el 81,9 % y **no queda hueca** — el
  contorno oscuro frena el relleno, así que el vidrio del medio se conserva
- bolsa con borde dentado: quita el 74,4 %, el contorno irregular no la parte

Falla, y lo reconoce:

- **producto blanco sobre fondo claro**: se lo come entero, quita el 100 %
- **fondo del mismo tono que el producto** (cartón claro sobre mesa clara, que es
  el caso realista del depósito): también se lo come
- **fondo con textura** —un estante de madera veteada, una pared con manchas—:
  el relleno se corta a los pocos píxeles y deja la foto picada; quita el 31,5 %

Los tres terminan en "no confío", así que la pantalla mueve el color principal al
botón de la original y avisa. Ninguno se ofrece como bueno.

Y falla sin reconocerlo en un caso conocido: **si el producto toca el borde de la
foto**. El relleno arranca desde los bordes, así que entra por ahí. Es la razón
por la que la vista previa va sobre un tablero a cuadros y no sobre un fondo
liso: un recorte que se comió medio producto se ve de inmediato.

## Cómo se decide si el recorte es creíble

Dos preguntas, y ninguna sola alcanza. Esto se aprendió midiendo, después de
escribir una versión con una sola.

**Cuánto se quitó.** La primera versión rechazaba todo lo que pasara del 85 %, y
estaba mal: un producto apoyado en el piso ocupa poco del cuadro, así que un
recorte correcto borra el 95 % de la foto. Con ese techo, el caso fácil salía
rechazado. Por proporción, lo único que se distingue de verdad es "se llevó
todo", así que el techo quedó en 99,5 % y no más abajo.

**Qué quedó.** Un fondo con textura quita el 31,5 %, que es una proporción
perfectamente creíble —cae en la misma banda que el caso fácil, que quita el
55,6 %—. Lo que los separa no es cuánto se borró sino que un producto es **un
bloque conectado** y el ruido son cientos de manchitas. Se mide qué fracción de
lo que sobrevivió está en el bloque más grande: los tres casos buenos dan 100 %,
el producto blanco da 0 % y el ruido da 9 %.

## La transparencia no se negocia

El archivo recortado se guarda en **WebP o PNG, nunca en JPEG**. No es una
preferencia de formato: JPEG no tiene canal alfa y no da error al recibir una
imagen con transparencia — **rellena el fondo de negro y la guarda tan campante**.
Todo el trabajo se destruye en el último paso, en silencio, y se ve recién en la
tarjeta.

La función que achica ya elegía entre WebP y JPEG según lo que el navegador
supiera producir. Ahora, cuando hay alfa, el respaldo pasa a ser PNG. Una foto
CON fondo sigue yendo a JPEG si no hay WebP, que es el caso viejo y no cambió.

## Lo que se hace después, y con qué se decide

La primera versión queda con el motor de bordes que está descrito arriba.
**u2netp sigue siendo un candidato pendiente y no está aprobado**: nadie
comprometió la dependencia ni los megabytes.

Cuando haya fotos reales sacadas en el depósito —del orden de veinte o treinta—,
se toman **esas mismas imágenes** y se corren por los dos motores. La decisión se
toma ahí, mirando los resultados reales uno al lado del otro. Si entra u2netp,
entra por la costura y con su costo declarado: unos 8 MB de descarga la primera
vez, una dependencia nueva Apache-2.0, y la foto sigue sin salir del teléfono.

**No se fija todavía cuántos fallos obligan a cambiar de motor.** Un umbral
—"tantos por ciento y se cambia"— tendría la forma de un criterio medido sin
serlo: no hay ninguna evidencia real todavía con la que justificar ese número, y
escribirlo ahora sería inventarlo y después obedecerlo.

### CORRECCIÓN — ACÁ DECÍA QUE EL DATO SE JUNTABA SOLO, Y ES FALSO

La versión anterior de esta sección afirmaba que "el dato para decidir ya se está
juntando solo", porque la pantalla sabe si el motor confió en cada recorte.
**Saberlo no es guardarlo.**

`confia` y el botón que se apretó —"Usar sin fondo" contra "Usar original"— viven
únicamente en el estado de `CargarFotoProducto`, y se pierden al cerrar la
pantalla. La ruta de subida recibe el producto y el archivo, y nada más: no hay
columna, ni evento, ni registro de ningún tipo. Al día de hoy **no queda rastro
de ninguna de las dos cosas**.

Así que la comparación de arriba es un trabajo a mano, con las fotos en la
pantalla, y no la lectura de un dato que se esté acumulando. Quien la haga la
tiene que hacer entera.

Y no se agrega nada para arreglarlo. Ponerle telemetría, una columna o un evento
de auditoría a esto sería construir infraestructura para una decisión que todavía
no se sabe si hay que tomar. Se corrige la afirmación, que era lo que estaba mal.

## Costo y dependencias que agrega esta decisión

Ninguno. Cero dependencias nuevas, cero bytes de descarga, cero pesos por mes, y
la foto no sale del teléfono. Todo lo que se usa —`canvas`, `createImageBitmap`—
ya está en el navegador.

## Lo que pasó después — u2netp ENTRÓ, el 2026-08-23

Todo lo de arriba describe la decisión de NO adoptarlo todavía. Duró un día. Lo
que sigue es lo que rige.

**Emanuel lo aprobó con el objetivo escrito:** que al subir una foto quede, en la
mayoría de los casos, solamente el producto con fondo transparente. El motor por
bordes no llega a eso, y sus fallas no eran de ajuste.

### Lo que se midió, y es la comparación que faltaba

Los dos motores, sobre las MISMAS imágenes, corriendo en un navegador
—`scripts/sonda-u2netp-casos.mjs`—. La medida no es "cuánto quitó" sino cuánto
acertó, que se puede calcular porque las imágenes se generan y se sabe qué pixel
es producto:

| caso | bordes: producto que sobrevive | u2netp |
|---|---|---|
| caja sobre fondo liso | 100 % | 100 % |
| **producto blanco sobre fondo claro** | **0 %** | **100 %** |
| **fondo del mismo tono que el producto** | **0 %** | **100 %** |
| botella con vidrio y reflejo | 100 % | 99,9 % |
| bolsa con borde dentado | 100 % | 100 % |
| **producto tocando el borde** | se lo comía | **100 %** |

Los tres casos en negrita son los que motivaron la tanda y los tres quedaron
resueltos. Los ceros del motor viejo no salen de la memoria: se midieron en la
contraprueba, apuntando el modelo a un archivo inexistente para forzar el
respaldo.

### Dónde sigue fallando u2netp, medido

**La bolsa de borde dentado es el único caso donde el motor viejo salía mejor.**
u2netp quita el 82,2 % del fondo contra el 98,5 % del de bordes: rellena las
muescas finas y deja un halo alrededor del contorno.

No es del umbral. Subir el piso del alfa de 0,28 a 0,45 lo llevó a 83,9 % y bajó
el producto de la botella de 99,9 a 99,7: no alcanza y empieza a comer producto.
La máscara se infiere a 320×320 y unas muescas de siete píxeles sobre una imagen
de ochenta no existen a esa escala.

**Y lo que NO se probó:** fotos reales. Todo lo de arriba son rectángulos,
círculos y ruido generados con canvas. Prueban que el motor distingue forma de
color —que es exactamente lo que el viejo no podía— y no cómo sale una foto del
depósito con luz de tubo y un estante atrás. Sigue sin haber fotos reales con las
que comparar.

### Lo que cuesta, medido y no estimado

Una dependencia nueva, `onnxruntime-web` 1.27.0, licencia MIT. El modelo es
Apache-2.0. Los dos archivos se sirven desde nuestro dominio y la foto no sale
del teléfono.

    u2netp.onnx                    4.574.861 B crudo  ·  4.237.634 B gzip
    ort-wasm-simd-threaded.wasm   13.479.978 B crudo  ·  3.428.070 B gzip
                                  18.054.839 B        ·  7.665.704 B

O sea **unos 7,7 MB la primera vez** en cada teléfono. Es bastante más que los
"8 MB" que se habían estimado arriba contando solo el modelo con una idea vieja
del tamaño del runtime — aquel número era del modelo, no del total.

Se bajan una sola vez: quedan en la Cache API con el nombre del almacén
versionado. Comprobado recargando la página y volviendo a recortar con **cero
pedidos de red**.

### El motor viejo no se borró

Quedó en `motorBordes.js` como respaldo, y solo corre si u2netp no puede. Cuando
eso pasa lo dice por consola, porque los dos devuelven una imagen plausible y
desde afuera "anda" y "anda el de atrás" se ven igual. Ese detalle no es teórico:
al escribir esta tanda un diagnóstico equivocado dio por muerto a u2netp cuando
estaba funcionando.

## Relacionado

- [DEC-0009](DEC-0009-fotos-de-producto-si-se-respaldan.md) — dónde se guardan
  las fotos y por qué no tienen retención
- [`docs/RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md`](../RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md)
  — backup y restauración del volumen
