# Módulo: POS Ventas

**Última actualización:** 2026-03-16 01:39
**Archivos principales:** `app/modulos/pos-ventas/page.jsx`, `components/pos-ventas/*`, `app/api/pos-ventas/*`

## Descripción
Punto de venta para ventas al mostrador. Permite buscar productos, armar un carrito de venta, seleccionar forma de pago con cálculo automático de comisiones, y registrar la venta descontando stock en tiempo real.

## Ubicación
- UI: `app/modulos/pos-ventas/page.jsx`
- APIs: `app/api/pos-ventas/crear/route.js`, `app/api/pos-ventas/buscar-producto/route.js`
- Componentes: `components/pos-ventas/BuscadorProductos.jsx`, `components/pos-ventas/CarritoVenta.jsx`, `components/pos-ventas/FormaPago.jsx`

## Funcionalidad principal
- Búsqueda de productos por código de barras o nombre
- Detección inteligente de escáner (velocidad de tipeo < 200ms + Enter)
- Carrito de venta con edición de cantidades y eliminación de items
- Formas de pago: Efectivo, MercadoPago, Débito, Crédito
- Cálculo automático de comisiones (7% para pagos con tarjeta/MP)
- Descuento de stock en tiempo real al confirmar venta
- Selector de local para admin padre (multi-local)
- Numeración automática de ventas por local

## Dependencias

### Usa
- Locales (localId del usuario o seleccionado)
- Productos (ProductoLocal para búsqueda y precios)
- Stock (StockLocal para validar disponibilidad y descontar)
- Usuarios (autenticación vía /api/me)

### Genera
- Ventas (registro de venta con items, forma de pago, comisiones)

## Cambios recientes
- 2026-03-11: docker
- 2026-03-11: pos3
- 2026-03-11: pos2
- 2026-03-11: docker
- 2026-03-11: pos3
- 2026-03-11: pos2
- 2026-03-07: print1
- 2026-03-07: imp1
- 2026-03-07: impresorafin1
- 2026-03-06: impresionfin
- 2026-03-06: print ok
- 2026-03-06: agrega impresion termica nativa con print-server y configuracion en ERP
- 2026-03-05: fix: sincronizar ProductoLocal del deposito al editar base
- 2026-03-05: Fix turnos resumen: separar FIADO de efectivo/digital/comisiones
- 2026-03-05: P1 Turnos: X/Z report + imprimir Z + resumen incluye fiado
- 2026-03-05: P0 Turnos: ventas requieren turno + módulo Turnos + permisos
- 2026-03-05: fix: sincronizar ProductoLocal del deposito al editar base
- 2026-03-05: fix: sincronizar ProductoLocal del deposito al editar base
- 2026-03-03: Stock negativo configurable + motivos obligatorios + auditoria + pedidos deposito + configuracion UI
- 2026-03-02: security(scope): validar ownership turnoId en resumen
- 2026-03-02: security(rbac): cerrar endpoints sin auth + admin guards + permiso pos.usar
- 2026-03-02: feat: mejoras POS + sidebar overflow fix + redondeo precios
- 2026-03-01: Refactor UI Sunmi + fixes stock/productos + mejoras UX
- 2026-03-01: refactor: normalización theme-safe completa — eliminar tokens Tailwind hardcoded
- 2026-02-17: feat(permisos): sidebar y paginas 100% por permisos
- 2026-02-17: fix(migrations): corregir migracion userId MovimientoCuenta
- 2026-02-17: feat(clientes): import PRO, export PDF, merge duplicados
- 2026-02-16: feat: sistema de puntos de fidelidad nivel 1
- 2026-02-16: feat: descuentoPorcentaje en clientes/tags + descuento automatico en POS
- 2026-02-16: feat: sistema de puntos de fidelidad nivel 1
- 2026-02-16: feat: descuentoPorcentaje en clientes/tags + descuento automatico en POS
- 2026-02-15: feat(pos): fullscreen cliente picker + allow selecting anytime
- 2026-02-15: feat(pos): add cliente selector dropdown in ModalCliente
- 2026-02-15: feat(pos): fullscreen cliente picker + allow selecting anytime
- 2026-02-15: feat(pos): add cliente selector dropdown in ModalCliente
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: refactor: limpiar layout POS - historial a modal, stats en header
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-13: fix: corregir sistema de comisiones - comision bancaria como costo interno
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: refactor: eliminar ProductosFavoritos y corregir keys en CarritoVenta
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: fix: corregir key y campo precio en ProductosFavoritos
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: fix: convertir BigInt a Number en API favoritos para evitar error de serialización
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: feat: POS Ventas Fase 4 - Sistema de turnos de caja con apertura, cierre y arqueo
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: feat: agregar modelo Cliente y selector en POS Ventas
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: feat: POS Ventas Fase 3 - descuentos, stats del dia, historial
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: fix: usar $queryRaw en API favoritos POS Ventas
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: feat: POS Ventas Fase 2 - voz, vuelto, impresion, favoritos, shortcuts
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: optimizar UI POS Ventas, eliminar duplicaciones
- 2026-02-13: responsive mobile POS Ventas
- 2026-02-12: Agregar selector de local para admin padre en POS Ventas
- 2026-02-12: Crear modulo POS Ventas (MVP Fase 1)
- 2026-02-13: Agregado selector de local para admin padre en POS Ventas
- 2026-02-13: Creación inicial del módulo POS Ventas (MVP Fase 1)

## APIs
### Endpoints
- **POST** `/api/pos-ventas/crear` - Registra una venta nueva. Recibe: localId, formaPago, items[], descuento?, comision?. Crea registro de Venta y descuenta StockLocal en una transacción.
- **GET** `/api/pos-ventas/buscar-producto?q=&localId=` - Busca productos por código de barras (exacto) o nombre (parcial). Retorna hasta 10 resultados con stock > 0.

### Consume
- `GET /api/me` - Obtener usuario autenticado
- `GET /api/locales/listar` - Listar locales disponibles

## Componentes
- **BuscadorProductos**: Búsqueda con soporte de escáner de código de barras, debounce 300ms, muestra nombre/código/precio/stock
- **CarritoVenta**: Tabla de productos agregados con edición de cantidad (respeta stock máximo), subtotales, eliminación individual y limpieza total
- **FormaPago**: Selector de 4 métodos de pago, cálculo dinámico de comisión (7%), botón COBRAR Y FINALIZAR

## Permisos requeridos
- Acceso al módulo POS Ventas
- Usuario autenticado con localId asignado (o admin padre para multi-local)

## Estado actual
- ✅ Implementado: Búsqueda de productos, carrito de venta, formas de pago, comisiones, descuento de stock, selector de local admin, API crear venta, API buscar producto
- ⏳ Pendiente: Búsqueda por voz, impresión de tickets (térmico + PDF), turnos y arqueo de caja, historial de ventas
- 🐛 Bugs conocidos: Ninguno reportado

## Próximos pasos
- [ ] Búsqueda por voz
- [ ] Impresión de tickets (térmico + PDF)
- [ ] Turnos y arqueo de caja
- [ ] Historial de ventas
- [ ] Devoluciones
- [ ] Descuentos por porcentaje o monto fijo

## Flujo

```
1. Usuario accede a POS Ventas
2. Si es admin padre → selecciona local
3. Busca producto por escáner o nombre
4. Selecciona producto → se agrega al carrito
5. Ajusta cantidades si es necesario
6. Selecciona forma de pago
7. Sistema calcula comisión automáticamente
8. Click en "COBRAR Y FINALIZAR"
9. API crea Venta + descuenta StockLocal (transaccional)
10. Carrito se limpia, muestra mensaje de éxito
```

## Auditoría POS Ventas (V1, solo lectura)

- **Ruta UI:** `app/modulos/auditoria-pos-ventas/page.jsx` → `/modulos/auditoria-pos-ventas`
- **APIs:** `app/api/auditoria-pos-ventas/*` (resumen, turnos, medios, productos, tickets)
- **Permiso:** `reportes.ver` · Local solo desde contexto activo (`resolveLocalAndGrupo`)
- **Datos:** agregados desde `Venta` / `VentaDetalle` / `Turno`; comisión por producto prorrateada (derivada, no persistida)

---
*Documento generado automáticamente. No editar manualmente.*
