# REPORTE: Limpieza de Mensajes Legacy "Seleccioná un local"

**Fecha:** 2025-01-XX

---

## 1. BÚSQUEDA DE TEXTOS LEGACY

### Textos buscados (case-insensitive):
- "Seleccioná un local"
- "Selecciona el local"
- "Local seleccionado"
- "Seleccionar local"
- "Sin local"

---

## 2. RESULTADOS POR ARCHIVO

### ✅ **COMPONENTES STOCK_LOCALES** (A modificar)

#### `components/stock_locales/TablaStock.jsx`
- **Línea 138:** `"Seleccioná un local para ver el stock."` ⚠️ **A CAMBIAR**

#### `components/stock_locales/FiltrosStock.jsx`
- **No se encontraron textos legacy** ✅

---

### 📋 **OTROS ARCHIVOS** (NO modificar en este paso)

#### `app/modulos/stock_locales/page.jsx`
- **Línea 71:** `{localActual.nombre || "Sin local"}` (fallback de nombre, no mensaje de error)

#### `app/modulos/fidelidad/page.jsx`
- **Línea 228:** `{contexto?.nombre || "Sin local"}` (fallback de nombre, no mensaje de error)

#### `app/modulos/pos-ventas/page.jsx`
- **Línea 614:** `{localNombre || "Sin local"}` (fallback de nombre, no mensaje de error)
- **Línea 390:** `"Seleccioná un local para elegir cliente."` (mensaje de error funcional)
- **Línea 651:** `"Selecciona el local donde vas a operar"` (pantalla de selección - será eliminada en Fase A)
- **Línea 662:** `placeholder="Seleccionar local..."` (placeholder - será eliminado en Fase A)

#### `app/modulos/clientes/page.jsx`
- **Línea 249:** `"Seleccioná un local para importar."` (mensaje de error funcional)
- **Línea 496:** `"Seleccioná un local para importar/exportar."` (mensaje de error funcional)
- **Línea 1234:** `"Seleccioná un local para ver el historial de ventas."` (mensaje de error funcional)
- **Línea 1381:** `"Seleccioná un local para ver la cuenta corriente."` (mensaje de error funcional)

#### `app/modulos/clientes/[id]/page.jsx`
- **Línea 31:** `"Seleccioná un local"` (mensaje de error funcional)
- **Línea 252:** `"Seleccioná un local"` (mensaje de error funcional)
- **Línea 351:** `"Seleccioná un local para ver los puntos."` (mensaje de error funcional)
- **Línea 489:** `"Seleccioná un local para ver la cuenta corriente."` (mensaje de error funcional)

#### `app/modulos/pos-transferencias/page.jsx`
- **Línea 193:** `"Seleccioná un local destino"` (mensaje de error funcional)
- **Línea 405:** `placeholder="Seleccionar local destino"` (placeholder funcional)
- **Línea 486:** `placeholder="Seleccionar local"` (placeholder funcional)

#### `components/pos-ventas/ClientePickerFullscreen.jsx`
- **Línea 21:** `"Seleccioná un local para elegir cliente."` (mensaje de error funcional)

#### `components/pos-ventas/ModalCliente.jsx`
- **Línea 51:** `"Seleccioná un local para buscar clientes."` (mensaje de error funcional)
- **Línea 139:** `"Seleccioná un local para buscar clientes."` (mensaje de error funcional)

#### `lib/grupos.js`
- **Línea 57:** `"Seleccioná un local."` (mensaje de error de API)
- **Línea 85:** `"Seleccioná un local."` (mensaje de error de API)

#### `app/api/clientes/import/excel/route.js`
- **Línea 60:** `"Seleccioná un local."` (mensaje de error de API)

#### `components/grupos/ModalGrupo.jsx`
- **Línea 185:** `<SunmiSelectOption value="">Seleccionar local…</SunmiSelectOption>` (placeholder funcional)

#### `components/grupos/SelectAgregarLocal.jsx`
- **Línea 38:** `<SunmiSelectOption value="">Seleccionar local…</SunmiSelectOption>` (placeholder funcional)

#### `components/usuarios/ModalUsuario.jsx`
- **Línea 167:** `"Sin local asignado"` (estado descriptivo, no mensaje de error)

---

## 3. CAMBIOS PROPUESTOS

### `components/stock_locales/TablaStock.jsx`

**Línea 133-142:** Cambiar mensaje legacy por mensaje consistente con nuevo sistema.

**Antes:**
```jsx
if (!localSeleccionado) {
  return (
    <div className="sunmi-card">
      <div className="sunmi-header-cyan">Stock</div>
      <p className="text-slate-400 text-sm mt-3">
        Seleccioná un local para ver el stock.
      </p>
    </div>
  );
}
```

**Después:**
```jsx
if (!localSeleccionado) {
  return (
    <div className="sunmi-card">
      <div className="sunmi-header-cyan">Stock</div>
      <p className="text-slate-400 text-sm mt-3">
        No hay contexto operativo activo.
      </p>
    </div>
  );
}
```

**Razón:**
- El componente ya no depende de un selector manual
- El mensaje debe ser consistente con el nuevo sistema de contexto
- "No hay contexto operativo activo" es más genérico y no implica acción del usuario

---

### `components/stock_locales/FiltrosStock.jsx`

**No requiere cambios** - No contiene textos legacy relacionados con selección de local.

---

## 4. RESUMEN

### Archivos a modificar:
- ✅ `components/stock_locales/TablaStock.jsx` (1 cambio)

### Archivos sin cambios:
- ✅ `components/stock_locales/FiltrosStock.jsx` (sin textos legacy)

### Total de cambios:
- **1 mensaje legacy eliminado**
- **1 mensaje actualizado** a formato consistente

---

**FIN DEL REPORTE**

