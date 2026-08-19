# El precio que se cobra: tres tandas, en orden

Relevado el 2026-08-19 sobre `erpazul_al`, la copia con datos reales. Los
predicados del listado y las funciones del POS se importaron; nada se contó con
un criterio escrito para la ocasión.

**La primera de esta lista es la más grave y va última en el orden de ejecución.**
No es una contradicción: la más grave toca lo que se cobra en el mostrador y
necesita que las otras dos hayan ordenado el terreno antes.

La tanda de la ETIQUETA ya se hizo — commit `ad10fcf`, 2026-08-19. Queda acá
como primer escalón para que se lea el arco completo.

---

## GRAVEDAD 1 · El servidor acepta el precio que manda el navegador

**Orden de ejecución: TERCERA.**

### Qué pasa hoy

`app/api/pos-ventas/crear/route.js:360-365` comprueba que `item.precio` sea un
número mayor que cero, y `crear/route.js:880` lo persiste tal cual en
`VentaDetalle.precio`. **No lo recalcula y no lo compara contra nada.**

Todo el trabajo cuidadoso de `buscar-producto` —las cuatro escalas, la lista
resuelta, el redondeo— es efectivamente una sugerencia: entre buscar y cobrar hay
una ventana en la que el número puede ser otro.

Lo que el servidor SÍ protege: la lista. Si el ítem declara una lista distinta de
la resuelta, rechaza con 409 (`crear:462-471`). Pero no revalida el precio contra
esa lista. Y sí recalcula dos casos: los servicios de importe variable
(`crear:303-344`) y las líneas de peso cargadas por importe (`crear:396`) — donde
igual usa el `item.precio` del cliente como precio por kilo.

### Qué se puede romper

Todo. Es el precio de las ventas de cinco locales. Un recálculo que no reproduzca
EXACTAMENTE lo que hoy manda el navegador cambia lo que se cobra, y el síntoma
aparece en el mostrador, no en un log.

Los tres lugares donde es fácil equivocarse: el toggle pack/unidad suelta del
depósito, que manda el precio de una escala que el servidor tendría que volver a
elegir; el redondeo, que hoy se aplica al unitario y **no** al bulto ni al
unitario "real" (`buscar-producto:318` contra 394 y 413-415); y los descuentos y
puntos, que se calculan sobre el subtotal.

### Cómo se verifica

Lo único que sirve es la comparación en sombra: hacer que el servidor CALCULE el
precio y lo COMPARE con el que llegó, sin usarlo, registrando las diferencias.
Dejarlo corriendo hasta juntar un número de ventas real, y recién cuando las
diferencias sean cero —o estén todas explicadas— pasar a que mande el calculado.

No alcanza con candados: son funciones puras y esto vive entre el navegador y la
base. Es exactamente la familia de los cinco defectos del módulo de comprobante.

### Qué hace falta tener abierto

El POS con datos reales, y margen para mirar las diferencias durante varios días.
No se empieza sin eso. **Y no se despliega el cambio de comportamiento en la
misma tanda que la sombra**: son dos despliegues, y el segundo se decide leyendo
lo que juntó el primero.

---

## GRAVEDAD 2 · Cuatro condiciones distintas para "¿el precio está por bulto?"

**Orden de ejecución: SEGUNDA.**

### Qué pasa hoy

Cuatro lugares contestan la misma pregunta con cuatro criterios:

- `app/api/pos-ventas/buscar-producto/route.js` — `["pack","cajon"]` y factor > 1
- `app/api/stock_locales/buscar-producto/route.js:180` — `unidadMedida !== "unidad"`
- `lib/stock/mapItem.js:30-45` — solo factor > 1, sin mirar la unidad
- `lib/precios/redondeo.js:89-99` — `["pack","cajon"]` y factor > 1

El propio `redondeo.js:61-73` ya deja anotado que unificarlos es una tanda
pendiente porque toca el precio que se cobra.

### El número, y los dos productos con nombre

La divergencia muerde cuando un producto es **kg con factor_pack > 1**: el POS no
divide y las pantallas de stock sí. **Hoy son exactamente dos**, y la diferencia
es de tres a uno:

- **id 924** — "GRANIX BALONCITOS CHOCOLATE 3KG", factor 3, sin SKU. El POS lo
  muestra a $22.200,00 y la pantalla de stock a $7.400,00.
- **id 1881** — "MANI CON CASCARA X2KG", factor 2, sin SKU. El POS $11.200,00,
  stock $5.600,00.

Son pocos y son plata, y hoy no los mira ningún candado. Los ids salen de
`ProductoBase` sobre `erpazul_al` al 2026-08-19; conviene reconfirmarlos contra
producción antes de tocar, porque el catálogo se mueve.

### Qué se puede romper

El precio que ve el POS. Elegir "la condición correcta" cambia el número mostrado
para cualquier producto que caiga del otro lado, y la del POS es la que hoy
cobra: si se unifica hacia otra, cambia lo que se cobra.

### Cómo se verifica

Sacando el precio de las cuatro superficies para TODO el catálogo antes y
después, y comparando fila por fila. La lista de diferencias esperadas se escribe
antes, y tiene que ser exactamente esos dos productos —o los que la
reconfirmación diga—. Cualquier fila de más es un defecto, no una sorpresa.

### Qué hace falta tener abierto

Nada especial de infraestructura, pero sí la decisión de negocio: para un kg con
factor, ¿el precio guardado es por bulto o por kilo? Eso no lo contesta el
código.

---

## GRAVEDAD 3 · La escala que muestra la tarjeta — **HECHA**

**Orden de ejecución: PRIMERA. Commit `ad10fcf`, 2026-08-19.**

La tarjeta rotulaba con `unidad_medida` —cómo se compra— en vez de la escala en
la que se vende. Eran **5.450 de 10.521 filas activas, el 51,8 %**.

Se extrajo `calcularModoSalida` a `lib/precios/escalaDeVenta.js`, que ya estaba
duplicada en dos rutas, y la tarjeta pasó a llamar a la misma pieza que el POS. El
número se mueve con el rótulo: cambiar solo la etiqueta habría dicho "$31.900,00
por unidad" sobre un precio de bulto.

**Lo que quedó afuera:** el fiambre de pieza fija en depósito, 35 filas, que se
sigue mostrando por kilo. La tarjeta no sabe todavía poner el precio de una pieza
—`precio_por_kg × pesoReferenciaKg`— ni tiene una franja que lo explique. Va con
la tanda del precio, porque toca el número.

**El candado que dejó:** ata la escala del precio con la del stock sobre la
matriz completa de 32 combinaciones. `cantidadParaStockNormal` sigue siendo una
copia de la regla —lo dice en su propio comentario— y si divergen, la venta
cobraría un bulto y descontaría una unidad sin que nada avisara.

---

## Dos cosas medidas que no entran en ninguna de las tres

**El depósito cobra el costo.** `GrupoDeposito.listaPrecioDefaultId` apunta a la
lista 2, que es `tipoBase = COSTO` con margen 0, o sea COSTO_PURO. Sin cliente,
el POS del depósito cobra el costo y no el precio de venta. Son **2.021 de 2.047
filas del depósito**, y en 1.991 cobra menos —12,9 % menos en promedio—.
**Es una pregunta de negocio antes que un defecto** y está esperando respuesta de
Emanuel: si el depósito le vende a los locales al costo, está bien y lo que hay
que revisar es qué muestra la tarjeta ahí.

**Cuatro valores más fuera del enum.** `components/transferencias/detallePresentacion.jsx:65-66`
compara contra "pieza", "piezas", "kilo" y "kilogramo". No se tocaron: ese
archivo rotula lo que devuelve un endpoint, no la columna, y no se verificó que
ese endpoint mande el valor del enum.
