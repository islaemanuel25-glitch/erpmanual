# Plan: Compras → Listas de proveedor

**Relevado el 2026-09-16 contra `a2361da0`**, que es el commit que corría en
producción ese día. Tanda de SOLO LECTURA: no se modificó código, ni base, ni
migraciones. Lo único que se escribió es este documento.

---

## 0 · Dónde se hizo esto, y qué se tocó en el VPS

**Todo este relevamiento se corrió en el VPS de producción, `srv1431538`, y ese
fue un error: correspondía la máquina de desarrollo.** Se deja escrito porque
explica qué se pudo medir y qué no.

Lo que se creó en el VPS durante la investigación, y su estado ahora:

- Una base `erpazul_plan_listas`, restaurada del backup del día para no leer
  contra producción. **Borrada.** `psql -l` ya no la lista.
- Un contenedor `erpazul_plan_app` sirviendo la aplicación contra esa copia.
  **Eliminado.** Solo quedan `erpazul_app` y `erpazul_db`, los dos de producción.
- Dos scripts temporales en `scripts/` —`.recorrido-listas.mjs` y
  `.detalle-listas.mjs`—. **Borrados**, y el árbol del repo quedó limpio.
- Capturas y logs en `/tmp`, fuera del repo.

**Producción no se tocó en ningún momento**: las únicas consultas contra la base
`erpazul` fueron `SELECT`.

**Lo que este error costó, y es la mitad del encargo:** la base `erpazul_al` y la
carpeta `erpazul-fixtures-dev` **no existen en el VPS** —comprobado con `psql -l`
y con `find` sobre `/home/emanuel`—, y desde acá no hay ruta a la máquina de
desarrollo: el `~/.ssh/config` solo tiene GitHub, y ninguna de las sesiones
visibles corre allá. Así que el circuito completo con los Excel de verdad quedó
**sin recorrer**, y con él la parte de la evaluación de uso que necesita
cronómetro. Está marcado caso por caso más abajo.

### Lo que falta correr, y es lo primero de la próxima tanda

En la máquina de desarrollo, contra `erpazul_al`, con los archivos de
`erpazul-fixtures-dev` —el de agosto, hash `d0d283f2…`, que es el mismo de la
importación #3, y el de códigos de barras—:

1. Subir el de agosto y conciliar de cero, cronometrando.
2. Confirmar lecturas sobre las filas que el sistema no resolvió.
3. Aplicar, revertir y terminar.
4. Cargar después la lista siguiente del mismo proveedor, que es lo que hace un
   usuario real y es donde aparece el problema de encontrar la lista anterior.

Contando toques y pantallas en cada paso, a 360 px.

---

## 1 · Cómo funciona hoy, en criollo

El proveedor manda un Excel con su lista de precios. El módulo lo lee, lo compara
contra los productos que ya tenemos de ese proveedor, y propone un costo nuevo
para cada uno. **Nada se escribe hasta que alguien aprieta Aplicar.**

El recorrido es: se sube el archivo, el sistema lo concilia solo —a cada fila del
Excel le busca el producto del sistema—, y después una persona resuelve lo que el
sistema no pudo: las que no macheó, las que tienen el código duplicado, las que
traen un factor raro. Cuando hay filas listas, se aplican por tandas: aplicar no
cierra la importación, la deja abierta para seguir decidiendo el resto. Al final
se la termina a mano, o se la cancela si no sirvió.

Se puede deshacer: una importación aplicada o terminada conserva el costo
anterior de cada fila y se puede volver atrás.

**Lo que hoy anda bien y conviene saberlo antes de tocar nada:** la conciliación
funciona y los números de la pantalla de detalle salen de la base y cierran. El
botón de aplicar no se corta en 360 px, y no hay desborde horizontal en ninguna
de las cuatro pantallas. Una importación parcialmente aplicada SÍ tiene salida:
tiene "Terminar importación" y "Cancelar importación", y la #3 de producción ya
está TERMINADA por ese camino.

**Lo que no anda** es más chico de lo que parecía, y está en la lista de abajo.

---

## 2 · El mapa, y con qué se enumeró

**Pantallas** — `git ls-files --cached --others --exclude-standard` filtrando por
`app/modulos/.*lista`. Son tres del módulo: el listado
(`app/modulos/proveedores/listas/page.jsx`), la nueva importación (`nueva/`) y el
detalle (`[id]/`). Hay una cuarta,
`app/modulos/configuracion/listas-precios/page.jsx`, que es de otra cosa —listas
de precios de venta— y no forma parte de este circuito.

**Rutas de API** — mismo comando sobre `app/api/proveedores/listas`. Son 16
archivos de ruta. Las que mueven el estado de la cabecera son cinco: `importar`
(crea), `[id]/aplicar`, `[id]/finalizar`, `[id]/cancelar` y `[id]/revertir`. Las
otras once son de lectura o mueven una fila: `catalogo`, `productos`, `sistema`,
`proveedores`, `seleccion`, `vinculos/baja`, y las tres de
`[id]/filas/[filaId]/` —candidatos, confirmar, vincular—, más el `GET` del
listado y el del detalle.

**Lógica** — `lib/proveedores/listas/`, 53 archivos, la mitad candados. Las piezas
que deciden: `estados.js` (el estado de cada FILA), `persistencia.js` (el estado
de la CABECERA y qué se puede hacer en cada uno), `conciliarLista.js`,
`aplicacion.js`, `reversion.js` y `macheo.js`.

**Tablas** — `grep -nE "^model" prisma/schema.prisma` más el `prisma.X` que nombra
el módulo. Propias son dos: `ImportacionListaProveedor` (la cabecera) e
`ImportacionListaFila` (una fila del Excel, con su costo anterior guardado para
poder revertir). Escribe además sobre `ProductoBase`, `ProductoLocal` y
`ProductoCodigoProveedor`.

### Los estados de una importación, y qué lleva de uno a otro

Salen del enum `EstadoImportacionListaProveedor` del schema y de las constantes de
`lib/proveedores/listas/persistencia.js`. Son siete, y **solo cinco se usan**:

- **BORRADOR** — nace acá al subir el archivo.
- **CONCILIADA** — cuando terminó de leer y comparar. Está ABIERTA.
- **PARCIALMENTE_APLICADA** — se aplicó una tanda y quedan filas pendientes.
  Sigue ABIERTA: se puede vincular, seleccionar y aplicar de nuevo.
- **TERMINADA** — la cerró una persona con "Terminar importación". No acepta
  trabajo nuevo, pero SÍ se puede revertir, que es la razón de que el estado
  exista.
- **CANCELADA** — se descartó. Libera el archivo para volver a importarlo.
- **APLICADA** y **DESCARTADA** — están en el enum y **ninguna importación de
  producción las tiene**; el código las nombra pero el circuito de hoy no las
  produce. Ver el problema 4.

Abiertas son `CONCILIADA` y `PARCIALMENTE_APLICADA`. Revertibles son esas dos más
`TERMINADA`.

---

## 3 · Estado de producción

Comprobado con `curl https://operix.cloud/api/version` y `git log`:

- Corre `a2361da0`, que es también `origin/main`. **No hay ningún commit del
  módulo sin desplegar**: `git log <desplegado>..origin/main -- app/api/proveedores/listas app/modulos/proveedores/listas lib/proveedores/listas`
  devuelve vacío.
- Los dos commits que se preguntaban **están los dos en producción**, verificado
  con `git merge-base --is-ancestor`: `a98e4d4` ("con el panel abierto, la tabla
  deja de tener su propio scroll") y `4df848a` ("la tapa cuenta lo mismo que
  adentro, y en productos").

Datos, leídos con `SELECT` contra producción:

- Hay **cuatro importaciones**: dos CANCELADA (#1 y #2), una TERMINADA (#3) y una
  PARCIALMENTE_APLICADA (#4).
- **Ninguna tiene el archivo guardado**: `count(archivoUbicacion)` da 0 sobre 4.
- 3.723 filas en total. #3 tiene 281 filas aplicadas sobre 279 productos
  distintos; #4 tiene 55 sobre 55.

**Nota sobre el nombre de la base:** el pedido decía `erpazul_al` y esa base **no
existe** en este VPS. La de producción se llama `erpazul`. El recorrido se hizo
sobre una copia restaurada del backup del día en `erpazul_plan_listas`, para no
escribir en producción.

---

## 4 · Problemas encontrados

### Problema 1 — Una importación terminada sigue diciendo que tenés trabajo pendiente

**Qué pasa.** La #3 está TERMINADA: no se puede aplicar nada más, y la pantalla lo
dice más abajo. Pero arriba de todo, en amarillo y en grande, sigue diciendo
**"Tenés 6 productos listos para actualizar y 1 necesita que decidas"**, con la
tarjeta "6 Listos para aplicar" resaltada y el texto "El sistema ya decidió:
falta ejecutar la aplicación". Falta ejecutar algo que ya no se puede ejecutar.

**Cómo se comprobó.** Abriendo `/modulos/proveedores/listas/3` en un navegador
contra la copia de producción, a 360 y a 1366, con sesión de admin. El texto está
en las dos capturas. Los botones que ofrece son solamente "Volver al historial",
"Descargar / compartir reporte" y "Deshacer la aplicación" — o sea que la
pantalla YA sabe que está cerrada, porque no dibuja ni "Aplicar" ni "Terminar";
lo único que no se enteró es el encabezado.

**Gravedad: molesta.** No rompe nada ni escribe nada mal, pero es el primer
renglón que se lee al abrir y dice lo contrario de lo que se puede hacer.

### Problema 2 — El archivo original no se guarda nunca

**Qué pasa.** `archivoUbicacion` se escribe **siempre en `null`**, a mano, en
`app/api/proveedores/listas/importar/route.js`. El Excel que mandó el proveedor se
lee, se concilia y se tira. Si mañana hay que auditar por qué un costo quedó como
quedó, está la conciliación pero no el papel del que salió.

**Cómo se comprobó.** `git grep archivoUbicacion` muestra un solo lugar que lo
escribe, y escribe `null`. En producción, `count(archivoUbicacion)` da 0 sobre 4
importaciones.

**Y el motivo por el que no se guardaba ya no es cierto.** El comentario del
schema dice: *"el proyecto todavía no tiene almacenamiento permanente de
archivos, y escribirlo en el disco del contenedor lo perdería al recrearlo"*. Eso
era verdad cuando se escribió y hoy no: el compose de producción monta **dos
volúmenes externos** —`erpazul_comprobantes` y `erpazul_fotos_productos`— y hay un
almacén de disco ya construido y probado en
`lib/compras-proveedor/comprobante/almacenDisco.js`, con centinela, chequeo al
arrancar y `exigirAlmacen()` antes de cada escritura.

**Gravedad: molesta.** No bloquea el uso, pero es la única copia del insumo de una
decisión que escribe costos.

### Problema 3 — El total del listado cuenta dos veces el mismo producto

**Qué pasa.** La tapa del listado dice **"Ya se actualizaron 334 productos"**. El
número real de productos distintos que alguna vez se actualizaron es **279**.

**Cómo se comprobó.** La API del listado cuenta `ProductoBase` por importación
—o sea productos distintos, bien— y la pantalla SUMA esos números:
`items.reduce((n, i) => n + i.productosActualizados)`. Como la #4 volvió a tocar
productos que la #3 ya había tocado, esos se cuentan dos veces: 279 de la #3 más
55 de la #4 dan los 334 de la pantalla. Contra la base: 336 filas aplicadas, 279
productos distintos. Ninguno de los dos números es 334.

El propio comentario del código, tres líneas más arriba, dice "con 279 productos
ya actualizados": el que lo escribió tenía en la cabeza el número correcto.

**Gravedad: molesta.** Es el titular de la pantalla y va a seguir separándose de
la realidad con cada importación nueva.

### Problema 4 — Dos estados del enum que nadie produce

**Qué pasa.** El enum tiene `APLICADA` y `DESCARTADA`. Ninguna importación de
producción las tiene, y el circuito actual no las escribe: aplicar deja
`PARCIALMENTE_APLICADA`, cerrar deja `TERMINADA`, descartar deja `CANCELADA`.
`APLICADA` además aparece en una comparación de `finalizar/route.js` que por eso
no se puede alcanzar.

**Cómo se comprobó.** `SELECT estado, count(*)` en producción da solo CANCELADA,
TERMINADA y PARCIALMENTE_APLICADA. `git grep` muestra que `APLICADA` solo se lee,
nunca se escribe.

**Gravedad: cosmético**, con una advertencia: un estado que nadie produce es una
rama que nadie ejerce, y el repo ya se comió ese problema con
`ESTADO_LINEA.EXCLUIDO`, que estaba en el enum y nada lo escribía.

### Lo que se verificó y NO está roto

- **El estado terminal de una aplicada: ya está resuelto.** Era el problema
  principal del encargo y la medición lo desmiente. La #4
  (PARCIALMENTE_APLICADA) ofrece "Terminar importación" y "Cancelar importación",
  las dos visibles y habilitadas en los dos anchos; la #3 llegó a TERMINADA por
  ese camino. Lo trajo el commit `68cc4d16` ("TERMINADA cierra el trabajo sin
  cerrar la vuelta atrás") y está desplegado.
- **El botón de confirmar a 360 px**: no se corta. Medido sobre el detalle de #3 y
  #4 a 360: cero botones con su borde derecho fuera del viewport y cero píxeles
  de desborde horizontal.
- **Los contadores del detalle** cierran contra la base: los 279 "Actualizados"
  de la #3 son exactamente los productos distintos aplicados de esa importación.
- **Ningún 500, ninguna pantalla en blanco y ningún botón inalcanzable** en las
  cuatro pantallas, en los dos anchos. El único error de red es un 404 de
  `/favicon.ico`.

### Lo que NO se pudo probar, y hay que decirlo

**El recorrido de subir un Excel de verdad no se ejerció.** El repo no tiene
ningún archivo de prueba del formato Arcor —`git ls-files` filtrando por
`.xlsx/.xls/.csv` devuelve solo `public/templates/import_productos.xlsx`, que es
la plantilla de otro módulo— y las importaciones de producción no guardaron el
suyo, que es justamente el problema 2. Así que de la cadena completa quedaron sin
recorrer: subir archivo, conciliar de cero y confirmar lecturas sobre filas
nuevas. Lo que sí se recorrió es el resultado de esas etapas sobre datos reales:
917 y 972 filas ya conciliadas.

Esto es una consecuencia directa del problema 2 y es el motivo por el que la
tanda 1 del plan es la del archivo: **hasta que no se guarde uno, no hay forma de
volver a ejercer el circuito completo con datos verdaderos.**

---

## 5 · Evaluación de uso

El usuario no es técnico, trabaja en un Sunmi de 360 px y va a subir **más de
diez listas por día** entre Emanuel y los locales. Todo lo de abajo se mira con
ese usuario en la cabeza, no con el de escritorio.

Cada punto dice **cómo se midió**. Donde dice *pendiente*, es de lo que quedó
bloqueado por haber corrido esto en el VPS.

### 5.1 · Cuántos toques lleva la tarea típica

La tarea típica es "subir una lista y aplicar lo que está bien". Contado
**leyendo las tres pantallas**, sin ninguna fila que decidir, el camino más corto
es: Compras → Listas → Nueva importación → elegir proveedor → elegir archivo →
Importar → esperar → Aplicar → confirmar → Terminar → confirmar.

Son **cinco pantallas** —listado, nueva, detalle, y dos confirmaciones— y del
orden de **diez toques**, de los cuales dos son confirmaciones de "¿seguro?".

*Pendiente de confirmar con cronómetro en el recorrido real*, junto con lo que
más importa y no se puede deducir del código: **cuánto tarda la conciliación de
917 filas**. Ese tiempo es el que decide si diez listas por día son media hora o
son la mañana entera, y hoy no lo sabemos.

### 5.2 · Pantalla por pantalla

**El listado.** Se entiende. Dice qué es el módulo y tiene un botón grande de
"Nueva importación". Dos problemas, los dos medidos leyendo la pantalla: el
titular miente —problema 3— y **no hay ninguna forma de buscar**. El único
control es una casilla "Ver también las canceladas", y la casilla mide **14 × 14
píxeles** (`h-4 w-4`, y en este proyecto `1rem` son 14 px). En un Sunmi eso es un
blanco que se falla.

**Nueva importación.** Se entiende lo importante —"No se modifica ningún precio
todavía"— pero pide dos números que un usuario no técnico no sabe contestar:
"Recargo que se aplica" (viene en 5,00 %) y **"Umbral de variación"**. El segundo
es jerga: no dice qué pasa si lo sube o lo baja.

**El detalle.** Es la pantalla del trabajo y es la más cargada: a 360 px muestra
**siete tarjetas de números** —listos, necesitan que decidas, actualizados, sin
código guardado, con código pero la lista no lo trajo, discontinuados— antes de
llegar a nada que se pueda hacer. El encabezado de una terminada miente
(problema 1).

**El panel de decisión**, que es donde se resuelve fila por fila, es el peor y
está en 5.3.

### 5.3 · Las decisiones que el módulo le pide al usuario

**Cuántas.** Sobre la lista real de agosto —la importación #4, 972 filas— el
sistema resolvió solo casi todo y dejó **230 filas "necesitan que decidas"**
contra **1 sola lista para aplicar**. En la #3, con 917 filas, dejó 1. Medido
leyendo la pantalla de detalle de cada una contra la copia de producción.

Doscientas treinta decisiones es el número que define este módulo. Todo lo demás
del plan es chico al lado.

**Si se pueden resolver desde el celular.** Se pueden tocar, pero el texto está
escrito para alguien que conoce el dominio. Estas son cadenas reales que el
usuario ve, sacadas del código:

- `UxBU 12 · dato logístico` — en el panel de decisión y en las piezas de la
  lista. "UxBU" no se explica en ninguna parte.
- `· factor 6` — al vincular un producto.
- `"Precio del bulto"` y `"Precio del display"` como las dos opciones entre las
  que hay que elegir. Un display no es una palabra del mostrador.
- `"gramaje, factor o variación alta"` como explicación de por qué una fila tiene
  alerta.
- `Macheo`, `macheo` — el panel se llama así.
- El buscador de productos dice `"Buscar por nombre, SKU o código de barras"`.

Son seis términos que el usuario no puede contestar sin que alguien se los
explique, y aparecen justo en la pantalla donde tiene que tomar 230 decisiones.

**Cuánto llevaría.** *Pendiente de cronometrar.* Lo que sí se puede afirmar sin
cronómetro: aunque cada decisión llevara diez segundos —optimista, porque hay que
leer dos precios y elegir—, 230 filas son **cerca de 40 minutos de una sola
lista**, en un teléfono, tocando de a una. Con diez listas por día eso no cierra.

### 5.4 · El listado con diez listas por día

**No se sostiene, y no hace falta esperar a tener cien para saberlo.** La pantalla
no tiene buscador, no tiene filtro por proveedor y no tiene filtro por estado: lo
único que ofrece es paginación y la casilla de canceladas. Medido leyendo
`app/modulos/proveedores/listas/page.jsx`: el único `input` de la pantalla es esa
casilla.

Con diez por día, al tercer día la lista de ayer del mismo proveedor ya está en
la página dos. La forma de encontrarla es acordarse de la fecha y paginar.

### 5.5 · Frontend

Medido con `node scripts/hardcodeo.mjs --ficha proveedores`, que es la
herramienta del repo:

- **398 hallazgos en 24 archivos.** Los que importan: **27 `<button>` crudos**
  donde va `SunmiButton`, **8 `<input>` crudos** donde va `SunmiInput`, y **39
  `<td>` escritos a mano** donde va `SunmiTable`. Buena parte cae justo en las
  pantallas de listas: el detalle, la nueva y el listado aparecen nombrados con
  línea y todo.
- **Un color fijo** fuera de los tokens del tema, en un modal de proveedores.
- **Errores en consola: ninguno.** En las cuatro pantallas, a 360 y a 1366, el
  único error de red es un 404 de `/favicon.ico`.
- **Tamaños de toque:** el único medido es la casilla de canceladas, 14 × 14 px,
  muy por debajo de lo que se puede tocar con el pulgar. El resto *pendiente*.
- **Contraste:** *pendiente*, necesita el navegador con la hoja real.

---

## 6 · Veredicto

**¿Cumple su finalidad?** Sí. El motor anda: concilia 917 filas, propone costos,
no escribe nada hasta que alguien aplica, deja aplicar por tandas, y se puede
deshacer. Los números de la pantalla de detalle cierran contra la base. Eso es lo
difícil y está hecho.

**¿Es fácil de usar para el usuario descrito?** **No.** Por tres motivos, en
orden de peso:

1. **Le pide 230 decisiones por lista, de a una, en un teléfono.** Con diez
   listas por día el trabajo no entra en el día. Este solo motivo alcanza.
2. **Esas decisiones están escritas en un idioma que ese usuario no habla**:
   UxBU, factor, display, macheo, gramaje. No es que estén mal explicadas: no
   están explicadas.
3. **El listado deja de servir a la semana**, porque no se puede buscar.

Nada de esto es un defecto de programación: el módulo hace lo que dice. Es que
está diseñado para alguien que entiende el dominio del proveedor, y el que lo va
a usar no es esa persona.

Por eso el plan cambia de forma: las tres tandas técnicas siguen, pero **el grueso
del trabajo pasa a ser de uso**, y va antes de cualquier higiene.

---

## 7 · El plan

Siete tandas. Las tres primeras son las técnicas del relevamiento anterior y
quedan en ese orden; después van las de uso, que son las que deciden si el
módulo sirve. **La tanda de sacar los dos estados del enum sale del plan** y pasa
al roadmap como higiene: no arregla nada que se note, es la única que necesita
migración, y no corresponde gastar un corte de producción en ella mientras el
usuario no pueda terminar una lista.

### Tanda 1 — Guardar el archivo original, siempre

**Qué se hace.** El Excel se guarda en disco al importar y `archivoUbicacion`
deja de ser `null`. Sin retención corta: se guardan todos y no se borran solos.

**Decisión tomada:** se reusa `lib/compras-proveedor/comprobante/almacenDisco.js`,
que ya resuelve lo difícil —centinela para no escribir en un volumen sin montar,
aviso al arrancar sin tumbar la aplicación, y `exigirAlmacen()` antes de cada
escritura— en vez de escribir un segundo almacén al lado. Hace falta
generalizarlo para que acepte otra variable de ruta además de
`COMPROBANTES_VOLUMEN_PATH`, que hoy está fija adentro del archivo.

**Archivos.** `lib/compras-proveedor/comprobante/almacenDisco.js`, un
`lib/proveedores/listas/almacenArchivo.js` fino que lo use,
`app/api/proveedores/listas/importar/route.js`, `docker-compose.prod.yml` (un
volumen `erpazul_listas`) y el comentario del schema, que hoy afirma algo que
dejó de ser cierto.

**Migración: no.** La columna existe y es nullable.

**Cómo se prueba.** Candados sobre el almacén parametrizado, con la contraprueba
de que sin volumen montado la importación FALLA en vez de guardar a medias. Y el
circuito completo en el navegador contra `erpazul_al`, **en la máquina de
desarrollo**, con el Excel de `erpazul-fixtures-dev`.

### Tanda 2 — Que la pantalla no diga que hay trabajo cuando está cerrado

**Qué se hace.** El encabezado del detalle y las tarjetas de arriba dejan de
hablar de trabajo pendiente cuando la importación no está abierta.

**Decisión tomada:** la pregunta "¿esta importación acepta trabajo?" ya la
contesta `esImportacionAbierta` en `persistencia.js`, y es esa la que manda. El
texto se arma en una función con candados, no adentro del JSX.

**Cómo queda la pantalla.** Una importación terminada abre diciendo, en texto
normal y sin color de alerta, qué pasó: cuántos productos se actualizaron y
cuántas filas quedaron sin resolver, en pasado. La tarjeta "Listos para aplicar"
no se resalta ni invita a nada. Lo único que se ofrece es ver el reporte o
deshacer.

**Archivos.** `app/modulos/proveedores/listas/[id]/page.jsx` y una función nueva
en `lib/proveedores/listas/` con su candado. **Migración: no.**

**Cómo se prueba.** Candados sobre el texto para los cinco estados que el
circuito produce, y el detalle de una TERMINADA y una PARCIALMENTE_APLICADA a
360 y 1366.

### Tanda 3 — Que el total del listado sea el número real

**Qué se hace.** La tapa deja de sumar los conteos por importación y pasa a
contar productos distintos una sola vez.

**Decisión tomada:** el conteo se hace en el servidor, en la misma consulta que
ya cuenta por importación. La pantalla no puede saber qué productos se repiten
entre dos listas: solo recibe números.

**Archivos.** `app/api/proveedores/listas/route.js` y
`app/modulos/proveedores/listas/page.jsx`. **Migración: no.**

**Cómo se prueba.** Contra una copia de producción, donde la respuesta correcta
se conoce: 279. Más un candado con dos importaciones que comparten productos.

### Tanda 4 — El idioma: sacar la jerga de las pantallas

**Qué se hace.** Se traducen los seis términos que el usuario no puede contestar.
Es la tanda más barata del plan y la que más cambia la experiencia, porque sin
ella las 230 decisiones no se pueden tomar aunque la pantalla sea cómoda.

**Decisión tomada, término por término:**

- `UxBU 12 · dato logístico` → **"vienen 12 por bulto"**.
- `factor 6` → **"1 bulto = 6 unidades"**.
- `"Precio del bulto"` / `"Precio del display"` → **"Precio del bulto (12 u.)"**
  y **"Precio de la caja chica (3 u.)"**, con la cantidad real adentro del
  rótulo: lo que hace entendible la opción no es el nombre, es el número.
- `Macheo` → **"Coincidencias"**.
- `"gramaje, factor o variación alta"` → **"el peso, la cantidad por bulto o un
  salto de precio grande"**.
- `"Umbral de variación"` → **"Avisame si un costo sube más de X %"**.

Los textos van en un módulo de `lib/proveedores/listas/` con candados, no
sueltos en el JSX: son decisiones de redacción y se van a querer ajustar.

**Archivos.** `components/proveedores/listas/PanelDecision.jsx`,
`PiezasListas.jsx`, `PanelVincular.jsx`, `PanelAplicar.jsx`, `PanelMacheo.jsx`,
`app/modulos/proveedores/listas/nueva/page.jsx`, y el módulo de textos nuevo.
**Migración: no.**

**Cómo se prueba.** Un candado que recorre las pantallas del módulo y se pone
rojo si vuelve a aparecer alguno de los seis términos en texto visible. Es el
mismo mecanismo del trinquete: lo que no se mide, vuelve.

### Tanda 5 — La cola de decisiones, pensada para el pulgar

**Qué se hace.** Es la tanda grande y la que define si el módulo sirve. Hoy 230
decisiones se toman de a una, abriendo un panel por fila, dentro de una pantalla
que además muestra siete tarjetas de números.

**Decisión tomada:** una **cola a pantalla completa**. Se entra una vez —"Resolvé
las 230"— y a partir de ahí cada fila ocupa la pantalla entera: arriba el
producto y lo que trajo la lista, en el medio las dos o tres opciones como
botones grandes con su precio adentro, y abajo "Saltear". Al elegir, pasa sola a
la siguiente. Un contador arriba dice "12 de 230". Se puede salir cuando sea y al
volver retoma donde estaba.

**Y la decisión que más tiempo ahorra: resolver en lote lo que se repite.** Antes
de la cola, la pantalla agrupa las filas que tienen la misma forma de duda —el
mismo multiplicador, el mismo tipo de alerta— y ofrece resolverlas juntas: "138
filas vienen por bulto de 12 · aplicar a todas". Lo que quede sin agrupar va a la
cola de a una. Esto sale de los datos, no de una idea: de las 230 de la #4, hay
que medir cuántas comparten forma, y ese conteo es el primer paso de la tanda.

**Archivos.** Una pantalla nueva bajo
`app/modulos/proveedores/listas/[id]/decidir/`, `PanelDecision.jsx` como pieza
reusada adentro, y una función de agrupamiento en `lib/proveedores/listas/` con
sus candados. **Migración: no** — lo que se guarda por fila ya existe.

**Cómo se prueba.** El conteo de grupos sobre las 230 filas reales de la #4,
antes y después. Y el recorrido completo a 360 px en la máquina de desarrollo:
entrar a la cola, resolver un lote, resolver tres de a una, salir, volver y
comprobar que retomó donde estaba.

### Tanda 6 — El listado con diez listas por día

**Qué se hace.** Buscador y filtros, y que cada tarjeta diga qué falta hacer.

**Decisión tomada:** un campo de búsqueda por proveedor arriba de todo —que es
como se busca, por proveedor y no por fecha—, un filtro de estado con tres
opciones visibles como chips ("Abiertas", "Terminadas", "Canceladas") en vez de
la casilla de 14 píxeles, y que la tarjeta de cada importación diga en una línea
qué le falta: "230 esperando que decidas" o "terminada, 279 actualizados". Por
defecto se abren las abiertas, que es lo que se va a buscar nueve de cada diez
veces.

**Archivos.** `app/modulos/proveedores/listas/page.jsx` y
`app/api/proveedores/listas/route.js` (filtro por proveedor y por estado en la
consulta, no en el navegador). **Migración: no.**

**Cómo se prueba.** Con las cuatro importaciones de la copia de producción, que
alcanzan para ejercer los tres filtros, y midiendo que los chips tengan un blanco
tocable a 360.

### Tanda 7 — Pasar las pantallas del módulo al kit

**Qué se hace.** Los 27 `<button>`, los 8 `<input>` y los 39 `<td>` crudos pasan a
las piezas del kit.

**Decisión tomada:** va **última**, y no porque no importe: tocar 74 lugares de
las mismas pantallas que las tandas 2, 4, 5 y 6 van a reescribir es trabajo
tirado. Se hace cuando el dibujo esté decidido, y ahí se hace de una.

**Archivos.** Los del módulo. **Migración: no.**

**Cómo se prueba.** El trinquete tiene que BAJAR, y la pantalla tiene que quedar
idéntica, comparada con capturas antes y después.

### Fuera del plan: sacar los dos estados del enum

`APLICADA` y `DESCARTADA` están en el enum y ninguna importación de producción
las tiene. **Se anota como higiene en el roadmap y no entra en este plan**,
porque no arregla nada que el usuario note y es la única que necesita migración
—recortar un enum de Postgres no es aditivo— y por lo tanto su propio corte de
producción. Cuando se haga, primero se vuelve a contar en producción que sigan en
cero, porque el relevamiento tiene fecha.

---

## 8 · Preguntas para Emanuel

Dos, y las dos son de negocio. Van con recomendación para que alcance con decir
que sí.

**1 · ¿Cuánto vale tu tiempo contra la precisión, en las filas que el sistema no
puede resolver solo?** Si alguna vez preferís "aplicá lo que estás casi seguro y
mostrame después qué hiciste" antes que decidir 230 veces, el módulo puede
resolver en lote mucho más de lo que resuelve hoy. *Recomendación: dejarlo como
está por ahora —el sistema solo aplica lo que está seguro— y decidir esto recién
cuando la tanda 5 mida cuántas de las 230 se pueden agrupar. Si se agrupan en
diez o quince lotes, esta pregunta se cae sola.*

**2 · "Precio de la caja chica": ¿es la palabra que usás?** Hoy la pantalla dice
"display", que es la del proveedor. Necesito el nombre que usan en el mostrador
para el paquete intermedio —el que no es bulto ni unidad—. *Recomendación: si no
hay un nombre propio, va "Precio del paquete de 3", con la cantidad adentro; el
número se entiende siempre y el nombre no.*

Nada más. Todo lo demás se resolvió midiendo o leyendo el repo.
