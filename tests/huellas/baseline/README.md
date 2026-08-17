# Línea de base de huellas de tablas

**Tomada el 2026-08-17** sobre el commit `44eeee6`, con el generador ya arreglado
(`59c0910`). Reemplaza a la del 2026-08-07, que quedó inservible; aquélla sigue en
el historial de git, en `ca87e17`, si alguna vez hace falta.

Sirve para responder una sola pregunta: *¿alguna pantalla con tabla se movió sin
que quisiéramos?* Se compara con:

    node scripts/generar-huellas.mjs --salida /tmp/despues \
      --usuario <mail> --clave <clave> --tema sunmiDark \
      --fecha-turnos 2026-08-17 --pedido 42
    node scripts/comparar-huellas.mjs tests/huellas/baseline /tmp/despues

## Cómo se tomó — los cinco datos que hay que repetir

Están también en `meta.json`, al lado, para que no haya que leer prosa:

- **Tema: `sunmiDark`.** Es obligatorio pasarlo. La línea de base anterior quedó
  tomada con `sunmiGraphite` sin que nadie lo eligiera —salía del perfil de Edge,
  que se reusa entre corridas— y por eso las 16 huellas viejas informan
  `thFondo: rgb(22, 27, 34)` mientras cualquier corrida con otro tema da otra cosa.
  Comprobado: la misma pantalla con `--tema sunmiGraphite` reproduce exactamente
  ese valor.
- **Base `erpazul_dev`**, servidor en el 3111, contexto en el grupo del depósito y
  ubicación `depo`. Con otro local cambian los conteos por las reglas de
  visibilidad.
- **Ventana 1366x900.** El alto pesa tanto como el ancho: el contenedor de scroll
  usa `max-h-[70dvh]`, así que a 900 mide 630 px y a 800 mide 560.
- **Identificadores**: `--pedido 42`, `--fecha-turnos 2026-08-17`. Los dos son
  argumentos y no valores escritos adentro del generador, que es como estaban.
- **Commit del árbol**: `44eeee6`.

## Qué mide y qué no

Mide estructura en reposo: columnas, alineación, padding, fondo del encabezado,
alto de fila, opacidad, tipografía, ancho de tabla y overflow del contenedor.

**No mide** estados de interacción: el `:hover` y el tinte de una fila editada no
aparecen acá y hay que mirarlos a ojo.

## Las 15 pantallas que entraron

Todas con filas de datos reales. Ninguna guardada en estado vacío — el generador
ahora se pone rojo antes que guardar una tabla sin filas.

`01-categorias` 18 · `02-clientes` 5 · `04-clientes-analytics` 2 tablas ·
`07-listas-precios` 2 · `08-locales` 2 · `09-operadores` 1 · `10-productos` 25 ·
`11-proveedores` 10 · `12-reportes-stock` 1790 · `14-roles` 3 · `16-turnos` 1 ·
`18-usuarios` 4 · `19-productos-fila-seleccionada` 25 · `20-edicion-rapida` 25 ·
`24-stock-locales` 25.

**Dos corridas seguidas dieron las 15 idénticas**, sin una sola diferencia. Sin
ese control una línea de base no vale: no se puede distinguir un cambio del ruido.

## Las 4 que quedaron AFUERA, y por qué

No están adentro con una tabla vacía **a propósito**. Una huella del estado vacío
convierte "acá no hay nada" en la referencia, y después la pantalla que empieza a
mostrar datos aparece como regresión. Ya pasó con la línea de base anterior: cinco
de sus 16 hubo que recapturarlas por eso.

- **`05-compras-proveedor-detalle`** — dice "Todavía no hay comprobantes". Su única
  tabla es la de comprobantes: la de líneas era `TablaDetallePedido`, borrada el
  2026-08-17 por no dibujarse nunca. **Necesita un pedido con un comprobante
  subido**, no uno con líneas — el 42 tiene 24 líneas y no alcanza. Y subirlo no
  basta: hace falta que el lector lo interprete, o queda una tabla llena y una
  vacía. Está en el roadmap, con la cadena entera.
- **`06-compras-proveedor-ganancia`** — dice "Sin compras en el período". El
  período es estado del componente y no se puede fijar por URL, así que hace falta
  una compra recibida dentro del rango por defecto.
- **`22-listas-conciliacion`** y **`23-listas-armado-dudoso`** — no hay ninguna
  `<table>`: no existe ninguna importación de lista en `erpazul_dev`.
  `/api/proveedores/listas/<id>` da 404 para los ids 1 a 6. Necesitan una
  importación abierta.

Cuando alguna de esas cuatro se pueda llenar, se agrega con `--solo <nombre>` y se
saca de esta lista.

## Pantallas que nunca tuvieron huella

Cinco del relevamiento original no tienen `<table>` y no producen huella
comparable: `03-clientes-detalle`, `13-reportes-ventas`, `15-transferencias`,
`17-turnos-detalle` y `21-edicion-rapida-fila-editada`. Se revisan a ojo.

## Los datos de los que depende

Están anotados en `docs/roadmap/kit-sunmi-fases.md`, en "LOS DATOS DE
`erpazul_dev` QUE ESTÁN A PROPÓSITO": el turno 49 abierto, la venta 113 sin
cliente y la venta 114 con cliente. **Si alguien los borra, esta línea de base
deja de reproducirse** — `16-turnos` y `04-clientes-analytics` dependen
directamente de ellos.
