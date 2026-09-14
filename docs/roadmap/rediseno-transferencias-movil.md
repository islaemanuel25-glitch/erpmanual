# Rediseño de la pantalla de Transferencias (MÓVIL) — dónde quedamos

**Escrito el 2026-09-13 para que la sesión siguiente arranque sabiendo dónde está
parada.** La sesión anterior se cerró porque el conector de Figma no cargaba.

**Estado: el DOMINIO está hecho, verificado y empujado. La PANTALLA no está
empezada.** Último commit de la tanda: `464b8e16`.

> **AL 2026-09-14 ESTO YA NO ES EL ESTADO.** La pantalla se construyó y lleva
> **tres vueltas**. Producción corre la segunda (`9d101cb4`); la tercera está
> empujada **y sin desplegar**. Lo de abajo se conserva porque es contra lo que se
> compara, pero para saber qué hay HOY hay que leer primero
> "TERCERA VUELTA · LA PANTALLA SE PARTIÓ EN DOS", al final.

---

## LO PRIMERO QUE HAY QUE SABER

**La migración está aplicada en la base de PRUEBAS y NO en producción.**

- `20260913120000_acuerdo_deposito_local`, commiteada en `ad39cecd`.
- Aplicada sobre `erpazul_v15` y verificada contra PostgreSQL: siete columnas,
  `diaDeCorte` **sin default**, único sobre el par `depositoLocalId + localId`,
  índice por `grupoId`, las tres foráneas en CASCADE, **cero filas**.
- En producción va cuando se despliegue, **con el skill `/deploy`**, que la va a
  encontrar sola en el paso 0 porque ya está commiteada.
- El cliente de Prisma ya está regenerado en el cache de pruebas
  (`/home/emanuel/.cache/erpazul-test/node_modules`), así que
  `prisma.acuerdoDepositoLocal` existe.

**Producción corre `94432c42`**, que NO tiene nada de esta tanda.

---

## LA GRILLA DE ESTE PROYECTO ES `1rem = 14 px`, Y ESO CAMBIA TODA ESPECIFICACIÓN

**Esto vale para cualquier pantalla, no solo para ésta.** Está acá porque acá se
cobró: la especificación de los tres frames V28/V28b/V29 vino con valores exactos
en píxeles, y ninguno de sus espaciados caía en la escala.

Figma dibuja por defecto sobre una grilla de **16**, y este proyecto redefine
`base` a **14** — medido, no deducido: la sonda de cascada lo informa en cada
despliegue. Así que la escala de Tailwind acá aterriza en **3,5 · 7 · 10,5 · 14 ·
17,5 · 21**, y los múltiplos de 16 quedan sistemáticamente entre dos escalones.

**La consecuencia práctica, y es la que evita la pregunta: cuando llegue una
especificación con números exactos, se AJUSTAN a la escala del proyecto sin
preguntar.** Esos números casi nunca son una decisión de diseño; son el default de
la herramienta. Lo que sí se hace es decir en el informe qué se corrió y cuánto.

### La tabla de ajuste que se usó acá, para que la próxima sea igual

Espaciados: 16 → 14 (`p-4`) · 14 → 14 (`p-4`) · 13 → 14 (`p-4`) · 12 → 12,25
(`p-3.5`) · 10 → 10,5 (`p-3`) · 9 → 8,75 (`p-2.5`) · 8 → 7 (`p-2`) · 7 → 7
(`p-2`) · 6 → 5,25 (`p-1.5`) · 4 → 3,5 (`p-1`).

Radios: 8 y 9 → 7 (`rounded-lg`) · 11 → 10,5 (`rounded-xl`) · 14 → 14
(`rounded-xl2`, que ya estaba en el config).

**El 9 de los radios se ajusta a 7 y no a 10,5, aunque 10,5 esté 0,5 px más
cerca.** No es una cuenta: 9 es el radio de los botones y los chips de la
especificación, y todos los botones del repo son `rounded-lg`. Un botón nuevo con
otro radio que el resto se ve; medio píxel no.

### Los tamaños de letra son el caso contrario y SÍ entran al config

Un espaciado corrido 1,25 px no se ve. Un importe de 28 mostrado en 22 sí — son
seis píxeles en el número más grande de la pantalla. Por eso de esta
especificación entraron tres tamaños nuevos a `tailwind.config.js` —`sm3: 13`,
`lg3: 19`, `xl3: 28`— y ningún espaciado ni radio.

**Y entran los dos lados el mismo día:** un `fontSize` nuevo en el config tiene
que sumarse a `ESCALA` en `lib/sunmi/claseNegociada.js` en el mismo commit, o el
kit no lo reconoce como tamaño y la pieza vuelve a imponer el suyo.

**Por qué al config y no `text-[13px]` en la pantalla:** el trinquete
(`scripts/hardcodeo.mjs`) cuenta las medidas mágicas, y con razón — el día que el
diseño mueva ese tamaño habría que buscarlo archivo por archivo.

---

## EL PROBLEMA QUE ESTO VIENE A RESOLVER

Hoy la pantalla es un formulario de reporte: dos fechas, un estado y "Generar
reporte". Arranca con Desde y Hasta en el mismo día, así que para ver lo que hay
que recibir primero hay que corregir las fechas. Después del botón vienen cuatro
tarjetas de resumen, un importe, una tabla que se corta a la derecha, y recién ahí
las transferencias.

**Lo que hace falta al abrir no es un reporte: es la lista de trabajo.**

## LA REGLA DE NEGOCIO QUE MANDA

Cada local es independiente: su contabilidad, su mercadería, su ganancia. **El
local paga LO RECIBIDO al depósito, no lo enviado** — por eso el conteo es editable
y por eso el importe corregido es plata real.

Se paga por período, normalmente **semanal**, y todas las transferencias a un mismo
local en ese período **se pagan juntas**. Lo mínimo son 2 transferencias por local
por día de pedido.

**Así que la unidad no es la transferencia: es LOCAL + PERÍODO.**

---

## LO QUE YA ESTÁ HECHO

### `lib/transferencias/periodoDePago.js` — commit `ad39cecd`

El corte de semana **dejó de estar escrito en el código**. Hasta acá el único del
repo era el lunes, a mano dentro de `SunmiDateRangePicker`
(`getFirstDayOfWeekMonday`), que está bien para dibujar un calendario y no alcanza
para cobrar.

`rangoDelPeriodo({ unidad, diaDeCorte, hoy })` con `DIA | SEMANA | MES`. El día de
corte entra por argumento y no es un valor de este módulo. Además:
`DIAS` (los siete, para la pantalla de configuración), `rotuloDelRango`,
`caeEnElPeriodo`, `esDiaDeCorteValido`, `nombreDelDia`,
`DIA_DE_CORTE_POR_DEFECTO = 0`.

La aritmética de fechas va en **UTC puro sobre una fecha que ya es la argentina**.
Con `new Date(iso)` y `setDate`, medianoche UTC es el día anterior acá y la semana
arrancaría un día antes en la mitad de los casos.

11 candados. Uno de ellos prohíbe que vuelva a aparecer un día de la semana en la
LÓGICA (la tabla de nombres se excluye antes de mirar, porque es dato).

### `lib/transferencias/bloquesPorLocal.js` — commit `464b8e16`

- `bloquesPorLocal({ transferencias, acuerdos, unidad, hoy })` → la vista del
  DEPÓSITO. Un bloque por local con movimiento: `nombre`, `aPagar`, `rango`,
  `cantidadTransferencias`, `sinRecibir`, `totalCerrado`, `sinConfigurar`,
  `diaDeCorte`, y sus `transferencias`.
- `cuentaDelLocal({ ..., localId })` → la vista del LOCAL, con `paraRecibir` y
  `yaRecibidas` ya separadas.
- `acuerdoDeLocal`, `estaRecibida`, `entraEnLaVistaPrincipal`, `fechaDeCorte`.

**El rango viaja ADENTRO de cada bloque**, y el filtro por período se aplica
DESPUÉS de saber de qué local es la transferencia. Es la consecuencia directa de
que el corte sea un acuerdo: con dos locales que cortan distinto, un solo rango
arriba de la pantalla sería mentira.

11 candados. El central: el mismo miércoles da dos rangos distintos según el
acuerdo, y una transferencia del domingo 13 entra en el período de uno y no en el
del otro.

### El importe a pagar — commit `ad39cecd`

`importeRecibidoDeLinea` / `importeRecibidoDeDetalleCentavos` /
`importeRecibidoDeDetalle` en `lib/transferencias/agregadosPeriodo.js`.

Sale de **`valorizarDetalle` en modo `VALORIZAR`** —la misma que usa el acta de
recepción en PDF, que hasta ahora era su único consumidor— y suma en **centavos
enteros**. Sin recepción cargada cae a lo enviado, que es su contrato y lo
correcto: una transferencia despachada y sin contar se debe entera.

**El importe del REMITO no se toca ni se reemplaza.** Es el documento de lo
despachado y los dos conviven; el día que difieran, esa diferencia es el dato.

### El candado de repo entero ahora cubre la plata — commit `ad39cecd`

`lib/transferencias/laCuentaNoSeEscribeAMano.test.mjs` ganó el patrón de valorizar
a mano lo enviado o lo recibido. **La red es más angosta que la de las cantidades a
propósito**: medio repo multiplica un precio por una cantidad con razón —el
carrito, los combos, el pedido a proveedor, el valorizado de stock— y esos cuatro
están en la lista de contraejemplos. Lo que delata este hecho es multiplicar por lo
enviado o lo recibido de una transferencia.

### Candados que se reescribieron, y por qué

- Tres cuentan migraciones (`recepcionMovilV2`, `adopcionDePresentacion`,
  `snapshotDePresentacion`): existen para que ninguna entre sin que se note, e
  hicieron exactamente eso. Van en **11** y nombran la nueva.
- `costoTransferencia.test.mjs` → "18d" prohibía `valorizarDetalle` en todo
  `agregadosPeriodo`, para que el importe del reporte no cambiara al contar. Ahora
  hay dos números en ese módulo, así que prohibir el símbolo habría impedido el
  segundo: pasa a afirmar **cuál primitiva usa cada uno** y que ninguno cruce.

---

## LA PANTALLA — CONSTRUIDA EL 2026-09-13

Lo de abajo es la especificación que se implementó, y queda como está porque es
contra lo que se compara. Lo que se construyó:

- `components/transferencias/TableroMovil.jsx` — la pantalla: encabezado, chips,
  y las dos vistas. Se monta en `app/modulos/transferencias/page.jsx` abajo de
  1024 px; **de 1024 para arriba no cambia nada** y el reporte se dibuja con las
  mismas clases de siempre.
- `ChipsDePeriodo.jsx`, `BloqueLocal.jsx`, `CabeceraDeCuenta.jsx`,
  `FilaTransferenciaLocal.jsx`, `FilaCorteDeSemana.jsx`, `AccionDePantalla.jsx` y
  `corteDeSemana.js` —la ruta y el permiso de la pantalla de corte, en un solo
  lugar, porque los nombran el menú, el atajo del aviso y el botón "Cambiar"—.
- `lib/menu/registry.js` gana el ítem permanente "Corte de semana".
- `app/modulos/transferencias/corte-de-semana/page.jsx` — el V29.
- `app/api/transferencias/tablero/route.js` y
  `app/api/transferencias/acuerdos/route.js`.
- `lib/transferencias/rotulosDeTransferencia.js` — los textos que las dos vistas
  comparten, en un solo lugar.
- Candados: `components/transferencias/tableroMovil.test.mjs`, 12, con las tres
  verificaciones que Emanuel pidió y una contraprueba permanente; y
  `components/transferencias/senalDeEdicion.test.mjs`, 5, que vuelve a medir los
  catorce temas en cada corrida.

### SEGUNDA VUELTA (V32), del 2026-09-13 — el día, el estado y la recibida

La lista de un local era plana y titulada por el número interno: "#200", "#204".
Ese número no dice qué día salió, ni qué traía, ni si hubo diferencia. Y una
transferencia ya recibida **no tenía forma de abrirse** — el único control era
"Recibir", que es para las otras. Ése era el defecto principal.

**Ahora:** las transferencias se agrupan por DÍA, del más reciente al más viejo,
con una banda por día que lleva su total. Cada fila dice la hora, los ítems y el
estado EN PALABRAS. La recibida es tocable entera y lleva al detalle que ya
existía. Arriba hay un buscador por número, que es cuando el "#N" sí sirve.

**El conteo de diferencias NO sale de `Transferencia.tieneDiferencias`**, aunque
se llame parecido. Medido sobre producción: es un booleano —y la pantalla dice el
número— y solo se escribe al CONFIRMAR, así que de las 15 transferencias en
`Recibiendo` la columna decía `false` en las 15 mientras las líneas decían que 7
ya tenían diferencia. Sale de `diferenciaDeLinea` sobre las puertas canónicas.
Sobre las 62 recibidas la columna sí coincidía exactamente, y aun así se
descartó: una sola fuente para los dos casos.

**El agrupado es por fecha de ENVÍO**, la misma que decide el período. Y hay un
motivo que lo cierra: de las 207 transferencias vivas, las 145 no recibidas **no
tienen `fechaRecepcion`**. Agrupar por recepción dejaría sin día justamente a las
que hay que trabajar.

**LA BANDA SE PINTA PAREJA Y TIENE CANDADO.** El fondo va en un solo nodo y
ninguno de sus hijos declara superficie propia: un hijo pintado tapa la franja y
deja un rectángulo del color de la tarjeta en el medio. Lo afirma el candado
sobre el HTML renderizado y el arnés sobre el fondo COMPUTADO de los cuatro
descendientes.

**Dos defectos los encontró la pantalla, no los candados**, y los dos con la
misma forma —un fixture que el endpoint nunca produce—:

1. La ruta le pasaba a `bloquesPorLocal` las filas CRUDAS de Prisma, sin
   `lineasConDiferencia`, así que la cabecera sumaba cero. El candado no lo vio
   porque armaba el bloque a mano con el conteo ya puesto. Ahora lo arma con la
   función real.
2. La cabecera contaba también las que están a medio contar, así que decía "2 con
   diferencias" con una sola fila mostrándolas. Se cuentan solo las RECIBIDAS:
   la cabecera cuenta lo que las filas MUESTRAN.

**ESCRITORIO QUEDA ANOTADO.** Nada de esto toca la vista de 1024 px para arriba:
el reporte sigue dibujándose con las mismas clases y el arnés lo comprueba a
1366. Agrupar por día el detalle de escritorio es una tanda propia.

**Se fueron `subtituloConEstado` y `subtituloConAvance`**, que decían lo mismo de
dos formas y quedaron sin un solo consumidor. Su conocimiento caro —el
denominador del avance excluye las líneas agregadas en recepción— vive ahora en
`estadoEnPalabras`.

### Las tres correcciones de Emanuel, del 2026-09-13

**1 · El encabezado propio desaparece: el botón viaja en el renglón del shell.**
`LayoutBase` ya dibujaba el título de la pantalla y, si la pantalla registra una
acción con `useAccionDePagina`, la pone a la derecha de ESE título. O sea que el
renglón que se estaba gastando en repetir "Transferencias" no hacía falta para
nada: el botón "Reporte" entra gratis arriba. Lo mismo el "Volver" del corte.
La pantalla que NO se llama como su ruta —el corte— registra además su título con
`useTituloDePagina`, así la barra dice "Corte de semana" y no el nombre del
módulo. Las dos puertas ya existían; lo que había era una barra escrita al lado.

Queda `AccionDePantalla`, y es SOLO un repuesto: la fila del shell es
`md:hidden`, y estas pantallas no terminan en 768 px —la lista llega a 1024 y la
de corte no tiene tope—, así que de 768 para arriba el botón registrado no se
dibujaría en ninguna parte. Ese repuesto muestra el MISMO nodo que devuelve
`useAccionDePagina`, así que las dos filas no pueden decir cosas distintas.
Medido en el navegador: a 390 px el renglón del shell dice exactamente
"Transferencias Reporte" y "Corte de semana Volver".

**2 · La fila en edición se distingue por la FORMA, no por el color.** Medido
sobre los catorce temas de `app/globals.css`: en **sunmiSand** `--pos-accent` y
`--pos-warning` son **el mismo hexadecimal** (`#b45309`), y en siete de los
catorce la distancia perceptual entre los dos es menor a 20. Distinguir "editando"
de "sin configurar" por el tono no podía funcionar. La señal es el **borde
punteado** mientras se edita, sólido en los otros dos estados: `border-style` no
sale de ninguna variable de tema, y además dice lo que pasa —lo punteado es
provisorio, todavía no se guardó—. El color accent se conserva encima porque en
los siete temas donde sí se distingue ayuda, pero la diferencia no cuelga de él.
Lo afirma `components/transferencias/senalDeEdicion.test.mjs`, que vuelve a medir
los catorce temas en cada corrida, y el arnés lo comprueba además sobre el
`border-style` **computado** por el navegador.

**3 · La entrada al corte es permanente y está en el menú**, dentro del grupo
Transferencias, con `permiso: "transferencias.crear"`. Una pantalla a la que solo
se llega cuando algo está mal no existe el día que hay que cambiar un corte que ya
está bien, que es justamente cuando se la busca. El aviso de "sin configurar"
queda igual: es un atajo cuando falta algo, no la puerta. Quien no tiene el
permiso no ve el ítem y, si llega por el atajo, la pantalla se LEE —la fila no
ofrece "Cambiar"—.

### Lo que se decidió SIN DISEÑO, y conviene revisar

1. **El bloque abre por toque en toda la fila**, no con un control aparte. Por eso
   la píldora "Sin corte" es un `span` y no un enlace: un interactivo adentro de
   otro no es válido.
2. **El rango, en la vista del local, va en la tarjeta de cuenta**, debajo del
   importe — mismo criterio que en el bloque del depósito.
3. **El rótulo del importe sigue al chip**: "A pagar hoy" / "esta semana" / "este
   mes". La especificación lo escribía fijo en la semana.
4. **El denominador del avance** —"20 de 56 revisados"— son las líneas ORIGINALES,
   sin las agregadas en recepción. La especificación traía dos números distintos
   (56 ítems, 77 revisables) que no se pueden reconciliar.
5. **El chip "Otro" ignora el día de corte**: el rango lo eligió el usuario y vale
   igual para todos los locales (`rangoFijo` en `bloquesPorLocal`).
6. **El permiso del PUT de acuerdos es `transferencias.crear`**, el del depósito.
   No se inventó uno nuevo. El mismo permiso gobierna el ítem del menú y el botón
   "Cambiar", desde `components/transferencias/corteDeSemana.js`.
7. **Tres clases nuevas del kit**: `.sunmi-border-warning`, `.sunmi-border-accent`
   —solo color, como la de `danger`— y el color `ghost` de `SunmiButton`, que es
   la ausencia de relleno. Sin ese último, el botón "Cambiar" transparente con
   borde en accent solo se podía escribir peleando contra el orden de la hoja.

### La especificación implementada

### Vista DEPÓSITO (Figma V28, nodo `230:478`)

**Corregido el 2026-09-13: un bloque por CADA local del grupo, tenga o no
movimiento.** Lo de abajo describe el bloque del que sí tuvo; el que no, va en
versión corta — ver la decisión 3.

Al abrir, sin tocar nada: un bloque por local. Cada bloque con el nombre del local,
**"A pagar"** con el importe corregido acumulado del período **en grande**, y
debajo `"5 transferencias · 2 sin recibir"`.

El local con transferencias sin recibir va con **borde warning** —su total todavía
no está cerrado—; el que las tiene todas recibidas queda neutro. `totalCerrado` ya
lo contesta.

Al abrir el bloque, sus transferencias: las pendientes con botón **"Recibir"**, las
cerradas con su importe.

### Vista LOCAL (Figma V28b, nodo `231:478`)

El local ya ve solo sus transferencias contra depósito — **eso funciona hoy y no se
toca**. Lo que cambia es la forma: sin agrupar, porque hay un solo local. Arriba su
cuenta —"A pagar esta semana" con el importe grande y el aviso en warning de
cuántas faltan recibir y que el total no está cerrado—, y debajo dos secciones:
**PARA RECIBIR** y **YA RECIBIDAS**. `cuentaDelLocal` ya devuelve las dos.

### El período

Chips: **Día · Semana · Mes · Otro**. Arranca en **SEMANA**, que es como se paga.
Debajo, el rango en texto (`rotuloDelRango`).

**"Otro" abre `SunmiDateRangePicker`, que ya está en el kit. NO se rediseña.**

### El corte de semana (Figma V29, nodo `239:478`)

**Pantalla aparte, fuera de transferencias.** Una fila por relación depósito–local:
el día de arranque y el rango en curso. Se configura una vez.

Las relaciones sin acuerdo se muestran **marcadas como "sin configurar"** y caen al
domingo para poder mostrar algo. **Nunca en silencio**: el que entra tiene que ver
cuáles faltan. `acuerdoDeLocal` devuelve las dos cosas juntas.

### El reporte no se tira

Todo lo que hoy recibe al abrir —resumen, desglose por estado, productos más
transferidos, la vista Por destino— **pasa detrás del botón "Reporte" arriba a la
derecha**. Sigue existiendo, deja de estorbar.

**"Cancelada" sale de la vista principal**: nunca pasó que se cancele una
transferencia completa. Queda en el filtro del reporte.
`entraEnLaVistaPrincipal` ya la excluye.

---

## DECISIONES YA TOMADAS — NO SE VUELVEN A PREGUNTAR

1. **La vista se elige por `es_deposito`** del local que resuelve
   `resolveVistaOperativa` (`lib/grupos.js`). Dato existente, función existente,
   sin condición nueva. Ojo: el `modo: "LOCAL" | "GLOBAL"` de esa función dice el
   ALCANCE, no si el local es el depósito.
2. **El bloque por local NO reusa `ReporteTransferenciasPorDestino.jsx`** —
   componente propio. Aquél agrupa por destino sin importar quién sos, su importe
   es el ENVIADO, y su período es uno solo para todos. Se queda donde está
   contestando su pregunta.
3. ~~**Un local sin transferencias en el período NO aparece.**~~ **DADA VUELTA
   POR EMANUEL EL 2026-09-13: aparecen TODOS los locales del grupo que tengan
   relación con este depósito, tengan o no movimiento.** Se deja tachada y no se
   borra, porque el motivo de la vuelta es el que hay que recordar:

   *"Lo pensé como una lista de cuentas a cobrar, pero si un local solo aparece
   cuando tiene una transferencia asociada, no hay forma de saber que existe.
   Arrancás viendo un local y no sabés que hay cuatro."*

   El local sin movimiento va en **versión corta**: nombre, "Sin transferencias
   en el período" e importe en $ 0,00. **Sin borde de aviso** —su total no está
   abierto: es cero y está cerrado— y **sin nada que abrir**, así que tampoco es
   un botón. El orden es **por importe, con los que están en cero al final**.

   **Y arrastraba un segundo defecto, que es el que lo hace algo más que una
   preferencia de listado:** el aviso de "sin corte configurado" cuenta los
   locales de la LISTA. Con cuatro relaciones sin configurar y un solo local con
   movimiento, informaba **una**. Medido en producción el 2026-09-13. Está
   congelado en el candado `E2c`.

   **EL LOCAL DADO DE BAJA tiene su propia regla, de dos mitades** (2026-09-13):
   con movimiento en el período **aparece, y MARCADO** —"Dado de baja", en
   `danger`—, porque se le debe plata y esconderlo sería perder una cuenta a
   cobrar sin que nadie se entere; sin movimiento **no aparece**, porque un local
   que no opera y que además no movió nada es ruido. Candados `E2e`, `E2f` y
   `E2g`.

   **EL CRITERIO QUE DEFINE LA PANTALLA, encontrado el 2026-09-13: el CLIENTE
   VINCULADO.** Un local opera con el depósito por TRANSFERENCIA solo si tiene un
   cliente con `localVinculadoId` apuntándolo. Sin ese vínculo **se le VENDE y
   nada más**, y eso no es un defecto: ese local no lleva su stock en este
   sistema, así que no hay a dónde sumarle mercadería.

   Se buscó como un campo del modelo `Local` —en `tipo`, en `activo`— y no está
   ahí. Los DATOS lo dijeron antes que el código: los dos locales que recibían
   transferencias eran exactamente los dos que tenían cliente vinculado, y los
   dos que no, acumulaban **cero transferencias en toda su historia**.

   Y es el mismo dato que ENCIENDE el remito: `/api/pos-ventas/crear` lo consulta
   para decidir si una venta del depósito genera su transferencia. Medido: desde
   que un local tiene cliente vinculado, **el 100 % de sus ventas generó remito**
   —140 de 140 en uno, 66 de 66 en el otro—. O sea que el filtro no inventa una
   regla: nombra la que el sistema ya venía aplicando.

   **Se nota el día que se carga un local nuevo:** hasta que no se le vincule su
   cliente, no aparece en transferencias ni se ofrece como destino. Candados
   `E2h` y los dos de `destinosDeTransferencia`.

   **Y crear transferencia usa AHORA la misma puerta.** Antes ofrecía los
   destinos con `getLocalesDeGrupo`, que no filtra nada: un local dado de baja se
   ofrecía como destino de una operación nueva, y el "EXCLUYE depósitos" de su
   comentario es una creencia que se cumple de rebote porque los depósitos viven
   en otra tabla. El criterio vive en
   `lib/transferencias/destinosDeTransferencia.js`, con sus candados.

   **`getLocalesDeGrupo` NO se tocó, y es deliberado:** sus otros tres
   consumidores la usan para replicar el CATÁLOGO, que es otra pregunta.
   Filtrar ahí por `activo` dejaría a un local reactivado sin los productos
   creados durante su baja. Hay un candado que lo dice y que se pone rojo si
   alguien "unifica" las dos.
4. **El acuerdo cuelga del PAR depósito–local**, no de `GrupoLocal`: un grupo puede
   tener más de un depósito y colgarlo del local sería ambiguo.
5. **Sin default en la base para `diaDeCorte`.** Una relación sin fila es "no se
   configuró", que no es lo mismo que domingo.
6. **El período se mide por la fecha de ENVÍO**, no la de recepción.
7. **"Recibiendo" cuenta como pendiente**: contar no es confirmar.

---

## LO QUE HAY QUE RESOLVER EL DÍA QUE EXISTAN LOS PAGOS

**Hoy el corte es SOLO DE PRESENTACIÓN**: el sistema no registra pagos, solo
muestra cuánto se debe. Por eso cambiar `diaDeCorte` puede mover una transferencia
de una semana a otra sin consecuencia.

**El día que exista el registro de un pago eso deja de ser inocuo**, y las dos cosas
están escritas también en el modelo, en `schema.prisma`:

- el período tiene que quedar **CONGELADO en la fila del pago** y no recalcularse
  desde el acuerdo. Si no, cambiar el corte movería plata ya cobrada de una semana
  a otra;
- y `AcuerdoDepositoLocal` va a necesitar **historial**, no un solo `diaDeCorte`:
  "cortaba domingo hasta el 3 de octubre y lunes desde el 4". Con un único valor no
  se puede reconstruir en qué período cayó una transferencia vieja.

---

## EL FIGMA, Y QUÉ PASA SI TAMPOCO CARGA

Archivo **`EVJ2KvVCrY0oVSowfboymQ`** · V28 `230:478` · V28b `231:478` · V29
`239:478`.

En la sesión del 2026-09-13 **el conector no cargó** —la única herramienta
disponible era `DesignSync`, que es el sistema de diseño de Claude y no Figma— y
por eso la sesión se cerró antes de empezar la pantalla. **No se construyó nada a
ciegas: lo hecho es dominio puro, sin una sola decisión visual.**

Si en la sesión nueva tampoco carga, la instrucción de Emanuel es construir con la
descripción escrita de arriba, usando el kit y las convenciones de las tandas
móviles anteriores, **y marcar explícito en el informe qué se decidió por falta del
diseño**. Lo que va a haber que decidir a ciegas y él va a querer revisar:

- los **espaciados** entre bloques y dentro de cada uno;
- los **tamaños de letra** del importe grande y de la línea
  `"5 transferencias · 2 sin recibir"`;
- el **tono exacto del borde warning** (la intención es `sunmi-state-warning`, el
  mismo que la recepción ya usa para el excedente);
- si el bloque **abre por toque en toda la fila** o por un control;
- **dónde cae el rango en texto** respecto de los chips.

---

## CÓMO SE VERIFICA ESTA LÍNEA DE TRABAJO

Lo de siempre, y está en `docs/architecture/base-de-pruebas-v15.md`: base
`erpazul_v15` sembrada con `scripts/sembrar-v15-recepcion.mjs`, app en el 3210, y
el arnés `scripts/capturas-recepcion-movil.mjs` a 390 px. Los ids del sembrado
**cambian en cada corrida**: hay que leerlos, no memorizarlos.

**Dos huellas que NO cubren esto**, y conviene saberlo antes de confiar en un
verde: el **listado** de transferencias está excluido del generador de huellas a
propósito, y `huella-escritorio-recepcion.mjs` retrata el flujo de recepción, no la
tabla del detalle. Lo que cubre los cambios de estas pantallas son los candados de
render.

Suite al cerrar la sesión: **5871 en verde**, lint y trinquete limpios.

---

## TERCERA VUELTA · LA PANTALLA SE PARTIÓ EN DOS — 2026-09-14

### EL DEFECTO QUE LA MOTIVÓ, Y ES DE NEGOCIO, NO DE DIBUJO

La pantalla mostraba el **período EN CURSO**. El día que Emanuel la abrió, la
semana en curso había arrancado ese mismo día: la pantalla le mostraba lo que
todavía no había pasado y le escondía lo que tenía que cobrar. Un tablero de
cuentas a cobrar que muestra el período abierto está mostrando un número que
nadie puede reclamar todavía.

Y el chip global de período era la misma equivocación una capa más arriba: **cada
local corta su semana el día que acordó**, así que "Semana" arriba de la pantalla
tenía que elegir UN período para todos, y cualquiera que eligiera era el
equivocado para alguien.

### CÓMO QUEDÓ REPARTIDO

**Pantalla 1 · la entrada** (`EntradaDeLocales`, dentro de `TableroMovil`): solo
la lista de locales. Sin chips, sin importes, sin transferencias y sin buscador.
Cada local es una tarjeta con una franja de acento de 6 px, una ilustración de
fachada de 56 px, el nombre y un `›`.

**Pantalla 2 · adentro del local**
(`app/modulos/transferencias/local/[localId]/page.jsx`): el período **CERRADO**
—"Para cobrar"—, la semana en curso como un renglón compacto, el agrupamiento por
día de la vuelta anterior, y el buscador por número.

**Por qué una ruta y no un estado**, que fue una de las tres preguntas: por el
botón atrás del teléfono —con estado, "atrás" saldría de Transferencias entero en
vez de volver a la lista— y porque al volver del detalle de una transferencia hay
que caer en el local. Con una ruta las dos son gratis. De yapa, el arnés puede
abrirla por URL sin tocar la lista. No choca con `/modulos/transferencias/[id]`
porque `local` es un segmento estático y Next lo resuelve primero, igual que
`corte-de-semana`.

**Qué es el período cerrado:** `rangoDelPeriodoCerrado` en
`lib/transferencias/periodoDePago.js`, que es el período que contiene al día
ANTERIOR al arranque del que está en curso. No es "restarle siete días": con
`unidad = MES` restar siete no da el mes pasado, y con un corte cambiado tampoco.
Se apoya en `rangoDelPeriodo`, que ya sabe dónde empieza cada período.

**Y si todavía no hay ningún período cerrado**, que era la segunda pregunta: el
rango **existe igual** —es una cuenta de calendario, no de datos— y lo que puede
venir vacío es la lista. Entonces se dice: "No se le envió nada en ese período."
No se esconde el bloque ni se cae a la semana en curso, porque las dos cosas
harían pensar que el dato falta cuando lo que pasa es que no hubo movimiento.

### LA FACHADA: POR QUÉ SUS COLORES ESTÁN EN `lib/`

Los hex de la ilustración **no son interfaz, son un dibujo**. El verde de un toldo
es como el color de una foto: no cambia porque el usuario pase a tema oscuro.

Viven en `lib/transferencias/fachadaDelLocal.js` y hay una consecuencia práctica
que era parte del pedido: el trinquete (`scripts/hardcodeo.mjs`) enumera
`app/**/*.jsx` y `components/**/*.jsx`, y `check-theme-tokens.js` mira
`app/modulos` y `components/caja`. **`lib/` no entra en ninguno de los dos.** Así
que los hex de la fachada no se cuentan como hardcodeo de interfaz, y no porque
se los haya escondido, sino porque están en el único lugar donde son lo que dicen
ser: datos.

`FachadaDelLocal.jsx` no escribe **ni un solo color**. La primera versión sí
—cinco neutros sueltos en el JSX, tres líneas debajo del comentario que afirmaba
lo contrario— y **el trinquete los contó, con razón**. Se mudaron a
`NEUTROS_DE_LA_FACHADA` y hay un candado (V6) que sostiene la afirmación. La
franja de la tarjeta es otra cosa y sí sale del tema: eso sí es interfaz.

### EL DEFECTO DE LA PALETA, QUE LO ATRAPÓ SU PROPIO CANDADO

La paleta se deriva del **nombre** del local, no del id: el id no viaja a las
pruebas —cambia en cada siembra— y el nombre sí, así que un candado puede afirmar
"mini el 7 es ámbar" y eso vale en cualquier base.

La primera versión era un **djb2 pelado** y con los cuatro locales de producción
**los cuatro daban azul**. No fue mala suerte, es aritmética: `33 ≡ 1 (mod 4)`, así
que `h % 4` dependía únicamente de la suma de los códigos de los caracteres, y
nombres parecidos —"mini el 7", "Mini unidas"— caían juntos. Con cuatro paletas y
un módulo de 4, los bits bajos de djb2 no alcanzan.

El arreglo es un paso de **mezcla** después del djb2 (el `fmix32` de MurmurHash3):
tres xor-shifts y dos multiplicaciones que reparten la entropía de los bits altos
hacia los bajos. Con `Math.imul` y no `*`, porque la multiplicación de JavaScript
pasa por punto flotante y pierde precisión arriba de 2^53. Medido después del
arreglo: mini el 7 ámbar, Casiano casas verde, Minimarket ayala rojo, Mini unidas
azul. **Cuatro locales, cuatro paletas.**

Lo que importa del episodio no es el hash: es que **el candado estaba escrito
sobre los nombres REALES de producción**. Con un fixture de "local a / local b" no
habría mostrado nada, y la pantalla habría salido con cuatro fachadas idénticas
cumpliendo con un suite en verde. Por eso V4 ahora exige las cuatro paletas
distintas, y no "al menos dos".

### LOS DOS DEFECTOS QUE ENCONTRÓ ABRIR LA PANTALLA

Los dos con la misma forma de siempre: suite en verde, build limpio, y el defecto
viviendo en el espacio entre dos piezas que cada candado probaba por separado.

**1 · `localId` es un parámetro RESERVADO de toda la API.** La pantalla de adentro
pedía `/api/transferencias/tablero?localId=<el local>` y el depósito recibía un
**403 — "Local fuera de tu alcance"** en vez de la cuenta. No es un defecto del
módulo: `resolveVistaOperativa` (`lib/grupos.js`) lee `localId` como "el alcance
que estoy pidiendo" y, para una sesión que no es admin, exige que sea el suyo. El
depósito es un local como cualquier otro.

Y el 403 estaba **bien**: acá no se cambia de alcance. El alcance sigue siendo el
del depósito —mira lo que él despachó— y esto es un filtro por DESTINO. Dos cosas
distintas no pueden compartir el nombre del parámetro. Se renombró a `destino`, y
el candado **V14** lo sostiene de los dos lados. El segmento de la URL sí sigue
llamándose `localId`: ahí no hay ninguna convención que pisar.

**2 · El período vacío se decía DOS veces, y con dos redacciones.** En el local sin
movimiento la tarjeta decía "No se le envió nada en ese período." y abajo aparecía
"No hay transferencias en el período cerrado.". Dos frases distintas para un solo
hecho se leen como dos hechos. Lo dice la tarjeta, que es donde está el importe en
cero; y el buscador tampoco se dibuja si no hay filas, porque no puede encontrar
nada. Candado **V15**.

Ninguno de los dos lo vio un candado. A los dos los encontró abrir la pantalla —el
primero con el arnés, el segundo mirando la captura.

### LOS QUINCE CANDADOS

`components/transferencias/entradaYPeriodoCerrado.test.mjs`. Los que hay que
conocer: V4 (la paleta es estable entre corridas **y reparte**), V6 (el componente
de la fachada no tiene un solo hex), V12 (sin período cerrado el rango existe y se
dice que está vacío), V13 (la ruta tiene los dos modos y el cerrado sale de la
puerta, no de una resta a mano), V14 (`destino` y nunca `localId`) y V15 (el vacío
se dice una sola vez).

### LA SIEMBRA Y EL ARNÉS TAMBIÉN CAMBIARON, Y HACÍA FALTA

**La siembra ahora pone dos transferencias en el PERÍODO CERRADO**, de días
distintos: una recibida con una diferencia y otra sin recibir. Las que había son
de hoy y de ayer, o sea del período EN CURSO, y desde esta vuelta la pantalla
muestra el cerrado. Sin las nuevas, las afirmaciones sobre el agrupado por día,
sobre la recibida y sobre el buscador quedaban mirando una lista que nunca tiene
filas: no se pondrían rojas, se volverían **inalcanzables**.

Las fechas salen de `rangoDelPeriodoCerrado`, la misma función que la pantalla, y
no de una resta: "hace ocho días" cae fuera del período cerrado si la siembra
corre justo el día del corte. Por eso la siembra ahora **se corre con
`node --import ./scripts/alias-loader.mjs`** — esa función resuelve un alias `@/`.
El comando actualizado está en `docs/architecture/base-de-pruebas-v15.md`.

**El arnés** (`scripts/capturas-tablero-movil.mjs`) pasó a afirmar en negativo
sobre la entrada —ni chips, ni importes, ni buscador, ni transferencias— y ganó la
pantalla de adentro, el buscador ejercido, el vuelta-atrás y la comparación de los
dos cortes. Necesita un argumento nuevo, `--recibida-cerrada <id>`, que imprime la
siembra; sin él **aborta**, no mide de menos.

Una afirmación que escribí y saqué, porque era falsa: "dos locales distintos no
comparten paleta". Hay cuatro paletas, así que dos nombres cualesquiera pueden
coincidir sin que nada esté roto — y los dos del sembrado caen los dos en verde.
Sostenerla habría obligado a renombrar un local del sembrado para que la foto
saliera linda. Lo que el arnés afirma ahora es que el navegador dibuja **la paleta
que la función decide** para ese nombre, importando la misma función que el
componente. Que reparta se mide en V4, contra los nombres reales.

**Corrida final: 68 afirmaciones en verde, 0 capturas con desborde.** El arnés
sigue sin ser idempotente —guarda un acuerdo— así que va una corrida por siembra.

### LO QUE QUEDA ANOTADO Y NO SE HIZO

- **El escritorio.** Todo esto es móvil. De 768 px para arriba la pantalla sigue
  siendo la de la segunda vuelta.
- **`tipo` contra `es_deposito`**, que ya venía anotado de la vuelta anterior.

### LAS TRES CORRECCIONES DEL 2026-09-14, VISTAS EN EL CELULAR SOBRE `98fbb667`

**1 · LA TARJETA ESTABA PINTADA DEL COLOR DEL FONDO, Y EL NOMBRE DE LA CLASE
ENGAÑA.**

`.sunmi-surface` se llama "surface" y pinta `--app-bg`, que es el fondo de la
APLICACIÓN. Una tarjeta con esa clase queda exactamente del color de la página y
lo único que la separa es el borde.

No era cosa del tema crema, que es donde se vio: **medido en los catorce,
`--app-bg` y `--card-bg` son distintos en los catorce**, así que la tarjeta
perdía su fondo propio siempre. En `ambarCaja` —crema `#FFFBEB` contra blanco
`#FFFFFF`— es donde los dos tonos están más cerca y donde se nota.

Se agregó `.sunmi-bg-card` al kit. **No sirven las dos que ya pintan `--card-bg`**:
`.sunmi-card` trae además `rounded-2xl`, `shadow-md`, `p-4`, `mb-3` y
`backdrop-blur-md`, que cambiarían la geometría; `.sunmi-card-surface` trae el
borde en `--card-border`, y el diseño pide border/default. Los dos bordes
coinciden en 12 de los 14 temas, y en `sunmiLight` el de tarjeta es MÁS claro —o
sea menos separación, lo contrario de lo que esto viene a arreglar—.

**Y EL ALCANCE ES MUCHO MAYOR QUE ESTA PANTALLA, aunque acá solo se tocó la
tarjeta de local.** Contado con `git grep` sobre `app/**/*.jsx` y
`components/**/*.jsx`: **80 usos de `sunmi-surface` junto a `rounded` en 39
archivos**, o sea 80 lugares donde algo con forma de tarjeta se pinta del color
de la página. Ocho de esos archivos son de transferencias —`BloqueLocal`,
`CabeceraDeCuenta`, `CuentaDelPeriodoCerrado`, `DiaDeTransferencias`,
`FilaCorteDeSemana`, `FilaTransferenciaLocal`, `ColumnSettingsPanel` y
`ReporteTransferenciasPorDestino`—. **No se tocaron**: el pedido era la entrada y
nada más. Queda como deuda medida, no como sospecha.

Ojo al revisarlo: `sunmi-surface-soft` es OTRO token —`--app-input-bg`— y ése sí
es distinto del fondo. No entra en la cuenta.

**2 · FALTABA EL RÓTULO "LOCALES".** Va con las mismas clases que los dos rótulos
de sección que el módulo ya tenía: `text-xs2 font-semibold sunmi-text-muted
tracking-wider`. El diseño pide 10 SemiBold en text/secondary con
letter-spacing 0,6; los tres primeros dan exacto y el cuarto queda en **0,5 px**,
que es lo que `tracking-wider` —0,05em— vale a 10 px. Escribir `tracking-[0.6px]`
sería hardcodeo en la pantalla, y sumar una entrada a la escala para ganar una
décima de píxel dejaría este rótulo distinto de sus dos hermanos por algo que no
se ve. **Queda anotado, no decidido en silencio.**

No se dibuja si la lista está vacía ni mientras carga: un encabezado arriba de
nada promete contenido que no está.

**3 · EL ORDEN NO ERA ESTABLE.** `relacionesDelDeposito` consulta `grupoLocal`
**sin `orderBy`**, y sin `ORDER BY` Postgres devuelve las filas en el orden que
le conviene al plan. En producción la lista arrancaba por "Casiano casas" en una
carga y por "mini el 7" en la siguiente.

El orden se puso en `destinosDeTransferencia` —la puerta— y no en la pantalla que
lo reportó, porque **los cuatro consumidores tenían el mismo problema**: la
entrada, la lista de bloques del depósito, el corte de semana y el desplegable de
destinos al crear una transferencia. Las cuatro son listas que mira una persona y
ninguna tiene un orden propio que defender. La del depósito sí lo tiene —por
plata, con los vacíos al final— y lo aplica DESPUÉS, en `bloquesPorLocal`, así
que este no lo pisa.

Es `localeCompare` y no un `orderBy` de Prisma: un `orderBy` ordenaría con la
intercalación de la base, que no es la misma en todas las instalaciones, y ningún
candado podría afirmarlo porque los candados no tocan la base.

Medido: lo que sostiene el orden es `localeCompare`, **no** `sensitivity: "base"`.
Con `a < b` de strings, "mini el 7" se va al final —en ASCII las minúsculas van
después de todas las mayúsculas— y el candado da rojo. Sin `sensitivity` el orden
no cambia para estos cuatro nombres; se deja igual porque fija la intención y el
comportamiento ante un cambio de intercalación de Node, y eso está escrito como
lo que es: una decisión, no una necesidad.

Y un detalle que parece invertido y no lo es: **"Mini unidas" va antes que
"Minimarket ayala"**, porque el espacio ordena antes que una letra. La primera
versión del candado lo esperaba al revés y se puso roja sobre una salida
correcta.

### EL CANDADO QUE ESTUVO VERDE POR EL MOTIVO EQUIVOCADO

**Y se desplegó así.** Los dos censos de `lib/layout/accionDePagina.test.mjs`
—quién consume el slot de acción y quién registra un título— enumeran con
`git grep -l`, que **solo mira archivos trackeados**.

En la tanda anterior la suite se corrió con
`app/modulos/transferencias/local/[localId]/page.jsx` todavía **sin commitear**,
así que los dos censos no lo vieron y dieron verde. Se pusieron rojos recién en
esta tanda, con el archivo ya trackeado — o sea **después de desplegar**.

El candado no falló: **no pudo mirar**. Es la misma familia que la nota de
`git ls-files` en `CLAUDE.md`, sobre otro comando, y el arreglo es de una
palabra: `git grep --untracked`. Verificado por contraprueba —un consumidor nuevo
sin commitear ahora pone el censo en rojo— y las dos listas se actualizaron a
propósito, que es para lo que el censo existe.

### ESTADO AL CERRAR

Suite **5898 en verde**, 0 en rojo (1 TODO viejo: los siete candados del contrato
de `EXCLUIDO`). Trinquete sin cambios en los siete contadores. Build limpio. Arnés
en **72 afirmaciones**, 0 capturas con desborde.

**Producción corre `98fbb667`**, que es la tercera vuelta SIN las tres
correcciones de arriba. Éstas quedan empujadas y sin desplegar.
