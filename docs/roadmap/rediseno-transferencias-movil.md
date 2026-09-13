# Rediseño de la pantalla de Transferencias (MÓVIL) — dónde quedamos

**Escrito el 2026-09-13 para que la sesión siguiente arranque sabiendo dónde está
parada.** La sesión anterior se cerró porque el conector de Figma no cargaba.

**Estado: el DOMINIO está hecho, verificado y empujado. La PANTALLA no está
empezada.** Último commit de la tanda: `464b8e16`.

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
3. **Un local sin transferencias en el período NO aparece.** Para verlos todos está
   el reporte.
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
