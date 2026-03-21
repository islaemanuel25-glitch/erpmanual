# Auditoría Visual - Módulo Auditoría POS Ventas

Fecha de auditoría: 2026-03-21
Proyecto: `C:\Users\1234\Desktop\erpmanual`
Tipo: Auditoría visual/UX/UI (sin implementación, sin fixes)

## 1) Ruta exacta del módulo
- Módulo UI principal: `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`

## 2) Archivos implicados (reales)

### UI del módulo
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\ResumenKpis.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaMediosPago.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`

### Hook/state del módulo
- `C:\Users\1234\Desktop\erpmanual\hooks\useAuditoriaPosVentas.js`
- `C:\Users\1234\Desktop\erpmanual\hooks\useContextoActivo.js`

### Base visual (design system/tokens)
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiCard.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiButton.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiInput.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiSeparator.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiTable.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiLoader.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\sunmi\SunmiThemeProvider.jsx`
- `C:\Users\1234\Desktop\erpmanual\lib\sunmiThemes.js`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`
- `C:\Users\1234\Desktop\erpmanual\app\globals.css`

### Datos/API del módulo
- `C:\Users\1234\Desktop\erpmanual\app\api\auditoria-pos-ventas\resumen\route.js`
- `C:\Users\1234\Desktop\erpmanual\app\api\auditoria-pos-ventas\turnos\route.js`
- `C:\Users\1234\Desktop\erpmanual\app\api\auditoria-pos-ventas\medios\route.js`
- `C:\Users\1234\Desktop\erpmanual\app\api\auditoria-pos-ventas\productos\route.js`
- `C:\Users\1234\Desktop\erpmanual\app\api\auditoria-pos-ventas\tickets\route.js`
- `C:\Users\1234\Desktop\erpmanual\lib\auditoria-pos-ventas\scope.js`
- `C:\Users\1234\Desktop\erpmanual\lib\auditoria-pos-ventas\agregaciones.js`
- `C:\Users\1234\Desktop\erpmanual\lib\auditoria-pos-ventas\constantes.js`

## 3) Mapa UI -> componentes -> hooks/state -> estilos/themes/tokens -> datos

### Estructura UI
- Header de módulo + subtítulo de contexto local.
- Card de filtros (Desde, Hasta, botón Consultar).
- Bloques de resultados:
  - Resumen KPI
  - Turnos
  - Medios de pago
  - Rentabilidad por producto
  - Tickets conflictivos

### Componentes
- Contenedor: `SunmiCard`
- Inputs/botones: `SunmiInput`, `SunmiButton`
- Separador visual: `SunmiSeparator`
- Tablas: `SunmiTable`
- Loader: `SunmiLoader`
- Bloques de contenido: `ResumenKpis`, `TablaTurnos`, `TablaMediosPago`, `TablaRentabilidadProductos`, `TablaTicketsConflictivos`

### Hook y estado
- Hook principal: `useAuditoriaPosVentas`
- Estado de pantalla: `fechaDesde`, `fechaHasta`, `ticketsPage`, `loading`, `loadingTickets`, `error`, datasets por bloque
- Contexto operativo: `useContextoActivo` (local activo obligatorio)

### Estilos/themes/tokens
- Clases utilitarias y semánticas Sunmi (`sunmi-*`, `pos-*`)
- Variables CSS por theme en `app/globals.css` (`--app-*`, `--pos-*`, `--hover-bg`, etc.)
- Temas declarados en `lib/sunmiThemes.js` (Dark, Light, Graphite, Sand, BlueClassic, France)

### Flujo de datos
- Consulta paralela de 5 endpoints desde `useAuditoriaPosVentas`
- Rango de fechas obligatorio y paginación en tickets conflictivos
- Scope de local resuelto en servidor (`getAuditoriaScope`)

## 4) Inspección visual real con Playwright (evidencia)

### Evidencias generadas
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-inicial.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-light-theme.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-mobile-viewport.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-mobile-full.png`

### Condición de prueba
- Login real en UI con usuario semilla (`admin@admin.com`).
- Vista con datos del día sin ventas (predominio de estado vacío/ceros).
- Viewports usados:
  - Desktop: `1280x900`
  - Mobile: `375x812`

## 5) Auditoría visual por sección

### 5.1 Encabezado del módulo
- Correcto: título/subtítulo claros y ubicación consistente con otros módulos.
- Observación: dependencia fuerte del contexto local visible en subtítulo (positivo para trazabilidad).

### 5.2 Filtros (Desde/Hasta/Consultar)
- Correcto: jerarquía clara, CTA visible y contraste alto en tema oscuro.
- Hallazgo: en desktop queda mucho espacio vacío lateral del bloque de filtros (densidad baja).

### 5.3 Resumen KPI
- Correcto: lectura rápida, uso semántico de color para comisión/neto/ganancia.
- Hallazgo: en tema claro hay contraste bajo en textos secundarios y labels finos.

### 5.4 Turnos
- Correcto: estado vacío explícito (“Sin turnos en el período”).
- Hallazgo: en ausencia de datos ocupa un bloque alto con poco contenido útil (alto “vacío visual”).

### 5.5 Medios de pago
- Correcto: tabla compacta y orden de medios consistente.
- Hallazgo mobile: desborde horizontal real; métricas Playwright muestran `clientWidth 290` vs `scrollWidth 540` en contenedor principal.

### 5.6 Rentabilidad por producto
- Correcto: comunica estado vacío.
- Hallazgo: misma lógica visual de bloque grande con poco contenido en estado vacío.

### 5.7 Tickets conflictivos
- Correcto: criterio visible y texto explicativo.
- Hallazgo: paginación aparece solo con datos; en vacío la sección queda pasiva sin affordance de siguiente acción.

## 6) Hallazgos por severidad

## Críticos
1. **(C1) Riesgo de usabilidad mobile en tablas por overflow horizontal sin señal de interacción suficientemente fuerte.**
- Evidencia: overflow confirmado por métrica (`scrollWidth > clientWidth`) y columnas truncadas visualmente en mobile.
- Impacto: lectura parcial de columnas clave (comisión/costo/ganancia) en dispositivos chicos.

## Medios
1. **(M1) Contraste y legibilidad en tema claro insuficiente para textos secundarios y separadores.**
- Evidencia: captura `desktop-light-theme` con tonos grises muy cercanos en labels, subtítulos y separators.
- Impacto: reduce escaneabilidad y accesibilidad.

2. **(M2) Densidad de información baja en estados vacíos (bloques altos repetidos con un solo mensaje).**
- Impacto: percepción de “pantalla vacía” y menor eficiencia visual.

3. **(M3) CTA post-consulta en estado vacío poco orientada a acción.**
- Impacto: usuario sin guía para “qué hacer después” (cambiar rango, revisar local, etc.).

## Menores
1. **(m1) Inconsistencia de semántica de color en KPI de Ganancia vs otras tarjetas (fondo destacado solo en una métrica).**
2. **(m2) Separadores visuales dominantes en bloques con poco contenido; compiten con el contenido útil.**
3. **(m3) Espaciado horizontal suboptimizado en desktop (gran aire en card de filtros).**

## 7) Responsive desktop
- Resultado general: funcional y estable, sin overflow global (`doc.scrollWidth == doc.clientWidth`).
- Tablas: en desktop actual (1280) no desbordan.
- Oportunidad: optimizar densidad y balance de espacios en filtros/estados vacíos.

## 8) Responsive mobile
- Resultado general: navegación y stacking correctos.
- Problema principal: tablas con overflow horizontal real.
- Métrica objetiva: contenedor principal de tabla `290/540` (client/scroll), overflow activo.

## 9) Inconsistencias de theme/tokens/hardcodes
1. Uso mixto de tokens semánticos (`sunmi-*`) con utilidades directas Tailwind en los mismos bloques.
2. Dependencia de clases dinámicas derivadas por string en componentes base (`SunmiSeparator`, `SunmiLoader`) que reduce predictibilidad cross-theme.
3. Contraste no homogéneo entre `sunmiDark` y `sunmiLight` en textos secundarios.
4. `SunmiButton` usa variantes (`sunmi-btn-${color}`) y el módulo mezcla decisiones de color por componente y por clase semántica.

## 10) Riesgos UX
1. En mobile, campos críticos en tabla pueden quedar fuera de vista inmediata y no ser descubiertos por usuarios menos expertos.
2. Estados vacíos consecutivos en varios bloques incrementan carga cognitiva y sensación de no-resultado.
3. En tema claro, la legibilidad de textos de apoyo puede afectar velocidad de análisis operativo.

## 11) Lista exacta de archivos a tocar después (NO ejecutado en esta auditoría)

### Para resolver C1 (overflow mobile de tablas)
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaMediosPago.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### Para resolver M1 (contraste tema claro)
- `C:\Users\1234\Desktop\erpmanual\app\globals.css`
- `C:\Users\1234\Desktop\erpmanual\lib\sunmiThemes.js`
- `C:\Users\1234\Desktop\erpmanual\styles\sunmi.css`

### Para resolver M2/M3 (densidad/estados vacíos)
- `C:\Users\1234\Desktop\erpmanual\app\modulos\auditoria-pos-ventas\page.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTurnos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaRentabilidadProductos.jsx`
- `C:\Users\1234\Desktop\erpmanual\components\auditoria-pos-ventas\TablaTicketsConflictivos.jsx`

## 12) Priorización P1/P2/P3 (atada a hallazgos)
- **P1:** C1 (overflow horizontal mobile en tablas críticas).
- **P2:** M1 (contraste tema claro), M2 (bloques vacíos sobredimensionados), M3 (falta de guía en estado sin datos).
- **P3:** m1, m2, m3 (consistencia visual y optimización de espacios).

## 13) Alcance y límites de esta auditoría
- Se hizo solo auditoría (sin fixes, sin cambios en código del módulo).
- Inspección visual real ejecutada con Playwright + lectura de archivos reales.
- La muestra de datos operativos fue de día sin ventas; por eso prevalecen estados vacíos.

## 14) Segunda pasada exhaustiva (ampliación del entregable existente)

### 14.1 Método de profundización
- Se mantiene íntegro el informe original y se amplía con una segunda lectura visual enfocada en micro-criterios de calidad.
- Esta pasada usa las capturas previas y nuevas capturas de interacción (`hover`, `focus`, `scroll horizontal`).
- No se implementaron cambios ni se editaron archivos de código.

### 14.2 Evidencia adicional incorporada
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-check-session.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-desktop-focus-date.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png`
- `C:\Users\1234\Desktop\erpmanual\auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right-full.png`

## 15) Auditoría visual por sección (profundizada)

### 15.1 Header (topbar + encabezado del módulo)
- Jerarquía visual: correcta en desktop; `Auditoría POS Ventas` domina claramente el bloque de contenido.
- Legibilidad: buena en dark (`sunmiDark`) por contraste de título y subtítulo sobre fondo profundo.
- Contraste: adecuado en dark; en light se percibe caída en fuerza visual del subtítulo.
- Padding/gaps: consistentes con layout global; el bloque no colisiona con topbar.
- Alineación: correcta en eje horizontal con el contenido principal.
- Densidad: equilibrada; no recarga ni subinforma.
- Affordance: no aplica interacción principal salvo navegación superior.
- Hover/focus: no se detectan problemas visibles en controles de topbar durante la revisión.
- Consistencia theme/tokens: consistente con tokens generales; menor consistencia en tema claro para textos secundarios.
- Evidencia: `auditoria-pos-ventas-2026-03-21-desktop-check-session.png` (`1280x900`, bloque header).

### 15.2 Filtros (Desde/Hasta/Consultar)
- Jerarquía visual: CTA `Consultar` es claramente dominante y entendible.
- Legibilidad: buena en valores de fecha; labels “Desde/Hasta” con tamaño pequeño pero todavía legibles en dark.
- Contraste: correcto en dark; en light el label y separador pierden fuerza relativa.
- Padding/gaps: vertical correcto; horizontal mejorable en desktop por exceso de aire lateral.
- Alineación: inputs y botón bien alineados en baseline visual.
- Densidad: baja en desktop (poca ocupación útil para ancho disponible).
- Affordance: buena del botón; los campos `date` se reconocen correctamente.
- Hover/focus: `hover` de botón es sutil; `focus` de input se ve claramente en cyan.
- Consistencia theme/tokens: componente coherente con `sunmi-input` y `sunmi-btn-amber`; sin ruptura severa.
- Evidencia: 
  - `auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png` (`1280x900`, bloque filtros, hover CTA)
  - `auditoria-pos-ventas-2026-03-21-desktop-focus-date.png` (`1280x900`, bloque filtros, focus input)
  - `auditoria-pos-ventas-2026-03-21-desktop-inicial.png` (`1280x900`, distribución general del bloque)

### 15.3 KPIs (Resumen)
- Jerarquía visual: estructura clara en 6 celdas; “Ganancia neta” recibe mayor énfasis por superficie destacada.
- Legibilidad: números principales legibles; labels secundarios pueden quedar débiles en light.
- Contraste: bueno en dark; en light disminuye separación entre celdas y texto auxiliar.
- Padding/gaps: correcto en desktop y mobile; no hay solapamientos.
- Alineación: centrado consistente por tarjeta, con buena lectura escaneable.
- Densidad: adecuada; no saturada.
- Affordance: bloque informativo (sin acción directa).
- Hover/focus: no aplica interacción principal.
- Consistencia theme/tokens: en general correcta; asimetría visual por única tarjeta de ganancia con fondo fuerte.
- Evidencia:
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png` (`1280x900`, bloque KPIs)
  - `auditoria-pos-ventas-2026-03-21-mobile-viewport.png` (`375x812`, bloque KPIs en stack)
  - `auditoria-pos-ventas-2026-03-21-desktop-light-theme.png` (`1280x900`, contraste en light)

### 15.4 Tablas (Turnos, Medios, Rentabilidad, Tickets)
- Jerarquía visual: encabezados de sección visibles; tablas con encabezado distinguible.
- Legibilidad: buena en desktop; en mobile cae por truncamiento lateral.
- Contraste: correcto en dark para cabecera/cuerpo; en light la separación entre líneas y fondo se debilita.
- Padding/gaps: tabla compacta; útil para densidad pero exige precisión visual en mobile.
- Alineación: columnas monetarias con alineación derecha consistente (positivo).
- Densidad: alta en tabla de medios; útil en desktop, exigente en mobile.
- Affordance: scroll horizontal existe, pero señal visual de scroll es insuficiente para descubrimiento temprano.
- Hover/focus: filas tienen hover en desktop; no aporta en touch mobile.
- Consistencia theme/tokens: uso consistente de `SunmiTable` y clases `sunmi-*` con algunas utilidades mezcladas.
- Evidencia:
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png` (`1280x900`, tablas completas)
  - `auditoria-pos-ventas-2026-03-21-mobile-full.png` (`375x812`, tablas en mobile)
  - `auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png` (`375x812`, tabla desplazada horizontalmente)

### 15.5 Badges/Estados
- Jerarquía visual: en esta corrida con datos en cero no se disparan badges de estado de conflicto en tablas.
- Legibilidad: componente base de badge (cuando aparezca) mantiene tamaño pequeño; puede quedar justo en mobile.
- Contraste: semántica de color parece definida, pero no validada con casos reales de `pérdida/margen bajo` en esta muestra.
- Padding/gaps: suficiente para pills cortas.
- Alineación: prevista correcta en columna de estado.
- Densidad: aceptable.
- Affordance: informativo, no interactivo.
- Hover/focus: no aplica.
- Consistencia theme/tokens: consistente con `sunmi-badge-*` declarados.
- Evidencia: validación indirecta por código + layout de columna en `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png` (`1280x900`, bloque tablas).

### 15.6 Vacíos (empty states)
- Jerarquía visual: mensaje de vacío visible, pero compite contra superficies de gran altura.
- Legibilidad: texto claro y entendible.
- Contraste: correcto en dark; aceptable en light con menor énfasis.
- Padding/gaps: exceso de espacio vertical en múltiples bloques vacíos consecutivos.
- Alineación: centrado correcto.
- Densidad: baja; percepción de “pantalla extensa con poco valor visible”.
- Affordance: baja; falta siguiente acción contextual en cada bloque vacío.
- Hover/focus: no aplica.
- Consistencia theme/tokens: consistente visualmente, pero repetitivo.
- Evidencia:
  - `auditoria-pos-ventas-2026-03-21-desktop-inicial.png` (`1280x900`, vacío pre-consulta)
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png` (`1280x900`, vacíos post-consulta)
  - `auditoria-pos-ventas-2026-03-21-mobile-full.png` (`375x812`, vacíos apilados)

### 15.7 Acciones (principalmente Consultar + paginación tickets)
- Jerarquía visual: botón principal visible y correctamente priorizado.
- Legibilidad: excelente del label en dark y light.
- Contraste: alto, cumple función de CTA.
- Padding/gaps: botón cómodo en desktop y mobile.
- Alineación: integrada correctamente en bloque de filtros.
- Densidad: correcta.
- Affordance: buena para “Consultar”; baja para acciones alternativas cuando no hay resultados.
- Hover/focus: hover existente pero leve; focus en inputs sí perceptible.
- Consistencia theme/tokens: consistente con `sunmi-btn-amber`.
- Evidencia:
  - `auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png` (`1280x900`, hover CTA)
  - `auditoria-pos-ventas-2026-03-21-desktop-focus-date.png` (`1280x900`, focus y flujo de acción)

### 15.8 Scrolls (vertical y horizontal)
- Jerarquía visual: scrollbar vertical visible en mobile; horizontal en tabla no tiene affordance fuerte.
- Legibilidad: el recorte de columnas en estado inicial afecta comprensión inmediata.
- Contraste: el hint de scroll horizontal no destaca lo suficiente.
- Padding/gaps: el contenedor scrollable está bien contenido, pero con mucha información fuera de vista.
- Alineación: correcto técnicamente, pero incompleto perceptivamente en mobile.
- Densidad: elevada en tablas para ancho `375`.
- Affordance: principal punto débil de la experiencia mobile.
- Hover/focus: no relevante para descubrir scroll en touch.
- Consistencia theme/tokens: técnicamente consistente, UX de descubrimiento mejorable.
- Evidencia:
  - Métrica: contenedor tabla mobile `clientWidth=282`, `scrollWidth=540`, `scrollLeft` de `0` a `220`.
  - Capturas: `auditoria-pos-ventas-2026-03-21-mobile-full.png` (inicio) y `auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png` (desplazada), viewport `375x812`.

### 15.9 Responsive (desktop/mobile)
- Desktop (`1280x900`): estable, sin overflow global; buena claridad estructural.
- Mobile (`375x812`): layout apilado correcto, pero con sacrificio de visibilidad en tablas horizontales.
- Coherencia de breakpoints: correcta en macro-layout; la deuda está en micro-interacción de tablas.
- Evidencia:
  - `auditoria-pos-ventas-2026-03-21-desktop-consultar-viewport.png` (`1280x900`)
  - `auditoria-pos-ventas-2026-03-21-mobile-viewport.png` (`375x812`)

## 16) Matriz de hallazgos vinculados a evidencia concreta

| Hallazgo | Severidad | Captura | Viewport | Bloque afectado |
|---|---|---|---|---|
| Overflow horizontal no evidente en primera lectura | Crítico | `auditoria-pos-ventas-2026-03-21-mobile-full.png` | `375x812` | Tabla Medios de pago |
| Confirmación de contenido oculto fuera de pantalla | Crítico | `auditoria-pos-ventas-2026-03-21-mobile-table-scroll-right.png` | `375x812` | Tabla Medios de pago |
| Contraste bajo en texto secundario en tema claro | Medio | `auditoria-pos-ventas-2026-03-21-desktop-light-theme.png` | `1280x900` | Header, filtros, KPIs, tablas |
| Densidad baja por bloques vacíos extensos | Medio | `auditoria-pos-ventas-2026-03-21-desktop-consultar-full.png` | `1280x900` | Turnos, Rentabilidad, Tickets |
| Señal de hover del CTA poco marcada | Menor | `auditoria-pos-ventas-2026-03-21-desktop-hover-consultar.png` | `1280x900` | Botón Consultar |
| Focus de input correcto pero dependiente de color | Menor | `auditoria-pos-ventas-2026-03-21-desktop-focus-date.png` | `1280x900` | Input fecha Desde |

## 17) Hallazgos por componente visual

### 17.1 `SunmiCard`
- Fortalezas: estructura homogénea y ordenada por secciones.
- Debilidades: en estados vacíos repetidos, amplifica sensación de “contenedor grande sin contenido”.

### 17.2 `SunmiSeparator`
- Fortalezas: ordena visualmente títulos de bloque.
- Debilidades: peso visual alto en bloques con poco contenido, sobre todo en light.

### 17.3 `SunmiInput` (type date)
- Fortalezas: foco visible y control nativo reconocible.
- Debilidades: labels pequeñas reducen legibilidad en escenarios de fatiga visual.

### 17.4 `SunmiButton` (`color=amber`)
- Fortalezas: CTA principal clara y consistente.
- Debilidades: estado hover discreto, poco diferencial respecto al estado normal.

### 17.5 `SunmiTable`
- Fortalezas: consistencia de header, alineación numérica y compactación.
- Debilidades: dependencia de scroll horizontal en mobile con baja detectabilidad; alto riesgo de omisión de columnas.

### 17.6 Badges de estado (`sunmi-badge-*`)
- Fortalezas: semántica definida (danger/accent/success).
- Debilidades: en esta muestra no hubo casos reales para validación visual completa en contexto.

## 18) Observaciones de calidad premium / no premium

### Señales premium detectadas
- Coherencia visual macro entre bloques y espaciado base.
- CTA principal clara y estable cross-viewport.
- Sistema de themes activo y funcional (dark/light) con tokens globales.
- Orden de información correcto para lectura operativa (filtros -> resumen -> detalle).

### Señales no premium detectadas
- Descubribilidad insuficiente del scroll horizontal en mobile para tablas críticas.
- Repetición de estados vacíos con alto “peso de contenedor” y bajo “valor inmediato”.
- Contraste de textos secundarios en tema claro por debajo del estándar premium percibido.
- Microinteracciones con feedback limitado (`hover` de CTA y estados de tabla en touch).

## 19) Consolidado de prioridad tras segunda pasada
- **P1:** Descubribilidad/consumo de tablas en mobile (overflow + columnas fuera de vista inicial).
- **P2:** Ajuste de contraste en light + rediseño de densidad en estados vacíos.
- **P3:** Refinamiento microinteracciones (`hover/focus`) y balance visual de separadores/tarjetas.

## 20) Nota de continuidad del documento
- Este archivo es una ampliación directa del entregable inicial.
- No se rehizo desde cero y no se eliminó contenido previo.
