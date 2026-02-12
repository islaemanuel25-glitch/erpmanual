# Convenciones del Proyecto

## Codigo en espanol

- Nombres de variables, funciones y componentes en espanol
- Mensajes de error y UI en espanol
- Comentarios en espanol
- Nombres de modelos Prisma en espanol (Usuario, Proveedor, Transferencia)

## Frontend

- Siempre usar `"use client"` en componentes de pagina
- Datos via `fetch()` a `/api/*` (nunca Server Components con data fetching)
- `credentials: "include"` en todos los fetch para enviar cookies
- Redirigir a `/login` cuando `res.status === 401`

## APIs - Patron de validacion

Orden estandar en cada Route Handler:

```
1. Autenticacion: getUsuarioSession(req) → 401 si null
2. Grupo activo: session.grupoId → 400 si falta
3. Permisos: session.permisos.includes("x") → 403 si no tiene
4. Validacion de body/params → 400 si invalido
5. Logica de negocio
6. Response estandar
```

## Nombres de archivos

| Tipo | Convencion | Ejemplo |
|------|-----------|---------|
| Componente React | PascalCase.jsx | `SunmiButton.jsx` |
| Pagina Next.js | page.jsx | `app/modulos/productos/page.jsx` |
| Route Handler | route.js | `app/api/productos/listar/route.js` |
| Hook custom | camelCase.js | `useActualizacionPrecios.js` |
| Utilidad | camelCase.js | `auth.js`, `prisma.js` |
| Carpeta de modulo | kebab-case | `actualizacion-precios/` |

## Estructura de componentes

```
components/[modulo]/
  ComponentePrincipal.jsx    # Componente de pagina
  ModalNombre.jsx            # Modal de crear/editar
  TablaNombre.jsx            # Tabla de listado
  FiltrosNombre.jsx          # Barra de filtros
  hooks/                     # Hooks custom del modulo
    useNombre.js
```

## Manejo de errores

### En APIs
```javascript
try {
  // logica
  return NextResponse.json({ ok: true, data });
} catch (e) {
  console.error("ERROR modulo/accion:", e);
  return NextResponse.json({ ok: false, error: e?.message || "Error interno" }, { status: 500 });
}
```

### En frontend
```javascript
const [errorMsg, setErrorMsg] = useState("");
const [successMsg, setSuccessMsg] = useState("");

// Mostrar en UI:
{errorMsg && <div className="...text-red-200">{errorMsg}</div>}
{successMsg && <div className="...text-emerald-200">{successMsg}</div>}
```

## Formato de responses API

### Exito
```json
{ "ok": true, "items": [], "total": 42, "totalPages": 2 }
{ "ok": true, "item": { ... } }
{ "ok": true, "message": "Operacion exitosa" }
```

### Error
```json
{ "ok": false, "error": "Mensaje descriptivo" }
```

### Status codes
| Codigo | Uso |
|--------|-----|
| 200 | OK |
| 201 | Creado exitosamente |
| 400 | Validacion fallida |
| 401 | No autenticado |
| 403 | Sin permisos |
| 404 | No encontrado |
| 409 | Conflicto (duplicado) |
| 500 | Error interno |

## Uso de Prisma

- Cliente singleton en `lib/prisma.js`
- Schema usa snake_case para campos (`precio_costo`, `codigo_barra`)
- Mappers en `lib/mappers/` convierten a camelCase para la API
- Transacciones con `prisma.$transaction()` para operaciones complejas
- Cascading deletes configurados en schema donde corresponde

## Formato de precios

Formato argentino en frontend:
```javascript
Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// → "1.234,56"
```

## Estado en componentes

- `useState` para estado local (mayoria de modulos)
- `UserContext` para datos de sesion globales
- `localStorage` para preferencias (tema, columnas visibles, local seleccionado)
- No se usa Redux ni Zustand

## Estilos UI (ver docs/05-GUIA-ESTILOS-UI.md)

### Labels
- Estilo estandar: `text-[11px] text-slate-400 mb-1 block`

### Colores
- NO hardcodear colores (`bg-slate-900`, `text-slate-100`, etc)
- Usar componentes Sunmi que respetan el sistema de themes
- Bordes: `border-slate-800`

### Feedback
- Toast para mensajes (`showSuccess`, `showError` de SunmiToast)
- NO usar `alert()`

### Responsive
- Mobile-first
- Breakpoints: sm (640px), md (768px), lg (1024px)
- Tablas: siempre en `overflow-x-auto`
- Grids: siempre con breakpoint (`grid-cols-1 md:grid-cols-3`)
