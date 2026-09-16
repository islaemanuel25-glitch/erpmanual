# Plan: Compras → Listas de proveedor

**Relevado el 2026-09-16 contra `a2361da0`**, que es el commit que corría en
producción ese día. Tanda de SOLO LECTURA: no se modificó código, ni base, ni
migraciones. Lo único que se escribió es este documento.

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

## 5 · El plan

### Tanda 1 — Guardar el archivo original, siempre

**Qué se hace.** El Excel se guarda en disco al importar y `archivoUbicacion`
deja de ser `null`. Sin retención corta: se guardan todos y no se borran solos.

**Decisión tomada:** se reusa `lib/compras-proveedor/comprobante/almacenDisco.js`,
que ya resuelve lo difícil —centinela para no escribir en un volumen sin montar,
aviso al arrancar sin tumbar la aplicación, y `exigirAlmacen()` antes de cada
escritura— en vez de escribir un segundo almacén al lado. Lo que hace falta es
generalizarlo para que acepte otra variable de ruta además de
`COMPROBANTES_VOLUMEN_PATH`; hoy esa constante está fija adentro del archivo.

**Archivos.** `lib/compras-proveedor/comprobante/almacenDisco.js` (parametrizar la
variable de ruta), un `lib/proveedores/listas/almacenArchivo.js` fino que lo use,
`app/api/proveedores/listas/importar/route.js` (escribir el binario y guardar la
ruta), `docker-compose.prod.yml` (un volumen `erpazul_listas`), y el comentario
del schema, que hoy afirma algo que dejó de ser cierto.

**Migración: no.** La columna ya existe y es nullable.

**Cómo se prueba.** Candados sobre el almacén parametrizado, incluida la
contraprueba de que sin volumen montado la importación FALLA en vez de guardar a
medias. Y el circuito completo en el navegador contra una copia de producción:
subir un Excel, comprobar que el archivo quedó en el volumen y que la fila lo
apunta. Ese mismo Excel queda como insumo para poder ejercer la conciliación de
cero, que hoy no se puede.

### Tanda 2 — Que la pantalla no diga que hay trabajo cuando está cerrado

**Qué se hace.** El encabezado del detalle y las tarjetas de arriba dejan de
hablar de trabajo pendiente cuando la importación no está abierta. Una TERMINADA
dice qué quedó sin aplicar, en pasado y sin llamar a la acción.

**Decisión tomada:** la pantalla no decide esto por su cuenta. La pregunta
"¿esta importación acepta trabajo?" ya está contestada por `esImportacionAbierta`
en `persistencia.js`, y es esa la que manda. El texto se arma en una función con
candados, no adentro del JSX.

**Archivos.** `app/modulos/proveedores/listas/[id]/page.jsx` y una función nueva
en `lib/proveedores/listas/` para el texto del encabezado, con su candado.

**Migración: no.**

**Cómo se prueba.** Candados sobre el texto para los cinco estados que el circuito
produce. Y capturas del detalle de una TERMINADA y de una PARCIALMENTE_APLICADA a
360 y 1366, contra la copia de producción, comprobando que la primera no invita a
aplicar nada.

### Tanda 3 — Que el total del listado sea el número real

**Qué se hace.** La tapa deja de sumar los conteos por importación y pasa a contar
productos distintos una sola vez.

**Decisión tomada:** el conteo se hace en el servidor, en la misma consulta que ya
cuenta por importación, y no sumando en el navegador. La pantalla no puede saber
qué productos se repiten entre dos importaciones: solo recibe números.

**Archivos.** `app/api/proveedores/listas/route.js` (un conteo global además de
los por importación) y `app/modulos/proveedores/listas/page.jsx` (mostrarlo en vez
de sumar).

**Migración: no.**

**Cómo se prueba.** Contra la copia de producción, donde la respuesta correcta se
conoce: 279. Candado sobre el armado del número con dos importaciones que
comparten productos, que es el caso que hoy da mal.

### Tanda 4 — Sacar del enum lo que nadie produce

**Qué se hace.** Se sacan `APLICADA` y `DESCARTADA`, y con ellos la comparación
inalcanzable de `finalizar/route.js`.

**Decisión tomada:** se hace ÚLTIMA y sola. Un enum de Postgres no se recorta
sin migración, y es la única tanda del plan que toca la base: conviene que salga
cuando las otras tres ya estén andando. Antes de sacarlos se vuelve a contar en
producción que sigan en cero, porque el relevamiento tiene fecha.

**Archivos.** `prisma/schema.prisma`, `lib/proveedores/listas/persistencia.js`,
`app/api/proveedores/listas/[id]/finalizar/route.js` y una migración.

**Migración: SÍ**, y es de las que el clasificador va a marcar: recortar un enum
no es aditivo. Va con el procedimiento de `/deploy` y su autorización explícita.

**Cómo se prueba.** El conteo por estado en producción antes y después, y la suite
completa. Si aparece aunque sea una fila con esos estados, la tanda se frena y se
informa.

### Orden y por qué

Primero el archivo, porque sin él no se puede volver a ejercer el circuito
completo y las tandas que siguen se prueban a medias. Después las dos de
pantalla, que son las que se ven todos los días y no tocan la base. La del enum
al final, sola, porque es la única con migración y la única que no arregla nada
que se note: ordena.

---

## 6 · Preguntas para Emanuel

**Ninguna.** Todo lo que había que decidir se resolvió leyendo el repo o midiendo:
dónde guardar el archivo —el volumen que ya existe—, qué número es el correcto
para la tapa —279, y lo confirma el comentario del propio código—, y qué estados
sobran —los que producción no tiene—. Lo de guardar siempre el archivo, sin
retención corta, ya venía decidido en el encargo.

Lo único que conviene que sepas, y no es una pregunta: **el problema más grave que
se sospechaba ya está arreglado y desplegado.** Una importación aplicada sí se
puede terminar y cancelar; la #3 ya está cerrada por ese camino. Lo que queda es
más chico de lo que parecía.
