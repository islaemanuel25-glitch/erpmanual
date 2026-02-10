# Reconocimiento técnico completo — ERP Azul

## 1) Arquitectura general

### Tipo de proyecto
- Proyecto **Next.js con App Router** (carpeta `app/`) y rutas API dentro de `app/api`.
- Frontend y backend conviven en el mismo repositorio.
- Stack detectado: React 19, Next 16, Prisma + PostgreSQL, JWT por cookie HttpOnly.

### Capas y responsabilidades
- **Capa UI/páginas**: `app/modulos/**/page.jsx` y `app/login/page.jsx`.
- **Capa de componentes reutilizables**: `components/**` (Sunmi UI kit, sidebars, modales, tablas, etc.).
- **Capa de estado global en cliente**:
  - `app/context/UserContext.jsx` (sesión/perfil).
  - `components/providers/UIConfigProvider.jsx` (escala visual / helpers de diseño).
  - `components/providers/LayoutModeProvider.jsx` (modo layout legado top/left).
  - `components/providers/SidebarConfigProvider.jsx` (modo visual sidebar).
  - `components/sunmi/SunmiThemeProvider.jsx` + `ThemeClientWrapper.jsx` (theme + overrides CSS variables).
- **Capa API backend**: `app/api/**/route.js`.
- **Capa acceso a datos**: `lib/prisma.js` (PrismaClient singleton).
- **Capa utilitaria de dominio**:
  - `lib/auth.js` (JWT/cookies/session extraction).
  - `lib/grupos.js` (resolución grupo-local/depósito).
  - `lib/mappers/producto.js` (transformación UI ↔ DB).

### Cómo se comunican las capas
1. Las pantallas cliente hacen `fetch('/api/...')`.
2. Las rutas API validan request/parámetros y en muchos casos sesión (`getUsuarioSession`).
3. Las rutas API consultan/escriben con Prisma sobre PostgreSQL.
4. Devuelven JSON (o PDF en endpoints específicos).
5. La pantalla actualiza estado local y re-renderiza.

### Autenticación
- Login: `POST /api/login` valida credenciales con `bcrypt.compare`, arma JWT y setea cookie `erpazul_sesion`.
- Sesión activa: `GET /api/me` lee cookie, verifica token y devuelve perfil normalizado.
- Logout: `POST /api/logout` invalida cookie.
- En frontend, `UserProvider` hace refresh automático contra `/api/me` al montar.
- Protección de zonas privadas: `app/modulos/layout.jsx` redirige a `/login` cuando no hay perfil.

### Contexto global
- Se monta en `app/layout.jsx` con este orden:
  1. `UIConfigProvider`
  2. `ThemeClientWrapper`
  3. `LayoutModeProvider`
  4. `SidebarConfigProvider`
  5. `UserProvider`

### Configuración visual (theme/layout)
- **Theme base**: `SunmiThemeProvider` aplica CSS vars desde `lib/themes/*`.
- **Theme custom runtime**: `ThemeClientWrapper` aplica overrides `--sunmi-*` desde localStorage (`erp-theme-custom`).
- **Tamaño/densidad tipográfica y spacing**: `UIConfigProvider` (preset `tamanoNivel`).
- **Layout perfilado**: `LayoutController` consume `erp-layout-profile` (sidebar/navbar/contentWidth).
- **Sidebar visual**: `SidebarConfigProvider` usa `erp-sidebar-mode` y `erp-sidebar-group`.

---

## 2) Estructura de carpetas (mapa)

```text
app/
  api/                 -> backend HTTP (route handlers)
  context/             -> contexto global de usuario
  login/               -> pantalla pública de autenticación
  modulos/             -> pantallas protegidas del ERP
components/
  apariencia/          -> editores de theme/layout
  layout/              -> controlador central de layout
  providers/           -> providers de configuración UI/layout/sidebar
  sidebar/             -> navegación lateral/superior
  sunmi/               -> design system Sunmi (botones, tablas, cards, etc.)
  [modulo]/            -> componentes específicos por dominio
lib/
  themes/              -> definición de themes base
  mappers/             -> mapeos de entidades (ej: producto)
  *.js                 -> auth, prisma, permisos, utilidades
prisma/
  schema.prisma        -> modelo de datos
  migrations/          -> historial SQL de migraciones
docs/
  *.md                 -> documentación
scripts/
  *.js                 -> validadores, fixes y utilitarios de mantenimiento
configs/
  *.json               -> configuración puntual (ej. usuarios)
styles/
  *.css                -> estilos adicionales (ej. sunmi.css)
```

### Qué guarda cada carpeta importante y qué NO debería guardar

- `app/api`: handlers HTTP por recurso/acción.
  - **No debería** guardar lógica visual ni JSX.
- `app/modulos`: páginas de negocio protegidas.
  - **No debería** guardar SQL directo ni lógica de acceso a DB.
- `components`: bloques UI reutilizables y por módulo.
  - **No debería** contener lógica de persistencia en DB (solo consumo de API).
- `lib`: utilidades transversales (auth, prisma, mappers, helpers).
  - **No debería** contener componentes visuales.
- `prisma`: esquema y migraciones.
  - **No debería** tener código de render ni lógica de UI.
- `scripts`: tareas operativas.
  - **No debería** ser dependencia runtime de pantallas.

---

## 3) Sistema de layout y UI

### LayoutController
- Ruta: `components/layout/LayoutController.jsx`.
- Función: orquestar estructura final (header, sidebar, contenido), según perfil de layout guardado.
- Props: `children`.
- Estado local:
  - `layoutProfile` con `{ sidebarPosition, navbarPosition, contentWidth, contentMode, presetKey }`.
- Persistencia:
  - lee/escribe localStorage `erp-layout-profile`.
  - escucha evento global `erp-layout-profile-updated`.
- Decisiones de render:
  - `sidebarPosition === 'top'` o modo legado `sidebar-top` => renderiza `Header + SidebarTop + main`.
  - caso general => `Header + SidebarPro(left/right/floating) + main`.

### Sidebar / SidebarTop / Header
- `SidebarPro`: sidebar vertical (left/right/floating), soporta modo plano o agrupado y filtra ítems por permisos.
- `SidebarTop`: navegación horizontal cuando layout top está activo.
- `Header`: título contextual según pathname, notificación (icono), menú de usuario y logout.

### Sistema de themes
- `components/sunmi/SunmiThemeProvider.jsx`:
  - maneja `themeKey` y aplica CSS variables del theme seleccionado.
  - persiste theme en `erp-sunmi-theme`.
- `components/sunmi/ThemeClientWrapper.jsx`:
  - aplica overrides avanzados desde `erp-theme-custom`.
- Themes base: `lib/themes/sunmiDark.js`, `sunmiDarkCompact.js`, `sunmiLight.js`.

### LayoutBuilder
- Página: `app/modulos/apariencia/layout-builder/page.jsx`.
- Componente principal: `components/apariencia/LayoutBuilder.jsx`.
- Permite elegir presets de layout y actualizar posiciones de sidebar/navbar + ancho de contenido.
- Guarda configuración en `erp-layout-profile` y dispara evento para refrescar LayoutController.

### Contextos relacionados
- `UIConfigProvider`: helpers de tamaño/espaciado/radios (`ui.helpers.*`).
- `LayoutModeProvider`: modo legado `erp-layout-mode` (`sidebar-left` / `sidebar-top`).
- `SidebarConfigProvider`: modo de sidebar (`icons`, `icons-text`; `grouped`, `flat`).

---

## 4) Sistema de módulos funcionales

## Módulos detectados
- Dashboard
- Usuarios
- Roles
- Locales
- Grupos
- Productos
- Stock locales
- Transferencias
- POS Transferencias
- Proveedores
- Categorías
- Apariencia

A continuación, resumen operativo por módulo:

### Dashboard
- Ruta: `/modulos/dashboard`.
- Componentes: página simple (`app/modulos/dashboard/page.jsx`).
- API consumida: depende de `useUser()` (sesión en contexto).
- Tablas: indirecto via sesión (`Usuario`, `Rol`, `Local`).
- Flujo: carga perfil -> muestra saludo y acceso básico.

### Usuarios
- Ruta: `/modulos/usuarios`.
- Componentes: `components/usuarios/ModalUsuario.jsx`, `SunmiTableUsuarios.jsx`.
- API: `/api/usuarios/listar`, `/api/usuarios/obtener`, `/api/usuarios/crear`, `/api/usuarios/editar/[id]`, `/api/usuarios/eliminar/[id]`, `/api/usuarios/reactivar/[id]`, `/api/usuarios/listarRoles`, `/api/usuarios/listarLocales`.
- Tablas: `Usuario`, `Rol`, `Local`.
- Flujo típico: listar -> abrir modal/edición -> guardar -> refrescar grilla.

### Roles
- Ruta: `/modulos/roles`.
- Componentes: `components/roles/ModalRol.jsx`.
- API: `/api/roles/listar`, `/api/roles/obtener`, `/api/roles/crear`, `/api/roles/editar/[id]`, `/api/roles/eliminar/[id]`.
- Tablas: `Rol`.
- Flujo: ABM de rol con permisos JSON.

### Locales
- Ruta: `/modulos/locales`.
- Componentes: `components/locales/ModalLocal.jsx`, `SunmiTableLocales.jsx`.
- API: `/api/locales`, `/api/locales/listar`, `/api/locales/[id]`, `/api/locales/[id]/grupo`.
- Tablas: `Local`, `GrupoLocal`, `GrupoDeposito`.
- Flujo: alta/edición/baja de locales y asignaciones de grupo.

### Grupos
- Ruta: `/modulos/grupos` y `/modulos/grupos/[id]`.
- Componentes: `ModalGrupo`, `EditorGrupo`, `TablaLocales`, `TablaDepositos`, selects de alta.
- API: `/api/grupos/listar`, `/api/grupos/crear`, `/api/grupos/[id]`, `/api/grupos/[id]/locales`, `/api/grupos/[id]/depositos`, `/api/grupos/[id]/asignar-grupo`.
- Tablas: `Grupo`, `GrupoLocal`, `GrupoDeposito`, `Local`.
- Flujo: crear grupo -> vincular depósitos/locales -> administrar relaciones.

### Productos
- Ruta: `/modulos/productos`, `/modulos/productos/(acciones)/nuevo`, `/modulos/productos/editar/[id]`.
- Componentes: `ModalProductoFinal`, `TablaProductos`, `SunmiTablaProductos`, filtros y selector de local.
- API: `/api/productos/listar`, `/api/productos/obtener`, `/api/productos/crear`, `/api/productos/editar/[id]`, `/api/productos/eliminar/[id]`, catálogos (`/api/catalogos/*`, `/api/categorias/listar`, `/api/proveedores/listar`, `/api/areas-fisicas/listar`).
- Tablas: `ProductoBase`, `ProductoLocal`, `Categoria`, `Proveedor`, `AreaFisica`, `Grupo`, `Local`.
- Flujo: seleccionar local -> listar productos por grupo/local -> crear/editar en modal -> persistir base + override local.

### Stock locales
- Ruta: `/modulos/stock_locales`.
- Componentes: `TablaStock`, `FiltrosStock`, `ModalAjuste`, `ModalLimites`.
- API: `/api/stock_locales/listar`, `/api/stock_locales/ajustar`, `/api/stock_locales/limites`, `/api/stock_locales/importar`, `/api/stock_locales/obtener`, `/api/stock_locales/nuevo`.
- Tablas: `StockLocal`, `ProductoLocal`, `ProductoBase`, `Local`.
- Flujo: filtrar stock -> ajustar cantidades/límites -> confirmar y refrescar.

### Transferencias
- Ruta: `/modulos/transferencias` y `/modulos/transferencias/[id]`.
- Componentes: `TablaTransferencias`, `TablaDetalleTransferencia`, `TransferenciaHeader`, `AccionesRecepcion`.
- API: `/api/transferencias/listar`, `/api/transferencias/detalle`, `/api/transferencias/guardar-recepcion`, `/api/transferencias/confirmar-recepcion`, `/api/transferencias/pdf`, `/api/transferencias/pdf-recepcion`.
- Tablas: `Transferencia`, `TransferenciaDetalle`, `StockLocal`, `ProductoLocal`, `Local`, `Usuario`.
- Flujo: listar -> abrir detalle -> cargar recepción parcial/total -> confirmar recepción (impacta stock origen/destino).

### POS Transferencias
- Ruta: `/modulos/pos-transferencias` y `/modulos/pos-transferencias/nueva`.
- Componentes: carpeta `components/pos-transferencias/nueva/*` (encabezado, filtros, buscador, tablas sugeridos/preparados).
- API: `/api/pos-transferencias/opciones`, `/api/pos-transferencias/nueva`, `/api/pos-transferencias/sugeridos`, `/api/pos-transferencias/detalle`, `/api/pos-transferencias/detalle/agregar`, `/api/pos-transferencias/detalle/editar`, `/api/pos-transferencias/detalle/quitar`, `/api/pos-transferencias/buscarProductos`, `/api/pos-transferencias/agregarItem`, `/api/pos-transferencias/eliminarItem`, `/api/pos-transferencias/enviar`, `/api/pos-transferencias/cancelar`, `/api/pos-transferencias/recibir`, `/api/pos-transferencias/crear`.
- Tablas: `PosTransferencia`, `PosTransferenciaDetalle`, `StockLocal`, `Transferencia` (al enviar/recibir), `ProductoLocal`, `Local`, `Grupo`.
- Flujo: definir origen/destino -> sugerir/preparar items -> editar cantidades -> enviar -> eventualmente recibir.

### Proveedores
- Ruta: `/modulos/proveedores`, `/modulos/proveedores/nuevo`, `/modulos/proveedores/editar`.
- Componentes: `components/proveedores/ModalProveedor.jsx`.
- API: `/api/proveedores/listar`, `/api/proveedores/obtener`, `/api/proveedores/crear`, `/api/proveedores/editar`, `/api/proveedores/eliminar`, `/api/proveedores/opciones`.
- Tablas: `Proveedor`.
- Flujo: listar con filtros -> alta/edición modal -> activación/desactivación.

### Categorías
- Ruta: `/modulos/categorias`.
- Componentes: `components/categorias/ModalCategoria.jsx`.
- API: `/api/categorias/listar`, `/api/categorias/crear`, `/api/categorias/editar`, `/api/categorias/eliminar`.
- Tablas: `Categoria`, relación con `ProductoBase`.
- Flujo: buscar/filtrar -> crear/editar -> eliminar (con validación de uso).

### Apariencia
- Ruta: `/modulos/apariencia`, `/modulos/apariencia/layout-builder`, `/modulos/apariencia/editor`.
- Componentes: `ThemeEditor.jsx`, `LayoutBuilder.jsx`, `Sunmi*`.
- API: no depende de backend para persistencia principal (usa localStorage y CSS vars).
- “Tablas”: no aplica.
- Flujo: elegir preset/theme/layout/sidebar -> guardar en localStorage -> layout se rehidrata automáticamente.

---

## 5) Estilo de código y convenciones

- Lenguaje: **JavaScript/JSX** (no TypeScript).
- Predominio de componentes **client** (`"use client"` en páginas y componentes interactivos).
- API Routes en JS server (`route.js`).
- Convenciones de nombres:
  - Componentes: `PascalCase`.
  - Rutas API: carpeta por recurso + acción (`listar`, `crear`, `editar`, etc.).
  - Variables de tema CSS: prefijo `--sunmi-*`.
- Imports:
  - Se usa alias `@/` (`jsconfig.json`) para rutas absolutas.
- Estado:
  - Local: `useState` + `useEffect` en páginas/modales.
  - Global: Context API (User/UI/Layout/Sidebar/Theme).
  - No se detecta Redux/Zustand.
- Patrón predominante:
  - Página orquestadora (fetch + estado + handlers).
  - Componentes de presentación/entrada (tabla, modal, filtros).
  - API route con validación + Prisma + payload normalizado.

---

## 6) Flujo de datos (texto)

Flujo general:

1. **Usuario** interactúa con una pantalla (ej. `app/modulos/productos/page.jsx`).
2. La **pantalla/componente** dispara `fetch('/api/...')` (GET/POST/PUT/DELETE).
3. La **API Route** valida sesión (si aplica), parámetros y reglas de negocio.
4. La API llama a **Prisma** (`lib/prisma.js`) para consultar o mutar PostgreSQL.
5. Prisma impacta/lee en **DB** según `prisma/schema.prisma`.
6. La API devuelve **JSON** (o PDF en endpoints de transferencias).
7. El frontend actualiza estado local (`useState`) y re-renderiza la **UI**.

Flujo de autenticación:
- Login -> `/api/login` -> cookie JWT `erpazul_sesion` -> `/api/me` en `UserContext` -> páginas protegidas bajo `app/modulos/layout.jsx`.

Flujo visual (layout/theme):
- Usuario cambia apariencia -> providers escriben localStorage -> `LayoutController` y `SunmiThemeProvider` releen/configuran -> UI cambia sin roundtrip al backend.

---

## 7) Puntos sensibles detectados

### Archivos muy grandes (alta complejidad)
- `components/apariencia/ThemeEditor.jsx` (~655 líneas).
- `components/productos/ModalProductoFinal.jsx` (~544 líneas).
- `app/modulos/pos-transferencias/page.jsx` (~528 líneas).
- `components/apariencia/LayoutBuilder.jsx` (~453 líneas).
- `app/modulos/proveedores/page.jsx` (~451 líneas).
- `app/modulos/grupos/page.jsx` (~444 líneas).

### Lógica acoplada / frágil
- Varias páginas mezclan: fetch, mapeo, validación, UI, modales y paginación en un solo archivo.
- Dependencia fuerte de claves de localStorage (`erp-layout-profile`, `erp-sunmi-theme`, `erp-sidebar-*`, etc.).
- Reglas de permisos y perfil parcialmente distribuidas entre frontend (`Sidebar*`, `UserContext`) y backend (rutas API).
- Inconsistencias potenciales de rutas de logout:
  - `UserContext.logout` usa `/api/auth/logout` pero la ruta existente es `/api/logout`.
- Inconsistencias puntuales en endpoints de productos:
  - existen llamados frontend a `/api/productos/${id}` en edición, mientras la estructura principal de rutas visibles incluye `/api/productos/obtener` y `/api/productos/editar/[id]`.

### Riesgos al modificar
- Cambios en modelo de permisos impactan navegación y autorización API.
- Cambios en estructura de `layoutProfile` pueden romper render dinámico de `LayoutController`.
- Cambios en `ProductoBase`/`ProductoLocal` afectan listados, edición, stock y transferencias.
- Módulo transferencias/POS toca stock y estados; cualquier ajuste requiere validar consistencia transaccional.

---

## 8) Resumen ejecutivo

Este sistema es un **ERP para operación de minimarket/multi-local** con foco fuerte en inventario, transferencias entre depósito-local y administración de catálogo. Está construido con **Next.js App Router + React + Prisma/PostgreSQL**, con autenticación **JWT en cookie HttpOnly** y un sistema visual propio **Sunmi** altamente configurable por localStorage.

Las partes críticas para trabajar con seguridad son:
1. **Autenticación/sesión y permisos** (contexto + API).
2. **Módulos de stock/transferencias/POS** (impactan cantidades reales).
3. **Layout/theme providers** (afectan experiencia global de toda la app).
4. **Modelo de datos Prisma** (base de verdad de relaciones de negocio).

Para intervenir de forma segura conviene primero seguir flujo completo pantalla→API→DB del módulo puntual, validar permisos efectivos por tipo de usuario y revisar el impacto cruzado en `ProductoLocal`, `StockLocal`, `Transferencia*` y `PosTransferencia*`.