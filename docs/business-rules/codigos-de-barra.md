# Códigos de barra fuera de norma

> **Medido el 2026-08-10** contra la base de **producción**, solo lectura.
> Enumerado con un `SELECT` sobre `"ProductoBase"`, filtrando
> `length(codigo_barra) > 14 OR codigo_barra ~ '[^0-9]'`.
> **Ningún dato se modificó.** Este documento es una lista para decidir, no un
> registro de limpieza.

## La norma

Un código de barra que un lector pueda leer no pasa de **14 caracteres**:
EAN-13 son 13, UPC-A 12, EAN-8 8, ITF-14 14 —el de la caja— y los que genera la
balanza son 13 empezando con 2.

## Lo medido

De **2.559 productos**, **2.239 tienen algún código** cargado. De esos:

- **16 pasan de 14 caracteres.**
- **90 tienen algo que no es un dígito**: 88 con letras, 20 con espacios.
- **93 en total** están fuera de norma por una cosa o la otra.
- El código secundario está limpio: 11 cargados, ninguno de más de 14, todos dígitos.

Por largo: 1.928 productos tienen exactamente 13 caracteres —un EAN-13— y 79
tienen 14. Ese es el grueso y está bien.

## EL TOPE ESTÁ PUESTO, EN 16

**Decidido y aplicado el 2026-08-10.** El tope frena a los 16 caracteres, no a
los 14.

El motivo es que tres productos tienen un código de 16 dígitos que es legítimo:

- `0117798091030524` — CERVEZA ANTARES LAGER LATA
- `0147798397440011` — Rasta Blanco X18
- `0147798397444200` — Rasta Negro X18

Los tres empiezan con `01`, que en GS1 es el identificador de aplicación de
GTIN, seguido de un GTIN-14. Es lo que emite un lector al escanear el código de
un bulto. Con 14 rechazaríamos un escaneo real de caja; con 16 siguen frenados
los de 17, 18 y 20, que son los que de verdad son basura.

Dos de esos productos se venden: Rasta Blanco X18 tenía 31 líneas de venta y la
última el mismo día de la medición.

### Cómo frena

**Al escribir, no al guardar.** No hay validación en el servidor: agregarla
rechazaría al guardar los 16 productos que hoy tienen más de 14 y son válidos.

El tope vive en `lib/productos/codigoBarra.js` y lo aplican los **cinco campos**
donde se carga un código: el principal, el secundario y el propio de la ubicación
en la ficha de producto; los dos del formulario de combo; y la columna de la
grilla de edición rápida. Cada uno lleva `maxLength` —que frena el tecleo y
recorta el pegado en el navegador— más `alEscribirCodigoBarra`, que es la misma
regla en JavaScript y cubre los caminos que `maxLength` no ve, como el dictado
por voz.

### Lo guardado no se toca

Los 16 códigos de más de 14 caracteres **se quedan como están**. Verificado en
la pantalla real, no solo en los candados:

- Un producto con `LIVRA CITRUS 1.5 GAS` guardado —20 caracteres— abre el campo
  con los 20 a la vista, pese al `maxLength` de 16.
- Teclear encima de ese valor no lo mueve: sigue en 20.
- Borrar sí funciona: un backspace lo deja en 19.
- En un código normal de 13, teclear 10 caracteres más lo detiene exactamente
  en 16.

## De dónde salieron los 90 con letras

Medido el 2026-08-10 contra producción. **Se agrupan a medias**: hay un pico
grande el día de la carga inicial y después un goteo que se apaga solo.

- **47 de los 90 se crearon el 2026-05-07**, el día en que entraron 1.834
  productos de una vez. Ese día el 97 % de los códigos cargados fueron dígitos
  correctos y el 2,6 % salieron con letras, así que **no fue una importación que
  puso el nombre en la columna equivocada**: fue una importación que funcionó
  bien y dejó un resto sin resolver.
- Los otros 43 gotean entre mayo y julio, de a uno o dos por día. La excepción es
  el **2026-06-02**, donde se crearon 6 productos y **los 6** salieron con letras:
  ahí sí parece una tanda cargada a mano de un tirón.
- **Desde el 2026-07-11 no entró ninguno más.** El último es del 2026-07-10.
  Sea lo que fuere que los generaba, dejó de pasar hace un mes.

### Qué son

De los 90:

- **21 tienen el código exactamente igual al nombre** del producto, comparando
  sin espacios ni mayúsculas.
- **48 tienen un código con el que empieza el nombre** —`BENGALA` en
  `BENGALA X4`—.
- **60 comparten los primeros 5 caracteres** con el nombre.

O sea: dos tercios son el nombre del producto, entero o abreviado, escrito en la
columna del código.

### Ninguno tiene otro código en otro lado

**Los 90 tienen el campo secundario vacío**, y ninguno tiene un SKU que parezca
un código de barras. Vaciar el campo los dejaría **sin ningún código**.

### Se venden como cualquier otro producto

61 de los 90 tienen ventas, con 2.249 líneas y la última el mismo día de la
medición. Es el 68 %, contra el 65 % de los productos con código de dígitos: **la
misma proporción**. No son productos muertos con un código viejo; son productos
normales cuyo código es basura.

Lo que no se puede medir es si alguien **usa** ese texto para buscar. El campo lo
lee el buscador del POS, así que tipear `cascarablanca` encontraría el producto;
pero no hay registro de búsquedas, así que si eso pasa alguna vez o nunca no se
puede saber leyendo la base. Lo que sí se puede afirmar: como en 48 de los 90 el
nombre empieza con el mismo texto, buscar por nombre ya los encuentra, y el
código no agrega nada.

## Estado de la limpieza

**47 vaciados** el 2026-08-10 por la migración
`20260810210000_vaciar_codigos_barra_derivados_del_nombre`: los que tenían el
nombre del producto, entero o abreviado. El estado anterior y el SQL para
reponerlos están en
[codigos-vaciados-2026-08-10.md](codigos-vaciados-2026-08-10.md).

**43 sin tocar**, esperando decisión uno por uno. Son los de abajo.

**16 largos sin tocar** —los tres GS1 son legítimos—, listados más abajo.

## Los 43 que quedan, para decidir uno por uno

No se parecen al nombre del producto, así que vaciarlos no es obvio: alguno
podría ser un atajo de tecleo que alguien usa a diario. Van con las ventas al
lado, que es el único indicio medible de que el producto está vivo.

Ojo: que el producto se venda **no prueba** que alguien use este código para
encontrarlo. No hay registro de búsquedas. Lo que sí se sabe es que el buscador
del POS lee este campo, así que tipear el texto exacto encontraría el producto.

### Con ventas (31)

- **2086** · `cremosocremac` (13) · Queso Cremoso Cremac · 204 ventas, última 2026-08-10
- **694** · `xl` (2) · Hamburguesa Casera XL · 172 ventas, última 2026-08-10
- **455** · `PETACACAFE` (10) · DERNA PETACA CAFE AL COGNAC XCAJA · 86 ventas, última 2026-08-10
- **1416** · `torpedo` (7) · PAN TORPEDO  · 74 ventas, última 2026-08-10
- **2130** · `pancholargo` (11) · Pan Super Pancho · 56 ventas, última 2026-08-10
- **552** · `picadofino` (10) · Salamin Fox Picado Fino · 48 ventas, última 2026-08-10
- **1541** · `picadogrueso` (12) · Salamin Fox Picado Grueso · 42 ventas, última 2026-08-10
- **2117** · `cascarablanca` (13) · Queso Cascara Blanca CLP · 41 ventas, última 2026-08-10
- **2091** · `pachamama` (9) · Tabaco Pacha Mama · 40 ventas, última 2026-08-09
- **2299** · `sardoverona` (11) · Queso Sardo La Verona · 30 ventas, última 2026-08-06
- **2101** · `cremosoverona` (13) · Queso Cremoso Verona · 28 ventas, última 2026-08-08
- **2213** · `lahoja` (6) · Tabaco La Hoja · 28 ventas, última 2026-08-08
- **448** · `pancho12` (8) · Pan Pancho Fucci · 20 ventas, última 2026-08-08
- **2092** · `panlomo` (7) · Pan Lomito · 14 ventas, última 2026-07-08
- **967** · `7790O36048260` (13) · VINO UVITA BLANCO DULCE X12 · 14 ventas, última 2026-08-09
- **2124** · `mozzacremac` (11) · Mozzarella Cremac · 9 ventas, última 2026-08-04
- **2119** · `cascaranegra` (12) · Queso Cascara Negra CLP · 9 ventas, última 2026-08-07
- **822** · `SURTIDO PRIME` (13) · PRIME PRESERVATIVO · 8 ventas, última 2026-08-06
- **2125** · `casera` (6) · Hamburguesa Casera · 5 ventas, última 2026-07-28
- **2300** · `roque` (5) · Queso Azukl Vanguard · 5 ventas, última 2026-08-07
- **2336** · `solforati` (9) · Sol Pampeano Forati · 5 ventas, última 2026-08-05
- **2337** · `%` (1) · azucar impalpable velez 250gr · 4 ventas, última 2026-07-22
- **2298** · `holandaverona` (13) · Queso Holanda La Verona · 4 ventas, última 2026-07-02
- **2241** · `Solmayorhigienico` (17) · Sol Mayor Papel Higienico · 4 ventas, última 2026-07-27
- **1951** · `solcabello` (10) · SOL PAMPEANO CABELLITO · 2 ventas, última 2026-08-06
- **1886** · `sprite237` (9) · Sprite Vidrio 237  · 2 ventas, última 2026-08-05
- **2315** · `arrolladovaca` (13) · Arrollado de Vaca · 1 ventas, última 2026-06-08
- **1885** · `fanta 237` (9) · fanta vidrio 237 · 1 ventas, última 2026-08-05
- **1883** · `LIVRA CITRUS 1.5 GAS` (20) · LIVRA CITRUS 1.5 CON GAS · 1 ventas, última 2026-05-27
- **1437** · `LOMO PAN` (8) · PAN ALS LOMO · 1 ventas, última 2026-05-23
- **430** · `PAÑO AMARRILLO` (14) · PAÑO AMARILLO · 1 ventas, última 2026-07-03

### Sin ventas (12)

- **1779** · `bagetines` (9) · BAGUETINES DEL RIO x2 · sin ventas
- **658** · `PERRO` (5) · BALANCIN ALIMENTO PERRO 15KG · sin ventas
- **1406** · `BOLSA 50x70` (11) · BOLSA CONSORCIO YO RECICLO 50x70 · sin ventas
- **1407** · `BOLSA 60x90` (11) · BOLSA  CONSORCIO YO RECICLO 60x90 · sin ventas
- **1789** · `7790895641749-` (14) · cepita anana 1.5l · sin ventas
- **139** · `CORDONES` (8) · CORDON EL MOÑO X12U · sin ventas
- **1800** · `BOCADITO CHOC BLANCO` (20) · GRANIX BOCADITO CHOC. BLANCO 2KG · sin ventas
- **1882** · `LIVRA POMELO 1.5 GAS` (20) · LIVRA POMELO 1.5 CON GAS · sin ventas
- **2318** · `petacagin` (9) · Petaca Derna Gin · sin ventas
- **1539** · `mixta` (5) · prepizza mixta · sin ventas
- **2329** · `secadortango` (12) · Secador De Pïso Tango · sin ventas
- **2294** · `skyclasico` (10) · Skyy Clasico · sin ventas

## Un caso aparte: `%` (id 2337)

En "azucar impalpable velez 250gr". Entró en el conteo original de "48 a vaciar"
por un artefacto de la comparación: al sacarle los caracteres no alfanuméricos
queda la cadena vacía, y "el nombre empieza con la cadena vacía" es verdadero
para cualquier nombre. **No es el comienzo de ningún nombre**, así que quedó
afuera del vaciado y entra en la lista de arriba.

## Otro caso aparte: `7790895641749-`

Trece dígitos correctos y un guion al final, en "cepita anana 1.5l". Es el único
que parece un error de tipeo sobre un código válido y no una decisión.
