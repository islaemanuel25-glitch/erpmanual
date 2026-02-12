# Arquitectura

## Stack tecnico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| Framework | Next.js (App Router) | 16.0.1 |
| UI | React | 19.2.0 |
| Estilos | Tailwind CSS | 3.4.18 |
| Base de datos | PostgreSQL | - |
| ORM | Prisma | 6.19.0 |
| Auth | JWT (jsonwebtoken) + bcrypt | 9.0.2 / 6.0.0 |
| Excel | xlsx | 0.18.5 |
| PDF | pdf-lib + pdfkit | 1.17.1 / 0.17.2 |
| Iconos | Phosphor Icons + React Icons | - |

## Patron BFF (Backend For Frontend)

```
UI (React) → /app/api/* (Route Handlers) → Prisma → PostgreSQL
```

Todas las paginas son `"use client"`. Los datos se obtienen via `fetch()` a los Route Handlers de Next.js que actuan como BFF. No hay Server Components con data fetching directo.

## Estructura de carpetas

```
app/
  api/              # Route Handlers (endpoints REST)
    login/          # POST /api/login
    productos/      # CRUD productos + precios
    transferencias/ # Logica de transferencias
    ...
  context/          # React Context (UserContext)
  login/            # Pagina de login
  modulos/          # Paginas principales
    productos/
    stock_locales/
    transferencias/
    pos-transferencias/
    usuarios/
    roles/
    grupos/
    locales/
    categorias/
    proveedores/
    configuracion/
    dashboard/

components/
  sunmi/            # Design system (34 componentes)
  productos/        # Componentes del modulo productos
  transferencias/   # Componentes del modulo transferencias
  ...               # Un directorio por modulo

lib/
  auth.js           # JWT, cookies, sesion
  permisos.js       # Definicion de permisos
  prisma.js         # Cliente Prisma singleton
  grupos.js         # Helpers de grupos
  mappers/          # Transformadores DB → API
  conversiones/     # Logica de conversion de unidades

prisma/
  schema.prisma     # Schema completo (18+ modelos)
  migrations/       # Migraciones
  seed.js           # Seed de datos iniciales
```

## Convencion de nombres

- **Archivos**: camelCase para componentes (`SunmiButton.jsx`), kebab-case para rutas (`actualizacion-precios/`)
- **Base de datos**: snake_case (`precio_costo`, `codigo_barra`)
- **API responses**: camelCase (`precioCosto`, `codigoBarra`)
- **Componentes**: PascalCase (`ActualizacionPreciosPage`)

## Sistema multi-tenancy: Grupos > Locales

```
Grupo (ej: "Cadena Norte")
  ├── Deposito 1 (es_deposito: true)
  ├── Local A (es_deposito: false)
  └── Local B (es_deposito: false)
```

- Un **Grupo** agrupa depositos y locales
- Los **ProductoBase** pertenecen a un grupo (`grupoId`)
- Cada local tiene **ProductoLocal** (override de precios) y **StockLocal** (inventario)
- Las transferencias ocurren entre locales del mismo grupo
- El admin puede cambiar de grupo activo via cookie `erpazul_grupo_activo`

## Deposito vs Local

| Aspecto | Deposito | Local |
|---------|----------|-------|
| `es_deposito` | `true` | `false` |
| Stock en | Bultos | Unidades |
| Precios mostrados | Por bulto | Por unidad |
| Rol en transferencias | Origen (envia) | Destino (recibe) |
| Crea productos | Si (replica a locales) | No |

La conversion se hace con `factor_pack`:
```
stock_unidades = stock_bultos * factor_pack
```

## Output

El proyecto esta configurado con `output: "standalone"` en `next.config.mjs` para deploy como contenedor independiente.
