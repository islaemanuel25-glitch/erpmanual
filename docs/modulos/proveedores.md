# Modulo: Proveedores

**Última actualización:** 2026-10-10 18:26

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
- 2026-10-10: feat: una explicación por tipo de papel, el CAE contra el duplicado, el cargo repartido en el costo, y se va el código de formato
- 2026-09-28: feat: declarar el origen de las escrituras de costo para el Libro de Costos
- 2026-09-19: fix: el cartel dice en cuánto difiere en vez de afirmar que el precio cambió
- 2026-09-19: feat: el resultado dice cuáles no se van a actualizar y por qué
- 2026-09-19: feat: el resultado revalida lo mismo que aplicar, y ofrece volver a leer
- 2026-09-19: fix: aplicar cero no es un cartel verde que diga "Listo"
- 2026-09-19: fix: deshacer devuelve la fila TILDADA, no solo sin aplicar
- 2026-09-19: fix: lo que el resultado cuenta es lo que aplicar escribe
- 2026-09-18: fix(listas): un producto dado de baja no participa de una lista de proveedor
- 2026-09-18: fix: el rechazo del servidor se ve donde está el pulgar
- 2026-09-18: fix: la hoja de un producto que no vino deja de ser un callejón sin salida
- 2026-09-18: feat: elegir el renglón de la lista se entra por dos puertas
- 2026-09-18: feat: un producto que "no vino" se puede buscar en la lista
- 2026-09-18: fix(listas): una lista abierta se puede cancelar, y desde los dos lados
- 2026-09-18: fix(listas): un título de rubro no es un producto
- 2026-09-18: feat(listas): la evidencia de cada columna a la vista, y cómo salir si se leyó mal
- 2026-09-17: feat: rescatar la lista que ya quedó leída con el rango en cero
- 2026-09-17: feat: "No lo cambio" deja de ser por lista y vale para las que vengan
- 2026-09-17: feat: "No es este producto" — elegir el renglón correcto de la lista
- 2026-09-17: feat: la pantalla del control, pasar a actualizar y bajar el control
- 2026-09-17: feat: la pantalla de subir pregunta para qué, y el resultado cuenta el control
- 2026-09-17: feat: subir una lista para controlar, y el 0 a 0 como control con su aviso
- 2026-09-17: feat: el modo controlar llega al motor, y controlar no escribe costos
- 2026-09-17: fix: el volver mide 44, y el nombre de la pantalla va una sola vez
- 2026-09-17: fix: lo que ya se escribió no se cuenta como "se actualiza"
- 2026-09-17: feat: pantalla 7 — tus productos de este proveedor que no cambian
- 2026-09-17: feat: Se actualizan (v2) — cada producto se toca y se puede sacar de la lista
- 2026-09-17: feat: Resultado (v2) — todas las tarjetas se tocan y llevan a su lista
- 2026-09-17: fix: la barra de la app dice dónde estás, y el volver no se va de pantalla
- 2026-09-17: fix: dos textos que no entraban a 360, vistos en la captura
- 2026-09-17: fix: "Se actualizan" dice cuántos son y cuánto aumentan de verdad
- 2026-09-17: fix: deshacer ya no se cae con 500 cuando la lista se subió dos veces
- 2026-09-17: fix: el rango que anuncia el resumen nunca se sale del configurado
- 2026-09-17: fix: el botón principal de revisar ya no ofrece un costo fuera de rango
- 2026-09-17: refactor: sacar el orden de la cola de revisión a una función pura
- 2026-09-17: fix: sacar "Arcor" escrito fijo de todo el módulo de listas
- 2026-09-17: fix: un solo título en el historial de listas
- 2026-09-17: fix: el selector de proveedor dice por qué está vacío
- 2026-09-17: feat: revisar de a uno también sirve para vincular los que no tenés
- 2026-09-17: feat: el resultado separa lo que no es trabajo y nombra el motivo real
- 2026-09-17: feat: pantalla "Los que se actualizan" (4b) en vez de la tabla vieja
- 2026-09-17: refactor: borrar la pantalla vieja del detalle de listas
- 2026-09-17: feat(listas): el sistema se acuerda de cómo se lee cada producto
- 2026-09-17: fix(listas): ningún costo fuera del rango queda listo ni se escribe solo
- 2026-09-16: fix(listas): tres cosas que la pantalla decía mal, encontradas recorriéndola
- 2026-09-16: feat(listas): las seis pantallas del diseño, enganchadas con el motor
- 2026-09-16: fix(listas): aplicar usa las reglas del lector que leyó la lista
- 2026-09-16: feat(listas): el resultado de una lista, contado como lo mira una persona
- 2026-09-16: feat(listas): la importación acepta la lista de cualquier proveedor
- 2026-09-16: feat(listas): una puerta de entrada para cualquier formato, y la API que confirma las columnas
- 2026-09-16: fix(listas): la fila que queda para revisar muestra su costo y su porcentaje
- 2026-09-16: feat(listas): la pantalla de subir pide y edita la configuración del proveedor
- 2026-09-16: feat(listas): el rango del proveedor elige la lectura, y el display deja de bloquear
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
