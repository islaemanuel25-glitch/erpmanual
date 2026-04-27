# IMPLEMENTACION — IDENTIDAD OPERATIVA INTERNA (OperadorLocal)

Fecha: 2026-03-22
Estado: base implementada, pendiente integrar en modulos sensibles

---

## 1. Que es y para que sirve

El sistema de operador interno resuelve un problema concreto del negocio: las cuentas de local son compartidas (ej: minimarket7@ventas.com), los empleados no tienen mail propio para loguearse, pero cada accion sensible debe quedar atribuida a una persona real.

### Dos capas de identidad

| Capa | Quien | Como se identifica | Cookie |
|------|-------|-------------------|--------|
| Acceso al ERP | Usuario (cuenta del local o cuenta propia) | Email + contraseña | `erpazul_sesion` (JWT, 8h) |
| Identidad operativa | Operador (persona fisica) | Nombre + PIN de 4-6 digitos | `erpazul_operador_activo` (JWT, 12h) |

### Regla de negocio

- **Cuentas compartidas** (permisos NO incluyen `"*"`): despues del login quedan bloqueadas en `/bloqueo-operador` hasta que un empleado se identifique con nombre + PIN.
- **Cuentas propias** (admin/dueño, permisos incluyen `"*"`): operan directamente, sin pedir PIN. El sistema los reconoce por su sesion.
- Cambiar de operador NO cierra la sesion del local.

---

## 2. Modelo de datos

### OperadorLocal

```prisma
model OperadorLocal {
  id        Int      @id @default(autoincrement())
  nombre    String   @unique
  pinHash   String
  activo    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  locales OperadorEnLocal[]
}
```

- Nombre unico global (no puede haber dos "Juan" en todo el sistema)
- PIN hasheado con bcrypt (mismo metodo que contraseñas de Usuario)
- Un operador puede estar asignado a multiples locales

### OperadorEnLocal (tabla join)

```prisma
model OperadorEnLocal {
  operadorId Int
  localId    Int

  operador OperadorLocal @relation(fields: [operadorId], references: [id], onDelete: Cascade)
  local    Local         @relation(fields: [localId], references: [id])

  @@id([operadorId, localId])
  @@index([localId])
}
```

- Relacion many-to-many entre operador y local
- Cascade delete: al eliminar un operador se borran sus asignaciones
- Un operador solo aparece en la pantalla de bloqueo de los locales donde esta asignado

### Relacion en Local

```prisma
model Local {
  // ... campos existentes ...
  operadorAsignaciones OperadorEnLocal[]
}
```

---

## 3. Archivos creados

### Infraestructura (2 archivos)

| Archivo | Lineas | Funcion |
|---------|--------|---------|
| `lib/operador.js` | 77 | Cookie config, firmar/leer token operador, `getOperadorActivo()`, `requireOperador()`, `resolveContextoAuditoria()` |
| `hooks/useOperadorActivo.js` | 45 | Hook React: estado del operador, login, logout, refrescar |

### APIs (8 archivos en `app/api/operador/`)

| Ruta | Metodo | Permiso | Funcion |
|------|--------|---------|---------|
| `/api/operador/login` | POST | auth basica | Valida PIN, setea cookie operador |
| `/api/operador/logout` | POST | ninguno | Limpia cookie operador |
| `/api/operador/me` | GET | ninguno | Devuelve operador activo desde cookie |
| `/api/operador/listar` | GET | auth basica | Lista operadores activos del local actual (para pantalla de bloqueo) |
| `/api/operador/listar-todos` | GET | `usuarios.gestionar` | Lista todos los operadores con sus locales (para gestion) |
| `/api/operador/locales` | GET | `usuarios.gestionar` | Lista locales activos (para formulario de gestion) |
| `/api/operador/crear` | POST | `usuarios.gestionar` | Crea operador + asigna locales |
| `/api/operador/editar` | POST | `usuarios.gestionar` | Edita nombre/PIN/activo/locales |
| `/api/operador/eliminar` | POST | `usuarios.gestionar` | Elimina operador permanentemente |

### Paginas (2 archivos)

| Archivo | Funcion |
|---------|---------|
| `app/bloqueo-operador/page.jsx` | Pantalla fullscreen de identificacion obligatoria para cuentas compartidas |
| `app/modulos/operadores/page.jsx` | CRUD de operadores (tabla + modal crear/editar + eliminar) |

### Componentes (3 archivos)

| Archivo | Funcion |
|---------|---------|
| `components/operador/OperadorSelector.jsx` | Widget compacto para elegir operador + PIN (usado en Header) |
| `components/operador/RequiereOperador.jsx` | Guard visual: bloquea contenido si no hay operador activo |
| `components/operadores/ModalOperador.jsx` | Modal de crear/editar operador con checkboxes de locales |

### Script (1 archivo)

| Archivo | Funcion |
|---------|---------|
| `scripts/seed-operadores.js` | Crea operadores de prueba Juan (PIN 1234) y Maria (PIN 5678) en local 1 |

---

## 4. Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` | Agregados modelos `OperadorLocal` y `OperadorEnLocal`, relacion en `Local` |
| `components/Header.jsx` | Pill de operador activo: verde fijo para admin, ambar pulsante para cuenta compartida sin operador, selector con PIN |
| `app/modulos/layout.jsx` | Guard: si `!esAdmin && !operador` redirige a `/bloqueo-operador` |
| `app/context/UserContext.jsx` | Corregido bug de logout: `/api/auth/logout` → `/api/logout` (ruta que realmente existe) |
| `lib/menuConfig.js` | Agregada entrada "Operadores" bajo seccion "Usuarios" con permiso `usuarios.gestionar` |
| `components/sunmi/SunmiSelectAdv.jsx` | Fix en `currentText` multi-select: ahora muestra nombres de opciones en vez de IDs |

---

## 5. Flujo completo

### Login con cuenta compartida

```
1. Usuario ingresa email + contraseña del local
2. Login OK → redirect /modulos/dashboard
3. Layout de modulos detecta: esAdmin=false, operador=null
4. Redirect a /bloqueo-operador
5. Pantalla muestra: logo ERP Azul + select de operadores del local + input PIN
6. Empleado elige su nombre + ingresa PIN
7. POST /api/operador/login → valida PIN → setea cookie erpazul_operador_activo
8. Redirect a /modulos/dashboard → layout ahora ve operador activo → pasa
9. Header muestra pill verde con nombre del operador
```

### Login con cuenta propia (admin/dueño)

```
1. Admin ingresa su email + contraseña personal
2. Login OK → redirect /modulos/dashboard
3. Layout detecta esAdmin=true → pasa directo, sin pedir operador
4. Header muestra pill verde fijo: "Administrador"
5. Si navega a /bloqueo-operador por URL → detecta esAdmin → redirect al dashboard
```

### Cambio de operador

```
1. Click en pill del operador en Header
2. Se abre OperadorSelector con dropdown de operadores + input PIN
3. Nuevo operador se identifica
4. Cookie se actualiza, sesion del local NO se cierra
```

---

## 6. Cookie de operador

| Propiedad | Valor |
|-----------|-------|
| Nombre | `erpazul_operador_activo` |
| Tipo | JWT firmado con `AUTH_SECRET` |
| Payload | `{ operadorId, nombre, localId, _tipo: "operador" }` |
| Duracion | 12 horas |
| httpOnly | si |
| secure | solo en produccion |
| sameSite | lax |

La cookie es independiente de `erpazul_sesion`. Se puede limpiar sin cerrar sesion.

---

## 7. Helpers disponibles para backend

### `getOperadorActivo(req)`
Retorna `{ operadorId, nombre, localId }` o `null` si no hay operador activo.

### `requireOperador(req)`
Retorna `{ ok: true, operador }` o `{ ok: false, status: 428, error, needsOperador: true }`.
Usar en endpoints que requieran operador para operar.

### `resolveContextoAuditoria(req, session, extra)`
Retorna objeto plano para logs de auditoria:
```js
{
  usuarioId,      // quien abrio sesion (cuenta del local o admin)
  operadorId,     // quien esta operando fisicamente
  operadorNombre, // nombre visible del operador
  localId,        // local activo
  timestamp,      // ISO string
  ...extra        // modulo, accion, etc.
}
```

---

## 8. Gestion de operadores

Ruta: `/modulos/operadores`
Permiso requerido: `usuarios.gestionar` o admin (`*`)

### Funcionalidades

- **Lista**: tabla con nombre, locales asignados (badges), estado (activo/inactivo), acciones
- **Crear**: modal con nombre, PIN (4-6 digitos), checkboxes de locales, toggle activo
- **Editar**: mismo modal, PIN opcional (solo si quiere cambiarlo)
- **Eliminar**: boton trash con confirmacion, elimina permanentemente (cascade borra asignaciones)
- **Buscar**: filtro por nombre

### Multi-local

Cada operador puede estar asignado a 1 o mas locales. Solo aparece en la pantalla de bloqueo y en el selector de los locales donde esta asignado.

---

## 9. Datos de prueba

Operadores creados con `scripts/seed-operadores.js`:

| Nombre | PIN | Local asignado |
|--------|-----|---------------|
| Juan | 1234 | Deposito (id=1) |
| Maria | 5678 | Deposito (id=1) |

---

## 10. Pendiente para fase 2

### Integracion con modulos sensibles

Usar `requireOperador(req)` en los endpoints de:
- POS Ventas (crear venta)
- Turnos (abrir/cerrar turno)
- Ajustes de stock
- Transferencias
- Caja (movimientos)

### Persistir operadorId en registros

Agregar campo `operadorId` (nullable, FK a OperadorLocal) en:
- `Venta` → quien hizo la venta
- `Turno` → quien abrio/cerro el turno
- `AuditoriaStock` → quien hizo el ajuste
- `CajaMovimiento` → quien registro el movimiento

### Registro de auditoria

Usar `resolveContextoAuditoria()` para crear tabla de logs:
- usuario de acceso + operador + local + modulo + accion + timestamp
- Permite responder: "¿quien hizo esta venta?" con persona real, no con cuenta generica del local

### CRUD completo de operadores

- Editar nombre (hoy solo edita PIN y locales)
- Historial de acciones por operador
- Reporte de actividad por operador

---

## 11. Notas tecnicas

### Prisma generate

Despues de modificar `schema.prisma`, es necesario:
1. `npx prisma db push` para sincronizar la base de datos
2. `npx prisma generate` para regenerar el client JS
3. Reiniciar el server de Next.js para que cargue el client nuevo

Si `prisma generate` falla con `EPERM` es porque el server tiene el DLL lockeado. Hay que parar el server primero.

### SunmiSelectAdv y modales

El componente `SunmiSelectAdv` usa `createPortal` al `body` para renderizar el dropdown. Esto es incompatible con modales `fixed inset-0` que capturan pointer events. En el modal de operadores se usan checkboxes nativos en vez de `SunmiSelectAdv` para evitar este conflicto.

### Deteccion cuenta propia vs compartida

```js
const esCuentaPropia = Array.isArray(perfil?.permisos) && perfil.permisos.includes("*");
```

Admin con `*` en permisos = cuenta propia, opera directamente.
Cualquier otro rol = cuenta compartida, requiere operador.
