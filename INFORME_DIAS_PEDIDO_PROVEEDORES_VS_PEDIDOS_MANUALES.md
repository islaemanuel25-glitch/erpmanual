# Informe: Días de pedido (proveedores) vs Pedidos manuales (reposición)

**Objetivo:** Mapear “días de pedido” de proveedores y “pedidos manuales” (local → depósito), detectar conflictos de naming/uso y proponer alternativas. Sin implementación de código.

---

## 1. DB: tablas, campos y enums relacionados

### Días de pedido (proveedor)

| Dónde | Qué |
|-------|-----|
| **Proveedor** | `dias_pedido DiaPedido[] @default([])` — días de la semana en que el proveedor recibe/acepta pedidos (compras). |
| **enum DiaPedido** | `Lunes`, `Martes`, `Miercoles`, `Jueves`, `Viernes`, `Sabado`, `Domingo`. |

No hay tabla intermedia: es un array de enum en el modelo Proveedor. Ningún otro modelo usa `DiaPedido`.

### Pedidos manuales (reposición local → depósito)

| Dónde | Qué |
|-------|-----|
| **PosTransferencia** | `origenId` (depósito), `destinoId` (local), `estado` (Borrador, Preparando, Solicitado, Enviado), etc. |
| **PosTransferenciaDetalle** | Líneas por producto (sugerido, preparado, unidadSugerida, unidadPreparada). |
| **Transferencia** | Generada cuando la POS se “envía”; enlazada por `posTransferenciaId`. |

No hay relación con Proveedor en PosTransferencia/Transferencia. El flujo es solo depósito ↔ local.

### Otros “pedido” en schema (no confundir)

| Modelo / enum | Uso |
|---------------|-----|
| **ProductoBase.modo_pedido** | Enum `ModoPedido` (BULTO / UNIDAD): en qué unidad se pide el producto, no “día de pedido”. |
| **TransferenciaDetalle.unidadEnviada** | ModoPedido: unidad con la que se envió. |
| **PosTransferenciaDetalle.unidadSugerida / unidadPreparada** | ModoPedido. |

---

## 2. API: endpoints relacionados

### Días de pedido (proveedor)

Solo se persisten/leen en el CRUD de proveedores; ningún endpoint de “pedidos” ni “pos-transferencias” usa `dias_pedido`.

| Método | Ruta | Uso de dias_pedido |
|--------|------|--------------------|
| POST | `/api/proveedores/crear` | Body `dias_pedido` → mapeo a enum → `prisma.proveedor.create` |
| PUT | `/api/proveedores/editar` | Idem en update |
| GET | `/api/proveedores/obtener?id=` | `select: { dias_pedido: true }` |
| GET | `/api/proveedores/listar` | `dias_pedido: true` en select |
| GET | `/api/proveedores/opciones` | `dias_pedido: true` (por si se usa en algún dropdown) |

### Pedidos manuales (reposición)

El flujo “pedido” del local al depósito usa **PosTransferencia** y APIs de **pos-transferencias**. El módulo UI “Pedidos” llama a estas mismas APIs para carrito y solicitar.

| Método | Ruta | Rol |
|--------|------|-----|
| GET | `/api/pedidos/opciones` | localId + grupoId + depósito; categorías, proveedores, áreas para filtros del catálogo |
| GET | `/api/pedidos/catalogo` | Productos del depósito (filtro opcional por `proveedorId` sobre ProductoBase) |
| GET | `/api/pedidos/carrito` | Borrador/Preparando de PosTransferencia (depósito → local); pendiente “Solicitado” |
| POST | `/api/pedidos/set-cantidad` | Ajustar cantidades en borrador (vía pos-transferencias o lógica equivalente) |
| GET | `/api/pedidos/historial` | Historial de pedidos (POS) para el local |
| POST | `/api/pos-transferencias/solicitar` | Pasa POS a “Solicitado” (llamado desde módulo Pedidos al “Enviar pedido al depósito”) |
| (resto) | `/api/pos-transferencias/*` | Crear POS, agregar/quitar/editar detalle, recibir, sugeridos, etc. |

Ninguno de estos endpoints lee ni escribe `Proveedor.dias_pedido`. El `proveedorId` en `/api/pedidos/catalogo` solo filtra productos por `proveedor_id` del catálogo; no hay “pedido a proveedor”.

---

## 3. UI: páginas y componentes

### Días de pedido (proveedor)

| Archivo | Uso |
|---------|-----|
| **app/modulos/proveedores/page.jsx** | Listado: columna “Días de pedido” (chips); botón “Pedidos” que navega a `/modulos/pedidos?proveedorId=${item.id}` |
| **components/proveedores/ModalProveedor.jsx** | Formulario crear/editar: campo “Días de pedido” (multi-select Lunes–Domingo), estado `form.dias_pedido` |

No hay hooks compartidos; estado local en página y modal.

### Pedidos manuales (reposición)

| Archivo | Uso |
|---------|-----|
| **app/modulos/pedidos/page.jsx** | Vista local: catálogo (filtros categoría, proveedor, área), carrito, “Enviar pedido al depósito”, pendiente Solicitado; usa `proveedorId` de URL como filtro de catálogo |
| **app/modulos/pedidos/historial/page.jsx** | Historial de pedidos (POS) del local |
| **app/modulos/pos-transferencias/nueva/page.jsx** | Vista depósito: armar transferencia, sugeridos, pedido manual, preparar, solicitar, enviar |

El botón “Pedidos” en Proveedores lleva al **módulo Pedidos (reposición)** con `proveedorId` en query: se muestra el catálogo de productos del depósito filtrado por ese proveedor. No es “hacer pedido al proveedor”; es “pedir al depósito productos de ese proveedor”.

---

## 4. ¿“Día de pedido” quedó apuntando por error a Pedidos manuales?

**No.** A nivel de datos y lógica:

- **Proveedor.dias_pedido** solo se usa en CRUD de proveedores (API y UI). No se usa en ninguna ruta de pedidos ni pos-transferencias.
- **Pedidos manuales** no usan Proveedor ni `dias_pedido`; trabajan solo con PosTransferencia (depósito ↔ local).

El conflicto es de **naming y UX**, no de referencias incorrectas en código:

1. **Misma palabra “pedido”** para dos cosas distintas:  
   - Días en que el **proveedor** recibe pedidos (compras).  
   - Pedido de **reposición** del local al depósito (flujo actual del módulo “Pedidos”).
2. En **Proveedores**, el botón “Pedidos” lleva a **reposición** (local → depósito) con filtro por proveedor, lo que puede interpretarse como “pedidos al proveedor”, cuando en realidad es “pedir al depósito (productos de este proveedor)”.

---

## 5. Riesgos de ruptura y dependencias

- **Proveedor.dias_pedido**  
  - **Dependen:** ModalProveedor, listado proveedores, APIs crear/editar/obtener/listar/opciones.  
  - **Riesgo:** Cualquier cambio de nombre de campo (p. ej. en Prisma) implica migración, actualizar body/response en esas APIs y estado/labels en ModalProveedor y tabla. Si se renombra solo en UI (label “Días de pedido a proveedor”), no hay ruptura de integración.

- **Módulo Pedidos (reposición)**  
  - **Dependen:** pedidos/opciones, carrito, catalogo, set-cantidad, historial; pos-transferencias/solicitar (y resto de pos-transferencias).  
  - **No dependen de:** Proveedor.dias_pedido.  
  - **Riesgo:** Renombrar rutas o módulo (p. ej. “Pedidos” → “Reposición”) afecta navegación, menú y el enlace desde Proveedores (`/modulos/pedidos?proveedorId=`). Cambiar solo textos (títulos, botones) tiene bajo riesgo.

- **Botón “Pedidos” en Proveedores**  
  - Solo enlace a `/modulos/pedidos?proveedorId=`. Si se cambia la ruta del módulo de reposición, hay que actualizar este enlace.

---

## 6. Propuesta A: Renombrar/aislar en Proveedores

**Idea:** Dejar claro que “días de pedido” es solo para **compras a proveedor**, y mantener “Pedidos” para el flujo actual (reposición).

- **DB (opcional):** Mantener `dias_pedido` en Proveedor o renombrar a algo como `dias_pedido_proveedor` / `dias_recepcion_pedido` (requiere migración Prisma y actualizar APIs que lean/escriban el campo).
- **UI Proveedores:**  
  - Label en modal: “Días de recepción de pedido (proveedor)” o “Días en que el proveedor recibe pedidos”.  
  - Columna en listado: mismo criterio.  
  - Botón: cambiar “Pedidos” por “Reposición” o “Pedir al depósito” y seguir enlazando a `/modulos/pedidos?proveedorId=`, para que no se interprete como “pedido a proveedor”.
- **Ventaja:** Cambios acotados a Proveedores + opcionalmente schema. Bajo riesgo.  
- **Desventaja:** Si más adelante existiera un módulo de “Compras a proveedor”, el campo ya estaría bien identificado; si no, el renombre en UI ya reduce la confusión.

---

## 7. Propuesta B: Módulo nuevo para logística de compras a proveedor

**Idea:** Crear un módulo específico de **compras / logística a proveedor** y tratar “días de pedido” como parte de ese contexto.

- **Nombre sugerido:** “Compras a proveedor”, “Logística proveedores” o “Pedidos a proveedor” (si se reserva “Pedidos” solo para reposición, este nombre evita confusión).
- **Contenido posible:**  
  - Uso de `Proveedor.dias_pedido` (y eventualmente frecuencia, cortes de pedido, etc.).  
  - Pantalla o sección por proveedor: “Días en que recibe pedidos”, recordatorios, o integración futura con órdenes de compra.
- **Ventaja:** Separa claramente “reposición (local → depósito)” de “compras (empresa → proveedor)” y da un lugar natural a `dias_pedido`.  
- **Desventaja:** Más trabajo (nueva ruta, menú, permisos); el campo hoy no se usa en lógica, solo se muestra y edita en Proveedores.

---

## 8. Recomendación final

**Recomendación: A (renombrar/aislar en Proveedores), con un paso de claridad en UX.**

- **Motivo principal:** Hoy “día de pedido” **no** está enlazado por error a Pedidos manuales; el problema es solo semántico y de interpretación en la UI. La opción A resuelve eso con poco impacto.
- **Acciones concretas sugeridas (sin implementar aquí):**  
  1. En **Proveedores**, cambiar labels a “Días en que el proveedor recibe pedidos” (o similar) en modal y listado.  
  2. En el mismo listado, cambiar el botón “Pedidos” por “Pedir al depósito” (o “Reposición”) y mantener el enlace actual, para dejar claro que ese flujo es local → depósito.  
  3. Opcional: en Prisma/API, renombrar a `dias_pedido_proveedor` o `dias_recepcion_pedido` si se quiere consistencia en código; no obligatorio para deshacer la confusión de naming.
- **Reservar B** para cuando exista un flujo real de “pedidos a proveedor” (órdenes de compra, planificación por día, etc.); en ese momento tendrá sentido un módulo dedicado y eventualmente mover o reutilizar el campo ahí.

---

*Fin del informe. Sin código implementado.*
