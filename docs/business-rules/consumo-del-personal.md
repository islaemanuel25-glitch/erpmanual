# Consumo del personal

Desde 2026-10-15. Regla de Emanuel: el personal se lleva bebida, pan, fiambre,
cosas para comer. No se cobra, sale del stock y es un gasto del negocio.

## Qué es y qué no

- Se registra desde "Pagar" del POS, sexta opción, después de "Retiro del
  dueño" (hoja en el teléfono, diálogo en escritorio). Tiene su propia lista de
  productos —buscar o escanear con `BuscadorProductos`, cantidad, quitar—,
  separada del carrito de la venta, que no se toca. Quien consume se elige
  entre los EMPLEADOS activos del local ([empleados.md](empleados.md)) [CÓDIGO]
  (`components/pos-ventas/PanelConsumoPersonal.jsx`,
  `app/api/pos-ventas/consumo-personal/route.js`, permiso `pos.usar`).
- Hasta la tarde del 2026-10-15 estuvo en el panel de cobro, al lado de
  "Fiado", con F7. Se sacó a pedido de Emanuel: ahí se podía tocar por error
  en cada venta [CÓDIGO: `lib/pos-ventas/consumoPersonal.test.mjs` exige que
  no vuelva].
- Sale del stock con LAS MISMAS funciones que la venta:
  `cargarMapasDeProductos` → `construirLineasComerciales` →
  `aplicarConsumoStock`, así que la escala, el bulto, el kilo y los combos
  descuentan igual. Respeta "vender sin stock" del local [CÓDIGO]
  (`lib/pos-ventas/consumoPersonalServer.js`) [VERIFICADO:
  `scripts/pruebas-db/consumoPersonal.mjs`, sección 1 y 6].
- Cada egreso queda en el Libro de Stock con origen `CONSUMO_PERSONAL` y el id
  del consumo; en "Por qué cambió" cae en "Otros", no en Ventas [CÓDIGO].
- NO es una Venta: no suma a vendido, tickets, ganancia de las ventas ni
  Reportes → Ventas. NO crea movimiento de caja: el efectivo esperado, el
  cierre y Tesorería no lo ven [VERIFICADO: sección 2; contraprueba CP-1].
- Un servicio de importe variable no se puede consumir: no sale del stock.

## El gasto

- Un Gasto de la categoría "Consumo del personal" (la crea la migración
  `20261015140949_consumo_personal_y_archivo_de_gasto`), por el COSTO de las
  líneas —la suma de `costoLinea`, nunca el precio de venta—, con el detalle de
  productos en el concepto y la persona como beneficiario, en la ubicación y
  vinculado a la caja por `ConsumoPersonal.turnoId` [VERIFICADO: sección 3;
  contraprueba CP-2].
- El costo de cada línea es el de la venta: el del carrito o, sin él, el del
  bulto entre su factor [CÓDIGO].
- No se paga: no salió plata. Nace saldado (`estadoDelGasto`,
  `SQL_GASTO_SALDADO`), no figura como pendiente y `registrarPagoGasto` lo
  rechaza. En Gastos se lee "No se paga" [VERIFICADO: sección 3].
- La categoría no se ofrece para cargar a mano (ni en Pagar ni en Nuevo gasto)
  y `crearGasto` no deja usarla fuera del consumo [CÓDIGO].
- Un consumo de costo cero no deja gasto: un Gasto de $0 no lo admite la base.

## Turnos y cierres

- Resultado del turno = neto después de comisiones − costo de la mercadería −
  sueldos y gastos − consumo del personal − faltantes de caja + sobrantes de
  caja [CÓDIGO] (`resultadoDelTurno`; las diferencias, desde 2026-10-17).
- "Sueldos y gastos" suma movimientos de caja; el consumo no tiene, así que no
  cuenta dos veces [VERIFICADO: sección 5].
- La tarjeta del turno muestra la fila "Consumo del personal" y, debajo, quién
  consumió, cuántos productos y cuánto al costo [CÓDIGO].

## La foto del gasto

- Un gasto puede tener la foto o el archivo del ticket, opcional
  (`GastoArchivo`). Misma subida que el remito: mismos límites, mismo almacén
  y mismo nombre saneado. No vence [CÓDIGO]
  (`lib/finanzas/archivoDeGastoServer.js`).
- La sube Finanzas con su permiso de Gastos, o el cajero con `pos.usar` solo
  sobre el gasto que registró él en su ubicación [VERIFICADO: sección 7].
