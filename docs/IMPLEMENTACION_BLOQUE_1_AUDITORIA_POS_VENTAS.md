# Implementación Bloque 1 - Auditoría POS Ventas

Fecha: 2026-03-21  
Bloque ejecutado: **Bloque 1 - Usabilidad Mobile de Tablas**  
Fuente: `docs/PLAN_EJECUCION_AUDITORIA_POS_VENTAS.md`

## 1) Alcance ejecutado
Se implementaron únicamente cambios del Bloque 1 para:
- reducir fricción de lectura en tablas mobile,
- reforzar descubribilidad del scroll horizontal,
- mantener comportamiento de desktop sin tocar contraste global, vacíos ni refinamientos de otros bloques.

## 2) Archivos tocados
- `components/auditoria-pos-ventas/TablaMediosPago.jsx`
- `components/auditoria-pos-ventas/TablaTurnos.jsx`
- `components/auditoria-pos-ventas/TablaRentabilidadProductos.jsx`
- `components/auditoria-pos-ventas/TablaTicketsConflictivos.jsx`
- `styles/sunmi.css`

## 3) Cambios aplicados

### `TablaMediosPago.jsx`
- Se agregó hint mobile: `Deslizá horizontalmente para ver todas las columnas.`
- El contenedor de tabla pasó a usar `sunmi-scroll-area` además de `sunmi-scroll-hint`.
- Ajuste de ancho mínimo para mobile/desktop: `min-w-[520px] md:min-w-[540px]`.
- Ajuste leve de densidad tipográfica y padding en celdas: `text-[11px] sm:text-xs`, `px-1.5 sm:px-2`.

### `TablaTurnos.jsx`
- Se agregó hint mobile de scroll horizontal.
- Se agregó clase `sunmi-scroll-area` al contenedor scroll.
- Ajuste de ancho mínimo: `min-w-[840px] md:min-w-[920px]`.
- Ajuste leve de densidad de celdas (igual patrón que medios).

### `TablaRentabilidadProductos.jsx`
- Se agregó hint mobile de scroll horizontal.
- Se agregó clase `sunmi-scroll-area` al contenedor scroll.
- Ajuste de ancho mínimo: `min-w-[700px] md:min-w-[780px]`.
- Ajuste leve de densidad de celdas.

### `TablaTicketsConflictivos.jsx`
- Se agregó hint mobile de scroll horizontal.
- Se agregó clase `sunmi-scroll-area` al contenedor scroll.
- Ajuste de ancho mínimo: `min-w-[820px] md:min-w-[960px]`.
- Ajuste leve de densidad de celdas.

### `styles/sunmi.css`
- Se agregó bloque dedicado para scroll horizontal de tablas:
  - `.sunmi-scroll-area` con `-webkit-overflow-scrolling: touch`, `touch-action: pan-x pan-y`.
  - estilo de scrollbar horizontal para mejorar descubribilidad.
  - gradientes laterales reforzados para `sunmi-scroll-hint.sunmi-scroll-area::before/::after`.
  - ajuste de opacidad en desktop (`@media (min-width: 768px)`) para no sobrecargar la vista.

## 4) Confirmación de límites (cumplimiento)
- No se tocaron archivos fuera de los permitidos para Bloque 1.
- No se aplicaron cambios de Bloque 2 (contraste/theme global).
- No se aplicaron cambios de Bloque 3 (estados vacíos/copy de guía).
- No se aplicaron cambios de Bloque 4 (hover CTA, KPI, separadores finos).
- No se editaron APIs, hooks de datos, permisos ni rutas.

## 5) Validación con Playwright (pasos recomendados)

### Desktop (`1280x900`)
1. Abrir `/modulos/auditoria-pos-ventas`.
2. Ejecutar `Consultar`.
3. Verificar que la tabla siga legible y que no exista overflow global del documento.
4. Capturas sugeridas:
- `bloque1-fix-desktop-consultar-viewport.png`
- `bloque1-fix-desktop-consultar-full.png`

### Mobile (`375x812`)
1. Abrir `/modulos/auditoria-pos-ventas`.
2. Ejecutar `Consultar`.
3. Verificar presencia del hint textual de scroll encima de cada tabla.
4. Verificar scrollbar horizontal visible y gradientes laterales de affordance.
5. Deslizar horizontalmente en tabla de Medios/Tickets y confirmar acceso visual a columnas derechas.
6. Capturas sugeridas:
- `bloque1-fix-mobile-viewport.png`
- `bloque1-fix-mobile-full.png`
- `bloque1-fix-mobile-table-scroll-right.png`

### Métricas sugeridas (Playwright evaluate)
- Para cada tabla scrollable en mobile:
  - `clientWidth`
  - `scrollWidth`
  - `scrollLeft` (antes y después de arrastre)
- Para documento:
  - `documentElement.clientWidth`
  - `documentElement.scrollWidth`

## 6) Nota de ejecución
- Se implementó el bloque solicitado y se cerró de forma acotada.
- Durante esta sesión, la validación Playwright automática quedó bloqueada por una sesión persistente de Chrome ya abierta en el entorno; se deja el checklist exacto de validación para ejecutar en cuanto el lock de sesión se libere.
