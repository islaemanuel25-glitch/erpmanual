# Códigos de barra vaciados el 2026-08-10 — respaldo para reponer

> **Esto es el estado ANTERIOR.** Son los 33 productos cuyo `codigo_barra` pasa a
> `NULL` con la migración `20260810210000_vaciar_codigos_barra_derivados_del_nombre`.
> Existe para que, si mañana aparece que alguno servía, se pueda reponer sin
> adivinar.

## Por qué estos 33

**El criterio es el largo: más de 8 caracteres.** Un nombre volcado en la columna
del código tiene 12 o 15 caracteres; un atajo de tecleo tiene cuatro o cinco.
Nadie escribe "medialunassaladas" para buscar un producto.

El criterio anterior —"el código es el nombre del producto o su comienzo"— estaba
mal. Dejaba adentro 14 abreviaturas cortas que son justamente lo que alguien
teclea todos los días. Esas 14 salieron y se revisan una por una.

**No entran** los 57 restantes con letras ni los 16 de más de 14 caracteres que no
estén en esta lista.

## Cómo reponer

Uno solo, por id:

```sql
UPDATE "ProductoBase" SET codigo_barra = 'mortadela' WHERE id = 1027 AND codigo_barra IS NULL;
```

Todos de una vez: correr el bloque de abajo. La condición `IS NULL` está para no
pisar un código que alguien haya cargado en el medio.

```sql
UPDATE "ProductoBase" SET codigo_barra = 'albondiga' WHERE id = 857 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'HILO ATAR' WHERE id = 292 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'mortadela' WHERE id = 2099 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salamefox' WHERE id = 2088 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salametro' WHERE id = 2126 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'aceiteseda' WHERE id = 2272 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'doververde' WHERE id = 2134 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'fantalimon' WHERE id = 2331 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletafela' WHERE id = 2098 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletapala' WHERE id = 2120 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'salamefela' WHERE id = 2100 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'verduleria' WHERE id = 2271 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'CARBONCHICO' WHERE id = 2190 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'paletasadia' WHERE id = 2083 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PALO MADERA' WHERE id = 427 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'CARBONGRANDE' WHERE id = 2191 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'IODOPOVIDONA' WHERE id = 665 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'LOMO DEL RIO' WHERE id = 1780 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PULVERIZADOR' WHERE id = 1393 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'TARRITOORINA' WHERE id = 586 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BARRATREMBLAY' WHERE id = 79 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pan congelADO' WHERE id = 1721 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pollo trozado' WHERE id = 2387 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'caja bon o bon' WHERE id = 2397 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cremoso ramolac' WHERE id = 1647 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'ESCOBILLON CURVO' WHERE id = 1577 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'Medialunasdulces' WHERE id = 2296 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bizcochocongelado' WHERE id = 2295 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bocadito fantoche' WHERE id = 2398 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'medialunassaladas' WHERE id = 2297 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'TOALLITAS PAMPERS' WHERE id = 1296 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'ARGENTINA BOMBILLA' WHERE id = 1585 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'QUITAESMALTENEPTUS' WHERE id = 1473 AND codigo_barra IS NULL;
```

## La lista, ordenada por ventas

Los de arriba son los que más se venden: si alguno de estos resulta que se usaba
para buscar, es el primero que se va a notar.

- **79** · `BARRATREMBLAY` (13 car.) · BARRA TREMBLAY · 201 ventas · creado 2026-05-07
- **2083** · `paletasadia` (11 car.) · Paleta sadia · 114 ventas · creado 2026-05-11
- **2099** · `mortadela` (9 car.) · Mortadela Paladini · 82 ventas · creado 2026-05-11
- **2098** · `paletafela` (10 car.) · Paleta Fela · 80 ventas · creado 2026-05-11
- **2100** · `salamefela` (10 car.) · Salame Fela · 61 ventas · creado 2026-05-12
- **2134** · `doververde` (10 car.) · Dover Verde · 60 ventas · creado 2026-05-14
- **2190** · `CARBONCHICO` (11 car.) · CARBON CHICO · 39 ventas · creado 2026-05-20
- **2191** · `CARBONGRANDE` (12 car.) · CARBON  GRANDE · 35 ventas · creado 2026-05-20
- **2120** · `paletapala` (10 car.) · Paleta Paladini · 34 ventas · creado 2026-05-12
- **2387** · `pollo trozado` (13 car.) · pollo trozado · 33 ventas · creado 2026-07-07
- **2088** · `salamefox` (9 car.) · Salame Fox  · 27 ventas · creado 2026-05-11
- **2126** · `salametro` (9 car.) · Salametro · 26 ventas · creado 2026-05-12
- **857** · `albondiga` (9 car.) · Albondigas Caseras x Caja · 25 ventas · creado 2026-05-07
- **1585** · `ARGENTINA BOMBILLA` (18 car.) · ARGENTINA BOMBILLA · 5 ventas · creado 2026-05-07
- **2271** · `verduleria` (10 car.) · verduleria · 4 ventas · creado 2026-05-30
- **2272** · `aceiteseda` (10 car.) · Aceite Seda 10L · 3 ventas · creado 2026-05-30
- **586** · `TARRITOORINA` (12 car.) · TARRITO ORINA · 3 ventas · creado 2026-05-07
- **2397** · `caja bon o bon` (14 car.) · caja bon o bon · 1 ventas · creado 2026-07-10
- **2398** · `bocadito fantoche` (17 car.) · bocadito fantoche · 1 ventas · creado 2026-07-10
- **1473** · `QUITAESMALTENEPTUS` (18 car.) · QUITAESMALTE NEPTUS 60CM · 1 ventas · creado 2026-05-07
- **292** · `HILO ATAR` (9 car.) · HILO ATAR · sin ventas · creado 2026-05-07
- **2331** · `fantalimon` (10 car.) · Fanta Limon 2l · sin ventas · creado 2026-06-11
- **427** · `PALO MADERA` (11 car.) · PALO MADERA · sin ventas · creado 2026-05-07
- **665** · `IODOPOVIDONA` (12 car.) · IODOPOVIDONA · sin ventas · creado 2026-05-07
- **1780** · `LOMO DEL RIO` (12 car.) · LOMO DEL RIO X2 · sin ventas · creado 2026-05-07
- **1393** · `PULVERIZADOR` (12 car.) · PULVERIZADOR1L · sin ventas · creado 2026-05-07
- **1721** · `pan congelADO` (13 car.) · pan congelado xkg · sin ventas · creado 2026-05-07
- **1647** · `cremoso ramolac` (15 car.) · CREMOSO RAMOLAC X KG · sin ventas · creado 2026-05-07
- **1577** · `ESCOBILLON CURVO` (16 car.) · ESCOBILLON CURVO · sin ventas · creado 2026-05-07
- **2296** · `Medialunasdulces` (16 car.) · Medialunas Dulces Congeladas x75 · sin ventas · creado 2026-06-02
- **2295** · `bizcochocongelado` (17 car.) · Bizcocho Congelado · sin ventas · creado 2026-06-02
- **2297** · `medialunassaladas` (17 car.) · Medialunas Saladas Congeladas x75 · sin ventas · creado 2026-06-02
- **1296** · `TOALLITAS PAMPERS` (17 car.) · TOALLITAS PAMPERS X48 · sin ventas · creado 2026-05-07

## Las 14 que salieron del vaciado

Estaban en la versión anterior de esta migración y **NO se tocan**. Pasaron a la
lista de revisión de [codigos-de-barra.md](codigos-de-barra.md).

- **92** · `bica` (4 car.) · Bicarbonato Paez
- **763** · `chori` (5 car.) · Chorigol Casero x Caja 30u
- **691** · `maple` (5 car.) · Maple Huevos x30
- **2105** · `papas` (5 car.) · Papas Congeladas
- **2185** · `PRITTY` (6 car.) · PRITTY 1L
- **2023** · `361LATA` (7 car.) · 361 LATA X24
- **68** · `BENGALA` (7 car.) · BENGALA X4
- **2225** · `camel10` (7 car.) · Camel 10
- **2301** · `bondiola` (8 car.) · Bondiola Piamontesa
- **1322** · `cordones` (8 car.) · cordones negros
- **316** · `JAIMITOS` (8 car.) · Jaimitos X 10u
- **1417** · `pancho24` (8 car.) · Pancho 24 Als
- **1775** · `pategras` (8 car.) · pategras por kg
- **1457** · `prepizza` (8 car.) · prepizza cebolla
