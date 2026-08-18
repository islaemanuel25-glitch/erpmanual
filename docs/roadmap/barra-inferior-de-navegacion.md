# Barra inferior de navegación

Estado: **no empezada**. Anotada el 2026-08-18, al rediseñar la tarjeta de
producto.

## Por qué está acá y no entró con la tarjeta

El diseño móvil que trajo la fila de acciones fija también trae una barra de
navegación abajo de todo. **Se dejó afuera a propósito**, y el motivo es de
alcance, no de tiempo:

**Cambia cómo se navega toda la aplicación, no cómo se ve una tarjeta.** La
tarjeta es una pieza del kit que hoy usa una sola pantalla. Una barra inferior
es un elemento del layout: aparece en las 28 pantallas, decide qué secciones son
las principales, convive con el menú lateral que ya existe, y se lleva un pedazo
del alto útil en todas.

Meterla en la misma tanda habría mezclado dos cosas que se verifican distinto: la
tarjeta se comprueba con la sonda sobre una pantalla, y la barra se comprueba
abriendo todas.

## Lo que hay que decidir antes de escribir una línea

Ninguna de estas es una pregunta técnica:

- **Qué secciones van.** Una barra inferior tiene lugar para cuatro o cinco
  destinos. El ERP tiene bastante más.
- **Qué pasa con el menú lateral.** ¿Conviven, o la barra lo reemplaza en
  pantallas angostas? Si conviven, hay dos formas de llegar al mismo lado y
  ninguna es obviamente la principal.
- **Qué se ve según el permiso.** El menú actual se arma por permisos. Una barra
  con cuatro lugares fijos tiene que decidir qué muestra cuando el usuario no
  tiene acceso a uno de ellos: esconderlo y dejar tres, o mostrarlo y contestar
  que no.
- **El alto que se lleva.** Medido en esta tanda: a 390 px entran hoy 2 tarjetas
  enteras. Una barra de unos 56 px no cambia ese número, pero sí se come el
  respiro que queda abajo, y eso hay que verlo con la lista real y no calculado.

## Lo que ya está medido y sirve para cuando se haga

- Ancho de referencia: **390 px**, que es el que usa la sonda.
- Alto útil de la ventana con el encabezado pegajoso: **743 px** de 844.
- Alto de una tarjeta con la fila de acciones: **247,9 px**, hueco de 9 px.
- El corte entre tarjetas y tabla es `md` (768 px), y no es un número elegido:
  es el que el repo ya usa en reportes de ventas y en transferencias.

## Cómo se verifica cuando entre

No alcanza con la sonda de la tarjeta: la barra vive en el layout, así que hay
que abrir varias pantallas. Lo mínimo sería comprobar que no tape contenido en
las que tienen su propio pie —el catálogo tiene el paginador abajo— y que la
huella a 1366 siga en cero, porque a ese ancho la barra no debería existir.
