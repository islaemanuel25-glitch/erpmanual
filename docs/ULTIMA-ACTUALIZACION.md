## Última actualización del Proyecto Claude

**Fecha:** 2026-10-10 00:25

## Módulos modificados recientemente

### compras-proveedor
- fix: recibir un pedido ya no saltea el renglón con 0 bultos + sueltas, el ingreso deducido suma las sueltas, y `totalFactura` y `cuantoSeValoriza` las valorizan
- Sin migración.

### transferencias
- fix: la lista y el reporte por destino piden `recibidoUnidadesSueltas`, así que lo recibido suma las sueltas y no hay faltantes falsos
- Sin migración.

## Archivos nuevos desde última sincronización
- lib/compras-proveedor/sueltasEnLaValorizacion.test.mjs

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado por scripts/update-docs.js y corregido a mano: el script le cargó
todo a transferencias y le sumó commits anteriores que no son de esta tanda.*
