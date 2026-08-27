# Modulo: Proveedores

**Última actualización:** 2026-08-27 09:55

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
- 2026-08-27: feat(compras): Facturas y Listas escriben y leen la misma memoria del proveedor
- 2026-08-09: feat(listas): TERMINADA cierra el trabajo sin cerrar la vuelta atrás
- 2026-08-09: fix(listas): la tapa cuenta lo mismo que adentro, y en productos
- 2026-08-09: feat(listas): deshacer una aplicacion, con la previa a la vista antes de confirmar
- 2026-08-09: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- 2026-08-09: fix(listas): la tapa cuenta lo mismo que adentro, y en productos
- 2026-08-09: feat(listas): deshacer una aplicacion, con la previa a la vista antes de confirmar
- 2026-08-09: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- 2026-08-09: feat(listas): deshacer una aplicacion, con la previa a la vista antes de confirmar
- 2026-08-09: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- 2026-08-09: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- 2026-08-09: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- 2026-08-08: feat(listas): las cards son el filtro y el panel no repite el producto
- 2026-08-08: feat(listas): la pantalla dada vuelta — el producto como unidad
- 2026-08-08: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): las cards son el filtro y el panel no repite el producto
- 2026-08-08: feat(listas): la pantalla dada vuelta — el producto como unidad
- 2026-08-08: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): las cards son el filtro y el panel no repite el producto
- 2026-08-08: feat(listas): la pantalla dada vuelta — el producto como unidad
- 2026-08-08: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): la pantalla dada vuelta — el producto como unidad
- 2026-08-08: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): el macheo se guarda cuando la fila se aplica
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- 2026-08-08: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-08: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- 2026-08-08: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- 2026-08-08: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- 2026-08-06: feat(listas): vistas por producto en el área principal y reportes PDF
- 2026-08-06: feat(listas): resumen orientado al ERP, con detalle por producto
- 2026-08-06: feat(listas): grilla operativa para conciliar 190 productos
- 2026-08-06: feat(listas): conciliar presentación y precio por separado, con rango esperado
- 2026-08-06: feat(listas): vistas por producto en el área principal y reportes PDF
- 2026-08-06: feat(listas): resumen orientado al ERP, con detalle por producto
- 2026-08-06: feat(listas): grilla operativa para conciliar 190 productos
- 2026-08-06: feat(listas): conciliar presentación y precio por separado, con rango esperado
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
