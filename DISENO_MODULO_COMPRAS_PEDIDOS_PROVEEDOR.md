# Diseño: Módulo Compras / Pedidos a Proveedor (depósito → proveedor)

**Contexto:** ERP Azul. Solo el depósito compra a proveedor. Locales solo hacen reposición (local → depósito) vía PosTransferencias. Existen: stock mínimo, stock máximo, stock actual por producto en depósito; proveedor por producto (ProductoBase); dias_pedido en Proveedor.

**Objetivo:** Diseño completo del módulo "Pedidos a Proveedor" (depósito → proveedor): rutas, páginas, componentes, API, modelos y flujo. Sin implementación de código.

---

## 1. Diagrama textual del módulo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MÓDULO: Compras / Pedidos a Proveedor                                       │
│  Actor: Depósito (o admin con contexto depósito). Locales no acceden.        │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     "Generar pedido"      ┌─────────────────────────────────┐
  │  Proveedores │ ────────────────────────► │  /compras-proveedor/nueva        │
  │  (listado)   │   (proveedorId en query)  │  Productos del proveedor         │
  └──────────────┘                           │  Sugerido = max - actual si       │
                                             │  actual < min                     │
                                             └──────────────┬──────────────────┘
                                                            │
                                                            ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Pedido a Proveedor (header + detalle)                                    │
  │  Estados: Borrador → Confirmado → Enviado → Recibido                      │
  │  Stock: solo al "Recibido" → incrementa StockLocal del depósito           │
  └──────────────────────────────────────────────────────────────────────────┘

  Relaciones:
    PedidoProveedor → Proveedor (proveedorId)
    PedidoProveedor → Local  (depositoId, es depósito)
    PedidoProveedor → Usuario (usuarioId)
    PedidoProveedorDetalle → ProductoLocal (depósito) → ProductoBase
```

---

## 2. Rutas (App Router)

| Ruta | Descripción |
|------|-------------|
| `app/modulos/compras-proveedor/page.jsx` | Listado de pedidos a proveedor (por depósito o filtros). Acceso depósito/admin. |
| `app/modulos/compras-proveedor/nueva/page.jsx` | Alta de pedido: productos del proveedor, cantidades sugeridas/editables, confirmar. Query `?proveedorId=` opcional (entrada desde Proveedores). |
| `app/modulos/compras-proveedor/[id]/page.jsx` | Detalle de un pedido: líneas, estado, acciones según estado (confirmar, marcar enviado, recibir). |

Alternativa de naming: carpeta `pedidos-proveedor` en lugar de `compras-proveedor` si se prefiere alinear con "Pedidos" (reposición). En este diseño se usa **compras-proveedor** para distinguir de "Pedidos" (reposición).

---

## 3. Páginas principales

| Página | Contenido resumido |
|--------|--------------------|
| **Listado** (`compras-proveedor/page.jsx`) | Tabla: número/fecha, proveedor, depósito, estado, total ítems, acciones (ver, editar si Borrador). Filtros: estado, proveedor, depósito (si admin). Botón "Nuevo pedido" (elige proveedor o redirige a /nueva). Requiere depósito en contexto (o admin con contexto depósito). |
| **Nueva** (`compras-proveedor/nueva/page.jsx`) | Título "Nuevo pedido a proveedor". Selector de proveedor (o fijo si viene proveedorId). Lista de productos del proveedor (del depósito) con: nombre, stock actual, stock min, stock max, **cantidad sugerida** (si actual < min → max - actual, si no 0), input editable. Botón "Guardar borrador" y "Confirmar pedido". Solo depósito. |
| **Detalle** (`compras-proveedor/[id]/page.jsx`) | Cabecera: proveedor, depósito, estado, fechas. Tabla detalle: producto, cantidad pedida, cantidad recibida (cuando aplique), unidad. Acciones según estado: Borrador → editar/confirmar; Confirmado → marcar Enviado; Enviado → Recibir (con posibles cantidades recibidas por línea). Solo depósito. |

---

## 4. Componentes UI

| Componente | Path (propuesto) | Uso |
|------------|------------------|-----|
| Listado pedidos | `components/compras-proveedor/PedidosProveedorTable.jsx` o dentro de page | Tabla de pedidos con estado, proveedor, enlaces. |
| Formulario nueva | `components/compras-proveedor/FormNuevoPedidoProveedor.jsx` | Proveedor + grilla de productos con sugerido y cantidad editable. |
| Tabla productos sugeridos | `components/compras-proveedor/ProductosProveedorGrid.jsx` | Filas: producto, stock actual/min/max, cantidad sugerida, input cantidad. Reutiliza estilos/patrón de Sunmi (SunmiInput, SunmiCard, etc.). |
| Detalle pedido | `components/compras-proveedor/DetallePedidoProveedor.jsx` | Cabecera + tabla líneas + botones de acción (Confirmar, Marcar enviado, Recibir). |
| Modal recibir | `components/compras-proveedor/ModalRecibirPedido.jsx` | Opcional: confirmar recepción y/o cargar cantidades recibidas por línea antes de impactar stock. |

Reutilización: mismos componentes Sunmi (SunmiCard, SunmiHeader, SunmiButton, SunmiInput, SunmiSelectAdv, SunmiTable, etc.) y convenciones de layout (grid, separadores) del resto del ERP.

---

## 5. Hooks

| Hook | Path (propuesto) | Responsabilidad |
|------|------------------|-----------------|
| `usePedidosProveedor` | `hooks/usePedidosProveedor.js` | Listado: fetch lista de pedidos (filtros, paginación), estado loading/error. |
| `usePedidoProveedor(id)` | `hooks/usePedidoProveedor.js` | Detalle: fetch un pedido por id con cabecera y líneas. |
| `useProductosProveedor(proveedorId, depositoId)` | `hooks/useProductosProveedor.js` | Para nueva: productos del depósito cuyo base tiene este proveedor (proveedor_id / proveedor2_id / proveedor3_id) + stock (StockLocal) para calcular sugerido. |

Contexto: ya existe `useContextoActivo` (local/depósito). En este módulo se exige que el contexto sea un **depósito** (o admin con contexto depósito). No se define un hook nuevo de “depósito activo” si con `useContextoActivo` + comprobación `esDeposito` alcanza; si se centraliza la lógica, podría ser `hooks/useDepositoActivo.js` que devuelva depositoId + nombre y falle si no es depósito.

---

## 6. Endpoints API

Base: `/api/compras-proveedor/` (o `/api/pedidos-proveedor/` si se unifica naming).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/compras-proveedor/listar` | Lista pedidos. Query: depositoId (o derivado de contexto), estado, proveedorId, page, pageSize. Solo depósito/admin. |
| GET | `/api/compras-proveedor/obtener?id=` | Un pedido por id con cabecera y detalle (incl. producto, base, cantidades). |
| GET | `/api/compras-proveedor/productos?proveedorId=&depositoId=` | Productos del depósito que tienen al proveedor (en base); por cada uno: base, ProductoLocal (depósito), StockLocal (cantidad, stockMin, stockMax) y cantidad sugerida calculada (si actual < min → max - actual, si no 0). Solo depósito. |
| POST | `/api/compras-proveedor/crear` | Crea pedido en Borrador. Body: proveedorId, depositoId (o de contexto), líneas [{ productoLocalId, cantidadPedida, unidad }]. |
| PUT | `/api/compras-proveedor/editar/[id]` | Actualiza pedido en Borrador: líneas (agregar/quitar/editar cantidades). |
| POST | `/api/compras-proveedor/confirmar/[id]` | Pasa estado a Confirmado. Solo si estado = Borrador. |
| POST | `/api/compras-proveedor/marcar-enviado/[id]` | Pasa estado a Enviado. Solo si estado = Confirmado. |
| POST | `/api/compras-proveedor/recibir/[id]` | Pasa estado a Recibido; **impacta stock**: por cada línea, incrementa StockLocal del depósito (productoLocalId) en cantidad recibida (o pedida si no se detalla). Convierte BULTO → unidades si aplica (reutilizar `toUnidades` / lógica de pos-transferencias/recibir). Solo si estado = Enviado. |

Permisos sugeridos: `compras.ver`, `compras.crear`, `compras.recibir` (o un solo `compras.*`). En todas las rutas validar que el usuario tenga contexto depósito (o sea admin con depósito elegido).

---

## 7. Modelos de datos (Prisma)

Se proponen **dos modelos nuevos**; el resto son entidades existentes (Proveedor, Local, Usuario, ProductoBase, ProductoLocal, StockLocal).

### 7.1 PedidoProveedor (cabecera)

| Campo | Tipo | Descripción |
|-------|-----|-------------|
| id | Int | PK. |
| proveedorId | Int | FK Proveedor. |
| depositoId | Int | FK Local (debe ser es_deposito = true). |
| usuarioId | Int | FK Usuario (quien crea). |
| estado | String | "Borrador" \| "Confirmado" \| "Enviado" \| "Recibido". |
| confirmadoAt | DateTime? | |
| enviadoAt | DateTime? | |
| recibidoAt | DateTime? | |
| createdAt, updatedAt | DateTime | |

Relaciones: Proveedor, Local (deposito), Usuario; detalles PedidoProveedorDetalle[].

### 7.2 PedidoProveedorDetalle (líneas)

| Campo | Tipo | Descripción |
|-------|-----|-------------|
| id | Int | PK. |
| pedidoProveedorId | Int | FK PedidoProveedor, onDelete Cascade. |
| productoLocalId | Int | FK ProductoLocal (producto del **depósito**). Garantiza que el ítem es del mismo depósito que la cabecera. |
| cantidadPedida | Decimal | Cantidad pedida (en unidad o bulto según unidadPedida). |
| cantidadRecibida | Decimal? | Rellenado al recibir; por defecto = cantidadPedida si no se discrimina. |
| unidadPedida | ModoPedido | BULTO \| UNIDAD (reutilizar enum existente). |

Relaciones: PedidoProveedor; ProductoLocal. Índices: pedidoProveedorId, productoLocalId.

Restricción de negocio: productoLocalId debe pertenecer al mismo Local que depositoId del header (ProductoLocal.localId = PedidoProveedor.depositoId). Al recibir, se incrementa StockLocal donde localId = depositoId y productoId = productoLocalId, convirtiendo a unidades si hace falta (igual que pos-transferencias/recibir).

---

## 8. Flujo funcional paso a paso

1. **Entrada desde Proveedor**  
   En listado de Proveedores, botón "Generar pedido" (o "Pedido a proveedor") que navega a `/modulos/compras-proveedor/nueva?proveedorId=...`.

2. **Nueva pantalla**  
   - Usuario con contexto depósito (o admin eligiendo depósito).  
   - Proveedor fijado por query o selector.  
   - GET `/api/compras-proveedor/productos?proveedorId=&depositoId=` devuelve productos del depósito con ese proveedor y stock (actual, min, max).  
   - Cálculo en backend o frontend: si `stock_actual < stock_minimo` → `cantidad_sugerida = stock_maximo - stock_actual`; si no, 0.  
   - Usuario edita cantidades; opcionalmente quita líneas con 0.  
   - "Guardar borrador" → POST crear (estado Borrador). "Confirmar pedido" → POST crear + POST confirmar (estado Confirmado).

3. **Estados**  
   - **Borrador:** editable (agregar/quitar líneas, cambiar cantidades). Acciones: Confirmar, eliminar.  
   - **Confirmado:** ya no editable. Acción: Marcar Enviado (cuando el depósito “envía” el pedido al proveedor en la realidad).  
   - **Enviado:** pendiente de recepción física. Acción: Recibir.  
   - **Recibido:** cerrado. Al ejecutar Recibir se actualiza estado y se impacta stock.

4. **Impacto en stock**  
   Solo al marcar **Recibido** (POST recibir): para cada línea se incrementa `StockLocal` del depósito (localId = pedido.depositoId, productoId = detalle.productoLocalId) convirtiendo cantidad recibida a unidades si la unidad es BULTO (factor_pack del ProductoBase), igual que en `pos-transferencias/recibir`.

5. **Relación con entidades**  
   - **Proveedor:** pedido asociado a un proveedor; productos del pedido son los que tienen ese proveedor en base.  
   - **Productos:** vía ProductoLocal del depósito (y ProductoBase); stock y sugerido vía StockLocal.  
   - **Usuario:** quien crea el pedido (usuarioId). Opcional: usuario que confirma/recibe si se agregan campos.  
   - **Depósito:** único comprador; depositoId en cabecera; detalle por ProductoLocal del depósito; stock que se incrementa es el del depósito.

---

## 9. Reutilización de partes actuales

| Parte actual | Uso en Compras a Proveedor |
|--------------|----------------------------|
| **PosTransferencia / PosTransferenciaDetalle** | Patrón análogo: cabecera (origen/destino vs proveedor/depósito) + detalle por producto; estados Borrador → … → Recibido. No se reutiliza la tabla: son modelos nuevos. |
| **Estructura header + detalle** | Misma idea: PedidoProveedor + PedidoProveedorDetalle. |
| **pos-transferencias/recibir** | Lógica de incremento de StockLocal (toUnidades, upsert con increment). Reutilizar en POST recibir de compras-proveedor. |
| **resolveLocalAndGrupo / contexto** | Para exigir depósito: resolver depositoId (o desde grupo si hay un solo depósito por grupo) y validar que el local sea depósito. |
| **lib/conversiones/stock** | `toUnidades` (y si existe `toBultos`) para cantidad pedida/recibida en BULTO. |
| **Proveedor.dias_pedido** | No obligatorio para el MVP; luego se puede usar para sugerir “días en que conviene pedir” o validaciones. |
| **ProductoBase.proveedor_id (y 2, 3)** | Para filtrar “productos del proveedor” en GET productos. |
| **StockLocal (cantidad, stockMin, stockMax)** | Para cálculo de cantidad_sugerida. |

---

## 10. Listado de archivos (propuesta)

```
app/
  modulos/
    compras-proveedor/
      page.jsx                    # Listado
      nueva/
        page.jsx                  # Alta (productos + cantidades)
      [id]/
        page.jsx                  # Detalle y acciones

  api/
    compras-proveedor/
      listar/route.js
      obtener/route.js
      productos/route.js          # Productos del proveedor + stock + sugerido
      crear/route.js
      editar/[id]/route.js
      confirmar/[id]/route.js
      marcar-enviado/[id]/route.js
      recibir/[id]/route.js

components/
  compras-proveedor/
    PedidosProveedorTable.jsx
    FormNuevoPedidoProveedor.jsx
    ProductosProveedorGrid.jsx
    DetallePedidoProveedor.jsx
    ModalRecibirPedido.jsx         # opcional

hooks/
  usePedidosProveedor.js
  usePedidoProveedor.js
  useProductosProveedor.js

prisma/
  schema.prisma                   # + PedidoProveedor, PedidoProveedorDetalle
  migrations/
    XXXXX_add_pedido_proveedor/   # migración
```

Docs: `docs/modulos/compras-proveedor.md` (opcional).

---

## 11. Riesgos y consideraciones

- **Depósito único por grupo:** Si el modelo de negocio es “un depósito por grupo”, depositoId puede derivarse de grupo (GrupoDeposito) desde el contexto. Si hay varios depósitos, el usuario (o admin) debe elegir depósito en nueva/detalle.  
- **Unidad de pedido (BULTO/UNIDAD):** Detalle puede tener unidad por línea; al recibir, conversión a unidades para StockLocal debe ser consistente con pos-transferencias (factor_pack, toUnidades).  
- **Cantidad recibida ≠ cantidad pedida:** Si se permite recibir parcial (cantidadRecibida por línea), el endpoint recibir debe actualizar stock con cantidadRecibida (o cantidadPedida si no se envía recibido).  
- **Permisos:** Definir roles (ej. solo depósito, o permiso `compras.ver`/`compras.recibir`) para no dar a locales acceso a compras.  
- **Proveedor en producto:** Un producto puede tener proveedor_id, proveedor2_id, proveedor3_id; “productos del proveedor” = cualquiera de los tres. Coherente con informe días_pedido.  
- **Eliminación:** Solo en Borrador permitir eliminar pedido (o anular en otros estados sin tocar stock).  
- **Migración:** Añadir PedidoProveedor y PedidoProveedorDetalle en una migración; no tocar tablas existentes salvo si se agregan FKs desde otras (no necesario para el flujo base).

---

*Documento de diseño; no incluye código. Próximo paso: aprobación y luego implementación por fases (modelos + API listar/obtener/crear → nueva UI → confirmar/enviado/recibir + impacto stock).*
