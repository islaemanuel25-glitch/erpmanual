# Códigos del depósito vaciados el 2026-08-10 — respaldo para reponer

> **Estado ANTERIOR** de los 60 productos que la migración
> `20260810230000_vaciar_codigos_barra_del_deposito` pasa a `NULL`.

## ⚡ Los 15 que más se venden — para reponer uno rápido

Si alguien avisa que le falta un atajo, lo más probable es que sea uno de estos.
Están acá arriba para no tener que leer las sesenta líneas. Cada uno con su
`UPDATE` listo para copiar.

```sql
UPDATE "ProductoBase" SET codigo_barra = 'cremosocremac' WHERE id = 2086 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BARRATREMBLAY' WHERE id = 79 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'xl' WHERE id = 694 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancho24' WHERE id = 1417 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletasadia' WHERE id = 2083 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PETACACAFE' WHERE id = 455 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'mortadela' WHERE id = 2099 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'maple' WHERE id = 691 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletafela' WHERE id = 2098 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'papas' WHERE id = 2105 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'torpedo' WHERE id = 1416 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salamefela' WHERE id = 2100 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'doververde' WHERE id = 2134 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '361LATA' WHERE id = 2023 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancholargo' WHERE id = 2130 AND codigo_barra IS NULL;
```

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

## Por qué estos 60

**El criterio es quién creó el producto, y nada más.** Los creó el depósito. El
único local que crea y toca productos es Casiano Casas y lo suyo no se toca, por
[../decisions/DEC-0006](../decisions/DEC-0006-codigos-de-casiano-intocables.md).

El creador está guardado en `ProductoBase.creadoEnLocalId`, no se deduce.

Hubo un recorte por ventas —dejar afuera los de más de 50— que se probó y se
descartó. No queda ni como condición ni como excepción.

⚠ **Esto no mira las ventas, y los 60 tienen.** Tiene que ser así: los que nunca
vendieron ya los vació la migración anterior, así que lo que queda es exactamente
lo que se usa.

## Cómo reponer

Uno solo, por id:

```sql
UPDATE "ProductoBase" SET codigo_barra = 'xl' WHERE id = 694 AND codigo_barra IS NULL;
```

Los sesenta de una vez. La condición `IS NULL` está para no pisar un código que
alguien haya cargado en el medio:

```sql
UPDATE "ProductoBase" SET codigo_barra = 'BENGALA' WHERE id = 68 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BARRATREMBLAY' WHERE id = 79 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bica' WHERE id = 92 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PAÑO AMARRILLO' WHERE id = 430 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancho12' WHERE id = 448 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PETACACAFE' WHERE id = 455 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'picadofino' WHERE id = 552 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'TARRITOORINA' WHERE id = 586 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'maple' WHERE id = 691 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'xl' WHERE id = 694 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'chori' WHERE id = 763 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'SURTIDO PRIME' WHERE id = 822 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'albondiga' WHERE id = 857 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '7790O36048260' WHERE id = 967 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'torpedo' WHERE id = 1416 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancho24' WHERE id = 1417 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'LOMO PAN' WHERE id = 1437 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'QUITAESMALTENEPTUS' WHERE id = 1473 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'picadogrueso' WHERE id = 1541 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'ARGENTINA BOMBILLA' WHERE id = 1585 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'LIVRA CITRUS 1.5 GAS' WHERE id = 1883 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'fanta 237' WHERE id = 1885 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'sprite237' WHERE id = 1886 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'solcabello' WHERE id = 1951 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '361LATA' WHERE id = 2023 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletasadia' WHERE id = 2083 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cremosocremac' WHERE id = 2086 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salamefox' WHERE id = 2088 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pachamama' WHERE id = 2091 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'panlomo' WHERE id = 2092 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletafela' WHERE id = 2098 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'mortadela' WHERE id = 2099 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salamefela' WHERE id = 2100 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cremosoverona' WHERE id = 2101 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'papas' WHERE id = 2105 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cascarablanca' WHERE id = 2117 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cascaranegra' WHERE id = 2119 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletapala' WHERE id = 2120 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'mozzacremac' WHERE id = 2124 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'casera' WHERE id = 2125 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salametro' WHERE id = 2126 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancholargo' WHERE id = 2130 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'doververde' WHERE id = 2134 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PRITTY' WHERE id = 2185 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'CARBONCHICO' WHERE id = 2190 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'CARBONGRANDE' WHERE id = 2191 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'lahoja' WHERE id = 2213 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'camel10' WHERE id = 2225 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'Solmayorhigienico' WHERE id = 2241 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'verduleria' WHERE id = 2271 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'aceiteseda' WHERE id = 2272 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'holandaverona' WHERE id = 2298 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'sardoverona' WHERE id = 2299 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'roque' WHERE id = 2300 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bondiola' WHERE id = 2301 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'arrolladovaca' WHERE id = 2315 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'solforati' WHERE id = 2336 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '%' WHERE id = 2337 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'caja bon o bon' WHERE id = 2397 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bocadito fantoche' WHERE id = 2398 AND codigo_barra IS NULL;
```

## Los 60, ordenados por ventas

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

## Lo que NO toca esta migración

- `pollo trozado` (id 2387, 34 ventas), el único creado por Casiano Casas.
  Cuando esto se aplique va a ser el **único** producto con código de texto.
- Los tres códigos GS1 de 16 dígitos, que son etiquetas de bulto legítimas.
- `ProductoLocal.codigo_barra_propio`, el código de nivel ubicación: otro campo,
  de otra tabla, vacío en las 11.651 filas de producción.
