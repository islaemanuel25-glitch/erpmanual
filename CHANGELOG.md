# Changelog

## [2026-09-06] - Actualización: pos-ventas, dashboard, reportes-ventas, configuracion, productos

### Modificado
- **pos-ventas**: test: los fixtures traen comisionPendiente, que es lo que trae una venta real
- **pos-ventas**: fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos
- **pos-ventas**: fix(auditoria): un backtick adentro de la plantilla SQL la cerraba
- **pos-ventas**: feat(pos): la comision sin configurar deja de ser un 7 inventado
- **pos-ventas**: fix(configuracion-pos): distinguir "sin procesador" de "todavia no elegi"
- **pos-ventas**: fix(candados): repuntar el de reglas del POS y corregir uno mio que afirmaba mal
- **pos-ventas**: feat(configuracion-pos): las cuatro pantallas del diseno aprobado
- **pos-ventas**: fix(medios): una sola regla para no quedarse sin medios, y contrato explicito para editar un default
- **pos-ventas**: feat(pos): los botones de cobro salen de la configuracion del local
- **pos-ventas**: feat(pos): API de medios de cobro y permiso config_local.medios_cobro
- **pos-ventas**: feat(pos): medios de cobro configurables por local — schema y dominio
- **dashboard**: fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos
- **reportes-ventas**: fix(pos): comisionEsExacta falla cerrado y todos los consumidores quedan cubiertos
- **reportes-ventas**: feat(pos): la comision sin configurar deja de ser un 7 inventado
- **configuracion**: feat(cobros): editar y agregar medio siguen el diseño aprobado
- **configuracion**: feat(shell): la pantalla activa puede poner su propio título
- **configuracion**: fix(cobros): los cuatro medios por defecto vuelven a abrirse desde la lista
- **configuracion**: feat(shell): la pantalla activa puede registrar una accion al lado del titulo
- **configuracion**: fix(cobros): el boton de volver va arriba a la derecha, como en el resto del ERP
- **configuracion**: fix(cobros): Volver va a la izquierda
- **configuracion**: fix(cobros): el titulo dice Cobros, y aparece el boton de volver
- **configuracion**: feat(cobros): la lista usa el mismo patron que Configuracion POS
- **configuracion**: fix(sunmi): dos rojos que encontraron los candados, y los dos tenian razon
- **configuracion**: feat(sunmi): SunmiNavCard, y sacar de la portada lo que el Header ya muestra
- **configuracion**: test(config-pos): exigir shell mobile global
- **configuracion**: fix(config-pos): integrar diseño dentro del shell del ERP
- **configuracion**: fix(config-pos): restaurar header global en mobile
- **configuracion**: test(config-pos): blindar portada mobile y tokens de theme
- **configuracion**: feat(layout): dar chrome mobile propio a configuración POS
- **configuracion**: feat(config-pos): aplicar portada mobile aprobada en Figma
- **configuracion**: fix(configuracion-pos): Apariencia se muestra apagada y no lleva a ningun lado
- **configuracion**: test(configuracion-pos): candar quien ve que adentro de Configuracion POS
- **configuracion**: fix(configuracion-pos): distinguir "sin procesador" de "todavia no elegi"
- **configuracion**: feat(configuracion-pos): las cuatro pantallas del diseno aprobado
- **configuracion**: fix(menu): un permiso sin camino es un permiso que no existe
- **productos**: test(alertas): mandar la ficha entera, y que la ruta diga que salio mal

### Detalle — formularios de cobros (rama feat/cobros-formulario-figma)
- Editar y agregar medio siguen los frames aprobados versionados en `docs/diseno/configuracion-pos/`.
- El título del shell pasa a decir el nombre del medio —"Efectivo", "Mercado Pago", "Crédito"— y "Agregar medio" al crear.
- La acción "← Volver" queda en la misma fila que el título.
- Se sacan la cinta ámbar con el nombre del medio y el subtítulo "Cobros · Local: …".
- Cada pantalla trae su bajada: "Configurá cómo se muestra y se cobra con este medio." al editar y "Creá un nuevo medio de cobro para este local." al crear.
- Sin cambios de comportamiento: recargo, comisión, herencia por campo vacío y override con 0 quedan como estaban.
- Numérico ya validado en navegador real: escribir "1" sobre "0" da "1", pegar "10" da "10" y el "0" inicial queda seleccionado al enfocar.
- El título se registra y se limpia por identidad, así dos medios con el mismo nombre no se pisan la fila del shell.
- Verificado a 360, 390, 412 y 1280 px. Suite final: 5014 candados, 0 rojos.
- No se modificaron APIs, Prisma, migraciones, POS, `LayoutBase.jsx` ni `Header.jsx`.


## [2026-09-04] - Actualización: pos-ventas, productos, configuracion

### Modificado
- **pos-ventas**: fix(pos): el ticket imprime lo que se cobro, y una venta desfasada se rechaza SIN VERIFICAR
- **pos-ventas**: feat(pos): el cajero ve el total de cada medio antes de elegir SIN VERIFICAR
- **pos-ventas**: feat(pos): la venta resuelve la oferta y el recargo en el servidor SIN VERIFICAR
- **productos**: feat(productos): el listado informa si un producto está en una oferta vigente SIN VERIFICAR
- **configuracion**: feat(ofertas): módulo de Ofertas y pantalla de recargos por medio de pago SIN VERIFICAR


## [2026-09-02] - Actualización: productos

### Modificado
- **productos**: feat(productos): en qué presentación se vende y en cuál se compra cada producto


## [2026-09-01] - Actualización: pos-ventas

### Modificado
- **pos-ventas**: fix(pos): ocultar stock de la venta
- **pos-ventas**: fix(pos): ampliar el tiempo de la venta interna medida


## [2026-08-31] - Actualización: pos-ventas, proveedores

### Modificado
- **pos-ventas**: fix(pos): ampliar el tiempo de la venta interna medida
- **proveedores**: feat(compras): Facturas y Listas escriben y leen la misma memoria del proveedor


## [2026-08-27] - Actualización: proveedores

### Modificado
- **proveedores**: feat(compras): Facturas y Listas escriben y leen la misma memoria del proveedor


## [2026-08-25] - Actualización: stock

### Modificado
- **stock**: fix(stock): mostrar packs y unidades en movil (#12)


## [2026-08-22] - Actualización: productos

### Modificado
- **productos**: feat(productos): "Para revisar" pasa de grilla 2x2 a riel, y la card activa se enciende
- **productos**: fix(productos): la pantalla deja de esperar al contexto, y se retira el chip
- **productos**: perf(productos): el conteo de "Para revisar" pasa de 504 a 289 ms
- **productos**: fix(productos): la equivalencia sale del mismo precio que el número grande, y Import / Export deja de estar duplicado
- **productos**: fix(productos): el corte de 5.000 usa el mismo orden en las dos consultas, y se saca un comentario que ya era falso
- **productos**: fix(productos): `precios/apply` decide la revisión con el precio de la base, no con el del navegador
- **productos**: fix(productos): el contraste se mide con el umbral que corresponde, y se resuelve sin tocar ningún theme
- **productos**: fix(productos): con un control activo, la lista ES la población de esa card — siempre
- **productos**: fix(productos): la card y el listado dan el mismo número, y un conteo parcial deja de verse sano
- **productos**: fix(productos): la revisión de precio se marca donde el precio cambia, y solo ahí
- **productos**: fix(productos): el contador de "Para revisar" miraba un universo distinto que el listado
- **productos**: feat(productos): la pantalla del celular sale de la tarjeta gigante y estrena "Para revisar"


## [2026-08-21] - Actualización: productos

### Modificado
- **productos**: fix(productos): el contador de "Para revisar" miraba un universo distinto que el listado
- **productos**: feat(productos): la pantalla del celular sale de la tarjeta gigante y estrena "Para revisar"


## [2026-08-18] - Actualización: productos

### Modificado
- **productos**: fix(productos): el precio de la tarjeta dice en qué escala está, y Editar entra
- **productos**: feat(productos): la línea de equivalencia en la tarjeta — sin tocar la API
- **productos**: feat(productos): las tarjetas en angosto, la tabla intacta en escritorio


## [2026-08-13] - Actualización: configuracion, usuarios, locales

### Modificado
- **configuracion**: fix(configuracion): sacar los dos props muertos de arqueo-caja
- **usuarios**: refactor(kit): ModalOperador y ModalUsuario usan SunmiModalLayout
- **locales**: refactor(kit): ModalRol y ModalLocal usan SunmiModalLayout


## [2026-08-09] - Actualización: proveedores

### Modificado
- **proveedores**: feat(listas): una fila resuelta muestra qué se decidió y se puede corregir
- **proveedores**: feat(listas): las cards son el filtro y el panel no repite el producto
- **proveedores**: feat(listas): la pantalla dada vuelta — el producto como unidad
- **proveedores**: feat(listas): el catálogo del proveedor, paginado por PRODUCTO — endpoint nuevo
- **proveedores**: feat(listas): queda registrado si el vínculo lo decidió una persona o el motor
- **proveedores**: feat(listas): el macheo se guarda cuando la fila se aplica
- **proveedores**: fix(listas): el reporte no podía ver una confirmación al resolver el rango
- **proveedores**: refactor(listas): el rango sale de rangoDeLaFila en los cinco lectores
- **proveedores**: feat(listas): la cola de pendientes se filtra en el servidor por la columna
- **proveedores**: feat(listas): el rango esperado se asienta en la cabecera, no se deja implícito
- **proveedores**: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- **proveedores**: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- **proveedores**: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR


## [2026-08-08] - Actualización: proveedores, productos

### Modificado
- **proveedores**: feat(listas): el motor calcula la interpretación y la confirmación vencida deja de contar — rutas SIN VERIFICAR
- **proveedores**: feat(listas): candidatos por parecido de nombre, calculados en el servidor
- **proveedores**: wip(listas): panel de decisión con SunmiTable — SIN VERIFICAR
- **productos**: refactor(sunmi): separar el tono de la fila de su intensidad
- **productos**: SunmiTable: densidad, align, render, ordenable, filaExpandible y tono de fila
- **productos**: feat(precios): regla de recargo fijo por unidad, por ubicación
- **productos**: fix(productos): mostrar el costo unitario también en los locales
- **productos**: fix(precios): que una suba de costo arrastre el precio de venta de cada local


## [2026-08-07] - Actualización: productos, proveedores

### Modificado
- **productos**: SunmiTable: densidad, align, render, ordenable, filaExpandible y tono de fila
- **productos**: feat(listas): vistas por producto en el área principal y reportes PDF
- **proveedores**: feat(listas): vistas por producto en el área principal y reportes PDF
- **proveedores**: feat(listas): resumen orientado al ERP, con detalle por producto
- **proveedores**: feat(listas): grilla operativa para conciliar 190 productos
- **proveedores**: feat(listas): conciliar presentación y precio por separado, con rango esperado


## [2026-08-06] - Actualización: proveedores, pos-ventas

### Modificado
- **proveedores**: feat(listas): conciliar presentación y precio por separado, con rango esperado
- **proveedores**: fix(listas): separar la cantidad contenida de la base del precio
- **proveedores**: fix(listas): dar salida operativa a las filas por revisar
- **proveedores**: fix(precios): la vista "Listas" mostraba solo las filas ya aplicadas
- **proveedores**: fix(precios): aplicar listas por tandas sin cerrar la importación
- **proveedores**: fix(precios): permitir cancelar una importación y liberar su archivo
- **proveedores**: feat(precios): pantalla de revisión producto por producto antes de aplicar
- **proveedores**: feat(precios): aplicar los costos de una lista de proveedor
- **proveedores**: feat(precios): vincular a mano las filas no macheadas de una lista
- **proveedores**: feat(precios): agregar interfaz de listas de proveedores
- **proveedores**: feat(precios): persistir conciliaciones de proveedores
- **pos-ventas**: fix(caja): ningún proceso de caja pendiente queda oculto


## [2026-08-05] - Actualización: proveedores, pos-ventas

### Modificado
- **proveedores**: fix(listas): dar salida operativa a las filas por revisar
- **proveedores**: fix(precios): la vista "Listas" mostraba solo las filas ya aplicadas
- **proveedores**: fix(precios): aplicar listas por tandas sin cerrar la importación
- **proveedores**: fix(precios): permitir cancelar una importación y liberar su archivo
- **proveedores**: feat(precios): pantalla de revisión producto por producto antes de aplicar
- **proveedores**: feat(precios): aplicar los costos de una lista de proveedor
- **proveedores**: feat(precios): vincular a mano las filas no macheadas de una lista
- **proveedores**: feat(precios): agregar interfaz de listas de proveedores
- **proveedores**: feat(precios): persistir conciliaciones de proveedores
- **pos-ventas**: fix(caja): ningún proceso de caja pendiente queda oculto
- **pos-ventas**: refactor(caja): la grilla del cambio vuelve a un modal
- **pos-ventas**: fix(caja): textos que la validación por navegador destapó
- **pos-ventas**: feat(caja): el retiro de recaudación toma un corte congelado
- **pos-ventas**: feat(caja): el cierre separa el cambio antes del corte
- **pos-ventas**: fix(caja): el tercer estado del turno llega a listados, detalle y auditoría
- **pos-ventas**: fix(caja): la reserva de un cambio pertenece a la PERSONA, no al dispositivo
- **pos-ventas**: feat(caja): la apertura de caja pasa a ser física, por denominaciones y con relevo
- **pos-ventas**: feat(caja): comparar el cambio recibido por denominación, no solo por total
- **pos-ventas**: feat(caja): el cierre pasa a ser una pantalla propia y libera el POS al cortar
- **pos-ventas**: feat(caja): piezas compartidas del cierre — paneles, borrador por token y aviso entre pestañas
- **pos-ventas**: fix(caja): un turno cortado deja de ser "abierto" para todos los consumidores
- **pos-ventas**: feat(caja): motor del cierre con relevo — corte, confirmación y cambio pendiente
- **pos-ventas**: feat(caja): el efectivo contado sale solo del conteo por denominación
- **pos-ventas**: fix(caja): alinear las grillas del retiro y mostrar los movimientos de caja
- **pos-ventas**: fix(caja): serializar los retiros de una misma caja con lock de fila
- **pos-ventas**: fix(caja): unificar la terminología del cambio y separar cerrar de guardar
- **pos-ventas**: feat(pos-ventas): el retiro pasa a ser una sola pantalla, sin pasos


## [2026-07-30] - Actualización: reportes-ventas

### Modificado
- **reportes-ventas**: fix(reportes): mejorar resumen y unidades del comprobante
- **reportes-ventas**: fix(reportes): paginar comprobantes y ampliar corrección de ventas


## [2026-07-29] - Actualización: reportes-ventas

### Modificado
- **reportes-ventas**: feat(reportes): mostrar modo y consumo físico de venta
- **reportes-ventas**: fix(reportes): ampliar y reorganizar detalle de venta
- **reportes-ventas**: fix(reportes): usar el mismo ancho útil que POS Ventas
- **reportes-ventas**: feat(reportes): rediseñar visualmente el listado de ventas
- **reportes-ventas**: feat(reportes): advertir cambios sin guardar en la corrección
- **reportes-ventas**: refactor(reportes): eliminar flujo modal de ventas

## [2026-07-29] - Actualización: pos-transferencias, pos-ventas, productos, stock, configuracion, transferencias, usuarios, categorias, proveedores, roles, grupos, locales

### Modificado
- **pos-transferencias**: feat(productos): codigo de barras propio por ubicacion
- **pos-transferencias**: feat(pos): agregar servicios de importe variable
- **pos-transferencias**: feat(operario): operario obligatorio configurable por local
- **pos-transferencias**: fix(security): cerrar fugas operativas entre ubicaciones
- **pos-transferencias**: fix(operadores): eximir dueño local con alcance seguro
- **pos-transferencias**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **pos-ventas**: feat(productos): codigo de barras propio por ubicacion
- **pos-ventas**: fix(pos): enviar importe de servicios variables al cobrar
- **pos-ventas**: fix(pos): reconstruir consumo legacy y mejorar editor de corrección
- **pos-ventas**: feat(pos): corrección de ventas completa con beta controlada
- **pos-ventas**: fix(pos): usar día de Argentina en historial y estadísticas
- **pos-ventas**: style(pos): mejorar iconos de medios de pago
- **pos-ventas**: style(pos): agregar iconos a medios de pago
- **pos-ventas**: fix(pos): robustecer division de pagos en dispositivos moviles
- **pos-ventas**: fix(pos): simplificar division de pagos
- **pos-ventas**: feat(pos): simplificar flujo de cobro
- **pos-ventas**: feat(pos): agregar servicios de importe variable
- **pos-ventas**: feat(pos): agregar pagos múltiples por venta
- **pos-ventas**: fix(pos): aislar "vender sin stock" por local en el buscador
- **pos-ventas**: feat(operario): operario obligatorio configurable por local
- **pos-ventas**: fix(security): cerrar fugas operativas entre ubicaciones
- **pos-ventas**: fix(operadores): eximir dueño local con alcance seguro
- **pos-ventas**: feat(config): agregar configuracion persistente por local
- **pos-ventas**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **productos**: feat(productos): codigo de barras propio por ubicacion
- **productos**: fix(productos): permitir editar la ficha al local propietario
- **productos**: feat(pos): agregar servicios de importe variable
- **productos**: fix(productos): aislar el precio de costo según origen y propietario
- **productos**: fix(security): cerrar fugas operativas entre ubicaciones
- **productos**: fix(security): completar aislamiento y permisos por local
- **productos**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **stock**: feat(productos): codigo de barras propio por ubicacion
- **stock**: fix(security): cerrar fugas operativas entre ubicaciones
- **configuracion**: feat(operario): operario obligatorio configurable por local
- **configuracion**: fix(configuracion): habilitar acceso a config del local por permiso, no por esAdmin
- **configuracion**: feat(ui): adaptar menu y pantallas a roles locales
- **transferencias**: fix(security): cerrar fugas operativas entre ubicaciones
- **transferencias**: fix(scope): exigir contexto operativo y vista global explícita
- **usuarios**: feat(ui): adaptar menu y pantallas a roles locales
- **usuarios**: feat(users): permitir gestion y costos por local
- **usuarios**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **categorias**: fix(security): completar aislamiento y permisos por local
- **categorias**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **proveedores**: fix(security): completar aislamiento y permisos por local
- **proveedores**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **roles**: feat(rbac): registrar roles y permisos de sistema
- **roles**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **grupos**: fix(security): endurecer permisos y aislamiento entre grupos y locales
- **locales**: fix(security): endurecer permisos y aislamiento entre grupos y locales


## [2026-07-26] - Actualización: categorias, grupos, locales, pos-ventas, proveedores, roles, usuarios, pos-transferencias, productos, stock, transferencias

### Modificado
- **categorias**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **grupos**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **locales**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-ventas**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-ventas**: feat(combos): módulo de combos exclusivos por local
- **proveedores**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **roles**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **usuarios**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-transferencias**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **pos-transferencias**: feat(combos): módulo de combos exclusivos por local
- **productos**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **productos**: feat(combos): permitir activar y desactivar combos por local
- **productos**: feat(combos): módulo de combos exclusivos por local
- **stock**: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- **stock**: feat(combos): módulo de combos exclusivos por local
- **transferencias**: feat(combos): módulo de combos exclusivos por local


## [2026-07-25] - Actualización: pos-transferencias, pos-ventas, productos, stock, transferencias

### Modificado
- **pos-transferencias**: feat(combos): módulo de combos exclusivos por local
- **pos-ventas**: feat(combos): módulo de combos exclusivos por local
- **productos**: feat(combos): módulo de combos exclusivos por local
- **stock**: feat(combos): módulo de combos exclusivos por local
- **transferencias**: feat(combos): módulo de combos exclusivos por local


## [2026-07-24] - Actualización: auditoria, pos-transferencias, productos, proveedores, stock, pos-ventas

### Modificado
- **auditoria**: feat(auditoria): bitácora de auditoría central por interceptor de Prisma
- **pos-transferencias**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **pos-transferencias**: feat(pos): exigir operario activo para operar el POS
- **productos**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **proveedores**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **stock**: feat(productos,proveedores): visibilidad depósito ↔ locales
- **pos-ventas**: feat(pos): revalidar operario y pedir PIN en modal sin perder la pantalla
- **pos-ventas**: feat(pos): exigir operario activo para operar el POS


## [2026-07-23] - Actualización: pos-transferencias, pos-ventas

### Modificado
- **pos-transferencias**: feat(pos): exigir operario activo para operar el POS
- **pos-ventas**: feat(pos): exigir operario activo para operar el POS


## [2026-06-16] - Actualización: stock, productos

### Modificado
- **stock**: perf: paginar stock deposito en base de datos
- **stock**: perf: paginar stock locales en base de datos
- **stock**: perf: filtrar estados de stock locales en base de datos
- **stock**: refactor: ordenar stock locales sin cambiar comportamiento
- **productos**: fix: asegurar productos del deposito al crear producto


## [2026-06-15] - Actualización: stock

### Modificado
- **stock**: perf: paginar stock locales en base de datos
- **stock**: perf: filtrar estados de stock locales en base de datos
- **stock**: refactor: ordenar stock locales sin cambiar comportamiento


## [2026-06-11] - Actualización: 

### Modificado


## [2026-06-10] - Actualización: productos, pos-ventas

### Modificado
- **productos**: feat: productos — go-to-page, sticky header and optional internal code column
- **pos-ventas**: fix: derive unit price by unidad_medida, not modo_envio, in depot POS
- **pos-ventas**: feat: compact mobile cart with scrollable chips row in depot POS
- **pos-ventas**: feat: show depot stock breakdown (packs + units) in POS search and cart

## [2026-02-13] - Sistema de Auto-documentación

### Agregado
- scripts/update-docs.js — Script de auto-documentación que analiza git log y actualiza docs
- docs/modulos/pos-ventas.md — Documentación del módulo POS Ventas
- docs/ULTIMA-ACTUALIZACION.md — Registro de última actualización del proyecto

## [2026-02-13] - Módulo POS Ventas

### Agregado
- Módulo POS Ventas completo (MVP)
- Búsqueda de productos por código/nombre
- Carrito de venta con edición de cantidades
- Formas de pago: Efectivo, MercadoPago, Débito, Crédito
- Cálculo automático de comisiones (7%)
- Descuento de stock en tiempo real
- Selector de local para admin padre
- API /api/pos-ventas/crear
- API /api/pos-ventas/buscar-producto
- Componentes: BuscadorProductos, CarritoVenta, FormaPago

### Pendiente (Fase 2)
- Búsqueda por voz
- Impresión de tickets (térmico + PDF)
- Turnos y arqueo de caja
- Historial de ventas

## [2025-02-13] - Estandarizacion UI Sunmi

### Agregado
- docs/INCONSISTENCIAS-SUNMI.md - Auditoria completa de 71 problemas
- docs/05-GUIA-ESTILOS-UI.md - Guia oficial de estilos
- SunmiToast para feedback (reemplaza alert)
- color='slate' en SunmiButton

### Modificado
- 13 `<select>` nativos reemplazados por SunmiSelect
- 19 `<input>` nativos reemplazados por SunmiInput
- 40+ archivos: colores hardcodeados migrados al sistema de themes
- Props invalidos eliminados (variant, size, color en separator)
- Labels estandarizados: `text-[11px] text-slate-400 mb-1 block`
- Responsive mejorado en stock y POS transferencias

### Corregido
- `titulo` por `title` en SunmiCardHeader
- `mensaje` por `message` en SunmiTableEmpty
- `border-slate-700` por `border-slate-800` en todo el proyecto
- `text-slate-100` hardcodeado eliminado (heredado del theme)
- `overflow-auto` por `overflow-x-auto` en wrappers de tablas
