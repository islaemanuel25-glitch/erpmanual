# Modulo: Proveedores

**Última actualización:** 2026-08-06 11:58

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

## Cambios recientes
- 2026-08-06: feat(listas): resumen orientado al ERP, con detalle por producto
- 2026-08-06: feat(listas): grilla operativa para conciliar 190 productos
- 2026-08-06: feat(listas): conciliar presentación y precio por separado, con rango esperado
- 2026-08-06: feat(listas): grilla operativa para conciliar 190 productos
- 2026-08-06: feat(listas): conciliar presentación y precio por separado, con rango esperado
- 2026-08-06: feat(listas): conciliar presentación y precio por separado, con rango esperado
- 2026-08-05: fix(listas): separar la cantidad contenida de la base del precio
- 2026-08-05: fix(listas): dar salida operativa a las filas por revisar
- 2026-08-05: fix(precios): la vista "Listas" mostraba solo las filas ya aplicadas
- 2026-08-05: fix(precios): aplicar listas por tandas sin cerrar la importación
- 2026-08-05: fix(precios): permitir cancelar una importación y liberar su archivo
- 2026-08-05: feat(precios): pantalla de revisión producto por producto antes de aplicar
- 2026-08-05: feat(precios): aplicar los costos de una lista de proveedor
- 2026-08-05: feat(precios): vincular a mano las filas no macheadas de una lista
- 2026-08-05: feat(precios): agregar interfaz de listas de proveedores
- 2026-08-05: feat(precios): persistir conciliaciones de proveedores
- 2026-08-05: fix(listas): separar la cantidad contenida de la base del precio
- 2026-08-05: fix(listas): dar salida operativa a las filas por revisar
- 2026-08-05: fix(precios): la vista "Listas" mostraba solo las filas ya aplicadas
- 2026-08-05: fix(precios): aplicar listas por tandas sin cerrar la importación
- 2026-08-05: fix(precios): permitir cancelar una importación y liberar su archivo
- 2026-08-05: feat(precios): pantalla de revisión producto por producto antes de aplicar
- 2026-08-05: feat(precios): aplicar los costos de una lista de proveedor
- 2026-08-05: feat(precios): vincular a mano las filas no macheadas de una lista
- 2026-08-05: feat(precios): agregar interfaz de listas de proveedores
- 2026-08-05: feat(precios): persistir conciliaciones de proveedores
- 2026-08-05: fix(listas): dar salida operativa a las filas por revisar
- 2026-08-05: fix(precios): la vista "Listas" mostraba solo las filas ya aplicadas
- 2026-08-05: fix(precios): aplicar listas por tandas sin cerrar la importación
- 2026-08-05: fix(precios): permitir cancelar una importación y liberar su archivo
- 2026-08-05: feat(precios): pantalla de revisión producto por producto antes de aplicar
- 2026-08-05: feat(precios): aplicar los costos de una lista de proveedor
- 2026-08-05: feat(precios): vincular a mano las filas no macheadas de una lista
- 2026-08-05: feat(precios): agregar interfaz de listas de proveedores
- 2026-08-05: feat(precios): persistir conciliaciones de proveedores
- 2026-07-26: fix(security): completar aislamiento y permisos por local
- 2026-07-26: fix(security): endurecer permisos y aislamiento entre grupos y locales
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- 2026-07-23: feat(productos,proveedores): visibilidad depósito ↔ locales
