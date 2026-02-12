# Modulo: Proveedores

## Ubicacion
- UI: `app/modulos/proveedores/page.jsx`
- APIs: `app/api/proveedores/`
- Componentes: `components/proveedores/`

## Descripcion
ABM de proveedores con informacion de contacto y dias de pedido.

## Funcionalidad principal
- Listado paginado con busqueda (nombre, CUIT, email, direccion) y filtro de estado
- Crear proveedor con dias de pedido
- Editar datos
- Eliminar (solo si no tiene productos asignados)
- Selector de opciones para dropdowns

## Dependencias

### Usado por
- Productos (proveedor_id)
- Actualizacion de Precios (proveedorId)

## APIs

### Expone
- `GET /api/proveedores/listar?search=&estado=&page=&pageSize=`
- `GET /api/proveedores/obtener?id=`
- `POST /api/proveedores/crear`
- `PUT /api/proveedores/editar`
- `DELETE /api/proveedores/eliminar`
- `GET /api/proveedores/opciones` — proveedores activos para dropdowns

### Alias
- `GET /api/catalogos/proveedores` — wrapper

## Componentes principales
- `ModalProveedor`: Modal de crear/editar

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- `proveedores.ver`

## Modelo de datos

```prisma
model Proveedor {
  id          Int         @id @default(autoincrement())
  nombre      String
  cuit        String?     @unique
  telefono    String?
  email       String?
  direccion   String?
  dias_pedido DiaPedido[]
  activo      Boolean     @default(true)
}

enum DiaPedido {
  Lunes
  Martes
  Miercoles
  Jueves
  Viernes
  Sabado
  Domingo
}
```
