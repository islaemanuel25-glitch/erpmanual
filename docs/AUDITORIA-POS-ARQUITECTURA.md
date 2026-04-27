# Auditoría POS — Estado Final (V1 + V2 analítica)

> Actualizado: 2026-03-24. Refleja el estado real tras cierre de V2 sin migración.

---

## 1. Objetivo

Hub modular de Auditoría POS con 5 submódulos funcionales.
Prioridad: trazabilidad operativa real, no solo métricas.

---

## 2. Estructura implementada

```
app/modulos/auditoria-pos-ventas/
  page.jsx              → Hub (5 tarjetas)
  layout.jsx            → Breadcrumb en subrutas
  turnos/page.jsx       → Funcional
  cajas/page.jsx        → Funcional
  balances/page.jsx     → Funcional + comparación temporal
  productos/page.jsx    → Funcional + sort + filtro por categoría
  operadores/page.jsx   → Funcional + filtro por persona
```

### Hooks (1 por submódulo)

| Hook | APIs |
|------|------|
| `useAuditoriaTurnos` | resumen, turnos, tickets, sin-turno, personas (on-demand) |
| `useAuditoriaCajas` | cajas |
| `useAuditoriaBalances` | resumen, medios, balances (comparación opcional) |
| `useAuditoriaProductos` | productos (con categorías), tickets |
| `useAuditoriaOperadores` | operadores |

### Endpoints (10 total)

| Endpoint | Submódulo | Origen |
|----------|-----------|--------|
| `GET /auditoria-pos-ventas/resumen` | Turnos, Balances | Pre-existente, ampliado (ticketPromedio) |
| `GET /auditoria-pos-ventas/turnos` | Turnos | Pre-existente |
| `GET /auditoria-pos-ventas/medios` | Balances | Pre-existente |
| `GET /auditoria-pos-ventas/productos` | Productos | Pre-existente, ampliado (categorías) |
| `GET /auditoria-pos-ventas/tickets` | Turnos, Productos | Pre-existente |
| `GET /auditoria-pos-ventas/turnos/personas` | Turnos | Nuevo V1 |
| `GET /auditoria-pos-ventas/turnos/sin-turno` | Turnos | Nuevo V1 |
| `GET /auditoria-pos-ventas/cajas` | Cajas | Nuevo V1 |
| `GET /auditoria-pos-ventas/operadores` | Operadores | Nuevo V1 |
| `GET /auditoria-pos-ventas/balances` | Balances | Nuevo V2 (comparación temporal con desglose por medio) |

### Componentes compartidos

| Componente | Usado por |
|------------|-----------|
| `ResumenKpis` | Turnos, Balances (8 KPIs: facturado, tickets, comisiones, neto, costo, ganancia, margen, ticket promedio) |
| `TablaMediosPago` | Balances |
| `TablaRentabilidadProductos` | Productos |
| `TablaTicketsConflictivos` | Turnos, Productos |

### Eliminado

- `hooks/useAuditoriaPosVentas.js` — hook monolítico
- `components/auditoria-pos-ventas/TablaTurnos.jsx` — componente legacy
- Label "Reporte POS Ventas" → "Auditoría POS"

---

## 3. Reglas funcionales

### R1: No hay ventas sin turno abierto
- Validación runtime en `/api/pos-ventas/crear` (turnoId obligatorio + turno válido)
- Detección en auditoría: endpoint `/sin-turno` + alerta visual expandible en Turnos
- Limitación: `Venta.turnoId` nullable en DB (validación solo por API)

### R2: Trazabilidad por tupla
| Campo | Trazable | Fuente |
|-------|----------|--------|
| fecha/hora | Si | `Venta.fecha` NOT NULL |
| turno | Si* | `Venta.turnoId` (*nullable, detección activa) |
| caja | Si | Via turno (1 turno = 1 caja) |
| persona | Si | `Venta.vendedorId → Usuario` NOT NULL |
| local | Si | `Venta.localId` NOT NULL |

### R3: Reconstruir caja cerrada
Implementado completo en Cajas: montoInicial → ventas → movimientos manuales → esperado → real → diferencia.

---

## 4. Funcionalidad por submódulo

### Turnos
- Tabla selectable con métricas de ventas por turno
- Click en turno → cards de personas (tickets, bruto, ganancia, descuento)
- Alerta expandible de ventas sin turno
- KPIs del período (8 métricas)
- Tickets conflictivos con paginación

### Cajas
- Cards expandibles por caja/turno
- Badge estado: abierto/cerrado
- 12 métricas: monto inicial, efectivo, digital, fiado, ingresos, retiros, comisión, neto, costo, descuento, esperado, real
- Badge diferencia: cuadra / sobrante / faltante
- Movimientos manuales con tipo, monto, motivo, responsable, fecha
- Mini resumen: total cajas, abiertas, con diferencia

### Balances
- KPIs globales (8 métricas incluyendo ticket promedio)
- Desglose por medio de pago
- Comparación temporal opcional (doble rango)
- Tabla comparativa global: tickets, bruto, ganancia, ticket prom., comisión, neto, costo, margen + variación %
- Tabla comparativa por medio de pago: bruto + ganancia × rango + variación %

### Productos
- Tabla de rentabilidad por producto con categoría
- 5 modos de orden: menos rentable, más rentable, más vendido (cant.), mayor facturación, solo con pérdida
- Filtro por categoría (botones pill dinámicos)
- Tickets conflictivos con paginación

### Operadores
- Cards expandibles por persona (vendedorId → Usuario)
- 10 métricas: tickets, bruto, comisión, neto, costo, ganancia, descuentos, turnos, cierres, diferencia acumulada
- Detalle de turnos del período con apertura, cierre, diferencia
- Filtro por nombre/email
- Mini resumen: personas, con diferencias, con descuentos

---

## 5. Limitaciones que persisten

| # | Limitación | Impacto |
|---|-----------|---------|
| 1 | **Operador = Usuario** | Trazabilidad por `vendedorId`. `OperadorLocal` sin FK con Venta/Turno. |
| 2 | **Turno = Caja** | No hay modelo `Caja` separado. 1 turno = 1 caja. |
| 3 | **Un responsable por turno** | No hay `cerradoPorId`. El que abrió es el que cierra. |
| 4 | **Comisión prorrateada en runtime** | Se calcula con config actual, no la histórica de la fecha de venta. |
| 5 | **Sin log de acciones POS** | No hay tabla para anulaciones, cambios de precio, etc. |
| 6 | **Descuento aggregate** | `Venta.descuento` suma auto + manual + puntos. No separable. |
| 7 | **turnoId nullable** | Validación solo por API, no por constraint DB. |

---

## 6. Pendientes — V2 estructural (requiere migración de schema)

| Item | Cambio | Riesgo |
|------|--------|--------|
| Trazabilidad por OperadorLocal | `operadorId Int?` en Venta + Turno + FK + modificar creación de venta | ALTO |
| Responsable de cierre separado | `cerradoPorId Int?` en Turno + modificar `/turnos/cerrar` | MEDIO |
| turnoId NOT NULL | `Venta.turnoId Int` + limpiar datos legacy | ALTO |
| Log de actividad POS | Nueva tabla `PosAuditLog` | MEDIO |
| Comisión persistida por línea | `comision Decimal` en VentaDetalle + modificar creación de venta | BAJO |
| Desglose de descuento por tipo | Campos separados o tabla auxiliar | BAJO |
