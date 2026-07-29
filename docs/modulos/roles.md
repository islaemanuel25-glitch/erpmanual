# Modulo: Roles

**Última actualización:** 2026-07-29 08:16

## Ubicacion
- UI: `app/modulos/roles/page.jsx`
- APIs: `app/api/roles/`
- Componentes: `components/roles/`

## Descripcion
Definicion de roles del sistema con permisos granulares. Cada rol tiene un array de strings de permisos que se verifican en las APIs.

## Funcionalidad principal
- Listado de roles con busqueda
- Crear rol con nombre y permisos
- Editar permisos de un rol
- Eliminar rol (solo si no tiene usuarios asignados)

## Dependencias

### Usado por
- Usuarios (rolId)

## APIs

### Expone
- `GET /api/roles/listar?q=&page=`
- `GET /api/roles/obtener?id=`
- `POST /api/roles/crear`
- `PUT /api/roles/editar/[id]`
- `DELETE /api/roles/eliminar/[id]`

## Componentes principales
- `ModalRol`: Modal de crear/editar con selector de permisos

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- `roles.editar`

## Modelo de datos

```prisma
model Rol {
  id        Int       @id @default(autoincrement())
  nombre    String    @unique
  permisos  Json      @default("[]")  // Array de strings
}
```

## Permisos disponibles

```
productos.ver, productos.crear, productos.editar, productos.eliminar
stock.ver
transferencias.crear, transferencias.recibir
pos.usar, pos.anular
compras.crear, compras.ver
proveedores.ver
usuarios.ver, usuarios.editar, usuarios.eliminar
roles.editar
reportes.ver
```

El permiso `"*"` otorga acceso total (admin).

## Cambios recientes
- 2026-07-26: feat(rbac): registrar roles y permisos de sistema
- 2026-07-26: fix(security): endurecer permisos y aislamiento entre grupos y locales
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
