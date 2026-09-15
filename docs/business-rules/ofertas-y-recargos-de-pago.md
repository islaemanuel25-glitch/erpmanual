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

---

## LA PANTALLA MÓVIL DE CREAR OFERTA — 2026-09-15

### EL CAMBIO DE REGLA: LA OFERTA NO TIENE NOMBRE PROPIO

Se llama como el producto, y el nombre lo pone el **servidor** al crear.

Una oferta es UN producto —varios son un combo, que es otra cosa y otra
pantalla— así que pedir un nombre aparte era pedir lo mismo dos veces. La única
oferta que llegó a producción se llama **"91100"** exactamente por eso: el campo
estaba, había que llenarlo, y se llenó con cualquier cosa. El libro de eventos
muestra que arrancó llamándose "9 de oro" y terminó así, tres minutos después.

**No hay campo oculto.** Un campo que nadie ve y que igual viaja es la forma de
que mañana alguien lo llene con otra cosa y las dos fuentes se contradigan. El
nombre sale de `referencias`, que se lee de la base — la misma fuente con la que
se congelan el precio y el costo de cada línea, y por el mismo motivo.

La ruta sigue aceptando varias líneas —es de todos, no solo de esta pantalla— y
las nombra "<primero> y N más". Una oferta sin nombre es un dato roto en la lista.

### EL BUSCADOR ES EL DEL POS, SIN TOCARLO

`components/pos-ventas/BuscadorProductos` tal cual, apuntado con su prop
`apiPath` a `/api/ofertas/buscar-producto`. Es el mismo que usan el POS y Stock:
trae el escáner, el dictado por voz, el auto-agregado por código exacto y el
ranking.

Para que eso sea posible, `buscarProductosOfertables` pasó a devolver la **misma
forma que el buscador del POS** —`precioVenta`, `stock`, `codigoBarra`,
`disponibleParaVenta`, `unidadMedida`, `factorPack`— más el `costo`, que es lo
único que agrega y el motivo por el que el endpoint existe separado: quien arma
una oferta necesita verlo para no fijar el precio a ciegas, y el cajero no tiene
por qué. Los nombres de campo no se eligieron: son los que el componente ya lee.

**`disponibleParaVenta` va siempre en `true`, y es una diferencia deliberada con
el POS.** Allá `false` impide vender y está bien. Acá se está PROGRAMANDO un
precio para los próximos días, y que hoy no haya stock no dice nada sobre mañana.
La pantalla avisa y deja seguir.

### AVISA, NO BLOQUEA — LAS TRES VECES

- **Sin stock hoy:** se dice y se deja cargar.
- **Precio por debajo del costo:** se dice con todas las letras, se informa
  cuánto falta para cubrirlo, y **se puede publicar igual**. Vender bajo costo es
  una decisión comercial legítima y el sistema no opina sobre el negocio. Es la
  misma regla que ya estaba escrita en `validarPrecioOferta`.
- **Precio mayor o igual al normal:** eso sí impide publicar, porque no es una
  oferta — es el precio de siempre con otro nombre.

### LA VENTANA ES SEMIABIERTA Y ESO DECIDE LA CUENTA DE LOS CHIPS

"Hoy" NO termina hoy a las 23:59:59: termina **mañana a las 00:00**. El modelo
guarda `[inicioEn, finEn)` y en el instante `finEn` la oferta ya no rige.
Escribirlo como 23:59:59 deja un segundo muerto donde la oferta no está ni viva
ni vencida, y dos ofertas consecutivas se pisan o dejan un hueco.

Lo que se GUARDA y lo que se MUESTRA son distintos, y por eso son dos funciones:
se guarda el corte a medianoche y se dice "Termina el lunes 21", que es el último
día en que rige.

### QUEDA FUERA DE ALCANCE, DECIDIDO Y NO EMPEZADO

Cuatro cosas, anotadas para que no se las descubra como si faltaran:

1. **Que la oferta se apague sola cuando el stock llega a cero.** Hoy no pasa: la
   oferta sigue vigente y el POS sigue cobrando el precio promocional aunque no
   haya nada que entregar.
2. **El cartel de "sin conexión no se aplican ofertas" en el POS.** La regla está
   implementada —una venta encolada offline no aplica ofertas— pero el cajero no
   ve ningún aviso, así que la venta sale a otro precio y nada lo anuncia.
3. **El sello de OFERTA en la pantalla de Productos.** La API ya lo devuelve y
   nadie lo pinta.
4. **La pantalla de lista de ofertas.** Sigue siendo la que estaba.

### UN HUECO DEL KIT, ANOTADO

`SunmiToggle` es un `div` con `onClick`: no es un `button`, no declara
`role="switch"` ni `aria-checked`, y no acepta etiqueta accesible. El arnés tiene
que llegar a él por la fila que lo contiene en vez de por el control. No se
arregló en esta tanda porque tocar una pieza compartida por otras pantallas es
otra tanda, con sus capturas.

## EL BLOQUE DE PRECIO: MARGEN, REDONDEO Y ARRANQUE EN EL MARGEN REAL

Verificado en código y ejercido en el navegador (`scripts/capturas-oferta-nueva.mjs`,
70 afirmaciones).

### LOS DOS CAMPOS SON EL MISMO NÚMERO VISTO DE DOS MANERAS

`lib/ofertas/precioConMargen.js`. La cuenta es **margen sobre el costo**
—`precio = costo x (1 + % / 100)`— y no margen sobre la venta. Son dos numeros
distintos: el mismo producto da 30 % en uno y 23 % en el otro. En este mismo repo
convive la otra, `margenOferta` en `precio.js`, que calcula sobre el precio y
alimenta la linea informativa "te queda X % de margen". **No se unificaron a
proposito:** son dos preguntas distintas y unificarlas cambiaria un numero que ya
se muestra.

El campo que se esta tocando NO se reescribe. `origen` dice cual es y vuelve tal
cual; el otro se recalcula. Sin eso no se puede tipear "12" sin que salte a "1".

### ARRANCAN EN EL MARGEN DE HOY, NO VACIOS

Al elegir el producto los dos campos ya traen el margen y el precio que ese
producto tiene HOY, para que se vea de donde se parte. Ese estado inicial **no es
una oferta** —es el precio normal escrito en dos campos— y por eso Publicar
arranca apagado y se enciende recien cuando el precio baja del normal.

Sin costo cargado no se dibuja el campo de margen y se dice por que: no hay de
que calcularlo, y dividir por cero daria infinito.

### EL % QUE SE MUESTRA ES EL DE DESPUES DEL REDONDEO

El redondeo usa `redondear100`, la MISMA funcion con la que el POS redondea el
precio unitario. No se escribio una segunda regla: dos reglas de redondeo es como
empezo el problema de escala de la tanda anterior.

Si se tipea 18 % y el redondeo deja un precio que da 16 %, el campo dice 16. El
margen que va a quedar es el segundo, y es el que decide si la oferta conviene.

**Y EL REDONDEO ES HACIA ARRIBA, LO QUE PUEDE CANCELAR LA OFERTA.** Es una
consecuencia que no es obvia y esta medida: sobre un producto de $ 500, escribir
$ 450 con el redondeo puesto termina cobrando $ 500, y la oferta deja de ser una
oferta. La pantalla lo dice —"Redondeado de $ 450,00" y "no es menos que
$ 500,00: todavia no es una oferta"— y Publicar queda apagado. Para cobrar
exactamente lo escrito hay que apagar el interruptor.

### LA DECISION DE REDONDEAR SE GUARDA CON LA OFERTA

`OfertaLinea` gano dos columnas, las dos opcionales y sin DEFAULT
(`20260915180000_oferta_redondeo_y_precio_exacto`, aditiva):

- `redondeoAplicado` — si el interruptor quedo puesto.
- `precioSinRedondear` — el precio exacto del que se partio.

`null` significa **"no se registro"**, que es distinto de "no se redondeo". Un
`false` por defecto diria algo que nadie sabe, y las lineas historicas no lo
saben. Los dos vienen del navegador y NO se recalculan en el servidor, a
diferencia del precio normal y el costo: no son hechos del producto, son lo que
la persona decidio.

### LAS VALIDACIONES AVISAN; UNA SOLA BLOQUEA

- **Precio mayor o igual al normal:** bloquea. No es una oferta.
- **Precio bajo el costo:** avisa con el numero —"te falta $ X para cubrir el
  costo"— y **deja publicar**. Es una decision comercial legitima.
- **Margen negativo TIPEADO:** bloquea, porque es un tipeo y no una decision.
- **Margen negativo DERIVADO de un precio bajo el costo:** NO bloquea. Los dos
  campos estan sincronizados, asi que escribir un precio bajo el costo deja un
  margen negativo escrito que nadie tipeo. Sin esta distincion la pantalla
  frenaria exactamente la venta bajo costo que dice permitir. Lo decide
  `margenInvalido(margen, origen)` y lo cierran los candados M19 y M20.

### LO QUE SE ESTA CARGANDO SOBREVIVE A UN REFRESH

`lib/ofertas/ofertaEnCurso.js`, copia deliberada de
`lib/compras-proveedor/retornoPedido.js`: una clave de `sessionStorage`, una
funcion que serializa y otra que deserializa. **No** se crea un borrador en el
servidor: eso haria aparecer una oferta en la lista que nadie pidio crear.

Se guardan el producto, los dos campos **como texto** —para que "18." a medio
tipear no vuelva como 18—, el interruptor de redondeo, la duracion y el medio de
pago. **NO** se guardan el costo ni el precio normal: se vuelven a pedir al
servidor, porque entre que se fue y volvio pudieron cambiar.

El cartel va **adentro del encabezado**, no del contenedor que scrollea: adentro
se iria de la vista al bajar. No se restaura solo — aparece el cartel y la
persona decide, igual que en compras.

### EL AVISO DE STOCK SIGUE LA CONFIGURACION DEL LOCAL

`avisaSinStock({ permiteVenderSinStock, stock })` en `crearOfertaMovil.js`. Con
la venta sin stock HABILITADA no avisa nunca: un negativo ahi es normal y un
aviso permanente se deja de leer. Con la venta DESHABILITADA y stock en cero o
menos, avisa — y **no bloquea**, porque se esta programando un precio para los
proximos dias y el pedido puede estar por llegar.

Esta como funcion y no como condicion adentro del JSX porque en la base de
pruebas todos los productos tienen stock: adentro del JSX la rama que dibuja el
aviso era inalcanzable y el candado del navegador quedaba verde midiendo siempre
el mismo lado. Las dos ramas se ejercen en O18, O19 y O20.

### DOS DEFECTOS QUE ENCONTRO LA PANTALLA Y NO LOS CANDADOS

1. **La oferta a medio armar se perdia en TODOS los refrescos.** El efecto que
   guarda corre tambien al montar, con `producto` todavia en `null`, asi que
   borraba la clave antes de que el efecto que lee la mirara. No daba ninguna
   senal: el cartel simplemente no aparecia. Lo encontro el arnes recargando de
   verdad. El arreglo no cuenta montajes —React monta dos veces en desarrollo—:
   el efecto **no borra lo que no escribio el**.
2. **El resumen del pie anunciaba el precio TIPEADO y no el cobrado.** Con $ 433
   escritos decia "pasa de $ 500,00 a $ 433,00" mientras el bloque de arriba
   decia que el precio quedaba en $ 500. El pie es la ultima frase que se lee
   antes de publicar, asi que es la que no puede mentir. Aparecio mirando una
   captura; ningun candado podia verlo, porque el pie y el bloque se arman con
   funciones distintas y cada una tenia los suyos en verde.

### DEUDA ABIERTA DE ESTA TANDA

`lineasDePrecio` y `puedePublicar`, en `crearOfertaMovil.js`, **quedaron sin
ningun lector en el repo**: el bloque de precio los reemplazo por `resolverBloque`
y `listo`. Sus 14 afirmaciones siguen en verde defendiendo codigo que ninguna
pantalla llama, que es exactamente el caso que `CLAUDE.md` marca como el que mas
se repite. No se borraron en esta tanda —es otra unidad revertible— pero la
pregunta que hay que contestar no es como arreglarlos: es si esas ramas todavia
tienen que existir.

## LA LISTA DE OFERTAS EN EL CELULAR

Verificado en código y ejercido en el navegador (`scripts/capturas-ofertas-lista.mjs`,
33 afirmaciones) y contra Postgres (`scripts/integracion-terminar-oferta.mjs`,
15 afirmaciones).

### LA TARJETA ES LA DEL KIT, NO UNA NUEVA

`TarjetaOfertaMovil` adapta una oferta a `SunmiProductoCard`, que es la MISMA
pieza que dibujan el catalogo y stock, y la grilla es `SunmiListaProductoCards`.
El adaptador no dibuja un pixel: ni un padding, ni un radio, ni un color. Hay un
candado que compara el armazon contra el de stock —panel, cuerpo, fila del valor
y fila de acciones— y otro que prohibe que aparezca una segunda caja.

Las ranuras: `nombre` el producto, `empresa` la linea de cuando, `marca` el
precio normal y el porcentaje, `valor` el precio de oferta, `aviso` en null,
`destacado` el sello, los dos codigos en `false`, y `acciones` UNA sola: Editar.

### EL SELLO VA EN LA PILDORA, NO EN EL AVISO

`aviso` sale SIEMPRE en ambar y con triangulo, fijo en la pieza del kit. Poner
ACTIVA en verde ahi obligaria a que la tarjeta aceptara un color, y eso cambia
`SunmiProductoCard`, que dibuja tambien el catalogo y stock.

`SunmiPill` gano el color `green`, que NO es un color nuevo: `.sunmi-badge-success`
ya estaba en el kit y sale de `--pos-success`. Es aditivo — los tres colores
anteriores dicen exactamente lo mismo.

### "VENCE HOY" NO ES UN ESTADO

Los estados de una oferta son seis y estan derivados en `estados.js`. "VENCE HOY"
es una oferta ACTIVA sobre la que ademas hay algo que decidir hoy. Si fuera un
estado habria que agregarlo al enum y el POS tendria que saber que hacer con el,
cuando para el POS es exactamente una oferta activa.

Vive en `lib/ofertas/tarjetaDeOferta.js`, la capa que decide que se muestra, y
gana sobre ACTIVA: si ACTIVA se preguntara primero el aviso seria inalcanzable —
el mismo orden que `estados.js` ya resolvio poniendo REVISAR antes que ACTIVA.

### LAS FECHAS SON DIAS CALENDARIO ARGENTINOS

"Termina hoy" comparado con el reloj del proceso da mal desde las 21:00
argentinas, que es justo cuando alguien mira el celular para ver que cierra. Se
compara con `fechaArgentinaISO`. Y el dia que se muestra es el ULTIMO VIGENTE, no
`finEn`: la ventana es semiabierta, asi que `finEn` es el dia siguiente y
preguntar por el corre todo un dia. Reusa `ultimoDiaVigente`, la misma que usa la
pantalla de crear.

### UNA OFERTA DE VARIOS PRODUCTOS NO MUESTRA PRECIO

El DTO de la lista trae `producto`, `precioOferta` y `precioNormal` SOLO cuando la
oferta tiene una unica linea. Con mas de una vienen en `null` y la tarjeta dice
cuantos productos hay, sin bloque de precio: mostrar el de una linea como si
fuera el de la oferta es una afirmacion falsa sobre las otras.

El flujo movil crea ofertas de UN producto, asi que el caso de varias solo llega
desde escritorio. En produccion hoy no hay ninguna.

### UNA SOLA ACCION EN LA TARJETA, Y EL MOTIVO ES MEDIBLE

La tarjeta tiene **solo "Editar"**, a lo ancho, igual que la del catalogo.

Tuvo dos —"Terminar ahora" y "Editar"— y con dos la pildora de estado, que el kit
pone absoluta abajo a la derecha, se montaba sobre el texto del SEGUNDO boton.
Medido a 390 px: **PROGRAMADA tapaba 35 px, VENCE HOY 21 y ACTIVA 0**. Dependia
del largo de la palabra, asi que el choque aparecia en unas tarjetas y en otras
no — que es lo que lo hacia facil de pasar por alto.

Con una sola accion el boton ocupa el ancho entero y su texto queda centrado,
lejos de esa esquina. **El problema desaparece sin tocar el kit** —que dibuja
tambien el catalogo y stock— y sin acortar ninguna palabra. El arnes mide cero
superposicion en los tres estados y se pone rojo si alguien vuelve a poner dos.

### TERMINAR LA OFERTA SE HACE DESDE EL DETALLE

`[id]/finalizar` escribe `finalizadaEn`, su autor y su motivo, levanta las marcas
de revision y registra el evento. **No toca precio, costo ni stock**, y eso esta
medido tomando una foto de las tres tablas antes y despues
(`scripts/integracion-terminar-oferta.mjs`).

La accion vive en el DETALLE, que ya la tenia para los cuatro estados que la
admiten —PROGRAMADA, ACTIVA, REVISAR y VENCIDA, segun `accionesDisponibles`— y es
a donde lleva "Editar". El arnes lo comprueba: toca Editar, llega al detalle de
ESA oferta y verifica que ahi este "Finalizar". Sin eso, sacar el boton de la
tarjeta habria dejado la oferta sin forma de terminarse.

### EL CARTEL ES DEL SISTEMA, NO DEL NAVEGADOR

El detalle confirmaba con dos `confirm()` del navegador:

    ¿Finalizar "X"? Deja de aplicarse y pasa al archivo.
    ¿Eliminar "X" definitivamente?

Los dos se reemplazaron por `ModalConfirmarOferta`, sobre `SunmiModalLayout` y
marcado como **`destructivo`**: el velo no cierra tocando afuera, que es lo que
hace falta cuando se toca desde un celular.

El problema de un `confirm()` no es que sea feo: **se cierra con Enter**, aparece
como un cartel del sistema encima de todo con dos botones identicos, y el que
dice "Aceptar" esta donde el pulgar ya estaba. Y ninguno de los dos decia a
cuanto pasa a venderse el producto, que es lo unico que hace falta saber antes de
bajar una promocion.

**El texto vive en `lib/ofertas/confirmaciones.js`**, no en el componente, porque
son tres preguntas con borde:

- **¿A que precio vuelve?** Al de HOY (`precioNormalActual`), no al que se
  congelo al cargar la oferta. Decir la referencia seria prometer un numero que
  no va a salir — y la diferencia entre los dos es justo lo que el aviso de
  revisar existe para señalar. Se cae a la referencia solo si no hay actual.
- **¿Y si tiene varios productos?** No hay "el" precio: se dice cuantos son.
- **¿Y si falta un numero?** El renglon no se dibuja. `Number(null)` es 0 y un
  cero se lee como un dato.

**Finalizar y eliminar NO dicen lo mismo**, y hay un candado que compara los dos
carteles campo por campo. Finalizar archiva —la oferta queda en Terminadas—;
eliminar borra la fila y no deja nada. Dos carteles iguales para dos cosas
distintas es como se aprende a tocar "Si" sin leer.

**Un censo impide que vuelva un tercero.** Lee los archivos del modulo SIN
COMENTARIOS antes de buscar: la primera version usaba `git grep` y se puso roja
nombrando los comentarios de este mismo cambio, que es la cuarta vez que ese
defecto aparece en el repo. Tiene contraprueba — el patron se corre contra todo
`app/modulos`, donde esta medido que hay varios, y tiene que encontrarlos.

**Deuda anotada: el modulo tiene DOS formateadores de plata.** `pesos` en
`formato.js` escribe `$3.700,00` y `money` en `crearOfertaMovil.js` escribe
`$ 3.700,00`, con espacio. El cartel usa `pesos`, que es el de la pantalla donde
vive, y la lista usa `money`. El mismo importe se lee distinto en dos pantallas
del mismo modulo. No se unifico en esta tanda: elegir cual queda es una decision
de como se ve.

### LOS IMPORTES LLEVAN CENTAVOS

La marca dice "Normal $ 3.700,00" y no "Normal $ 3.700". El importe pasa por
`money`, el MISMO formateador del modulo: una segunda forma de escribir plata es
como empiezan a discrepar dos pantallas.

### LO QUE SE SACO

**El buscador de ofertas.** Con una oferta en produccion no sirve y ocupa el
lugar de lo que importa. El endpoint sigue aceptando `q`, asi que devolverlo es
una linea. Con el se fue el filtro por estado, que era una fila de botones con
conteos.

**El encabezado propio.** La pantalla registraba su titulo en un `SunmiCardHeader`
adentro de la tarjeta, asi que en el celular "Ofertas" se veia dos veces.

### FUERA DE ALCANCE, ANOTADO Y NO EMPEZADO

El detalle de la oferta y la pantalla de editar; renovar; el apagado automatico
por stock cero; el cartel de offline en el POS; y el sello de OFERTA en
Productos.

### DEUDA ABIERTA DE ESTA TANDA

`components/ofertas/TarjetaOferta.jsx` —la tarjeta vieja, sobre
`SunmiActionCard`— **quedo sin ningun lector de pantalla**: la lista dejo de
usarla. Sigue nombrada en `lib/sunmi/actionCard.test.mjs` y en dos sondas, que la
enumeran como consumidora de `SunmiActionCard`. No se borro en esta tanda porque
sacarla obliga a tocar esos tres, y eso es otra unidad revertible. La pregunta a
contestar no es como arreglarla: es si esa tarjeta todavia tiene que existir.

## EL DETALLE ES LA MISMA PANTALLA QUE CREAR

Verificado en el navegador (`scripts/capturas-ofertas-lista.mjs`, 61
afirmaciones) y con la pantalla de crear comparada contra sí misma.

Eran dos pantallas distintas: crear tenia los dos campos sincronizados, los
chips y el pie anclado, y entrar a una oferta mostraba una tabla con dos botones
—"Editar productos" y "Editar datos"— que abrian dos formularios mas. **Tres
formas de tocar lo mismo.**

Ahora los bloques son LOS MISMOS componentes —`TarjetaDelProducto`,
`BloqueDePrecio`, `BloqueDeDuracion`, `InterruptorSoloEfectivo` y
`PieDeOferta`— y los dos campos se mueven con el mismo hook
(`useBloqueDePrecioDeOferta`). Lo unico que cambia son los botones del pie,
porque dependen del estado: en BORRADOR "Guardar borrador" y "Publicar"; ya
publicada, "Guardar cambios" y "Finalizar".

`EditorProductosOferta` y `FormularioOferta` se borraron: quedaron sin lectores.

### LO QUE SE VERIFICO ANTES DE DIBUJAR

Las dos preguntas que habia que contestar antes de poner campos que quiza no
guardan. **Las dos dieron que SI:**

- **El precio SE PUEDE editar despues de publicar.** Lo dice `[id]/lineas` con
  su motivo: la oferta estaba en $900 y pasa a $950; desde ese momento las
  ventas nuevas usan $950 y las anteriores NO cambian, porque cada venta guardo
  su propio snapshot. Solo se bloquea sobre una FINALIZADA.
- **El conjunto de productos tambien.** La misma ruta concilia: agrega, cambia y
  saca, revalidando choques con otras ofertas.

Asi que el bloque de precio va EDITABLE. Lo que no va es el buscador: el diseno
no lo pide y la tarjeta del producto es fija.

### UNA OFERTA DE VARIOS PRODUCTOS NO SE EDITA ACA, Y NO ES ESTETICA

`[id]/lineas` recibe el CONJUNTO COMPLETO y **borra lo que no viene**. Esta
pantalla manda una sola linea, asi que sobre una oferta de dos productos guardar
el precio BORRARIA el otro.

Con mas de una linea el bloque de precio no se dibuja: se listan los precios en
lectura y se dice que se editan desde escritorio. La fecha y el medio de pago si
se pueden cambiar, porque van por `PATCH` y no tocan las lineas.

### DOS GUARDADOS, PORQUE SON DOS RUTAS

`PATCH /api/ofertas/[id]` guarda la ventana y la condicion de pago;
`PUT /api/ofertas/[id]/lineas` guarda el precio. Son dos llamadas y el boton es
uno: si la primera falla, la segunda no sale, y se dice cual fallo.

Hay un candado que lo ejerce contra Postgres: cambia el precio, guarda, y
comprueba que la linea quedo en el numero nuevo **y que el precio del producto
no se movio**.

### LA DURACION ARRANCA EN "ELEGIR", CON LA FECHA PUESTA

Los chips son atajos para una oferta nueva. Una ya cargada puede terminar
cualquier dia, asi que adivinar que chip le corresponde seria inventar: se
muestra la fecha real y los chips siguen ahi para reemplazarla de un toque.

Y el dia que muestra el campo es el **ultimo dia vigente**, no `finEn`: la
ventana es semiabierta, asi que poner `finEn` correria la oferta un dia cada vez
que se abre y se guarda sin tocar nada.

### LA PLATA DEL MODULO QUEDO UNIFICADA

Habia dos formateadores: `pesos` escribia `$3.700,00` y `money` escribia
`$ 3.700,00`. Ahora hay **una sola implementacion**, con la forma CON ESPACIO, y
`money` delega en `pesos`.

Lo que NO se unifico es la politica de ausencia, y es una distincion real:
`pesos` muestra "—" porque lo suyo es mostrar un hecho que puede faltar, y
`money` muestra "$ 0,00" porque se usa donde se esta TIPEANDO un precio y ahi un
cero es un estado legitimo.

### COMO SE PROBO QUE CREAR NO SE MOVIO

La extraccion saco bloques de una pantalla que funciona, asi que la prueba es
que esa pantalla quede IDENTICA.

**Las capturas de esa pantalla tienen ruido**, y eso se midio primero: la misma
version corrida dos veces produce 11 de 13 archivos distintos. Con ruido,
cualquier diagnostico sobre pixeles es inventado.

Se comparo el DOM y la geometria, que SI son deterministas —dos corridas de la
misma version dan cero diferencias— y dieron **identicos**: mismo `innerHTML`,
mismas cinco cajas con las mismas coordenadas, mismo alto. Mas las 70
afirmaciones del arnes de crear, en verde.
