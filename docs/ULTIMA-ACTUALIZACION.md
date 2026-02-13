## Última actualización del Proyecto Claude

**Fecha:** 2026-02-13 04:24

## Módulos modificados recientemente

### pos-ventas
- fix: convertir BigInt a Number en API favoritos para evitar error de serialización, feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo, feat: agregar modelo Cliente y selector en POS Ventas
- Archivos: 22 nuevos (22 total)

### configuracion
- optimizar UI POS Ventas, eliminar duplicaciones, Fix props inválidas en componentes Sunmi: variant/size en SunmiButton, mensaje en SunmiTableEmpty
- Archivos: 2 modificados (2 total)

### locales
- Agregar selector de local para admin padre en POS Ventas, Remover color="amber" hardcodeado de componentes Sunmi (usar theme por defecto), Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 1 nuevos, 3 modificados (4 total)

### productos
- Permitir editar porcentaje y precio directo en actualizacion de precios, Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 6 modificados (6 total)

### stock
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Mejorar responsive mobile: grids adaptativos y overflow-x en tablas, Estandarizar labels de inputs/selects a text-[11px] text-slate-400 mb-1 block
- Archivos: 4 modificados (4 total)

### transferencias
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Mejorar responsive mobile: grids adaptativos y overflow-x en tablas, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 9 modificados (9 total)

### grupos
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi, Remover color="amber" hardcodeado de componentes Sunmi (usar theme por defecto)
- Archivos: 4 modificados (4 total)

### pos-transferencias
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi, Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 6 modificados (6 total)

### categorias
- Fix props inválidas en componentes Sunmi: variant/size en SunmiButton, mensaje en SunmiTableEmpty, Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 1 modificados (1 total)

### proveedores
- Fix props inválidas en componentes Sunmi: variant/size en SunmiButton, mensaje en SunmiTableEmpty, Remover color="amber" hardcodeado de componentes Sunmi (usar theme por defecto), Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 1 modificados (1 total)

### roles
- Remover color="amber" hardcodeado de componentes Sunmi (usar theme por defecto), Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 1 modificados (1 total)

### usuarios
- Remover color="amber" hardcodeado de componentes Sunmi (usar theme por defecto), Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 3 modificados (3 total)

### dashboard
- Corregir inconsistencias de componentes Sunmi en toda la app
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- app/api/pos-ventas/favoritos/route.js
- app/api/pos-ventas/crear/route.js
- app/api/pos-ventas/turnos/abrir/route.js
- app/api/pos-ventas/turnos/actual/route.js
- app/api/pos-ventas/turnos/cerrar/route.js
- app/api/pos-ventas/turnos/resumen/route.js
- app/modulos/pos-ventas/page.jsx
- components/pos-ventas/ModalAperturaTurno.jsx
- components/pos-ventas/ModalCierreTurno.jsx
- components/pos-ventas/CarritoVenta.jsx
- components/pos-ventas/ModalCliente.jsx
- app/api/pos-ventas/historial-dia/route.js
- app/api/pos-ventas/stats-dia/route.js
- components/pos-ventas/FormaPago.jsx
- components/pos-ventas/HistorialDia.jsx
- components/pos-ventas/ModalDescuento.jsx
- components/pos-ventas/StatsDelDia.jsx
- components/pos-ventas/BuscadorProductos.jsx
- components/pos-ventas/ModalPagoEfectivo.jsx
- components/pos-ventas/ModalTicket.jsx
- components/pos-ventas/ProductosFavoritos.jsx
- app/api/pos-ventas/buscar-producto/route.js
- app/api/locales/opciones/route.js

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
