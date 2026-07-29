# Modulo: Categorias

**Última actualización:** 2026-07-29 08:16

## Ubicacion
- UI: `app/modulos/categorias/page.jsx`
- APIs: `app/api/categorias/`
- Componentes: `components/categorias/`

## Descripcion
Clasificacion de productos por categoria. Las categorias son globales (no por grupo).

## Funcionalidad principal
- Listado paginado con busqueda y filtro de estado
- Crear categoria
- Editar nombre y estado
- Eliminar (solo si no tiene productos asignados)

## Dependencias

### Usado por
- Productos (categoria_id)
- Stock (filtro por categoria)
- POS Transferencias (filtro por categoria)

## APIs

### Expone
- `GET /api/categorias/listar?search=&estado=&page=&pageSize=`
- `POST /api/categorias/crear`
- `PUT /api/categorias/editar`
- `POST /api/categorias/eliminar`

### Alias
- `GET /api/catalogos/categorias` — wrapper para dropdowns

## Componentes principales
- `ModalCategoria`: Modal de crear/editar

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- Autenticacion basica (no tiene permiso especifico)

## Modelo de datos

```prisma
model Categoria {
  id      Int     @id @default(autoincrement())
  nombre  String
  activo  Boolean @default(true)
}
```

## Cambios recientes
- 2026-07-26: fix(security): completar aislamiento y permisos por local
- 2026-07-26: fix(security): endurecer permisos y aislamiento entre grupos y locales
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
