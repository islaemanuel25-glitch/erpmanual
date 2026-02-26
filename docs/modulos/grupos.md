# Modulo: Grupos

## Ubicacion
- UI: `app/modulos/grupos/page.jsx`, `app/modulos/grupos/[id]/page.jsx`
- APIs: `app/api/grupos/`
- Componentes: `components/grupos/`

## Descripcion
Agrupacion logica de locales y depositos. Los productos pertenecen a un grupo y se replican a todos sus locales. Las transferencias solo ocurren dentro de un mismo grupo.

## Funcionalidad principal
- Listado con busqueda y ordenamiento
- Crear grupo
- Editar nombre
- Asignar/desasignar locales y depositos
- Sincronizar productos del deposito a locales
- Selector de grupo activo (admin)

## Dependencias

### Usado por
- Productos (grupoId)
- Locales (via GrupoDeposito, GrupoLocal)
- Transferencias (origen/destino deben ser del mismo grupo)
- Actualizacion de Precios (grupoId de sesion)

## APIs

### Expone
- `GET /api/grupos/listar?q=&ordenParam=&page=`
- `GET /api/grupos/opciones` — solo grupos autorizados para el usuario
- `POST /api/grupos/crear`
- `GET /api/grupos/[id]`
- `PUT /api/grupos/[id]`
- `DELETE /api/grupos/[id]`
- `GET /api/grupos/[id]/depositos`
- `POST /api/grupos/[id]/depositos` — asignar deposito
- `DELETE /api/grupos/[id]/depositos` — desasignar
- `GET /api/grupos/[id]/locales`
- `POST /api/grupos/[id]/locales` — asignar local (hereda productos)
- `DELETE /api/grupos/[id]/locales`
- `POST /api/grupos/[id]/sync-productos` — sincronizar catalogo

## Componentes principales
- `ModalGrupo`: Modal de crear/editar
- `EditorGrupo`: Vista de detalle con tabs de locales/depositos
- `SelectAgregarLocal` / `SelectAgregarDeposito`: Selectores para asignar
- `TablaLocales` / `TablaDepositos`: Tablas de asignaciones

**Nota:** El contexto se elige solo en /inicio y se muestra en Header.

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- Admin (`*`) para gestion completa

## Modelo de datos

```prisma
model Grupo {
  id      Int    @id @default(autoincrement())
  nombre  String @unique
}

model GrupoDeposito {
  id       Int @id @default(autoincrement())
  grupoId  Int
  localId  Int
  @@unique([grupoId, localId])
}

model GrupoLocal {
  id       Int @id @default(autoincrement())
  grupoId  Int
  localId  Int @unique
  @@unique([grupoId, localId])
}
```
