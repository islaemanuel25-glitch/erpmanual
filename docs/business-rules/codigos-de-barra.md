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

**29 vaciados** por `20260810210000_vaciar_codigos_barra_derivados_del_nombre`,
**ya aplicada en producción**. Criterio: cero ventas.
[Respaldo](codigos-vaciados-2026-08-10.md).

**60 por vaciar** con `20260810230000_vaciar_codigos_barra_del_deposito`, escrita
y **sin aplicar**. Criterio: los creó el depósito.
[Respaldo](codigos-vaciados-deposito-2026-08-10.md), con los 15 más vendidos
señalados arriba de todo para reponer uno rápido.

**1 queda con su código:** `pollo trozado` (id 2387, 34 ventas), el único creado
por Casiano Casas, por
[DEC-0006](../decisions/DEC-0006-codigos-de-casiano-intocables.md). Cuando la
segunda migración se aplique va a ser el **único** producto con código de texto.

### Los criterios que se probaron

1. **"El código es el nombre o su comienzo."** Dejaba adentro `bica`, `chori`,
   `camel10`. Un atajo de tecleo también empieza igual que el nombre.
2. **"Más de 8 caracteres."** Partía la fiambrería al medio, porque sus nombres
   son cortos.
3. **"Cero ventas."** Vació 29, pero por construcción dejó afuera todo lo que se
   usa.
4. **"Quién creó el producto."** El que quedó.

Se probó además un recorte por ventas sobre el cuarto —dejar afuera los de más
de 50— y **se descartó**. El criterio es uno solo.

### Lo que el criterio cuesta

**Los 60 que se vacían tienen ventas. Los 60.** Tiene que ser así: los que nunca
vendieron ya los vació la migración anterior, así que lo que queda es exactamente
lo que se usa. Entre ellos `cremosocremac` con 204, `BARRATREMBLAY` con 203 y
`xl` con 172, las tres del mismo día de la medición.

Está aceptado en DEC-0006, y el respaldo permite reponer cualquiera.

## Los 60 que se vacían, ordenados por ventas

- **2086** · `cremosocremac` (13 car.) · Queso Cremoso Cremac · **204 ventas**, última 2026-08-10
- **79** · `BARRATREMBLAY` (13 car.) · BARRA TREMBLAY · **203 ventas**, última 2026-08-10
- **694** · `xl` (2 car.) · Hamburguesa Casera XL · **172 ventas**, última 2026-08-10
- **1417** · `pancho24` (8 car.) · Pancho 24 Als · **164 ventas**, última 2026-08-10
- **2083** · `paletasadia` (11 car.) · Paleta sadia · **115 ventas**, última 2026-08-10
- **455** · `PETACACAFE` (10 car.) · DERNA PETACA CAFE AL COGNAC XCAJA · **86 ventas**, última 2026-08-10
- **2099** · `mortadela` (9 car.) · Mortadela Paladini · **82 ventas**, última 2026-08-10
- **691** · `maple` (5 car.) · Maple Huevos x30 · **81 ventas**, última 2026-08-10
- **2098** · `paletafela` (10 car.) · Paleta Fela · **80 ventas**, última 2026-08-10
- **2105** · `papas` (5 car.) · Papas Congeladas · **77 ventas**, última 2026-08-10
- **1416** · `torpedo` (7 car.) · PAN TORPEDO  · **74 ventas**, última 2026-08-10
- **2100** · `salamefela` (10 car.) · Salame Fela · **61 ventas**, última 2026-08-10
- **2134** · `doververde` (10 car.) · Dover Verde · **60 ventas**, última 2026-08-10
- **2023** · `361LATA` (7 car.) · 361 LATA X24 · **56 ventas**, última 2026-08-10
- **2130** · `pancholargo` (11 car.) · Pan Super Pancho · **56 ventas**, última 2026-08-10
- **552** · `picadofino` (10 car.) · Salamin Fox Picado Fino · **48 ventas**, última 2026-08-10
- **1541** · `picadogrueso` (12 car.) · Salamin Fox Picado Grueso · **42 ventas**, última 2026-08-10
- **2117** · `cascarablanca` (13 car.) · Queso Cascara Blanca CLP · **41 ventas**, última 2026-08-10
- **2091** · `pachamama` (9 car.) · Tabaco Pacha Mama · **40 ventas**, última 2026-08-09
- **2190** · `CARBONCHICO` (11 car.) · CARBON CHICO · **39 ventas**, última 2026-08-10
- **92** · `bica` (4 car.) · Bicarbonato Paez · **36 ventas**, última 2026-08-10
- **2191** · `CARBONGRANDE` (12 car.) · CARBON  GRANDE · **35 ventas**, última 2026-08-09
- **2120** · `paletapala` (10 car.) · Paleta Paladini · **34 ventas**, última 2026-08-10
- **2299** · `sardoverona` (11 car.) · Queso Sardo La Verona · **30 ventas**, última 2026-08-06
- **2101** · `cremosoverona` (13 car.) · Queso Cremoso Verona · **28 ventas**, última 2026-08-08
- **2213** · `lahoja` (6 car.) · Tabaco La Hoja · **28 ventas**, última 2026-08-08
- **2088** · `salamefox` (9 car.) · Salame Fox  · **27 ventas**, última 2026-08-10
- **2126** · `salametro` (9 car.) · Salametro · **26 ventas**, última 2026-08-10
- **857** · `albondiga` (9 car.) · Albondigas Caseras x Caja · **25 ventas**, última 2026-08-07
- **2185** · `PRITTY` (6 car.) · PRITTY 1L · **25 ventas**, última 2026-08-07
- **448** · `pancho12` (8 car.) · Pan Pancho Fucci · **20 ventas**, última 2026-08-08
- **967** · `7790O36048260` (13 car.) · VINO UVITA BLANCO DULCE X12 · **14 ventas**, última 2026-08-09
- **2092** · `panlomo` (7 car.) · Pan Lomito · **14 ventas**, última 2026-07-08
- **2119** · `cascaranegra` (12 car.) · Queso Cascara Negra CLP · **9 ventas**, última 2026-08-07
- **2124** · `mozzacremac` (11 car.) · Mozzarella Cremac · **9 ventas**, última 2026-08-04
- **763** · `chori` (5 car.) · Chorigol Casero x Caja 30u · **8 ventas**, última 2026-06-21
- **822** · `SURTIDO PRIME` (13 car.) · PRIME PRESERVATIVO · **8 ventas**, última 2026-08-06
- **1585** · `ARGENTINA BOMBILLA` (18 car.) · ARGENTINA BOMBILLA · **5 ventas**, última 2026-08-10
- **2125** · `casera` (6 car.) · Hamburguesa Casera · **5 ventas**, última 2026-07-28
- **2300** · `roque` (5 car.) · Queso Azukl Vanguard · **5 ventas**, última 2026-08-07
- **2301** · `bondiola` (8 car.) · Bondiola Piamontesa · **5 ventas**, última 2026-08-05
- **2336** · `solforati` (9 car.) · Sol Pampeano Forati · **5 ventas**, última 2026-08-05
- **68** · `BENGALA` (7 car.) · BENGALA X4 · **4 ventas**, última 2026-08-06
- **2241** · `Solmayorhigienico` (17 car.) · Sol Mayor Papel Higienico · **4 ventas**, última 2026-07-27
- **2271** · `verduleria` (10 car.) · verduleria · **4 ventas**, última 2026-06-22
- **2298** · `holandaverona` (13 car.) · Queso Holanda La Verona · **4 ventas**, última 2026-07-02
- **2337** · `%` (1 car.) · azucar impalpable velez 250gr · **4 ventas**, última 2026-07-22
- **586** · `TARRITOORINA` (12 car.) · TARRITO ORINA · **3 ventas**, última 2026-08-04
- **2272** · `aceiteseda` (10 car.) · Aceite Seda 10L · **3 ventas**, última 2026-07-27
- **1886** · `sprite237` (9 car.) · Sprite Vidrio 237  · **2 ventas**, última 2026-08-05
- **1951** · `solcabello` (10 car.) · SOL PAMPEANO CABELLITO · **2 ventas**, última 2026-08-06
- **430** · `PAÑO AMARRILLO` (14 car.) · PAÑO AMARILLO · **1 ventas**, última 2026-07-03
- **1437** · `LOMO PAN` (8 car.) · PAN ALS LOMO · **1 ventas**, última 2026-05-23
- **1473** · `QUITAESMALTENEPTUS` (18 car.) · QUITAESMALTE NEPTUS 60CM · **1 ventas**, última 2026-07-31
- **1883** · `LIVRA CITRUS 1.5 GAS` (20 car.) · LIVRA CITRUS 1.5 CON GAS · **1 ventas**, última 2026-05-27
- **1885** · `fanta 237` (9 car.) · fanta vidrio 237 · **1 ventas**, última 2026-08-05
- **2225** · `camel10` (7 car.) · Camel 10 · **1 ventas**, última 2026-05-26
- **2315** · `arrolladovaca` (13 car.) · Arrollado de Vaca · **1 ventas**, última 2026-06-08
- **2397** · `caja bon o bon` (14 car.) · caja bon o bon · **1 ventas**, última 2026-07-10
- **2398** · `bocadito fantoche` (17 car.) · bocadito fantoche · **1 ventas**, última 2026-07-10
## El tercer campo: el código de nivel ubicación

`ProductoLocal.codigo_barra_propio` es un campo **distinto** de los dos del
producto: vive en la fila de la ubicación, con un unique por
`(localId, codigo_barra_propio)`, y no lo ven las otras ubicaciones.

**Está vacío: 0 de 11.651 filas en producción.** La capacidad existe en la ficha
desde el 2026-07-28 y nadie la usó nunca, ni el depósito ni Casiano.

Las 90 mediciones de este documento **nunca lo incluyeron**: salieron todas de
`ProductoBase.codigo_barra`, el primario del producto.

El buscador del POS sí lo lee, junto con el primario y el secundario, pero
**solo el de la ubicación donde uno está parado**: la consulta filtra por
`localId`, así que un código propio de otro local no matchea nunca
(`app/api/pos-ventas/buscar-producto/route.js:106-116`).

## Un caso aparte: `%` (id 2337)

En "azucar impalpable velez 250gr". Lo creó el depósito y tiene 3 ventas, así
que entra en los 60 que se vacían.
