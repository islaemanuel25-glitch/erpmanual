# Plan: Compras → Listas de proveedor

**Rehecho el 2026-09-16 contra `df2a43d1`**, que es el HEAD de la rama
`claude/listas-proveedor-plan-fxlyvk`. El módulo en sí está idéntico a lo que
corre en producción: `git log a2361da0..HEAD` sobre las cuatro carpetas del
módulo devuelve vacío, así que todo lo medido acá describe lo que Emanuel tiene
hoy en el teléfono.

Tanda de SOLO LECTURA sobre el código: no se modificó ni una línea de `app/`,
`lib/` ni `components/`. Lo único que se escribió en el repo es este documento.

---

## 0 · Dónde se hizo esto y con qué datos

**Máquina: `vm`, un contenedor aislado en la nube.** No es la PC de desarrollo y
no es el VPS. Lo primero que se hizo fue comprobarlo, que es lo que pide el
CLAUDE.md desde el episodio del 2026-09-16.

Qué permite: PostgreSQL 16 local, Node 22, Chromium con Playwright, y salida
HTTPS a internet por un proxy. **No tiene cliente ssh**, así que desde acá no hay
ninguna ruta a la máquina de desarrollo ni al VPS. Lo único que se pudo tocar de
producción fue `https://operix.cloud/api/version`, que contestó `a2361da0` y sirve
para fechar contra qué se compara.

Lo que se levantó: base `erpazul_al` vacía, las 15 migraciones aplicadas, el seed
del proyecto, y `next dev` en el puerto 3000. Todo el recorrido se hizo con sesión
real contra `/api/login` —no se firmaron cookies— y con el contexto fijado como lo
fija el selector de la interfaz.

**Un apunte sobre la guardia de migraciones**, porque conviene que quede escrito:
`npx prisma migrate deploy` lo frena el hook `scripts/hook-guardia-migraciones.mjs`,
que intenta leer por ssh la imagen del contenedor de producción para clasificar
qué migraciones entran. Acá no hay ssh, así que la guardia no pudo mirar y —bien—
denegó. Se corrió con `DEPLOY_MIGRACION_AUTORIZADA=1`, que es la autorización
explícita que el propio hook documenta, porque el riesgo que vigila —esquema nuevo
con código viejo atendiendo— no puede existir sobre una base creada vacía tres
minutos antes en una máquina sin producción a la vista. Queda dicho en vez de
hecho en silencio.

### El Excel: el hash NO coincide, y se sabe por qué

El archivo que adjuntó Emanuel da **SHA-256 `76c9a3b6…` y 73.083 bytes**. El
pedido esperaba `d0d283f2…` y 69.742 bytes. **No es el mismo archivo.**

Y hay una explicación que cierra sola: este archivo tiene **972 filas de
producto**, contadas por el parser del proyecto. La importación #3 de producción
—la del hash esperado— tiene 917 filas y la #4 tiene 972, según el relevamiento
anterior, que sí pudo leer producción. Así que lo más probable
es que este sea **el archivo de la importación #4**, no el de la #3. No se puede
confirmar sin el hash de la #4, que vive en la base de producción.

Todo lo que dice este documento sobre "la lista de agosto" sale de este archivo,
y donde el número dependa de cuál de las dos importaciones sea, está dicho.

Lo que trae el archivo, leído con el parser del repo:

- **972 filas de producto** en una sola hoja, más 81 renglones que son cabeceras
  de rubro y no productos. Son 1.053 renglones de datos en total, y los 972 salen
  del parser del repo, no de contarlos a ojo: 942 traen el código como número y
  30 lo traen como texto.
- Columnas: Producto, Descripción, U.M., UxBU, Precio S/IVA, Precio C/IVA.
- **El IVA es 21 % parejo en las 942 filas con código numérico**: `Precio C/IVA`
  dividido `Precio S/IVA` da 1,2100 en todas, sin una sola excepción.
- **La columna U.M. dice en qué unidad cotiza cada fila**: 656 dicen `UN`
  (unidad), **250 dicen `DI` (display)** y 36 dicen `BU` (bulto). Este dato es el
  centro de todo lo que sigue.
- 48 valores distintos de UxBU. Los más frecuentes: 12 (226 filas), 24 (115),
  6 (78), 36 (54), 48 (40).
- Ningún código repetido.
- **30 filas traen código alfanumérico** —`ASH2`, `SW904`, `AG10747`,
  `HELIMPFEB`— y no numérico. Son reales y el parser las lee bien.

### Los datos reales de producción: NO se pudieron traer

**Y es la única parte del encargo que quedó sin hacer.** El motivo está en la
sección 7, con la orden exacta para destrabarlo.

En su lugar se armó un **catálogo de desarrollo** que existe por una sola razón:
sin productos vinculados al proveedor, la conciliación deja las 972 filas en "sin
vincular" y no se puede apretar Aplicar, ni Revertir, ni Terminar — o sea que el
recorrido pedido no se puede recorrer.

La **estructura** de ese catálogo es real: código interno, descripción, UxBU y
unidad comercial salen fila por fila del Excel. **Lo único inventado es el costo
anterior**, y se inventó de la forma más obvia posible a propósito: todos los
productos arrancan con un costo tal que el aumento contra la lista nueva da
**exactamente 6,5 %, parejo**. Uniforme y no variado, justamente para que no se
pueda confundir con una medición: una distribución con forma se leería como "así
se mueven los precios de Arcor" y sería mentira; un único valor no engaña a nadie.

**Regla que se siguió sin excepción en todo el documento: de ese catálogo se
informan tiempos y recorrido, nunca conteos de decisiones.** Cada número de abajo
dice de dónde sale.

---

## 1 · La regla nueva, que es el centro del plan

Emanuel la dijo el 16/9 y cambia el eje del módulo. Antes de nada, lo que ya
existe en el código y lo que falta, porque la diferencia es más chica de lo que
parece.

### Lo que ya está construido

El motor **ya calcula las lecturas posibles de cada fila**. Para una fila de
display, `hipotesisDeCosto` en `lib/proveedores/listas/confirmarPresentacion.js:224`
devuelve dos: el precio sin multiplicar, y el precio por el `factor_pack` del
producto. Y el panel **ya las muestra las dos con su porcentaje**. Esto es texto
literal de la pantalla, sacado del recorrido real sobre la fila 837:

  *Sin multiplicar · $ 4.559,92 + 5 % recargo · +6.5 % · Aumento bajo*
  *Precio del display × 16 · $ 4.559,92 × 16 = $ 72.958,66 · +1604.0 % · Aumento alto*

O sea: la aritmética de la regla de Emanuel **ya corre**. Lo que falta es el
criterio con el que se elige.

### Lo que hay que cambiar, y es una sola frase

Hoy el criterio está en `recomendarHipotesis`, en
`lib/proveedores/listas/rangoAumento.js`, y su propio comentario lo dice con todas
las letras:

  *"El porcentaje descarta lo imposible; NO elige entre lo posible. Un 5 % contra
  un 12 % son las dos creíbles y ahí no se recomienda nada, aunque una caiga
  dentro del rango y la otra no."*

**Eso es exactamente lo que Emanuel pidió que deje de pasar.** Hoy el filtro es
"no absurda" —más de +200 % o menos de −66 %—; la regla nueva es "cae dentro del
rango". Una línea de criterio, no un motor nuevo.

### Y un resultado que hay que saber antes de diseñar nada

**El caso "caen varias lecturas dentro del rango" es aritméticamente imposible
para los tres rangos que se pidieron.** No es una observación empírica: sale de la
cuenta.

Dos lecturas de la misma fila son el mismo precio multiplicado por
multiplicadores distintos, así que una es la otra por un factor de al menos 2.
Para que las dos caigan en un rango de mínimo a máximo, el cociente entre el tope
y el piso del rango tiene que ser mayor que ese factor. Con 5 % a 8 % ese cociente
es 1,029; con 0 % a 10 % es 1,10; con 3 % a 15 % es 1,117. Ninguno llega a 2.

**Consecuencia para el diseño: la regla se reduce a una sola pregunta.** Si hay
exactamente una lectura dentro del rango, el sistema la toma. Si no hay ninguna,
avisa. "Elegí entre estas dos" no va a pasar nunca, y la pantalla no tiene que
saber dibujarlo.

### El caso que la regla no puede resolver, y también hay que saberlo

**Las filas `BU` tienen UNA sola lectura posible.** El precio del bulto no se
multiplica por nada: `resolverCostoMaestro` en
`lib/proveedores/listas/configuraciones/arcor.js` lo dice y tiene razón. En este
archivo son **36 filas**.

Para esas, "¿cuál de las lecturas es?" no tiene sentido: si el único costo posible
queda fuera del rango, no hay nada entre qué elegir. Lo que corresponde es
**marcarlas para revisar** —que es lo que Emanuel dijo— y no preguntar cuál es.

Lo mismo pasa con cualquier fila `DI` cuyo `factor_pack` del ERP no coincida con
el UxBU del archivo: `armadoConfirmadoPorElArchivo` no ofrece la segunda lectura,
porque un `factor_pack` mal cargado no puede colarse adentro de una tarjeta que se
ve razonable. **Cuántas son eso en producción es uno de los números bloqueados.**

### Los impuestos de la lista: cómo se tratan HOY

**Se toma `Precio C/IVA` como el precio y listo.** `CONFIG_ARCOR.precioBase` vale
`"precioConIva"`, el recargo comercial del 5 % se aplica sobre él, y ese es el
costo. `Precio S/IVA` se lee y se guarda en la columna `precioSinIva`, pero
**ningún cálculo lo usa**.

Y de impuestos adicionales **no hay absolutamente nada**: `git grep` de
`impuesto`, `percepcion`, `ingresosBrutos` y `receta` sobre las cuatro carpetas
del módulo no devuelve una sola línea. Las recetas de impuestos que sí existen
—`RecetaProveedor`, `RecetaLecturaProveedor`— son del módulo de comprobantes y no
las mira nadie desde acá.

O sea que lo que pide Emanuel —"impuestos adicionales a los de la lista, cuánto, y
si van por unidad o por pack"— **no existe ni a medias**. Es construcción nueva, y
por eso tiene su propia tanda con su migración.

---

## 2 · Cómo funciona hoy, en criollo

El proveedor manda un Excel. El módulo lo lee, lo compara contra los productos que
ya tenemos de ese proveedor y propone un costo nuevo para cada uno. **Nada se
escribe hasta que alguien aprieta Aplicar y tilda una casilla.**

El recorrido es: subir el archivo, el sistema concilia solo, una persona resuelve
lo que el sistema no pudo, y después se aplica por tandas. Aplicar no cierra la
importación: la deja abierta. Al final se la termina a mano, o se la cancela.

Se puede deshacer: cada fila guarda el costo que el producto tenía justo antes de
escribir, y revertir lo restaura.

**Lo que anda bien, comprobado ejerciéndolo y no leyéndolo:**

- La conciliación de 972 filas tarda **3,45 segundos**.
- Aplicar 692 filas tarda **12,5 segundos**, escribe los 692 costos y recalcula
  las ventas por margen.
- Deshacer **restaura los 692 costos**: comprobado contra la base, los 692
  productos volvieron exactamente a su `costoPrevioAplicacion`.
- **Cero desborde horizontal** en las cinco pantallas, a 360 y a 1366.
- **Cero errores de consola propios.** Los únicos que aparecen son un 404 de
  favicon y siete fallas de certificado al bajar la tipografía de Google, que son
  del proxy de esta máquina aislada y no de la aplicación.
- **Contraste en tema oscuro: un solo hallazgo en todo el módulo**, y está en el
  encabezado global, no acá.

Eso es lo difícil y está hecho. Lo que sigue es lo que no.

---

## 3 · Los números

### 3.1 · Lo que la conciliación deja para decidir, HOY

Medido sobre la importación de este Excel, conciliada de cero, contra la base:

- **972 filas** en total.
- **692 listas para actualizar.**
- **250 con "Revisar armado"**, todas con el mismo motivo:
  `DISPLAY_SIN_EQUIVALENCIA`.
- 30 sin vincular. **Ese 30 es artefacto del catálogo de desarrollo**, que no
  incluyó las filas de código alfanumérico. No se informa como comportamiento del
  módulo.

**Y acá está el hallazgo que reordena el plan entero: las 250 filas que el sistema
no puede resolver son EXACTAMENTE las 250 filas `DI` del archivo.** Ni una más ni
una menos, comprobado cruzando el estado de la fila contra su unidad comercial.

Esto **no depende del catálogo**, y es lo que lo hace fuerte: `resolverCostoMaestro`
rechaza toda fila `DI` antes de mirar un solo costo, porque
`CONFIG_ARCOR.equivalenciaDisplay` vale `null`. Sea cual sea el catálogo, sean
cuales sean los precios, **las 250 filas de display van a la cola de decisiones
siempre**.

El relevamiento anterior había medido 230 decisiones sobre la #4 de producción y
las había tratado como un problema de volumen. No lo es: **es un problema de una
sola regla ausente**, y es la que Emanuel acaba de definir.

### 3.2 · La simulación de la regla nueva

Se escribió un simulador aparte —fuera de `app/` y de `lib/`, sin commitear— que
calcula para cada fila todas las lecturas posibles con el mismo módulo que usa la
pantalla, y cuenta cuántas caen dentro del rango.

**Corre punta a punta y está listo para el día que lleguen los datos de
producción.** Sobre el catálogo de desarrollo, con los tres rangos pedidos —5 % a
8 %, 0 % a 10 % y 3 % a 15 %— da 942 filas resueltas solas y cero preguntas, en
los tres.

**Ese resultado no significa nada y no se informa como medición**: el catálogo se
construyó con un aumento uniforme de 6,5 %, que cae dentro de los tres rangos. Lo
único que prueba es que la cadena completa corre.

Lo que sí vale es la **contraprueba**, que se hizo justamente para que el
simulador no fuera uno de esos candados que están siempre en verde: con un rango
de 10 % a 20 % —que excluye el 6,5 % por construcción— el simulador da **cero
resueltas, 942 preguntas y 76 grupos**, agrupados por unidad y por los
multiplicadores en juego: 116 filas `DI` con lecturas ×1/×12, 106 `UN` con
×1/×12, 95 `UN` con ×1/×24, 36 `BU` con una sola lectura. Sabe dar distinto de
cero y sabe agrupar.

**Y esa contraprueba dejó al descubierto algo que no se estaba buscando: el rango
por defecto de hoy es 10 % a 20 %** —`RANGO_POR_DEFECTO` en
`lib/proveedores/listas/rangoAumento.js:82`—. Si los aumentos reales andan por el
5 % a 8 % que nombró Emanuel, **el rango que el código trae de fábrica los deja a
todos afuera** y los marca "aumento bajo". No es solo que esté fijo: es que el
valor fijo probablemente ya no sea el correcto. Es el argumento más fuerte a favor
de que sea editable por proveedor.

**Lo que queda bloqueado** es el único número que importa de esta sección: cuántas
filas quedan para preguntar con datos verdaderos. Necesita el costo actual real de
cada producto, y eso vive en producción. Sección 7.

### 3.3 · Tiempos, medidos con cronómetro

Todos sobre `next dev` en esta máquina, que es más lento que el build de
producción: tomarlos como techo, no como piso.

- **Importar y conciliar 972 filas: 3,45 segundos**, desde el clic en "Importar y
  conciliar" hasta que la pantalla de detalle terminó de cargar.
- **Aplicar 692 filas: 12,5 segundos**, desde el clic final hasta que la pantalla
  volvió a mostrar el resultado.
- **Deshacer 692 filas: unos 8 segundos.**

**Esto responde la pregunta que el plan anterior dejó abierta y que iba a decidir
el diseño: la conciliación NO es el cuello de botella.** Diez listas por día son
menos de un minuto de máquina en total. Todo el tiempo del usuario se va en las
decisiones y en la navegación, no en esperar.

### 3.4 · Toques de "subir y aplicar lo que está bien", a 360

Contados ejerciéndolo, no leyendo el código. Desde el listado:

1. "Nueva importación"
2. abrir el selector de proveedor
3. elegir Arcor
4. elegir el archivo
5. "Importar y conciliar"  → *3,45 s de espera*
6. "Aplicar los 684"
7. "Aplicar cambios"
8. **tildar la casilla de confirmación**
9. "Sí, aplicar 692 filas"  → *12,5 s de espera*
10. "Terminar importación"
11. confirmar Terminar

**Once toques y tres pantallas**, sin resolver ni una sola decisión. Con los 250
displays de por medio, hoy son once toques más doscientos cincuenta paneles.

Y dos cosas del camino que solo se ven recorriéndolo:

- **Entre el toque 6 y el 7 hay que hacer scroll**, y entre el 8 y el 9 también:
  el bloque "Confirmá antes de aplicar" aparece *debajo* del botón que lo abrió,
  con un resumen de siete renglones, y el botón que realmente aplica queda fuera
  de la pantalla.
- **El toque 8 es una casilla de 14 × 14 píxeles.** Es la única cosa que separa al
  usuario de escribir 692 costos, y es el blanco más chico de la pantalla.

### 3.5 · Los valores que hoy están fijos en el código

Con archivo y línea, que es lo que se pidió:

- **`lib/proveedores/listas/rangoAumento.js:82`** — `RANGO_POR_DEFECTO = { minPct:
  10, maxPct: 20 }`. El rango de aumento esperado. **Es el que Emanuel quiere
  editable por proveedor.**
- **`lib/proveedores/listas/configuraciones/arcor.js:181`** — `umbralVariacionPct:
  30`. El "umbral de variación alta". **Es el que la regla nueva reemplaza.**
- **`lib/proveedores/listas/configuraciones/arcor.js:178`** — `recargoPct: 5`. El
  recargo comercial. No lo nombró Emanuel, pero está fijo igual y se carga en cada
  importación desde acá.
- **`lib/proveedores/listas/configuraciones/arcor.js:184`** — `pisoPrecioCreible:
  1`. Debajo de ese importe un precio de lista deja de ser creíble.
- **`lib/proveedores/listas/configuraciones/arcor.js:197`** —
  `equivalenciaDisplay: null`. **El que bloquea las 250 filas.** Está escrito como
  gancho a propósito, esperando que el negocio defina la regla. Emanuel la acaba
  de definir.
- **`lib/proveedores/listas/rangoAumento.js:148`** — `esAbsurda`: más de +200 % o
  menos de −66 %. El criterio que la regla nueva reemplaza por el rango.

Una corrección al CLAUDE.md, que sobre esto quedó viejo: dice que el rango está
escrito a mano en cinco lugares, con tres `?? 10` y `?? 20`. **Ya no.** Hoy hay una
sola constante y `rangoDeLaFila` en `lib/proveedores/listas/vigenciaConfirmacion.js`
resuelve la cascada fila → cabecera → default. Los `?? 10` que aparecen en el grep
están todos adentro de comentarios que cuentan cómo era antes.

**Dónde tendrían que vivir los valores editables.** El modelo `Proveedor` **no
tiene ningún campo para esto**. Tiene `umbralRevisarPct` y `umbralSospechaBajaPct`,
pero son del módulo de comprobantes y su comentario dice para qué son. Así que
guardar el rango y los impuestos por proveedor **necesita migración**, y las
columnas tienen que ser nullable por el mismo motivo que las de comprobantes: null
y "igual al default" son cosas distintas.

### 3.6 · Un detalle de la pantalla de "Nueva importación" que conviene saber

La pantalla **no pide** el recargo ni el umbral: los **muestra** como datos de solo
lectura, con este texto al lado, literal:

  *"Son los valores configurados para el proveedor y no se pueden cambiar después:
  quedan guardados en la importación al crearla, y todas sus filas se evalúan con
  estos."*

**Eso no es cierto.** No están configurados para el proveedor: salen de
`CONFIG_ARCOR` y de `RANGO_POR_DEFECTO`, que son constantes del código y valen lo
mismo para cualquier proveedor que se agregue mañana. La pantalla le está diciendo
al usuario que existe una configuración por proveedor que no existe.

Esto corrige al plan anterior, que decía que la pantalla "pide dos números que un
usuario no técnico no sabe contestar". No los pide. El problema es el opuesto y es
peor: **no se pueden cambiar, y la pantalla dice que sí se configuraron.**

---

## 4 · UI / UX, pantalla por pantalla

Medido con navegador real a 360 × 640 y a 1366 × 900, en tema oscuro (`sunmiDark`)
y claro (`sunmiLight`), sobre las cinco superficies del circuito.

**Una advertencia sobre el método, porque casi arruina esta sección.** El primer
intento de medir el tema claro forzó `<html data-theme="sunmiLight">`. Eso mueve
las variables CSS pero **no** las clases de Tailwind del kit, que salen de un
contexto de React alimentado por `localStorage` con la clave `erp-sunmi-theme`. El
resultado fue una pantalla híbrida —tarjetas oscuras con texto oscuro— que medía
como "texto invisible" y **no existe**. Se detectó comparando el fondo calculado de
la tarjeta contra el token del tema, y se rehízo escribiendo la preferencia y
recargando, comprobando después que `data-theme` hubiera quedado en `sunmiLight`.
Determinista y falso son dos cosas distintas, y ésta habría entrado al plan como
el defecto más grave del módulo.

### 4.1 · Blancos de toque: ni un botón del módulo llega a 44 píxeles

Medido sobre todo lo tocable de las cinco pantallas, descontando el menú lateral.
Son **29 elementos distintos** por debajo de 44 × 44, y el patrón es claro:

- **Radios de 12 × 12** en el panel de decisión. Es con eso que se elige entre las
  interpretaciones del precio.
- **Casillas de 14 × 14**, dos: "Ver también las canceladas" en el listado, y la
  de "Revisé la lista y confirmo que se actualicen los costos", que es la que
  habilita a escribir. `h-4 w-4` en
  `components/proveedores/listas/PanelAplicar.jsx:217`.
- **Todos los botones de acción miden 36 píxeles de alto.** Sin excepción:
  "Importar y conciliar", "Aplicar los 684", "Terminar importación", "Cancelar
  importación", "Confirmar y seguir", "Buscar", "Limpiar", "Ver conciliación",
  "Nueva importación", "Sí, aplicar 692 filas". Treinta y seis, contra cuarenta y
  cuatro.
- **Enlaces de retorno de 17 y 18 píxeles de alto**: "Volver al historial"
  (108 × 18), "Volver a Compras" (105 × 17), "Buscar otro producto" (97 × 16).
- La paginación: "Anterior" 58 × 36 y "Siguiente" 65 × 36.

No es que falte agrandar una casilla. **Es que la altura de botón del kit es 36 y
nadie la subió.**

### 4.2 · Contraste

- **Tema oscuro: un solo hallazgo en las cinco pantallas, y no es del módulo.** Es
  el chip "Administrador" del encabezado global, verde `rgb(52, 211, 153)` a
  10,5 px, midiendo 1,26:1. Conviene que lo mire una persona, porque un chip con
  fondo semitransparente es donde más se equivoca un medidor automático.
- **Tema claro: 17 hallazgos a 360 y 19 a 1366, todos del módulo.** Y el patrón
  también es uno solo: **texto blanco `rgb(241, 245, 249)` encima de botones de
  color**, midiendo 2,91:1 contra un mínimo de 4,5. Le pasa a "Aplicar los 684",
  "Confirmar y seguir", "Importar y conciliar", "Ver conciliación", "Nueva
  importación", "Buscar", y a los números grandes de las tarjetas (684 y 258 a
  22 px, midiendo 2,91 contra un mínimo de 3).
  Después, el ámbar `rgb(217, 119, 6)` a 3,19:1 en el titular "Tenés 684 productos
  listos…", en "ARCHIVO · FILA 837" y en "Buscar otro producto"; y el verde
  `rgb(5, 150, 105)` a 3,77:1 en "Sugerida" y en el contador de listos.

**El módulo está diseñado para el tema oscuro y en el claro no cumple.** No hay
nada roto ni ilegible: hay poco contraste, sistemático, en los botones principales.

### 4.3 · Scroll

**Cero desborde horizontal de página** en las cinco pantallas, a los dos anchos.
Eso se mantiene de la medición anterior y sigue siendo cierto.

Pero en la pantalla del detalle —la del trabajo— hay **tres barras de scroll
anidadas a 360**: el `main` (539 px de alto con 1.249 de contenido), un `div`
interno (448 con 1.387) y la tabla, que además scrollea a lo ancho (309 con 339).
Tres superficies que se mueven, dos de ellas verticales y solapadas. En un
teléfono eso es el gesto más frustrante que hay: se arrastra y se mueve la que no
era.

### 4.4 · El listado

**Qué tiene que hacer el usuario acá:** encontrar una lista y entrar.

**Lo que ve primero:** una tarjeta de presentación que dice "Listas de proveedores
· Importaciones de listas de precios. Todavía no se aplica ningún costo." Ocupa la
parte de arriba de la pantalla y no le sirve a alguien que ya sabe dónde está.

**Lo que no hay:** buscador. Comprobado enumerando: el único `<input>` de toda la
pantalla es la casilla "Ver también las canceladas", en la línea 219. No hay filtro
por proveedor, ni por estado, ni por fecha. Con diez listas por día, al tercer día
la de ayer ya está en la página dos, y la única forma de llegar es acordarse de la
fecha y paginar.

**Lo que sobra:** cada tarjeta muestra ocho contadores crudos en dos renglones
—Filas, Para aplicar, Actualizados, Sin cambios, Sin vincular, Armado, Bloqueadas—
y ninguno dice qué hay que hacer. "Armado 250" no es una tarea; "faltan 250 por
resolver" sí.

**Acciones peligrosas:** "Cancelar importación" va inmediatamente debajo de "Ver
conciliación", del mismo ancho completo, del mismo alto, separadas por ocho
píxeles. La única diferencia es el color. En un Sunmi, con el pulgar, eso es un
error esperando.

### 4.5 · Nueva importación

**Qué tiene que hacer el usuario acá:** elegir proveedor, elegir archivo, apretar.
Eso se entiende sin que nadie se lo explique, y el aviso "No se modifica ningún
precio todavía" está bien puesto.

Lo que falla es el bloque de configuración comercial: tres números que no puede
cambiar, con un texto que le dice que se configuraron para el proveedor cuando no
es cierto (3.6). **Con la regla nueva, ese bloque deja de ser informativo y pasa a
ser el formulario.**

Y "Umbral de variación alta" es jerga: no dice qué pasa si sube o si baja.

### 4.6 · El detalle

**Qué tiene que hacer el usuario acá:** entender qué encontró el sistema y
aplicar lo que está bien.

**Lo primero que ve son cinco tarjetas de números**, y acá hay un problema que no
se ve leyendo el código: **mezclan dos universos distintos sin decirlo.** "684
Listos para aplicar" y "258 Necesitan que decidas" cuentan **filas del Excel**.
"0 Actualizados", "0 Sin código de Arcor guardado" y "0 Con código, pero la lista
no lo trajo" cuentan **productos del sistema** — lo dice una leyenda debajo, en
gris chico: "Sobre los 942 productos de este proveedor que tenés en el sistema".
Cinco tarjetas iguales, dos significados, y la aclaración al final.

**Y dos números distintos para lo mismo en la misma pantalla:** arriba dice
"Aplicar los 684" y el panel de abajo dice "692 de 692 seleccionadas". La
diferencia son las 8 filas que el motor marcó ambiguas. Las dos cifras son
defendibles por separado; juntas, en la misma pantalla, no.

**Qué avisa después de cada acción:**

- Después de aplicar, la tabla queda vacía con "No hay productos en esta
  situación · 0 registros", porque el filtro seguía puesto en "Listos para
  aplicar" y ahora son cero. No dice qué pasó ni qué hacer.
- Después de terminar, aparece "Importación terminada. 280 filas quedaron sin
  aplicar", que está bien.
- **Después de deshacer, la pantalla no cambia en absoluto.** Sigue diciendo "692
  Actualizados", sigue ofreciendo "Deshacer la aplicación" y sigue mostrando el
  cartel de "Importación terminada". Ver 4.8.

### 4.7 · El panel de decisión, que es donde vive el trabajo

Texto literal de la pantalla, del recorrido real:

  *ARCHIVO · FILA 837 — +6.5 % variación*
  *PRESENTACIÓN: 6 u. — el ERP lo guarda como 16 u. · UxBU 16 · dato logístico*
  *Sin multiplicar · Sugerida*
  *El producto del ERP es un display completo que cotiza el proveedor. El costo es
  el precio informado, sin multiplicar.*
  *Precio del display × 16 · Imposible*
  *Cantidad tomada de factor_pack del ERP, y el archivo informa el mismo armado.*
  *+1604.0 % · Aumento alto*
  *Buscar otro producto — Confirmar y seguir*

Las palabras que el usuario no puede contestar sin que alguien se las explique,
con la cadena exacta: **`UxBU 16 · dato logístico`**, **`el ERP lo guarda como`**,
**`factor_pack del ERP`**, **`el archivo informa el mismo armado`**, **`Sin
multiplicar`**, **`display`**, **`PRESENTACIÓN`**, **`+5 % de recargo`**.

Y le está mostrando **+1604,0 %** como una de las dos opciones entre las que
elegir. Una opción que el propio sistema rotula "Imposible" no es una opción: es
ruido al lado de la que sí sirve.

**Con la regla nueva este panel casi no se usa.** Si exactamente una lectura cae
en el rango, no hay nada que preguntar. El panel queda para el caso "ninguna cae",
y ahí lo que hay que decir no es "elegí entre estas dos" sino "este costo no se
parece a lo esperado, mirá si el producto vinculado es el correcto".

### 4.8 · El defecto que apareció ejerciendo la pantalla

**Deshacer funciona en la base y no se nota en ninguna parte.**

Comprobado sobre la importación #2, que se aplicó, se terminó y se deshizo:

- Los **692 costos se restauraron bien**: los 692 productos volvieron exactamente
  a su `costoPrevioAplicacion`, y las 692 filas tienen `revertidaEn` y
  `aplicada = false`. El motor hace lo suyo.
- Pero la cabecera **sigue diciendo `aplicadas = 692`** con cero filas aplicadas.
  `app/api/proveedores/listas/[id]/revertir/route.js:303` escribe únicamente
  `estado: "PARCIALMENTE_APLICADA"` y no recalcula el contador, aunque el
  comentario del schema promete que estos contadores "se recalculan desde las
  filas, nunca se suman a mano".
- Y el estado vuelve a `PARCIALMENTE_APLICADA` **dejando `terminadaEn` puesto**.
  La fila de la base dice "abierta" —`esImportacionAbierta` contesta que sí— y la
  pantalla, que mira otra cosa, dice "Importación terminada · No se puede
  confirmar ni aplicar nada más". Dos hechos que se contradicen, que es
  exactamente lo que la regla 3 del CLAUDE.md prohíbe.
- Como remate, **la pantalla ni siquiera se recarga** después de deshacer: se
  queda con el estado anterior en memoria, así que el usuario no ve absolutamente
  ningún cambio y lo natural es que vuelva a apretar.

Esto no lo encontró ningún candado. Lo encontró abrir la pantalla y apretar el
botón.

### 4.9 · El problema 1 del plan anterior sigue vivo

La importación #1, TERMINADA, abre diciendo en ámbar y en grande **"Tenés 684
productos listos para actualizar y 258 necesitan que decidas"**, con la tarjeta
"684 Listos para aplicar" resaltada y el texto **"El sistema ya decidió: falta
ejecutar la aplicación"**. Abajo, en la misma pantalla, dice que no se puede
aplicar nada más. Confirmado sobre `df2a43d1`, a 360 y a 1366.

### 4.10 · Estados vacíos y de error

- El listado vacío muestra la tarjeta de presentación y el botón de nueva
  importación. Alcanza.
- La tabla del detalle sin resultados dice "No hay productos en esta situación · 0
  registros". Dice qué no hay; no dice qué hacer ni que el filtro está puesto.
- Estados de error: **no se pudo ejercer ninguno**. Ninguna de las cinco pantallas
  devolvió un 500 ni una pantalla en blanco en todo el recorrido, y fabricar un
  error para fotografiarlo sería inventar un caso. Queda sin cubrir y se dice.

---

## 5 · Frontend

### 5.1 · Los 398 hallazgos, agrupados

`node scripts/hardcodeo.mjs --ficha proveedores` da **398 hallazgos en 24
archivos**, repartidos así:

- **1 color fijo** (`text-red-` en `components/proveedores/ModalCodigosProveedor.jsx:80`).
- **35 elementos crudos con reemplazo en el kit**: 27 `<button>` que van a
  `SunmiButton` y 8 `<input>` que van a `SunmiInput`.
- **39 `<td>` a mano**, que van a `SunmiTable` en modo por columnas.
- **323 medidas mágicas**, de las que 96 tienen reemplazo conocido. Las más
  repetidas: `text-[11px]` 70 veces (hay `text-sm2`), `text-[10.5px]` 58 veces (sin
  token), `text-[12px]` 50, `text-[11.5px]` 43, `text-[10px]` 23 (hay `text-xs2`).

**Ojo con la ficha: imprime como mucho seis archivos por hallazgo**, así que el
listado que muestra en pantalla no es el censo. Contando en el fuente, archivo por
archivo, el reparto por pantalla es:

- `app/modulos/proveedores/listas/page.jsx` — 53 (1 botón, 1 input, 14 `<td>`, 37
  medidas). **Es el archivo más cargado del módulo.**
- `components/proveedores/listas/PiezasListas.jsx` — 51 (4 botones, 1 input, 10
  `<td>`, 36 medidas).
- `components/proveedores/listas/PanelDecision.jsx` — 35 (2 botones, 1 input, 32
  medidas).
- `components/proveedores/listas/PanelAplicar.jsx` — 29 (1 botón, 1 input, 27
  medidas).
- `components/proveedores/listas/VistaProductosSistema.jsx` — 26 (7 `<td>`, 19
  medidas).
- `components/proveedores/listas/PanelVincular.jsx` — 22.
- `components/proveedores/listas/ResumenConciliacion.jsx` — 19 (4 botones).
- `app/modulos/proveedores/listas/[id]/page.jsx` — 19.
- `app/modulos/proveedores/listas/nueva/page.jsx` — 18.
- El resto: `PanelProducto` 16, `PanelMacheo` 15, `InterpretacionesFila` 14,
  `ModalRevertir` 14, `CabeceraCatalogo` 12 (5 botones), `DiagnosticoArchivo` 12,
  `TablaCatalogo` 9, `BotonReporte` 7, `ModalTerminar` 5.

**Un hueco del contador que conviene anotar**: la ficha cuenta un solo color fijo,
pero no mira `bg-slate-*` ni `border-slate-*`. En este módulo da igual —no hay
ninguno, comprobado— pero el día que aparezca uno no lo va a atrapar nadie.

### 5.2 · Qué piezas del kit faltan

El kit tiene 56 componentes. Para lo que este módulo hace a mano, **faltan
exactamente dos, y son las dos que están en el camino crítico de los toques**:

- **Una casilla.** No hay `SunmiCheckbox`. Por eso las dos casillas del módulo son
  `<input type="checkbox" className="h-4 w-4">` crudas, de 14 × 14, una de ellas
  la que habilita a escribir 692 costos.
- **Un grupo de opciones.** No hay `SunmiRadioGroup` ni equivalente. Por eso las
  interpretaciones se eligen con radios de 12 × 12.

Lo demás ya existe y no se está usando: `SunmiChipsFiltro` para los filtros de
estado del listado, `SunmiTableEmpty` para los estados vacíos, `SunmiPaginador`
para la paginación, `SunmiTable` para los 39 `<td>`.

La pieza que se agregue sale de una pantalla que hoy funciona, tal cual está, y la
pantalla de donde salió tiene que quedar idéntica: es la regla 1 y acá aplica
directo.

### 5.3 · Consola

**Ningún error propio de la aplicación** en todo el recorrido: subir, conciliar,
aplicar, terminar, deshacer y volver a subir, a 360 y a 1366. Lo único que aparece
es un 404 de favicon y siete `ERR_CERT_AUTHORITY_INVALID` bajando la tipografía de
Google, que son del proxy de esta máquina aislada.

### 5.4 · Lógica de pantalla que debería estar en un módulo con candados

Tres, y las tres se tocan en las tandas de abajo:

- **El titular del detalle.** El texto "Tenés N productos listos para actualizar y
  M necesitan que decidas" se arma adentro del JSX y por eso no sabe si la
  importación está abierta (4.9). Va a una función con candados que reciba estado
  y contadores.
- **La suma de productos actualizados del listado.** La pantalla hace
  `items.reduce((n, i) => n + i.productosActualizados)`, que cuenta dos veces los
  productos que dos importaciones tocaron. El servidor es el único que puede saber
  cuáles se repiten.
- **La elección de interpretación.** Hoy `recomendarHipotesis` sí tiene candados,
  pero el criterio nuevo —"cae dentro del rango"— tiene que entrar ahí y no en el
  panel.

---

## 6 · El plan

Ocho tandas. **El orden cambió**: la regla nueva va primero, porque hasta que no
esté, todo lo demás es maquillaje sobre una cola de 250 decisiones que no debería
existir.

Las tandas que cambian pantallas **se entregan desplegadas** para que Emanuel las
pruebe en el teléfono. Nada de capturas para aprobar.

### Tanda 1 — Configuración por proveedor: rango e impuestos

**Qué se hace.** El rango de aumento esperado y los impuestos adicionales dejan de
ser constantes del código y pasan a guardarse por proveedor, precargados en cada
lista nueva de ese proveedor y editables ahí mismo. La primera vez arrancan vacíos
y se piden.

**Migración: SÍ**, y es la única que la lleva. Cinco columnas nullable en
`Proveedor`: `listaAumentoEsperadoMinPct`, `listaAumentoEsperadoMaxPct`,
`listaImpuestoAdicionalPct` y `listaImpuestoAdicionalPorPack`, más
`listaRecargoPct` para que el recargo comercial siga el mismo camino en vez de
quedar como el único valor fijo sobreviviente. Nullable a propósito y por el mismo
motivo que las de comprobantes: null y "igual al default" son cosas distintas, y
copiar el default en cada fila haría que cambiarlo después no mueva a nadie.

**Decisión tomada.** El prefijo `lista` va porque `Proveedor` ya tiene
`umbralRevisarPct` y `umbralSospechaBajaPct` del módulo de comprobantes, y dos
pares de umbrales sin prefijo se confunden el día que alguien lea el schema
apurado.

**Decisión tomada sobre los impuestos.** Se guarda un porcentaje y un booleano de
"por pack o por unidad", que es literalmente lo que pidió Emanuel. No se generaliza
a una lista de impuestos con nombre: la receta de impuestos ya existe en el módulo
de comprobantes y el día que haga falta más de uno, se reusa esa, no se escribe una
segunda al lado.

**Archivos.** `prisma/schema.prisma`, la migración,
`lib/proveedores/listas/configuraciones/arcor.js` (los valores dejan de ser el
default y pasan a ser el último recurso), `rangoAumento.js`,
`app/api/proveedores/listas/importar/route.js` y la pantalla de nueva importación.

**Cómo se prueba.** Candados sobre la cascada proveedor → importación → default,
con la contraprueba de que un proveedor sin cargar todavía pide los valores en vez
de inventarlos. Y la consulta de Prisma corrida contra Postgres con su forma exacta
—que con cero filas encuentra lo mismo, porque lo que Postgres valida son los
argumentos— antes de dar nada por bueno.

### Tanda 2 — El sistema decide solo: el rango elige la lectura

**Qué se hace.** Es la tanda que disuelve la cola de decisiones. Para cada fila se
calculan las lecturas posibles y se toma la que cae dentro del rango. Si ninguna
cae, la fila se marca para revisar.

**Decisión tomada.** El cambio va en `recomendarHipotesis`, en `rangoAumento.js`,
y es reemplazar el filtro: donde hoy dice "quedate con las no absurdas", pasa a
decir "quedate con las que caen en el rango". `esAbsurda` no se borra: sigue
sirviendo para explicarle al usuario por qué una lectura es ridícula, que es
distinto de elegir.

**Decisión tomada, y sale de la aritmética de la sección 1.** El caso "caen varias"
no se implementa como pregunta al usuario, porque **no puede ocurrir**: dos
lecturas de la misma fila difieren por un factor de al menos 2 y ningún rango
razonable tiene un cociente tope-sobre-piso tan grande. Se deja el chequeo y, si
alguna vez ocurre, **falla ruidosamente en vez de elegir en silencio**: una rama
que nadie ejerce y que además decide costos es exactamente la que hay que dejar
gritando.

**Decisión tomada sobre el display.** `CONFIG_ARCOR.equivalenciaDisplay` deja de
ser `null` y pasa a ser la regla que dijo Emanuel: el display se resuelve con el
`factor_pack` del producto. Con eso, `resolverCostoMaestro` deja de rechazar las
filas `DI` y las 250 entran al circuito normal. **El gancho ya estaba escrito
esperando esta regla**; se completa, no se inventa.

**Decisión tomada sobre `BU`.** Las filas de bulto tienen una sola lectura posible.
Si queda fuera del rango no se pregunta cuál es —no hay cuál—: se marca para
revisar y se muestra el porcentaje. Son 36 filas en este archivo.

**Archivos.** `lib/proveedores/listas/rangoAumento.js`,
`lib/proveedores/listas/configuraciones/arcor.js`,
`lib/proveedores/listas/confirmarPresentacion.js`, y la ruta de confirmar.
**Migración: no.**

**Cómo se prueba.** Candados sobre `recomendarHipotesis` con la contraprueba de
cada rama —una dentro, ninguna dentro, y la que no puede pasar—, ejerciendo cada
una a propósito y viendo el rojo antes del verde. Y el simulador de la sección 3.2
corrido contra los datos reales, antes y después: **ése es el número que decide si
esta tanda sirvió.**

### Tanda 3 — Que deshacer se note

**Qué se hace.** Se arregla lo de 4.8, que es el defecto más serio que apareció:
deshacer funciona y no se ve.

**Decisión tomada.** Tres cosas, y son tres porque son tres hechos distintos: el
contador `aplicadas` se recalcula desde las filas al revertir, como promete el
comentario del schema; `terminadaEn` **se conserva** —es la prueba de que alguien
la cerró y borrarlo perdería la autoría, igual que con la confirmación— pero el
estado y la pantalla dejan de contradecirse, porque el cartel pasa a mirar
`esImportacionAbierta` y no una fecha; y la pantalla se recarga después de
deshacer, con un aviso que diga cuántos costos volvieron atrás.

**Archivos.** `app/api/proveedores/listas/[id]/revertir/route.js`,
`app/modulos/proveedores/listas/[id]/page.jsx`. **Migración: no.**

**Cómo se prueba.** Ejerciendo el circuito entero contra la base —aplicar,
terminar, deshacer— y comprobando los tres hechos: costos restaurados, contador en
cero, y la pantalla diciendo la verdad. Es lo que se hizo para encontrarlo.

### Tanda 4 — Que la pantalla no diga que hay trabajo cuando está cerrado

**Qué se hace.** El titular del detalle y las tarjetas dejan de hablar de trabajo
pendiente cuando la importación no está abierta (4.9).

**Decisión tomada.** La pregunta "¿esta importación acepta trabajo?" ya la contesta
`esImportacionAbierta`, y es esa la que manda. El texto se arma en una función con
candados, no adentro del JSX.

**Cómo queda.** Una terminada abre en texto normal, sin color de alerta, contando
en pasado: cuántos productos se actualizaron y cuántas filas quedaron sin resolver.
La tarjeta de listos no se resalta ni invita a nada.

**Archivos.** `app/modulos/proveedores/listas/[id]/page.jsx` y una función nueva
en `lib/proveedores/listas/`. **Migración: no.**

### Tanda 5 — El idioma y la jerarquía del detalle

**Qué se hace.** Se saca la jerga y se ordena la pantalla del trabajo. Va junto con
el pase al kit de esta pantalla, no después.

**Decisión tomada, término por término:**

- `UxBU 16 · dato logístico` → **"vienen 16 por bulto"**.
- `el ERP lo guarda como 16 u.` → **"en el sistema este producto es de 16"**.
- `factor_pack del ERP` → **"la cantidad que tiene cargada el producto"**.
- `Sin multiplicar` → **"El precio es de todo el paquete"**.
- `Precio del display × 16` → **"El precio es de cada uno · × 16"**.
- `PRESENTACIÓN` → **"Cómo viene"**.
- `Umbral de variación alta` → desaparece: lo reemplaza el rango.
- `Aumento bajo` / `Aumento alto` → **"subió menos de lo esperado"** / **"subió más
  de lo esperado"**, con el rango al lado para que se entienda contra qué.

**Decisión tomada sobre la jerarquía.** Las cinco tarjetas se parten en dos
bloques separados y rotulados, porque cuentan dos cosas distintas (4.6): arriba
"De esta lista", con listos y por resolver; abajo "De tus productos", con
actualizados y los dos de códigos. Y los dos números que hoy se contradicen —684 y
692— pasan a ser uno solo.

**Decisión tomada sobre las lecturas imposibles.** Una opción rotulada "Imposible"
con +1604 % no se muestra como opción. Se muestra plegada, como explicación de por
qué la otra es la buena.

**Archivos.** `PanelDecision.jsx`, `PiezasListas.jsx`, `InterpretacionesFila.jsx`,
`CabeceraCatalogo.jsx`, `app/modulos/proveedores/listas/[id]/page.jsx`, y un módulo
de textos nuevo en `lib/proveedores/listas/`. **Migración: no.**

**Cómo se prueba.** Un candado que recorre las pantallas del módulo y se pone rojo
si vuelve a aparecer alguno de los términos en texto visible —sacando los
comentarios antes de mirar, que es lo que evita el verde falso que ya se cobró tres
veces—. Y el detalle abierto en el teléfono de Emanuel.

### Tanda 6 — Los blancos de toque y el tema claro

**Qué se hace.** Las dos piezas que faltan del kit, y con ellas los tamaños.

**Decisión tomada.** Se agregan **`SunmiCheckbox`** y **`SunmiRadioGroup`**, las
dos sacadas de una pantalla que hoy funciona y con esa pantalla quedando idéntica,
comparada píxel a píxel. Las dos con blanco de toque de 44 aunque la marca se dibuje
más chica: lo que tiene que medir 44 es el área que recibe el dedo, no el cuadrito.

**Decisión tomada sobre los botones.** La altura de acción del kit sube de 36 a 44
en las pantallas de este módulo, empezando por las cuatro del camino crítico:
"Importar y conciliar", "Aplicar", "Sí, aplicar N filas" y "Terminar importación".
No se sube de golpe en todo el ERP: eso mueve píxeles en pantallas que nadie pidió
tocar y no se puede comprobar en una tanda.

**Decisión tomada sobre el tema claro.** El texto blanco sobre botones de color
pasa a un tono que llegue a 4,5:1 en el tema claro, definido como token y no como
color suelto. Y se mide con el tema aplicado como lo aplica la aplicación
—`localStorage` y recarga—, no forzando el atributo, por lo que cuenta 4.

**Decisión tomada sobre el scroll.** Las tres barras anidadas del detalle pasan a
una: scrollea la página y nada más adentro.

**Archivos.** `components/sunmi/SunmiCheckbox.jsx` y `SunmiRadioGroup.jsx` nuevos,
`PanelAplicar.jsx`, `InterpretacionesFila.jsx`, las tres pantallas del módulo, y el
token de contraste. **Migración: no.**

**Cómo se prueba.** La medición de la sección 4.1 y 4.2 repetida: tiene que dar
cero elementos del módulo por debajo de 44 y cero textos por debajo de 4,5:1 en los
dos temas. Y la pantalla de donde salió cada pieza, idéntica.

### Tanda 7 — El listado con diez listas por día

**Qué se hace.** Buscador, filtros, y que cada tarjeta diga qué falta hacer.

**Decisión tomada.** Un campo de búsqueda por proveedor arriba de todo —así se
busca, por proveedor y no por fecha—; el filtro de estado con `SunmiChipsFiltro`
en vez de la casilla de 14 píxeles, con "Abiertas" por defecto; y los ocho
contadores crudos de cada tarjeta reemplazados por **una línea que diga qué falta**:
"faltan 250 por resolver" o "terminada · 692 actualizados". El resto de los números
queda en el detalle, que es donde se los mira.

**Decisión tomada sobre las acciones peligrosas.** "Cancelar importación" sale de
la tarjeta y pasa al detalle, que es donde se ve qué se está cancelando. En la
tarjeta queda una sola acción.

**Decisión tomada sobre el total.** La tapa deja de sumar los conteos por
importación y pasa a contar productos distintos una sola vez, en el servidor: la
pantalla no puede saber qué productos se repiten entre dos listas, solo recibe
números.

**Archivos.** `app/modulos/proveedores/listas/page.jsx` y
`app/api/proveedores/listas/route.js` (filtros y conteo en la consulta, no en el
navegador). **Migración: no.**

**Cómo se prueba.** Contra una copia con varias importaciones que compartan
productos, donde la respuesta correcta se conoce de antemano. Más un candado con
dos importaciones que comparten productos.

### Tanda 8 — Guardar el archivo original, siempre

**Qué se hace.** El Excel se guarda en disco al importar y `archivoUbicacion` deja
de ser `null`. Se guardan todos y no se borran solos.

**Por qué baja al final y no sube.** El plan anterior la ponía primera con el
argumento de que sin un archivo guardado no se puede volver a ejercer el circuito.
**Ese argumento se cayó**: el circuito se ejerció entero en esta tanda con el
archivo que mandó Emanuel. Sigue siendo necesaria —es la única copia del insumo de
una decisión que escribe costos— pero no bloquea a nadie.

**Decisión tomada.** Se reusa `lib/compras-proveedor/comprobante/almacenDisco.js`,
que ya resuelve lo difícil —centinela para no escribir en un volumen sin montar,
aviso al arrancar sin tumbar la aplicación, y `exigirAlmacen()` antes de cada
escritura— en vez de escribir un segundo almacén al lado. Hay que generalizarlo
para que acepte otra variable de ruta además de `COMPROBANTES_VOLUMEN_PATH`, que
hoy está fija adentro del archivo.

**Archivos.** `lib/compras-proveedor/comprobante/almacenDisco.js`, un
`lib/proveedores/listas/almacenArchivo.js` fino que lo use,
`app/api/proveedores/listas/importar/route.js`, `docker-compose.prod.yml` (un
volumen `erpazul_listas`) y el comentario del schema, que hoy afirma que el
proyecto no tiene almacenamiento permanente y dejó de ser cierto: el compose de
producción ya monta dos volúmenes externos.

**Migración: no.** La columna existe y es nullable.

**Cómo se prueba.** Candados sobre el almacén parametrizado, con la contraprueba de
que sin volumen montado la importación **falla** en vez de guardar a medias.

### Fuera del plan: los dos estados del enum

`APLICADA` y `DESCARTADA` están en el enum y el circuito no las produce. Queda como
higiene en el roadmap: no arregla nada que el usuario note, necesita migración
—recortar un enum de Postgres no es aditivo— y por lo tanto su propio corte de
producción. Cuando se haga, primero se vuelve a contar en producción que sigan en
cero, porque este relevamiento tiene fecha.

---

## 7 · Lo que quedó bloqueado, y la orden para destrabarlo

**Un solo número quedó sin medir, y es el de la sección 3.2: cuántas filas quedan
para preguntar con la regla nueva y datos verdaderos.** Necesita el costo actual
real de cada producto de Arcor, y eso vive únicamente en producción.

Por qué no se pudo desde acá: esta máquina **no tiene cliente ssh**, la salida es
HTTPS por un proxy, y no hay ninguna ruta de red a la base del VPS. La única sesión
que llega al VPS es **ERP VPS FULL**, y desde acá no se le puede mandar un mensaje:
no comparte máquina con esta sesión.

Tampoco se buscó un rodeo. Subir un extracto de producción a un servicio externo
sería publicarlo, y commitearlo está prohibido por el encargo. Así que el camino es
uno: que ERP VPS FULL saque un extracto chico y Emanuel lo adjunte acá, que es el
mismo camino por el que llegó el Excel.

**La orden completa, lista para pegar en ERP VPS FULL**, está en
`docs/planes/listas-proveedor-orden-vps.md`, para que se pueda copiar de una sin
arrastrar el resto del documento.

Mientras tanto, **todo lo demás del encargo se midió**: el recorrido completo, los
tiempos, los toques, los valores fijos, el tratamiento de los impuestos, la UI
pantalla por pantalla en dos anchos y dos temas, y el frontend. Lo único marcado
como parcial es el conteo de decisiones.

---

## 8 · Preguntas para Emanuel

Son tres, y las tres son decisiones suyas: cambian comportamiento o plata. Todo lo
demás se resolvió leyendo el repo o midiendo.

**La pregunta de tiempo contra precisión no está**, porque los números la
contestaron: la conciliación tarda 3,45 segundos y las 250 decisiones son una sola
regla ausente, no un problema de volumen. No hay nada que sacrificar.

**Y la pregunta del "precio de la caja chica" tampoco**, porque la regla nueva la
borró: el usuario no va a elegir nunca entre bulto y display.

---

**1 · ¿El rango de aumento esperado es por proveedor, o puede cambiar mes a mes?**

La regla dice que los valores se guardan por proveedor y aparecen precargados en
cada lista nueva, editables ahí mismo. Eso está claro. Lo que no está dicho es qué
pasa el mes que Arcor manda un aumento del 15 % en vez del 6 %: si se edita el
valor de esa lista y el del proveedor queda como estaba, o si al editarlo se
actualiza el proveedor para la próxima.

*Recomendación: que editarlo en una lista NO toque al proveedor, y que la pantalla
ofrezca un "guardar esto para las próximas de Arcor" aparte.* Así un mes raro no
reescribe el criterio de todos los meses, que es el error que no se puede deshacer
sin darse cuenta.

**2 · Los impuestos adicionales, ¿son un porcentaje sobre el precio, o un monto
por unidad?**

La regla dice "cuánto (%)", así que se va a construir como porcentaje. Pero
"si van por unidad o por pack" suena a que puede haber un impuesto que sea tantos
pesos por unidad, y no un porcentaje. Son dos cosas distintas y conviene saber cuál
es antes de escribir la migración, porque cambiarla después necesita otro corte de
producción.

*Recomendación: arrancar solo con porcentaje, que es lo que dice la regla textual.
Si aparece un impuesto en pesos por unidad, se agrega una columna más, que es
aditivo y barato.*

**3 · Cuando ninguna lectura cae en el rango, ¿qué preferís que haga el sistema?**

Hay dos caminos defendibles. Uno: dejar la fila sin aplicar y mostrarla en la lista
de "revisar", como hoy. El otro: aplicar igual la lectura más cercana al rango y
marcarla con una señal, para que se revise después en vez de antes.

*Recomendación: dejarla sin aplicar. Un costo mal aplicado se propaga al precio de
venta y al margen, y encontrarlo después es mucho más caro que resolver la fila
antes. Además, si la tanda 2 sale bien, estas filas van a ser pocas — y cuántas son
es justamente el número que falta medir.*
