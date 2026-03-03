# Auditoría: Sistema de Módulos y Permisos (RBAC) — ERP Azul

**Objetivo:** Detectar por qué los módulos creados recientemente NO aparecen en el sistema de permisos editable y proponer una arquitectura única.

---

## 1. MAPEO DE MÓDULOS REALES

Rutas reales bajo `app/modulos/**/page.jsx` (y `app/inicio`, `app/login`). Se consideran **módulos funcionales** las páginas que son entrada a una sección (no solo detalle/edición de un recurso).

### Rutas que son entrada de módulo (carpeta base o primera página del flujo)

| Ruta (app) | Nombre módulo inferido | Carpeta base |
|------------|------------------------|--------------|
| `app/inicio/page.jsx` | Inicio / Selector contexto | `inicio` |
| `app/login/page.jsx` | Login | `login` |
| `app/modulos/page.jsx` | Redirección módulos | `modulos` |
| `app/modulos/dashboard/page.jsx` | Dashboard | `modulos/dashboard` |
| `app/modulos/pos-ventas/page.jsx` | POS Ventas | `modulos/pos-ventas` |
| `app/modulos/pedidos/page.jsx` | Pedidos (catálogo) | `modulos/pedidos` |
| `app/modulos/pedidos/historial/page.jsx` | Historial Pedidos | `modulos/pedidos` |
| `app/modulos/reportes-ventas/page.jsx` | Reportes Ventas | `modulos/reportes-ventas` |
| `app/modulos/clientes/page.jsx` | Clientes | `modulos/clientes` |
| `app/modulos/clientes/analytics/page.jsx` | Clientes Analytics | `modulos/clientes` |
| `app/modulos/clientes/[id]/page.jsx` | Detalle cliente | `modulos/clientes` |
| `app/modulos/productos/page.jsx` | Productos | `modulos/productos` |
| `app/modulos/productos/nuevo/page.jsx` | Nuevo producto | `modulos/productos` |
| `app/modulos/productos/[id]/editar/page.jsx` | Editar producto | `modulos/productos` |
| `app/modulos/productos/actualizacion-precios/page.jsx` | Actualización precios | `modulos/productos` |
| `app/modulos/categorias/page.jsx` | Categorías | `modulos/categorias` |
| `app/modulos/proveedores/page.jsx` | Proveedores | `modulos/proveedores` |
| `app/modulos/proveedores/nuevo/page.jsx` | Nuevo proveedor | `modulos/proveedores` |
| `app/modulos/proveedores/editar/page.jsx` | Editar proveedor | `modulos/proveedores` |
| `app/modulos/locales/page.jsx` | Locales | `modulos/locales` |
| `app/modulos/locales/(acciones)/nuevo/page.jsx` | Nuevo local | `modulos/locales` |
| `app/modulos/locales/editar/[id]/page.jsx` | Editar local | `modulos/locales` |
| `app/modulos/grupos/page.jsx` | Grupos | `modulos/grupos` |
| `app/modulos/grupos/nuevo/page.jsx` | Nuevo grupo | `modulos/grupos` |
| `app/modulos/grupos/[id]/page.jsx` | Editar grupo | `modulos/grupos` |
| `app/modulos/stock_locales/page.jsx` | Stock Locales | `modulos/stock_locales` |
| `app/modulos/pos-transferencias/page.jsx` | POS Transferencias | `modulos/pos-transferencias` |
| `app/modulos/pos-transferencias/nueva/page.jsx` | Nueva POS transferencia | `modulos/pos-transferencias` |
| `app/modulos/transferencias/page.jsx` | Transferencias | `modulos/transferencias` |
| `app/modulos/transferencias/[id]/page.jsx` | Detalle transferencia | `modulos/transferencias` |
| `app/modulos/compras-proveedor/page.jsx` | Compras a Proveedor | `modulos/compras-proveedor` |
| `app/modulos/compras-proveedor/nueva/page.jsx` | Nueva compra | `modulos/compras-proveedor` |
| `app/modulos/compras-proveedor/[id]/page.jsx` | Detalle pedido proveedor | `modulos/compras-proveedor` |
| `app/modulos/compras-proveedor/ganancia/page.jsx` | Ganancia depósito | `modulos/compras-proveedor` |
| `app/modulos/usuarios/page.jsx` | Usuarios | `modulos/usuarios` |
| `app/modulos/usuarios/editar/[id]/page.jsx` | Editar usuario | `modulos/usuarios` |
| `app/modulos/usuarios/(acciones)/nuevo/page.jsx` | Nuevo usuario | `modulos/usuarios` |
| `app/modulos/roles/page.jsx` | Roles | `modulos/roles` |
| `app/modulos/roles/nuevo/page.jsx` | Nuevo rol | `modulos/roles` |
| `app/modulos/roles/editar/[id]/page.jsx` | Redirige a roles?editar= | `modulos/roles` |
| `app/modulos/configuracion/apariencia/page.jsx` | Configuración / Apariencia | `modulos/configuracion` |
| `app/modulos/fidelidad/page.jsx` | Fidelidad | `modulos/fidelidad` |

**Rutas referenciadas en el menú pero sin página existente:**

- `/modulos/faltantes` → no existe `app/modulos/faltantes/**/page.jsx`
- `/modulos/combos` → no existe `app/modulos/combos/**/page.jsx`
- `/modulos/areas` → no existe `app/modulos/areas/**/page.jsx`

---

## 2. MAPEO DEL SIDEBAR / MENÚ

### Dónde se define el menú

- **Archivo único:** `lib/menuConfig.js`
- **Exporta:** `MENU_CONFIG` (array de grupos) y `buildVisibleMenu(menuConfig, perfil)`.

### Estructura del array

Cada grupo tiene:

- `key`: string (ej. `"inicio"`, `"pos-ventas"`, `"stock"`).
- `label`: string para la UI.
- `icon` / `iconFilled`: componentes Lucide.
- `items`: array de `{ label, href, permiso? }`.
- Opcionales: `requiredAnyPerms`, `adminOnly`, `localOnly`, `depositoOnly`, `requiredAllPerms`.

Cada ítem puede tener `permiso` (string) para filtrar por permiso individual además del grupo.

### Quién consume el menú

| Consumidor | Archivo | Uso |
|------------|---------|-----|
| Sidebar (desktop) | `components/sidebar/SidebarPro.jsx` | `buildVisibleMenu(MENU_CONFIG, perfil)` → menú lateral |
| Layout + móvil | `components/LayoutBase.jsx` | `buildVisibleMenu(MENU_CONFIG, perfil)` → pasa `menu` a `MobileNav` |
| Mobile drawer | `components/layout/MobileNav.jsx` | Recibe `menu` ya filtrado y renderiza el drawer "Más" |

No hay otro array de menú para la barra lateral: **la fuente única del menú navegable es `lib/menuConfig.js`**.

### Duplicación parcial

- **TopbarNav** (`components/layout/TopbarNav.jsx`) define su propio array `TOPBAR_SHORTCUTS` (Inicio, POS Ventas, Stock, Config) con las mismas rutas que el menú pero **no** lee de `MENU_CONFIG`. Es una lista corta hardcodeada para la barra superior desktop, no para permisos.

---

## 3. MAPEO DEL SISTEMA DE PERMISOS

### Modelo Prisma

- **Tabla:** `Rol`
  - `id`, `nombre` (unique), `permisos` (Json, default `'[]'`), `createdAt`, `updatedAt`.
- **Relación:** `Usuario.rolId` → `Rol`. Los permisos del usuario son los del rol (no se guardan en Usuario).
- No existe tabla "Módulo" ni "Permiso" como entidad; los permisos son un **array de strings** en JSON (ej. `["stock.ver", "productos.editar"]` o `["*"]`).

### APIs involucradas

| Endpoint | Uso |
|----------|-----|
| `GET /api/roles/listar` | Lista roles (Prisma `rol.findMany`). No define lista de permisos. |
| `GET /api/roles/obtener?id=` | Devuelve un rol (incluye `permisos` tal cual en DB). |
| `POST /api/roles/crear` | Crea rol; body incluye `permisos` (array). |
| `PUT /api/roles/editar/[id]` | Actualiza rol; body puede incluir `permisos` (array). |
| `DELETE /api/roles/eliminar/[id]` | Elimina rol. |
| `GET /api/me` | Devuelve usuario + permisos del rol (para sesión). |

La lista de permisos **posibles** (qué se puede marcar en la UI) no viene de ninguna API: es fija en frontend.

### Dónde se define la lista editable de permisos

- **Archivo:** `lib/permisos.js`
- **Exporta:** `PERMISOS`, un objeto `{ grupo: string → array de strings }`, por ejemplo:
  - `productos`, `clientes`, `stock`, `transferencias`, `pos`, `pedidos`, `pos_transferencias`, `compras`, `proveedores`, `usuarios`, `roles`, `reportes`.

### Quién usa esa lista

- **Modal de rol:** `components/roles/ModalRol.jsx` importa `PERMISOS` de `@/lib/permisos` y renderiza los checkboxes por grupo. **Solo esa lista** determina qué permisos se pueden asignar a un rol.

### Cómo se validan los permisos

- **Backend:** En cada route se obtiene sesión con `getUsuarioSession(req)` (`lib/auth.js`). La sesión incluye `permisos` (array) y `esAdmin` (true si `permisos` incluye `"*"`). Las rutas comprueban `permisos.includes("permiso.x")` o `esAdmin` (a veces ambas). No hay un único helper en todas las rutas; hay lógica repetida.
- **Frontend:** Páginas usan `useUser()` (perfil con permisos) y comprueban `perfil?.permisos` + `SinPermisos` para ocultar/bloquear acceso.
- **Helper opcional:** `lib/authorize.js` exporta `requirePerm(req, perm)` y `checkPerm(session, perm)`; no todas las APIs lo usan.

### Clasificación del sistema actual

| Aspecto | Estado |
|---------|--------|
| **Lista de permisos mostrada al editar rol** | **A) Hardcodeada** en `lib/permisos.js`. |
| **Valor guardado por rol** | **B) Almacenado en DB** (campo `Rol.permisos` JSON). |
| **Uso en menú** | **C) Dinámico** según perfil: `buildVisibleMenu(MENU_CONFIG, perfil)` usa `requiredAnyPerms` y `item.permiso` de `menuConfig.js`. |
| **Uso en APIs** | **D) Mezclado:** cada API hardcodea el string de permiso que comprueba (ej. `"stock.ver"`, `"productos.importar"`); no hay un registro central que relacione ruta ↔ permiso. |

**Conclusión:** Los permisos **editables** en la pantalla de roles vienen de **una sola fuente estática** (`lib/permisos.js`). Esa fuente **no** se deriva de `MENU_CONFIG` ni de las rutas reales, por eso los módulos/nuevos permisos creados después (o usados solo en menú/API) no aparecen en el sistema de permisos editable.

---

## 4. DESINCRONIZACIÓN

### 4.1 Módulos reales vs menú (`MENU_CONFIG`)

- **En menú pero sin ruta:**  
  - Faltantes (`/modulos/faltantes`), Combos (`/modulos/combos`), Áreas Físicas (`/modulos/areas`).
- **Con ruta pero no en menú:**  
  - Fidelidad (`/modulos/fidelidad`) existe como página pero **no** está en `MENU_CONFIG` (acceso solo por URL o otro enlace; admin-only en página).
- **Actualización precios:** en menú no aparece como ítem; la ruta existe bajo productos.

### 4.2 Menú vs permisos editables (`lib/permisos.js`)

Permisos que **aparecen en menú** (requiredAnyPerms o item.permiso) pero que pueden no estar o estar incompletos en `lib/permisos.js`:

- `menuConfig` usa: `pos.usar`, `pedidos.ver`, `reportes.ver`, `clientes.ver`, `productos.ver`, `proveedores.ver`, `stock.ver`, `pos_transferencias.ver`, `transferencias.crear`, `compras.ver`, `usuarios.ver`, `roles.editar`, y adminOnly para estructura y configuración.
- `lib/permisos.js` tiene grupos y strings; **faltan** al menos:
  - `stock.editar` (usado en APIs stock_locales/ajustar y stock_locales/limites).
  - `productos.importar` (usado en API stock_locales/importar).

Otros usados en código pero a verificar en `PERMISOS`: `transferencias.recibir`, `pos.anular` están en `lib/permisos.js`; no hay evidencia de uso en APIs en la búsqueda, pero sí en la lista editable.

### 4.3 Resumen desincronización

| Fuente | Qué define | Desincronizado con |
|--------|------------|--------------------|
| **Rutas reales** (`app/modulos/...`) | Qué módulos existen | Menú: enlaces a faltantes/combos/areas sin página. Menú: falta fidelidad (y posiblemente actualizacion-precios). |
| **MENU_CONFIG** (`lib/menuConfig.js`) | Qué se muestra en sidebar/drawer y con qué permiso | Permisos editables: la lista en `lib/permisos.js` es independiente; faltan permisos usados en backend (ej. stock.editar, productos.importar). |
| **lib/permisos.js** | Qué se puede asignar a un rol en la UI | Menú y APIs: no incluye todos los permisos que el menú y las APIs ya usan; nuevos permisos añadidos en código no se reflejan aquí. |

**Causa raíz del bug:** La pantalla de edición de roles usa **exclusivamente** `lib/permisos.js` para mostrar los checkboxes. Ese archivo es **manual y estático**. No hay ningún proceso que lo actualice cuando se añaden módulos en `menuConfig.js` o cuando se añaden comprobaciones de permisos en APIs o páginas. Por tanto, **módulos y permisos creados o usados recientemente no aparecen** en el sistema de permisos editable.

---

## 5. PROPUESTA DE SOLUCIÓN ARQUITECTÓNICA

### 5.1 Objetivo

Una **única fuente de verdad** para “qué módulos/permisos existen” que alimente:

- El menú (sidebar + móvil).
- La lista de permisos en la edición de roles.
- (Opcional) Validaciones backend de forma consistente.

Sin romper el comportamiento actual: mismos permisos en DB, misma semántica de `"*"` y mismos checks en APIs/páginas.

### 5.2 Registro central de módulos y permisos

- **Crear** un único módulo de configuración (por ejemplo `lib/modulosPermisos.js` o ampliar `lib/menuConfig.js` con una capa de “registro de permisos”) que:
  - Defina **todos los permisos** del sistema como lista plana o por grupo, con etiqueta y opcionalmente módulo/ruta asociada.
  - Opcionalmente defina **módulos** (ruta base, nombre, permisos necesarios para ver/uso).
- **Regla:** Todo permiso que se use en `menuConfig` (requiredAnyPerms, item.permiso) o en cualquier API/página debe estar declarado en ese registro. El registro es la única lista “oficial” de códigos de permiso.

Opciones concretas:

- **Opción A – Un solo archivo ampliado:**  
  En `lib/menuConfig.js` (o un nuevo `lib/registroModulos.js`):
  - Mantener o refactorizar `MENU_CONFIG` para que cada grupo/ítem use **solo** códigos de permiso que vengan de una lista exportada en el mismo archivo, por ejemplo `LISTA_PERMISOS` (array de `{ codigo, label, grupo? }`).
  - Exportar `LISTA_PERMISOS` (o estructura equivalente) para que la use la UI de roles.
- **Opción B – Archivo de permisos derivado del menú:**  
  Mantener `lib/permisos.js` pero **generar su contenido** a partir de `menuConfig` + una lista explícita de “permisos solo de API” (ej. `stock.editar`, `productos.importar`). Eso podría ser un script de build que escriba `lib/permisos.generated.js` o que rellene la estructura que hoy tiene `PERMISOS`.

Recomendación: **Opción A** con un único archivo (o dos: `menuConfig.js` + `registroPermisos.js` que exporte la lista de permisos y que `menuConfig` importe). Así, al añadir un módulo o un permiso en el menú, se añade en el mismo lugar (o en el registro importado) y automáticamente aparece en la edición de roles si la UI se cambia para leer de ese registro.

### 5.3 Archivos a crear o modificar (sin implementar aún)

| Acción | Archivo | Cambio |
|--------|---------|--------|
| Crear o ampliar | `lib/registroModulos.js` (o `lib/modulosPermisos.js`) | Definir lista única de permisos (codigo, label, grupo) y opcionalmente módulos; exportar algo como `LISTA_PERMISOS` / `PERMISOS_POR_GRUPO` para la UI de roles. |
| Modificar | `lib/menuConfig.js` | Asegurar que todos los `requiredAnyPerms` e `item.permiso` usen **solo** códigos definidos en el registro central. Opcional: importar lista de permisos desde el registro para no duplicar strings. |
| Modificar | `lib/permisos.js` | Dejar de definir la lista a mano; **re-exportar** o **generar** la estructura `PERMISOS` (grupo → array de códigos) desde el registro central, para no romper `ModalRol.jsx`. |
| Modificar | `components/roles/ModalRol.jsx` | Sin cambio de interfaz; si `lib/permisos.js` pasa a exportar la misma estructura pero desde el registro, no haría falta tocar el componente. Si se prefiere, hacer que lea directamente del nuevo registro (ej. `LISTA_PERMISOS` o `PERMISOS_POR_GRUPO`). |
| Revisar | APIs y páginas que comprueban permisos | A medio plazo, que los strings usados en `permisos.includes("...")` estén documentados o referenciados desde el registro (o un mapa ruta → permiso) para evitar nuevos desajustes. No obligatorio cambiar toda la lógica de golpe. |
| Opcional | `components/layout/TopbarNav.jsx` | Hacer que los atajos (Inicio, POS, Stock, Config) se deriven de `MENU_CONFIG` o del registro, para evitar duplicar rutas. |

No se propone (por ahora) cambiar el modelo Prisma ni la forma en que se guardan los roles (siguen siendo array de strings en JSON).

### 5.4 Flujo deseado después del cambio

1. Se añade un **nuevo módulo** o un **nuevo permiso** en el **registro central** (y, si aplica, en `MENU_CONFIG` usando solo códigos del registro).
2. El **menú** sigue usando `buildVisibleMenu(MENU_CONFIG, perfil)` (sin cambio conceptual).
3. La **pantalla de edición de roles** muestra todos los permisos del registro (leyendo desde `lib/permisos.js` reexportado o desde el registro).
4. Las **APIs** siguen comprobando `session.permisos.includes("permiso.x")`; se recomienda que ese string exista en el registro para que sea asignable desde la UI.

Con esto se elimina la desincronización entre “módulos/permisos que existen en el sistema” y “permisos que se pueden asignar en la pantalla de roles”.

---

## 6. RESUMEN EJECUTIVO

- **Módulos reales:** ~40 rutas bajo `app/modulos` (y inicio/login); 3 rutas del menú (faltantes, combos, areas) no existen; Fidelidad existe pero no está en el menú.
- **Menú:** Fuente única en `lib/menuConfig.js` (`MENU_CONFIG` + `buildVisibleMenu`); consumido por SidebarPro, LayoutBase y MobileNav. TopbarNav tiene su propia lista corta de atajos.
- **Permisos:** Guardados en DB en `Rol.permisos` (JSON array). La **lista editable** en la UI de roles sale **solo** de `lib/permisos.js`, que es estática e independiente del menú y de las APIs.
- **Problema:** Los módulos/permisos nuevos o usados solo en menú/API no se añaden a `lib/permisos.js`, por eso **no aparecen** en el sistema de permisos editable.
- **Solución propuesta:** Registro central de permisos (y opcionalmente módulos) que alimente menú, lista de permisos en roles y, a futuro, documentación de qué API usa qué permiso. Un solo archivo (o dos) como fuente; `lib/permisos.js` y/o `ModalRol` leer de ahí para que la pantalla de roles muestre siempre todos los permisos definidos en el sistema.
