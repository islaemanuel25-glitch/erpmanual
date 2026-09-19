# INC-0011 — Siete centavos frenaban la aplicación, y el cartel decía que el precio había cambiado

**Estado:** **arreglado el 2026-09-19, sin desplegar todavía.** Ningún costo quedó
mal: el defecto IMPEDÍA escribir.
**Cuándo:** visible desde el 2026-09-19, al desplegarse el
[INC-0010](INC-0010-la-propuesta-confirmada-a-mano-no-se-podia-aplicar.md), que es
el que hizo llegar estas filas hasta la comparación. La causa de los centavos es
anterior.
**Alcance:** toda fila de un proveedor genérico cuyo producto sea un **bulto**.
En la #12 de M Y F: **7 filas**.

## Lo que se veía

El resultado avisaba, con el cartel que el INC-0010 acababa de agregar:

> 7 no se van a actualizar: sus precios cambiaron desde que se leyó la lista

Y las diferencias eran de **centavos**:

- Savora 250gr — se iba a poner **$31.428,00**, ahora daría **$31.427,93** (7 ¢)
- ALA JABON EN POLVO 400Gr MATIC — **$37.217,04** contra **$37.217,12** (8 ¢)
- ALA POLVO 400gr MATIC SOL — **$37.217,04** contra **$37.217,12** (8 ¢)
- ALA EN POLVO 400GR LAVADO A MANO — **$37.218,96** contra **$37.218,89** (7 ¢)
- ALA POLVO MATIC 800GR — **$65.034,96** contra **$65.034,90** (6 ¢)

Entre el **0,0001 %** y el **0,0003 %** del costo. El precio no se había movido.

Son **dos defectos encimados**, y conviene tenerlos separados:

1. La comparación era **al centavo**, así que frenaba escrituras legítimas.
2. El cartel **afirmaba un hecho falso** —"sus precios cambiaron"— sobre filas
   donde no había cambiado nada.

## La causa de los centavos

`lecturasPosibles` del lector genérico le pasaba a `lecturasDeFila` el precio
unitario **ya redondeado**, y `lecturasDeFila` lo multiplica por el factor del
bulto. O sea:

- conciliar guardaba `round2(round2(P) × F)` — el centavo del unitario
  multiplicado por 24;
- aplicar recalculaba `round2(P × F)`.

Reconstruido sobre los cinco casos: **5 de 5** los explica un factor entero de
entre 12 y 24. Ejemplo, Savora con factor 15: unitario 2.095,195333 → redondeado
2.095,20 → ×15 = **31.428,00** (lo guardado); a precisión completa ×15 =
**31.427,93** (lo recalculado).

**Cuál de las dos es la correcta no es opinión.** `calculoCosto.js` lo tiene
escrito desde el principio: *"la multiplicación por el factor se hace a precisión
COMPLETA y recién el resultado final se lleva a centavos enteros"*, con su caso
—$1.480 terminando en $1.479,96—. Esa línea era la única del módulo que no lo
seguía.

## El arreglo

1. **La raíz**: el unitario ya no se redondea antes de multiplicar. Conciliar y
   aplicar dan ahora el **mismo número**, comprobado sobre cinco precios cuyo
   unitario no cae justo en un centavo.
2. **La red**: la comparación deja de ser al centavo. Si la diferencia es menor
   que el mayor entre el **0,1 %** y **un peso**, se aplica el **recalculado**
   —el que sale de los datos de hoy— sin avisar. Son dos umbrales porque uno solo
   no alcanza: el 0,1 % de $40 son cuatro centavos, y un peso sobre $65.000 es más
   ajustado que lo que puede arrastrar un bulto de 24.
3. **El cartel** deja de afirmar que el precio cambió —no lo sabe— y dice **en
   cuánto difiere**, en pesos y en porcentaje, y que por eso no se escribe.

La tolerancia es la red, **no la solución**: cubre las filas que ya están
conciliadas con el número viejo. Si empieza a tapar diferencias nuevas, hay una
segunda causa y hay que buscarla, no ensanchar el margen.

## Comprobado

Sobre `erpazul_al`, reproduciendo la secuencia real —conciliar con el código
viejo, aplicar con el arreglado—: una fila de bulto quedó guardada en
**$40.733,40** y el recálculo dio **$40.733,36**. Con la tolerancia, el resultado
dice 6 y 0 omitidas, y aplicar escribió las 6, poniendo **$40.733,36**, que es el
número correcto.

Candados en `lib/proveedores/listas/centavosDeRedondeo.test.mjs`, con los cinco
casos de la #12 y contraprueba sobre las tres cosas que defienden.

## Lo que queda anotado

**El umbral del 0,1 % es generoso sobre costos grandes**: sobre $65.000 admite
$65 de diferencia sin avisar. Las diferencias medidas son de centavos —tres
órdenes de magnitud menos— así que el margen sobra por mucho; si se quiere más
ajustado, el lugar es `TOLERANCIA_REDONDEO_PCT` y hay un candado que fija dónde
cae el corte.

**Las filas ya conciliadas mantienen el número viejo.** No hay migración: se
aplican por la tolerancia, escribiendo el valor recalculado. Las importaciones
nuevas ya nacen con las dos cuentas iguales.
