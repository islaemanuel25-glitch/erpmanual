# Códigos de barra vaciados el 2026-08-10 — respaldo para reponer

> **Esto es el estado ANTERIOR.** Son los 29 productos cuyo `codigo_barra` pasa a
> `NULL` con la migración `20260810210000_vaciar_codigos_barra_derivados_del_nombre`.
> Existe para que, si mañana aparece que alguno servía, se pueda reponer sin
> adivinar.

## Por qué estos 29

**El criterio es cero ventas.** Ninguno de los 29 tiene una sola línea de venta.

Se probaron dos criterios de forma antes y los dos fallaron. "El código es el
nombre o su comienzo" dejaba adentro atajos como `bica` y `camel10`, porque un
atajo también empieza igual que el nombre. "Más de 8 caracteres" partía la
fiambrería al medio: `mortadela` (9, 82 ventas) caía del lado del vaciado y
`picadofino` (10, 48) quedaba afuera.

No hay regla de forma que separe un atajo en uso de una basura heredada. La que
sí separa es el uso.

El motivo es la asimetría: vaciar un atajo en uso le rompe el trabajo a quien
está atendiendo, y dejar basura en un campo no le cuesta nada a nadie.

## Cómo reponer

Uno solo, por id:

```sql
UPDATE "ProductoBase" SET codigo_barra = 'cordones' WHERE id = 1322 AND codigo_barra IS NULL;
```

Todos de una vez: correr el bloque de abajo. La condición `IS NULL` está para no
pisar un código que alguien haya cargado en el medio.

```sql
UPDATE "ProductoBase" SET codigo_barra = 'CORDONES' WHERE id = 139 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'HILO ATAR' WHERE id = 292 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'JAIMITOS' WHERE id = 316 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PALO MADERA' WHERE id = 427 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PERRO' WHERE id = 658 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'IODOPOVIDONA' WHERE id = 665 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'TOALLITAS PAMPERS' WHERE id = 1296 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cordones' WHERE id = 1322 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'PULVERIZADOR' WHERE id = 1393 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BOLSA 50x70' WHERE id = 1406 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BOLSA 60x90' WHERE id = 1407 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'prepizza' WHERE id = 1457 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'mixta' WHERE id = 1539 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'ESCOBILLON CURVO' WHERE id = 1577 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'cremoso ramolac' WHERE id = 1647 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pan congelADO' WHERE id = 1721 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'pategras' WHERE id = 1775 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bagetines' WHERE id = 1779 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'LOMO DEL RIO' WHERE id = 1780 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = '7790895641749-' WHERE id = 1789 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'BOCADITO CHOC BLANCO' WHERE id = 1800 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'LIVRA POMELO 1.5 GAS' WHERE id = 1882 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'skyclasico' WHERE id = 2294 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'bizcochocongelado' WHERE id = 2295 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'Medialunasdulces' WHERE id = 2296 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'medialunassaladas' WHERE id = 2297 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'petacagin' WHERE id = 2318 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'secadortango' WHERE id = 2329 AND codigo_barra IS NULL;
UPDATE "ProductoBase" SET codigo_barra = 'fantalimon' WHERE id = 2331 AND codigo_barra IS NULL;
```

## La lista, ordenada por señales de vida

Ninguno vendió nunca, pero algunos siguen moviéndose: aparecen en pedidos a
proveedor o tienen stock. Esos son los primeros que conviene mirar si algo se
extraña.

- **2295** · `bizcochocongelado` (17 car.) · Bizcocho Congelado · 1 pedido(s) a proveedor, stock 120
- **2296** · `Medialunasdulces` (16 car.) · Medialunas Dulces Congeladas x75 · 1 pedido(s) a proveedor, stock 75
- **2297** · `medialunassaladas` (17 car.) · Medialunas Saladas Congeladas x75 · 1 pedido(s) a proveedor, stock 75
- **2329** · `secadortango` (12 car.) · Secador De Pïso Tango · 1 pedido(s) a proveedor, stock 24
- **2331** · `fantalimon` (10 car.) · Fanta Limon 2l · 1 pedido(s) a proveedor, stock 8
- **665** · `IODOPOVIDONA` (12 car.) · IODOPOVIDONA · stock 43
- **1322** · `cordones` (8 car.) · cordones negros · stock 15
- **2318** · `petacagin` (9 car.) · Petaca Derna Gin · stock 12
- **2294** · `skyclasico` (10 car.) · Skyy Clasico · stock 12
- **427** · `PALO MADERA` (11 car.) · PALO MADERA · stock 1
- **1779** · `bagetines` (9 car.) · BAGUETINES DEL RIO x2 · inactivo
- **658** · `PERRO` (5 car.) · BALANCIN ALIMENTO PERRO 15KG · inactivo
- **1407** · `BOLSA 60x90` (11 car.) · BOLSA  CONSORCIO YO RECICLO 60x90 · inactivo
- **1406** · `BOLSA 50x70` (11 car.) · BOLSA CONSORCIO YO RECICLO 50x70 · inactivo
- **1789** · `7790895641749-` (14 car.) · cepita anana 1.5l · sin señales de uso
- **139** · `CORDONES` (8 car.) · CORDON EL MOÑO X12U · sin señales de uso
- **1647** · `cremoso ramolac` (15 car.) · CREMOSO RAMOLAC X KG · inactivo
- **1577** · `ESCOBILLON CURVO` (16 car.) · ESCOBILLON CURVO · sin señales de uso
- **1800** · `BOCADITO CHOC BLANCO` (20 car.) · GRANIX BOCADITO CHOC. BLANCO 2KG · sin señales de uso
- **292** · `HILO ATAR` (9 car.) · HILO ATAR · inactivo
- **316** · `JAIMITOS` (8 car.) · Jaimitos X 10u · sin señales de uso
- **1882** · `LIVRA POMELO 1.5 GAS` (20 car.) · LIVRA POMELO 1.5 CON GAS · sin señales de uso
- **1780** · `LOMO DEL RIO` (12 car.) · LOMO DEL RIO X2 · inactivo
- **1721** · `pan congelADO` (13 car.) · pan congelado xkg · sin señales de uso
- **1775** · `pategras` (8 car.) · pategras por kg · inactivo
- **1457** · `prepizza` (8 car.) · prepizza cebolla · sin señales de uso
- **1539** · `mixta` (5 car.) · prepizza mixta · sin señales de uso
- **1393** · `PULVERIZADOR` (12 car.) · PULVERIZADOR1L · sin señales de uso
- **1296** · `TOALLITAS PAMPERS` (17 car.) · TOALLITAS PAMPERS X48 · inactivo
