# INC-0010 — Con impuesto adicional, ninguna fila confirmada a mano se podía aplicar

**Estado:** **arreglado el 2026-09-19, sin desplegar todavía.** No hay ningún
costo mal escrito: el defecto IMPEDÍA escribir, no escribía de más.
**Cuándo:** desde que existe la rama del atajo de fila confirmada en
`revalidarFila`. Medido sobre la importación **#12** de M Y F el 2026-09-19.
**Alcance:** toda fila **confirmada a mano** de **todo proveedor con impuesto
adicional distinto de cero**. En la #12: **8 filas de 11**.

## NINGÚN COSTO QUEDÓ MAL. LO QUE FALTÓ FUE ESCRIBIR

Va primero porque el síntoma —"no se actualizó"— invita a buscar un dato
corrompido. No lo hay. El sistema recalcula el costo antes de escribirlo y, al no
coincidir con el que se había propuesto, **no escribe**: eso es lo correcto. El
defecto es que los dos números no podían coincidir nunca.

## Lo que se veía

Importación **#12**, proveedor **M Y F**, archivo `3-1.pdf`, recargo 5 %, rango
0–2 %. Aplicar corrió dos veces: a las **00:13** escribió **3** costos, y a la
**01:20** evaluó las otras **8** y las omitió a las ocho con
**PROPUESTA_DIFERENTE**.

Las 8 estaban tildadas, sin aplicar, sin excluir, vinculadas, confirmadas, con la
aceptación del fuera de rango puesta, y con el costo del producto sin moverse
desde la conciliación. Contra las 3 que sí se aplicaron **no había ninguna
diferencia de campo**: se compararon el recargo, la confirmación, la aceptación,
los sellos, el multiplicador, los precios por columna, el impuesto adicional y la
interpretación de la fila.

## La causa

La diferencia no estaba en las filas: estaba en **por dónde pasaba cada una**.

- Las **3** las resolvió el motor → `costoDeLaFila`, que **recibe** el impuesto
  adicional y lo aplica.
- Las **8** las confirmó una persona → el atajo de `revalidarFila`, que
  multiplicaba `precioConRecargo`, que es **solo el recargo comercial**.

Confirmar esas 8 a mano es lo que llevó la hora entre las dos corridas. *(Que las
3 sean exactamente las resueltas por el motor es una inferencia: no se pudo
comprobar contra los datos de producción desde esta máquina.)*

La cuenta, sobre un precio de lista de 1.000 con recargo 5 % e impuesto 10,5 %:

- confirmar guardaba `1.000 × 1,05 × 1,105 = 1.160,25`
- aplicar recalculaba `1.000 × 1,05 = 1.050`

La guarda que exige que el recálculo dé lo mismo que lo guardado, al centavo, no
podía dar otra cosa. **El paso donde se separaban es el impuesto adicional**, no
el recargo, ni el redondeo, ni el multiplicador, ni la columna de precio.

## Por qué no lo vio nadie antes

Porque **con impuesto 0 el defecto no existe**: `aplicarImpuestoAdicional` con 0
devuelve el costo tal cual y las dos cuentas coinciden. Las **quince**
importaciones de `erpazul_al` tienen el impuesto en **0**, así que en desarrollo
las filas confirmadas a mano se aplicaban siempre.

Y la composición `precio → recargo → impuesto` estaba escrita **dos veces** —en
`hipotesisDeCosto` y en el `lecturasPosibles` del lector genérico— y **faltaba en
la tercera**, que es justamente la que decide si se escribe un costo. Es el caso
de manual de la primera regla del `CLAUDE.md`: no se rompieron el día que se
escribieron.

## El arreglo

1. **Una sola función arma ese precio**: `precioBaseDelCosto` en
   `configuracionProveedor.js`. La usan los tres lugares, incluido el atajo de
   `revalidarFila`, que era el que no aplicaba el impuesto.
2. **La omisión deja de ser silenciosa.** El resultado revalida con la misma
   función que usa aplicar —`revisarAntesDeAplicar`— y dice cuántas van a quedar
   afuera, con el nombre y los **dos números**: lo que se iba a poner y lo que
   daría hoy.
3. **El contador y el botón dejan de contarlas.** Antes la pantalla decía "11 se
   actualizan · Aplicar los 11 precios" sobre una operación que escribía 3.
4. **Hay una salida**: "Volver a leer esos precios" recalcula la propuesta con
   los datos de hoy. La confirmación **vence** —`vinculadoEn` pasa a ser
   posterior— en vez de borrarse: la autoría queda y el número nuevo vuelve a
   pasar por los ojos de alguien antes de escribirse.

## Comprobado

Sobre `erpazul_al`, con un proveedor configurado con impuesto 10,5 % y una lista
subida y confirmada a mano desde la pantalla:

- con el arreglo: el resultado dice **6**, el previo de aplicar dice **6**, y
  aplicar escribió **6**;
- con el defecto puesto de vuelta: el resultado dice **5** y una omitida, con
  **$3.892,80** guardado contra **$3.522,90** recalculado — la #12 en chico.

Los candados están en `lib/proveedores/listas/propuestaQueQuedoVieja.test.mjs`,
y ejercen los impuestos **0, 10,5 y 21**: uno solo, con el 0 que hay en la base
de prueba, habría quedado verde con el defecto puesto.

## Lo que queda pendiente

**PROPUESTA_DIFERENTE pasó a ser difícil de alcanzar**, y eso no se verificó
contra producción. Las causas ordinarias de que la propuesta quede vieja —el
producto cambió de armado, o le cambiaron el costo— las atajan antes
`CONFIGURACION_CAMBIO` y `COSTO_CAMBIO_DESDE_CONCILIACION`, cada una con su
motivo. Si en producción sigue apareciendo PROPUESTA_DIFERENTE después de
desplegar esto, hay una segunda causa que no es el impuesto y hay que buscarla
con los dos números que la pantalla ahora muestra.
