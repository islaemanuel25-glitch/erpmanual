# Autenticacion y Permisos

## Sistema de autenticacion

El ERP usa JWT con cookies httpOnly. No hay tokens en localStorage.

### Flujo de login

```
1. POST /api/login { email, password }
2. Server: bcrypt.compare(password, user.passwordHash)
3. Server: firmarToken({ id, nombre, email, rolId, permisos, localId, esDeposito })
4. Server: Set-Cookie erpazul_sesion=<jwt> (httpOnly, lax, 8h)
5. Client: refrescar() → GET /api/me → actualiza UserContext
6. Redirect → /modulos/dashboard
```

### Flujo de logout

```
1. POST /api/logout
2. Server: Set-Cookie erpazul_sesion="" maxAge=0
3. Client: window.location.href = "/login"
```

## Cookies

| Cookie | Proposito | httpOnly | maxAge |
|--------|-----------|----------|--------|
| `erpazul_sesion` | JWT de sesion | Si | 8 horas |
| `erpazul_grupo_activo` | Grupo activo (solo admin) | Si | 8 horas |

## lib/auth.js - Funciones principales

```javascript
firmarToken(payload)        // Firma JWT con AUTH_SECRET, expira en 8h
verificarToken(token)       // Verifica JWT, retorna payload o null
getTokenFromRequest(req)    // Extrae token de cookie del request
getUsuarioSession(req)      // Retorna objeto sesion completo
```

### getUsuarioSession(req) retorna:

```javascript
{
  id: number,
  rolId: number,
  localId: number | null,
  permisos: string[],       // ["productos.ver", "stock.ver", ...] o ["*"]
  esAdmin: boolean,         // true si permisos incluye "*"
  grupoId: number | null,   // Solo para admin (de cookie grupo activo)
  grupoActivoId: number | null
}
```

## lib/permisos.js - Permisos disponibles

```javascript
{
  productos:      ["productos.ver", "productos.crear", "productos.editar", "productos.eliminar"],
  stock:          ["stock.ver"],
  transferencias: ["transferencias.crear", "transferencias.recibir"],
  pos:            ["pos.usar", "pos.anular"],
  compras:        ["compras.crear", "compras.ver"],
  proveedores:    ["proveedores.ver"],
  usuarios:       ["usuarios.ver", "usuarios.editar", "usuarios.eliminar"],
  roles:          ["roles.editar"],
  reportes:       ["reportes.ver"]
}
```

El permiso `"*"` es wildcard (admin tiene acceso total).

## Validacion en APIs

Patron estandar en cada Route Handler:

```javascript
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  // 1. Autenticacion
  const session = getUsuarioSession(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  // 2. Autorizacion (opcional)
  if (!session.esAdmin && !session.permisos.includes("stock.ver")) {
    return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  }

  // 3. Grupo activo
  const grupoId = Number(session.grupoId);
  if (!grupoId || grupoId <= 0) {
    return NextResponse.json({ ok: false, error: "Selecciona un grupo activo" }, { status: 400 });
  }

  // 4. Logica de negocio...
}
```

## UserContext en frontend

```javascript
// app/context/UserContext.jsx
import { useUser } from "@/app/context/UserContext";

const { perfil, cargando, refrescar, logout } = useUser();

// perfil:
{
  id: number,
  nombre: string,
  email: string,
  rolId: number,
  rolNombre: string,
  permisos: string[],
  esAdmin: boolean,
  localId: number | null
}
```

Se inicializa al montar la app via `GET /api/me`. Todos los componentes acceden al usuario actual a traves de este context.
