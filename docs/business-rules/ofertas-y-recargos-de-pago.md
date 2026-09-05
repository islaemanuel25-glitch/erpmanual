# Ofertas comerciales y recargo por medio de pago

> **Relevado sobre la rama** `feat/ofertas-y-recargos-por-medio-de-pago`,
> commit base `65336ad5eb1542306c4cda92d66318c70eb1e6c8`.
> **Sin mergear y sin desplegar.**
>
> Cada afirmación va etiquetada: **[VERIFICADO]** comprobado corriendo algo en
> este repo · **[DECISIÓN]** se decidió así y el porqué está escrito ·
> **[PENDIENTE]** falta hacerlo · **[SIN VERIFICAR]** está escrito pero no se
> ejerció.

---

## Los tres conceptos, que no se pisan

**El precio normal** sigue viviendo donde vivía: `ProductoLocal.precio_venta`,
con `ProductoBase.precio_venta` como respaldo. **Una oferta nunca lo modifica.**
Cuando la oferta termina no hay nada que restaurar, porque nunca se tocó nada.
**[VERIFICADO]** — no hay un solo `update` de `precio_venta` en todo el módulo.

**La oferta** es una excepción temporal de precio sobre productos concretos de un
local, con una ventana y una condición de pago. Vive en `Oferta` y
`OfertaLinea`. **[VERIFICADO]** — `prisma/schema.prisma`.

**El recargo comercial** es lo que el local le cobra al cliente por pagar con un
medio determinado. Vive en `RecargoPagoLocal`, por local y por medio.
**[VERIFICADO]**

### Y el cuarto, que es el que hay que no confundir

**La comisión bancaria NO es un recargo.** Son dos números distintos, con dos
dueños distintos y dos destinos contables distintos:

| | Recargo comercial | Comisión bancaria |
|---|---|---|
| Quién lo cobra | el comercio | el procesador |
| A quién | al cliente | al comercio |
| Qué hace con el total | lo **sube** | no lo toca; baja el **neto** |
| Dónde se configura | `RecargoPagoLocal`, por **local** | `ConfiguracionGrupo.comision*`, por **grupo** |
| Dónde se congela | `Venta.recargoPagoImporte` | `VentaPago.comision` |

Un débito con 5 % de recargo y 7 % de comisión sobre una venta de $10.000 da
**tres números distintos**: el cliente paga $10.500, el banco se queda $735, el
comercio recibe $9.765. Ninguno se deduce de otro sin saber los dos porcentajes.
**[VERIFICADO]** — es el caso 13 de `lib/ofertas/motorVenta.test.mjs`.

Por eso el recargo vive en su propio directorio, `lib/recargos-pago/`, todo lo
que exporta dice "recargo" en el nombre, y ese archivo no importa nada de
comisiones. **[DECISIÓN]**

---

## El orden de cálculo, en un solo lugar

`lib/ofertas/motorVenta.js` → `calcularVentaComercial`. Es puro, no toca la base
y está cubierto por 23 candados. **[VERIFICADO]**

1. Precio normal de cada línea — **entra ya resuelto** (ver la deuda de abajo).
2. Oferta vigente para esa línea — entra ya resuelta por vigencia y local.
3. ¿Se cumple la condición de pago de la oferta?
4. Precio de cada línea: el de oferta si aplica, el normal si no.
5. Subtotal comercial.
6. Descuentos existentes: cliente, manual y puntos, sobre la mercadería.
7. Recargo del medio de pago; con varios medios, **el mayor**.
8. Total final.

Los tenders, la comisión bancaria y la persistencia van **después** y fuera de
este motor: la comisión se calcula sobre los tenders ya cerrados y es plata que
sale del comercio, no del cliente. **[DECISIÓN]**

### Reglas que decidieron los casos del pedido

- **Una oferta SOLO EFECTIVO exige que el único medio sea efectivo.** Un pago
  mixto de $9.999 en efectivo y $1 en débito no la cumple. **[VERIFICADO]**
- **Con varios medios manda el mayor recargo, sobre la venta completa.** Se mira
  la lista de medios, no los importes: prorratear daría un número distinto para
  la misma venta según cómo la parta el cajero. **[DECISIÓN]** **[VERIFICADO]**
- **Los descuentos existentes se apilan sobre el precio con oferta.** Un cliente
  con 10 % sobre una oferta de $900 paga $810. Es lo que dice el orden acordado
  —la oferta es el paso 6 y los descuentos el 8—. **[DECISIÓN]**
- **Un servicio de importe variable no recibe oferta**, igual que no recibe
  descuentos ni puntos. **[VERIFICADO]**
- **Una línea de peso cargada por importe tampoco**, y se dice por qué: el cajero
  fijó cuánta plata cobra, así que un precio menor no bajaría el total sino que
  subiría los gramos, y el descuento por ofertas quedaría en cero pesos
  mintiendo. **[DECISIÓN]**
- **FIADO no lleva recargo.** No es una forma de cobrar sino una promesa de pago;
  el recargo se define cuando se cobra de verdad. **[DECISIÓN]**
- **La ganancia de mercadería se mide ANTES del recargo.** Si no, vender lo mismo
  con débito "daría más ganancia de producto" que con efectivo. En una venta sin
  recargo los dos números son idénticos. **[DECISIÓN]** **[VERIFICADO]**

---

## Estados: derivados, no guardados

**No hay columna `estado` en `Oferta`.** Los seis estados —BORRADOR, PROGRAMADA,
ACTIVA, REVISAR, VENCIDA, FINALIZADA— se derivan en `lib/ofertas/estados.js` de
`publicadaEn`, `finalizadaEn`, la ventana y las líneas marcadas.
**[DECISIÓN]** **[VERIFICADO]**

Es el mismo criterio de `Venta.anuladaEn`: un estado guardado más las fechas que
lo determinan son dos fuentes de verdad, y el día que discrepan no hay forma de
saber cuál manda. De yapa, **no hace falta ningún proceso que a medianoche pase
ofertas de PROGRAMADA a ACTIVA**.

**VENCIDA no estaba en la lista pedida y se agregó.** Sin ella, una oferta cuya
fecha final pasó y que nadie finalizó se vería ACTIVA —mintiendo— o
desaparecería. Es justo el estado donde hay que decidir entre renovar, modificar
o finalizar. **[DECISIÓN]**

La ventana es **semiabierta**: `[inicioEn, finEn)`. En el instante `finEn` la
oferta ya no rige. **[VERIFICADO]**

### Los seis, contra el código

Cotejado el 2026-09-04 contra `lib/ofertas/estados.js`. El enum `ESTADO_OFERTA`
tiene exactamente estas seis claves y ninguna más, y `estadoOferta()` las
pregunta **en este orden, que ES la regla**:

1. **FINALIZADA** — hay `finalizadaEn`. Una decisión humana gana sobre cualquier
   fecha.
2. **BORRADOR** — no hay `publicadaEn`. No rige aunque sus fechas ya hayan
   pasado.
3. **VENCIDA** — pasó `finEn` y nadie la finalizó. (También cae acá una oferta
   publicada sin ventana, que es un dato roto: se falla hacia "no cobra
   distinto".)
4. **PROGRAMADA** — todavía no llegó `inicioEn`.
5. **REVISAR** — está rigiendo y hay una línea con `revisionPendienteDesde`.
6. **ACTIVA** — está rigiendo y no hay nada que mirar.

**REVISAR va antes que ACTIVA a propósito.** Una oferta marcada sigue
aplicándose —eso lo decide `ofertaVigente`, no esto—, así que preguntando ACTIVA
primero REVISAR sería inalcanzable y el aviso no aparecería nunca.

**El sexto es VENCIDA, es derivado y no estaba en la especificación original.**
No es un estado implícito ni un accidente: sin él, una oferta cuya fecha final
pasó y que nadie bajó se vería ACTIVA —mintiendo, porque ya no se aplica— o
desaparecería de la vista. Es exactamente donde hay que decidir entre renovar,
modificar o finalizar. Los cinco de la lista pedida —BORRADOR, PROGRAMADA,
ACTIVA, REVISAR, FINALIZADA— están los cinco y significan lo que decía el pedido.

`ESTADOS_OPERATIVOS` son los cinco del trabajo diario; `ESTADOS_ARCHIVADOS` es
solo FINALIZADA. **[VERIFICADO]**

---

## El precio de oferta: una sola fuente

Se guarda **el precio**, no el porcentaje. El descuento en % se deriva contra
`precioNormalReferencia`, que es un snapshot del momento de la carga.
**[DECISIÓN]** **[VERIFICADO]**

Si se guardara el porcentaje, el precio de oferta se movería solo cada vez que
cambia el precio normal: subir la lista un 10 % correría también las ofertas
vigentes, sin que nadie lo decida y sin que quede rastro.

La pantalla acepta las dos formas de cargar y convierte al entrar, usando las
mismas funciones que valida el servidor. **[VERIFICADO]**

---

## Cambió el costo: se avisa, no se toca

El precio de oferta **nunca** se modifica solo. La línea se marca
(`revisionPendienteDesde`), la oferta pasa a REVISAR y **se sigue aplicando
exactamente como está**: lo que está publicado en la góndola es un compromiso con
quien entró al local por él. **[DECISIÓN]**

Se muestra el "de → a" completo: costo anterior, costo actual, variación en pesos
y en porcentaje, precio de oferta, margen antes y margen ahora. **[VERIFICADO]**

**Confirmar la revisión vuelve a fotografiar el costo.** Sin eso el mismo cambio
volvería a avisar para siempre y la gente aprendería a ignorar el aviso — que es
la única forma de romper un control sin tocar una línea de código.
**[DECISIÓN]**

**Si el costo vuelve al valor de referencia, la marca se levanta sola.** Una
carga equivocada que se corrige no puede dejar una oferta en REVISAR para
siempre. **[VERIFICADO]**

---

## Solapamiento: se evita desde la carga

Para el **mismo producto del mismo local**, dos ofertas cuyas ventanas se solapan
están en conflicto, **sin importar su condición de pago**. **[DECISIÓN]**

Se podría haber permitido convivir una SOLO_EFECTIVO con una CUALQUIER_MEDIO, y
es tentador porque parecen complementarias. No lo son: en una venta 100 %
efectivo las dos cumplen su condición y habría que desempatar, y eso es un motor
de prioridades. Se prefirió evitar la ambigüedad desde la carga.

Se valida dentro de la transacción y con un lock por local, en los tres momentos
en que el conjunto puede cambiar: al crear, al mover las fechas y al publicar
—un borrador no compite con nadie—. **[VERIFICADO]** en el código;
**[SIN VERIFICAR]** contra Postgres.

Queda una defensa de segunda línea si algo se colara igual: al resolver la oferta
en el POS, con dos vigentes gana **la más barata para el cliente**. Es la única
desambiguación que no termina en un reclamo en el mostrador. **[DECISIÓN]**

---

## Ventas históricas: autosuficientes

Cada venta guarda su propio snapshot y **no depende de que la oferta siga
existiendo**. **[VERIFICADO]** — `prisma/schema.prisma`.

En `Venta`: `descuentoPromocional`, `totalAntesRecargo`, `recargoPagoPct`,
`recargoPagoImporte`, `recargoPagoMedio`. En `VentaDetalle`: `precioNormal`,
`ofertaId`, `ofertaNombre`, `descuentoPromocional` — más `precio`, que ya era el
precio realmente cobrado, y `ganancia`, que ya se calculaba contra él.

`VentaDetalle.ofertaId` va con **ON DELETE SET NULL** y el nombre queda congelado
en `ofertaNombre`: borrar una oferta nunca puede llevarse ni bloquear una venta.

**Las ventas anteriores a esta tanda quedan con esas nueve columnas en `null`,
sin backfill.** Un `null` ahí dice la verdad —se cobraron en un mundo sin ofertas
ni recargos— y escribir `0` convertiría una ausencia en una afirmación.
**[DECISIÓN]**

### Borrar o archivar

- **Nunca se usó en una venta** → se puede eliminar. Y "nunca se usó" se pregunta
  contando líneas de venta que la apuntan, no deduciéndolo del estado: una oferta
  puede estar vencida y haber vendido muchísimo. **[VERIFICADO]**
- **Se usó** → no se borra, se **finaliza**. Técnicamente se podría borrar sin
  dañar el histórico, pero se perdería poder abrir la oferta y ver qué se había
  configurado. **[DECISIÓN]**

---

## Offline: no se aplican ofertas ni recargos

**Política de la v1, explícita en los dos lados.** **[DECISIÓN]**

Una venta encolada se cobró hace rato y se registra ahora. Resolver la oferta
contra el reloj de hoy podría aplicar una que ya venció, o dejar de aplicar una
que regía cuando el cajero cobró.

Y con el recargo es peor que un número equivocado: la cola manda los pagos con el
total que se cobró, así que sumarle un recargo haría que **la suma no dé y la
venta encolada se rechace**. Eso rompería el modo offline.

Por eso, con `origenOffline: true` la venta se registra exactamente como se
cobró. **[VERIFICADO]** — hay un candado que ejerce la forma exacta del ternario,
porque invertirlo sería aplicar ofertas de hoy a una venta de ayer.

**[PENDIENTE]** El POS todavía no muestra el cartel de "sin conexión no se
aplican ofertas ni recargos". Va junto con el resto de la integración de la
pantalla de cobro.

---

## Combos

Una oferta se resuelve contra el `ProductoLocal` de la línea. En una línea de
combo ese `ProductoLocal` es **el del combo**, así que **una oferta sobre un
componente no cambia el precio del combo**. **[VERIFICADO]** — caso 16.

Un combo **sí** puede estar ofertado explícitamente: es un `ProductoLocal` como
cualquier otro y su precio es manual, sin lista. **[VERIFICADO]** — caso 16 bis.

---

## La pantalla de cobro: un total por medio de pago

Con ofertas y recargos **el total deja de ser un número**. El mismo carrito vale
$8.100 en efectivo y $9.450 con débito, así que el panel de cobro muestra el
importe de **cada medio antes de que el cajero toque ninguno**. **[DECISIÓN]**

El ejemplo, con 9 "Nueve de Oro" a $1.000, oferta de solo efectivo a $900 y el
local con débito 5 %, crédito 10 % y Mercado Pago 5 %:

- Efectivo $8.100 — la oferta entra, no hay recargo.
- Débito $9.450 — la oferta se pierde, y $9.000 + 5 %.
- Crédito $9.900 — $9.000 + 10 %.
- Mercado Pago $9.450 — $9.000 + 5 %.

Los cuatro salen de `lib/ofertas/previewPos.js`, que **no calcula nada**: llama a
`calcularVentaComercial` una vez por medio. Es el mismo motor que corre en
`pos-ventas/crear`. Una segunda matemática al lado del motor no se rompe el día
que se escribe: se rompe el día que el motor cambia y ella no. **[VERIFICADO]** —
hay un candado que calcula el mismo caso por los dos caminos y exige que den
idéntico.

**El precio normal NO se reemplaza por el de oferta en la línea del carrito.** Se
muestra `$1.000 · Oferta efectivo $900`. Hasta saber cómo se paga, el promocional
es una posibilidad; prometer $900 y después cobrar $1.000 porque el cliente sacó
la tarjeta es peor que no haberlo mostrado. **[DECISIÓN]**

**Sin ofertas en el carrito y sin recargos configurados los cuatro dan lo mismo y
el panel queda exactamente como estaba**: un total grande arriba y cuatro
botones. Es el caso de casi todas las ventas, y hay un candado que lo fija.

### Pago dividido

El panel recalcula el total **cuando cambia el conjunto de medios**, no cuando
cambian los importes: agregar débito a un pago en efectivo puede perder una
oferta de solo efectivo *y* sumar un recargo. Los importes tipeados tienen que
sumar ese total nuevo. **[VERIFICADO]**

El aviso —"Pago combinado. Se aplicará la condición más alta… Las ofertas
exclusivas de efectivo no aplican."— sale de `avisoPagoCombinado`, el mismo texto
que usa el backend, para que los dos digan lo mismo.

### Cuando la pantalla y el servidor no coinciden

El POS manda `totalPantalla`: el importe que el cajero vio en el botón que
apretó. Si la cuenta del servidor da otra cosa, **la venta se rechaza** con
`TOTAL_DESACTUALIZADO` y no se registra nada. **[DECISIÓN]**

Sin esto el desenlace era silencioso, que es el peor de los dos: con un solo
medio el backend armaba el tender con SU total, la venta entraba por $8.300, la
pantalla había pedido $8.100, y el faltante aparecía recién en el arqueo sin
forma de saber de qué venta salió.

**No hay reintento automático**: se muestran los dos números y el cajero vuelve a
elegir el medio. Reintentar solo sería cobrar un importe que nadie miró.

La cola offline queda afuera del control a propósito: una venta encolada se cobró
hace rato, no aplica ofertas ni recargos, y su total es el que entró al cajón.

---

## El ticket

**El ticket se arma con las líneas que devuelve el backend, nunca con el
carrito.** `pos-ventas/crear` devuelve `breakdown.lineas`, que son las filas
recién escritas en `VentaDetalle`: `precio` ya es lo COBRADO. **[DECISIÓN]**

Con el carrito como fuente, una venta con oferta imprimía `9 × $1.000` arriba de
un total de $8.100 — un papel que no cierra y que el cliente mira. Ahora
cantidad × precio suma el subtotal impreso.

Para que además se pueda **leer** por qué el total no es la suma de los precios
de lista, el papel agrega dos renglones, y solo cuando corresponde:

- `Ahorro por ofertas −$900`
- `Recargo Débito 5 % +$450` — **nombra el medio que impuso la condición**, que
  en un pago combinado puede no ser con el que se pagó más. "Recargo: $450" a
  secas se lee como un cargo arbitrario.

El ahorro va como un renglón y no como una columna por línea: el papel tiene
58 mm y una segunda columna de precios tachados lo vuelve ilegible.

**La reimpresión sale de los snapshots persistidos**, no de las ofertas vigentes
hoy. Recalcular daría otro papel para la misma operación, y el que quedó en la
mano del cliente sería el falso. **[VERIFICADO]** — `VentaDetalle` congela
`precio`, `precioNormal`, `ofertaNombre` y `descuentoPromocional`, y `ofertaId`
va con `SetNull` para que el nombre sobreviva a que la oferta se borre.

---

## Lo que falta, y por qué

### 1. El sello "OFERTA" en Productos

La API ya lo devuelve: `/api/productos/listar` trae `item.oferta` con el nombre,
el precio y la condición. **[SIN VERIFICAR]**

**[PENDIENTE]** Pintarlo en la tabla y en la tarjeta. No se hizo porque agregar
un sello mueve píxeles y esa pantalla se acaba de rehacer; sin el arnés de
capturas no hay forma de comprobar que no se corrió nada.

### 2. Quién ejecuta el barrido — RESUELTO el 2026-09-05

**El cambio de costo pasó a ser por EVENTO. El vencimiento sigue siendo
oportunista, pero ahora se cuelga del POS y no de la pantalla de Ofertas.**

**Cambio de costo.** Cuando una escritura cambia un `precio_costo` de verdad, la
oferta queda en REVISAR y sale la notificación **sin que nadie abra nada**.
**[VERIFICADO]** — 57 afirmaciones contra PostgreSQL en
`scripts/pruebas-db/alertas.mjs`.

No se puso un llamado en cada endpoint: ya existía una costura por la que pasan
TODAS las escrituras. `lib/prisma.js` extiende el cliente con
`auditoriaExtension`, que lee el "antes", escribe y deja los dos estados en un
buffer por request, incluso dentro de transacciones. `lib/ofertas/disparadorCosto.js`
no detecta nada por su cuenta: **lee ese buffer** y contesta una sola pregunta —
¿algún `precio_costo` quedó distinto de como estaba?—. Se registra una vez, al
lado del flush de auditoría en `lib/auth.js`, y corre en `after()`: un request
que no toca costos no paga nada.

Alcanza con saber **qué ubicación**, no qué productos. El barrido compara el
costo congelado de cada línea de oferta viva contra el de hoy, así que su costo
lo fija la cantidad de líneas vivas —decenas—, no el catálogo. Eso lo hace
inmune al tope de 500 filas del buffer: con ver 500 basta para saber que hubo un
cambio, y el barrido después mira todas las líneas igual.

**Vencimiento.** Se dispara al abrir el POS, colgado de `/api/recargos-pago`, que
es la ruta de condición comercial que el POS ya pedía al montar. **Cero requests
nuevos.** Corre en `after()` —abrir la caja no tarda más— y está acelerado a una
corrida cada `MINUTOS_ENTRE_BARRIDOS` (15) por ubicación. **[DECISIÓN]**

No se agregó cron, ni workflow con `schedule`, ni ruta pública, ni secreto
compartido. Sigue siendo oportunista: si el local no abre el POS en las 24 horas
previas, el aviso no llega. La diferencia es que **el POS se abre todos los días
y la pantalla de Ofertas no**.

**Que lo dispare un cajero no le da ningún permiso.** El barrido corre
server-side y no le devuelve nada a quien lo provocó; todo lo que produce son
`Notificacion` con `alcance: "LOCAL"` y `permisoRequerido: "ofertas.ver"`. Un
cajero con solo `pos.usar` lo dispara técnicamente, no ve una sola de esas
notificaciones, recibe 403 al listar ofertas y 403 al llamar al barrido por su
ruta. **[VERIFICADO]** — es el caso 12 de las pruebas.

**La ventana server-side sigue mandando.** Una oferta vencida NO se aplica
aunque nunca se haya emitido su aviso: son dos cosas independientes y la de
cobrar no depende de la de avisar. **[VERIFICADO]** — caso 13.

Lo que sigue abajo es el relevamiento que llevó a esto, y se conserva porque
explica por qué se eligió esta costura y no otra.

### 2 bis. El relevamiento del 2026-09-04

**No hay ningún proceso automático.** Los dos avisos eran **oportunistas**.

Cómo se enumeró, porque el conteo es parte de la afirmación:

- `git grep -n "ofertas/barrido"` → **un solo llamador**:
  `app/modulos/ofertas/page.jsx:93`. El barrido corre cuando alguien abre la
  pantalla de Ofertas, y en ningún otro momento.
- `git ls-files .github/` → antes de esta tanda había **un** workflow, y solo
  construye la imagen.
- `grep "cron\|agenda\|bull\|queue" package.json` → **ninguna dependencia** de
  planificación.
- Los servicios de `docker-compose.prod.yml` son `db`, `app`,
  `erpazul_comprobantes` y `erpazul_fotos_productos`. **No hay contenedor de
  tareas.**
- `git ls-files app/api | grep -iE "cron|tarea|job|scheduler"` → nada.

Entonces, con nombre y apellido:

**A. Cambio de costo → REVISAR: OPORTUNISTA.** Si nadie abre la pantalla de
Ofertas, la línea no se marca y la notificación no se emite. La oferta **sigue
cobrándose al precio publicado** mientras tanto —eso es correcto y deliberado—,
pero nadie se entera de que el margen cambió.

**B. Próximo vencimiento: OPORTUNISTA, y es el más frágil.** El aviso se emite
dentro de la ventana de 24 h previas al final. Si el local pasa esas 24 h sin
abrir la pantalla, **la ventana se cierra y el aviso no llega nunca**: la oferta
vence sin que nadie lo haya visto venir.

**No se construyó infraestructura nueva** para arreglarlo, a propósito. Las
alternativas mínimas, con su costo, para decidir:

- **Para (A), disparar por evento en vez de por reloj.** El cambio de costo es un
  hecho puntual, no una condición que haya que ir a mirar: se podría llamar al
  barrido —o solo a `planDeRevision` para el producto tocado— donde el costo se
  escribe. `git grep -l "precio_costo" -- 'app/api/**/route.js'` da 48 archivos,
  de los cuales unos 14 escriben de verdad (edición de producto, importación,
  aplicación de listas de proveedor, recepción de transferencias, sincronización
  de grupo). Es la solución correcta y **no necesita ningún planificador**, pero
  toca catorce rutas de cinco módulos y es una tanda propia.
- **Para (B) no hay forma sin un reloj.** Un vencimiento es tiempo, no un evento
  del sistema. Lo mínimo sería un workflow de GitHub Actions con `schedule:`
  pegándole a un endpoint del VPS, y eso **sí es infraestructura nueva**: exige
  exponer una ruta, un secreto compartido y decidir qué pasa si el runner no
  corre. No se hizo sin que se decida.
- **Lo barato y parcial**, si se quiere tapar el agujero ya: llamar al barrido
  también al abrir el POS. No es automático —sigue dependiendo de que alguien
  entre—, pero el POS se abre todos los días en cada local y la pantalla de
  Ofertas no.

**Mientras tanto, no se puede decir que el módulo tenga alertas automáticas.**
Tiene alertas que se calculan bien cuando alguien las va a buscar.

### 3. La verificación, y qué quedó sin ejercer

**[SIN VERIFICAR]** El 2026-09-04 se escribió
`.github/workflows/verificacion.yml`: un job que levanta un PostgreSQL efímero en
el runner, aplica las 107 migraciones desde cero, comprueba que el schema no
derivó, corre la suite y después `scripts/pruebas-db/ofertas.mjs`, que ejerce las
consultas llamando a los handlers reales de las rutas.

**Ese workflow no se pudo subir.** La clave con la que el repo empuja no tiene
alcance `workflow`, así que GitHub rechaza los archivos de
`.github/workflows` — por SSH con "refusing to allow an OAuth App to create or
update workflow … without workflow scope", y por la API de contenidos con un 404.
El commit existe local y sin empujar.

Consecuencia, y conviene que esté escrita: **nada de esta tanda corrió**. Ni los
candados nuevos, ni las pruebas de base, ni el build. La máquina donde se trabajó
es el VPS de producción: Node 18, sin `node_modules`, y la única base es la que
está cobrando.

Lo que falta ejercer, en orden de riesgo: la migración contra una base limpia,
las consultas de las diez rutas, y **abrir el POS con datos reales**. Esa última
es la que CLAUDE.md nombra con cinco casos: cinco defectos del módulo de
comprobante que ningún candado encontró y que los cinco aparecieron al abrir la
pantalla.

---

## Permisos

`ofertas.ver`, `ofertas.crear`, `ofertas.editar`, `ofertas.finalizar`,
`ofertas.eliminar` y `config_local.recargos_pago`. **[VERIFICADO]** —
`lib/rbac/registry.js`.

Cinco y no uno porque son cinco decisiones de distinto peso. FINALIZAR va
separado de EDITAR —bajar una promoción antes de tiempo es una decisión
comercial, no una corrección— y ELIMINAR es el único que destruye una fila.
Ninguno se ata a un rol: los roles los reciben desde el sistema existente.
