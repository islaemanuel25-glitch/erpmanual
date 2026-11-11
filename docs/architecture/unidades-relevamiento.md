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

## Pasadas a la pieza en la tanda 18 (las 8 que quedaban)

**Verificado en código y con candado** (`lib/unidades/piezaUnicaTanda18.test.mjs`,
con contraprueba: se rompió la pieza a propósito y se puso en rojo). No queda
ninguna cuenta a mano de las 23 relevadas. Sigue valiendo que el patrón es un
piso: `lib/proveedores/identidad/servicioIdentidad.js` divide el factor del
ERP por el del proveedor y no estaba en la lista; se anota sin tocar.

Piezas nuevas en `reglaDeUnidades.js`:

- `kilosDeLasPiezas`, para la tabla de stock. Conserva el signo del stock.
- `factorDeCambioDeEscala`, el aviso de cambio de escala de precios, mudado tal
  cual. Recibe el predicado de pieza fija desde el aviso.
- Reexporta `unidadesDeStockPorEscalon` (transferencias y ventas internas),
  `ganadoraDeMenorDiferencia` y `cantidadPorPackDelPapel` (listas).

## Listas al menor % (tanda 18)

**Verificado en código y medido.** La lectura de una lista la elige ahora la
regla de la recepción: gana la de menor % contra el costo de hoy, para arriba o
para abajo, si gana clara (la única dentro de la variación de 10 %, o la
segunda le saca el triple). Si ninguna gana clara, se pregunta con las lecturas
como opciones. El pack que dice el renglón ("473MLX6X4" → 6) es una lectura
candidata más, como en la recepción.

El rango del proveedor ya no elige. Sirve para una sola cosa: el permiso de
aplicar sin que una persona mire. Si la ganadora cae fuera del rango, o no hay
rango cargado, la fila va a revisar mostrando la ganadora y su %. Es el mismo
control que ya hacía `aplicacion.js` al escribir. También siguen saliendo de él
la etiqueta "fuera de rango", el resumen de la lista y la auditoría de costos.

Medido en lectura contra producción el 2026-11-11, con el código anterior y el
nuevo, sobre las 2.057 filas de las 18 importaciones de los últimos 60 días. Se
usó el costo que cada producto tenía al subir la lista y no lo que una persona
ya había contestado. Cambian **5 filas**, todas de DYSSA (#28), que pasan de
"fuera de rango" a lista con × 4: FERNET CON COLA, tres DR LEMON y DR LEMON
TROPICAL GIN, todos 473MLX6X4. Son las mismas que Emanuel había resuelto a mano,
con el mismo costo. Con lo que ya se contestó, no cambia ninguna.

## Las 8 que quedaban (tanda 17, ya pasadas)

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

(Hasta la tanda 17 las listas elegían la lectura con el rango del proveedor.
Desde la 18 eligen con el menor %: ver arriba.)
