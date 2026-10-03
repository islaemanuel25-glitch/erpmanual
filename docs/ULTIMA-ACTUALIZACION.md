## Última actualización del Proyecto Claude

**Fecha:** 2026-10-03 17:32

## Módulos modificados recientemente

### pos-ventas
- feat: revisión y descarte de cobros offline que no pudieron ser venta, fix: el cobro offline rechaza textos que la base no guarda y ids con coerción, fix: el registro offline espera a crear y rechaza lo que la columna no guarda
- Archivos: 16 nuevos, 5 modificados (21 total)

### transferencias
- feat: modelo CobroOffline y su migración aditiva
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- app/api/pos-ventas/cobros-offline/[id]/descartar/route.js
- app/api/pos-ventas/cobros-offline/[id]/route.js
- app/api/pos-ventas/cobros-offline/route.js
- lib/pos-ventas/cobroOffline.js
- lib/pos-ventas/cobroOfflineServidor.js
- lib/pos-ventas/cobrosOfflineConsulta.js
- lib/pos-ventas/rechazoVenta.js
- lib/pos-ventas/rechazoVenta.test.mjs
- lib/pos-ventas/cobroOffline.test.mjs
- lib/pos-ventas/candadoDelLocal.js
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
