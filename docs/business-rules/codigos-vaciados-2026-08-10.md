# Códigos de barra vaciados el 2026-08-10 — respaldo para reponer

> **Esto es el estado ANTERIOR.** Son los 47 productos cuyo `codigo_barra` pasó a
> `NULL` con la migración `20260810210000_vaciar_codigos_barra_derivados_del_nombre`.
> Existe para que, si mañana aparece que alguno servía, se pueda reponer sin
> adivinar.

## Por qué estos 47

Su código era el nombre del producto —21 casos, idéntico— o el comienzo del
nombre —26 casos, abreviado—. La búsqueda por nombre ya los encuentra, así que
el campo no aportaba nada y sí ocupaba la columna del código.

**No entraron** los 43 restantes con letras, ni los 16 de más de 14 caracteres:
esos se revisan uno por uno.

**Ojo con los cinco más cortos.** `bica`, `chori`, `maple`, `papas` y `PRITTY`
son abreviaturas de 4 a 6 caracteres. Cumplen la regla —son el comienzo del
nombre— pero son también las que más se parecen a un atajo de tecleo que alguien
podría usar a diario. Si alguna lo era, es la primera candidata a reponer.

## Cómo reponer

Uno solo, por id:

```sql
UPDATE "ProductoBase" SET codigo_barra = 'bica' WHERE id = 92 AND codigo_barra IS NULL;
```

Todos de una vez: correr el bloque de abajo. La condición `IS NULL` está para no
pisar un código que alguien haya cargado en el medio.

```sql
UPDATE "ProductoBase" SET codigo_barra = 'bica' WHERE id = 92 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'chori' WHERE id = 763 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'maple' WHERE id = 691 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'papas' WHERE id = 2105 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PRITTY' WHERE id = 2185 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '361LATA' WHERE id = 2023 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BENGALA' WHERE id = 68 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'camel10' WHERE id = 2225 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bondiola' WHERE id = 2301 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cordones' WHERE id = 1322 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'JAIMITOS' WHERE id = 316 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pancho24' WHERE id = 1417 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pategras' WHERE id = 1775 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'prepizza' WHERE id = 1457 AND codigo_barra IS NULL;
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

## La lista

Id · código que tenía · producto · creado · última modificación antes de vaciar.

- **92** · `bica` (4, abreviado) · Bicarbonato Paez · 2026-05-07 → 2026-05-12
- **763** · `chori` (5, abreviado) · Chorigol Casero x Caja 30u · 2026-05-07 → 2026-06-14
- **691** · `maple` (5, abreviado) · Maple Huevos x30 · 2026-05-07 → 2026-06-01
- **2105** · `papas` (5, abreviado) · Papas Congeladas · 2026-05-12 → 2026-07-14
- **2185** · `PRITTY` (6, abreviado) · PRITTY 1L · 2026-05-20 → 2026-07-31
- **2023** · `361LATA` (7, abreviado) · 361 LATA X24 · 2026-05-07 → 2026-08-05
- **68** · `BENGALA` (7, abreviado) · BENGALA X4 · 2026-05-07 → 2026-07-14
- **2225** · `camel10` (7, exacto) · Camel 10 · 2026-05-26 → 2026-08-07
- **2301** · `bondiola` (8, abreviado) · Bondiola Piamontesa · 2026-06-03 → 2026-06-03
- **1322** · `cordones` (8, abreviado) · cordones negros · 2026-05-07 → 2026-05-16
- **316** · `JAIMITOS` (8, abreviado) · Jaimitos X 10u · 2026-05-07 → 2026-06-10
- **1417** · `pancho24` (8, abreviado) · Pancho 24 Als · 2026-05-07 → 2026-06-17
- **1775** · `pategras` (8, abreviado) · pategras por kg · 2026-05-07 → 2026-08-01
- **1457** · `prepizza` (8, abreviado) · prepizza cebolla · 2026-05-07 → 2026-05-07
- **857** · `albondiga` (9, abreviado) · Albondigas Caseras x Caja · 2026-05-07 → 2026-06-12
- **292** · `HILO ATAR` (9, exacto) · HILO ATAR · 2026-05-07 → 2026-05-16
- **2099** · `mortadela` (9, abreviado) · Mortadela Paladini · 2026-05-11 → 2026-06-19
- **2088** · `salamefox` (9, exacto) · Salame Fox  · 2026-05-11 → 2026-06-19
- **2126** · `salametro` (9, exacto) · Salametro · 2026-05-12 → 2026-06-09
- **2272** · `aceiteseda` (10, abreviado) · Aceite Seda 10L · 2026-05-30 → 2026-07-15
- **2134** · `doververde` (10, exacto) · Dover Verde · 2026-05-14 → 2026-08-07
- **2331** · `fantalimon` (10, abreviado) · Fanta Limon 2l · 2026-06-11 → 2026-06-11
- **2098** · `paletafela` (10, exacto) · Paleta Fela · 2026-05-11 → 2026-07-31
- **2120** · `paletapala` (10, abreviado) · Paleta Paladini · 2026-05-12 → 2026-06-12
- **2100** · `salamefela` (10, exacto) · Salame Fela · 2026-05-12 → 2026-06-24
- **2271** · `verduleria` (10, exacto) · verduleria · 2026-05-30 → 2026-05-30
- **2190** · `CARBONCHICO` (11, exacto) · CARBON CHICO · 2026-05-20 → 2026-06-13
- **2083** · `paletasadia` (11, exacto) · Paleta sadia · 2026-05-11 → 2026-06-09
- **427** · `PALO MADERA` (11, exacto) · PALO MADERA · 2026-05-07 → 2026-05-07
- **2191** · `CARBONGRANDE` (12, exacto) · CARBON  GRANDE · 2026-05-20 → 2026-06-13
- **665** · `IODOPOVIDONA` (12, exacto) · IODOPOVIDONA · 2026-05-07 → 2026-05-16
- **1780** · `LOMO DEL RIO` (12, abreviado) · LOMO DEL RIO X2 · 2026-05-07 → 2026-05-16
- **1393** · `PULVERIZADOR` (12, abreviado) · PULVERIZADOR1L · 2026-05-07 → 2026-05-07
- **586** · `TARRITOORINA` (12, exacto) · TARRITO ORINA · 2026-05-07 → 2026-05-16
- **79** · `BARRATREMBLAY` (13, exacto) · BARRA TREMBLAY · 2026-05-07 → 2026-07-01
- **1721** · `pan congelADO` (13, abreviado) · pan congelado xkg · 2026-05-07 → 2026-05-07
- **2387** · `pollo trozado` (13, exacto) · pollo trozado · 2026-07-07 → 2026-08-02
- **2397** · `caja bon o bon` (14, exacto) · caja bon o bon · 2026-07-10 → 2026-07-10
- **1647** · `cremoso ramolac` (15, abreviado) · CREMOSO RAMOLAC X KG · 2026-05-07 → 2026-05-15
- **1577** · `ESCOBILLON CURVO` (16, exacto) · ESCOBILLON CURVO · 2026-05-07 → 2026-05-16
- **2296** · `Medialunasdulces` (16, abreviado) · Medialunas Dulces Congeladas x75 · 2026-06-02 → 2026-06-02
- **2295** · `bizcochocongelado` (17, exacto) · Bizcocho Congelado · 2026-06-02 → 2026-06-02
- **2398** · `bocadito fantoche` (17, exacto) · bocadito fantoche · 2026-07-10 → 2026-07-10
- **2297** · `medialunassaladas` (17, abreviado) · Medialunas Saladas Congeladas x75 · 2026-06-02 → 2026-06-02
- **1296** · `TOALLITAS PAMPERS` (17, abreviado) · TOALLITAS PAMPERS X48 · 2026-05-07 → 2026-05-16
- **1585** · `ARGENTINA BOMBILLA` (18, exacto) · ARGENTINA BOMBILLA · 2026-05-07 → 2026-07-06
- **1473** · `QUITAESMALTENEPTUS` (18, abreviado) · QUITAESMALTE NEPTUS 60CM · 2026-05-07 → 2026-05-07
