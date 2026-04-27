# AUDITORIA FUNCIONAL — REPORTE POS VENTAS

Fecha: 2026-03-21
Ruta: `/modulos/auditoria-pos-ventas`
Nombre visible en menu: "Reporte POS Ventas"

---

## 1. Resumen ejecutivo

El modulo "Reporte POS Ventas" es un panel de solo lectura que muestra indicadores financieros agregados de las ventas POS de un local, para un rango de fechas seleccionado por el usuario. Opera exclusivamente sobre datos ya persistidos en la tabla `Venta` y sus relaciones (`VentaDetalle`, `Turno`, `Usuario`). No escribe datos, no modifica ventas, no altera el flujo POS.

Sirve como herramienta de control operativo basico: permite ver cuanto se facturo, cuanto se cobro, cuanto se gasto en comisiones, cual es la ganancia neta, y detectar tickets que generan perdida o margen bajo. No es una herramienta de auditoria forense ni de conciliacion contable.

---

## 2. Objetivo real del modulo

### Que hace
- Muestra KPIs financieros agregados (facturado, tickets, comisiones, neto, costo, ganancia, margen)
- Desglosa ventas por medio de pago
- Desglosa ventas por turno de caja
- Calcula rentabilidad por producto con comision prorrateada
- Identifica tickets con perdida o margen bajo

### Que NO hace
- No concilia contra extractos bancarios
- No valida stock fisico contra vendido
- No detecta fraudes
- No analiza descuentos individuales
- No maneja multi-medio de pago por ticket
- No registra anulaciones ni devoluciones
- No modifica datos de ventas
- No permite exportar a Excel/PDF (no implementado)

### Nombre vs realidad
La ruta interna sigue siendo `/auditoria-pos-ventas` (filesystem), pero el nombre visible es "Reporte POS Ventas". El modulo funciona como reporte de analisis, no como auditoria. El nombre actual es correcto respecto a lo que entrega.

---

## 3. Mapa tecnico completo

### Capa de presentacion (frontend)

```
page.jsx (pagina principal)
  |-- useUser() .................. perfil y permisos del usuario logueado
  |-- useContextoActivo() ........ local activo (contexto operativo)
  |-- useAuditoriaPosVentas() .... hook que carga los 5 endpoints en paralelo
  |-- HallazgosBlock ............. componente inline (en page.jsx)
  |-- ResumenKpis.jsx ............ grid de 7 KPIs
  |-- TablaMediosPago.jsx ........ tab "Medios de pago"
  |-- TablaTurnos.jsx ............ tab "Ventas por turno"
  |-- TablaRentabilidadProductos.. tab "Rentabilidad"
  |-- TablaTicketsConflictivos ... tab "Tickets a revisar"
```

### Capa de datos (backend)

```
5 endpoints GET (solo lectura):
  /api/auditoria-pos-ventas/resumen .... KPIs agregados
  /api/auditoria-pos-ventas/medios ..... desglose por medio de pago
  /api/auditoria-pos-ventas/turnos ..... desglose por turno
  /api/auditoria-pos-ventas/productos .. rentabilidad por producto
  /api/auditoria-pos-ventas/tickets .... tickets conflictivos (paginado)
```

### Capa de logica compartida

```
lib/auditoria-pos-ventas/
  scope.js ........... autenticacion + scope de local + parseo de fechas
  constantes.js ...... UMBRAL_MARGEN_BAJO_PCT (5%), MEDIOS_CONOCIDOS
  agregaciones.js .... bucketMedioPago, margenPctFromSums, estadoTicket, estadoProducto
```

### Tablas de DB consultadas

| Tabla | Uso |
|-------|-----|
| `Venta` | Universo principal — todos los bloques |
| `VentaDetalle` | Solo bloque de rentabilidad por producto |
| `Turno` | Bloque de turnos + referencia en tickets |
| `Usuario` | Nombre del cajero en turnos y tickets |

---

## 4. Flujo completo de funcionamiento

### 4.1. Carga inicial

1. El usuario navega a `/modulos/auditoria-pos-ventas`
2. `page.jsx` verifica:
   - Sesion activa (useUser) — si no, no renderiza
   - Contexto operativo (useContextoActivo) — si no tiene, redirige a `/inicio`
   - Permiso `reportes.ver` o admin (`*`) — si no, muestra `<SinPermisos />`
3. Se inicializan `fechaDesde` y `fechaHasta` en la fecha de hoy (ISO, timezone del browser)
4. Se muestra el formulario de filtros con estado vacio

### 4.2. Consulta

1. El usuario selecciona rango de fechas y pulsa "Consultar"
2. `useAuditoriaPosVentas.cargar()` dispara 5 fetch en paralelo:
   - `GET /api/.../resumen?fechaDesde=X&fechaHasta=Y`
   - `GET /api/.../turnos?fechaDesde=X&fechaHasta=Y`
   - `GET /api/.../medios?fechaDesde=X&fechaHasta=Y`
   - `GET /api/.../productos?fechaDesde=X&fechaHasta=Y`
   - `GET /api/.../tickets?fechaDesde=X&fechaHasta=Y&page=1&pageSize=25`
3. Cada endpoint ejecuta:
   - `getAuditoriaScope(req)` — verifica permiso `reportes.ver` + resuelve `localId` desde sesion/contexto
   - `parseRangoFechas(searchParams)` — convierte strings a `Date` con offset `-03:00` (Argentina)
   - Query especifica a Prisma/SQL
4. Las 5 respuestas se setean en el state del hook
5. La UI renderiza KPIs + Hallazgos + tab activo

### 4.3. Paginacion de tickets

- Solo el bloque de tickets es paginado (25 items por pagina)
- Al cambiar de pagina, se dispara `cargarTicketsPage()` — solo recarga el endpoint de tickets
- Los otros 4 bloques no se recargan

### 4.4. Cambio de tab

- Puramente frontend — no dispara nuevas queries
- Los datos de todos los tabs ya estan cargados en memoria desde la consulta inicial

---

## 5. Explicacion bloque por bloque

### 5.1. Header / contexto

- **Que muestra**: titulo "Reporte POS Ventas", nombre del local activo, rango consultado
- **De donde sale**: `contexto.nombre` (hook useContextoActivo), `fechaDesde`/`fechaHasta` (state local)
- **Nota**: el rango solo se muestra despues de consultar exitosamente

### 5.2. Filtros

- **Que muestra**: dos date pickers (Desde, Hasta) + boton Consultar
- **Comportamiento**: se inicializan en hoy. No validan que Desde <= Hasta. No limitan rango maximo.
- **El localId NO se envia desde el frontend** — el servidor lo resuelve internamente desde sesion/cookie

### 5.3. KPIs (ResumenKpis)

| KPI | Campo DB | Tipo | Calculo |
|-----|----------|------|---------|
| Facturado | `Venta.total` | Persistido | `SUM(total)` |
| Tickets | `Venta.id` | Persistido | `COUNT(id)` |
| Comisiones | `Venta.comisionBancaria` | Persistido | `SUM(comisionBancaria)` |
| Neto recibido | `Venta.netoRecibido` | Persistido | `SUM(netoRecibido)` |
| Costo | `Venta.costoTotal` | Persistido | `SUM(costoTotal)` |
| Ganancia | `Venta.gananciaNeta` | Persistido | `SUM(gananciaNeta)` |
| Margen | Derivado | Derivado en backend | `SUM(gananciaNeta) / SUM(netoRecibido) * 100` |

- **Universo**: todas las ventas del local activo con `fecha` en el rango
- **Dato**: 100% persistido excepto margen (calculado)
- **Estilo**: ganancia negativa se muestra en rojo

### 5.4. Hallazgos (HallazgosBlock)

- **Que muestra**: cantidad total de tickets conflictivos + desglose parcial (perdida / margen bajo)
- **De donde sale**:
  - Total: `ticketsPagination.total` (del endpoint de tickets)
  - Desglose: conteo de `estado` en la pagina actual de tickets (frontend)
- **Limitacion critica**: el desglose (X con perdida, Y con margen bajo) se calcula solo sobre la pagina actual (max 25 tickets). Si hay mas paginas, el desglose es parcial y se indica con "(pagina actual)".
- **CTA**: boton "Ver tickets" cambia al tab de tickets

### 5.5. Medios de pago

- **Que muestra**: tabla con bruto, comision, neto, costo, ganancia por medio de pago
- **Medios reconocidos**: efectivo, debito, credito, mercadopago, fiado, otros
- **Logica de clasificacion**:
  1. Si `venta.esFiado === true` → "fiado" (prioridad maxima)
  2. Si `venta.formaPago` (lowercase) esta en MEDIOS_CONOCIDOS → ese medio
  3. Sino → "otros"
- **Dato**: 100% persistido (SUM de campos de Venta por bucket)
- **UI**: filas con todo en $0 se ocultan, se muestra nota "X medio(s) sin movimiento"
- **Fila de totales**: sum de filas visibles
- **Carga**: todas las ventas se cargan en memoria con `findMany`, se agrupan en JS
- **Riesgo de performance**: con miles de ventas, el `findMany` puede ser costoso

### 5.6. Ventas por turno

- **Que muestra**: tabla con apertura, cierre, esperado/real/diferencia efectivo, ventas, bruto, comision, neto, costo, ganancia, cajero
- **Criterio de inclusion**: turnos cuya `apertura` cae en el rango de fechas del filtro
- **Montos de efectivo**: `montoEsperadoEfectivo`, `montoRealEfectivo`, `diferenciaEfectivo` — persistidos en el cierre de turno
- **Ventas agregadas**: `groupBy turnoId` sobre Venta, filtrado por rango Y turnoId
- **Dato de ventas**: 100% persistido (SUM de campos de Venta)
- **Limitacion**: si un turno se abrio antes del rango pero tiene ventas dentro del rango, ese turno NO aparece (se filtra por apertura del turno, no por fecha de ventas)
- **Fila de totales**: sum de ventas/bruto/comision/neto/costo/ganancia

### 5.7. Rentabilidad por producto

- **Que muestra**: tabla con producto, cantidad, venta, costo, comision prorrateada, resultado, margen, estado
- **Fuente de datos**: tabla `VentaDetalle` (lineas de venta), con JOIN a `Venta` para obtener total y comision
- **Agrupacion**: por `productoBaseId`
- **Calculo de comision prorrateada**:
  ```
  share = subtotalLinea / totalTicket
  comisionProrrateada = comisionBancariaTicket * share
  ```
  Esto NO esta persistido — se calcula en el endpoint cada vez
- **Resultado real por producto**:
  ```
  resultadoReal = subtotalLinea - (precioCosto * cantidad) - comisionProrrateada
  ```
- **Estado**:
  - `perdida`: resultadoReal < 0
  - `margen bajo`: resultadoReal >= 0 Y (resultadoReal / venta) < 5%
  - `normal`: el resto
- **Orden**: de menor a mayor resultado real (los peores primero)
- **Riesgo de interpretacion**: la comision prorrateada es una estimacion, no un dato real por linea. Un producto que representa el 50% del ticket absorbe 50% de la comision, pero eso no refleja comision real por producto.
- **Carga**: todos los VentaDetalle se cargan en memoria — costoso con alto volumen
- **UI**: la nota aclara que la comision es prorrateada/derivada, con detalle colapsable

### 5.8. Tickets a revisar

- **Que muestra**: tabla paginada de tickets que cumplen criterio de conflictividad
- **Criterio** (hardcoded en SQL raw):
  - `gananciaNeta < 0` → ticket con perdida
  - `gananciaNeta >= 0 AND netoRecibido > 0 AND (gananciaNeta / netoRecibido) < 0.05` → margen bajo (menos de 5%)
- **Columnas**: ticket, fecha, turno, cajero, forma pago, total, comision, costo, ganancia neta, margen %, estado
- **Paginacion**: 25 items por pagina, server-side (LIMIT/OFFSET)
- **Orden**: `fecha DESC` (mas recientes primero)
- **Dato**: 100% persistido (campos de Venta) + JOINs a Usuario y Turno
- **Estado por ticket**: calculado con `estadoTicket()` en backend
- **Nota**: el criterio del 5% esta hardcoded en la query SQL y en `constantes.js` como `UMBRAL_MARGEN_BAJO_PCT = 5`

---

## 6. Logica de datos y calculos

### 6.1. Rango de fechas

- El usuario envia `fechaDesde` y `fechaHasta` como strings YYYY-MM-DD
- El backend los convierte a:
  - `fechaInicio = new Date("YYYY-MM-DDT00:00:00-03:00")`
  - `fechaFin = new Date("YYYY-MM-DDT23:59:59.999-03:00")`
- El offset `-03:00` (Argentina) esta hardcodeado en `scope.js`
- Todos los endpoints usan el mismo rango, con la misma logica de parseo

### 6.2. Universo por bloque

| Bloque | Tabla principal | Filtro de fecha | Campo de fecha |
|--------|----------------|-----------------|----------------|
| Resumen / KPIs | Venta | `fecha >= inicio AND fecha <= fin` | `Venta.fecha` |
| Medios de pago | Venta | `fecha >= inicio AND fecha <= fin` | `Venta.fecha` |
| Turnos | Turno + Venta | Turno: `apertura >= inicio AND apertura <= fin`. Ventas: `fecha >= inicio AND fecha <= fin AND turnoId = turno.id` | `Turno.apertura` / `Venta.fecha` |
| Productos | VentaDetalle → Venta | `venta.fecha >= inicio AND venta.fecha <= fin` | `Venta.fecha` (via relacion) |
| Tickets | Venta | `fecha >= inicio AND fecha <= fin` | `Venta.fecha` |

**Inconsistencia del bloque Turnos**: el filtro de turnos usa `apertura` del turno, no `fecha` de las ventas. Un turno que se abrio el dia 5 y cerro el dia 7 solo aparece si el rango incluye el dia 5. Las ventas del dia 6 y 7 se contabilizan SI estan en el rango, pero el turno no aparece si su apertura esta fuera.

### 6.3. Campos persistidos vs derivados

| Campo | Persistido en DB | Derivado en endpoint | Derivado en frontend |
|-------|:---:|:---:|:---:|
| `Venta.total` | Si | — | — |
| `Venta.comisionBancaria` | Si | — | — |
| `Venta.netoRecibido` | Si | — | — |
| `Venta.costoTotal` | Si | — | — |
| `Venta.gananciaNeta` | Si | — | — |
| `Venta.formaPago` | Si | — | — |
| `Venta.esFiado` | Si | — | — |
| Margen % (resumen) | — | Si | — |
| Bucket de medio de pago | — | Si | — |
| Comision prorrateada por producto | — | Si | — |
| Resultado real por producto | — | Si | — |
| Estado de ticket (perdida/margen bajo) | — | Si | — |
| Estado de producto | — | Si | — |
| Desglose hallazgos (perdida/margen bajo) | — | — | Si (pagina actual) |

### 6.4. Formulas exactas

**Margen % (resumen)**:
```
margenPct = (SUM(gananciaNeta) / SUM(netoRecibido)) * 100
Si SUM(netoRecibido) = 0 → null (se muestra "—")
```

**Comision prorrateada por producto**:
```
share = subtotalLinea / totalTicket
comisionProrrateada = comisionBancariaTicket * share
Si totalTicket = 0 → share = 0
```

**Resultado real por producto**:
```
resultadoReal = subtotalLinea - (precioCosto * cantidad) - comisionProrrateada
```

**Estado ticket**:
```
Si gananciaNeta < 0 → "perdida"
Si netoRecibido > 0 AND (gananciaNeta / netoRecibido) * 100 < 5 → "margen bajo"
Sino → "normal"
```

**Estado producto**:
```
Si resultadoReal < 0 → "perdida"
Si venta > 0 AND (resultadoReal / venta) * 100 >= 0 AND < 5 → "margen bajo"
Sino → "normal"
```

---

## 7. Uso operativo real

### Que puede hacer un usuario con este modulo

- Ver cuanto facturo el local en un rango de fechas
- Ver cuanto gano realmente despues de comisiones y costos
- Detectar que medios de pago generan perdida (ej: mercadopago con comision alta)
- Comparar turnos y ver cual fue mas rentable
- Identificar productos que se venden a perdida o con margen bajo
- Ver que tickets individuales salieron con ganancia negativa
- Usar como control de cierre de caja rapido

### Que decisiones puede tomar

- Subir precio de productos con margen bajo
- Reducir uso de medios de pago con comision alta
- Investigar tickets puntuales con perdida
- Evaluar rendimiento por turno/cajero
- Comparar periodos (consultando diferentes rangos)

### Que NO puede validar

- No puede verificar si los costos cargados en productos son correctos
- No puede validar si las comisiones bancarias reflejan los extractos reales
- No puede detectar ventas no registradas (venta sin ticket)
- No puede conciliar contra banco
- No puede detectar si un turno cerro con faltante de efectivo real (solo muestra lo que el POS registro)
- No puede validar stock: no cruza ventas contra movimientos de stock

---

## 8. Dependencias tecnicas

### Archivos involucrados

**Frontend** (7 archivos):
- `app/modulos/auditoria-pos-ventas/page.jsx`
- `hooks/useAuditoriaPosVentas.js`
- `components/auditoria-pos-ventas/ResumenKpis.jsx`
- `components/auditoria-pos-ventas/TablaTurnos.jsx`
- `components/auditoria-pos-ventas/TablaMediosPago.jsx`
- `components/auditoria-pos-ventas/TablaRentabilidadProductos.jsx`
- `components/auditoria-pos-ventas/TablaTicketsConflictivos.jsx`

**Backend** (5 endpoints):
- `app/api/auditoria-pos-ventas/resumen/route.js`
- `app/api/auditoria-pos-ventas/turnos/route.js`
- `app/api/auditoria-pos-ventas/medios/route.js`
- `app/api/auditoria-pos-ventas/productos/route.js`
- `app/api/auditoria-pos-ventas/tickets/route.js`

**Logica compartida** (3 archivos):
- `lib/auditoria-pos-ventas/scope.js`
- `lib/auditoria-pos-ventas/constantes.js`
- `lib/auditoria-pos-ventas/agregaciones.js`

**Dependencias del ERP**:
- `lib/authorize.js` → `requirePerm()`
- `lib/grupos.js` → `resolveLocalAndGrupo()`
- `lib/prisma.js` → cliente Prisma
- `app/context/UserContext` → perfil del usuario
- `hooks/useContextoActivo` → local activo
- `lib/menuConfig.js` → entrada en menu lateral

**Menu**:
- `lib/menuConfig.js` linea 66: `{ label: "Reporte POS Ventas", href: "/modulos/auditoria-pos-ventas" }`

### Tablas de DB

| Modelo Prisma | Tabla PostgreSQL | Campos usados |
|---------------|-----------------|---------------|
| Venta | "Venta" | id, localId, vendedorId, turnoId, numero, fecha, total, comisionBancaria, netoRecibido, costoTotal, gananciaNeta, formaPago, esFiado, createdAt |
| VentaDetalle | "VentaDetalle" | productoBaseId, nombre, cantidad, subtotal, precioCosto, ventaId |
| Turno | "Turno" | id, localId, apertura, cierre, montoEsperadoEfectivo, montoRealEfectivo, diferenciaEfectivo, vendedorId |
| Usuario | "Usuario" | id, nombre, email |

---

## 9. Riesgos y limitaciones

### 9.1. Riesgo: mezcla de datos persistidos y derivados

La comision prorrateada por producto es un calculo estimativo. El ERP no persiste comision por linea de venta. El prorrateo usa `subtotalLinea / totalTicket` como proporcion. Si un ticket tiene un producto de $100 y otro de $900, el de $900 absorbe 90% de la comision. Esto puede ser engaganoso para productos que siempre se venden junto a otros mas caros.

**Impacto**: un usuario de negocio podria creer que un producto "tiene" esa comision cuando en realidad es una distribucion arbitraria.

### 9.2. Riesgo: inconsistencia en universo de turnos

El bloque de turnos filtra por `apertura` del turno, pero las ventas se filtran por `fecha`. Si un turno se abrio el dia 5 a las 22:00 y cerro el dia 6 a las 02:00, y el usuario consulta solo el dia 6, ese turno NO aparece (apertura fuera de rango), pero sus ventas del dia 6 SI aparecen en KPIs, medios y productos.

**Impacto**: las ventas del resumen pueden no cuadrar con la suma de ventas por turno.

### 9.3. Riesgo: ventas sin turno

Una venta puede tener `turnoId = null`. Esas ventas se cuentan en KPIs y medios pero no aparecen en ningun turno del bloque de turnos.

**Impacto**: la fila de totales de turnos puede ser menor que el KPI de facturado.

### 9.4. Riesgo: performance con alto volumen

Los endpoints de medios y productos cargan TODAS las ventas/detalles del rango en memoria con `findMany`. Con miles de ventas en un mes, esto puede ser lento o consumir memoria excesiva.

### 9.5. Riesgo: desglose de hallazgos parcial

El bloque de hallazgos muestra "X con perdida, Y con margen bajo" contando solo la pagina actual de tickets (max 25). Si hay 200 tickets conflictivos, el desglose solo refleja los primeros 25.

### 9.6. Riesgo: margen en resumen vs margen en producto

El margen % del resumen usa `gananciaNeta / netoRecibido`. El margen % por producto usa `resultadoReal / ventaSubtotal`. Son formulas con bases distintas (neto vs venta bruta del producto). No son directamente comparables.

### 9.7. Riesgo: timezone

El offset `-03:00` esta hardcodeado. Si el negocio opera en otra timezone o si Argentina cambia de horario, el rango seria incorrecto. Tambien: la fecha inicial (`hoy`) se calcula con `new Date().toISOString()` en el browser, que usa UTC. En Argentina a las 22:00 UTC-3, el ISO seria del dia siguiente en UTC.

### 9.8. Riesgo: seguridad — localId para no-admin

La funcion `resolveLocalAndGrupo` (compartida con todo el ERP) permite a usuarios no-admin sin localId fijo pasar `localId` via query params. El hook del frontend NO envia localId, pero la API no bloquea explicitamente ese parametro. Un usuario con `reportes.ver` podria construir una request manual con otro localId.

### 9.9. Limitacion: sin exportacion

No hay exportacion a CSV, Excel ni PDF. El usuario solo puede ver los datos en pantalla.

### 9.10. Limitacion: sin comparacion entre periodos

No hay forma de comparar dos rangos de fechas lado a lado. El usuario tiene que consultar uno, recordar los numeros, y consultar el otro.

---

## 10. Veredicto final

### Que es realmente este modulo
Un reporte financiero basico de ventas POS por local. Muestra indicadores clave derivados de datos ya persistidos, con un bloque adicional de deteccion de tickets problematicos.

### Que tan confiable es
**Alta confiabilidad en KPIs y medios de pago**: usan directamente `SUM` sobre campos persistidos, sin derivaciones. Si los datos de venta son correctos, los KPIs son correctos.

**Confiabilidad media en turnos**: correcto pero incompleto si el rango corta turnos por la mitad.

**Confiabilidad media en rentabilidad por producto**: la comision prorrateada es una estimacion razonable pero no exacta. El modulo lo aclara visualmente.

**Alta confiabilidad en tickets a revisar**: criterio simple y transparente, datos persistidos.

### Que tan util es
Util para control operativo diario: ver rapido como fue el dia/semana, detectar problemas de margen, comparar medios de pago. No util para auditoria financiera profunda ni conciliacion.

### Para que tipo de uso sirve
- Revision rapida de cierre de dia
- Deteccion de productos mal precificados
- Evaluacion de impacto de comisiones por medio de pago
- Control basico de turnos de caja
- Deteccion temprana de tickets con perdida

### Para que tipo de uso NO sirve
- Auditoria contable
- Conciliacion bancaria
- Deteccion de fraude
- Analisis de descuentos
- Proyeccion de ventas
- Comparacion entre locales (opera solo sobre el local activo)
- Comparacion entre periodos (consulta uno a la vez)

---

## 11. Archivos involucrados

```
app/modulos/auditoria-pos-ventas/page.jsx
hooks/useAuditoriaPosVentas.js
components/auditoria-pos-ventas/ResumenKpis.jsx
components/auditoria-pos-ventas/TablaTurnos.jsx
components/auditoria-pos-ventas/TablaMediosPago.jsx
components/auditoria-pos-ventas/TablaRentabilidadProductos.jsx
components/auditoria-pos-ventas/TablaTicketsConflictivos.jsx
app/api/auditoria-pos-ventas/resumen/route.js
app/api/auditoria-pos-ventas/turnos/route.js
app/api/auditoria-pos-ventas/medios/route.js
app/api/auditoria-pos-ventas/productos/route.js
app/api/auditoria-pos-ventas/tickets/route.js
lib/auditoria-pos-ventas/scope.js
lib/auditoria-pos-ventas/constantes.js
lib/auditoria-pos-ventas/agregaciones.js
lib/menuConfig.js
lib/authorize.js (dependencia - requirePerm)
lib/grupos.js (dependencia - resolveLocalAndGrupo)
```
