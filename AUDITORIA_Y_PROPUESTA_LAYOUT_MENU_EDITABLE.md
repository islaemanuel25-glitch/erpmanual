# Auditoría y propuesta: Layout / menú editable (ERP Azul)

**Objetivo:** Mapear el sistema actual de layout/menú y proponer una arquitectura para que el usuario pueda elegir y persistir: sidebar izquierdo, topbar, opcional colapsable/floating/mobile, opcional densidad. Sin código; solo auditoría, mapa, persistencia (A/B), modelo de configuración, plan incremental e impacto. Sin usar middleware.js. Mobile-first.

---

## Archivos encontrados

### Layout y shell

| Path | Rol |
|------|-----|
| **app/layout.jsx** | Root layout: envuelve con ThemeClientWrapper y UserProvider. No tiene sidebar ni menú. |
| **app/modulos/layout.jsx** | Layout de toda la zona /modulos: redirige a login si no hay perfil; renderiza **LayoutBase** con children. |
| **components/LayoutBase.jsx** | Shell principal: **SidebarPro** (izq) + área flex con **Header** + título mobile + **main** (children). Estructura fija: sidebar siempre a la izquierda. |
| **components/Header.jsx** | Barra superior: título, notificaciones, contexto activo (admin), menú usuario (nombre, rol, cambiar local, cerrar sesión). No es el menú de navegación. |
| **components/sidebar/SidebarPro.jsx** | Menú de navegación: íconos por grupo, dropdown por grupo (MENU_CONFIG), filtrado por permisos. Desktop: aside fijo 16 (w-16). Renderiza **SidebarMobile** para móvil. |
| **components/sidebar/SidebarGroup.jsx** | Un grupo del menú (ícono + dropdown con ítems). |
| **components/sidebar/SidebarIcon.jsx** | Ícono del sidebar (normal/active). |
| **components/sidebar/SidebarMobile.jsx** | En móvil: botón hamburguesa (fixed top-left) que abre panel lateral (drawer) con los mismos grupos/ítems. No hay bottomNav. |

### Tema y contexto

| Path | Rol |
|------|-----|
| **components/sunmi/ThemeClientWrapper.jsx** | Envuelve con SunmiThemeProvider y aplica `theme.layout` al wrapper; renderiza SunmiToaster. |
| **components/sunmi/SunmiThemeProvider.jsx** | Contexto de tema: themeKey, theme (objeto), setThemeKey. **Persiste en localStorage** clave `erp-sunmi-theme`. Patrón a reutilizar para layout. |
| **lib/sunmiThemes.js** | Define SUNMI_THEMES (sunmiDark, sunmiDarkCompact, etc.) con layout, card, header, sidebar, table, badges. |
| **app/context/UserContext.jsx** | UserProvider: perfil (desde /api/me con credentials), cargando, logout. No persiste layout. |
| **hooks/useContextoActivo.js** | Lee /api/contexto-activo/get para admin (local/depósito elegido). |
| **lib/contexto.js** | getContextoActivo: usuario con local fijo → localId; admin → cookie **erpazul_contexto_activo** (localId, esDeposito). |
| **lib/auth.js** | Cookies: erpazul_sesion (JWT), erpazul_grupo_activo; getCookieValue. |

### Configuración de apariencia

| Path | Rol |
|------|-----|
| **app/modulos/configuracion/apariencia/page.jsx** | Página “Apariencia del ERP”: selector de **theme** (SunmiThemeProvider.setThemeKey). Solo admin. Lugar natural para agregar “Estilo de menú” y “Densidad”. |

### Rutas que no usan LayoutBase

- **app/login/** — sin sidebar.
- **app/inicio/page.jsx** — selección de contexto (local/depósito); puede o no usar layout según ruta padre (si está bajo /modulos, sí usa LayoutBase).

---

## Flujo actual

1. **Raíz:** `app/layout.jsx` → ThemeClientWrapper (SunmiThemeProvider) → UserProvider → children.
2. **Rutas bajo /modulos:** `app/modulos/layout.jsx` comprueba perfil (useUser); si no hay, redirect a /login vía useEffect. Si hay perfil → **LayoutBase**.
3. **LayoutBase:**  
   - Renderiza **SidebarPro** a la izquierda (siempre).  
   - Área derecha: **Header** + título mobile (pathname-based) + **main** con children.  
   - No hay estado de “modo de menú”; el menú es siempre sidebar izquierdo.
4. **SidebarPro:**  
   - Usa useUser (perfil, cargando) y useSunmiTheme (theme).  
   - Arma `menu` desde MENU_CONFIG filtrando por permisos (canSeeGroup, filterItems).  
   - Desktop: `<aside>` hidden en mobile, flex en md, w-16, con SidebarGroup por grupo.  
   - Mobile: **SidebarMobile** (hamburger + drawer overlay).  
5. **Sesión:** Cookie `erpazul_sesion` (JWT). UserContext hace GET /api/me (credentials: include) y guarda perfil en estado. No hay persistencia de preferencias de layout.  
6. **Contexto activo (admin):** Cookie `erpazul_contexto_activo` (localId, esDeposito). Header llama /api/contexto-activo/get; inicio usa /api/contexto-activo/set para guardar.  
7. **Tema:** SunmiThemeProvider lee/escribe **localStorage** clave `erp-sunmi-theme`; Apariencia page llama setThemeKey. Es el único patrón existente de “preferencia de UI persistida en el cliente”.

**Resumen:** No existe UIConfig ni LayoutProvider. El menú es fijo (sidebar izquierdo); en móvil ya hay drawer. La única preferencia persistida es el tema (localStorage). LayoutBase no recibe ninguna prop de “modo de menú”.

---

## Propuesta

### Modelo de configuración recomendado: LayoutSettings

Objeto mínimo (por dispositivo o por usuario, según opción de persistencia):

```js
{
  menuMode: "sidebarLeft" | "topbar" | "sidebarCollapsed",  // default: "sidebarLeft"
  density: "compact" | "comfortable",                       // default: "comfortable"
  mobileMenu: "drawer" | "bottomNav"                        // default: "drawer"
}
```

**Defaults recomendados:**  
- menuMode: `"sidebarLeft"` (comportamiento actual).  
- density: `"comfortable"`.  
- mobileMenu: `"drawer"` (comportamiento actual del SidebarMobile).

**Opcional para una segunda fase:**  
- sidebarCollapsed (solo íconos, sin labels).  
- topbar con menú horizontal (mismos ítems que MENU_CONFIG, agrupados o en dropdowns).

### Dónde vive la configuración (estado + persistencia)

- **Estado en cliente:** Un contexto **LayoutSettingsContext** (o ampliar un “UIConfigProvider”) que exponga `layoutSettings` y `setLayoutSettings`.  
- **Persistencia:** Según opción A o B más abajo; el provider lee al montar y escribe al cambiar (igual que SunmiThemeProvider con el tema).  
- **Consumidores:** LayoutBase (y en su caso un futuro TopbarNav) leen `menuMode` y `density`; SidebarPro/SidebarMobile pueden recibir `mobileMenu` o leer del mismo context para decidir drawer vs bottomNav.

### Render condicional (topbar vs sidebar)

- **LayoutBase** deja de renderizar siempre “SidebarPro + Header + main”.  
- Según `layoutSettings.menuMode`:  
  - `sidebarLeft`: estructura actual (SidebarPro + columna Header + main).  
  - `topbar`: componente de menú arriba (nuevo TopbarNav con mismos ítems que MENU_CONFIG) + Header (o integrado) + main sin sidebar.  
  - `sidebarCollapsed`: igual que sidebarLeft pero con clase/flag “collapsed” (solo íconos; opcional fase 2).  
- **Density:** aplicar clases condicionales (padding, texto, altura de ítems) en sidebar/topbar y/o en main; puede delegarse en SunmiThemeProvider (temas “compact” ya existen en sunmiThemes.js) o en un wrapper de contenido.  
- **Mobile:** Si `mobileMenu === "bottomNav"`, en móvil mostrar barra inferior con N ítems en lugar del drawer; si `"drawer"`, mantener SidebarMobile actual.

---

## Persistencia (A/B)

### Opción A) Base de datos (por usuario o por local/grupo)

- **Clave conceptual:** Preferencias de layout asociadas a usuario (o a usuario+local/grupo si se quiere por contexto).  
- **Scope:** Por usuario (userId) o por (userId + localId) / (userId + grupoId) si se desea “en este local uso topbar”.  
- **Implementación:** Tabla `UsuarioPreferencia` o `LayoutSetting` con userId (y opcional localId/grupoId), clave `layout`, valor JSON `LayoutSettings`. API GET/POST `/api/preferencias/layout` (o `/api/me/preferencias`) que lee/escribe por sesión.  
- **Ventajas:** Misma preferencia en todos los dispositivos; opción de “por local” útil en multi-sucursal.  
- **Riesgos:** Requiere migración, API y que el layout lea al montar (después de tener sesión); si no hay sesión (ej. login) se usa default. En móvil hay que esperar a que /api/me y preferencias respondan antes de pintar menú (evitar flash).

### Opción B) Cookie / localStorage (por dispositivo)

- **Clave:** Por ejemplo `erpazul_layout` (localStorage) o cookie `erpazul_layout` (si se quiere enviar al servidor en el futuro).  
- **Scope:** Por dispositivo/navegador; no hay userId en el valor, solo el objeto LayoutSettings.  
- **Implementación:** Mismo patrón que **SunmiThemeProvider**: en un LayoutSettingsProvider (o dentro del mismo provider de tema si se unifica), leer al montar `localStorage.getItem("erpazul_layout")`, parsear JSON, aplicar defaults; al cambiar, `setItem`.  
- **Ventajas:** Cambios mínimos; sin migración ni API; consistente con el tema actual; mobile-first y rápido (sin round-trip).  
- **Riesgos:** No sincroniza entre dispositivos; si limpian datos del sitio se pierde; no “por local” sin añadir lógica extra (ej. clave `erpazul_layout_${localId}`).

**Recomendación:** **Opción B (localStorage)** para la primera versión: mínimo impacto, mismo patrón que el tema, mobile-first y sin tocar backend. Opción A se puede añadir después si se requiere “misma preferencia en todos lados” o “por local”.

---

## Plan de implementación incremental (sin código)

**Paso 1 – Introducir LayoutSettingsProvider / hook**  
- Crear contexto (ej. `LayoutSettingsContext`) con estado inicial por defecto (sidebarLeft, comfortable, drawer).  
- Provider lee de localStorage (`erpazul_layout`) al montar, aplica defaults, expone `layoutSettings` y `setLayoutSettings`.  
- Envolver la parte del árbol donde se usa el layout (p. ej. dentro de ModulosLayout o dentro de LayoutBase) para que LayoutBase y SidebarPro puedan consumirlo.  
- Archivos: nuevo `context/LayoutSettingsContext.jsx` (o `components/layout/LayoutSettingsProvider.jsx`) y uso en `app/modulos/layout.jsx` o en `LayoutBase.jsx`.

**Paso 2 – Switcher en UI**  
- En **app/modulos/configuracion/apariencia/page.jsx** (o nueva sección “Menú y layout”): controles para menuMode (sidebar izquierdo / topbar / colapsado si aplica), density (compacto / cómodo), mobileMenu (drawer / bottomNav).  
- Al cambiar, llamar `setLayoutSettings` y persistir en localStorage en el mismo provider.  
- No tocar aún el render de LayoutBase; solo guardar preferencia.

**Paso 3 – Persistencia**  
- Ya cubierta en Paso 1 (lectura) y Paso 2 (escritura en provider + localStorage). Si más adelante se elige opción A, añadir API y leer en el provider cuando haya sesión.

**Paso 4 – Render condicional (topbar vs sidebar)**  
- En **LayoutBase**: usar `useLayoutSettings()` (o el hook que se defina); según `menuMode`, renderizar SidebarPro o TopbarNav (nuevo componente que reutilice MENU_CONFIG y permisos).  
- Ajustar clases para density en sidebar/topbar y/o main.  
- Mobile: según `mobileMenu`, mostrar drawer (SidebarMobile actual) o BottomNav (nuevo componente).

**Paso 5 – Pruebas rápidas**  
- Rutas a validar: `/modulos` (redirect), `/modulos/dashboard`, `/modulos/productos`, `/modulos/pos-ventas`, `/modulos/configuracion/apariencia`.  
- Comprobar: cambio de tema sigue funcionando; cambio de menuMode (sidebar ↔ topbar) sin recargar; en móvil drawer sigue abriendo; guardar y recargar página mantiene layout; login e inicio no dependen del layout de modulos.

---

## Lista exacta de archivos

**TOCAR**  
- `app/modulos/layout.jsx` — Envolver children con LayoutSettingsProvider (o que LayoutBase esté dentro del provider).  
- `components/LayoutBase.jsx` — Consumir layoutSettings; render condicional SidebarPro vs TopbarNav; opcional density/mobileMenu.  
- `components/sidebar/SidebarPro.jsx` — Opcional: recibir prop “collapsed” o leer density para clases; si mobileMenu === "bottomNav", no renderizar SidebarMobile (eso lo hará LayoutBase).  
- `app/modulos/configuracion/apariencia/page.jsx` — Añadir sección “Menú y layout” (menuMode, density, mobileMenu) y llamar setLayoutSettings.

**NUEVOS**  
- `app/context/LayoutSettingsContext.jsx` (o `components/layout/LayoutSettingsProvider.jsx`) — Context + provider, lectura/escritura localStorage, defaults.  
- `components/layout/TopbarNav.jsx` (o `components/nav/TopbarNav.jsx`) — Menú horizontal con mismos ítems que MENU_CONFIG (permisos); usado cuando menuMode === "topbar".  
- Opcional: `components/layout/BottomNav.jsx` — Barra inferior para móvil cuando mobileMenu === "bottomNav".

**NO TOCAR**  
- `app/layout.jsx` — Raíz sin cambios.  
- `middleware.js` — No usar (restricción).  
- `components/Header.jsx` — No cambiar responsabilidades; solo asegurar que siga funcionando con topbar (posición o ancho).  
- `components/sidebar/SidebarGroup.jsx`, `SidebarIcon.jsx` — Reutilizar tal cual en sidebar; en topbar se puede reutilizar lógica de ítems pero no obligatorio.  
- Módulos individuales (productos, pos-ventas, etc.) — No tocar; no conocen el modo de menú.  
- `lib/contexto.js`, `lib/auth.js`, `hooks/useContextoActivo.js` — Sin cambios para layout.  
- `SunmiThemeProvider`, `ThemeClientWrapper`, `lib/sunmiThemes.js` — Sin cambios; densidad puede ser aparte o coordinada por LayoutSettings.

---

## Impacto y riesgos

- **Riesgo bajo:** LayoutSettings en localStorage y provider aislado; si falla la lectura, usar defaults y el comportamiento actual se mantiene.  
- **Riesgo medio:** LayoutBase con dos variantes (sidebar vs topbar); hay que asegurar que el ancho del contenido y el header no se rompan en móvil (topbar puede ser scroll horizontal o dropdown).  
- **Mobile-first:** En móvil el flujo actual es drawer; si se añade bottomNav, probar bien en viewport pequeño y que no tape contenido (safe area).  
- **Accesibilidad:** Topbar y bottomNav deben mantener navegación por teclado y roles ARIA.  
- **Permisos:** TopbarNav y BottomNav deben usar la misma MENU_CONFIG y filtrado por permisos que SidebarPro para no exponer ítems no permitidos.

---

## Resumen

- **Layout general:** Renderizado en **LayoutBase** (SidebarPro + Header + main), usado por **app/modulos/layout.jsx**.  
- **Menú:** **SidebarPro** (desktop) + **SidebarMobile** (drawer en móvil); menú declarativo en MENU_CONFIG.  
- **Sesión/local/grupo:** Cookie erpazul_sesion; UserContext + /api/me; contexto activo con cookie erpazul_contexto_activo y /api/contexto-activo.  
- **UIConfig / ThemeProvider:** No hay UIConfig; **SunmiThemeProvider** persiste tema en localStorage (`erp-sunmi-theme`); **Apariencia** ya es la pantalla de preferencias visuales.  
- **Persistencia recomendada:** **B) localStorage** clave `erpazul_layout`, objeto LayoutSettings (menuMode, density, mobileMenu), defaults sidebarLeft / comfortable / drawer.  
- **Implementación:** LayoutSettingsProvider + switcher en Apariencia + render condicional en LayoutBase + TopbarNav (y opcional BottomNav); archivos a tocar y nuevos listados arriba; sin middleware.
