# Listas de proveedor — lo que encontró el recorrido

**Fecha:** 2026-09-17 · **Producción en:** `ee34f817` · **Rama:** `claude/recorrido-listas`

Recorrido automático del módulo Compras → Lista de proveedores, con navegador de
verdad y sesión real, en 360 px y en 1366 px, con tema claro y oscuro.
**27 pasos, 120 comprobaciones, 8 defectos.** Uno rojo, seis amarillos, uno verde.

**En esta tanda no se arregló nada.** Es el relevamiento.

## Estado — actualizado el 2026-09-18

Este documento nació como relevamiento y se mantiene como tablero: cada defecto
lleva su estado arriba, y el texto del hallazgo **no se reescribe** cuando se
arregla. Lo que se midió el 2026-09-17 sigue diciendo lo que decía; lo que cambia
es el encabezado. Borrar la descripción de un defecto arreglado deja el arreglo
sin el caso que lo justifica, y es lo primero que se busca cuando algo vuelve.

- **1 — Columna de precio equivocada** — 🔴 **ARREGLADO** en `e174c655`, desplegado.
- **2, 3 y 6 — Los títulos de rubro** — 🟡 **ARREGLADO** en esta tanda.
- **5 — No se puede cancelar una lista abierta** — 🟡 **ARREGLADO** en esta tanda.
- **4 — El desplegable no se puede usar con el teclado** — 🟡 abierto. Es del kit
  y le pasa a todos los `SunmiSelectAdv` del ERP, así que no es de este módulo.
- **7 — El estado guardado no nombra el problema** — 🟢 abierto.

**Quedan dos:** un amarillo que es del kit y un verde interno.

### La última corrida del arnés — 2026-09-18

**26 pasos, 134 comprobaciones, 2 hallazgos: 0 rojos, 1 amarillo, 1 verde.**
Los dos que quedan son el 4 y el 7 de la lista de arriba. No apareció ninguno
nuevo.

Lo que la corrida confirmó contra la base, que es lo que vale:

- La importación guarda **13 filas** de las 16 del archivo, `filaExcel` de 1 a 13
  sin huecos, y ninguna sin código — así que no hay nada que la cola pueda ofrecer
  para vincular.
- «No los tenés» pasó de **6 a 3**, que son los tres renglones de producto que de
  verdad no están en el catálogo.
- La pantalla de lectura dice «Leí 13 productos, y salteé 4 renglones que no son
  productos (1 encabezado y 3 títulos de rubro, sin código)», y el aviso ahora
  sigue estando en la segunda lectura, cuando pide elegir la columna.
- Cancelar una lista abierta la deja CANCELADA, con fecha de cancelada y **sin**
  fecha de terminada, y pedir aplicar sobre ella contesta 409.
- Las seis pantallas se midieron a 360 y a 1366, en claro y en oscuro: sin
  desborde horizontal y con los dos temas dando distinto.

**Y una diferencia con lo que se había pedido, que conviene saber.** El pedido
decía «guarda 13 y cuenta 3 salteadas». Cuenta **4**: los 3 títulos de rubro más
el encabezado de la tabla, que el lector ya descartaba antes —era el «salteé 1
fila» de la versión vieja—. Decir 3 habría sido no contar el encabezado, y el
número que se muestra es el de renglones del papel que no eran productos. El
detalle entre paréntesis deja ver los dos por separado.

Cada afirmación de acá se comprobó contra Postgres, no contra lo que muestra la
pantalla. Es a propósito y es la parte cara: un módulo que dibuja bien y no
escribe pasaría un recorrido hecho de capturas, y ese es el defecto que este repo
tiene anotado como el que más caro sale.

## Cómo leerlo

- **ROJO** — escribe un precio mal, pierde datos, o deja al usuario trabado.
- **AMARILLO** — confunde, dice algo falso, o cuesta toques de más.
- **VERDE** — cosmético o interno.

"Visto N veces" es en cuántos de los cuatro caminos recorridos apareció el mismo
defecto: subir para actualizar, subir de nuevo, subir para controlar, y subir con
el rango en cero. Un defecto que aparece en los cuatro no es un caso de borde.

---

## 🔴 1 — La lista se lee con la columna de precio equivocada, y nadie avisa

> ✅ **ARREGLADO** en `e174c655`, ya desplegado. La propuesta que hace la pantalla
> dejó de contar como una elección de la persona: ahora hacen falta el índice y
> el gesto, así que al confirmar con «Está bien, seguir» el motor decide y, si no
> puede, pregunta —también la primera vez—. La pantalla muestra cuántos productos
> explica cada columna con la mejor primero, el resultado avisa si la que se usó
> explica menos de la mitad, y se puede cambiar de columna sin volver a subir el
> archivo. Los candados están en `lib/proveedores/listas/columnaLaEligeElMotor.test.mjs`.
>
> **Quedó un límite conocido y sin arreglar:** con UNA sola fila comparable el
> motor decide igual —1 de 1 llega a los dos tercios— y elige mal. Falta una
> muestra mínima. Está medido en su propio candado para que no se lea como
> cubierto; sobre listas reales no ocurre, traen entre 56 y 983 renglones.

**Severidad:** ROJO · **Pantalla:** «¿Leí bien la lista?» → Resultado · visto 1 vez

**Qué hice.** Subí un archivo con las dos columnas de precio que trae la lista de
Arcor —S/IVA y C/IVA— y acepté la lectura con «Está bien, seguir», que es el
botón obvio y el único que sigue para adelante.

**Qué esperaba.** Que se use la columna que mejor explica los costos que ya tengo.

**Qué pasó.** Se usó **S/IVA**, que explica 1 de cada 9 productos comparables,
teniendo al lado **C/IVA**, que explica 4. Los dos números no los deduje yo: están
guardados por el propio motor en `ImportacionListaProveedor.decisionDeLectura`:

    "opciones": [
      { "titulo": "S/IVA", "columna": 4, "explicadas": 1, "comparables": 9 },
      { "titulo": "C/IVA", "columna": 5, "explicadas": 4, "comparables": 9 }
    ],
    "delMotor": null,
    "aMano": true

**Por qué pasa.** Son tres piezas que por separado están bien:

1. La pantalla de lectura propone UNA columna de precio, elegida por el nombre de
   la columna. En un archivo con forma de Arcor, la primera es S/IVA.
2. El motor sí compara las dos, pero pide **dos tercios** para decidir
   (`MAYORIA_MINIMA` en `decisionDeLista.js`). Con 4 de 9 no llega, así que no
   elige: `delMotor: null`. Cuando eso pasa, la importación contesta 409 y la
   pantalla pregunta «elegí vos cuál es la columna de precio».
3. Pero esa pregunta **no se hace**, porque la columna que propuso la pantalla de
   lectura viaja como elección manual (`generico.eleccionManual !== null` en
   `app/api/proveedores/listas/importar/route.js:583`), y una elección manual
   saltea el 409.

Resultado: la propuesta hecha por el nombre de la columna le gana a la medición
del motor, y la pregunta que el motor quería hacer se traga.

**El daño, medido.** El único costo que se aplicó solo quedó así:

    ZZBP ARCOR ARVEJAS 350G: $742,30 → $858,86

El precio correcto de esa fila es $1.039,22 —el C/IVA—. Se escribió **un 17 % por
debajo**. Y lo peor no es el número: es que $858,86 contra $742,30 da **+15,7 %**,
que cae limpio adentro del rango esperado de 10 a 20 %, así que la fila salió
LISTO_PARA_ACTUALIZAR y se aplicó **sin una sola advertencia**. La columna
equivocada no produce un disparate visible: produce un aumento plausible.

**El detalle que lo confirma.** La SEGUNDA vez que se sube la misma lista —cuando
la receta ya quedó guardada— la pantalla sí dice «Ninguna columna de precio del
archivo da aumentos parecidos a los habituales de este proveedor» y pide elegir.
O sea que la rama correcta existe y funciona: lo que falla es que la primera vez
no se llega a ella. Y la primera vez es justamente la única en la que nadie tiene
todavía una referencia para desconfiar.

---

## 🟡 2 — Los títulos de rubro entran como productos

> ✅ **ARREGLADO el 2026-09-18**, junto con el 3 y el 6: son el mismo defecto
> visto en tres pantallas. Una fila sin código, o con todas sus columnas de precio
> en cero, ya no se guarda como producto: se descarta y se cuenta.
>
> El descarte va donde se aplica el MAPA de columnas y no en el lector, porque el
> lector decide por la forma del renglón y el título de rubro tiene tres celdas
> llenas —el nombre y los dos `$0.00`—. Los candados están en
> `lib/proveedores/listas/titulosDeRubroNoSonProductos.test.mjs`.
>
> Medido: el archivo de 16 renglones guarda 13, «no los tenés» pasó de 6 a 3, y
> ninguna fila guardada queda sin código.

**Severidad:** AMARILLO · **Pantalla:** «¿Leí bien la lista?» y Resultado · visto 1 vez (el conteo) y 4 (la vista previa)

**Qué hice.** Subí un archivo con tres títulos de sección —GOLOSINAS, CHOCOLATES
y ALIMENTOS—, cada uno con `$0.00` en las dos columnas de precio. Es exactamente
lo que hace la lista real de Arcor.

**Qué esperaba.** Que los tres se descarten, y que la pantalla diga que salteó 3
filas que no son productos.

**Qué pasó.** Dice que salteó **1**. Y las tres quedan guardadas como filas de la
importación:

    filaExcel 1  · GOLOSINAS   · precio 0 · NO_MACHEADO · motivo SIN_CODIGO
    filaExcel 5  · CHOCOLATES  · precio 0 · NO_MACHEADO · motivo SIN_CODIGO
    filaExcel 14 · ALIMENTOS   · precio 0 · NO_MACHEADO · motivo SIN_CODIGO

El archivo tiene 16 renglones y la importación guardó 16. No se descartó ninguno:
lo que el `descartes: {"ENCABEZADO": 1}` cuenta es el encabezado de la tabla, no
los rubros.

**El daño.** Las tres caen en la tarjeta **«no los tenés»**, que la pantalla
muestra con 6 cuando los productos de verdad que faltan son 3. Esa tarjeta lleva
a la cola donde se vincula un renglón de la lista con un producto del catálogo:
el módulo le está ofreciendo a Emanuel vincular la palabra GOLOSINAS con un
producto. En la lista real de Arcor, con 972 renglones y rubros cada quince, esto
son decenas de filas de trabajo inventado.

No es rojo porque un precio de 0 no se puede aplicar —`ERROR_COSTO.PRECIO_CERO`
lo frena— así que no escribe nada mal. Ensucia y hace perder tiempo.

---

## 🟡 3 — La vista previa muestra lo que dice haber salteado

> ✅ **ARREGLADO el 2026-09-18**, con el 2. «Así quedan los primeros productos»
> sale de las filas que quedaron, no de todo lo que tenía forma de fila.

**Severidad:** AMARILLO · **Pantalla:** «¿Leí bien la lista?» · visto 4 veces

**Qué hice.** Miré el bloque «Así quedan los primeros productos».

**Qué esperaba.** Solo productos.

**Qué pasó.** El primer renglón de la vista previa es:

    GOLOSINAS · Código — · Caja de — · $ 0,00

con la misma forma y el mismo peso visual que los productos de verdad. Y tres
renglones más abajo, en la misma pantalla, dice que salteó las filas que no son
productos. Las dos cosas no pueden ser ciertas a la vez, y la que el usuario
tiene delante de los ojos es la que está mal.

Es la cara visible del defecto 2, pero se anota aparte porque se arregla en otro
lado: esto es la vista previa, aquello es el lector.

---

## 🟡 4 — Con el teclado no se puede elegir proveedor

**Severidad:** AMARILLO · **Pantalla:** Subir · visto 4 veces

**Qué hice.** Abrí el desplegable de proveedor y miré cómo están hechas sus
opciones.

**Qué esperaba.** Opciones alcanzables con el teclado y anunciables por un lector
de pantalla.

**Qué pasó.** Las 7 opciones son `<div onClick>`: **0 tienen `role`, 0 son
enfocables**, el contenedor no tiene `role="listbox"` y las opciones no tienen
`role="option"`. Está en `components/sunmi/SunmiSelectAdv.jsx:245`.

**El alcance.** No es de este módulo: es del kit, así que le pasa a **todos** los
desplegables del ERP. Se anota acá porque acá se midió y porque acá duele
concreto: elegir el proveedor es el primer paso obligatorio para subir una lista,
y sin mouse o sin dedo no hay forma de darlo.

---

## 🟡 5 — Una lista abierta no se puede cancelar

> ✅ **ARREGLADO el 2026-09-18.** «Cancelar esta lista» está en el Resultado, al
> lado de «Terminar lista» y mientras la lista esté abierta, y en el listado en las
> que quedaron a medias. La confirmación dice qué pasa con lo ya aplicado —los
> costos NO se deshacen, y si se quiere volver atrás va primero «Deshacer»— y que
> la lista sale del trabajo pendiente.
>
> De paso se tapó un agujero que el botón nuevo volvía alcanzable: la ruta
> rechazaba solo la APLICADA, así que cancelar una TERMINADA la dejaba con las dos
> fechas puestas. Los candados están en
> `lib/proveedores/listas/cancelarUnaListaAbierta.test.mjs`.

**Severidad:** AMARILLO · **Pantalla:** Resultado · visto 1 vez

**Qué hice.** Subí una lista y busqué cómo descartarla, como si me hubiera
equivocado de archivo.

**Qué esperaba.** Un botón para cancelarla.

**Qué pasó.** No hay ninguno. «Cancelar esta lista» existe en **un solo lugar** de
la pantalla: adentro del aviso amarillo de la lista que quedó atrapada en el
rango 0 a 0 (`app/modulos/proveedores/listas/[id]/page.jsx:411`), que es un caso
viejo y puntual. Sobre una lista abierta normal las únicas salidas son aplicar o
terminar.

**El daño.** Subir el archivo equivocado obliga a «Terminar», que en el historial
queda como una lista trabajada y terminada. El estado CANCELADA existe en la base
y en el endpoint —`/api/proveedores/listas/[id]/cancelar`— y hay tres listas
canceladas ahí; desde esta pantalla no se llega.

Hay además un efecto de arrastre: mientras la lista queda abierta,
`importacion_archivo_unica` no deja volver a subir el mismo archivo para el mismo
proveedor. El índice está bien —impide dos importaciones abiertas del mismo
papel—, pero deja al usuario con un archivo que no puede ni usar ni descartar sin
declararlo terminado.

---

## 🟡 6 — El aviso de filas salteadas no aparece cuando hay que elegir la columna

> ✅ **ARREGLADO el 2026-09-18**, con el 2. El conteo viaja también en el 409 que
> pide elegir la columna de precio, que es la pantalla donde más sirve: es la que
> pide una decisión sobre cómo se leyó el archivo.

**Severidad:** AMARILLO · **Pantalla:** «¿Leí bien la lista?» · visto 3 veces

**Qué hice.** Subí la misma lista una segunda vez, cuando la receta ya está
guardada y la pantalla pide elegir la columna de precio.

**Qué esperaba.** Que siga diciendo cuántas filas salteó: el archivo es el mismo.

**Qué pasó.** No dice nada de filas salteadas. El aviso está en la primera
lectura y desaparece en la segunda, sobre el mismo archivo.

Menor, pero vale anotarlo porque la segunda lectura es la que pide una decisión
—qué columna es el precio— y es justo donde más sirve saber qué se descartó.

---

## 🟢 7 — El estado guardado no nombra el problema de la fila

**Severidad:** VERDE · **Pantalla:** interno, base de datos · visto 1 vez

**Qué hice.** Miré con qué estado quedan guardadas las filas que van a la cola de
revisión.

**Qué esperaba.** Un estado que nombre el problema real.

**Qué pasó.** Las **9** filas para revisar quedan en `FACTOR_DUDOSO`, y ninguna
tiene un problema de factor: sus motivos son `FUERA_DE_RANGO` y
`SIN_COSTO_ACTUAL`. En `eleccionDeLectura.js` `FACTOR_DUDOSO` se usa como el cajón
de "esto lo puede resolver una persona", contra `BLOQUEADO`, que es "no se puede
aplicar"; el comentario del archivo lo dice. Pero es un nombre con significado
propio y queda escrito en la base.

Verde porque el usuario no lo ve —la pantalla agrupa por motivo, no por estado— y
porque el comportamiento es correcto. Se anota porque es lo que va a leer quien
audite una conciliación vieja dentro de seis meses, que es el caso para el que
esa columna existe.

---

## Lo que el recorrido comprobó y salió BIEN

Vale tanto como la lista de arriba, porque es lo que no hay que volver a mirar:

- **Aplicar escribe exactamente lo que dijo que iba a escribir.** 1 fila lista, 1
  costo cambiado en el catálogo, ni uno más.
- **Nada fuera del rango se escribe solo.** Se comprobó producto por producto,
  comparando el costo viejo contra el nuevo en la base.
- **Deshacer devuelve todo.** Los 11 productos del banco vuelven al centavo que
  tenían.
- **Controlar no escribe nada.** Se recorrió la lista de control entera,
  incluido el pase a actualizar, y los 11 costos quedaron idénticos. No se ofrece
  el botón de aplicar.
- **El rango 0 a 0 se convierte en control y lo avisa**, y la lista se rescata
  poniéndole un rango sin volver a subir el archivo.
- **Terminar deja la lista TERMINADA** en la base.
- **El texto prohibido «entre 0,0 % y 0,0 %» no aparece** en ninguna de las
  pantallas ni en ninguno de los modos.
- **Ninguna pantalla desborda a lo ancho**, ni a 360 ni a 1366, en ninguno de los
  dos temas: 24 mediciones de `scrollWidth` contra `clientWidth`, todas en cero.
- **Los dos temas pintan distinto** en las seis pantallas: claro
  `rgb(241, 245, 249)`, oscuro `rgb(15, 23, 42)`.
- **El buscador del listado filtra y se limpia**, y los cuatro chips de filtro
  están.
- **Las trampas del catálogo se comportan como se esperaba**: el código repetido
  con dos precios queda sin aplicar, el producto sin costo no se aplica solo, el
  producto que no vino aparece en «no cambian», y el vínculo equivocado del
  13113 machea al producto equivocado —que es lo correcto con el dato guardado—
  hasta que alguien lo corrija.

## Lo que NO se recorrió, y por qué

Se dice en vez de dejarlo implícito:

- **Tres de las seis acciones de «revisar de a uno».** Se vieron «No lo cambio»,
  «Saltear» y «No es este producto». «Usar», «Elegir otro renglón» y «No está en
  la lista» no aparecen en la primera ficha de la cola: dependen del tipo de fila.
  El arnés recorre la primera y no itera sobre las demás. **Es un agujero real
  del recorrido**, no una conclusión sobre el módulo.
- **El filtro «Lo dejaste igual»** de la pantalla «no cambian» no se encontró por
  ese texto. Puede ser que se llame distinto; no se investigó.
- **Las cuatro listas reales** —M Y F, DREAMCO, AASS y Distribuidora 22-9— están
  en el banco y se pueden subir, pero el recorrido corre sobre el banco de
  prueba, cuyos números se pueden afirmar. Las reales tienen entre 56 y 983
  renglones y sus conteos cambian con cada tanda.
- **Lo que decide el modelo** —la sugerencia por descripción cuando no hay
  código— no se recorrió.

## Una corrección al pedido

Emanuel nombró las cuatro listas como «M Y F, Saldan, Dreamco, AASS».
**No hay ningún proveedor llamado Saldan en la base.** El cuarto es
`Distribuidora 22-9` (id 5), cuyo archivo es `22_9.pdf` y que tiene una
importación conciliada de 56 filas.

## Cómo se vuelve a correr

Dos comandos, desde la raíz del repo, con la base local levantada
(`service postgresql start`) y el servidor de desarrollo andando.

Primero el banco, una vez:

    DATABASE_URL="postgresql://erpazul:erpazul@127.0.0.1:5432/erpazul_al" \
      node --experimental-loader ./scripts/alias-loader.mjs \
      scripts/recorrido/bancoDeListas.mjs --sembrar

Después el recorrido:

    DATABASE_URL="postgresql://erpazul:erpazul@127.0.0.1:5432/erpazul_al" \
      node --experimental-loader ./scripts/alias-loader.mjs \
      scripts/recorrido/recorrer.mjs

Deja el informe en `.banco-de-prueba/hallazgos.json` y las capturas en
`capturas-recorrido/` (24 PNG: seis pantallas × dos anchos × dos temas). Ninguna
de las dos carpetas se versiona: llevan precios de compra del negocio.

Para borrar todo lo que el banco sembró:

    … scripts/recorrido/bancoDeListas.mjs --limpiar

Y hay dos herramientas de andamio para mirar una pantalla sin escribir un paso:
`scripts/recorrido/mirar.mjs <ruta> [--ancho 360] [--tocar "texto"]`, que imprime
qué dice, qué se puede tocar y qué campos tiene, y `scripts/recorrido/api.mjs
<ruta>`, que llama a una API con la sesión real. Sirven para separar "el endpoint
no lo manda" de "la pantalla no lo dibuja", que es la pregunta que más veces hubo
que contestar armando esto.
