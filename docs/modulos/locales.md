# Modulo: Locales

**Última actualización:** 2026-07-26 01:08

## Ubicacion
- UI: `app/modulos/locales/page.jsx`
- APIs: `app/api/locales/`
- Componentes: `components/locales/`

## Descripcion
ABM de locales fisicos (tiendas) y depositos (almacenes). Cada local pertenece a un grupo y tiene su propio inventario.

## Funcionalidad principal
- Listado con busqueda y filtro de estado
- Crear local o deposito
- Editar datos (nombre, tipo, direccion, contacto, estado)
- Eliminar local
- Asignar a grupo (con herencia de productos)
- Filtrar solo locales o solo depositos

## Dependencias

### Usa
- Grupos (via GrupoDeposito, GrupoLocal)

### Usado por
- Productos (creadoEnLocalId, ProductoLocal.localId)
- Stock (StockLocal.localId)
- Transferencias (origenId, destinoId)
- POS Transferencias (origenId, destinoId)
- Usuarios (localId)

## APIs

### Expone
- `GET /api/locales` — listar todos
- `POST /api/locales` — crear con auto-asignacion a grupo
- `GET /api/locales/listar?soloDepositos=&soloLocales=`
- `GET /api/locales/[id]`
- `PUT /api/locales/[id]`
- `DELETE /api/locales/[id]`
- `GET /api/locales/[id]/grupo` — ver grupo asignado
- `POST /api/locales/[id]/grupo` — asignar a grupo
- `PUT /api/locales/[id]/grupo` — mover a otro grupo

## Componentes principales
- `ModalLocal`: Modal de crear/editar
- `SunmiTableLocales`: Tabla de locales

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- Admin (`*`)

## Modelo de datos

```prisma
model Local {
  id            Int       @id @default(autoincrement())
  nombre        String
  tipo          String    @default("local")
  direccion     String?
  telefono      String?
  email         String?
  cuil          String?
  ciudad        String?
  provincia     String?
  codigoPostal  String?
  activo        Boolean   @default(true)
  es_deposito   Boolean   @default(false)
}
```

## Diferencia Local vs Deposito

| Campo | Local | Deposito |
|-------|-------|----------|
| `es_deposito` | false | true |
| `tipo` | "local" | "deposito" |
| Stock en | Unidades | Bultos |
| Crea productos | No | Si |
| Rol en transferencias | Recibe | Envia |

## Cambios recientes
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
