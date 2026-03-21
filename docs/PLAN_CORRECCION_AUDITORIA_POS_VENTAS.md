# Plan Técnico de Corrección - Auditoría POS Ventas

Fecha: 2026-03-21  
Base única: `docs/AUDITORIA_VISUAL_AUDITORIA_POS_VENTAS.md`  
Alcance: plan técnico (sin implementación)

## 1. Objetivo general
Corregir los problemas visuales y de UX ya documentados en la auditoría del módulo **Auditoría POS Ventas**, priorizando primero usabilidad mobile (P1), luego legibilidad/claridad visual (P2) y finalmente refinamientos de consistencia y microinteracción (P3), sin introducir regresiones en otros módulos que comparten componentes Sunmi.

## 2. Problemas a corregir agrupados por P1 / P2 / P3

### P1
- P1-01: Descubribilidad y consumo de tablas en mobile con overflow horizontal (columnas críticas fuera de vista inicial).

### P2
- P2-01: Contraste insuficiente de texto secundario y separadores en `sunmiLight`.
- P2-02: Densidad baja por estados vacíos sobredimensionados (bloques altos con poco contenido).
- P2-03: Falta de guía de acción en estado vacío post-consulta.

### P3
- P3-01: Inconsistencia de énfasis visual en KPIs (ganancia resaltada versus resto).
- P3-02: Separadores con peso visual excesivo en secciones vacías.
- P3-03: Microinteracción `hover` de CTA principal poco diferenciada.
- P3-04: Espaciado horizontal subóptimo en card de filtros desktop.

## 3. Archivos exactos a tocar por cada problema

### P1-01
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaMediosPago.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### P2-01
- `C:\Users\1234\Desktop\erpmanual\app\globals.css`
- `C:\Users\1234\Desktop\erpmanual\lib\sunmiThemes.js`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### P2-02
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`

### P2-03
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`

### P3-01
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\ResumenKpis.jsx`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### P3-02
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiSeparator.jsx`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### P3-03
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiButton.jsx`

### P3-04
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`

## 4. Estrategia visual/UI por problema

### P1-01 (tablas mobile)
- Priorizar patrón de lectura mobile: columnas esenciales visibles de entrada, secundarias desplazables o resumidas.
- Mejorar affordance del scroll horizontal (indicador más explícito, pista textual o gradiente más fuerte).
- Unificar comportamiento en las 4 tablas del módulo para evitar patrones mixtos.

### P2-01 (contraste light)
- Ajustar tokens de texto secundario/separadores para `sunmiLight` en vez de hardcodes locales.
- Mantener equivalencia de jerarquía con dark, no “apagar” labels/subtítulos.
- Validar que el ajuste no lave contraste en otros themes (Graphite/Sand/BlueClassic/France).

### P2-02 (densidad vacíos)
- Reducir altura de bloques vacíos y compactar spacing vertical.
- Mantener estructura de secciones, pero con menor “peso de contenedor” cuando no hay datos.
- Conservar legibilidad del mensaje sin ocupar viewport en exceso.

### P2-03 (guía en vacío)
- Definir microcopy accionable por sección vacía (qué revisar o qué cambiar en filtros/contexto).
- Evitar acciones nuevas complejas; solo orientación contextual y consistente.

### P3-01 (KPI)
- Normalizar jerarquía de tarjetas KPI para que el énfasis sea intencional y equilibrado.
- Mantener semántica de color, evitando sobre-dominancia de un único bloque.

### P3-02 (separadores)
- Bajar protagonismo visual del separador cuando la sección está en estado vacío.
- Mantener consistencia de marca sin competir con el contenido.

### P3-03 (hover CTA)
- Reforzar diferencia entre estado normal y hover/focus-visible en CTA.
- Evitar cambios bruscos que parezcan otro botón o rompan consistencia global.

### P3-04 (filtros desktop)
- Rebalancear grilla/anchos para usar mejor el espacio disponible en desktop.
- Mantener comportamiento actual en mobile sin regresiones.

## 5. Riesgos de implementación
- Riesgo R1: cambios en `styles/sunmi.css` impactan componentes compartidos por otros módulos.
- Riesgo R2: ajustes de tokens en `globals.css` o `sunmiThemes.js` alteran contraste global del sistema.
- Riesgo R3: compactación de vacíos puede romper equilibrio visual en viewports pequeños.
- Riesgo R4: cambios en tablas para mobile pueden degradar lectura desktop si no se separan por breakpoint.
- Riesgo R5: mejoras de hover/focus pueden entrar en conflicto con estilos existentes de botones Sunmi en otros flows.

## 6. Orden recomendado de trabajo
1. P1-01 (tablas mobile y affordance de scroll).
2. P2-01 (contraste theme light por tokens).
3. P2-02 (densidad de estados vacíos).
4. P2-03 (orientación en estados vacíos).
5. P3-01 (consistencia visual KPIs).
6. P3-02 (refinado separadores).
7. P3-03 (hover/focus CTA).
8. P3-04 (ajuste de espacio filtros desktop).
9. Pasada final integral de regresión visual en dark y light.

## 7. Qué validar después de cada cambio

### Checklist funcional-visual mínimo
- La página carga y conserva flujo `Consultar` sin errores visuales.
- No aparece overflow horizontal global (`documentElement.scrollWidth == clientWidth`) en desktop.
- En mobile, el usuario detecta el comportamiento de tabla desplazable y no pierde columnas críticas.
- En `sunmiLight`, labels/subtítulos/separadores mantienen legibilidad clara.
- Estados vacíos siguen siendo comprensibles, pero más compactos.
- CTA principal mantiene prioridad visual y feedback claro.

### Checklist por prioridad
- Tras P1: validar tablas en `375x812` y `1280x900`.
- Tras P2-01: validar al menos `sunmiDark` y `sunmiLight` (ideal: quick pass en los demás themes).
- Tras P2-02/P2-03: validar altura total de página y escaneabilidad post-consulta sin datos.
- Tras P3: validar consistencia con otros módulos que usan `SunmiCard`, `SunmiSeparator`, `SunmiButton`.

## 8. Qué capturas Playwright repetir para validar la corrección

### Baseline a repetir (mismo naming + “-fix” opcional)
- `auditoria-pos-ventas-2026-03-21-desktop-inicial.png` (desktop vacío inicial)
- `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png` (desktop post-consulta)
- `auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png` (desktop primer viewport)
- `auditoria-pos-ventas-2026-03-21-desktop-light-theme.png` (contraste light)
- `auditoria-pos-ventas-2026-03-21-mobile-viewport.png` (mobile inicial)
- `auditoria-pos-ventas-2026-03-21-mobile-full.png` (mobile completo)
- `auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png` (mobile con tabla desplazada)
- `auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png` (estado hover CTA)
- `auditoria-pos-ventas-2026-03-21-desktop-focus-date.png` (estado focus input)

### Métricas a repetir junto a capturas
- Tabla mobile: registrar `clientWidth`, `scrollWidth`, `scrollLeft` antes/después de desplazamiento.
- Documento desktop/mobile: registrar `documentElement.clientWidth` vs `scrollWidth`.

## 9. Qué NO tocar para evitar romper otros módulos
- No modificar lógica de datos/negocio de endpoints:
  - `app\api\auditoria-pos-ventas\*.js`
  - `lib\auditoria-pos-ventas\scope.js`, `agregaciones.js`, `constantes.js`
- No alterar contratos del hook de datos:
  - `hooks\useAuditoriaPosVentas.js`
- No cambiar permisos/ruteo de menú o contexto operativo:
  - `lib\menuConfig.js`, `hooks\useContextoActivo.js`
- Evitar cambios globales amplios en componentes Sunmi sin scope explícito para este módulo.
- Evitar introducir nuevos patrones visuales no usados en el sistema (mantener tokens y lenguaje visual Sunmi existente).

---
Este documento define **solo el plan técnico de corrección** derivado de los hallazgos ya auditados. No implica implementación en esta etapa.
