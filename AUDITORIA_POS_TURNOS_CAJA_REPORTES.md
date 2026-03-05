# Auditoría: POS, turnos, caja y reportes

**Objetivo:** Entender exactamente la arquitectura actual de POS, turnos, caja y reportes. Sin implementaciones ni código nuevo.

---

## 1. Modelos relacionados en Prisma / DB

### 1.1 Modelos que SÍ existen

| Modelo | Campos | Relaciones |
|--------|--------|------------|
| **Turno** | id, localId, vendedorId, apertura (DateTime), cierre (DateTime?), montoInicial (Decimal), montoEsperadoEfectivo?, montoRealEfectivo?, diferenciaEfectivo?, totalVentasEfectivo?, totalVentasDigital?, cantidadVentas?, observaciones?, createdAt, updatedAt | local → Local; vendedor → Usuario; ventas → Venta[] |
| **Venta** | (ver sección 2) | local, vendedor, cliente?, **turno?**, detalles, movimientoCC, movimientosPuntos |
| **VentaDetalle** | (ver sección 3) | venta, productoBase |
| **PosVentaCounter** | id, grupoId, localId, ultimoNumero, createdAt, updatedAt | local → Local; grupo → Grupo |
| **PosTransferencia** | (transferencias depósito↔local, no “caja”) | origen, destino, usuario, detalles, transferencias |

### 1.2 Modelos que NO existen

- **Caja** — No hay modelo Caja. No existe “caja” como entidad (una caja física por local).
- **Pos** — No hay modelo Pos. El “POS” es el módulo/flujo que usa Local + Turno + Venta.
- **CierreTurno** — No existe como modelo; el cierre se guarda en **Turno.cierre** y campos del mismo Turno.
- **AperturaTurno** — No existe como modelo; la apertura es **Turno** con cierre=null y Turno.apertura.
- **Arqueo** — No existe modelo Arqueo. No hay registro de arqueos separado del cierre del turno.
- **MovimientoCaja** — No existe. No hay movimientos de caja (ingresos/egresos/retiros/cambio).
- **SesionCaja** — No existe. La “sesión” es el Turno (un turno por vendedor por local con cierre=null).

---

## 2. Modelo Venta (completo)

**Archivo:** `prisma/schema.prisma` (aprox. líneas 422-627)

```prisma
model Venta {
  id               Int      @id @default(autoincrement())
  localId          Int
  vendedorId       Int
  clienteId        Int?
  turnoId          Int?                    // ← asociación a turno (opcional)
  numero           Int
  clientTxnId      String?  @unique
  fecha            DateTime @default(now())
  subtotal         Decimal  @db.Decimal(12, 2)
  descuento        Decimal  @default(0) @db.Decimal(12, 2)
  total            Decimal  @db.Decimal(12, 2)
  comisionBancaria Decimal  @default(0) @db.Decimal(12, 2)
  netoRecibido     Decimal  @default(0) @db.Decimal(12, 2)
  costoTotal       Decimal  @default(0) @db.Decimal(12, 2)
  gananciaBruta    Decimal  @default(0) @db.Decimal(12, 2)
  gananciaNeta     Decimal  @default(0) @db.Decimal(12, 2)
  formaPago        String
  esFiado          Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  local     Local
  vendedor  Usuario
  cliente   Cliente?
  turno     Turno?
  detalles  VentaDetalle[]
  movimientoCC      MovimientoCuenta[]
  movimientosPuntos ClientePuntoMovimiento[]

  @@unique([localId, numero])
  @@index([turnoId])
  // ...
}
```

**Resumen:**  
Venta tiene **usuario** (vendedorId), **createdAt**, **turnoId** (opcional), **formaPago**, **descuento**, **costoTotal**, **gananciaBruta**, **gananciaNeta**. No tiene **posId** ni **cajaId** ni **estado** (no hay estado “anulada” a nivel modelo).

---

## 3. Modelo VentaDetalle

**Archivo:** `prisma/schema.prisma` (aprox. 629-646)

| Campo | Tipo | Notas |
|-------|------|--------|
| id | Int | PK |
| ventaId | Int | FK Venta |
| productoBaseId | Int | FK ProductoBase |
| nombre | String | Nombre producto |
| **precio** | Decimal | Precio de venta (unitario en la venta) |
| **precioCosto** | Decimal | Costo usado para esa línea |
| **cantidad** | Decimal | Cantidad vendida |
| **subtotal** | Decimal | precio × cantidad (o lo guardado) |
| **ganancia** | Decimal | ganancia de la línea |
| createdAt | DateTime | |

**Confirmación costo unitario vs pack:**  
En la auditoría de costo ya se detectó que en **crear venta** (pos-ventas/crear) se puede estar guardando el costo de **pack** en `precioCosto` sin dividir por `factor_pack`. Es decir, el sistema **puede** estar persigiendo “costo unitario” pero hoy en muchos casos guarda de hecho el costo de pack; el reporte lee ese valor tal cual. No hay otro modelo que indique “este detalle es costo pack”; la intención del diseño es “costo por unidad de venta”.

---

## 4. Endpoints POS / turnos / caja / cierre

### 4.1 Bajo `/api/pos-ventas/`

| Método | Ruta | Qué hace |
|--------|------|----------|
| POST | `/api/pos-ventas/crear` | Crea una Venta (y VentaDetalle), descuenta stock, opcional MovimientoCuenta (fiado) y puntos. Recibe turnoId opcional y lo guarda en Venta.turnoId. |
| GET | `/api/pos-ventas/buscar-producto` | Búsqueda de productos para el carrito (por localId, q). Devuelve precios y stock. |
| GET | `/api/pos-ventas/historial-dia` | Lista ventas del día por localId (por fecha, sin filtrar por turno). Solo lectura. |
| GET | `/api/pos-ventas/stats-dia` | Estadísticas del día (por localId). Agregación de ventas. |
| POST | `/api/pos-ventas/turnos/abrir` | Crea un **Turno** (localId, vendedorId=session.id, montoInicial). Comprueba que el vendedor no tenga otro turno abierto (cierre=null) en ese local. |
| POST | `/api/pos-ventas/turnos/cerrar` | Cierra el turno: actualiza Turno con cierre=now(), montoEsperadoEfectivo, montoRealEfectivo, diferenciaEfectivo, totalVentasEfectivo/Digital, cantidadVentas, observaciones. No crea entidad aparte. |
| GET | `/api/pos-ventas/turnos/actual` | Devuelve el turno abierto (cierre=null) del vendedor en el localId dado. |
| GET | `/api/pos-ventas/turnos/resumen` | Dado turnoId, agrega ventas de ese turno por formaPago (totales efectivo/digital, comisión, desglose mercadopago/debito/credito). Solo lectura. |

### 4.2 Bajo `/api/turnos/` y `/api/caja/` y `/api/cierre*`

- **`/api/turnos/*`** — No existe carpeta `app/api/turnos/`. Todo está bajo `app/api/pos-ventas/turnos/`.
- **`/api/caja/*`** — No existe. No hay endpoints de caja.
- **`/api/cierre*`** — No existe. El cierre es `POST /api/pos-ventas/turnos/cerrar`.

---

## 5. “Abrir turno”

**Dónde:** `app/api/pos-ventas/turnos/abrir/route.js` (POST).

**Qué hace:**

- Recibe `localId` y `montoInicial` (body).
- Comprueba que el usuario no tenga ya un turno abierto en ese local (`Turno` con mismo localId, vendedorId=session.id, cierre=null).
- Crea **un registro Turno** con:
  - localId  
  - vendedorId = session.id  
  - montoInicial = valor enviado (monto inicial en caja)  
  - apertura = now() (default)  
  - cierre = null  

**No** cambia solo un “estado” global: persiste un **Turno** con usuario, hora de apertura y monto inicial. No hay entidad “Caja”; el “monto en caja” es implícito (montoInicial + ventas efectivo hasta el cierre).

---

## 6. “Cerrar turno”

**Dónde:** `app/api/pos-ventas/turnos/cerrar/route.js` (POST).

**Qué hace:**

- Recibe `turnoId`, `montoRealEfectivo`, `observaciones`.
- Verifica que el turno exista y pertenezca al usuario y que no esté ya cerrado (cierre=null).
- Lee todas las **Venta** con ese turnoId y suma por formaPago (efectivo vs resto).
- Calcula: montoEsperado = montoInicial + totalEfectivoVentas; diferencia = montoRealEfectivo - montoEsperado.
- **Actualiza el mismo Turno** con:
  - cierre = now()
  - montoEsperadoEfectivo
  - montoRealEfectivo
  - diferenciaEfectivo
  - totalVentasEfectivo, totalVentasDigital, cantidadVentas
  - observaciones

No crea tabla “CierreTurno” ni “Arqueo”; todo queda en el registro **Turno**. Sí se guarda total ventas, efectivo esperado, efectivo contado, diferencia y totales por tipo de pago (efectivo/digital). No hay desglose fino de “medios de pago” por tipo (MP, débito, crédito) en el Turno; ese desglose se calcula en **resumen** al vuelo desde las ventas.

---

## 7. Movimientos de caja

- **Modelo MovimientoCaja:** No existe en el schema.
- No hay registro de:
  - ingresos/egresos de caja
  - retiros
  - pagos a proveedores desde caja
  - “cambio inicial” como movimiento (solo monto inicial en Turno).

La única “caja” es el flujo: **monto inicial (Turno)** + **ventas en efectivo (Venta.formaPago=efectivo)** → **monto esperado**; al cerrar se compara con **monto real contado**.

---

## 8. Historial de ventas

**Pantalla:** Dentro del módulo POS (componente HistorialDia, llamada desde la página pos-ventas).  
**API:** `GET /api/pos-ventas/historial-dia?localId=...` — ventas del día por local (fecha >= hoy 00:00), sin filtro por turno.

**Acciones sobre ventas:**

- **Cancelar / anular / devolver venta:** No existe en el código. No hay endpoint tipo `DELETE /api/pos-ventas/venta/:id` ni `POST anular`. El historial es solo consulta; no hay botón que anule o devuelva.
- Por tanto: no hay impacto en stock, caja ni reportes por “anulación”, porque esa operación no existe.

---

## 9. Reportes

**Archivo:** `app/api/reportes-ventas/general/route.js` (GET).

**Datos que usa:**

- **Venta:** id, total, subtotal, descuento, comisionBancaria, netoRecibido, costoTotal, gananciaBruta, gananciaNeta, formaPago.
- **VentaDetalle:** nombre, cantidad, precio, subtotal, precioCosto, ganancia.

**Filtros del reporte:** fechaDesde, fechaHasta, localId (opcional), formaPago (opcional).  
**No** usa turno, usuario (vendedor) ni caja. Es decir: el reporte es por **rango de fechas** (y opcionalmente local y forma de pago), no “por turno” ni “por cajero” ni “por caja”.

---

## 10. Conclusión (preguntas directas)

1. **¿El sistema tiene arquitectura real de TURNOS?**  
   **Sí.** Existe el modelo **Turno** con apertura, cierre, monto inicial, totales de venta efectivo/digital, monto real y diferencia. Las ventas pueden asociarse a un turno (turnoId). Abrir/cerrar turno están implementados en `/api/pos-ventas/turnos/`.

2. **¿Las ventas están asociadas a turno?**  
   **Sí, pero opcional.** Venta tiene **turnoId** (nullable). La UI de POS envía turnoActual?.id al crear la venta; si no hay turno abierto, se envía null. Ventas creadas sin turno (o desde cola offline) quedan con turnoId null.

3. **¿Existe caja real o solo ventas?**  
   **Solo “caja” implícita en turno.** No hay modelo Caja ni MovimientoCaja. La “caja” es: monto inicial del turno + suma de ventas en efectivo del turno = monto esperado; al cierre se ingresa monto real y se guarda la diferencia. No hay movimientos de caja (retiros, ingresos extra, etc.).

4. **¿Existe arqueo?**  
   **No como entidad.** El cierre de turno guarda en el mismo Turno: efectivo esperado, efectivo contado y diferencia. No hay tabla “Arqueo” ni historial de arqueos separado.

5. **¿Se puede controlar caja por cajero?**  
   **Parcial.** Cada turno es por vendedor (cajero) y local; el resumen de cierre es por ese turno. No hay “caja” como recurso asignable (varios cajeros podrían en teoría abrir turnos en el mismo local y no hay concepto de “caja #1” vs “caja #2”).

6. **¿Qué falta para un POS “profesional”?**  
   - **Caja** como entidad (opcional por local) y/o turno atado a “caja”.  
   - **Movimientos de caja** (retiros, ingresos, gastos) además de ventas.  
   - **Arqueos** registrados como entidad (historial, múltiples arqueos por turno si se quisiera).  
   - **Anulación/devolución de ventas** con impacto en stock y (si aplica) en caja/turno.  
   - **Reportes por turno / por cajero**, no solo por fechas y local.  
   - **Obligatoriedad de turno abierto** para registrar venta (hoy se puede enviar turnoId null).

---

## 11. Mapa del sistema actual

Flujo real hoy:

```
1. Usuario entra a POS
   → Si no tiene turno abierto: modal "Abrir turno" (monto inicial)
   → POST /api/pos-ventas/turnos/abrir → crea Turno (localId, vendedorId, montoInicial)

2. Venta
   → Carrito + forma de pago
   → POST /api/pos-ventas/crear
        body: { localId, turnoId?, clienteId?, formaPago, items, ... }
   → Se crea Venta (con turnoId si se envió) y VentaDetalle
   → Se descuenta stock (StockLocal)
   → Opcional: MovimientoCuenta (fiado), puntos

3. Cierre de turno (cuando el cajero termina)
   → Modal "Cerrar turno": ingresa monto real en efectivo
   → POST /api/pos-ventas/turnos/cerrar
        body: { turnoId, montoRealEfectivo, observaciones }
   → Se actualiza Turno: cierre, totales, diferencia (no se crea CierreTurno ni Arqueo)

4. Reporte
   → GET /api/reportes-ventas/general?fechaDesde=&fechaHasta=&localId=&formaPago=
   → Lee Venta + VentaDetalle por fechas (y local/formaPago)
   → No usa Turno ni vendedor
```

**Piezas que faltan (resumen):**

- Modelo **Caja** y/o **MovimientoCaja**.
- Modelo **Arqueo** (o equivalente) si se quiere historial de arqueos.
- **Anular/devolver venta** (endpoint + impacto stock/caja).
- Reportes que **filtren o agrupen por turno / cajero**.
- **Obligar** turno abierto para crear venta (hoy turnoId es opcional).

---

**Documento solo de auditoría; no se ha escrito ni propuesto código.**
