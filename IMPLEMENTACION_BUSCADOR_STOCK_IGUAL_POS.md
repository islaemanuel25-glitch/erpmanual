# Implementación: Buscador Stock = POS Ventas

## Objetivo

Replicar **exactamente** el comportamiento del buscador de POS Ventas dentro del módulo Stock. El buscador anterior de Stock (input libre en FiltrosStock) se dejó de usar.

---

## 1. Lista exacta de archivos tocados

| Archivo | Acción |
|--------|--------|
| `app/api/stock_locales/buscar-producto/route.js` | **Nuevo** — GET búsqueda productos para Stock (misma lógica que POS) |
| `components/pos-ventas/BuscadorProductos.jsx` | **Modificado** — prop opcional `apiPath` para apuntar a otro endpoint |
| `app/modulos/stock_locales/page.jsx` | **Modificado** — import de BuscadorProductos, bloque de buscador y `onAgregar` → abrir Ajuste |
| `components/stock_locales/FiltrosStock.jsx` | **Modificado** — eliminado estado `q` e input "Buscar por nombre o código"; filtro sin `q` |

**No se tocó:** `TablaStock.jsx` (sigue recibiendo `filtro`; si `filtro.q` no viene, simplemente no se envía en la query). `app/api/stock_locales/listar/route.js` sin cambios.

---

## 2. Causa / problema actual

- **POS Ventas:** tiene un buscador con debounce 300 ms, búsqueda por nombre/código/código de barras, ranking en backend + frontend, Enter para agregar primer resultado, detección de scanner (Enter rápido → auto-agregar si 1 resultado), Escape para limpiar, búsqueda por voz opcional, mensajes "Buscando..." y "No se encontraron productos."
- **Stock:** tenía un simple input "Buscar por nombre o código…" en FiltrosStock que actualizaba `filtro.q` con debounce 200 ms y la tabla recargaba con ese `q` en `listar`. No había resultados en dropdown, ni Enter, ni código de barras instantáneo, ni misma UX que POS.

Se pidió que Stock use la **misma** lógica y UX que POS, con cambio mínimo.

---

## 3. Qué se hizo (resumen)

- **Componente compartido:** Se reutiliza `BuscadorProductos` (POS) en Stock. Se añadió la prop opcional `apiPath`; por defecto sigue siendo `/api/pos-ventas/buscar-producto`.
- **Nuevo endpoint:** `GET /api/stock_locales/buscar-producto?q=...&localId=...` con permiso `stock.ver`, misma lógica que POS (match exacto por código de barras, luego contains nombre/código, ranking por relevancia). Devuelve el mismo formato de ítems que el endpoint de POS. En Stock **no** se filtra por stock > 0 (se listan todos para poder ajustar).
- **Stock:** Arriba de FiltrosStock se coloca `BuscadorProductos` con `apiPath="/api/stock_locales/buscar-producto"` y `onAgregar` que abre el modal de Ajuste con el producto seleccionado (mapeando `id: producto.productoLocalId` para ModalAjuste).
- **FiltrosStock:** Se eliminó el input de búsqueda por texto y el estado `q`; el filtro que se envía a la tabla ya no incluye `q`. Se mantiene el botón "Limpiar filtros" para categoría/proveedor/área/checkboxes.

---

## 4. Bloques finales (referencia)

### 4.1 `BuscadorProductos.jsx` — cambios

```jsx
const DEFAULT_SEARCH_API = "/api/pos-ventas/buscar-producto";

function BuscadorProductos({ localId, onAgregar, apiPath }) {
  const searchApi = apiPath || DEFAULT_SEARCH_API;
  // ... resto igual
```

Y en el `fetch`:

```js
const res = await fetch(
  `${searchApi}?q=${encodeURIComponent(texto)}&localId=${localId}`,
  { credentials: "include" }
);
```

Dependencias del `useCallback` de `buscar`: incluir `searchApi`.

### 4.2 `stock_locales/page.jsx` — bloque añadido

```jsx
import BuscadorProductos from "@/components/pos-ventas/BuscadorProductos";
// ...
{/* Buscador igual que POS: código/nombre, debounce, Enter, barcode → abre Ajuste */}
<BuscadorProductos
  localId={localSeleccionado}
  apiPath="/api/stock_locales/buscar-producto"
  onAgregar={(producto) => {
    abrirAjuste({
      ...producto,
      id: producto.productoLocalId,
    });
  }}
/>
```

### 4.3 `FiltrosStock.jsx` — cambios

- Quitar estado `q` y `setQ`.
- Quitar `q` del objeto en `onFiltroChange` y de las dependencias del `useEffect`.
- En `resetFiltros`, quitar `setQ("")`.
- Sustituir la fila del input de búsqueda + botón por solo el botón "Limpiar filtros".
- Eliminar import de `SunmiInput` si ya no se usa.

### 4.4 `app/api/stock_locales/buscar-producto/route.js`

- Archivo nuevo. Copia de la lógica de `app/api/pos-ventas/buscar-producto/route.js` con:
  - Permiso `stock.ver`.
  - Mismo ranking y mismo mapeo de productos (misma forma de respuesta).
  - Sin filtro `.filter(p => p.stock > 0 || allowNegativeStock)` para incluir productos con stock 0.

---

## 5. Compartido vs clonado

- **Compartido:** El **componente** `BuscadorProductos` es único y se usa en POS y en Stock. Solo se añadió la prop opcional `apiPath`.
- **Clonado (lógica backend):** La **ruta** de búsqueda para Stock es nueva (`stock_locales/buscar-producto`). La lógica (ranking, mapeo) está duplicada respecto a la de POS para no tocar permisos ni el flujo de POS y mantener `stock.ver` en Stock. Se podría extraer a un helper compartido en el futuro si se desea.

---

## 6. Comportamiento: ¿exactamente igual a POS?

Sí, en todo lo que es el **buscador** en sí:

- Mismo componente, mismo debounce (300 ms), misma búsqueda por nombre/código/código de barras.
- Mismo ranking (frontend) y misma lógica en backend (exacto por código, luego contains, mismo score).
- Misma navegación por teclado: Escape limpia, Enter agrega primer resultado o dispara búsqueda, detección de scanner (Enter rápido + buffer) con auto-selección si hay un solo resultado.
- Mismos estados de UI: "Buscando...", "No se encontraron productos." cuando hay query y 0 resultados.
- Código de barras exacto → un resultado con mismo código → se considera "agregar" al primer ítem (en Stock eso abre Ajuste).

**Única diferencia deseada:** al elegir un producto, en POS se agrega al carrito; en Stock se abre el modal de Ajuste. No se cambia mobile ni desktop; el componente ya era responsive.
