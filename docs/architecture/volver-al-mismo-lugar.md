# Volver al mismo lugar

**Estado:** verificado en código · **Relevado:** 2026-09-15

Entrar a un detalle desde una lista y volver al lugar exacto del que se salió es
un problema que el repo resuelve **cuatro veces, con cuatro mecanismos
distintos**. Este documento existe para que el próximo que lo necesite lea antes
de escribir el quinto.

No están unificados a propósito: la decisión del 2026-09-15 fue arreglar
Transferencias sin tocar los otros tres, porque cada uno tiene una restricción
que lo ata a su módulo y unificarlos es una tanda entera con tres pantallas en
riesgo. Lo que sí se hizo es dejarlos nombrados.

## Las cuatro resoluciones

### 1 · `lib/reportes-ventas/returnParams.js` — query params validados

**Qué hace.** Serializa el contexto del listado de ventas —pestaña, rango de
fechas, local, forma de pago, página— en la query del link "Ver venta", y lo lee
de vuelta para reconstruir "Volver a ventas". Todo pasa por una whitelist: lo
que no reconoce, lo descarta.

**Lo que hace bien y conviene copiar.** No acepta una ruta de vuelta. Nada de
`returnTo`: viajan datos, y la ruta se DERIVA de una base cableada en el módulo.
Una URL pegada a mano no puede elegir a dónde vuelve el botón.

**Por qué no sirve tal cual para otro módulo.** La whitelist de claves y la base
`/modulos/reportes-ventas` están adentro del archivo, y no son parámetros. Para
usarlo en Transferencias habría que agregarle `unidad`, `desp` y `local` a la
whitelist de Ventas y volver la base un argumento, con los candados de Ventas
como red. Es la generalización que hoy no está hecha.

### 2 · `lib/productos/estadoDeRetorno.js` — `sessionStorage` versionado + ancla en el DOM

**Qué hace.** Guarda en `sessionStorage`, con un número de versión y
vencimiento, cuál era el ELEMENTO que se estaba mirando —`producto:12`,
`combo:12`, con el tipo adelante porque las dos numeraciones se pisan— y lo
restaura buscando su ancla en el DOM al volver.

**Lo que resuelve y los otros tres no.** El elemento, no el contexto. Y por un
motivo medido: entre que se sale y se vuelve, el listado se pide de nuevo; si el
nombre cambió y el orden es por nombre, la fila se movió, y restaurar el mismo
`scrollTop` deja a la persona mirando otro producto. Por eso manda el elemento.

**Por qué no sirve tal cual.** Va por otro canal —`sessionStorage`, no la URL—,
así que no arregla el back del navegador ni hace compartible el enlace. Resuelve
una pregunta distinta y complementaria: **dónde estaba el scroll**, no **en qué
período/filtro estaba parada la pantalla**.

### 3 · `leerContextoRetorno` en `app/modulos/transferencias/page.jsx` — del reporte de escritorio

**Qué hace.** El reporte de escritorio de Transferencias guarda su contexto en
`sessionStorage` y lo hidrata al montarse, con el criterio escrito al lado:

> "Mismo criterio que Ventas: sessionStorage, sin escribir la URL (evita loops
> estado↔URL)."

**Por qué no se tocó.** Esa decisión es correcta para lo que es: 650 líneas de
estado compartido donde escribir la URL en cada cambio sí puede entrar en loops.
Y funciona hoy.

**Y por qué esto obligó a mudar el tablero.** El tablero móvil vivía en ESE
archivo, bajo un `lg:hidden`. Necesitaba exactamente lo contrario —contexto en la
URL— así que se mudó a `/modulos/transferencias/cuenta` (ver abajo). Con ruta
propia no hay que elegir: el reporte se queda con su `sessionStorage` y el
tablero usa la URL.

### 4 · `lib/transferencias/contextoDelTablero.js` — query params derivados (2026-09-15)

**Qué hace.** Pone `unidad`, `desp` y `local` del tablero móvil en la URL, con la
misma forma que (1): whitelist, nada de `returnTo`, ruta derivada. La URL es la
fuente y el estado de React es un espejo, así que el back del navegador funciona
solo y un enlace a un período concreto se puede compartir.

**Dos decisiones propias que conviene conocer antes de copiarlo.** Los defaults
NO se escriben —`?unidad=SEMANA&desp=-1` dice lo mismo que la URL pelada y se
vería como si alguien hubiera navegado—, y por eso hace falta una MARCA (`tab=1`)
que distinga "vine del tablero en el período por defecto" de "vine de la tabla de
escritorio", que tiene su propio retorno y no hay que pisarle.

## Cómo elegir, si aparece un quinto caso

- ¿Hace falta que el back del navegador funcione, o que el enlace se pueda
  compartir? → la URL: (1) o (4).
- ¿Lo que hay que restaurar es el ELEMENTO dentro de una lista que se repide? →
  (2), el ancla en el DOM. El `scrollTop` solo no alcanza.
- ¿Es una pantalla con mucho estado compartido donde escribir la URL en cada
  cambio puede entrar en loops? → (3).

Y antes de escribir el sexto: las cuatro tienen la misma función `reader`/`leer`
copiada —lee de `URLSearchParams`, de un objeto plano o de un `Map`—. Ese es el
primer candidato obvio a unificar el día que se decida unificar.

## Lo que NO está resuelto: el scroll de Transferencias

Medido el 2026-09-15 y anotado a propósito, no arreglado:

- **Las tarjetas de transferencia no tienen `data-ancla`.** Sin ancla, al volver
  no hay forma de encontrar la tarjeta de la que se salió: ni para llevar el
  scroll ni para marcarla. Es el punto 2 exacto del diagnóstico de Productos,
  repetido en otro módulo.
- **Productos ya tiene resuelto el patrón**, y es el del ELEMENTO en vez del
  `scrollTop` — ver (2) arriba. Cuando se haga, se reusa ese, no se escribe otro.

Con el contexto en la URL, volver ya cae en el período y el local correctos; lo
que falta es la posición dentro de la lista. Es menos grave y quedó pendiente.
