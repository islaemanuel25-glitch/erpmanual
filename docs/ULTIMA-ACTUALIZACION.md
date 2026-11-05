## Última actualización del Proyecto Claude

**Fecha:** 2026-11-05 23:25

## Módulos modificados recientemente

### proveedores
- fix: la lista de precios ve lo que la recepción ya vinculó por nombre, y «Tus productos» muestra solo lo que la lista trae — SIN VERIFICAR en pantalla, feat: regla única de unidades, tanda 5 — aplicar, confirmar la presentación y Arcor usan la pieza
- Archivos: 6 modificados (6 total)

### transferencias
- fix: la lista de precios ve lo que la recepción ya vinculó por nombre, y «Tus productos» muestra solo lo que la lista trae — SIN VERIFICAR en pantalla
- Archivos: 1 modificados (1 total)

### productos
- refactor: combos, stock valorizado y cantidad en pedido cuentan con la pieza única (regla de unidades, tanda 15)
- Archivos: 1 nuevos (1 total)

### pos-ventas
- refactor: el buscador y la corrección del POS cuentan con la pieza única (regla de unidades, tanda 14), refactor: pedidos y pos-transferencias cuentan con la pieza única (regla de unidades, tanda 9), refactor: el POS de venta divide con la pieza única (regla de unidades, tanda 8)
- Archivos: 3 nuevos, 7 modificados (10 total)

### pos-transferencias
- fix: preparados lee el bulto con la pieza única; el maní 1881 deja de partirse (regla de unidades, tanda 10), refactor: pedidos y pos-transferencias cuentan con la pieza única (regla de unidades, tanda 9), fix: stock lee el peso fijo con la pieza única (regla de unidades, tanda 7)
- Archivos: 3 nuevos, 8 modificados (11 total)

### stock
- feat: regla única de unidades, tanda 6 — stock divide con la pieza y el conversor de cantidades entra a ella
- Archivos: 2 modificados (2 total)


## Archivos nuevos desde última sincronización
- app/api/productos/export/exportConLaPieza.test.mjs
- app/api/pos-ventas/buscar-producto/buscarProductoConLaPieza.test.mjs
- lib/pos-ventas/correccionCompletaServerConLaPieza.test.mjs
- lib/pos-ventas/motorCorreccionConLaPieza.test.mjs
- components/pos-transferencias/nueva/PreparadosTable.conLaPieza.test.mjs
- components/pos-transferencias/nueva/TablaSugeridos.conLaPieza.test.mjs
- components/pos-transferencias/nueva/ejercerTabla.mjs

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
