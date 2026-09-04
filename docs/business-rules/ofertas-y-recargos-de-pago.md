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

## Lo que falta, y por qué

### 1. La pantalla de cobro del POS — **el bloqueante**

**Publicar una oferta está enclavado** en `lib/ofertas/integracionPos.js`. Todo
lo demás del módulo funciona; lo único que no se puede es poner una oferta a
cobrar. **[DECISIÓN]**

El POS calcula su total como `subtotal − descuentos`, sin mirar ofertas ni
recargos. Con una oferta publicada quedarían dos números para la misma venta:

- con **un solo medio**, el backend arma el tender con su total, la venta entra
  por $900 y la pantalla le pidió $1.000 al cliente — falta plata en el arqueo y
  nadie sabe por qué;
- con **pago dividido**, la venta se rechaza con gente esperando.

El silencioso es el peligroso.

No se hizo porque no es enchufar el motor en la pantalla: con ofertas y recargos
**el total deja de ser un número y pasa a ser uno por medio de pago**. El mismo
carrito vale $900 en efectivo y $1.050 con débito, y decidir cómo se dibuja eso
—¿el carrito muestra los dos precios?, ¿el precio de la línea cambia al elegir el
medio?, ¿qué imprime el ticket?— es una decisión de negocio. Además toca
`FormaPago`, `CarritoVenta`, el modal de efectivo, la cola offline y el ticket.

El archivo del enclavamiento tiene las tres condiciones para levantarlo.

### 2. El sello "OFERTA" en Productos

La API ya lo devuelve: `/api/productos/listar` trae `item.oferta` con el nombre,
el precio y la condición. **[SIN VERIFICAR]**

**[PENDIENTE]** Pintarlo en la tabla y en la tarjeta. No se hizo porque agregar
un sello mueve píxeles y esa pantalla se acaba de rehacer; sin el arnés de
capturas no hay forma de comprobar que no se corrió nada.

### 3. El barrido depende de que alguien entre

La comparación de costos corre cuando se abre la pantalla de Ofertas, porque el
proyecto no tiene planificador y un script suelto en el VPS es lo que las reglas
prohíben. **Si nadie entra en tres días, no se marca ni se avisa nada.**
**[DECISIÓN]** — límite conocido de la v1.

### 4. Nada se ejerció contra Postgres

**[SIN VERIFICAR]** Ninguna consulta de Prisma de esta tanda se corrió contra una
base, y el cliente no se regeneró. Es la familia exacta del incidente del
2026-08-12. Antes de mergear hay que aplicar la migración contra una base de
prueba y ejercer las diez rutas.

---

## Permisos

`ofertas.ver`, `ofertas.crear`, `ofertas.editar`, `ofertas.finalizar`,
`ofertas.eliminar` y `config_local.recargos_pago`. **[VERIFICADO]** —
`lib/rbac/registry.js`.

Cinco y no uno porque son cinco decisiones de distinto peso. FINALIZAR va
separado de EDITAR —bajar una promoción antes de tiempo es una decisión
comercial, no una corrección— y ELIMINAR es el único que destruye una fila.
Ninguno se ata a un rol: los roles los reciben desde el sistema existente.
