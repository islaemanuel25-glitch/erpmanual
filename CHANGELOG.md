# Changelog

## [2026-07-29] - Actualización: reportes-ventas

### Modificado
- **reportes-ventas**: feat(reportes): mostrar modo y consumo físico de venta
- **reportes-ventas**: fix(reportes): ampliar y reorganizar detalle de venta
- **reportes-ventas**: fix(reportes): usar el mismo ancho útil que POS Ventas
- **reportes-ventas**: feat(reportes): rediseñar visualmente el listado de ventas
- **reportes-ventas**: feat(reportes): advertir cambios sin guardar en la corrección
- **reportes-ventas**: refactor(reportes): eliminar flujo modal de ventas

## [2026-07-29] - Actualización: pos-transferencias, pos-ventas, productos, stock, configuracion, transferencias, usuarios, categorias, proveedores, roles, grupos, locales

### Modificado
- **pos-transferencias**: feat(productos): codigo de barras propio por ubicacion
- **pos-transferencias**: feat(pos): agregar servicios de importe variable
- **pos-transferencias**: feat(operario): operario obligatorio configurable por local
- **pos-transferencias**: fix(security): cerrar fugas operativas entre ubicaciones
- **pos-transferencias**: fix(operadores): eximir dueño local con alcance seguro
- **pos-transferencias**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **pos-ventas**: feat(productos): codigo de barras propio por ubicacion
- **pos-ventas**: fix(pos): enviar importe de servicios variables al cobrar
- **pos-ventas**: fix(pos): reconstruir consumo legacy y mejorar editor de corrección
- **pos-ventas**: feat(pos): corrección de ventas completa con beta controlada
- **pos-ventas**: fix(pos): usar día de Argentina en historial y estadísticas
- **pos-ventas**: style(pos): mejorar iconos de medios de pago
- **pos-ventas**: style(pos): agregar iconos a medios de pago
- **pos-ventas**: fix(pos): robustecer division de pagos en dispositivos moviles
- **pos-ventas**: fix(pos): simplificar division de pagos
- **pos-ventas**: feat(pos): simplificar flujo de cobro
- **pos-ventas**: feat(pos): agregar servicios de importe variable
- **pos-ventas**: feat(pos): agregar pagos múltiples por venta
- **pos-ventas**: fix(pos): aislar "vender sin stock" por local en el buscador
- **pos-ventas**: feat(operario): operario obligatorio configurable por local
- **pos-ventas**: fix(security): cerrar fugas operativas entre ubicaciones
- **pos-ventas**: fix(operadores): eximir dueño local con alcance seguro
- **pos-ventas**: feat(config): agregar configuracion persistente por local
- **pos-ventas**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **productos**: feat(productos): codigo de barras propio por ubicacion
- **productos**: fix(productos): permitir editar la ficha al local propietario
- **productos**: feat(pos): agregar servicios de importe variable
- **productos**: fix(productos): aislar el precio de costo según origen y propietario
- **productos**: fix(security): cerrar fugas operativas entre ubicaciones
- **productos**: fix(security): completar aislamiento y permisos por local
- **productos**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **stock**: feat(productos): codigo de barras propio por ubicacion
- **stock**: fix(security): cerrar fugas operativas entre ubicaciones
- **configuracion**: feat(operario): operario obligatorio configurable por local
- **configuracion**: fix(configuracion): habilitar acceso a config del local por permiso, no por esAdmin
- **configuracion**: feat(ui): adaptar menu y pantallas a roles locales
- **transferencias**: fix(security): cerrar fugas operativas entre ubicaciones
- **transferencias**: fix(scope): exigir contexto operativo y vista global explícita
- **usuarios**: feat(ui): adaptar menu y pantallas a roles locales
- **usuarios**: feat(users): permitir gestion y costos por local
- **usuarios**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **categorias**: fix(security): completar aislamiento y permisos por local
- **categorias**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **proveedores**: fix(security): completar aislamiento y permisos por local
- **proveedores**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **roles**: feat(rbac): registrar roles y permisos de sistema
- **roles**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **grupos**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **locales**: fix(security): endurecer permisos y aislamiento entre grupos y locales


## [2026-07-26] - Actualización: categorias, grupos, locales, pos-ventas, proveedores, roles, usuarios, pos-transferencias, productos, stock, transferencias

### Modificado
- **categorias**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **grupos**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **locales**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-ventas**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-ventas**: feat(combos): módulo de combos exclusivos por local
- **proveedores**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **roles**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **usuarios**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-transferencias**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-transferencias**: feat(combos): módulo de combos exclusivos por local
- **productos**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **productos**: feat(combos): permitir activar y desactivar combos por local
- **productos**: feat(combos): módulo de combos exclusivos por local
- **stock**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **stock**: feat(combos): módulo de combos exclusivos por local
- **transferencias**: feat(combos): módulo de combos exclusivos por local


## [2026-07-25] - Actualización: pos-transferencias, pos-ventas, productos, stock, transferencias

### Modificado
- **pos-transferencias**: feat(combos): módulo de combos exclusivos por local
- **pos-ventas**: feat(combos): módulo de combos exclusivos por local
- **productos**: feat(combos): módulo de combos exclusivos por local
- **stock**: feat(combos): módulo de combos exclusivos por local
- **transferencias**: feat(combos): módulo de combos exclusivos por local


## [2026-07-24] - Actualización: auditoria, pos-transferencias, productos, proveedores, stock, pos-ventas

### Modificado
- **auditoria**: feat(auditoria): bitácora de auditoría central por interceptor de Prisma
- **pos-transferencias**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **pos-transferencias**: feat(pos): exigir operario activo para operar el POS
- **productos**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **proveedores**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **stock**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **pos-ventas**: feat(pos): revalidar operario y pedir PIN en modal sin perder la pantalla
- **pos-ventas**: feat(pos): exigir operario activo para operar el POS


## [2026-07-23] - Actualización: pos-transferencias, pos-ventas

### Modificado
- **pos-transferencias**: feat(pos): exigir operario activo para operar el POS
- **pos-ventas**: feat(pos): exigir operario activo para operar el POS


## [2026-06-16] - Actualización: stock, productos

### Modificado
- **stock**: perf: paginar stock deposito en base de datos
- **stock**: perf: paginar stock locales en base de datos
- **stock**: perf: filtrar estados de stock locales en base de datos
- **stock**: refactor: ordenar stock locales sin cambiar comportamiento
- **productos**: fix: asegurar productos del deposito al crear producto


## [2026-06-15] - Actualización: stock

### Modificado
- **stock**: perf: paginar stock locales en base de datos
- **stock**: perf: filtrar estados de stock locales en base de datos
- **stock**: refactor: ordenar stock locales sin cambiar comportamiento


## [2026-06-11] - Actualización: 

### Modificado


## [2026-06-10] - Actualización: productos, pos-ventas

### Modificado
- **productos**: feat: productos — go-to-page, sticky header and optional internal code column
- **pos-ventas**: fix: derive unit price by unidad_medida, not modo_envio, in depot POS
- **pos-ventas**: feat: compact mobile cart with scrollable chips row in depot POS
- **pos-ventas**: feat: show depot stock breakdown (packs + units) in POS search and cart

## [2026-02-13] - Sistema de Auto-documentación

### Agregado
- scripts/update-docs.js — Script de auto-documentación que analiza git log y actualiza docs
- docs/modulos/pos-ventas.md — Documentación del módulo POS Ventas
- docs/ULTIMA-ACTUALIZACION.md — Registro de última actualización del proyecto

## [2026-02-13] - Módulo POS Ventas

### Agregado
- Módulo POS Ventas completo (MVP)
- Búsqueda de productos por código/nombre
- Carrito de venta con edición de cantidades
- Formas de pago: Efectivo, MercadoPago, Débito, Crédito
- Cálculo automático de comisiones (7%)
- Descuento de stock en tiempo real
- Selector de local para admin padre
- API /api/pos-ventas/crear
- API /api/pos-ventas/buscar-producto
- Componentes: BuscadorProductos, CarritoVenta, FormaPago

### Pendiente (Fase 2)
- Búsqueda por voz
- Impresión de tickets (térmico + PDF)
- Turnos y arqueo de caja
- Historial de ventas

## [2025-02-13] - Estandarizacion UI Sunmi

### Agregado
- docs/INCONSISTENCIAS-SUNMI.md - Auditoria completa de 71 problemas
- docs/05-GUIA-ESTILOS-UI.md - Guia oficial de estilos
- SunmiToast para feedback (reemplaza alert)
- color='slate' en SunmiButton

### Modificado
- 13 `<select>` nativos reemplazados por SunmiSelect
- 19 `<input>` nativos reemplazados por SunmiInput
- 40+ archivos: colores hardcodeados migrados al sistema de themes
- Props invalidos eliminados (variant, size, color en separator)
- Labels estandarizados: `text-[11px] text-slate-400 mb-1 block`
- Responsive mejorado en stock y POS transferencias

### Corregido
- `titulo` por `title` en SunmiCardHeader
- `mensaje` por `message` en SunmiTableEmpty
- `border-slate-700` por `border-slate-800` en todo el proyecto
- `text-slate-100` hardcodeado eliminado (heredado del theme)
- `overflow-auto` por `overflow-x-auto` en wrappers de tablas
