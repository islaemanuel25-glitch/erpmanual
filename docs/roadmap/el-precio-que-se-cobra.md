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

## GRAVEDAD 2-bis · La tarjeta con el precio resuelto

**Orden de ejecución: junto con la segunda, no antes.** Medido el 2026-08-19.

### De dónde sale

Que el depósito venda al costo **es a propósito** — la decisión y su condición
futura están en
[../business-rules/deposito-vende-al-costo.md](../business-rules/deposito-vende-al-costo.md).
La consecuencia es que en el depósito la tarjeta muestra `precio_venta` y el POS
cobra el costo: **2.021 de 2.047 filas** con otro número.

La tarjeta ya corrigió la ESCALA (`ad10fcf`), pero sigue leyendo la COLUMNA en vez
de preguntar por el precio resuelto.

### Qué haría falta, medido

**Tres piezas, y la del medio es la cara.**

1. **Resolver la lista una vez por pedido** en `app/api/productos/listar`.
   `resolverListaCliente` ya existe y es reusable tal cual. Cuesta **entre 3 y 4
   consultas por request** —`local`, `grupoDeposito`, `grupoLocal` y
   `listaPrecio`—, no por fila. Dos de esas el listado ya las tiene resueltas por
   su cuenta, así que se pagan de más por reusar en vez de reimplementar; es el
   precio correcto.

2. **Extraer el bloque que aplica la lista conservando las cuatro escalas**, que
   hoy vive inline en `mapProductos` de `buscar-producto`. Son **110 líneas de
   código sin contar comentarios**, entre las líneas 266 y 424, y mezclan: la
   detección de bulto, el fiambre, el redondeo, la aplicación de la lista y el
   mantenimiento de la proporción unitario/bulto.

   **Ese bloque ES donde viven las cuatro condiciones divergentes** de la tanda de
   gravedad 2. No se puede extraer sin decidir cuál gana, así que las dos tandas
   son en realidad una.

3. **La tarjeta llama a esa pieza** en vez de a `precioEnEscalaQueSeCobra`.
   Eso es lo barato.

### Qué se puede romper

Lo mismo que la tanda de gravedad 2, porque es el mismo código: el precio que ve
el POS. Extraer 110 líneas del camino que cobra no es un refactor cosmético.

Y algo propio de ésta: el listado de productos pasa a depender de la resolución
de listas. Si `resolverListaCliente` devuelve un error de contexto —lo hace, con
400/403/404— el catálogo tendría que decidir qué hacer, y hoy no tiene esa rama.

### LO QUE HAY QUE DECIDIR ANTES, Y NO ES TÉCNICO

**Mostrar el precio resuelto en el depósito es mostrar el costo.** No es un efecto
lateral: la lista ES el costo, así que el número que aparecería en la tarjeta es
el costo del producto.

Medido contra los roles reales: **tres roles ven el catálogo y NO tienen
`costos.ver`** — `Deposito`, `Mini` y `ENCARGADO`. Uno de ellos se llama
literalmente `Deposito`, que es justo el que va a estar parado ahí. Hoy hay **1
usuario activo** en ese grupo, pero el rol es lo que importa, no el conteo de
hoy.

O sea que esto pone el costo delante de un rol al que el sistema le niega
`costos.ver` a propósito. **Es la misma decisión que ya se declinó** cuando se
descartó el costo como opción de la tarjeta —ver
[el-costo-en-la-tarjeta.md](el-costo-en-la-tarjeta.md)— solo que llegando por otra
puerta: no como "mostrá el costo" sino como "mostrá lo que se cobra", que resulta
ser el costo.

Las salidas posibles, y ninguna es obvia:

- Mostrar el precio resuelto solo a quien tenga `costos.ver`, y a los demás
  seguir mostrando el de venta. Deja dos personas viendo números distintos en la
  misma pantalla.
- Mostrarlo a todos, aceptando que en el depósito el costo es visible.
- No mostrarlo y decir en la tarjeta que en el depósito el precio lo define una
  lista, sin el número.

### Cómo se verifica

Igual que la de gravedad 2: sacar el precio de las superficies antes y después
para todo el catálogo, con la lista de diferencias esperadas escrita de antemano
—que acá son las 2.021 filas del depósito y ninguna de los locales, porque en los
locales no hay lista default—. Y la sonda de la tarjeta, que ya sabe pedir la
ubicación activa.

### Veredicto: NO entra en la tanda que se está juntando

Por tres motivos, y el primero alcanza:

1. **Necesita una decisión de negocio** sobre quién ve el costo, que no está
   tomada.
2. **Arrastra la tanda de gravedad 2 entera**: el bloque a extraer es donde viven
   las cuatro condiciones divergentes.
3. **Cambia el número que se ve en 2.021 filas**, y eso merece su propia lista de
   diferencias esperadas y su propia medición antes/después.

---

## Una cosa medida que no entra en ninguna

**Cuatro valores más fuera del enum.** `components/transferencias/detallePresentacion.jsx:65-66`
compara contra "pieza", "piezas", "kilo" y "kilogramo". No se tocaron: ese
archivo rotula lo que devuelve un endpoint, no la columna, y no se verificó que
ese endpoint mande el valor del enum.
