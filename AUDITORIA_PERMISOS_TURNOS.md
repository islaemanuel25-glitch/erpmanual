# Auditoría: Permisos existentes (Rol.permisos) para módulo Turnos

**Contexto:** Usuario → Rol (permisos Json). No existe `Usuario.esAdmin`; “admin” se deriva de `permisos` incluyendo `"*"`.

**Tarea:** Confirmar dónde y cómo se validan permisos, listar los usados hoy y recomendar cuál usar para (A) ver solo turnos propios y (B) ver todos los turnos del local.

---

## 1) Función / middleware que valida permisos por Rol.permisos

### Archivo principal: `lib/authorize.js`

| Función | Uso | Retorno |
|--------|-----|--------|
| **requirePerm(req, perm)** | En APIs: obtiene sesión del request y valida que el usuario tenga el permiso `perm`. | `{ ok: true, session }` o `{ ok: false, status: 401|403, error }` |
| **checkPerm(session, perm)** | Cuando ya tenés la sesión (ej. de `resolveLocalAndGrupo` o `getUsuarioSession`): valida permiso contra esa sesión. | `{ ok: true }` o `{ ok: false, status: 401|403, error }` |
| **requireAuth(req)** | Solo exige sesión válida, sin permiso granular. | `{ ok: true, session }` o `{ ok: false, status: 401, error }` |
| **requireAdmin(req)** | Exige sesión + que sea “admin” (permisos incluye `"*"`). | `{ ok: true, session }` o `{ ok: false, status: 401|403, error }` |

Lógica de permiso en `requirePerm` y `checkPerm`:

- Si no hay sesión → 401.
- Si `session.esAdmin === true` **o** `session.permisos.includes(perm)` → ok.
- Si no → 403 con mensaje `Sin permiso: ${perm}`.

`session.esAdmin` no viene de la base de datos: se calcula en `lib/auth.js` al parsear el token:

- `getUsuarioSession(req)` → verifica JWT, decodifica payload.
- `session.permisos = data.permisos` (array que en login se llenó desde `user.rol.permisos`).
- `session.esAdmin = permisos.includes("*")`.

Resumen: **la validación por Rol.permisos se hace en `lib/authorize.js`** con `requirePerm` (desde request) o `checkPerm` (desde sesión ya obtenida). No hay middleware global; cada ruta llama a una de estas funciones.

---

## 2) Archivos, nombres de función y ejemplos

### Archivos donde vive la lógica

| Archivo | Qué hace |
|---------|----------|
| **lib/authorize.js** | Define `requirePerm`, `checkPerm`, `requireAuth`, `requireAdmin`. |
| **lib/auth.js** | `getUsuarioSession(req)` devuelve `{ id, rolId, localId, permisos, esAdmin, ... }`. `permisos` y `esAdmin` vienen del token (en login se cargaron desde `Rol.permisos`). |
| **app/api/login/route.js** | Al hacer login, lee `user.rol.permisos` y lo pone en el payload del JWT. Si el rol no tiene permisos, usa `["*"]` (líneas 61-62). |
| **lib/rbac/registry.js** | Registro declarativo de códigos de permiso (labels, grupos). Usado por la UI de edición de roles; las APIs no lo usan para validar, solo para listar opciones. |
| **lib/menuConfig.js** | Menú por permisos: `requiredAnyPerms`, `requiredAllPerms`, `item.permiso`. `buildVisibleMenu(menuConfig, perfil)` filtra por `perfil.permisos` y `*`. |

### Ejemplos de uso en endpoints

**Ejemplo 1 – requirePerm (API que no necesita scope local/grupo):**

```js
// app/api/pos-ventas/crear/route.js
import { requirePerm } from "@/lib/authorize";

export async function POST(req) {
  const perm = requirePerm(req, "pos.usar");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
  const session = perm.session;
  // ... crear venta
}
```

**Ejemplo 2 – checkPerm (cuando ya tenés session, ej. de resolveLocalAndGrupo):**

```js
// app/api/productos/editar/[id]/route.js
import { checkPerm } from "@/lib/authorize";

// session obtenida antes (ej. de getUsuarioSession o scope)
const perm = checkPerm(session, "productos.editar");
if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
```

**Ejemplo 3 – Manual (sin authorize.js):**

```js
// app/api/pedidos/catalogo/route.js
const permisos = Array.isArray(session.permisos) ? session.permisos : [];
if (!permisos.includes("*") && !permisos.includes("pedidos.ver")) {
  return NextResponse.json({ ok: false, error: "Sin permiso" }, { status: 403 });
}
```

**Ejemplo 4 – UI (página de módulo):**

```js
// app/modulos/reportes-ventas/page.jsx
const permisosR = perfil?.permisos || [];
const esAdminR = Array.isArray(permisosR) && permisosR.includes("*");
if (!esAdminR && !permisosR.includes("reportes.ver")) return <SinPermisos />;
```

---

## 3) Nombres reales de permisos usados hoy (strings)

Extraídos de código y de `lib/rbac/registry.js`:

| Permiso | Uso típico |
|---------|------------|
| `*` | Admin global: bypass de cualquier permiso granular. |
| **POS** | |
| `pos.usar` | Usar POS (crear ventas, abrir/cerrar turno). |
| `pos.anular` | Anular venta (registrado en registry; no hay flujo de anulación implementado aún). |
| **Reportes** | |
| `reportes.ver` | Ver reportes (ej. reportes-ventas). |
| **Pedidos** | |
| `pedidos.ver` | Ver pedidos / catálogo / historial. |
| `pedidos.editar` | Editar pedidos, set-cantidad; cancelar POS transferencia. |
| `pedidos.solicitar` | Solicitar pedidos (pos-transferencias). |
| **Stock y transferencias** | |
| `stock.ver` | Ver stock locales. |
| `stock.editar` | Ajustar, importar, límites, nuevo stock. |
| `transferencias.crear` | Crear transferencias. |
| `transferencias.recibir` | Recibir/confirmar transferencias. |
| **POS Transferencias** | |
| `pos_transferencias.ver` | Ver módulo POS transferencias. |
| `pos_transferencias.enviar` | Enviar (usado en lógica interna junto con `*`). |
| **Clientes** | |
| `clientes.ver`, `clientes.crear`, `clientes.editar`, `clientes.eliminar` | CRUD clientes. |
| `clientes.puntos.ver`, `clientes.puntos.canjear` | Puntos. |
| `clientes.cc.ver`, `clientes.cc.pagar`, `clientes.cc.ajustar` | Cuenta corriente. |
| **Productos** | |
| `productos.ver`, `productos.crear`, `productos.editar`, `productos.eliminar`, `productos.importar` | Productos y precios. |
| **Compras** | |
| `compras.ver`, `compras.crear` | Compras a proveedor. |
| **Proveedores** | |
| `proveedores.ver` | Ver proveedores. |
| **Usuarios y roles** | |
| `usuarios.ver`, `usuarios.editar`, `usuarios.eliminar` | Usuarios. |
| `roles.editar` | Editar roles (y listar roles con requireAdmin). |

No existe en el código ni en el registry ningún permiso de la forma `turnos.*`.

---

## 4) Permiso para el módulo Turnos

### A) Ver solo turnos propios (cajero)

- Quien usa el POS ya tiene **`pos.usar`** y hoy solo puede abrir/cerrar su propio turno (por diseño: un turno abierto por usuario por local).
- Para la **lista/detalle de turnos** con alcance “solo los míos”, se puede:
  - **Opción 1 – Reutilizar `pos.usar`:** Quien tiene `pos.usar` puede entrar al módulo Turnos y la API de listado, si no tiene permiso de “ver todos”, filtra por `vendedorId = session.id`. No hace falta un permiso nuevo para “ver turnos propios”.
  - **Opción 2 – Nuevo permiso:** Crear `turnos.ver` y usarlo como “puede ver turnos (por defecto solo propios)”. Quien tiene `pos.usar` pero no `turnos.ver` no vería la pantalla Turnos; quien tiene `turnos.ver` vería solo los suyos a menos que además tenga “ver todos”.

**Recomendación:** Usar **`pos.usar`** para permitir acceso al módulo Turnos cuando el alcance es “solo mis turnos”. Quien puede usar el POS puede ver sus propios turnos. En el endpoint de listado (ej. `GET /api/pos-ventas/turnos/listar`), si el usuario **no** tiene el permiso de “ver todos” (ver B), filtrar por `vendedorId = session.id`.

### B) Ver todos los turnos del local (admin/encargado)

- No existe hoy un permiso que signifique “ver todos los turnos del local”.
- **Recomendación:** Crear **`turnos.ver_todos`** (o `turnos.ver_local`) y usarlo así:
  - En **listar turnos:** si el usuario tiene `turnos.ver_todos` (o `*`), no filtrar por vendedor y devolver todos los turnos del local; si no, filtrar por `vendedorId = session.id`.
  - En **detalle de turno:** si el turno es del mismo usuario, permitir siempre (con `pos.usar` o `turnos.ver`). Si el turno es de otro, exigir `turnos.ver_todos` (o `*`) y que el turno sea del mismo local que el usuario.

Alternativa de nombres ya usados en el proyecto:
- **`reportes.ver`:** Da acceso a reportes por fechas; no implica “ver por cajero/turno”. No describe “ver todos los turnos del local”, por lo que no se recomienda reutilizarlo para B.
- **`*`:** Ya da acceso a todo; no hace falta nuevo permiso para admin.

Resumen recomendado:

| Rol | Permisos a asignar | Comportamiento en Turnos |
|-----|--------------------|---------------------------|
| Cajero | `pos.usar` | Entra a Turnos; ve solo sus turnos (lista y detalle). |
| Encargado / Admin local | `pos.usar` + **`turnos.ver_todos`** | Ve todos los turnos del local. |
| Admin global | `*` | Ve todo (mismo comportamiento que turnos.ver_todos a nivel local). |

### Registro de permisos nuevos (opcional)

Si se agrega **`turnos.ver_todos`**, conviene registrarlo en **`lib/rbac/registry.js`** dentro del grupo `turnos` (y, si se usa, un `turnos.ver` para “ver turnos propios” explícito):

- `turnos.ver` — Ver mis turnos (opcional; alternativa: solo `pos.usar`).
- `turnos.ver_todos` — Ver todos los turnos del local.

Así la pantalla de edición de roles puede mostrar estas opciones y asignarlas a cada rol.

---

## 5) Resumen

- **Validación:** En **`lib/authorize.js`** con **`requirePerm(req, perm)`** o **`checkPerm(session, perm)`**. Sesión viene de JWT; `permisos` y `esAdmin` se cargan en login desde **Rol.permisos** (y `esAdmin = permisos.includes("*")` en auth).
- **Permisos actuales:** Los listados en la tabla de la sección 3; no hay ninguno `turnos.*`.
- **A) Solo turnos propios:** Usar **`pos.usar`** para acceder al módulo y en la API filtrar por `vendedorId = session.id` cuando el usuario no tenga permiso de “ver todos”.
- **B) Todos los turnos del local:** Crear **`turnos.ver_todos`** (o `turnos.ver_local`) y en listado/detalle permitir ver turnos de otros solo si tiene este permiso (o `*`), respetando siempre el local del usuario.

No se ha escrito código; solo auditoría y recomendación.
