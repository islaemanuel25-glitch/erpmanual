# Unidades: quién hace su propia cuenta

Relevado el 2026-11-10 sobre `8abd3d51`. **Verificado en código.**

## La regla

La ficha del producto manda: cómo se compra, cómo se maneja en el depósito y
cómo se vende, con su factor y su peso. Lo único que no se sabe de antemano es
en qué unidad factura o cotiza cada proveedor. Eso se resuelve probando las
lecturas posibles contra el costo de hoy y quedándose con la de menor %, y se
pregunta solo si ninguna gana clara.

La pieza es `lib/unidades/reglaDeUnidades.js`. Reexporta los conversores de
stock de `lib/conversiones/stock.js` y la regla del menor %
(`lecturaDeMenorDiferencia`, que vive en `unidadPorPrecio.js`). El tercer nivel
de empaque (cartón, atado, suelto) ya está en `toUnidades` y `fromUnidades`
con `sueltosPorUnidad`.

## Cómo se enumeró

Primero, `git grep --untracked -lE` de aritmética (`*` o `/`) junto a
`factor_pack`, `factorPack`, `factor`, `pesoReferenciaKg`, `pesoPromedioKg`,
`pesoPorPiezaKg`, `sueltos_por_unidad`, `unidadesPorBulto` o `unidadesPorPack`.
Se buscó sobre `*.js`, `*.jsx` y `*.mjs`, sin tests, sin `scripts/`, sin
`prisma/` y sin arneses. Dio 59 archivos.

Después se leyó cada línea sin comentarios, y se descartaron la pieza misma,
las pantallas que solo muestran el factor ("Caja de 24") y los falsos
positivos (`achicarFoto`).

**El patrón no ve una cuenta escrita en varias líneas ni una con otro nombre
de variable.** Es un piso, no un techo.

Quedaron **23 cuentas propias en 16 archivos**.

## Pasadas a la pieza en la tanda 17 (15 cuentas, 8 archivos)

- Recepción: `estadoDeLineaFacturada.js`, en "Cuánto entró" y lo contado en la
  escala.
- Recepción: `cierreDeRecepcion.js`, en partir en bultos y en completar
  bultos.
- Recepción: `propuestaIa.js` y `razonarRenglones.js`, el costo de una unidad
  del bulto.
- Compras: `app/api/compras-proveedor/productos/route.js`, el stock, el mínimo
  y el máximo en bultos.
- Pedidos entre ubicaciones: `PrepararPedidoCelular.jsx`, bultos y sueltas y la
  vuelta a unidades.
- Venta y stock: `buscar-producto/route.js` y `preciosDeStock.js`, el precio de
  una pieza de fiambre desde el kilo.

Las piezas nuevas son dos:

- `bultosYSueltas` parte con piso. Lo distingue de `fromUnidades`, que trunca
  los negativos.
- `precioDeLaPieza` calcula la pieza desde el kilo.

Las cuentas pasadas dan los mismos números que antes. El candado está en
`lib/unidades/piezaUnicaCasosReales.test.mjs`.

## Las que quedan (8 cuentas, 8 archivos)

- Transferencias: `app/api/transferencias/confirmar-recepcion/route.js:446`
  (factor por sueltos).
- Transferencias: `lib/transferencias/costoTransferencia.js:617` (costo físico
  por factor del envío).
- Transferencias: `components/transferencias/FichaProductoRecepcion.jsx:297`.
- Ventas internas: `lib/ventas-internas/mapearVentaATransferencia.js:341`.
- Compras, pantalla nueva: `app/modulos/compras-proveedor/nueva/page.jsx:1987`
  (costo bulto/unidad). Las líneas 2250 y 2361 son packs por factor en el
  texto.
- Stock: `components/stock_locales/TablaStock.jsx:148` (piezas por peso en kg).
- Precios: `lib/precios/avisoCambioDeEscala.js:249`.
- Listas: `lib/proveedores/listas/explicarLectura.js:116`.

**Listas no elige todavía con el menor %.** La lectura de una lista la elige el
rango de aumento del proveedor (`configuraciones/generico.js`,
`aplicacion.js`). Pasarla al menor % cambia qué lectura se aplica y qué costo
se escribe. Es la tanda que sigue en listas, con DR LEMON 473 (ficha por pack
de 24, DYSSA por pack de 6) como candado.
