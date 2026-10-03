## Última actualización del Proyecto Claude

**Fecha:** 2026-10-03 21:39

## Módulos modificados recientemente

### pos-ventas
- feat: POS sin conexión real, con sincronización automática y cierre protegido, feat: revisión y descarte de cobros offline que no pudieron ser venta, fix: el cobro offline rechaza textos que la base no guarda y ids con coerción
- Archivos: 20 nuevos, 11 modificados (31 total)

### transferencias
- feat: modelo CobroOffline y su migración aditiva
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- app/modulos/pos-ventas/helpers/offlineQueue.test.mjs
- app/modulos/pos-ventas/helpers/useSincronizacionOffline.js
- lib/pos-ventas/cobroOfflineServidor.js
- lib/pos-ventas/sincronizacionOffline.js
- lib/pos-ventas/sincronizacionOffline.test.mjs
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
