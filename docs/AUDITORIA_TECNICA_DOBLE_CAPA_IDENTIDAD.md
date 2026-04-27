# AUDITORÍA TÉCNICA — DOBLE CAPA DE IDENTIDAD (ACCESO vs OPERADOR)

**Proyecto:** ERP Azul · Next.js App Router  
**Alcance:** solo auditoría y diseño técnico — **sin implementación**  
**Fecha de lectura del repo:** según estado actual del código citado  

---

## 1. MAPA ACTUAL DE AUTENTICACIÓN

### Rutas de login actuales

| Ruta | Archivo | Comportamiento |
|------|---------|----------------|
| UI login | `app/login/page.jsx` | Formulario email + contraseña → `POST /api/login` → `refrescar()` → redirect `/modulos/dashboard` |
| API login | `app/api/login/route.js` | Valida `Usuario` por `email`, `bcrypt`, arma JWT y setea cookie `erpazul_sesion` |

**No existe** en el repo (verificado con búsqueda): carpeta `app/api/auth/*`, ni `middleware.ts` / `middleware.js` en la raíz del proyecto.

### Providers / sesión

| Pieza | Archivo | Rol |
|-------|---------|-----|
| Cookie de sesión | `lib/auth.js` | Nombre `erpazul_sesion`, JWT vía `jsonwebtoken`, `AUTH_SECRET`, `httpOnly`, `maxAge` 8h |
| Payload JWT | `app/api/login/route.js` | `id`, `nombre`, `email`, `rolId`, `rolNombre`, `permisos`, `localId`, `esDeposito` |
| Cookie grupo activo | `lib/auth.js` | `erpazul_grupo_activo` (admin padre) — leída en `getUsuarioSession` |
| Cookie contexto local | `lib/contexto.js` | `erpazul_contexto_activo` — JSON `{ localId, esDeposito }` para admin sin `localId` en JWT |
| Cliente | `app/context/UserContext.jsx` | `GET /api/me` para perfil; `logout` llama **`/api/auth/logout`** (ver nota de inconsistencia abajo) |

**Inconsistencia detectada:** `UserContext.jsx` usa `fetch("/api/auth/logout")` pero la ruta existente es **`app/api/logout/route.js`** → **`POST /api/logout`**. No hay `app/api/auth/logout` en el árbol. La documentación en `docs/02-AUTH.md` menciona `/api/logout`. Esto es un **riesgo operativo** del código actual, ajeno a la doble capa pero relevante al tocar auth.

### Middleware / guards

- **No hay Next.js middleware** global para proteger rutas por cookie.
- **Guards en API:** patrón habitual `getUsuarioSession(req)` (`lib/auth.js`) y/o `requirePerm` / `requireAuth` / `requireAdmin` (`lib/authorize.js`), y a veces `resolveLocalAndGrupo` (`lib/grupos.js`).

### Cómo se resuelve hoy el usuario autenticado

1. Request lleva cookie `erpazul_sesion`.
2. `getTokenFromRequest` + `verificarToken` → payload JWT.
3. `getUsuarioSession` normaliza `localId`, `permisos`, `esAdmin`, `grupoId` (desde cookie de grupo si admin).

**Frontend:** `useUser()` → `/api/me` relee el JWT y enriquece `esDeposito` desde `prisma.local`.

### Cómo se resuelven roles y permisos

- **Modelo:** `Rol` con campo `permisos` JSON; `Usuario.rolId` → `Rol`.
- **En login:** se copian permisos del rol al **JWT** (`app/api/login/route.js`).
- **En API:** `session.permisos` y `session.esAdmin` (permiso `"*"` en array).
- **Registro:** `lib/rbac/registry.js` — catálogo de códigos; la fuente de verdad en runtime es el JWT + DB de roles al asignar usuario.

### Archivos exactos involucrados (auth core)

- `app/api/login/route.js`
- `app/api/logout/route.js` (ruta real de cierre de sesión)
- `app/api/me/route.js`
- `lib/auth.js`
- `lib/authorize.js`
- `app/login/page.jsx`
- `app/context/UserContext.jsx`
- `app/layout.jsx` (envuelve `UserProvider`)
- `lib/contexto.js`
- `app/api/contexto-activo/get/route.js`, `app/api/contexto-activo/set/route.js`

---

## 2. MAPA ACTUAL DE IDENTIDAD Y PERMISOS

### Modelos Prisma relevantes

| Modelo | Campos clave | Relación identidad |
|--------|----------------|-------------------|
| `Usuario` | `id`, `nombre`, `email` **unique**, `passwordHash`, `rolId`, `localId?`, `activo` | **Única entidad de persona/credencial** hoy |
| `Rol` | `nombre`, `permisos` JSON | Permisos del usuario |
| `Local` | `id`, `nombre`, … | Usuario opcionalmente atado a un local (`Usuario.localId`) |
| `Grupo` + `GrupoLocal` / `GrupoDeposito` | — | Alcance multi-local para admin |

### Qué reutilizar

- **`Local`**, **`Usuario`** (como **cuenta de acceso** del local o cuenta personal admin).
- **`Rol` / permisos** para **dueño/admin/supervisor** (cuentas reales con email/contraseña).
- **Cookies de contexto** (`erpazul_contexto_activo`, `erpazul_grupo_activo`) como patrón para **segunda dimensión** (análogo a “operador activo”).

### Qué falta sí o sí (conceptualmente)

- Entidad (o equivalente) de **operador interno del local**: persona física **sin** email/contraseña de ERP, con **nombre + PIN** (o similar), **ámbito local** (o grupo).
- Separación explícita en **persistencia** y/o **sesión** entre:
  - **identidad de acceso** (`Usuario` / JWT actual),
  - **identidad operativa activa** (nuevo concepto).

### ¿Existe operador / empleado / cajero como modelo?

**No.** En `schema.prisma` no hay `Operador`, `Empleado`, `Cajero`.  
Lo más cercano: campos **`vendedorId`** → `Usuario` en `Venta` y `Turno`, **`usuarioId`** en `CajaMovimiento`, **`userId`** en `MovimientoCuenta`, `ClientePuntoMovimiento`, `AuditoriaStock`, etc. Todo apunta a **`Usuario`**.

---

## 3. MAPA DE CONTEXTO OPERATIVO

### Local activo

| Capa | Mecanismo |
|------|-----------|
| JWT | `localId` en token si el usuario tiene local fijo |
| Cookie | `erpazul_contexto_activo` si admin sin local — vía `getContextoActivo(req, session)` (`lib/contexto.js`) |
| API | `resolveLocalAndGrupo(req)` (`lib/grupos.js`) compone `localId` + `grupoId` |
| Frontend | `useContextoActivo` → `GET /api/contexto-activo/get` |

### Caja activa

**No hay modelo `Caja` ni entidad “caja activa” en cookie dedicada.**  
La “caja” en el dominio POS está modelada indirectamente por:

- **`Turno`**: `localId`, `vendedorId` (Usuario), `apertura` / `cierre`, montos de cierre.
- **`CajaMovimiento`**: ligado a `turnoId` + `usuarioId` (Usuario).

El “contexto de caja” operativo es, en la práctica, **turno abierto** por usuario/local (validado en APIs POS).

### Turno activo

- Resolución en cliente: `app/modulos/pos-ventas/page.jsx` + `GET /api/pos-ventas/turnos/actual?localId=...`.
- Backend: `app/api/pos-ventas/turnos/actual/route.js` — `Turno` con `cierre: null`, `vendedorId: session.id`.

**Importante:** hoy **vendedor del turno = usuario autenticado** (`session.id`), no un operador interno separado.

### Inyección frontend / backend

- **Backend:** casi todas las rutas API leen `getUsuarioSession` / `requirePerm` y opcionalmente `resolveLocalAndGrupo`.
- **Frontend:** `perfil` (`useUser`), `contexto` (`useContextoActivo`), estado local en páginas (ej. POS).

**No hay** un `OperadorProvider` ni cookie de operador en el código actual.

---

## 4. MAPA DE TRAZABILIDAD / AUDITORÍA ACTUAL

### Tablas con autoría hacia `Usuario`

| Tabla / modelo | Campo | Significado hoy |
|----------------|--------|-----------------|
| `Venta` | `vendedorId` | Usuario JWT que registró la venta |
| `Turno` | `vendedorId` | Usuario que abrió el turno |
| `CajaMovimiento` | `usuarioId` | Usuario que registró ingreso/retiro |
| `MovimientoCuenta` | `userId?` | Usuario asociado al movimiento CC |
| `ClientePuntoMovimiento` | `userId?` | Usuario |
| `AuditoriaStock` | `userId` | Usuario que hizo el ajuste |
| `PosTransferencia` | `usuarioId`, `solicitadoPorUserId?` | Usuario |
| `PedidoProveedor` | `creadoPorId?` | Usuario (opcional) |

### ¿Las acciones quedan asociadas al autenticado?

**Sí**, en la medida en que el código use `session.id` o `user.id` del JWT. Ejemplo crítico: `app/api/pos-ventas/crear/route.js` asigna `vendedorId: session.id`.

### Si la cuenta fuera compartida del local (ej. `minimarket7@ventas.com`)

- **Trazabilidad sería genérica o falsa** para persona física: todo quedaría bajo el mismo `Usuario.id`.
- **No habría** distinción entre “quién abrió sesión del local” y “quién cobró” sin un segundo identificador persistido.

### Puntos críticos a corregir para doble capa

1. **`Venta.vendedorId`**, **`Turno.vendedorId`**, **`CajaMovimiento.usuarioId`**, **`AuditoriaStock.userId`**, etc.: hoy FK a **`Usuario`**. Hay que decidir si el **operador interno** es nuevo modelo con FK propias o si se mantiene `Usuario` “sintético” por empleado (desaconsejado si no deben tener email propio).
2. **Permisos:** la cuenta del local necesitará un **rol** acotado (`pos.usar`, etc.); el **operador** no debería heredar permisos globales del dueño — el control es **quién ejecuta**, no **qué puede hacer el ERP entero** (salvo diseño explícito).

---

## 5. PROPUESTA DE MODELO TÉCNICO MÍNIMO

### Nuevas entidades (recomendación)

**1) `OperadorLocal` (nombre tentativo)** — empleado del local sin cuenta email.

| Campo mínimo | Tipo conceptual | Notas |
|--------------|-----------------|--------|
| `id` | PK | |
| `localId` | FK `Local` | Ámbito; opcional extensión multi-local vía reglas de negocio |
| `nombre` | String | Nombre visible en POS |
| `pinHash` | String | `bcrypt` del PIN (nunca plano) |
| `activo` | Boolean | |
| `createdAt` / `updatedAt` | | |

**Opcional:** `codigoInterno` único por local para login por teclado; `rolInterno` enum (`cajero`, `supervisor_local`) si hace falta diferenciar límites **sin** permisos ERP completos.

**2) Sesión operativa (no necesariamente tabla en V1)**

- **Opción A (recomendada para alinear con contexto actual):** cookie **httpOnly** separada, ej. `erpazul_operador_activo`, firmada o con payload mínimo `{ operadorId, localId, ts }` + validación servidor en cada request sensible.
- **Opción B:** ampliar JWT de sesión con `operadorId` opcional — implica **reemitir token** al cambiar operador (más acoplado).

**Relaciones conceptuales**

| Entidad | Relación |
|---------|----------|
| `Usuario` (cuenta acceso) | 1 usuario puede ser “cuenta local” con `localId` y rol limitado |
| `OperadorLocal` | N operadores por `localId` |
| `Turno` | Debería atribuirse a **operador activo** al abrir (y/o `usuarioId` cuenta que abrió sesión del local) |
| `Venta` | `vendedor` debería ser **operador** que cobró (FK nueva o migración) |
| `CajaMovimiento` | `usuarioId` podría dividirse en `operadorId` + `cuentaUsuarioId` o reemplazar según política |

**Separación explícita**

- **Cuenta de acceso:** JWT `erpazul_sesion` → `Usuario.id`, permisos ERP.
- **Operador interno:** cookie (o claim) → `OperadorLocal.id`, **sin** permisos globales salvo política explícita.
- **Sesión del local:** no se cierra al cambiar operador; solo se reemplaza cookie operador.

**Migración de FK:**  
- **Mínimo invasivo:** añadir `operadorLocalId` nullable en `Venta` / `Turno` / `CajaMovimiento` / `AuditoriaStock`, mantener `vendedorId`/`userId` como cuenta del local por compatibilidad durante transición, luego deprecar.  
- **Más limpio a largo plazo:** FK directa a `OperadorLocal` y `usuarioAccesoId` opcional para “quién firmó la sesión”.

---

## 6. PROPUESTA DE FLUJO TÉCNICO

### Login cuenta general del local

1. `POST /api/login` con email/contraseña de `Usuario` asociado al local (rol tipo “cuenta operativa local”).
2. JWT estándar + cookies contexto si aplica.
3. **No** setear operador aún → módulos sensibles en **bloqueo** hasta identificar operador (o flujo forzado en landing POS).

### Login cuenta propia admin/dueño/supervisor

1. Igual flujo actual; `localId` fijo o admin + cookie contexto.
2. Política producto: **admin puede** operar sin PIN de operador **solo** si se define explícitamente (riesgo); si no, también debe identificarse como “operador” o como “supervisor con re-autenticación”.

### Identificación operativa nombre + PIN

1. `POST /api/operador/identificar` (ruta nueva): body `{ localId }` ya validado por contexto, `{ nombre o codigo, pin }`.
2. Buscar `OperadorLocal` por local + criterio; `bcrypt.compare`.
3. Setear cookie `erpazul_operador_activo` (httpOnly, mismo `path`, `maxAge` alineado a turno o sesión).
4. Respuesta: `{ ok, operador: { id, nombre } }` sin secretos.

### Persistencia sesión operativa

- Cookie httpOnly + validación en servidor (`getOperadorActivo(req)` leyendo cookie y comprobando `localId` coincide con contexto/JWT).

### Cambio de operador

1. `POST /api/operador/cambiar` o mismo endpoint con flag: limpia cookie operador + exige nuevo PIN.
2. **No** tocar `erpazul_sesion`.
3. Turno: decisión de producto — ¿mismo turno con distintos operadores? Hoy turno está ligado a `vendedorId` Usuario; habría que **separar** “turno de caja de la cuenta local” vs “operador activo”.

### Bloqueo módulos sensibles sin operador

- Helper `requireOperadorActivo(req)` usado en rutas POS, stock sensible, etc.
- Frontend: si `GET /api/operador/activo` devuelve vacío, mostrar modal PIN / pantalla bloqueo.

### Revalidación PIN para acciones críticas

- Endpoints específicos `POST /api/operador/verificar-pin` con rate limit; o nonce de corta vida en cookie de “elevación” 5–10 min.
- Acciones: anular venta (cuando exista), grandes retiros de caja, ajustes de stock masivos, etc.

---

## 7. IMPACTO POR CAPAS

| Capa | Impacto |
|------|---------|
| **Prisma / DB** | Nuevo modelo `OperadorLocal` (o equivalente); migraciones; nuevas columnas FK en `Venta`, `Turno`, `CajaMovimiento`, `AuditoriaStock`, posiblemente más tablas con `userId` |
| **API / route handlers** | Todas las rutas que usan `session.id` como “actor” deben revisarse; POS crear, turnos abrir/cerrar, caja movimientos, puntos, CC, auditoría stock |
| **Auth** | Login puede bifurcar tipos de rol; cookies adicionales; helpers `getOperadorActivo`; posible rotación JWT si se elige Opción B |
| **Frontend state** | Nuevo contexto o extensión de `UserContext` / hook `useOperadorActivo`; UI PIN en POS y guardas en módulos sensibles |
| **UI módulos** | POS obligatorio primero; luego stock, transferencias, etc. según lista “sensible” cerrada por producto |
| **Auditoría / logging** | Escribir `operadorId` (y opcionalmente `usuarioAccesoId`) en eventos; reportes históricos |

---

## 8. LISTA EXACTA DE ARCHIVOS A TOCAR (orientativa)

### Existentes a modificar (alto impacto)

- `prisma/schema.prisma`
- `lib/auth.js` (lectura cookie adicional o utilidades)
- `lib/contexto.js` o nuevo módulo hermano `lib/operadorActivo.js`
- `lib/authorize.js` — posible `requireOperadorActivo`
- `app/api/login/route.js` — políticas por tipo de cuenta (si aplica)
- `app/api/pos-ventas/crear/route.js`
- `app/api/pos-ventas/turnos/abrir/route.js`, `cerrar/route.js`, `actual/route.js`, `caja-movimientos/crear/route.js`, …
- `app/modulos/pos-ventas/page.jsx` + componentes POS que asumen `perfil` = vendedor
- `app/context/UserContext.jsx` — coherencia con logout (`/api/logout`)
- Cualquier API que persista `userId` / `vendedorId` desde `session.id`

### Nuevos a crear (típico)

- `app/api/operador/identificar/route.js` (o nombre acordado)
- `app/api/operador/activo/route.js` — GET estado
- `app/api/operador/cambiar/route.js` / `logout-operador`
- `app/api/operador/verificar-pin/route.js` (fase posterior)
- Componentes UI: modal PIN, banner “Operador: …”
- Hook `hooks/useOperadorActivo.js`
- Migración SQL vía `prisma migrate`

### Rutas / layouts afectados

- `app/modulos/layout.jsx` — si se muestra operador global en barra
- `app/login/page.jsx` — solo si hay flujo dual visible (normalmente no)

### Modelos Prisma afectados

- Nuevo: **`OperadorLocal`** (nombre final a cerrar)
- **`Venta`**, **`Turno`**, **`CajaMovimiento`**, **`AuditoriaStock`**, **`ClientePuntoMovimiento`**, **`MovimientoCuenta`**, **`PosTransferencia`** — revisión caso por caso

---

## 9. PLAN DE IMPLEMENTACIÓN POR FASES

| Fase | Contenido | Riesgo | Dependencias |
|------|-----------|--------|--------------|
| **1 — DB / modelos** | `OperadorLocal`, seeds, índices únicos `(localId, nombre)` o código; decisión FK en `Venta`/`Turno` | Medio — migraciones en producción | Backup DB |
| **2 — Sesión operativa** | Cookie + helpers servidor + `GET /api/operador/activo`; **sin** cambiar aún todas las escrituras | Bajo si no se usa en prod hasta activar | Fase 1 |
| **3 — Guards operativos** | `requireOperadorActivo` en APIs POS críticas; UI bloqueo POS | Alto — puede bloquear POS si mal desplegado | Fase 2 |
| **4 — Auditoría base** | Persistir `operadorLocalId` en ventas nuevas; script backfill opcional “desconocido” | Medio — datos históricos sin operador | Fase 3 |
| **5 — Adaptación resto de módulos** | Stock, CC, puntos, transferencias según matriz de sensibilidad | Alto — superficie grande | Fase 4 + lista cerrada |

**Orden sugerido:** 1 → 2 → 3 (solo POS) → 4 → 5.  
**Feature flag** o entorno de prueba recomendado antes de producción.

---

## 10. RIESGOS Y DECISIONES CRÍTICAS

### Qué podría romper login actual

- Cambiar forma del JWT sin migración suave (clientes con token viejo).
- Corregir `UserContext` logout URL en el mismo epic — probar flujo completo.

### Qué podría romper permisos

- Dar a la cuenta local permisos demasiado amplios (equivale a “admin compartido”).
- Operador que herede permisos del JWT por error en `requirePerm`.

### Qué podría romper POS / caja / turnos

- `Turno.vendedorId` hoy = `session.id`. Si se exige operador pero turno sigue ligado solo a Usuario, habrá **inconsistencia** turno vs ventas.
- Regla de negocio: **¿un turno es de la “sesión del local” o del operador?** Debe cerrarse antes de implementar.

### Qué abstraer antes de tocar muchos módulos

- **`getActorOperativo(req)`** que devuelva `{ usuarioAccesoId, operadorLocalId, localId }` unificado para APIs.
- Lista única de **rutas sensibles** y **acciones que exigen PIN de revalidación**.

### Decisiones a cerrar antes de implementar

1. **FK en BD:** ¿`Venta.vendedorId` pasa a `OperadorLocal` o se añade columna paralela?
2. **Admin sin PIN:** ¿puede operar POS sin operador o debe identificarse?
3. **Un turno, varios operadores:** permitido o no.
4. **PIN policy:** longitud, lockout, rotación.
5. **Logout operador vs logout cuenta:** siempre dos acciones visibles.

---

## Comparación de opciones (cookie operador vs JWT extendido)

| Criterio | Cookie operador dedicada | JWT con `operadorId` |
|----------|---------------------------|----------------------|
| Cambio operador sin re-login | ✅ natural | ⚠️ requiere re-firmar JWT |
| Alineación con `contexto.js` | ✅ mismo patrón | Menos |
| Complejidad | Media | Media-alta |

**Recomendación:** **cookie httpOnly dedicada** para operador activo, validada siempre contra `localId` del contexto/JWT.

---

## Conclusión

El repo hoy tiene **una sola capa de identidad** (`Usuario` + JWT + cookies de contexto/grupo). **No existe** modelo de empleado/operador; la **trazabilidad operativa** se asimila al **usuario autenticado**. Para la arquitectura funcional cerrada (cuenta del local + PIN por persona), hace falta **nuevo modelo en DB**, **segunda cookie o claim de sesión**, **refactor de FKs y APIs POS**, y **reglas de producto explícitas** sobre turnos y admins. Corregir además la **ruta de logout** en `UserContext.jsx` al implementar auth.

---

*Documento generado como base técnica para implementación; no incluye código de producción.*
