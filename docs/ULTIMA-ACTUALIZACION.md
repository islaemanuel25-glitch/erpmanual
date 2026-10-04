## Última actualización del Proyecto Claude

**Fecha:** 2026-10-03 23:36

## Módulos modificados recientemente

### pos-ventas
- fix: el cierre directo congela lo que de verdad quedó en el turno, refactor: el comentario del cobro descartado vuelve sobre su rama, fix: una venta no entra en una caja que ya tomó el corte (R2c)
- Archivos: 21 nuevos, 11 modificados (32 total)

### transferencias
- feat: modelo CobroOffline y su migración aditiva
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- lib/pos-ventas/ventaDentroDelCorte.test.mjs
- app/modulos/pos-ventas/helpers/offlineQueue.test.mjs
- app/modulos/pos-ventas/helpers/useSincronizacionOffline.js
- lib/pos-ventas/sincronizacionOffline.js
- lib/pos-ventas/sincronizacionOffline.test.mjs
- lib/pos-ventas/cobroOfflineServidor.js
- lib/pos-ventas/ticketOffline.js
- app/api/pos-ventas/cobros-offline/[id]/descartar/route.js
- app/api/pos-ventas/cobros-offline/[id]/route.js
- app/api/pos-ventas/cobros-offline/route.js
- lib/pos-ventas/cobroOffline.js
- lib/pos-ventas/cobrosOfflineConsulta.js
- lib/pos-ventas/rechazoVenta.js
- lib/pos-ventas/rechazoVenta.test.mjs
- lib/pos-ventas/cobroOffline.test.mjs
- lib/pos-ventas/candadoDelLocal.js
- app/api/pos-ventas/cobros-offline/registrar/route.js
- lib/pos-ventas/idempotenciaVenta.test.mjs
- lib/pos-ventas/intentoCobro.js
- lib/pos-ventas/intentoCobro.test.mjs
- lib/pos-ventas/idempotenciaVenta.js

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
