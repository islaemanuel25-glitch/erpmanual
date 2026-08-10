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

## ⚠️ EL TOPE NO SE PUSO, Y POR QUÉ

Se iba a poner un tope duro de 14 caracteres que frenara al escribir. **No se
puso**, porque la medición encontró tres códigos de **16 dígitos, todos números,
que parecen legítimos**:

- `0117798091030524` (16) — CERVEZA ANTARES LAGER LATA
- `0147798397440011` (16) — Rasta Blanco X18
- `0147798397444200` (16) — Rasta Negro X18

Los tres empiezan con `01`. En GS1-128, `01` es el identificador de aplicación
de GTIN, y lo que sigue es un **GTIN-14**. Sacándole el `01`:

- `0117798091030524` → GTIN-14 `17798091030524`
- `0147798397440011` → GTIN-14 `47798397440011`
- `0147798397444200` → GTIN-14 `47798397444200`

Es exactamente lo que emite un lector al escanear el código de una **caja**. No
es basura tipeada: es un formato de código de barras real, más largo que 14
porque incluye el identificador.

**Y se usan:** Rasta Blanco X18 tiene 31 líneas de venta, la última el
2026-08-10. Rasta Negro X18 tiene 24, la última el 2026-08-05. Cerveza Antares
Lager Lata todavía no se vendió.

Un tope de 14 impediría volver a cargar esos códigos, y haría que un escaneo de
caja no se pueda guardar. **La decisión de negocio es de Emanuel**: si el lector
del local emite GS1-128 con el identificador adelante, el tope tiene que ser 16 y
no 14.

## Lo que sí es basura, para decidir qué hacer

**No se borró ni se corrigió nada.** Van con el nombre del producto al lado.

### Más de 14 caracteres, con letras o espacios (13 productos)

- `BOCADITO CHOC BLANCO` (20) — GRANIX BOCADITO CHOC. BLANCO 2KG
- `LIVRA CITRUS 1.5 GAS` (20) — LIVRA CITRUS 1.5 CON GAS
- `LIVRA POMELO 1.5 GAS` (20) — LIVRA POMELO 1.5 CON GAS
- `ARGENTINA BOMBILLA` (18) — ARGENTINA BOMBILLA
- `QUITAESMALTENEPTUS` (18) — QUITAESMALTE NEPTUS 60CM
- `bizcochocongelado` (17) — Bizcocho Congelado
- `bocadito fantoche` (17) — bocadito fantoche
- `medialunassaladas` (17) — Medialunas Saladas Congeladas x75
- `Solmayorhigienico` (17) — Sol Mayor Papel Higienico
- `TOALLITAS PAMPERS` (17) — TOALLITAS PAMPERS X48
- `ESCOBILLON CURVO` (16) — ESCOBILLON CURVO
- `Medialunasdulces` (16) — Medialunas Dulces Congeladas x75
- `cremoso ramolac` (15) — CREMOSO RAMOLAC X KG

### 14 caracteres o menos, pero con letras o espacios (77 productos)

Entran dentro del tope de largo, así que **un tope por largo no los habría
frenado**. La mayoría son nombres abreviados usados como código interno, y varios
parecen deliberados: el producto no tiene código de fábrica y alguien le puso uno
a mano para poder buscarlo.

- `caja bon o bon` (14) — caja bon o bon
- `7790895641749-` (14) — cepita anana 1.5l
- `PAÑO AMARRILLO` (14) — PAÑO AMARILLO
- `arrolladovaca` (13) — Arrollado de Vaca
- `BARRATREMBLAY` (13) — BARRA TREMBLAY
- `pan congelADO` (13) — pan congelado xkg
- `pollo trozado` (13) — pollo trozado
- `SURTIDO PRIME` (13) — PRIME PRESERVATIVO
- `cascarablanca` (13) — Queso Cascara Blanca CLP
- `cremosocremac` (13) — Queso Cremoso Cremac
- `cremosoverona` (13) — Queso Cremoso Verona
- `holandaverona` (13) — Queso Holanda La Verona
- `7790O36048260` (13) — VINO UVITA BLANCO DULCE X12
- `CARBONGRANDE` (12) — CARBON  GRANDE
- `IODOPOVIDONA` (12) — IODOPOVIDONA
- `LOMO DEL RIO` (12) — LOMO DEL RIO X2
- `PULVERIZADOR` (12) — PULVERIZADOR1L
- `cascaranegra` (12) — Queso Cascara Negra CLP
- `picadogrueso` (12) — Salamin Fox Picado Grueso
- `secadortango` (12) — Secador De Pïso Tango
- `TARRITOORINA` (12) — TARRITO ORINA
- `BOLSA 50x70` (11) — BOLSA CONSORCIO YO RECICLO 50x70
- `BOLSA 60x90` (11) — BOLSA  CONSORCIO YO RECICLO 60x90
- `CARBONCHICO` (11) — CARBON CHICO
- `mozzacremac` (11) — Mozzarella Cremac
- `paletasadia` (11) — Paleta sadia
- `PALO MADERA` (11) — PALO MADERA
- `pancholargo` (11) — Pan Super Pancho
- `sardoverona` (11) — Queso Sardo La Verona
- `aceiteseda` (10) — Aceite Seda 10L
- `PETACACAFE` (10) — DERNA PETACA CAFE AL COGNAC XCAJA
- `doververde` (10) — Dover Verde
- `fantalimon` (10) — Fanta Limon 2l
- `paletafela` (10) — Paleta Fela
- `paletapala` (10) — Paleta Paladini
- `salamefela` (10) — Salame Fela
- `picadofino` (10) — Salamin Fox Picado Fino
- `skyclasico` (10) — Skyy Clasico
- `solcabello` (10) — SOL PAMPEANO CABELLITO
- `verduleria` (10) — verduleria
- `albondiga` (9) — Albondigas Caseras x Caja
- `bagetines` (9) — BAGUETINES DEL RIO x2
- `fanta 237` (9) — fanta vidrio 237
- `HILO ATAR` (9) — HILO ATAR
- `mortadela` (9) — Mortadela Paladini
- `petacagin` (9) — Petaca Derna Gin
- `salamefox` (9) — Salame Fox 
- `salametro` (9) — Salametro
- `solforati` (9) — Sol Pampeano Forati
- `sprite237` (9) — Sprite Vidrio 237 
- `pachamama` (9) — Tabaco Pacha Mama
- `bondiola` (8) — Bondiola Piamontesa
- `CORDONES` (8) — CORDON EL MOÑO X12U
- `cordones` (8) — cordones negros
- `JAIMITOS` (8) — Jaimitos X 10u
- `LOMO PAN` (8) — PAN ALS LOMO
- `pancho24` (8) — Pancho 24 Als
- `pancho12` (8) — Pan Pancho Fucci
- `pategras` (8) — pategras por kg
- `prepizza` (8) — prepizza cebolla
- `361LATA` (7) — 361 LATA X24
- `BENGALA` (7) — BENGALA X4
- `camel10` (7) — Camel 10
- `panlomo` (7) — Pan Lomito
- `torpedo` (7) — PAN TORPEDO 
- `casera` (6) — Hamburguesa Casera
- `PRITTY` (6) — PRITTY 1L
- `lahoja` (6) — Tabaco La Hoja
- `PERRO` (5) — BALANCIN ALIMENTO PERRO 15KG
- `chori` (5) — Chorigol Casero x Caja 30u
- `maple` (5) — Maple Huevos x30
- `papas` (5) — Papas Congeladas
- `mixta` (5) — prepizza mixta
- `roque` (5) — Queso Azukl Vanguard
- `bica` (4) — Bicarbonato Paez
- `xl` (2) — Hamburguesa Casera XL
- `%` (1) — azucar impalpable velez 250gr

## Un caso aparte: `7790895641749-`

Trece dígitos correctos y un guion al final, en "cepita anana 1.5l". Es el único
que parece un error de tipeo sobre un código válido y no una decisión.
