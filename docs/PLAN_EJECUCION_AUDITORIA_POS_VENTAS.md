# PLAN DE EJECUCIÓN  AUDITORÍA POS VENTAS

## 1. Objetivo
- Ejecutar las correcciones ya definidas en la auditoría y el plan técnico por bloques pequeños, aislados y verificables, priorizando impacto visual alto con riesgo controlado y evitando regresiones en componentes compartidos.

## 2. Bloques propuestos

### Bloque 1 - Usabilidad Mobile de Tablas
- Objetivo: resolver la pérdida de legibilidad por overflow horizontal y baja descubribilidad de scroll en mobile.
- Qué problemas resuelve: P1-01.
- Prioridad: P1.
- Impacto visual esperado: mejora inmediata en lectura de columnas críticas en `375x812`, menor fricción para interpretar tablas.

### Bloque 2 - Contraste Theme Light
- Objetivo: elevar legibilidad de textos secundarios, labels y separadores en `sunmiLight`.
- Qué problemas resuelve: P2-01.
- Prioridad: P2.
- Impacto visual esperado: pantalla más clara en light sin perder jerarquía ni consistencia con dark.

### Bloque 3 - Densidad y Estados Vacíos
- Objetivo: reducir “peso vacío” de la pantalla y agregar guía de acción en ausencia de datos.
- Qué problemas resuelve: P2-02 y P2-03.
- Prioridad: P2.
- Impacto visual esperado: mayor escaneabilidad, menor sensación de pantalla extensa sin valor, flujo post-consulta más orientado.

### Bloque 4 - Refinamiento Visual Fino
- Objetivo: cerrar inconsistencias menores de jerarquía, separadores, hover CTA y espaciamiento de filtros.
- Qué problemas resuelve: P3-01, P3-02, P3-03, P3-04.
- Prioridad: P3.
- Impacto visual esperado: acabado más premium y consistente sin cambios estructurales grandes.

## 3. Qué entra y qué no entra en cada bloque

### Bloque 1
- Alcance exacto: comportamiento de tablas del módulo en mobile y señales visuales de desplazamiento horizontal.
- Exclusiones: cambios de contraste global, microcopy de vacíos, ajustes de KPI y separadores.
- Qué NO debe tocarse todavía: tokens globales de themes (`globals.css`, `sunmiThemes.js`) y componentes compartidos no vinculados a tabla.

### Bloque 2
- Alcance exacto: solo contraste/legibilidad en `sunmiLight` para textos secundarios y separadores relevantes.
- Exclusiones: layout de vacíos, densidad de bloques, CTA vacíos, lógica de tabla mobile.
- Qué NO debe tocarse todavía: estructura de secciones en `page.jsx` y copy de estados vacíos.

### Bloque 3
- Alcance exacto: tamaños/espaciados de bloques vacíos + mensajes de guía post-consulta.
- Exclusiones: retocar tokens globales y microinteracciones de botón.
- Qué NO debe tocarse todavía: temas globales completos y componentes base compartidos fuera de lo mínimo necesario.

### Bloque 4
- Alcance exacto: jerarquía visual KPI, peso separadores, hover/focus CTA y ocupación horizontal en filtros desktop.
- Exclusiones: cambios estructurales de datos, API o hook.
- Qué NO debe tocarse todavía: lógica de negocio, permisos, rutas, endpoints.

## 4. Archivos exactos por bloque

### Bloque 1 - Archivos
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaMediosPago.jsx`  
  Motivo: tabla principal con evidencia fuerte de overflow en mobile.  
  Riesgo: Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`  
  Motivo: unificar patrón mobile de lectura tabular.  
  Riesgo: Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`  
  Motivo: consistencia de patrón scroll/resumen mobile.  
  Riesgo: Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`  
  Motivo: tabla más ancha del módulo, alto riesgo de columnas ocultas.  
  Riesgo: Medio-Alto.
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`  
  Motivo: affordance visual de scroll y estilos de tabla compartidos.  
  Riesgo: Alto (archivo compartido).

### Bloque 2 - Archivos
- `C:\Users\1234\Desktop\erpmanual\app\globals.css`  
  Motivo: variables y contraste base por theme.  
  Riesgo: Alto (impacto global).
- `C:\Users\1234\Desktop\erpmanual\lib\sunmiThemes.js`  
  Motivo: coherencia de paleta y clases por theme.  
  Riesgo: Alto (impacto global).
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`  
  Motivo: clases semánticas de texto/separador.  
  Riesgo: Alto (compartido).

### Bloque 3 - Archivos
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`  
  Motivo: estructura de bloques vacíos y mensajes globales del módulo.  
  Riesgo: Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`  
  Motivo: empty state y altura visual de sección.  
  Riesgo: Bajo-Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`  
  Motivo: empty state y densidad vertical.  
  Riesgo: Bajo-Medio.
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`  
  Motivo: empty state con guía de siguiente acción.  
  Riesgo: Medio.

### Bloque 4 - Archivos
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\ResumenKpis.jsx`  
  Motivo: balance de jerarquía visual entre tarjetas KPI.  
  Riesgo: Bajo.
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiSeparator.jsx`  
  Motivo: refinamiento de peso visual en secciones.  
  Riesgo: Medio-Alto (componente compartido).
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiButton.jsx`  
  Motivo: ajuste fino de feedback hover/focus CTA.  
  Riesgo: Alto (componente compartido).
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`  
  Motivo: ajustes de microinteracción y consistencia visual.  
  Riesgo: Alto.
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`  
  Motivo: balance de espacio horizontal en filtros desktop.  
  Riesgo: Bajo.

## 5. Riesgos por bloque

### Bloque 1
- Riesgo visual: desbalancear desktop al optimizar mobile.
- Riesgo técnico: romper anchos mínimos/tablas si no se controla por breakpoint.
- Riesgo de impacto en otros módulos: medio, por tocar `sunmi.css`.
- Riesgo de tocar componentes compartidos: medio (estilos comunes de tabla/scroll).

### Bloque 2
- Riesgo visual: sobrecorrección de contraste y pérdida de identidad de theme.
- Riesgo técnico: cambios de variables con efecto cascada en todo el sistema.
- Riesgo de impacto en otros módulos: alto.
- Riesgo de tocar componentes compartidos: alto.

### Bloque 3
- Riesgo visual: compactar en exceso y perder claridad de empty states.
- Riesgo técnico: bajo-medio (principalmente layout y copy).
- Riesgo de impacto en otros módulos: bajo si se mantiene scope en componentes del módulo.
- Riesgo de tocar componentes compartidos: bajo.

### Bloque 4
- Riesgo visual: inconsistencias si se refinan microdetalles sin validar globalmente.
- Riesgo técnico: medio por tocar componentes base (`SunmiButton`, `SunmiSeparator`).
- Riesgo de impacto en otros módulos: medio-alto.
- Riesgo de tocar componentes compartidos: alto.

## 6. Validación por bloque

### Bloque 1 - Playwright
- Desktop: `1280x900`.
- Mobile: `375x812`.
- Capturas a repetir:
  - `auditoria-pos-ventas-2026-03-21-mobile-full.png`
  - `auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png`
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png`
- Verificar exactamente:
  - columnas críticas visibles/entendibles desde entrada en mobile;
  - affordance de scroll detectable;
  - sin overflow global en desktop/mobile;
  - lectura de importes sin truncamiento crítico.

### Bloque 2 - Playwright
- Desktop: `1280x900` en dark y light.
- Mobile: `375x812` en light.
- Capturas a repetir:
  - `auditoria-pos-ventas-2026-03-21-desktop-light-theme.png`
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png`
  - `auditoria-pos-ventas-2026-03-21-mobile-viewport.png`
- Verificar exactamente:
  - legibilidad de labels/subtítulos;
  - separadores no “lavados” en light;
  - contraste consistente entre bloques y tablas.

### Bloque 3 - Playwright
- Desktop: `1280x900` (escenario sin datos).
- Mobile: `375x812` (escenario sin datos).
- Capturas a repetir:
  - `auditoria-pos-ventas-2026-03-21-desktop-inicial.png`
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png`
  - `auditoria-pos-ventas-2026-03-21-mobile-full.png`
- Verificar exactamente:
  - reducción de altura vacía por sección;
  - mejor escaneabilidad vertical;
  - presencia de guía de acción contextual en vacíos;
  - ausencia de saltos de layout.

### Bloque 4 - Playwright
- Desktop: `1280x900`.
- Mobile: `375x812` (check rápido de no regresión).
- Capturas a repetir:
  - `auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png`
  - `auditoria-pos-ventas-2026-03-21-desktop-focus-date.png`
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png`
- Verificar exactamente:
  - hover/focus claramente diferenciados;
  - KPI con jerarquía equilibrada;
  - separadores menos invasivos;
  - bloque de filtros mejor distribuido en desktop.

## 7. Orden recomendado de ejecución
- bloque 1
- bloque 2
- bloque 3
- bloque 4

Justificación del orden:
1. Bloque 1 primero por ser el problema crítico (P1) y de mayor impacto en uso real mobile.
2. Bloque 2 después para resolver legibilidad transversal en theme light antes de ajustar densidad/microdetalles.
3. Bloque 3 tercero porque depende de tener contraste ya estable para calibrar “peso visual” de vacíos.
4. Bloque 4 al final como capa de refinamiento, minimizando retrabajo tras cambios estructurales previos.

## 8. Bloque con mejor relación mejora/riesgo
- **Bloque 3 (Densidad y Estados Vacíos)**.
- Razón: ofrece mejora visual claramente percibible (pantalla más usable y orientada) con riesgo menor que tocar tokens globales o componentes Sunmi compartidos.

## 9. Bloque con mayor cuidado
- **Bloque 2 (Contraste Theme Light)**.
- Razón: toca `globals.css` y `sunmiThemes.js`, con potencial de impacto global en múltiples módulos y themes.

## 10. Agrupación correcta de cambios
- Conviene agrupar:
  - Ajustes de tabla mobile + affordance de scroll (todo en Bloque 1).
  - Densidad vacíos + copy de guía en vacío (todo en Bloque 3).
  - Microajustes visuales de acabado (todo en Bloque 4).
- Deben mantenerse separados:
  - Cambios de tokens/theme global (Bloque 2) separados de layout del módulo.
  - Cambios en componentes compartidos (`SunmiButton`, `SunmiSeparator`) separados de cambios críticos de usabilidad.
  - Correcciones P1 separadas de refinamientos P3 para no mezclar criterio de éxito.

## 11. Recomendación final
- Secuencia propuesta de ejecución:
1. Ejecutar Bloque 1 y cerrar validación mobile/desktop de tablas.
2. Ejecutar Bloque 2 con validación comparativa dark/light y quick pass de regresión en módulos sensibles.
3. Ejecutar Bloque 3 para compactar vacíos y mejorar orientación post-consulta.
4. Ejecutar Bloque 4 como ajuste final premium (KPI/separadores/hover/filtros).
- Criterio de corte por bloque: no avanzar al siguiente hasta que el bloque actual tenga validación Playwright completa y sin regresión visible.
