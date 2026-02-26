# Plan técnico: Ganancia Depósito en Compras a Proveedor

**Objetivo:** Registrar en cada compra recibida totalFactura y totalReal en cabecera, calcular ganancia = totalFactura − totalReal, y exponer un dashboard de ganancia. Sin escribir código; solo plan preciso.

---

## 1. Lista exacta de archivos a tocar

| # | Path | Acción |
|---|------|--------|
| 1 | **prisma/schema.prisma** | Agregar campos a modelo PedidoProveedor (totalFactura, totalReal, nroFactura?, fechaFactura?). Crear migración. |
| 2 | **prisma/migrations/XXXXXX_ganancia_pedido_proveedor/** (nueva) | Migración generada por `prisma migrate dev`. |
| 3 | **app/api/compras-proveedor/recibir/[id]/route.js** | Leer del body totalFactura, totalReal, nroFactura, fechaFactura; validar; persistir en el update de PedidoProveedor dentro de la transacción. |
| 4 | **app/api/compras-proveedor/obtener/route.js** | Incluir en el select/response los nuevos campos (ya vendrán si no se hace select explícito; si el cliente Prisma devuelve todo el modelo, no hace falta cambio; si se mapea a mano, añadir los campos). |
| 5 | **app/modulos/compras-proveedor/[id]/page.jsx** | Cuando estado === "ENVIADO": panel o bloque con inputs totalFactura, totalReal (y opcional nroFactura, fechaFactura); cálculo en vivo ganancia = totalFactura − totalReal; enviar estos campos en el body al llamar a recibir. Mostrar totalFactura/totalReal/ganancia cuando estado === "RECIBIDO". |
| 6 | **app/modulos/compras-proveedor/ganancia/page.jsx** | **Nuevo.** Página dashboard: filtros desde/hasta, proveedorId opcional; cards (ganancia total, totalFactura, totalReal, cantidad compras); ranking top proveedores; tabla de compras recibidas con link a /compras-proveedor/[id]. |
| 7 | **app/api/compras-proveedor/ganancia/route.js** | **Nuevo.** GET: query desde, hasta, proveedorId; filtrar por fechaRecibido y estado RECIBIDO; devolver agregados y lista para dashboard. |
| 8 | **components/sidebar/SidebarPro.jsx** (o donde esté el menú) | Añadir ítem de menú "Ganancia depósito" o "Ganancia compras" con href `/modulos/compras-proveedor/ganancia`. |

**Resumen:** 1 cambio de schema + 1 migración, 2 APIs (recibir modificado + ganancia nuevo), 2 páginas (detalle modificado + ganancia nuevo), 1 menú. No tocar listar ni crear.

---

## 2. Prisma: campos en PedidoProveedor

Agregar al modelo **PedidoProveedor** (sin tocar PedidoProveedorDetalle):

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| totalFactura | Decimal | No (nullable) | @db.Decimal(12, 2). Lo que dice la factura. |
| totalReal | Decimal | No (nullable) | @db.Decimal(12, 2). Lo que realmente se pagó. |
| nroFactura | String | No | String? — opcional. |
| fechaFactura | DateTime | No | DateTime? — opcional. |

**Ganancia:** no persistir. Se calcula en backend o front como `totalFactura - totalReal` cuando ambos están definidos; si alguno es null, ganancia = null.

**Migración:** después de editar schema, ejecutar `npx prisma migrate dev --name ganancia_pedido_proveedor` (o nombre acordado) para generar la migración.

---

## 3. Estructura de payloads

### 3.1 POST /api/compras-proveedor/recibir/[id]

**Request (body actual + nuevos campos):**

```json
{
  "recibidos": { "detalleId": cantidadRecibida, ... },
  "kgRecibidos": { "detalleId": kg, ... },
  "totalFactura": 15000.50,
  "totalReal": 14200.00,
  "nroFactura": "001-00001234",
  "fechaFactura": "2025-02-20"
}
```

- **totalFactura:** número (opcional). Si se envía, debe ser >= 0.
- **totalReal:** número (opcional). Si se envía, debe ser >= 0.
- **nroFactura:** string (opcional).
- **fechaFactura:** string ISO date o YYYY-MM-DD (opcional). Guardar como DateTime.

**Validaciones mínimas en recibir:**

- Si totalFactura o totalReal se envían: `Number(value)` finito y >= 0.
- No exigir que vengan ambos; si solo viene uno, el otro queda null y ganancia no se puede mostrar (o se muestra solo el ingresado).
- Opcional: si ambos vienen, validar que totalReal <= totalFactura para que ganancia >= 0 (o permitir negativo si hay devoluciones; según regla de negocio).

**Response:** sin cambio de estructura; `{ ok: true, item: pedido }` donde `pedido` incluye los nuevos campos tras el update (Prisma devuelve el modelo actualizado).

---

### 3.2 GET /api/compras-proveedor/ganancia (nuevo)

**Request (query):**

- **desde:** string fecha YYYY-MM-DD (obligatorio para acotar).
- **hasta:** string fecha YYYY-MM-DD (obligatorio).
- **proveedorId:** número opcional. Si viene, filtrar solo pedidos de ese proveedor.

**Response sugerido:**

```json
{
  "ok": true,
  "desde": "2025-02-01",
  "hasta": "2025-02-28",
  "resumen": {
    "gananciaTotal": 125000.50,
    "totalFactura": 850000.00,
    "totalReal": 725000.50,
    "cantidadCompras": 42
  },
  "rankingProveedores": [
    {
      "proveedorId": 1,
      "proveedorNombre": "Proveedor A",
      "ganancia": 45000.00,
      "totalFactura": 200000.00,
      "totalReal": 155000.00,
      "cantidadCompras": 12
    }
  ],
  "compras": [
    {
      "id": 101,
      "proveedorNombre": "Proveedor A",
      "fechaRecibido": "2025-02-15T10:00:00.000Z",
      "totalFactura": 15000.50,
      "totalReal": 14200.00,
      "ganancia": 800.50,
      "nroFactura": "001-00001234"
    }
  ]
}
```

- **resumen:** totales agregados en el rango (solo pedidos RECIBIDO con fechaRecibido entre desde y hasta). Ganancia = suma( totalFactura − totalReal ) donde ambos no null.
- **rankingProveedores:** ordenado por ganancia descendente; cada ítem con proveedorId, nombre, ganancia, totalFactura, totalReal, cantidadCompras.
- **compras:** lista de pedidos recibidos en el rango para la tabla del dashboard; cada uno con id (para el link a /compras-proveedor/[id]), proveedorNombre, fechaRecibido, totalFactura, totalReal, ganancia (calculada), nroFactura.

**Validaciones:**

- desde y hasta obligatorios; parsear a Date; hasta >= desde.
- proveedorId opcional; si viene, debe ser número válido.

---

## 4. UI detalle [id]/page.jsx — cambios precisos

- **Estado ENVIADO (antes de “Recibir”):**
  - Añadir un **SunmiPanel** (o bloque equivalente) encima del botón “Recibir pedido” con:
    - Input **Total factura** (número, decimal, opcional).
    - Input **Total real** (número, decimal, opcional).
    - Opcional: **Nro. factura**, **Fecha factura**.
    - Texto en vivo: **Ganancia = totalFactura − totalReal** (solo si ambos tienen valor; si no, mostrar “—” o “Completar totales”).
  - Estado local: `totalFactura`, `totalReal`, `nroFactura`, `fechaFactura` (strings o números según input); inicializar desde `pedido.totalFactura`, etc., si ya existen (por si se recarga la página).
  - Al llamar a `ejecutarAccion("recibir")`, incluir en el body además de `recibidos` y `kgRecibidos`: `totalFactura`, `totalReal`, `nroFactura`, `fechaFactura` (solo los que tengan valor).

- **Estado RECIBIDO:**
  - En el panel de info del pedido (donde están Proveedor, Depósito, Creado, Notas y fechas de flujo), añadir una fila o bloque que muestre: Total factura, Total real, Ganancia (calculada), y si existen nroFactura/fechaFactura mostrarlos. Solo visible cuando los campos estén cargados.

Mantener el resto del detalle igual (tabla de ítems, acciones por estado).

---

## 5. Dashboard ganancia — página y API

- **Ruta:** `app/modulos/compras-proveedor/ganancia/page.jsx`.
- **Contenido mínimo:**
  - Filtros: **Desde** (date), **Hasta** (date), **Proveedor** (select opcional; cargar opciones desde /api/proveedores/listar o opciones).
  - Cards: Ganancia total, Total factura, Total real, Cantidad de compras (los cuatro salen de `resumen` del API).
  - Ranking: lista “Top proveedores por ganancia” con columnas: Proveedor, Ganancia, # Compras, Total factura, Total real (datos de `rankingProveedores`).
  - Tabla: columnas Id, Proveedor, Fecha recibido, Total factura, Total real, Ganancia, Nro. factura; cada fila con link “Ver” a `/modulos/compras-proveedor/[id]` (datos de `compras`).
- **Carga:** al montar y cuando cambien filtros, GET `/api/compras-proveedor/ganancia?desde=...&hasta=...&proveedorId=...`.
- **Permisos:** misma convención que el resto del módulo (ej. compras.ver o *); reutilizar comprobación de permisos de listado/detalle.

**API GET /api/compras-proveedor/ganancia/route.js:**

- Resolver contexto (resolveLocalAndGrupo); filtrar por grupoId.
- Query: desde, hasta (obligatorios), proveedorId (opcional).
- Prisma: `pedidoProveedor.findMany` donde estado = RECIBIDO, fechaRecibido >= desde y fechaRecibido <= hasta (y proveedorId si viene); include proveedor (nombre). Calcular en código: suma totalFactura, suma totalReal, suma (totalFactura − totalReal) como gananciaTotal, count como cantidadCompras. Agrupar por proveedorId para ranking; ordenar ranking por ganancia desc. Lista compras: mismos pedidos con id, proveedor.nombre, fechaRecibido, totalFactura, totalReal, ganancia por fila, nroFactura.
- Devolver JSON con estructura de la sección 3.2.

---

## 6. Riesgos y validaciones mínimas

| Riesgo | Mitigación |
|--------|------------|
| Decimales en front/back | Usar Decimal(12,2) en Prisma; en front inputs type="number" step="0.01"; en API Number() y comprobar isFinite; no usar parseInt para totalFactura/totalReal. |
| totalFactura/totalReal null en recibidos antiguos | Campos nullable; en dashboard y resumen solo sumar ítems donde ambos no null; en detalle mostrar “—” si faltan. |
| Fechas inválidas (ganancia) | Validar desde/hasta como fechas; hasta >= desde; si falla, 400 con mensaje claro. |
| Permisos | Dashboard y API ganancia: mismo criterio que listar (compras.ver o *). No añadir permisos nuevos sin acuerdo. |
| Edición posterior | No se pide; si en el futuro se permite editar totalFactura/totalReal después de recibido, haría falta un PUT/PATCH; queda fuera de este plan. |
| Migración en producción | Ejecutar migración con backup; campos nuevos nullable, sin valor por defecto, no rompen filas existentes. |

**Validaciones mínimas:**

- **recibir:** totalFactura y totalReal, si presentes: número finito y >= 0. nroFactura string (truncar largo si se desea). fechaFactura: parsear a Date; si no es válida, ignorar o 400.
- **ganancia:** desde y hasta requeridos; fechas válidas; grupoId del contexto (no aceptar otro grupo).

---

## 7. Orden sugerido de implementación

1. Prisma: agregar campos a PedidoProveedor y crear migración; aplicar.
2. API recibir: leer y validar totalFactura, totalReal, nroFactura, fechaFactura; en el update de PedidoProveedor dentro de la transacción, setear esos campos.
3. Detalle [id]: estado ENVIADO — inputs y ganancia en vivo; estado RECIBIDO — mostrar totales; enviar nuevos campos al recibir.
4. API ganancia: nueva ruta GET con query desde/hasta/proveedorId; implementar filtros, agregados, ranking y lista.
5. Página ganancia: nueva ruta, filtros, cards, ranking, tabla con links.
6. Menú: ítem a `/modulos/compras-proveedor/ganancia`.
7. Opcional: en obtener, asegurar que los nuevos campos se devuelvan (si la respuesta no es el modelo crudo, mapearlos).

---

*Plan técnico cerrado; sin código. Cambios mínimos, sin refactor del resto del módulo.*
