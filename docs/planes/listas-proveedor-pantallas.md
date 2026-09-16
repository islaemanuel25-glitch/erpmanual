# Listas de proveedor — qué necesitan las pantallas

**Para qué es este documento.** Las pantallas se diseñan en Figma. Acá está lo que
el motor y la API ya devuelven, para que el diseño salga de datos que existen y no
de datos que habría que inventar después. Cada campo que se nombra acá viene de un
endpoint que anda hoy; donde falta algo, lo dice.

**Commit del relevamiento:** `c446028`.
**Qué está construido:** el motor, las dos rutas de lectura y lo que se guarda.
**Qué NO está construido:** las pantallas, y el enganche del motor nuevo con la
importación (ver la sección final).

---

## Pantalla 1 — Revisar las columnas de un archivo nuevo

Es la que aparece la primera vez que llega la lista de un proveedor, y cada vez
que el archivo cambia de estructura.

**De dónde salen los datos:** `POST /api/proveedores/listas/lectura/proponer`,
con el archivo y el `proveedorId`. No escribe nada, así que se puede entrar y
salir todas las veces que haga falta.

### Lo que la pantalla muestra

**Arriba, de qué archivo se está hablando:**

- el nombre del archivo
- el formato que el sistema reconoció: PDF, planilla o CSV (`archivo.formato`)
- si era una planilla, **qué hoja se eligió** y cuáles había (`archivo.hoja`,
  `archivo.hojas`). Esto no es un detalle: si eligió mal, el usuario tiene que
  poder verlo antes que nada.
- si era un PDF, cuántas páginas (`archivo.paginas`)

**Cuántas filas se leyeron y cuántas no:**

- `conteo.filas` — las que van a entrar
- `conteo.descartadas` y `conteo.descartesPorMotivo` — cuántas quedaron afuera y
  por qué. Los motivos son dos: `ENCABEZADO` (el renglón de títulos, repetido en
  cada hoja) y `TITULO_O_SUELTA` (los títulos de rubro y los renglones con una
  sola celda). **El motivo se muestra siempre**: un archivo del que se
  descartaron cuatrocientas filas sin decir por qué es un archivo que se leyó mal.

**La tabla de columnas**, que es el centro de la pantalla. Una fila por columna
del archivo, con:

- el número de columna
- el nombre que traía el archivo (`titulos[i]`) — puede venir vacío, y eso pasa:
  una de las cuatro listas reales tiene una columna sin título
- **qué dice el sistema que es** (`propuesta.columnas[i].tipo`), uno de:
  `codigo`, `codigoBarra`, `descripcion`, `cantidad`, `descuento`, `precio`, o
  vacío para las que no se usan
- **tres valores de ejemplo de esa columna** (`propuesta.columnas[i].ejemplos`).
  Es lo que permite confirmar sin abrir el archivo.

Una columna puede quedar sin tipo y **eso está bien**: la lista de un distribuidor
trae la marca, y la marca no sirve para vincular. La pantalla tiene que poder
mostrar "no se usa" sin que parezca un error.

**Las filas de ejemplo** (`ejemplos`): hasta ocho filas enteras, con el número de
renglón o de página de donde salieron (`y`, `pagina`). Sirven para ver la tabla
armada, no columna por columna.

**Qué tan segura es la propuesta:** `propuesta.confianza`, de 0 a 1, y
`propuesta.motivosDeDuda`, que es una lista de frases en castellano ya escritas
("No se encontró una columna que parezca el código del producto"). Medido sobre
las cinco listas reales, la confianza dio entre 0,85 y 0,97.

**Por qué se está preguntando** (`hayQueConfirmar`, `motivoConfirmacion`,
`textoConfirmacion`, `queCambio`). Son cuatro situaciones distintas y la pantalla
no debería decir lo mismo en las cuatro:

| Situación | Qué pasó |
|---|---|
| `SIN_RECETA` | Es la primera lista de este proveedor. |
| `ESTRUCTURA_CAMBIO` | El archivo tiene otras columnas que el último confirmado. `queCambio` lo dice en castellano: *"Antes el archivo traía 7 columnas y ahora trae 4."* |
| `COLUMNA_INEXISTENTE` | Lo guardado apunta a una columna que este archivo no tiene. |
| `RECETA_INVALIDA` | Lo guardado no se puede usar. |

Cuando `hayQueConfirmar` es `false` no hay pantalla: el archivo se lee solo y se
sigue de largo.

### Lo que la pantalla deja hacer

1. **Cambiar el tipo de una columna.** Cualquier columna puede pasar a ser
   cualquiera de los seis tipos, o a no usarse. Los precios son varios: una lista
   real trae cuatro columnas de precio y las cuatro tienen que poder quedar
   marcadas.
2. **Confirmar.** Llama a `POST /api/proveedores/listas/lectura/confirmar` con el
   `proveedorId`, los `titulos` y la `huella` que devolvió `proponer` —tal cual,
   sin recalcularla— y el mapeo corregido. Contesta con un mensaje ya escrito:
   *"Guardado. Las próximas listas de Arcor se van a leer con este mapa de
   columnas."*
3. **Elegir otra hoja**, si era una planilla con varias. Se vuelve a llamar a
   `proponer` con `hoja`.
4. **Salir sin confirmar.** No se escribió nada.

### Lo que la pantalla NO deja hacer

Confirmar sin código, sin descripción o sin ninguna columna de precio. La API lo
rechaza con un texto que dice qué falta, pero el botón debería estar apagado
antes: que el usuario lo descubra al apretar es peor.

### Cuando el archivo no se puede leer

`proponer` contesta `ok: false` con un `codigo` y un `error` ya redactado. Son
cinco y **mandan a hacer cosas distintas**:

| Código | Qué se hace |
|---|---|
| `SIN_TEXTO` | El PDF es un escaneo. Hay que pedirle al proveedor el archivo original. **El sistema no lo adivina**, y eso es a propósito: leer precios de una foto es inventarlos. |
| `ILEGIBLE` | El archivo está dañado o tiene contraseña. Es del archivo. |
| `LECTOR_NO_DISPONIBLE` | **No es del archivo: es del servidor.** Hay que avisar. |
| `FORMATO_DESCONOCIDO` | No es PDF, ni Excel, ni CSV. |
| `SIN_TABLA` | El archivo abrió y adentro no había una tabla de productos. |

El de `LECTOR_NO_DISPONIBLE` no puede verse igual que los otros: los demás son
algo que el usuario resuelve, ése no.

---

## Pantalla 2 — El resultado de la conciliación

Es la que ya existe, con lo que el motor nuevo agrega.

**De dónde salen los datos:** `decidirLista` en
`lib/proveedores/listas/decisionDeLista.js`. Todavía no hay endpoint que lo
exponga (ver la sección final).

### Arriba de todo: qué columna se usó

El dato más importante de la pantalla, porque es la decisión de la que cuelga todo
lo demás:

- **qué columna del archivo se tomó como precio** y si se le aplicó el descuento
  del renglón (`eleccion.columna`, `eleccion.conDescuento`)
- **cuántas filas la respaldan**: `eleccion.explicadas` de `eleccion.comparables`.
  Sobre las cuatro listas reales con catálogos de prueba, la columna correcta
  explicó entre el 93,8 % y el 94 % y la mejor de las equivocadas no pasó del
  62 %. Ese número es la evidencia de que se eligió bien y tiene que estar a la
  vista.
- **qué otras columnas se probaron y cómo les fue** (`opciones`): cada una con su
  nombre y cuántas filas explicó. Es lo que permite discutir la decisión en vez de
  aceptarla.

### Cuando el motor NO eligió

La lista entera queda para revisar y la pantalla tiene que decir cuál de los
cuatro motivos fue (`motivoLista`), con su texto ya escrito:

| Motivo | Qué significa |
|---|---|
| `NINGUNA_OPCION_CLARA` | Ninguna columna da aumentos parecidos a los habituales. Puede ser la lista, puede ser el rango mal cargado, pueden ser los costos viejos. |
| `EMPATE` | Dos columnas dan resultados casi iguales. **Hay que preguntar cuál factura el proveedor.** |
| `SIN_FILAS_COMPARABLES` | Ningún producto de la lista está vinculado a uno con costo cargado. |
| `SIN_RANGO` | Falta cargar el rango de aumento esperado del proveedor. |

En `EMPATE` la pantalla necesita una acción que no existe hoy: **elegir la columna
a mano**. Es la única de las cuatro que el usuario puede resolver ahí mismo.

### La tabla de filas

Cada fila viene con un `estado`, y son cuatro:

| Estado | Qué muestra |
|---|---|
| `APLICABLE` | El costo propuesto, el anterior y el porcentaje. Se puede aplicar. |
| `SIN_CAMBIO` | El costo no se mueve. Se aplica y no escribe nada. |
| `REVISAR` | No se aplica. Ver abajo. |
| `IGNORADA` | El archivo no trae precio, o el que trae no es un precio. Se cuenta y no se aplica. |

Para las `REVISAR`, el motivo (`motivo`) manda qué se muestra:

| Motivo | Qué necesita ver el usuario |
|---|---|
| `FUERA_DE_RANGO` | El costo de hoy, **todas** las lecturas posibles con su costo y su porcentaje (`lecturas`), y cuál es la que estuvo más cerca. |
| `VARIAS_LECTURAS_EN_RANGO` | Las dos lecturas que entraron, para elegir. |
| `SIN_COSTO_ACTUAL` | El precio leído y que el producto no tiene costo cargado. **No hay costo propuesto y no lo va a haber**: sin un número contra el cual controlar, elegir es adivinar. |
| `CODIGO_REPETIDO` | Las dos filas del archivo con ese código, juntas, para elegir una. |
| `SIN_ELECCION_DE_LISTA` | Nada propio de la fila: el problema es de la lista entera. |

Cada `lectura` trae `costoNuevo`, `variacionPct`, `multiplicador`, `detalle` —una
frase ya escrita, *"El archivo cotiza la unidad y el producto agrupa 12. El costo
es el precio por 12."*— y `origenCantidad`, que dice si el 12 salió del catálogo o
del archivo. **Esa distinción tiene que verse**: una cantidad sacada del nombre del
producto no vale lo mismo que una del catálogo.

### Los contadores

`resumen` trae `total`, `aplicables`, `sinCambio`, `paraRevisar` e `ignoradas`. Los
cinco suman el total, por construcción.

---

## Pantalla 3 — La configuración del proveedor

Ya existe, en la pantalla de subir una lista nueva. Lo que este trabajo agrega es
que ahora **también** guarda cómo se leen sus archivos.

Lo que se guarda por proveedor y la pantalla podría dejar ver:

- el rango de aumento esperado, el recargo y el impuesto adicional (ya está)
- **el mapa de columnas confirmado** (`listaRecetaLectura`) y contra qué archivo
  se confirmó (`listaRecetaHuella`)

Falta una acción que hoy no existe en ninguna pantalla: **olvidar la receta**,
para volver a confirmar de cero sin esperar a que el proveedor cambie el archivo.

---

## Lo que falta para que esto llegue al usuario

Escrito acá para que no se lea como terminado.

1. **El motor nuevo no está enganchado con la importación.** `decidirLista`
   funciona y está probado contra las cinco listas reales, pero
   `app/api/proveedores/listas/importar/route.js` sigue yendo por el registro de
   parsers, que solo conoce Arcor. Un proveedor sin `parserListaId` sigue sin
   poder importar.
2. **No hay endpoint que devuelva la decisión de la lista.** La pantalla 2 no
   tiene de dónde leer `eleccion`, `opciones` ni `motivoLista`.
3. **Falta la acción de elegir la columna a mano** cuando el motor informa
   `EMPATE`.
4. **Falta la acción de olvidar la receta.**

Las cuatro son trabajo de enganche sobre piezas que ya andan, y ninguna cambia
cómo se decide un costo.
