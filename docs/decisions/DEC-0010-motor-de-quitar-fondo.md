# DEC-0010 — Qué motor quita el fondo de las fotos de producto

**Fecha:** 2026-08-22
**Estado:** decidido para la primera versión, con una puerta abierta y medida
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

### u2netp sobre onnxruntime-web — VIABLE, y es el candidato para la segunda vuelta

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

Cuando haya fotos reales cargadas —digamos veinte o treinta productos—, se toman
esas mismas fotos y se corren por los dos motores. Si el de bordes obliga a
elegir "usar original" seguido, entra u2netp por la costura, con su costo
declarado: unos 8 MB de descarga la primera vez, una dependencia nueva
Apache-2.0, y la foto sigue sin salir del teléfono.

**El dato para decidir ya se está juntando solo**: cada vez que alguien elige, la
pantalla sabe si confió o no. Es la misma forma que el conteo de renglones del
comprobante — guardar los dos números y mirarlos dentro de veinte casos, en vez
de discutirlo.

## Costo y dependencias que agrega esta decisión

Ninguno. Cero dependencias nuevas, cero bytes de descarga, cero pesos por mes, y
la foto no sale del teléfono. Todo lo que se usa —`canvas`, `createImageBitmap`—
ya está en el navegador.

## Relacionado

- [DEC-0009](DEC-0009-fotos-de-producto-si-se-respaldan.md) — dónde se guardan
  las fotos y por qué no tienen retención
- [`docs/RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md`](../RUNBOOK-VOLUMEN-FOTOS-PRODUCTOS.md)
  — backup y restauración del volumen
