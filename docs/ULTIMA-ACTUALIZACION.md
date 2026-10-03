## Última actualización del Proyecto Claude

**Fecha:** 2026-10-03 14:39

## Módulos modificados recientemente

### pos-ventas
- fix: el registro offline espera a crear y rechaza lo que la columna no guarda, feat: registrar cobros offline y atarlos a su venta en crear, fix(pos): un mismo cobro conserva su clientTxnId, y la venta offline solo se da por guardada si quedó en la cola
- Archivos: 10 nuevos, 5 modificados (15 total)

### transferencias
- feat: modelo CobroOffline y su migración aditiva
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- lib/pos-ventas/candadoDelLocal.js
- lib/pos-ventas/cobroOffline.js
- lib/pos-ventas/cobroOffline.test.mjs
- lib/pos-ventas/cobroOfflineServidor.js
- app/api/pos-ventas/cobros-offline/registrar/route.js
- lib/pos-ventas/idempotenciaVenta.test.mjs
- lib/pos-ventas/intentoCobro.js
- app/modulos/pos-ventas/helpers/offlineQueue.test.mjs
- lib/pos-ventas/intentoCobro.test.mjs
- lib/pos-ventas/idempotenciaVenta.js

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
