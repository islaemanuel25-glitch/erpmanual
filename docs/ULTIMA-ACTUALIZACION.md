## Última actualización del Proyecto Claude

**Fecha:** 2026-07-29 08:16

## Módulos modificados recientemente

### pos-transferencias
- feat(productos): codigo de barras propio por ubicacion, feat(pos): agregar servicios de importe variable, feat(operario): operario obligatorio configurable por local
- Archivos: 15 modificados (15 total)

### pos-ventas
- feat(productos): codigo de barras propio por ubicacion, fix(pos): enviar importe de servicios variables al cobrar, fix(pos): reconstruir consumo legacy y mejorar editor de corrección
- Archivos: 7 nuevos, 19 modificados (26 total)

### productos
- feat(productos): codigo de barras propio por ubicacion, fix(productos): permitir editar la ficha al local propietario, feat(pos): agregar servicios de importe variable
- Archivos: 15 modificados (15 total)

### stock
- feat(productos): codigo de barras propio por ubicacion, fix(security): cerrar fugas operativas entre ubicaciones
- Archivos: 3 modificados (3 total)

### configuracion
- feat(operario): operario obligatorio configurable por local, fix(configuracion): habilitar acceso a config del local por permiso, no por esAdmin, feat(ui): adaptar menu y pantallas a roles locales
- Archivos: 5 modificados (5 total)

### transferencias
- fix(security): cerrar fugas operativas entre ubicaciones, fix(scope): exigir contexto operativo y vista global explícita
- Archivos: 2 modificados (2 total)

### usuarios
- feat(ui): adaptar menu y pantallas a roles locales, feat(users): permitir gestion y costos por local, fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 5 modificados (5 total)

### categorias
- fix(security): completar aislamiento y permisos por local, fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 4 modificados (4 total)

### proveedores
- fix(security): completar aislamiento y permisos por local, fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 4 modificados (4 total)

### roles
- feat(rbac): registrar roles y permisos de sistema, fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 3 modificados (3 total)

### grupos
- fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 1 modificados (1 total)

### locales
- fix(security): endurecer permisos y aislamiento entre grupos y locales
- Archivos: 1 modificados (1 total)


## Archivos nuevos desde última sincronización
- app/api/pos-ventas/venta/[id]/corregir/route.js
- app/api/pos-ventas/venta/[id]/editar/route.js
- app/api/pos-ventas/venta/[id]/revisar/route.js
- app/api/pos-ventas/correcciones/[id]/route.js
- app/api/pos-ventas/corregir-simple/[id]/route.js
- components/pos-ventas/IconosMedios.jsx
- components/pos-ventas/ModalImporteServicio.jsx

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
