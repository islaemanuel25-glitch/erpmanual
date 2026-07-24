# Changelog

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
