# Informe: Mapeo completo del módulo Pedido a Proveedores (Compras a Proveedor)

**ERP Azul.** Solo lectura del repo; sin implementar cambios. Objetivo: base clara para pulir el módulo con cambios mínimos y seguros.

---

## 1) Rutas / Pantallas

| Ruta | Rol | Qué hace |
|------|-----|----------|
| **app/modulos/compras-proveedor/page.jsx** | **Pantalla principal** | Listado de pedidos a proveedor: tabla (#, Proveedor, Depósito, Items, Estado, Creado, Ver). Filtros por estado (BORRADOR/CONFIRMADO/ENVIADO/RECIBIDO) y por proveedorId (query). Paginación (20 por página). Botón "＋ Nuevo pedido" → /nueva. |
| **app/modulos/compras-proveedor/nueva/page.jsx** | **Crear nuevo** | Alta de pedido: selector de proveedor, notas, búsqueda de productos del proveedor (stock depósito), agregar ítems con cantidad/sugerido, total estimado. Botón "Crear pedido" → POST crear y redirige a detalle. Entrada opcional: ?proveedorId= (desde listado de Proveedores). |
| **app/modulos/compras-proveedor/[id]/page.jsx** | **Detalle / acciones** | Ver pedido (#, proveedor, depósito, fechas, notas). Tabla detalle (producto, cant. pedida, unidad, costo; si ENVIADO: cant. recibida y kg recibidos editables; si RECIBIDO: valores finales). Acciones por estado: BORRADOR → Confirmar; CONFIRMADO → Marcar enviado; ENVIADO → Recibir pedido. |

No existe ruta de **edición** de pedido en borrador (no hay /compras-proveedor/[id]/editar ni PUT para modificar ítems/cantidades).

---

## 2) Componentes UI

Todos los componentes son de **Sunmi** o nativos; no hay componentes propios del módulo (todo está en las pages).

| Componente | Path | Uso en el módulo |
|------------|------|-------------------|
| SunmiCard | @/components/sunmi/SunmiCard | Contenedor principal en las 3 pantallas. |
| SunmiHeader | @/components/sunmi/SunmiHeader | Título: "Compras a Proveedor", "Nuevo pedido a proveedor", "Pedido #N". |
| SunmiButton | @/components/sunmi/SunmiButton | Nuevo pedido, Volver, Ver, Limpiar, Confirmar, Marcar enviado, Recibir, Cancelar, Crear pedido, + agregar, Quitar. |
| SunmiInput | @/components/sunmi/SunmiInput | Notas, búsqueda productos, cantidad por ítem (nueva y detalle recepción), cant. recibida y kg recibidos (detalle). |
| SunmiPanel | @/components/sunmi/SunmiPanel | Bloques: Proveedor y notas, Agregar productos, Detalle del pedido, Info del pedido, Detalle (ítems). |
| SunmiTable / SunmiTableRow / SunmiTableEmpty | @/components/sunmi/SunmiTable* | Tablas: listado pedidos, productos del proveedor, ítems del pedido, detalle en [id]. |
| SunmiSeparator | @/components/sunmi/SunmiSeparator | "Filtros", "Listado" en listado. |
| SunmiSelectAdv / SunmiSelectOption | @/components/sunmi/SunmiSelectAdv | Selector estado (listado), selector proveedor (nueva). |
| SinPermisos | @/components/auth/SinPermisos | Render si no tiene compras.ver o compras.crear. |

**Props relevantes:**  
- Listado: filtro `estado`, `proveedorIdParam` (query), `items`, `page`, `total`; callbacks de paginación y navegación.  
- Nueva: `proveedorId`, `notas`, `productos`, `items`, `soloFaltantes`, `search`; `agregarItem(prod)`, `quitarItem`, `updateItemCantidad`, `handleBlurCantidad`, `crearPedido`.  
- Detalle: `pedido`, `recibidos`, `kgRecibidos`; `ejecutarAccion(confirmar|enviar|recibir)`.

No se usa ningún hook propio del módulo (usePedidosProveedor, etc.); todo es estado local con useState/useEffect en cada page.

---

## 3) Estado / Lógica de cliente

### Dónde vive el estado

- **Listado (page.jsx):** useState en la misma page: `items`, `total`, `page`, `estado`, `loading`. `proveedorIdParam` desde useSearchParams. Sin context ni hook compartido.  
- **Nueva (nueva/page.jsx):** useState: `proveedores`, `proveedorId`, `notas`, `productos`, `search`, `loadingProds`, `items`, `soloFaltantes`, `saving`. Proveedor inicial desde searchParams.  
- **Detalle ([id]/page.jsx):** useState: `pedido`, `loading`, `acting`, `recibidos` (map detalleId → cantidad recibida), `kgRecibidos` (map detalleId → kg). Carga con useEffect al montar por `id`.

### Forma del estado

- **items (nueva):** array de `{ productoLocalId, nombre, sku, modoCompra (BULTO|UNIDAD), cantidad, precioCosto, factorPack, sugerido, sinParametros, pesoRefKg }`.  
- **recibidos / kgRecibidos (detalle):** objetos `{ [detalleId]: string | number }` para inputs controlados; al enviar "recibir" se mandan al API.

### Flujo cliente

1. **Agregar ítem:** desde fila de producto (productos del proveedor) → `agregarItem(prod)` → push a `items` con cantidad = sugerido o 1, resto de campos del prod.  
2. **Editar cantidad:** input onChange → `updateItemCantidad(productoLocalId, rawValue)` → parseInt(rawValue); onBlur → `handleBlurCantidad` → pisa a 1 si no es número o &lt; 1.  
3. **Eliminar ítem:** "Quitar" → `quitarItem(productoLocalId)` → filter.  
4. **Totales:** en render: `items.reduce((acc, i) => acc + (Number(i.cantidad) || 0) * i.precioCosto, 0)`. No hay estado derivado.  
5. **Guardar:** `crearPedido()` → validación entero >= 1 por ítem, POST /api/compras-proveedor/crear con proveedorId, notas, items[] (productoLocalId, cantidad, unidad, precioCosto) → redirect a /compras-proveedor/:id.

---

## 4) Endpoints / API

| Método | Ruta | Request | Response | Validaciones / errores |
|--------|------|---------|----------|------------------------|
| **GET** | /api/compras-proveedor/listar | Query: page, pageSize, estado?, proveedorId? | ok, items[], total. items: id, estado, notas, proveedorNombre, proveedorId, depositoNombre, depositoId, cantItems, fechaConfirmado, fechaEnviado, fechaRecibido, createdAt | resolveLocalAndGrupo (contexto). Filtro por grupoId. 500 genérico. |
| **GET** | /api/compras-proveedor/obtener | Query: id | ok, item (pedido con proveedor, deposito, detalles con producto.base) | id requerido 400. Pedido no encontrado o grupoId distinto → 404. |
| **GET** | /api/compras-proveedor/productos | Query: proveedorId, search? | ok, items[] (productoLocalId, baseId, nombre, sku, codigo_barra, unidad_medida, factor_pack, modoCompra, stockActual, stockMin, stockMax, faltante, sugerido, sinParametros, bajoMin, precio_costo, precio_venta, pesoRefKg, etc.) | proveedorId obligatorio 400. Sin depósito para el grupo 400. Para BULTO con factorPack &gt; 1 convierte stock a bultos para mostrar. |
| **POST** | /api/compras-proveedor/crear | Body: proveedorId, depositoId?, notas?, items[] { productoLocalId, cantidad, unidad?, precioCosto? } | ok, item (pedido creado con detalles, proveedor, deposito) | proveedorId requerido. items array no vacío. cantidades entero &gt;= 1. Proveedor no encontrado 404. Depósito resuelto por grupo si no se envía. 500 genérico. |
| **POST** | /api/compras-proveedor/confirmar/[id] | (sin body) | ok, item (pedido actualizado) | id en path. Pedido existe y mismo grupoId. Estado debe ser BORRADOR. 400 si estado distinto. |
| **POST** | /api/compras-proveedor/marcar-enviado/[id] | (sin body) | ok, item | Idem; estado debe ser CONFIRMADO. |
| **POST** | /api/compras-proveedor/recibir/[id] | Body: recibidos? { detalleId: cantidad }, kgRecibidos? { detalleId: kg } | ok, item (pedido con estado RECIBIDO y detalles actualizados) | Estado debe ser ENVIADO. Cantidades entero &gt;= 0; kg &gt;= 0. Incrementa StockLocal del depósito y actualiza cantidadRecibida/kgRecibidos por detalle. |

**Faltantes o incompletos:**

- No hay **PUT/PATCH editar pedido** (borrador): no se pueden cambiar ítems ni cantidades después de crear.  
- **listar** no devuelve totales de dinero ni resumen por pedido (solo cantItems).  
- **obtener** no incluye relación de **creadoPor** (creadoPorId existe en modelo pero no se expone en la API ni en la UI).  
- No hay endpoint de **anulación** ni estado ANULADO (solo BORRADOR → CONFIRMADO → ENVIADO → RECIBIDO).  
- Permisos: no se revisan en los endpoints (solo en la UI con compras.ver / compras.crear). Pendiente de confirmar si se debe validar en API.

---

## 5) Base de datos

### Modelos

- **PedidoProveedor**  
  id, grupoId, depositoId, proveedorId, estado (EstadoPedidoProveedor), notas, fechaConfirmado, fechaEnviado, fechaRecibido, creadoPorId, createdAt, updatedAt.  
  Relaciones: deposito (Local), proveedor (Proveedor), detalles (PedidoProveedorDetalle[]).  
  Índices: grupoId, depositoId, proveedorId, estado, createdAt.

- **PedidoProveedorDetalle**  
  id, pedidoId, productoLocalId, cantidad (Decimal 12,2), unidad (ModoPedido BULTO|UNIDAD), cantidadRecibida (Decimal?), kgRecibidos (Decimal?), precioCosto (Decimal?), createdAt, updatedAt.  
  Relaciones: pedido (PedidoProveedor), producto (ProductoLocal).  
  Índices: pedidoId, productoLocalId.

- **EstadoPedidoProveedor**  
  BORRADOR, CONFIRMADO, ENVIADO, RECIBIDO.

- **ProductoBase** (existente)  
  modoCompraProveedor (ModoPedido), pesoReferenciaKg, pesoEsFijo, pesoPromedioKg, actualizaPromedioPorRecepcion. Usado para BULTO vs UNIDAD (fiambre) y para recepción.

- **StockLocal** (existente)  
  Se incrementa en recibir: localId = depositoId, productoId = ProductoLocal del depósito.

### Dónde se actualizan estados

- **BORRADOR:** al crear (crear/route.js).  
- **CONFIRMADO:** POST confirmar/[id] → fechaConfirmado, estado.  
- **ENVIADO:** POST marcar-enviado/[id] → fechaEnviado, estado.  
- **RECIBIDO:** POST recibir/[id] → fechaRecibido, estado; además actualiza detalles (cantidadRecibida, kgRecibidos) e incrementa StockLocal.

No hay estado "anulado" ni actualización de estado hacia atrás.

---

## 6) Reglas de negocio detectadas

- **BULTO vs UNIDAD (modoCompraProveedor):**  
  - **BULTO:** producto pack/cajón; en "nuevo pedido" y productos del proveedor se muestra stock/sugerido en **bultos** (API productos convierte unidades → bultos cuando factorPack &gt; 1). Cantidad pedida y recibida en bultos.  
  - **UNIDAD:** fiambre; stock en kg, faltante en kg, sugerido en unidades (piezas); pesoReferenciaKg/pesoPromedioKg para convertir; en recepción se pueden cargar kg reales (kgRecibidos) y se actualiza pesoPromedioKg si actualizaPromedioPorRecepcion.

- **Stock depósito:**  
  - En **productos** (GET) se asume que StockLocal del depósito está en **unidades** y se convierte a bultos solo para presentación (BULTO).  
  - En **recibir** (POST): para BULTO se hace `incremento = cantRecibida` (bultos) y se suma a StockLocal; para UNIDAD (fiambre) el incremento es por kg (kgRecibidos o estimado).  
  - Inconsistencia: si en el resto del sistema el depósito guarda stock en **unidades**, al recibir bultos habría que sumar cantRecibida * factor_pack; si se guarda en bultos, la pantalla productos debería leer en bultos (ya corregida para visualización). Pendiente de confirmar convención única depósito (unidades vs bultos).

- **Manual / config:**  
  - Stock min/max y factor pack vienen de ProductoBase/StockLocal; modoCompraProveedor y pesos de ProductoBase. Se usan en GET productos (sugerido, faltante) y en recibir (incremento y actualización de promedio).

---

## 7) Problemas y riesgos

| Prioridad | Dónde | Qué | Causa probable | Cómo se rompe |
|-----------|--------|-----|------------------|----------------|
| **P0** | app/api/compras-proveedor/recibir/[id]/route.js (BULTO) | Al recibir en BULTO se hace `incremento = cantRecibida` y se suma a StockLocal. En el resto del sistema el depósito guarda StockLocal en **unidades**. | Código asume que depósito guarda en bultos. | Tras recibir 10 bultos (factor 12) el stock sube 10 en vez de 120; listados y sugeridos ven stock incorrecto. |
| **P1** | app/modulos/compras-proveedor/nueva/page.jsx (updateItemCantidad, handleBlurCantidad) | Cantidad se fuerza a entero (parseInt) y mínimo 1. | Diseño para bultos enteros. | Fiambre (UNIDAD) no puede llevar cantidades decimales si en el futuro se permitiera; hoy fiambre va en unidades (piezas) así que no impacta. |
| **P1** | app/modulos/compras-proveedor/[id]/page.jsx (inicialización recibidos) | Inicializa `recibidos[det.id] = Number(d.cantidadRecibida ?? d.cantidad)`. Si el backend devuelve Decimal puede ser objeto. | Prisma devuelve Decimal como objeto en JSON según serialización. | Inputs "Cant. recibida" podrían mostrar [object Object] o fallar. Pendiente de confirmar si NextResponse/Prisma serializa Decimal a número. |
| **P2** | Módulo completo | No hay edición de pedido en borrador. | No implementado. | Usuario debe anular manualmente o crear otro pedido si se equivoca. |
| **P2** | app/api/compras-proveedor/listar | No valida permisos (compras.ver). | Solo UI verifica permisos. | Llamada directa a la API podría listar sin permiso. Pendiente de confirmar si se exige en middleware/auth. |
| **P2** | app/modulos/compras-proveedor/page.jsx | totalPages puede ser 0 si total === 0. | División 0/20. | Se usa `totalPages || 1` en la UI; solo impacto en texto "Página 1 de 1". |

---

## 8) Checklist de pulido (sin código)

1. Unificar convención de stock depósito (unidades vs bultos) y, si es unidades, en **recibir** para BULTO convertir cantRecibida * factor_pack al incrementar StockLocal.  
2. Añadir validación de permisos (compras.ver, compras.crear) en los endpoints que correspondan.  
3. Normalizar en backend la respuesta de **obtener** (y recibir) para que cantidad/cantidadRecibida/kgRecibidos salgan como número en JSON (por si Prisma devuelve Decimal crudo).  
4. Mensajes de error en español y consistentes (ej. "Pedido no encontrado" vs "Error interno").  
5. En listado, mostrar total estimado o monto por pedido si se agrega al API (opcional).  
6. Permitir editar pedido en BORRADOR (nueva ruta o pantalla + PUT/PATCH) con validación de estado.  
7. En "nueva", deshabilitar botón "Crear pedido" si algún ítem tiene cantidad vacía o inválida (hoy solo alert al enviar).  
8. Mostrar "Creado por" en detalle si se agrega relación creadoPorId → Usuario y se devuelve en obtener.  
9. Confirmación antes de "Confirmar pedido" / "Marcar como enviado" / "Recibir pedido" (modal o confirm).  
10. En detalle, al recibir: validar en front que cantidades recibidas sean números >= 0 antes de enviar.  
11. Paginación en listado: deshabilitar "Siguiente" cuando no hay resultados (total === 0) además de page >= totalPages.  
12. Búsqueda de productos (nueva): debounce ya existe (300 ms); opcional indicar "Sin resultados" cuando items.length === 0 y !loadingProds.  
13. Fiambre (UNIDAD): aclarar en UI unidad de "Cant. pedida" (uds/piezas) y que "Kg recibidos" es opcional o sugerido.  
14. Considerar estado ANULADO o anulación de pedido (BORRADOR o CONFIRMADO) y no permitir recibir si está anulado.  
15. Accesibilidad: labels asociados a inputs en detalle (recibidos/kg) para lectores de pantalla.  
16. Evitar doble submit en crear pedido (deshabilitar botón o bloqueo mientras saving).  
17. En listado, mantener filtro de proveedor en la URL al pasar de página (ya se usa proveedorIdParam).  
18. Documentar en docs del módulo la diferencia BULTO (bultos) vs UNIDAD (kg + piezas) y cómo impacta stock.

---

## Árbol de archivos del módulo (solo relevantes)

```
app/
  modulos/
    compras-proveedor/
      page.jsx                 # Listado
      nueva/
        page.jsx               # Crear pedido
      [id]/
        page.jsx               # Detalle y acciones
  api/
    compras-proveedor/
      listar/
        route.js               # GET listado
      obtener/
        route.js               # GET un pedido
      productos/
        route.js               # GET productos del proveedor (stock + sugerido)
      crear/
        route.js               # POST crear pedido
      confirmar/
        [id]/
          route.js             # POST confirmar
      marcar-enviado/
        [id]/
          route.js             # POST marcar enviado
      recibir/
        [id]/
          route.js             # POST recibir (actualiza stock + detalle)

components/
  sunmi/                       # SunmiCard, SunmiHeader, SunmiButton, SunmiInput,
                               # SunmiPanel, SunmiTable*, SunmiSeparator, SunmiSelectAdv*
  auth/
    SinPermisos.jsx            # Usado por las 3 pages

prisma/
  schema.prisma                # PedidoProveedor, PedidoProveedorDetalle, EstadoPedidoProveedor
                               # ProductoBase (modoCompraProveedor, peso*), StockLocal

hooks/
  useContextoActivo.js         # Usado en las 3 pages
app/context/
  UserContext.jsx               # useUser en las 3 pages

# Referencias externas al módulo
app/modulos/proveedores/page.jsx   # Botón "Pedido" → /compras-proveedor/nueva?proveedorId=
components/sidebar/SidebarPro.jsx  # Link "Compras a Proveedor" → /compras-proveedor
lib/grupos.js                      # resolveLocalAndGrupo en todos los endpoints
```

---

## Resumen ejecutivo (10 líneas)

1. El módulo tiene tres pantallas: listado, nueva (crear pedido) y detalle por id, sin pantalla de edición de borrador.  
2. Todo el estado es local por página (useState/useEffect); no hay hooks ni context propios del módulo.  
3. Siete endpoints cubren listar, obtener, productos del proveedor, crear, confirmar, marcar enviado y recibir; no hay PUT/PATCH ni anulación.  
4. Modelos clave: PedidoProveedor (estados BORRADOR → CONFIRMADO → ENVIADO → RECIBIDO) y PedidoProveedorDetalle (cantidad, unidad, cantidadRecibida, kgRecibidos); al recibir se actualiza StockLocal del depósito.  
5. BULTO vs UNIDAD (modoCompraProveedor) diferencia pack/cajón (bultos) de fiambre (kg + piezas); la API productos convierte stock a bultos para mostrar cuando aplica.  
6. **P0:** En recibir, para BULTO se suma cantRecibida directo a StockLocal; si el depósito guarda stock en unidades, debería sumarse cantRecibida * factor_pack.  
7. **P1:** Cantidad en nueva se fuerza a entero; detalle podría recibir Decimal no serializado como número en recibidos/kgRecibidos.  
8. **P2:** Sin edición de borrador, sin validación de permisos en API, sin estado ANULADO.  
9. Pulido sugerido: unificar convención de stock depósito, permisos en API, normalizar números en respuestas, confirmaciones de acción, opcional edición de borrador y anulación.  
10. Entrada desde Proveedores: botón lleva a /compras-proveedor/nueva?proveedorId=; sidebar enlaza al listado.
