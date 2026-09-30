# Modulo: Stock Locales

**Última actualización:** 2026-09-30 14:20

## Ubicacion
- UI: `app/modulos/stock_locales/page.jsx`
- APIs: `app/api/stock_locales/`
- Componentes: `components/stock_locales/`

## Descripcion
Gestion de inventario por local. Permite ver stock actual, ajustar cantidades y configurar limites min/max. Los depositos muestran stock en bultos, los locales en unidades.

## Funcionalidad principal
- Ver stock por local con filtros (categoria, proveedor, area, con/sin stock, faltantes)
- Ajustar stock (sumar/restar cantidades)
- Configurar limites minimos y maximos
- Importacion masiva de productos
- Deteccion automatica de faltantes (stock < stockMin)

## Dependencias

### Usa
- Productos (ProductoLocal)
- Locales (localId)
- Categorias, Proveedores, Areas Fisicas (filtros)

### Usado por
- Transferencias (descuenta/suma stock al confirmar recepcion)
- POS Transferencias (lee stock para sugeridos)

## APIs

### Consume
- `GET /api/locales/listar`

### Expone
- `GET /api/stock_locales/listar?localId=&q=&categoria=&proveedor=&area=&conStock=&sinStock=&faltantes=&page=`
- `GET /api/stock_locales/obtener?id=`
- `POST /api/stock_locales/nuevo`
- `POST /api/stock_locales/ajustar` — modo: "ajuste"|"limites", tipo: "sumar"|"restar"
- `POST /api/stock_locales/importar`
- `POST /api/stock_locales/limites`
- `GET /api/stock_locales/diario/resumen`, `/productos`, `/producto`, `/movimientos` —
  el Stock Diario, de solo lectura; ver "La API del Stock Diario" más abajo.

## Componentes principales
- `TablaStock`: Tabla de stock con paginacion
- `FiltrosStock`: Filtros de busqueda y categoria
- `ModalAjuste`: Modal para ajustar cantidades
- `ModalLimites`: Modal para configurar min/max

## Estado y hooks
- Estado local con `useState`
- `localSeleccionado` persistido en localStorage

## Permisos requeridos
- `stock.ver`

## Modelo de datos

```prisma
model StockLocal {
  id          Int      @id @default(autoincrement())
  localId     Int
  productoId  Int      // FK a ProductoLocal
  cantidad    Decimal  @db.Decimal(12, 2)
  stockMin    Decimal? @db.Decimal(12, 2)
  stockMax    Decimal? @db.Decimal(12, 2)
  @@unique([localId, productoId])
}
```

## Conversion de unidades

Depositos almacenan en bultos, locales en unidades:

```
precioUnitario = precioCosto / factor_pack
stockUnidades = stockBultos * factor_pack
```

## Libro histórico físico

**Historia física de stock confiable desde 2026-09-28 00:19:13.587 UTC
(2026-09-27 21:19:13.587 Argentina).**

La BAJA no depende del orden de las sentencias
(`20260928180000_libro_stock_baja_atomica`, en `main`; en producción rige recién
desde el despliegue que la aplique —ver `docs/deploy/MIGRACIONES-SIN-APLICAR.md`—):
una sola sentencia que borra un
StockLocal y su ProductoLocal —o re-vincula la fila— deja su BAJA con la identidad
completa, porque la identidad se recuerda en el momento en que el producto se
borra. Y el libro falla cerrado: si un movimiento no puede escribirse, la
sentencia aborta y la fila de stock no cambia. No es una frontera nueva: el punto
cero es el mismo, y ningún camino de la aplicación había usado ese hueco.

Desde ese instante, cada cambio de `StockLocal.cantidad` o `StockLocal.enTransito`
queda en `MovimientoStock`, escrito por un trigger de PostgreSQL en la misma
transacción que el cambio. El punto cero —12.278 filas `ESTADO_INICIAL`, una por
fila de `StockLocal`, con un único instante— y la evidencia del despliegue están en
`docs/deploy/MIGRACIONES-SIN-APLICAR.md`. El porqué de cada columna, en
`prisma/schema.prisma` junto a `MovimientoStock`. El verificador de solo lectura
es `scripts/verificar-libro-stock.mjs`.

Los escritores todavía no declaran origen, así que sus movimientos quedan como
`SIN_ORIGEN`. Eso no vuelve dudosa la cantidad.

## Stock Diario

Con cuánto empezó, qué movimientos tuvo y con cuánto terminó cada producto en
cada ubicación, un día o un período. **Se deriva del libro al consultar**: no hay
foto diaria, ni cron, ni tabla de saldos. La semántica está en
`lib/stock/libro/stockDiario.js` (puro) y las consultas en
`lib/stock/libro/stockDiarioServer.js`. Se consulta por la API de solo lectura
de más abajo y por la pantalla móvil —"La pantalla del Stock Diario", más abajo—. Para mirar un local desde la terminal está
`scripts/stock-diario.mjs`, de solo lectura.

- **El día** es el argentino, la columna `dia` que la base calculó al escribir el
  movimiento. Viaja como texto `YYYY-MM-DD` y "hoy" lo decide PostgreSQL.
- **Apertura** de D: el último movimiento de la cadena con `dia < D`, por
  `(dia, id)`. **Cierre**: lo mismo con `dia <= D`. Un día sin movimientos abre y
  cierra con el último saldo anterior.
- **Estados**: `FUERA_DE_HISTORIA` antes del 27/09/2026; `PARCIAL_PUNTO_CERO` el
  27/09 (apertura desconocida, `SIN_APERTURA_HISTORICA`; se parte del
  `ESTADO_INICIAL`); `COMPLETO`; `EN_CURSO` hoy, con el cierre provisional.
- **Existencia** aparte del número: `EXISTE`, `NO_EXISTE` y `DESCONOCIDA`. Un ALTA
  abre en "no existe" y un BAJA cierra en "no existe"; ninguno de los dos es cero.
- **Cantidad y tránsito** siempre por separado. Delta solo en los CAMBIO; ALTA y
  BAJA se muestran como "aparece con" y "desaparece con".
- **Identidad**: el nombre y la categoría son los de hoy; de un producto eliminado,
  lo que congeló su BAJA. La categoría no tiene historia. Una reinterpretación de
  unidad marca el día, sin convertir nada.
- **Semana, mes, año, rango**: agrupan días. La semana usa la Semana Operativa con
  la vigencia que regía ese día.

Lo prueba contra PostgreSQL `scripts/pruebas-db/stockDiario.mjs`, con una fuerza
bruta y con el plan de un local entero sobre un millón de movimientos.

### La API del Stock Diario

Cuatro rutas GET en `app/api/stock_locales/diario/`. Cada una exige la sesión y
`stock.ver` a la vista y delega el resto en `lib/stock/libro/stockDiarioRutas.js`.
El contrato, la parte pura, vive en `lib/stock/libro/stockDiarioApi.js`.
*(Verificado en código y contra PostgreSQL por `scripts/pruebas-db/stockDiarioApi.mjs`.)*

- `resumen`: el estado del período y los totales de cantidad y de tránsito por
  separado. Los totales son apertura, cierre, entradas, salidas, cambio neto,
  "aparece con" y "desaparece con". Trae además los conteos de productos, con
  movimientos, que aparecen, que desaparecen, reinterpretados y sin clasificar.
  Fuera de historia, totales y conteos van en `null`.
  Desde la pantalla móvil trae también **conteos, no cantidades**, para no sumar
  UNIDAD con KG *(verificado contra PostgreSQL, sección B.bis)*:
  - `totales.cantidad.movimientosDeEntrada` y `movimientosDeSalida`, y lo mismo
    en `totales.enTransito`. Son los mismos CAMBIO que suman `entradas` y
    `salidas`, con el mismo filtro de la consulta, contados. ALTA, BAJA y el
    punto de partida no son entrada ni salida; un SIN_ORIGEN tiene dirección y
    además cuenta como sin clasificar.
  - `conteos.conTransitoAlCierre`: los productos que TERMINAN el período con
    tránsito, mirando el cierre —en curso, el ahora—. No los que movieron
    tránsito: uno que lo abrió y lo cerró en el período no cuenta.
- `productos`: una fila por cadena física que existió en el período, con
  identidad, apertura, cierre y lo que se movió. Se pagina con `page` y
  `pageSize` —50 por defecto, 200 como tope, más es 400— y se filtra con
  `filtro`, `q` y `categoriaId`. Los valores de `filtro` son `todos`,
  `con_movimientos`, `aparecen`, `desaparecen`, `reinterpretados` y
  `sin_clasificar`. `q` busca en el nombre y el código, sin distinguir tildes.
  `categoriaId` es la categoría ACTUAL. El orden es por nombre y después por id,
  estable entre páginas.
- `producto?productoLocalId=`: una cadena, con las reinterpretaciones una por una
  y sus movimientos paginados. Trae el total de movimientos, así que no hay un
  límite callado.
- `movimientos`: los del local, o los de una cadena con `productoLocalId`. Se
  paginan EN LA BASE, en orden `(instante, id)`.

**El período**: `unidad=DIA|SEMANA|MES|ANIO` con `fecha`, o `desde` y `hasta`.
Sin fecha, es hoy según PostgreSQL. Las dos formas juntas son 400. Lo que pasa de
hoy se recorta, y la respuesta lo dice en `recortadoAHoy`. Un período entero en el
futuro es 400.

**El alcance** se copia del de `stock_locales` y sale de `resolveVistaOperativa`:

- Un usuario con local ve el suyo, y un `localId` distinto es 403 "Local fuera de
  tu alcance."; no se ignora en silencio.
- El depósito es un local más: ve solo su propio Stock Diario, no el de los
  locales de su grupo.
- El admin en vista global tiene que elegir `localId`. Sin él es 400, y uno fuera
  de su grupo activo es 403. Nunca se suman ubicaciones: sumar mezclaría los
  bultos del depósito con las unidades de los locales.
- Una cadena de otra ubicación pedida desde la propia no se encuentra: todo se
  busca dentro del libro del local del alcance, así que no aparece ni el nombre
  congelado de un producto eliminado ajeno.

**Los errores**: los de la pregunta —día, unidad, rango, página, filtro, id— son
400, con el texto del motor y un `codigo`. Los demás son 500 con un texto propio
("No se pudo armar el Stock Diario…") y, si Prisma lo dio, su código P####. El
mensaje crudo nunca sale, porque el de Prisma puede traer el SQL, el host o el
nombre de la base: queda en el log del servidor.

**El plan**: la página del local se ordena como `(dia, instante, id)`. Así
PostgreSQL recorre `(localId, dia)` y ordena dentro de cada día. Medido en
`stockDiario.mjs` sobre un millón de movimientos, la página 21 de un año lee 2.501
filas; ordenada solo por `(instante, id)`, lee el año entero.

**Por qué es el mismo orden que el contrato**, `(instante, id)`. *(Verificado
contra PostgreSQL, sección H de `scripts/pruebas-db/stockDiario.mjs`.)* Dos
hechos:

1. En cada fila, `dia` es la fecha argentina de su `instante`. Lo escribe el
   trigger con `libro_stock_dia`, el libro no admite UPDATE y el verificador lo
   exige fila por fila.
2. La fecha argentina no retrocede cuando el instante avanza. Se comprobó para la
   zona tal como la conoce PostgreSQL, de 1920 a 2040 cada 15 minutos: cero
   retrocesos.

Con esos dos hechos, un instante menor nunca tiene un día mayor. Si los días
difieren, los dos órdenes coinciden; si son iguales, decide `(instante, id)` en
los dos. A igual instante hay igual día, y decide el id.

La prueba ejerce los bordes del día:

- 21:00 argentinas, que ya es otra fecha UTC con el mismo día argentino;
- la medianoche argentina;
- cuatro y quince movimientos en un mismo instante;
- un id mayor con un instante anterior del día previo;
- páginas de 1 a 200 que atraviesan el cambio de día.

En todos esos casos, las páginas pegadas son exactamente `ORDER BY instante, id`.

La contraprueba: con UNA fila cuyo día no es el de su instante, el orden se rompe,
y el verificador del libro lo marca en rojo. **La equivalencia depende de que el
verificador esté verde.** Si alguna vez una actualización de tzdata cambiara
retroactivamente la regla de la zona, el verificador lo vería antes que la API.

### La pantalla del Stock Diario

**Desde el 2026-09-30 vive en Finanzas**: `/modulos/finanzas/stock-diario`, en
el menú Finanzas → Stock Diario, y ya no aparece en el grupo Stock *(verificado
en código, `lib/menu/registry.js` y `lib/menu/stockDiarioEnFinanzas.test.mjs`)*.
La pantalla y su ítem piden `finanzas.ver` **y** `stock.ver`: el primero por ser
una herramienta de Finanzas, el segundo porque las rutas de datos —que no se
movieron, siguen en `/api/stock_locales/diario/` con `stock.ver` y solo GET— lo
exigen. Ningún rol de sistema por local tiene `finanzas.ver`, así que la ven
Admin y quien lo tenga tildado. `/modulos/stock_locales/diario`, donde vivía
antes, solo redirige a la nueva con su dirección completa. Es el diseño móvil de
Figma (`EVJ2KvVCrY0oVSowfboymQ`, nodos 300:478 y 300:676), armado con las piezas
de las pantallas por período *(verificado en código,
`components/stock_diario/` y `lib/stock/libro/stockDiarioPantalla.js`)*:

- Día, Semana y Mes se piden con `unidad` y `fecha`; **Otro** es el rango
  `desde`/`hasta` de la API, con `SunmiDateRangePicker`. Las flechas navegan con
  las puntas que devuelve el servidor, así que la semana es siempre la de Semana
  Operativa y la pantalla no calcula ninguna.
- Cada producto dice "Apertura X → Ahora Y" en curso y "→ Cierre Y" completo. Lo
  desconocido dice "No disponible" y lo que no existe "No existe" —un producto
  eliminado, uno que apareció—; en los dos casos no hay variación.
- La lista es la de `con_movimientos`, paginada de a 50, y la búsqueda va al
  servidor.
- **Pendiente de diseño:** el detalle del producto. El "Ver ›" del diseño no se
  dibuja, y la fila no es tocable, hasta que el detalle exista en Figma.

### Un posible hueco de alcance en Transferencias (sin corregir)

*(Leído en código, no ejercido.)* En `app/api/transferencias/tablero/route.js`,
para un local que no es depósito el alcance base es `{ destinoId: vista.localId }`,
pero un `?destino=` en la URL lo pisa: `localPedido = destinoPedido || …`, y
después `{ ...alcanceBase, destinoId: localPedido }`. Si es así, un local podría
leer las transferencias hacia otro local pasando su id. Está fuera del alcance de
la API del Stock Diario y no se tocó; hay que confirmarlo ejerciéndolo antes de
corregirlo.

## Cambios recientes
- 2026-09-30: feat(finanzas): Stock Diario se muda de Stock a Finanzas
- 2026-09-30: feat(stock): cada movimiento del Libro de Stock nombra su documento
- 2026-09-29: feat(stock): Stock Diario móvil — la pantalla del diseño, sobre la API que ya existía
- 2026-09-28: fix(stock): el ajuste y los límites del peso fijo en el depósito van en piezas
- 2026-09-28: feat: declarar el origen de las escrituras de costo para el Libro de Costos
- 2026-09-28: feat(stock): API de solo lectura del Stock Diario
- 2026-08-25: fix(stock): mostrar packs y unidades en movil (#12)
- 2026-07-28: feat(productos): codigo de barras propio por ubicacion
- 2026-07-26: fix(security): cerrar fugas operativas entre ubicaciones
- 2026-07-26: feat(ui): desactivar historial/autocompletado nativo del navegador en buscadores
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-23: feat(productos,proveedores): visibilidad depósito ↔ locales
- 2026-06-16: perf: paginar stock deposito en base de datos
- 2026-06-15: perf: paginar stock locales en base de datos
- 2026-06-15: perf: filtrar estados de stock locales en base de datos
- 2026-06-15: refactor: ordenar stock locales sin cambiar comportamiento
- 2026-06-15: perf: paginar stock locales en base de datos
- 2026-06-15: perf: filtrar estados de stock locales en base de datos
- 2026-06-15: refactor: ordenar stock locales sin cambiar comportamiento
- 2026-06-10: fix(fiambre): stock operativo del deposito en PIEZAS para fiambre fijo por pieza
- 2026-06-10: fix(fiambre): mostrar piezas reales en depósito y topar carrito por piezas
