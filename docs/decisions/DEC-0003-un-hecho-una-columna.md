# DEC-0003 — Un hecho, una columna: la exclusión y la confirmación

**Estado:** Vigente

## Contexto

En la conciliación de listas de proveedor, el veredicto del motor y la decisión de
una persona se estaban guardando en el mismo lugar: el estado de la fila.

`EstadoFilaLista.EXCLUIDO` existía en el enum y **nada lo escribía nunca**. El
contador que contaba por estado daba siempre cero, mientras las filas realmente
excluidas se seguían contando bajo su estado original.

## Decisión

**El veredicto del motor y la decisión de una persona son datos distintos y no se
pisan.** Ante la duda: dos hechos y un predicado que los lea juntos.

- La exclusión vive en su propia columna, `ImportacionListaFila.excluidaManual`.
- La confirmación de una interpretación **no se borra al revincular: vence.** Se
  compara `confirmadoEn` contra `vinculadoEn`, y la autoría se conserva.

## Motivo

Pisar el estado pierde el motivo por el que la fila estaba así. Y desexcluir, que
es una acción reversible, no podría restaurarlo: la información ya no está.

Con la confirmación pasa lo mismo al revés: borrarla al revincular pierde quién
decidió y cuándo, que es justo lo que hay que poder auditar.

## Consecuencias

- Los contadores y los filtros pasan a leer `excluidaManual`, no el estado.
- Aparece `lib/proveedores/listas/vigenciaConfirmacion.js`, con
  `multiplicadorConfirmadoUsable`: una confirmación anterior a la última
  vinculación **no cuenta**.
- **`EXCLUIDO` quedó en el enum** como rama muerta: existe en el schema y en
  `estados.js`, pero ningún llamador lo alcanza. El comentario del schema afirma
  que "del lado JS ya se sacó" y eso no es exacto. Ver contradicción C-05.

## Evidencia

- Commit `76c6faa` *fix(listas): la exclusión es una marca, no un estado*.
- Commit `96f9816` *feat(listas): la confirmación vence, no se borra*.
- `lib/proveedores/listas/vigenciaConfirmacion.js:123`.
- La regla está elevada a permanente en `CLAUDE.md` §3.
