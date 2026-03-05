# Auditoría + Plan UI: POS por Turno (por Cajero) — sin Caja/Pos

**Reglas operativas confirmadas:**
- Efectivo separado por cajero.
- El equipo/dispositivo NO importa.
- Turno = sesión del cajero en un local (apertura → ventas → cierre).
- En un local puede haber N turnos abiertos simultáneos (uno por usuario).

**Objetivo:** Reestructurar la comprensión del sistema para que el operador vea "Turnos" → entrar a un turno → ver ventas y cierre.  
**Alcance:** Sin nuevos modelos; solo política, UI y endpoints de listado/detalle.  
**No code:** Solo auditoría + plan.

---

## A) Estado actual confirmado

### 1) Turno existe con apertura/cierre y arqueo

- **Modelo:** `Turno` en `prisma/schema.prisma` (aprox. líneas 651-677).
- **Campos:** id, localId, vendedorId, apertura, cierre (nullable), montoInicial, montoEsperadoEfectivo, montoRealEfectivo, diferenciaEfectivo, totalVentasEfectivo, totalVentasDigital, cantidadVentas, observaciones, createdAt, updatedAt.
- **Relaciones:** local, vendedor, ventas.

### 2) Venta tiene turnoId nullable

- **Campo:** `Venta.turnoId` (Int?, FK a Turno).
- Las ventas pueden quedar con turnoId null (ej. cola offline, o si en el futuro se permitiera cobrar sin turno).

### 3) POS crea ventas con turnoId opcional

- **Endpoint:** `POST /api/pos-ventas/crear`.
- **Body:** incluye `turnoId`; se usa `turnoId: turnoId || null` al crear la Venta.
- **UI:** En `app/modulos/pos-ventas/page.jsx` se envía `turnoId: turnoActual?.id || null` al cobrar (online). En cola offline se envía explícitamente `turnoId: null`.

### 4) Reportes generales no usan turno

- **Endpoint:** `GET /api/reportes-ventas/general`.
- **Filtros:** fechaDesde, fechaHasta, localId (opcional), formaPago (opcional).
- No filtra ni agrupa por turno ni por vendedor.

---

## B) Propuesta P0 (sin nuevos modelos)

### B.1 Política: "No se puede cobrar sin turno abierto"

**Dónde se controla hoy:**

| Capa | Comportamiento actual | Archivo / endpoint |
|------|----------------------|--------------------|
| **UI** | Si no hay turno abierto (`turnoActual === null`), la página POS **no muestra** el layout de cobro: muestra solo `ModalAperturaTurno` hasta que el usuario abre turno. Por tanto, en flujo normal el usuario no puede llegar al botón "Cobrar" sin turno. | `app/modulos/pos-ventas/page.jsx` (aprox. líneas 1036-1044) |
| **API** | `POST /api/pos-ventas/crear` **acepta** `turnoId` null y guarda la venta con `turnoId: null`. No hay validación que exija turno abierto. | `app/api/pos-ventas/crear/route.js` (aprox. líneas 24, 359) |
| **Cola offline** | Al procesar pendientes, se envía `turnoId: null`. Las ventas sincronizadas quedan sin turno. | `app/modulos/pos-ventas/page.jsx` (aprox. líneas 588-606) |

**Para aplicar la política P0:**

1. **Endpoint `/api/pos-ventas/crear`:**
   - Exigir que, en modo online, exista `turnoId` y que corresponda a un turno abierto (cierre = null) del mismo usuario y local del request.
   - Rechazar con 400 (mensaje claro) si falta turnoId o el turno no es válido/abierto.
   - **Archivo a tocar:** `app/api/pos-ventas/crear/route.js`.

2. **UI POS:**
   - Ya bloquea el cobro sin turno al no mostrar el POS hasta abrir turno. Opcional: reforzar con un guard antes de `handleCobrar` (no enviar si !turnoActual?.id) y mensaje amigable.
   - **Archivos a tocar (opcional):** `app/modulos/pos-ventas/page.jsx` (donde se arma el body de crear y donde está handleCobrar / procesar cola).

3. **Cola offline:**
   - **Decisión de producto:** Si la política es estricta “nunca cobrar sin turno”, al procesar la cola se podría:
     - (A) Requerir turno abierto y enviar el `turnoId` del turno actual al procesar cada pendiente (asignar esas ventas al turno del momento), o
     - (B) No permitir “Procesar cola” si no hay turno abierto (y mostrar mensaje).
   - **Archivos a tocar:** `app/modulos/pos-ventas/page.jsx` (lógica de procesar cola y body enviado a crear).

**Listado de archivos a tocar para política “no cobrar sin turno”:**

- `app/api/pos-ventas/crear/route.js` — validación obligatoria de turnoId + turno abierto.
- `app/modulos/pos-ventas/page.jsx` — opcional: guard en handleCobrar; cola: enviar turnoId actual o bloquear sin turno.

---

### B.2 UI de "Turnos": lista por local con filtros

**Objetivo:** Pantalla/lista de turnos del local con filtros y columnas claras; entrada al detalle.

**Funcionalidad propuesta:**

- **Pantalla:** Lista de turnos (tabla o cards) con:
  - **Filtros:** fecha desde, fecha hasta, estado (abierto / cerrado), vendedor (opcional).
  - **Alcance:** Por local (localId del contexto activo o selector; usuario no admin solo su local).
- **Columnas por fila:** vendedor (nombre), apertura, cierre (o “Abierto”), montoInicial, montoEsperadoEfectivo, montoRealEfectivo, diferenciaEfectivo, cantidadVentas, totalVentasEfectivo, totalVentasDigital.
- **Acción:** Botón/link “Ver turno” → navegar al detalle del turno.

**Endpoints necesarios:**

- Hoy **no existe** un endpoint que liste turnos con filtros. Existen:
  - `GET /api/pos-ventas/turnos/actual` — devuelve solo el turno abierto del usuario en un local.
  - `GET /api/pos-ventas/turnos/resumen?turnoId=` — resumen de ventas de un turno (totales por forma de pago).
- **Nuevo endpoint sugerido:** `GET /api/pos-ventas/turnos/listar` (o `GET /api/turnos/listar`) con query: localId (requerido), fechaDesde, fechaHasta, estado (abierto|cerrado|todos), vendedorId (opcional). Respuesta: array de turnos con datos de vendedor (nombre) y columnas listadas arriba.

**Archivos a tocar:**

- **Nuevo:** `app/api/pos-ventas/turnos/listar/route.js` (o equivalente bajo `app/api/turnos/` si se prefiere ruta dedicada).
- **Nuevo:** `app/modulos/turnos/page.jsx` — página lista de turnos (filtros + tabla + “Ver turno”).
- **Navegación:** Donde esté el menú de módulos (ej. `components/layout/MobileNav.jsx`, `components/layout/TopbarNav.jsx`, o sidebar), agregar entrada “Turnos” → `/modulos/turnos` (y permisos si aplica).

---

### B.3 Detalle de turno

**Objetivo:** Ver un turno con arqueo, resumen por forma de pago y listado de ventas.

**Estructura propuesta:**

1. **Header**
   - Vendedor (nombre).
   - Apertura y cierre (o “Abierto” si cierre es null).
   - Arqueo: monto inicial, esperado efectivo, real efectivo, diferencia (y si se desea, totales digital/efectivo del turno).

2. **Sección: Resumen por forma de pago**
   - Desglose: Efectivo, MercadoPago, Débito, Crédito (y otros si existen).
   - Puede reutilizar la lógica de `GET /api/pos-ventas/turnos/resumen` (ya devuelve totalEfectivo, totalDigital, desglose mercadopago/debito/credito, totalComision, netoDigital).

3. **Sección: Tabla de ventas del turno**
   - Columnas: hora (fecha de la venta), número de venta, total, formaPago, netoRecibido, comisionBancaria, costoTotal, gananciaNeta.
   - Orden: por fecha/hora ascendente o descendente.

**Endpoints:**

- **Existente:** `GET /api/pos-ventas/turnos/resumen?turnoId=` — para resumen por forma de pago y totales.
- **Nuevo o extendido:** Listado de ventas del turno. Opciones:
  - Nuevo: `GET /api/pos-ventas/turnos/[turnoId]/ventas` (o `GET /api/pos-ventas/ventas-por-turno?turnoId=`) que devuelva las ventas del turno con campos: id, numero, fecha, total, formaPago, netoRecibido, comisionBancaria, costoTotal, gananciaNeta (y localId si se usa en más de un local).
  - O extender el payload de `resumen` con un array `ventas` (menos RESTful pero suficiente para P0).

**Archivos a tocar:**

- **Nuevo:** `app/modulos/turnos/[id]/page.jsx` (o `app/modulos/turnos/detalle/page.jsx?turnoId=`) — pantalla detalle con header, resumen y tabla.
- **Nuevo (o extendido):** `app/api/pos-ventas/turnos/[turnoId]/ventas/route.js` o lógica similar para listar ventas del turno con los campos indicados.

---

### B.4 Comisión / “descuento interno”

**Cómo se muestra hoy en POS:**

- **Componente:** `components/pos-ventas/FormaPago.jsx`.
- **Total a cobrar:** Se muestra como `subtotal - descuento - descuentoPorPuntos`; el cliente paga ese monto. No se resta la comisión del monto mostrado como “Total a cobrar” (líneas ~41-52: `total = base`, comisionBancaria se calcula aparte).
- **Comisión:** Se muestra en un bloque aparte debajo (líneas ~149-156): “Comision 7%: -$X (neto: $Y)”. Es decir, se presenta como información interna (lo que queda neto), no como un descuento al cliente.

**Regla a fijar:**

- **comisionBancaria NO se muestra como descuento al cliente en POS.**  
  Ya se cumple: el descuento al cliente es solo descuento manual y puntos; la comisión es un renglón informativo aparte. Solo falta documentar/confirmar esta regla en especificación o en comentario en código (ej. en FormaPago o en docs).

**Archivos a tocar (solo documentación/comentario):**

- `components/pos-ventas/FormaPago.jsx` — comentario que aclare que la comisión no es descuento al cliente.
- Opcional: doc de reglas de negocio (ej. en `docs/`).

---

## C) Entregables

### C.1 Checklist P0 (archivos y endpoints)

| # | Tipo | Ruta / archivo | Acción |
|---|------|----------------|--------|
| 1 | API | `app/api/pos-ventas/crear/route.js` | Validar turnoId obligatorio y turno abierto (mismo usuario/local); rechazar si no. |
| 2 | API | `app/api/pos-ventas/turnos/listar/route.js` (nuevo) | GET con query localId, fechaDesde, fechaHasta, estado, vendedorId; devolver lista de turnos con datos para tabla. |
| 3 | API | Listado ventas por turno | Nuevo endpoint o extensión: GET que devuelva ventas del turno (hora, nro, total, formaPago, netoRecibido, comisionBancaria, costoTotal, gananciaNeta). |
| 4 | Página | `app/modulos/turnos/page.jsx` (nuevo) | Lista de turnos con filtros (fecha, estado, vendedor) y “Ver turno”. |
| 5 | Página | `app/modulos/turnos/[id]/page.jsx` (nuevo) | Detalle: header (vendedor, apertura/cierre, arqueo), resumen por forma de pago, tabla de ventas. |
| 6 | POS | `app/modulos/pos-ventas/page.jsx` | Opcional: guard en handleCobrar (no enviar sin turnoActual?.id). Cola: decidir si enviar turnoId actual o bloquear “Procesar cola” sin turno. |
| 7 | Navegación | `components/layout/MobileNav.jsx` y/o `TopbarNav.jsx` (o donde esté el menú) | Agregar “Turnos” → `/modulos/turnos`. |
| 8 | Permisos | Roles/permisos (si aplica) | Definir permiso para ver Turnos (ej. `turnos.ver` o reutilizar `reportes.ver` / `pos.usar` según criterio). |
| 9 | Doc/comentario | `components/pos-ventas/FormaPago.jsx` (y opcional docs) | Aclarar que comisión no es descuento al cliente. |

---

### C.2 Propuesta de UX (estructura de pantallas)

```
[Menú / Navegación]
    └── Turnos  →  /modulos/turnos

/modulos/turnos  — Lista de turnos
    ├── Filtros: Fecha desde, Fecha hasta, Estado (Abierto / Cerrado / Todos), Vendedor (opcional)
    ├── Tabla: vendedor | apertura | cierre | montoInicial | esperado | real | diferencia | cant. ventas | total efectivo | total digital
    └── Acción por fila: [Ver turno]  →  /modulos/turnos/[id]

/modulos/turnos/[id]  — Detalle de turno
    ├── Header: Vendedor, Apertura, Cierre, Arqueo (inicial, esperado, real, diferencia)
    ├── Bloque: Resumen por forma de pago (Efectivo, MP, Débito, Crédito)
    └── Tabla: Ventas del turno (hora, nro, total, formaPago, netoRecibido, comisionBancaria, costoTotal, gananciaNeta)
```

- **POS actual:** Sin cambio de flujo de uso: al entrar a POS sin turno se muestra modal “Abrir turno”; con turno abierto se ve el POS y se puede cobrar. Con P0, el backend rechazará cualquier crear venta sin turno válido.

---

### C.3 Riesgos

| Riesgo | Mitigación |
|--------|------------|
| **Ventas históricas con turnoId null** | Reportes y listados deben contemplar ventas sin turno: no filtrar por turno en reporte general; en “ventas del turno” solo se listan las que tienen ese turnoId. No intentar “asignar” turno a ventas viejas de forma automática. Opcional: en reportes futuros, permitir filtrar “solo con turno” para análisis por cajero. |
| **Cola offline sin turno** | Si se exige turno en API: al procesar cola sin turno abierto, las peticiones fallarán. Definir: (A) bloquear “Procesar cola” si no hay turno y mostrar mensaje, o (B) al procesar con turno abierto, enviar ese turnoId para que las ventas pendientes queden asociadas al turno actual. |
| **Permisos** | Quién puede ver “Turnos” y detalle: por defecto solo mismo local; admin podría ver todos los locales. Definir permiso (ej. `turnos.ver`) y aplicarlo en listar y en detalle. |
| **Múltiples locales (admin)** | Si el contexto permite cambiar de local, la lista de turnos debe filtrar por local seleccionado (contexto activo). |

---

**Documento solo de auditoría y plan; no incluye implementación en código.**
