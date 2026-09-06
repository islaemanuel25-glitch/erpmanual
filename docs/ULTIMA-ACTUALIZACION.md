## Última actualización del Proyecto Claude

**Fecha:** 2026-09-06 20:39

## Módulos modificados recientemente

### pos-ventas
- test: los fixtures traen comisionPendiente, que es lo que trae una venta real, fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos, fix(auditoria): un backtick adentro de la plantilla SQL la cerraba
- Archivos: 10 nuevos, 28 modificados (38 total)

### dashboard
- fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos
- Archivos: 1 modificados (1 total)

### reportes-ventas
- fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos, feat(pos): la comision sin configurar deja de ser un 7 inventado
- Archivos: 4 modificados (4 total)

### configuracion
- fix(cobros): los cuatro medios por defecto vuelven a abrirse desde la lista, feat(shell): la pantalla activa puede registrar una accion al lado del titulo, fix(cobros): el boton de volver va arriba a la derecha, como en el resto del ERP
- Archivos: 6 nuevos, 4 modificados (10 total)

### productos
- test(alertas): mandar la ficha entera, y que la ruta diga que salio mal
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- lib/pos-ventas/comisionPendiente.test.mjs
- lib/pos-ventas/comisionPendiente.js
- lib/pos-ventas/mediosCobroPantalla.test.mjs
- lib/auditoria-pos-ventas/margenConComisionPendiente.test.mjs
- lib/pos-ventas/mediosCobro.js
- lib/pos-ventas/mediosCobro.test.mjs
- lib/pos-ventas/mediosCobroPantalla.js
- lib/pos-ventas/sinRespaldoDeComision.test.mjs
- lib/pos-ventas/ventaConComisionPendiente.test.mjs
- lib/pos-ventas/mediosCobroServidor.js
- app/modulos/configuracion/pos-ventas/cobros/[clave]/page.jsx
- app/modulos/configuracion/pos-ventas/cobros/page.jsx
- app/modulos/configuracion/pos-ventas/pantallasSeCargan.test.mjs
- app/modulos/configuracion/pos-ventas/integraciones/page.jsx
- app/modulos/configuracion/pos-ventas/cobros/nuevo/page.jsx
- app/modulos/configuracion/pos-ventas/reglas/page.jsx

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
