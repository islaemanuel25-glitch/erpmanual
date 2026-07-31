# Modulo: Transferencias

**Última actualización:** 2026-07-31 07:40

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
- 2026-07-30: fix(transferencias): respetar fecha local argentina
- 2026-07-30: fix(transferencias): normalizar costo según unidad enviada
- 2026-07-30: fix(transferencias): validar cantidades recibidas
- 2026-07-30: feat(ventas-internas): generar transferencia desde POS
- 2026-07-26: fix(security): cerrar fugas operativas entre ubicaciones
- 2026-07-26: fix(scope): exigir contexto operativo y vista global explícita
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
