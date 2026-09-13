# INC-0009 — El documento de una transferencia cerrada informa faltantes que no existen

**Estado:** **arreglado el 2026-09-13, sin desplegar todavía.** El defecto era de
PRESENTACIÓN: no hay que reparar ningún dato y no hubo que tocar la base.
**Cuándo:** visible desde que el snapshot de presentación existe —2026-09-09— en
toda transferencia cerrada con líneas agrupadas. Medido el 2026-09-13.
**Alcance:** **14 líneas en 4 transferencias cerradas**, las cuatro con destino
**mini el 7**. **Cero unidades de stock mal movidas.**

## EL STOCK ESTÁ BIEN. NO HAY FALTANTE EN LA BASE

Va primero porque es lo que hay que saber antes de leer el resto, y porque el
número del papel invita a la conclusión contraria.

Es un **defecto de documento**: las columnas están bien guardadas, el inventario
se movió bien, y lo único equivocado es la resta que la pantalla muestra. La
mercadería que el papel informa como faltante **está en el local**.

## Lo que se veía

Sección "Productos transferidos" de la transferencia **#204** —cerrada, depósito
"depo" → "mini el 7", recibida el 2026-09-12 a las 20:01—:

- `COCA COLA 2L` — Enviada 32 · Recibida 4 · **Diferencia −28** · Costo
  $23.333,33 · Importe $93.333,32
- `SPRITE 2L` — Enviada 8 · Recibida 1 · **Diferencia −7**

Las 32 son **4 CAJÓN x8** y llegaron los cuatro cajones completos. Las 8 son
**1 PACK x8** y llegó el pack. No falta nada.

## La causa

`TransferenciaDetalle.cantidad` está en unidades **FÍSICAS** y `recibido` en la
escala de la **PRESENTACIÓN** —4 cajones—, que es exactamente lo que
`guardar-recepcion` persiste. La tabla restaba los dos números pasándole a
`unidadesFisicasDe` las **columnas crudas** `d.unidadEnviada` y `d.factorPack`.

Y `unidadEnviada` dice `UNIDAD` en casi todas estas líneas, porque la venta
interna del POS consolida los packs a unidades antes de guardar. Con `UNIDAD` el
factor es 1, así que los 4 cajones se leyeron como 4 unidades contra 32 enviadas.

**Es el defecto que `escalaFisicaDeLinea` se escribió para cerrar**, con ese
motivo documentado en su propio comentario, sobre una pantalla que nunca adoptó
ese camino. La recepción del teléfono muestra estas mismas líneas bien: usa
`fisicasEnviadasDe` y `fisicasRecibidasDe`, del mismo módulo. **No faltaba una
función: se entraba por la puerta equivocada.**

El mismo error aparecía tres veces más en la misma pantalla, y las cuatro se
arreglaron juntas:

- `desgloseFisico` escribía la palabra **"PACK" a mano** —`${recibido} PACK
  x${d.factorPack}`—, así que una línea despachada en cajones se leía "4 PACK x8",
  y el factor salía del catálogo de HOY.
- La condición que decide si se muestra el desglose físico preguntaba
  `d.unidadEnviada === "BULTO"`. Con `UNIDAD` daba falso, así que el renglón que
  **explica** la escala desaparecía justo en las líneas donde los dos números no
  coinciden.
- La píldora de presentación —`presentacionDeLinea`— preguntaba primero
  `unidadMedida` —cómo se COMPRA— y después la columna cruda, y decía **"Unidad"**
  sobre una línea despachada en cajones. Es el error de
  [`unidad-medida-es-como-se-compra.md`](../business-rules/unidad-medida-es-como-se-compra.md)
  otra vez.

## Cómo se midió que el stock está bien

Tres mediciones, ninguna calculada:

1. **El destino tiene las unidades físicas.** `StockLocal` de mini el 7: **32** de
   COCA COLA 2L y **8** de SPRITE 2L, con `enTransito` en 0. Si el stock se
   hubiera movido con el número crudo, habría 4 y 1.
2. **`AuditoriaStock` de la #204 no tiene ninguna fila, y eso es correcto**: la
   auditoría se escribe solo cuando hay un ajuste, y la diferencia real de esas
   dos líneas es cero. No es una omisión.
3. **La auditoría que SÍ se puede leer es la de una línea del mismo conjunto con
   diferencia real.** El detalle **6698** de la #198 tiene un excedente verdadero
   de 12 unidades, y su fila dice, textual: *"Excedente de recepción —
   transferencia #198, detalle #6698, enviado 6 PACK x24, recibido 6 PACK x24 + 12
   unidades sueltas, descontado del origen 12.000 (unidades de stock)"*, con el
   local 1 pasando de −10440 a −10452, **delta −12**. O sea que la confirmación
   lee el snapshot y mueve unidades físicas.

**Y la plata tampoco estaba mal.** El valorizador canónico sobre la fila real del
6843 devuelve `costoPresentacion` **23.333,33** y `subtotal` **93.333,32**: los
dos números exactos de la pantalla. La coincidencia con `4 × 23.333,33` es
aritmética —4 cajones y 32 unidades son la misma mercadería—, no una cuenta hecha
sobre el número crudo.

## El alcance, enumerado

`findMany` sobre `TransferenciaDetalle` completo, filtrando por snapshot agrupado
con factor mayor que 1, `recibido` no nulo y transferencia en estado `Recibida`:

- **14 líneas** en **4 transferencias**: #186, #198, #200 y #204.
- **13** informan una diferencia que no existe. El total mal informado son
  **595 unidades**, todas con destino **mini el 7** (local 2).
- **La número 14 se ve bien por CASUALIDAD.** Es el detalle 6389, y acierta porque
  su `unidadEnviada` es `BULTO` y el `factor_pack` del catálogo coincide hoy con
  el `factorPresentacion` del remito. El día que alguien edite el factor de ese
  producto, esa línea también empieza a mentir. No estaba protegida: estaba
  coincidiendo.

Y un caso que conviene reconocer porque es peor que un número equivocado: el
detalle **6698** mostraba la diferencia como **"—"**. Con sueltas de por medio,
`milesimasFisicas` sobre la escala cruda devuelve `null` —a propósito, porque un
desglose sobre una escala que no agrupa no existe— y `null` se dibuja igual que
"no se contó". **El documento informaba que nadie había contado una línea
revisada, con un excedente de 12 unidades ya descontado del origen.**

## NO ES EL INC-0003, Y HAY QUE DECIRLO JUNTO

El depósito tiene **−4992** unidades de COCA COLA 2L y **−680** de SPRITE 2L.
Eso es [`INC-0003`](INC-0003-stock-negativo.md), que ya está **ABIERTO** y es
anterior a todo esto.

**Son dos cosas distintas y se leen juntas muy fácil.** Quien mire el depósito en
negativo y además vea estos faltantes en el papel va a concluir que la mercadería
se está perdiendo por el mismo agujero. No: acá el papel miente y el inventario
del destino está completo. Cruzarlos llevaría a buscar mercadería que está en la
góndola, o peor, a "corregir" un stock que está bien.

## NO ES EL INC-0008 TAMPOCO

El [`INC-0008`](INC-0008-packs-contados-sobre-un-envio-sin-bultos.md) es un **dato
mal escrito** por el panel del teléfono: 6 packs contados sobre un envío que no
trajo ningún pack, y ese dato sigue mal en la base.

Éste es lo contrario: **el dato está bien y el documento lo lee mal.** Otra causa,
otro archivo, otra superficie. Lo único que comparten es la familia: confundir la
escala de la presentación con la escala física.

## Resolución

Las cuatro llamadas de `components/transferencias/TablaDetalleTransferencia.jsx`
pasan a las funciones que resuelven la escala con el descriptor:
`fisicasEnviadasDe`, `fisicasRecibidasDe` y `escalaFisicaDeLinea`. El desglose
deriva su rótulo de `nombreDePresentacion(descriptorDeEnvio(d))` en vez de escribir
"PACK". Y `presentacionDeLinea`, en `detallePresentacion.jsx`, sale del descriptor
conservando su vocabulario —Bulto, Unidad, Kg, Pieza— así que la píldora no cambia
de forma ni de color: cambia cuál de las cuatro le toca a cada línea.

**Esto toca ESCRITORIO a propósito.** La regla de "escritorio queda anotado" es
para lo visual. Un documento que informa mercadería faltante que está en el local
no es visual, y se arregla donde esté.

## Detección

No lo encontró ningún candado. Lo vio Emanuel usando la pantalla, en producción,
sobre una transferencia ya cerrada.

**Y había un candado en verde sobre el defecto.** "6. la tabla histórica mide la
diferencia en FÍSICO", en `revisionSueltas.test.mjs`, exigía que el archivo llamara
a `unidadesFisicasDe(`. Lo hacía — con las columnas crudas. El candado miraba el
NOMBRE de la función y no de dónde salía la escala que se le pasaba, así que pasaba
en verde con el defecto puesto. Reescrito: ahora exige las dos funciones del
descriptor y **prohíbe** `unidad: d.unidadEnviada` y `factorPack: d.factorPack`.

Y ningún fixture tenía la combinación que lo produce: la `linea()` de
`recepcionRender.test.mjs` va con `unidadEnviada: "UNIDAD"`, `factorPack: 1` y sin
un solo campo de snapshot. Con factor 1 las dos escalas coinciden y el defecto es
invisible. El fixture nuevo sale de la base, con los números del 6843 y del 6698.

## Lección

**Un candado que exige el nombre de una función no prueba que se la llame bien.**
La función era la correcta; los argumentos no. Cuando lo que importa es de dónde
sale un dato, el candado tiene que prohibir la fuente equivocada, no confirmar la
fuente correcta.

Y la segunda, que ya está en `CLAUDE.md` y volvió a pasar: **el stock cuadrando es
lo que hace invisible un defecto de documento.** Nadie sospecha del papel cuando
el inventario está bien.

## Evidencia

- `StockLocal` de mini el 7 en 32 y 8, y del depósito en −4992 y −680, leídos el
  2026-09-13 en un contenedor descartable de la imagen que atiende.
- La fila de `AuditoriaStock` del detalle 6698, con su texto completo y delta −12.
- `valorizarLineaDelRemito` sobre la fila del 6843 → 23.333,33 y 93.333,32.
- `components/transferencias/documentoEnEscalaDelRemito.test.mjs` — los cinco
  candados, tres de ellos en rojo antes del arreglo.

## Sin verificar

- **Que la #204 fuera la única vez que alguien lo vio.** Se midieron las líneas
  afectadas, no cuántas veces se leyó esa pantalla ni si alguien salió a buscar la
  mercadería.
- **El remito de ENVÍO en PDF** (`app/api/transferencias/pdf/route.js`) le pasa
  `cantidad` y `unidadEnviada` a `valorizarDetalle` **sin el snapshot**, a
  diferencia del acta de recepción, que sí lo pasa. La plata sale bien porque
  `cantidad` ya es física; **el rótulo de la presentación en el papel no se
  midió**, así que no se afirma nada de él. Queda anotado y no arreglado.
- **`cancelar/route.js` es una trampa latente, no un defecto actual.** Lee
  `d.cantidad` con `unidadEnviada` crudo, y hoy acierta porque **cero líneas** en
  producción combinan snapshot agrupado con `unidadEnviada = BULTO` y
  `cantidad > 0` —medido—. Si esa combinación apareciera, la cancelación le
  devolvería al origen el doble. Está seguro por los datos, no por construcción.
