# Modulo: Transferencias

**Última actualización:** 2026-09-29 17:38

## Ubicacion
- UI: `app/modulos/transferencias/page.jsx`, `app/modulos/transferencias/[id]/page.jsx`
- APIs: `app/api/transferencias/`
- Componentes: `components/transferencias/`

## Descripcion
Transferencias formales de mercaderia entre depositos y locales. Incluye workflow completo: envio → recepcion → confirmacion con control de diferencias.

## Funcionalidad principal
- Listado con filtros (estado, rango de fechas)
- Metricas del periodo: total, enviadas, recibidas, con diferencias e importe
- Detalle en pagina propia (`[id]`), sin modales ni filas desplegables
- Recepcion: registrar cantidades recibidas y motivos de diferencia
- Confirmacion: actualiza stock de destino en transaccion
- Generacion de PDF (envio y recepcion)
- Calculo de costo total

## Dependencias

### Usa
- Locales (origen, destino)
- Productos (ProductoLocal en detalle)
- Stock (actualiza al confirmar)
- Usuarios (confirmadoPor)

### Usado por
- POS Transferencias (se convierte en Transferencia al enviar)

## APIs

### Expone
- `GET /api/transferencias/listar?estado=&localId=&fechaDesde=&fechaHasta=&page=`
- `GET /api/transferencias/detalle?id=`
- `POST /api/transferencias/guardar-recepcion` — items con recibido y motivos
- `POST /api/transferencias/confirmar-recepcion` — actualiza stock en transaccion
- `GET /api/transferencias/pdf?id=` — PDF de envio
- `GET /api/transferencias/pdf-recepcion?id=` — PDF de recepcion

## Componentes principales
- `TablaTransferencias`: Tabla del listado (solo desde 1024 px). Columnas: Fecha /
  hora, Transferencia, Origen / destino, Items, Enviada, Recibida, Estado,
  Importe y Accion
- `FilaTransferencia`: Fila individual; no se expande, el acceso al detalle es el
  boton "Ver transferencia"
- `CardTransferencia`: Tarjeta del listado en mobile y tablet (hasta 1023 px)
- `EstadoTransferenciaBadge`: Badge de estado + badge de diferencias, compartido por listado y detalle
- `ColumnSettingsPanel`: Panel integrado (sin modal) para elegir columnas de la tabla desktop
- `TablaDetalleTransferencia`: Detalle de items
- `TransferenciaHeader`: Encabezado del detalle
- `AccionesRecepcion`: Botones de recepcion/confirmacion

El detalle completo vive en `app/modulos/transferencias/[id]/page.jsx`: el
listado solo muestra el resumen. Al pulsar "Ver transferencia" se guardan
filtros, pagina y scroll para restaurarlos al volver.

## Composicion visual: copia literal de Reportes de Ventas

La pantalla no "se inspira" en `app/modulos/reportes-ventas/page.jsx`: reusa su
misma estructura de bloques, en el mismo orden y con los mismos valores.

```
contenedor    w-full min-h-full p-2 lg:p-3 space-y-3
1 · franja    SunmiCard p-3 overflow-visible !backdrop-blur-0 -> titulo + filtros
2 · metricas  section space-y-2 -> SectionHead + grid 2 / md:3 / xl:5
3 · listado   section space-y-2 -> SectionHead + accion a la derecha, SunmiCard
4 · paginado  dentro de la card, mt-3 pt-3 border-t sunmi-divider
```

Medido en el navegador, los dos modulos coinciden en: padding del contenedor
(10,5 px), grilla y gap de metricas, padding y radio de la card de metrica,
tamano de `h1` y `h2`, padding de `th` (5,25 / 7 px) y de `td` (10,5 / 8,75 px),
alto de fila (58 px) y padding, tipografia y radio del boton de accion.

Diferencias deliberadas, y por que:

- **Dos secciones en vez de cuatro.** Ventas suma "Desglose por forma de pago" y
  "Productos mas vendidos"; transferencias no tiene equivalente.
- **Corte a `lg` (1024 px) en vez de `md`.** Con nueve columnas la tabla no es
  legible a 768 px; hasta 1023 px se usan cards (una columna hasta 767, dos
  desde 768).
- **Boton "Volver" en la fila del titulo.** Ventas no tiene; ponerlo suelto sobre
  la card rompia el ritmo vertical.
- **Titulo de la card en `line-clamp-2` y tercera linea sin `truncate`.** En
  Ventas el titulo es un solo nombre; aca son origen y destino, y con `truncate`
  el destino desaparecia por completo debajo de 768 px.
- **A 1024 px la tabla desborda ~61 px** y el contenedor `overflow-x-auto`
  scrollea (Ventas desborda 7 px con una columna menos y una etiqueta de accion
  mas corta). Desde 1280 px entra completa sin scroll. Ocultar "Items" en el
  panel de columnas la hace entrar exacto.

## Estado y hooks
- Estado local con `useState`
- Columnas visibles persistidas en localStorage

## Permisos requeridos
- `transferencias.crear`
- `transferencias.recibir`

### El alcance del tablero y el parámetro `destino`

*(Verificado contra PostgreSQL por `scripts/pruebas-db/transferenciasAlcance.mjs`.)*
`GET /api/transferencias/tablero` exige `transferencias.ver` y toma el alcance
de `resolveVistaOperativa`. El `?destino=` sirve para que el DEPÓSITO —o el admin
en vista global— abra la cuenta de uno de sus locales.

La regla es `resolverLocalPedido`, de `lib/finanzas/alcanceFinanciero.js`, la
misma que usa Finanzas para el mismo parámetro. Se decide antes de leer nada del
local pedido, y el resto del endpoint usa el local resuelto, no el parámetro:

- **Un local** no lo manda, porque su cuenta es la suya. Si lo manda, tiene que
  ser su propio local.
- **El depósito, o el admin en vista global**, pide uno de los locales de SU grupo
  (activo), según la lista `GrupoLocal` que ya lee el tablero. Sin `destino` sigue
  viendo su entrada o sus bloques como antes.
- Cualquier otro destino da 403 "Local fuera de tu alcance.": otro local, uno de
  otro grupo, uno que no existe, o el propio depósito para sí mismo. Algo que no
  es un número da 403 "Local inválido.". La respuesta trae solo `ok` y `error`.

Hasta el 2026-09-28 no era así, porque el `destino` se usaba tal cual:

- Para un local, reemplazaba su propio `destinoId` en el filtro. Con
  `?destino=<otro>` leía las transferencias que recibía otra ubicación, del grupo
  o de otro grupo: ids, estados, fechas, importes y el "a pagar" del período.
- Para el depósito, un local de otro grupo no traía las transferencias de otros
  orígenes. Sí traía el corte de su Semana Operativa, el rango de su semana y lo
  que ese mismo depósito le hubiera despachado.

## Modelo de datos

```prisma
model Transferencia {
  id                Int       @id @default(autoincrement())
  origenId          Int
  destinoId         Int
  estado            String    @default("Pendiente")
  fechaEnvio        DateTime?
  fechaRecepcion    DateTime?
  creadaPor         String?
  tieneDiferencias  Boolean   @default(false)
}

model TransferenciaDetalle {
  id                Int       @id @default(autoincrement())
  transferenciaId   Int
  productoId        Int       // FK a ProductoLocal
  cantidad          Decimal   @db.Decimal(12, 2)
  recibido          Decimal?  @db.Decimal(12, 2)
  precioCosto       Decimal?  @db.Decimal(12, 2)
  unidadEnviada     UnidadMedida?
  motivoPrincipal   String?
  motivoDetalle     String?
  confirmadoPorId   Int?
}
```

## Estados de transferencia

```
Pendiente → Enviada → Recibiendo → Recibida
                                  → (con diferencias)
```

Una recepción con faltante NO tiene estado propio: queda `Recibida` con
`tieneDiferencias = true`. No existe `CON_DIFERENCIA`.

## Recepción con diferencias: la mercadería que no llega vuelve al origen

Cuando el destino confirma una cantidad menor a la enviada, la diferencia
**se devuelve automáticamente al stock del local de origen**, en la misma
transacción de la recepción.

```
devolución = enviado - recibido

origen:   cantidad   += devolución
          enTransito -= enviado        (una sola escritura atómica)
destino:  cantidad   += recibido
```

Ejemplo: depósito con 100, envía 20, el local recibe 18.

| | Resultado |
|---|---|
| Stock del depósito | 82 (perdió solo lo que el otro local recibió) |
| Stock del local destino | +18 |
| `enTransito` del origen | 0 |
| `TransferenciaDetalle.cantidad` | 20 — **dato histórico, nunca se reescribe** |
| `TransferenciaDetalle.recibido` | 18 — lo que realmente ingresó |
| `Transferencia.tieneDiferencias` | `true` |
| Devolución auditada | 2 |

Puntos que hacen a la regla:

- **No distingue política de stock.** Da igual que la transferencia sea manual
  (`DESCONTAR_Y_TRANSITO`) o generada desde una venta interna
  (`SOLO_TRANSITO`): en las dos el origen ya perdió la cantidad enviada antes de
  la confirmación, así que el neto correcto es el mismo.
- **Escala física.** La diferencia se calcula en milésimas enteras y recién
  después se escala por `factor_pack`. Enviar 2 bultos de 12 y recibir 1 devuelve
  **12 unidades**, no 1.
- **Fiambre fijo.** El destino sigue recibiendo kilos (`piezasToKg`), pero la
  devolución al origen se acredita en **piezas**, que es como cuenta el depósito.
- **Auditoría obligatoria.** Toda devolución mayor a cero crea un `AuditoriaStock`
  con `accion = DIFERENCIA_RECEPCION_TRANSFERENCIA`, el stock anterior y nuevo del
  origen, y un motivo que cita transferencia, detalle, enviado, recibido y
  devuelto. Se escribe **dentro** de la transacción: si falla, la recepción entera
  se revierte. Una recepción completa no genera auditoría.
- **Sin fila de origen, no hay recepción.** Si el producto o su `StockLocal` no
  existen en el local de origen, la confirmación aborta con
  `STOCK_ORIGEN_NO_ENCONTRADO` y no se acredita nada al destino. Antes ese caso se
  salteaba en silencio.
- **Una sola vez.** La barrera de estado (`updateMany` condicional como primera
  escritura) hace que una segunda confirmación corte antes de devolver stock,
  acreditar destino, limpiar tránsito o auditar.

**Lo que esto NO resuelve:** el ajuste comercial. Si la transferencia nació de una
venta interna, esa venta sigue facturando lo enviado aunque el inventario ya haya
vuelto al origen. La resolución contable de esa diferencia es una etapa aparte,
todavía no implementada.

## Cambios recientes
- 2026-09-29: fix(finanzas): un movimiento de caja es de a lo sumo un pago, de cualquier tipo
- 2026-09-29: feat(finanzas): núcleo de Gastos — el gasto de una ubicación y sus pagos
- 2026-09-29: feat(costos): la migración que activa el Libro de Costos
- 2026-09-29: feat(costos): el Libro de Costos, inerte hasta su activación
- 2026-09-28: feat: declarar el origen de las escrituras de costo para el Libro de Costos
- 2026-09-28: fix(transferencias): el depósito solo pide destinos de su grupo en el tablero
- 2026-09-28: fix(transferencias): un destino en la URL no amplía el alcance de un local en el tablero
- 2026-09-28: fix(libro): la BAJA no depende del orden de las sentencias
- 2026-09-28: feat(stock): Stock Diario derivado del libro, con el índice que lo hace posible
- 2026-09-27: docs(deploy): libro_stock pendiente, y los candados que cuentan migraciones la declaran
- 2026-09-26: feat(caja): tabla CorreccionCaja para las correcciones históricas
- 2026-09-26: feat(caja): estado CERRADO_SIN_CONTEO y la autoría de la resolución
- 2026-09-26: feat(compras): columna para el catálogo que se miró al decidir un precio
- 2026-09-25: fix(semana): «corte de semana» deja de ser un nombre de la app, con candado sobre el repo entero
- 2026-09-25: feat(semana): pantalla de Semana operativa en Configuración, con cancelar el cambio programado
- 2026-09-24: feat(semana): la semana operativa es de la ubicación, con su historia
- 2026-09-24: refactor(periodo): una sola banda del día, la de Recibir mercadería, y se acomoda cuando no entra — SIN VERIFICAR en teléfono con datos reales
- 2026-09-24: refactor(periodo): ResumenConImporte y FilaConImporte, sacados de Transferencias
- 2026-09-24: refactor: SunmiSelectorDeOpciones, sacado de ChipsDePeriodo
- 2026-09-17: feat: la pantalla de subir pregunta para qué, y el resultado cuenta el control
- 2026-09-17: fix(listas): ningún costo fuera del rango queda listo ni se escribe solo
- 2026-09-16: feat(listas): lector genérico de PDF con texto, para la lista de cualquier proveedor
- 2026-09-16: feat(listas): receta de lectura por proveedor — migración
- 2026-09-16: feat(listas): el rango del proveedor elige la lectura, y el display deja de bloquear
- 2026-09-14: fix(transferencias): las tarjetas dejan de ser del color de la página
- 2026-09-14: fix(transferencias): la tarjeta con fondo de tarjeta, el rótulo de la lista y el orden estable
- 2026-09-14: feat(transferencias): la entrada es la lista de locales y el período vive adentro
- 2026-09-13: feat(transferencias): el día como encabezado, el estado en palabras y la recibida que se abre
- 2026-09-13: fix(transferencias): el criterio es el CLIENTE VINCULADO, y vale en las tres pantallas
- 2026-09-13: fix(transferencias): el local dado de baja, y una sola puerta para los destinos
- 2026-09-13: fix(transferencias): todos los locales aparecen, tengan o no movimiento
- 2026-09-13: feat(transferencias): el botón sube al renglón del shell, la edición deja de ser un color y el corte entra al menú
- 2026-09-13: feat(transferencias): la pantalla móvil pasa a ser la lista de trabajo
- 2026-09-13: feat(transferencias): el corte de período sale del código y pasa a ser un acuerdo
- 2026-09-13: fix(transferencias): "Enviada" y "Recibida" en la misma escala, y el desglose se va de lectura
- 2026-09-13: fix(transferencias): "cuánto se envió y cuánto llegó" se pregunta en un solo lugar
- 2026-09-13: fix(transferencias): la recepción de escritorio lee la escala del remito, en el documento y en el editor
- 2026-09-13: feat(recepcion): si no salió ningún bulto entero, la línea se cuenta por unidad
- 2026-09-09: fix(transferencias): tres defectos de integración del control físico
- 2026-09-09: fix(transferencias): los siete defectos de la revisión arquitectónica
- 2026-09-08: fix(transferencias): recibiendo no hay guardado por lotes, y es por seguridad
- 2026-09-08: feat(transferencias): el puesto de trabajo del control fisico
- 2026-09-08: feat(transferencias): el modelo del control fisico y la aritmetica del pack incompleto
- 2026-09-08: fix(transferencias): una linea agregada no explica dos veces de donde salio
- 2026-09-08: fix(transferencias): agregar o quitar una linea ya no pisa lo que no se guardo
- 2026-09-08: feat(transferencias): la recepcion representa el excedente y el producto extra
- 2026-09-08: feat(transferencias): las decisiones de la recepcion, fuera de la pantalla
- 2026-09-08: feat(transferencias): el detalle expone el factor de pack de cada linea
- 2026-09-08: fix(transferencias): los tres defectos de la revisión de recepción
- 2026-09-08: feat(transferencias): la recepcion representa lo que llego
- 2026-07-30: fix(transferencias): respetar fecha local argentina
- 2026-07-30: fix(transferencias): normalizar costo según unidad enviada
- 2026-07-30: fix(transferencias): validar cantidades recibidas
- 2026-07-30: feat(ventas-internas): generar transferencia desde POS
- 2026-07-26: fix(security): cerrar fugas operativas entre ubicaciones
- 2026-07-26: fix(scope): exigir contexto operativo y vista global explícita
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
