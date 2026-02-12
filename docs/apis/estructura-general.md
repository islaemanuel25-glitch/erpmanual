# APIs - Estructura General

## Ubicacion

Todos los endpoints estan en `app/api/`. Cada `route.js` exporta funciones HTTP (GET, POST, PUT, DELETE).

## Patron de request/response

### Request
```javascript
// Desde el frontend:
const res = await fetch("/api/modulo/accion", {
  method: "POST",
  credentials: "include",              // SIEMPRE incluir para enviar cookies
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ campo: valor }),
});
```

### Response exitosa
```json
{
  "ok": true,
  "items": [],           // para listados
  "item": {},            // para get/create/update
  "total": 42,           // para paginacion
  "totalPages": 2,       // para paginacion
  "message": "Operacion exitosa"  // para acciones
}
```

### Response de error
```json
{ "ok": false, "error": "Mensaje descriptivo" }
```

## Status codes

| Codigo | Significado |
|--------|-------------|
| 200 | OK |
| 201 | Creado exitosamente |
| 400 | Validacion fallida / datos invalidos |
| 401 | No autenticado (token invalido o ausente) |
| 403 | Sin permisos para esta accion |
| 404 | Recurso no encontrado |
| 409 | Conflicto (duplicado, ya existe) |
| 500 | Error interno del servidor |

## Patron de validacion en cada endpoint

```javascript
export async function POST(req) {
  try {
    // 1. AUTENTICACION
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // 2. GRUPO ACTIVO (cuando aplica)
    const grupoId = Number(session.grupoId);
    if (!grupoId || grupoId <= 0) {
      return NextResponse.json({ ok: false, error: "Selecciona un grupo activo" }, { status: 400 });
    }

    // 3. PERMISOS (cuando aplica)
    if (!session.esAdmin && !session.permisos.includes("modulo.accion")) {
      return NextResponse.json({ ok: false, error: "Sin permisos" }, { status: 403 });
    }

    // 4. VALIDACION DE DATOS
    const body = await req.json();
    if (!body.campo) {
      return NextResponse.json({ ok: false, error: "Campo requerido" }, { status: 400 });
    }

    // 5. LOGICA DE NEGOCIO
    const resultado = await prisma.modelo.create({ data: { ... } });

    // 6. RESPONSE
    return NextResponse.json({ ok: true, item: resultado });

  } catch (e) {
    console.error("ERROR modulo/accion:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Error interno" }, { status: 500 });
  }
}
```

## Paginacion

Los endpoints de listado usan paginacion server-side:

```
GET /api/modulo/listar?page=1&pageSize=25
```

Response:
```json
{
  "ok": true,
  "items": [...],
  "total": 150,
  "totalPages": 6
}
```

PageSize por defecto: 25 en la mayoria de endpoints.

## Catalogo completo de endpoints

### Autenticacion
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/login` | POST | Login con email/password |
| `/api/logout` | POST | Cerrar sesion |
| `/api/me` | GET | Datos del usuario actual |

### Grupo Activo
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/grupo-activo/get` | GET | Obtener grupo activo |
| `/api/grupo-activo/set` | POST | Cambiar grupo activo (admin) |

### Usuarios
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/usuarios/listar` | GET | Listar usuarios |
| `/api/usuarios/obtener` | GET | Obtener usuario por ID |
| `/api/usuarios/crear` | POST | Crear usuario |
| `/api/usuarios/editar/[id]` | PUT | Editar usuario |
| `/api/usuarios/eliminar/[id]` | DELETE | Eliminar (soft) |
| `/api/usuarios/reactivar/[id]` | PUT | Reactivar |
| `/api/usuarios/listarRoles` | GET | Roles para dropdown |
| `/api/usuarios/listarLocales` | GET | Locales para dropdown |
| `/api/usuarios/eliminarPorEmail` | DELETE | Eliminar por email |

### Roles
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/roles/listar` | GET | Listar roles |
| `/api/roles/obtener` | GET | Obtener rol |
| `/api/roles/crear` | POST | Crear rol |
| `/api/roles/editar/[id]` | PUT | Editar rol |
| `/api/roles/eliminar/[id]` | DELETE | Eliminar rol |

### Grupos
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/grupos/listar` | GET | Listar grupos |
| `/api/grupos/opciones` | GET | Grupos autorizados |
| `/api/grupos/crear` | GET/POST | Crear grupo |
| `/api/grupos/[id]` | GET/PUT/DELETE | CRUD grupo |
| `/api/grupos/[id]/depositos` | GET/POST/DELETE | Depositos del grupo |
| `/api/grupos/[id]/locales` | GET/POST/DELETE | Locales del grupo |
| `/api/grupos/[id]/sync-productos` | POST | Sincronizar catalogo |

### Locales
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/locales` | GET/POST | Listar/crear locales |
| `/api/locales/listar` | GET | Listar con filtros |
| `/api/locales/[id]` | GET/PUT/DELETE | CRUD local |
| `/api/locales/[id]/grupo` | GET/POST/PUT | Grupo del local |

### Categorias
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/categorias/listar` | GET | Listar categorias |
| `/api/categorias/crear` | POST | Crear |
| `/api/categorias/editar` | PUT | Editar |
| `/api/categorias/eliminar` | POST | Eliminar |

### Proveedores
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/proveedores/listar` | GET | Listar proveedores |
| `/api/proveedores/obtener` | GET | Obtener proveedor |
| `/api/proveedores/crear` | POST | Crear |
| `/api/proveedores/editar` | PUT | Editar |
| `/api/proveedores/eliminar` | DELETE | Eliminar |
| `/api/proveedores/opciones` | GET | Para dropdowns |

### Productos
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/productos/listar` | GET | Listar productos |
| `/api/productos/obtener` | GET | Obtener producto |
| `/api/productos/crear` | POST | Crear (replica a locales) |
| `/api/productos/editar/[id]` | PUT | Editar base u override |
| `/api/productos/eliminar/[id]` | DELETE | Eliminar |

### Precios
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/productos/precios/preview` | POST | Preview de cambios |
| `/api/productos/precios/apply` | POST | Aplicar cambios |
| `/api/productos/precios/history` | GET | Historial |
| `/api/productos/precios/history/[id]` | GET | Detalle historial |
| `/api/productos/precios/parse` | POST | Parsear texto pegado |

### Stock
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/stock_locales/listar` | GET | Listar stock |
| `/api/stock_locales/obtener` | GET | Obtener stock producto |
| `/api/stock_locales/nuevo` | POST | Crear producto + stock |
| `/api/stock_locales/ajustar` | POST | Ajustar cantidad |
| `/api/stock_locales/importar` | POST | Importar masivo |
| `/api/stock_locales/limites` | POST | Configurar min/max |

### Transferencias
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/transferencias/listar` | GET | Listar transferencias |
| `/api/transferencias/detalle` | GET | Detalle transferencia |
| `/api/transferencias/guardar-recepcion` | POST | Guardar recibido |
| `/api/transferencias/confirmar-recepcion` | POST | Confirmar y actualizar stock |
| `/api/transferencias/pdf` | GET | PDF de envio |
| `/api/transferencias/pdf-recepcion` | GET | PDF de recepcion |

### POS Transferencias
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/pos-transferencias/nueva` | GET | Obtener/crear borrador |
| `/api/pos-transferencias/crear` | POST | Crear borrador |
| `/api/pos-transferencias/detalle` | GET | Detalle POS |
| `/api/pos-transferencias/buscarProductos` | GET | Buscar productos |
| `/api/pos-transferencias/sugeridos` | GET | Productos sugeridos |
| `/api/pos-transferencias/agregarItem` | POST | Agregar item |
| `/api/pos-transferencias/enviar` | POST | Convertir a transferencia |
| `/api/pos-transferencias/cancelar` | POST | Cancelar borrador |

### Catalogos
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/catalogos/categorias` | GET | Categorias para dropdown |
| `/api/catalogos/proveedores` | GET | Proveedores para dropdown |
| `/api/catalogos/areas-fisicas` | GET | Areas fisicas para dropdown |

### Utilidades
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/areas-fisicas/listar` | GET | Listar areas fisicas |
| `/api/plantilla` | GET | Descargar template XLSX |
| `/api/test` | GET | Health check |
