# Huellas de la pantalla de conciliación de listas

Referencia de **dos pantallas que la línea de base no cubre**. Va en su propio
directorio y no dentro de `tests/huellas/baseline` a propósito: aquella se
refiere a un momento preciso —el árbol anterior al refactor de SunmiTable— y
mezclarle capturas posteriores la convertiría en un cajón, perdiendo lo único
que la hace útil, que es poder decir contra qué se compara.

## A qué commit corresponden

Al árbol en `af0aa11`, que es donde la pantalla quedó como se ve acá.

El arreglo posterior de la espera del generador —el que dejó de contar la fila de
"Cargando…" como fila de datos— no cambia lo que estas dos capturan: en las dos
corridas, antes y después del arreglo, dieron los mismos números (25 y 10 filas)
y la misma estructura.

## Qué documentan

Son los dos cambios visibles de la tanda que cableó `resultadoInterpretacion`:

- `22-listas-conciliacion` — la pantalla **como abre**. La vista por defecto
  pasó a ser "Pendientes de decisión", que el servidor filtra en el `where` con
  `filtroDeLaCola`. Antes abría en "Todas" y las filas que piden una decisión
  quedaban enterradas entre las novecientas que no piden nada. En la importación
  de referencia son 636 de 917.

- `23-listas-armado-dudoso` — la misma pantalla acotada a `FACTOR_DUDOSO`. Va
  aparte porque esas filas son las únicas donde la columna **Propuesto queda en
  raya**, y en la vista general no entran en la primera página: quedan detrás de
  625 sin vincular. La raya es el cambio: el motor no propuso ningún costo para
  esas filas, y antes la grilla mostraba ahí el de una hipótesis calculada en el
  navegador, dando a entender que el sistema ya había decidido. La columna
  Decisión, por lo mismo, dice "Revisar armado · no se pudo convertir el precio"
  y no "hay una sugerida".

## Condiciones de captura

Las mismas que la línea de base —ventana 1366x900, base `erpazul_al`, servidor en
el 3111, contexto en el grupo del depósito y ubicación `depo`— más una propia:

- **La importación es la #3 de `erpazul_al`**, la única abierta, con 917 filas.
  El id entra por `--importacion`; con otra base hay que pasarlo o la pantalla da
  404 y la huella sale vacía.

Se regeneran con:

    node scripts/generar-huellas.mjs --salida /tmp/despues --usuario <mail> --clave <clave>
    node scripts/comparar-huellas.mjs tests/huellas/conciliacion /tmp/despues

`comparar-huellas` solo compara las pantallas que están en las dos corridas, así
que apuntarlo a este directorio informa estas dos y lista el resto como "sólo en
la corrida nueva".

## Lo que la captura NO muestra

El PNG es del alto de la ventana y la tabla queda abajo del pliegue: lo que se ve
es la cabecera de la importación. La evidencia de las columnas y de las filas está
en `huellas.json`, que es lo que compara el script. Para mirar la tabla a ojo hay
que abrir la pantalla.
