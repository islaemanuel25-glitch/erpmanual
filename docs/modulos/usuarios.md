# Modulo: Usuarios

**Última actualización:** 2026-07-26 01:08

## Ubicacion
- UI: `app/modulos/usuarios/page.jsx`
- APIs: `app/api/usuarios/`
- Componentes: `components/usuarios/`

## Descripcion
ABM de usuarios del sistema. Cada usuario tiene un rol (con permisos) y opcionalmente un local asignado.

## Funcionalidad principal
- Listado con busqueda y filtros (rol, local)
- Crear usuario con rol y local opcional
- Editar usuario (nombre, email, password, rol, local, estado)
- Eliminar (soft delete: marca activo=false)
- Reactivar usuarios inactivos

## Dependencias

### Usa
- Roles (rolId)
- Locales (localId)

### Usado por
- Transferencias (confirmadoPor)
- POS Transferencias (usuarioId)

## APIs

### Consume
- `GET /api/usuarios/listarRoles`
- `GET /api/usuarios/listarLocales`

### Expone
- `GET /api/usuarios/listar?search=&rol=&local=&activo=&page=`
- `GET /api/usuarios/obtener?id=`
- `POST /api/usuarios/crear`
- `PUT /api/usuarios/editar/[id]`
- `DELETE /api/usuarios/eliminar/[id]`
- `PUT /api/usuarios/reactivar/[id]`
- `DELETE /api/usuarios/eliminarPorEmail`

## Componentes principales
- `ModalUsuario`: Modal de crear/editar
- `SunmiTableUsuarios`: Tabla de usuarios
- `CeldaUsuario`: Celda con avatar y email

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- `usuarios.ver`
- `usuarios.editar`
- `usuarios.eliminar`

## Modelo de datos

```prisma
model Usuario {
  id            Int       @id @default(autoincrement())
  nombre        String
  email         String    @unique
  passwordHash  String
  rolId         Int
  localId       Int?
  activo        Boolean   @default(true)
}
```

## Protecciones
- No se puede eliminar el propio usuario
- No se puede eliminar usuarios con rol Admin
- Eliminacion es soft (activo=false), no hard delete
- Password se hashea con bcrypt antes de guardar

## Cambios recientes
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
