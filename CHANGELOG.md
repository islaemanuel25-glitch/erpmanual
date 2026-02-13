# Changelog

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
