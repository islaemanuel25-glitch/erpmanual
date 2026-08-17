# Inventario de pantallas — para marcar el alcance del rediseño móvil

> **Este documento no propone nada.** Es una lista para que Emanuel marque, pantalla
> por pantalla, qué pasa con cada una. No hay recomendaciones adentro a propósito.

**Son 80 pantallas** que una persona puede abrir y ver. Hay 92 archivos de página en
el repo; los 12 que faltan no son pantallas y están listados al final, con el motivo.

## Cómo se enumeraron

Con `git ls-files --cached --others --exclude-standard "app/**/page.jsx"`, que
recorre **el repo entero** —trackeado y sin commitear— y no un nivel de directorio.
En el App Router de Next, un archivo `page.jsx` es exactamente una dirección que se
puede abrir, así que la lista no depende de que alguien se acuerde de agregar una.

Los nombres en criollo salen de tres lugares, en este orden: **el menú lateral**
—que es el nombre que Emanuel ya ve—, el título que la pantalla dibuja, y el
comentario de cabecera del archivo. Ninguna descripción está inventada de memoria.

**Las dos columnas de datos:**

- **Huella** — si la pantalla está en `tests/huellas/baseline/`, que es la foto
  contra la que se compara si algo se movió sin querer. Son 15 adentro, 4 declaradas
  afuera con su motivo, y 5 que no pueden tener huella porque no dibujan ninguna
  tabla. El resto nunca se relevó.
- **Tandas** — si el roadmap del kit tiene anotada alguna tanda **de aspecto** que
  toque esa pantalla. Las tandas de plomería interna no se cuentan acá porque no
  sirven para decidir un rediseño.

## Cómo marcar

Poné una `x` en la casilla que corresponda:

    [x] cambia entera    [ ] cambia en parte    [ ] queda igual

---

# ANTES DE MARCAR: TRES TANDAS QUE TOCAN TODAS LAS PANTALLAS

Estas no están en la lista de abajo porque no son de una pantalla: **se marcan
solas si se aprueban, y mueven las 80 a la vez.** Conviene decidirlas primero,
porque cambian el sentido de todo lo que se marque después.

**1 · El alto de los botones: 36 px hoy, 44 en la navegación del propio repo.**
Son 494 usos del botón en 150 archivos. Subirlo hace los botones más altos y con
eso crecen las barras, los modales y las filas que los contengan. Se nota sobre
todo en la Sunmi del mostrador, que se toca con el dedo.

**2 · El color de aviso no existe como token.** Todo lo que la aplicación marca
como "aviso" es el mismo naranja fijo en las catorce apariencias. Mientras no se
defina, cualquier cambio hacia ese color es decorativo.

**3 · El círculo con la inicial del operario entra por el encabezado.** Vive en una
pieza que dibuja el `Header`, así que **aparece en toda pantalla que tenga
encabezado**, y arrastra el mismo problema de `--accent` con texto blanco de 10 px
en negrita. Lo que se decida ahí se ve en todos lados, no solo en auditoría.

---

# A · TODOS LOS DÍAS — vender y manejar la caja

### 1. POS Ventas — `/modulos/pos-ventas`
La pantalla donde se vende: se cargan productos, se cobra y se cierra el ticket.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 2. Abrir caja — `/modulos/pos-ventas/aperturas`
Lo primero que ve el operador después del PIN cuando no tiene turno abierto.
Muestra los sobres de cambio que dejaron los cierres anteriores para elegir uno.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 3. Abrir caja contando el sobre — `/modulos/pos-ventas/aperturas/[cambioId]`
Se cuenta lo que hay adentro del sobre y se compara contra lo que dejó el cierre.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 4. Abrir caja sin sobre — `/modulos/pos-ventas/aperturas/sin-cambio`
Abrir el turno cuando no se toma ningún cambio anterior.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 5. Cierres pendientes — `/modulos/pos-ventas/cierres`
La bandeja de cierres a medio hacer. Existe porque el corte ya congeló el turno: si
el cajero cierra la pestaña o se va, el cierre tiene que poder retomarse.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 6. Cerrar caja, separar el cambio — `/modulos/pos-ventas/cierres/iniciar`
El paso previo del cierre: se cuenta el dinero que queda para seguir vendiendo y se
ve cuánto se va a retirar. Es el único momento en que todavía no pasó nada.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 7. Cerrar caja, contar el retiro — `/modulos/pos-ventas/cierres/[token]`
Se cuenta el dinero que se retira y se confirma el cierre, con el corte ya tomado.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 8. Retirar recaudación, paso previo — `/modulos/pos-ventas/retiros/nuevo`
Revisar la caja y separar el cambio antes de sacar plata sin cerrar el turno.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 9. Retirar recaudación, contar — `/modulos/pos-ventas/retiros/[token]`
Contar el dinero que se retira y confirmarlo, con el corte ya tomado.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 10. Identificarse para operar — `/bloqueo-operador`
La pantalla del PIN: quién está atendiendo la caja.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 11. Turnos y cierres — `/modulos/turnos`
El listado de turnos con lo que se vendió y lo que se cerró en cada uno.
**Huella:** SÍ, en la línea de base · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 12. Detalle de un turno — `/modulos/turnos/[id]`
Todo lo que pasó en un turno: ventas, movimientos de caja y diferencias.
**Huella:** no puede tener (no dibuja tabla) · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 13. Cambios pendientes — `/modulos/turnos/cambios-pendientes`
Consulta de los sobres de cambio que quedaron dando vueltas entre turnos.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 14. POS Transferencias — `/modulos/pos-transferencias`
Mandar mercadería de un local a otro desde el punto de venta.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 15. Nueva transferencia desde el POS — `/modulos/pos-transferencias/nueva`
Armar el envío: qué productos y cuántos.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# B · TODOS LOS DÍAS — comprar y recibir

### 16. Nuevo pedido a proveedor — `/modulos/compras-proveedor/nueva`
Donde se arma el pedido: se eligen productos, cantidades y costos. **Es la pantalla
más grande de la aplicación** (2.378 líneas) y la única donde se edita un borrador.
**Huella:** no · **Tandas:** el aviso de costo distinto vive acá y se decidió que se
queda
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 17. Pedidos pendientes — `/modulos/compras-proveedor/pendientes`
Los pedidos que se están armando y todavía no se mandaron.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 18. Recibir mercadería — `/modulos/compras-proveedor/recepcion`
La lista de pedidos ya enviados esperando que llegue el camión.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 19. Detalle de un pedido — `/modulos/compras-proveedor/[id]`
Lo que se pidió, lo que trajo la factura y lo que se recibió de verdad. Acá se
suben las fotos del comprobante y se concilia contra la boleta.
**Huella:** declarada AFUERA — necesita un comprobante subido y leído.
**Es la única pantalla con tabla que no tiene foto de referencia**, así que si un
cambio del kit la mueve, no se entera nadie.
**Tandas:** dos modales con un renglón de texto que está escrito y no se dibuja
—sumarían 31 px de alto—; la segunda tabla vacía al subir un comprobante; y el
color de aviso escrito a mano en vez de salir del tema. Además, **hoy se puede
agregar un producto a un pedido enviado y no se puede sacar** desde esta pantalla.
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 20. Historial de pedidos — `/modulos/compras-proveedor/historial`
Los pedidos ya cerrados, para consultar.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 21. Ganancia del depósito — `/modulos/compras-proveedor/ganancia`
Ranking de proveedores y cuánto se ganó con lo que se compró.
**Huella:** declarada AFUERA — hace falta una compra dentro del período ·
**Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 22. Proveedores — `/modulos/proveedores`
La lista de proveedores con sus datos y días de visita.
**Huella:** SÍ · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 23. Nuevo proveedor — `/modulos/proveedores/nuevo`
Alta de un proveedor.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 24. Editar proveedor — `/modulos/proveedores/editar`
Modificar los datos de un proveedor.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 25. Listas de proveedores — `/modulos/proveedores/listas`
Las listas de precios que mandaron los proveedores, para importar.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 26. Importar una lista — `/modulos/proveedores/listas/nueva`
Subir el Excel del proveedor y elegir el recargo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 27. Conciliar una lista — `/modulos/proveedores/listas/[id]`
Producto por producto: qué mandó el proveedor, contra qué se cruzó, y qué costo
queda. Es donde se decide si el aumento se aplica.
**Huella:** declarada AFUERA — hace falta una importación abierta ·
**Tandas:** dos modales —revertir y terminar— con un renglón de texto escrito que
no se dibuja. Está trabada para medir: no hay ninguna lista importada en la base de
desarrollo.
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 28. Recetas de facturas — `/modulos/proveedores/recetas`
Cómo viene armada la factura de cada proveedor, para que el lector la entienda.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 29. Pedidos — `/modulos/pedidos`
Los pedidos de los locales al depósito. Segunda pantalla más grande (1.037 líneas).
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 30. Historial de pedidos de local — `/modulos/pedidos/historial`
Los pedidos de local ya cerrados.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# C · SEGUIDO — productos, stock y clientes

### 31. Productos — `/modulos/productos`
El catálogo: nombre, código, costo, precio de venta y stock.
**Huella:** SÍ, y también con una fila seleccionada · **Tandas:** ninguna propia
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 32. Nuevo producto — `/modulos/productos/nuevo`
Alta de un producto.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 33. Editar producto — `/modulos/productos/editar/[id]`
La ficha completa de un producto.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 34. Editar producto (otra puerta) — `/modulos/productos/[id]/editar`
La misma ficha, a la que se llega desde otro lado.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 35. Edición rápida — `/modulos/productos/edicion-rapida`
Cambiar precios y datos de muchos productos seguidos, sin abrir la ficha de cada uno.
**Huella:** SÍ, y también con una fila editada · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 36. Actualización de precios — `/modulos/productos/actualizacion-precios`
Subir precios en bloque.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 37. Nuevo combo — `/modulos/productos/nuevo-combo`
Armar un combo de varios productos que se vende como uno.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 38. Editar combo — `/modulos/productos/editar-combo/[productoLocalId]`
Modificar un combo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 39. Categorías — `/modulos/categorias`
Las categorías con las que se agrupan los productos.
**Huella:** SÍ · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 40. Stock por local — `/modulos/stock_locales`
Cuánto hay de cada producto en cada ubicación.
**Huella:** SÍ · **Tandas:** los grises de texto (vía el modal de ajuste)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 41. Transferencias — `/modulos/transferencias`
Mercadería moviéndose entre depósito y locales.
**Huella:** no puede tener (no dibuja tabla) · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 42. Detalle de una transferencia — `/modulos/transferencias/[id]`
Qué se mandó, qué se recibió y qué falta.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 43. Clientes — `/modulos/clientes`
La lista de clientes con su cuenta corriente y puntos. Es la pantalla con más
tablas de todas (1.916 líneas).
**Huella:** SÍ · **Tandas:** DOS de las cinco tablas a letra más chica (de 12 a
10,5 px); los grises de texto (vía el modal de unir clientes)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 44. Detalle de un cliente — `/modulos/clientes/[id]`
Todo lo de un cliente: compras, fiado, puntos.
**Huella:** no puede tener (no dibuja tabla) · **Tandas:** las OTRAS TRES tablas a
letra más chica — historial de ventas, cuenta corriente y movimientos
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 45. Análisis de clientes — `/modulos/clientes/analytics`
Quiénes compran más, cada cuánto, y cuánto gastan.
**Huella:** SÍ · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 46. Fidelidad — `/modulos/fidelidad`
Cómo se ganan y se gastan los puntos.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# D · DE VEZ EN CUANDO — reportes y auditoría

### 47. Reportes de ventas — `/modulos/reportes-ventas`
Qué se vendió, cuándo y quién lo vendió.
**Huella:** no puede tener (no dibuja tabla) · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 48. Ver una venta — `/modulos/reportes-ventas/[ventaId]`
El detalle de un ticket.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 49. Corregir una venta — `/modulos/reportes-ventas/[ventaId]/corregir`
Arreglar un ticket mal cargado, con el turno original todavía abierto.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 50. Detalle de venta (otra puerta) — `/modulos/ventas/[id]`
La misma venta vista desde otro lado.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 51. Stock valorizado — `/modulos/reportes-stock`
Cuánta plata hay parada en mercadería. Es la tabla más larga: 1.790 filas.
**Huella:** SÍ · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 52. Auditoría POS — `/modulos/auditoria-pos-ventas`
La portada de auditoría, con los accesos a las cuatro vistas de abajo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 53. Auditoría · Balances — `/modulos/auditoria-pos-ventas/balances`
Comparar un período contra otro.
**Huella:** no · **Tandas:** `--accent` — el botón de comparar no se resalta y en
los temas claros queda ilegible. Medido y decidido, sin implementar.
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 54. Auditoría · Cajas — `/modulos/auditoria-pos-ventas/cajas`
Cómo cerró cada caja y qué diferencias hubo.
**Huella:** no · **Tandas:** un borde que hoy sale del color de la letra en vez del
color del tema. Se ve, pero está del color equivocado.
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 55. Auditoría · Productos — `/modulos/auditoria-pos-ventas/productos`
Qué se vendió más y qué se movió raro.
**Huella:** no · **Tandas:** `--accent` — tres botones seleccionados y un subrayado
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 56. Auditoría · Turnos — `/modulos/auditoria-pos-ventas/turnos`
Los turnos con lupa. Tercera pantalla más grande (864 líneas).
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 57. Auditoría · Detalle de turno — `/modulos/auditoria-pos-ventas/turnos/[id]`
Las ventas de un turno, una por una. Es la pantalla donde se destapó lo de los
rótulos de 10px.
**Huella:** no · **Tandas:** los rótulos de 10px no se leen — falla en los catorce
temas. **El color ya se arregló** (commit `67e2a56`); lo que queda pendiente es el
tamaño. Además un color de texto que hoy zafa de casualidad y no está medido en los
temas claros.
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 58. Bitácora — `/modulos/auditoria`
Quién cambió qué y cuándo, en todo el sistema.
**Huella:** no · **Tandas:** un color de fondo que funciona pero que ningún tema
puede cambiar
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 59. Dashboard — `/modulos/dashboard`
Los números del día de un vistazo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 60. Notificaciones — `/modulos/notificaciones`
Los avisos del sistema, leídos y sin leer.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# E · ADMINISTRACIÓN Y CONFIGURACIÓN

### 61. Usuarios — `/modulos/usuarios`
Quién entra al sistema y con qué rol.
**Huella:** SÍ · **Tandas:** el gris de los iconitos de acción (`SunmiButtonIcon`);
los grises de texto (vía la celda de usuario)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 62. Operadores — `/modulos/operadores`
Quiénes atienden la caja, con su PIN.
**Huella:** SÍ · **Tandas:** el gris de los iconitos de acción (`SunmiButtonIcon`)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 63. Roles — `/modulos/roles`
Qué puede hacer cada tipo de usuario.
**Huella:** SÍ · **Tandas:** rediseño de roles, con el insumo ya escrito por Emanuel;
el gris de los iconitos de acción
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 64. Locales — `/modulos/locales`
Los locales y el depósito.
**Huella:** SÍ · **Tandas:** el gris de los iconitos de acción; los grises de texto
(vía la tabla de locales)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 65. Grupos — `/modulos/grupos`
Los grupos que agrupan locales.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 66. Nuevo grupo — `/modulos/grupos/nuevo`
Alta de un grupo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 67. Editar grupo — `/modulos/grupos/[id]`
Modificar un grupo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 68. Configuración — `/modulos/configuracion`
La portada de configuración, con los accesos a lo de abajo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 69. Apariencia — `/modulos/configuracion/apariencia`
El tema del local y la preferencia de cada dispositivo.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 70. Configuración de stock — `/modulos/configuracion/stock`
Cómo se controla el stock.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 71. Configuración del POS — `/modulos/configuracion/pos-ventas`
Cómo se comporta la caja: si exige operario, qué formas de pago acepta.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 72. Ticket — `/modulos/configuracion/ticket`
Cómo sale impreso el ticket, con vista previa de 58mm.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 73. Retiros de recaudación — `/modulos/configuracion/arqueo-caja`
Las reglas de los retiros de caja.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 74. Listas de precios — `/modulos/configuracion/listas-precios`
Las listas con las que se calcula el precio de venta.
**Huella:** SÍ · **Tandas:** el gris de los iconitos de acción (`SunmiButtonIcon`)
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 75. Alertas del dispositivo — `/modulos/configuracion/alertas-dispositivo`
Qué avisos suenan en este aparato.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 76. Mantenimiento — `/modulos/configuracion/mantenimiento`
La zona peligrosa: reiniciar la base operativa.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# F · ENTRADA Y NAVEGACIÓN

### 77. Iniciar sesión — `/login`
Usuario y contraseña.
**Huella:** no · **Tandas:** los grises de texto
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 78. Elegir contexto — `/inicio`
En qué local o depósito se va a trabajar. Sale después de entrar.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 79. Inicio — `/modulos/inicio`
El saludo, el aviso de proveedores del día y los accesos a los módulos.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

### 80. Compras — `/modulos/compras`
Portada de compras: manda a la pantalla que corresponda según lo que se quiera.
**Huella:** no · **Tandas:** ninguna anotada
`[ ] cambia entera    [ ] cambia en parte    [ ] queda igual`

---

# Los 12 archivos que NO son pantallas

No hay nada que marcar acá. Se listan para que el número cierre y para que nadie
los busque después.

**Ocho son redirecciones**: alguien entra a una dirección vieja y el sistema lo
manda a la nueva sin dibujar nada. Son `compras-proveedor/activos`,
`compras-proveedor` (la portada), `locales/nuevo`, `locales/editar/[id]`,
`roles/nuevo`, `roles/editar/[id]`, `usuarios/nuevo` y `usuarios/editar/[id]`.
Las cuatro últimas abren un panel sobre la lista en vez de una pantalla propia.

**Tres son andamios de desarrollo** —`andamio-carrito`, `andamio-escape` y
`andamio-velo`— y **no existen en producción**: cortan solas cuando el sistema no
está en modo desarrollo.

**Una está vacía**: `app/modulos/page.jsx` dibuja un recuadro sin nada adentro.
Es un archivo de siete líneas que probablemente sobra, pero eso es otra tanda.

---

# Lo que este inventario NO dice

Tres cosas, para que la lista no se lea como más de lo que es.

**No dice cómo se ve cada pantalla en un teléfono.** Nadie las midió a 360 de
ancho. La única medición de ancho angosto que existe en el repo es puntual y de
otra tanda.

**"Sin tanda anotada" no significa "está bien".** Significa que nadie la relevó.
De las 80, sólo 15 tienen huella, así que de las otras 65 no hay una foto contra la
cual comparar si algo se movió.

**Las tandas de los grises tocan pantallas por dentro.** Los grises de 10px no
viven en las pantallas sino en piezas compartidas —el menú lateral, la celda de
usuario, dos modales—, así que arreglarlos mueve varias pantallas a la vez aunque
la lista las nombre de a una.

**Y una advertencia sobre la columna de tandas:** el roadmap del que sale avisa de
sí mismo que sus notas se quedan viejas, y armando este inventario aparecieron dos
casos. Uno: el gris del detalle de turno ya estaba arreglado y la nota seguía
diciendo que no. Otro: cuatro archivos de la familia de grises **no los importa
nadie**, así que arreglarlos no cambiaría ninguna pantalla. Antes de arrancar
cualquiera de estos pendientes conviene comprobar que el problema siga existiendo.
