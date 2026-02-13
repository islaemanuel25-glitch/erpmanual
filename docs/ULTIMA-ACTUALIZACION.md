## Última actualización del Proyecto Claude

**Fecha:** 2026-02-13 08:32

## Módulos modificados recientemente

### pos-ventas
- fix: corregir key y campo precio en ProductosFavoritos, fix: convertir BigInt a Number en API favoritos para evitar error de serialización, feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- Archivos: 22 nuevos (22 total)

### configuracion
- optimizar UI POS Ventas, eliminar duplicaciones
- Archivos: 1 modificados (1 total)

### locales
- Agregar selector de local para admin padre en POS Ventas
- Archivos: 1 nuevos (1 total)

### productos
- Permitir editar porcentaje y precio directo en actualizacion de precios, Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 6 modificados (6 total)

### stock
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Mejorar responsive mobile: grids adaptativos y overflow-x en tablas, Estandarizar labels de inputs/selects a text-[11px] text-slate-400 mb-1 block
- Archivos: 3 modificados (3 total)

### transferencias
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Mejorar responsive mobile: grids adaptativos y overflow-x en tablas, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 8 modificados (8 total)

### grupos
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 1 modificados (1 total)

### pos-transferencias
- Reemplazar todos los SunmiSelect por SunmiSelectAdv en 11 archivos, Eliminar colores hardcodeados y respetar sistema de themes Sunmi
- Archivos: 5 modificados (5 total)


## Archivos nuevos desde última sincronización
- components/pos-ventas/ProductosFavoritos.jsx
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
- app/api/pos-ventas/buscar-producto/route.js
- app/api/locales/opciones/route.js

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
