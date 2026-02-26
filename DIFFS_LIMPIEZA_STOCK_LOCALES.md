# DIFFS: Limpieza de Mensajes Legacy en stock_locales

**Fecha:** 2025-01-XX

---

## CAMBIOS APLICADOS

### ✅ `components/stock_locales/TablaStock.jsx`

**Línea 138:** Cambio de mensaje legacy a mensaje consistente.

#### Diff:

```diff
  if (!localSeleccionado) {
    return (
      <div className="sunmi-card">
        <div className="sunmi-header-cyan">Stock</div>
        <p className="text-slate-400 text-sm mt-3">
-         Seleccioná un local para ver el stock.
+         No hay contexto operativo activo.
        </p>
      </div>
    );
  }
```

**Contexto completo (líneas 133-142):**

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

---

### ✅ `components/stock_locales/FiltrosStock.jsx`

**Sin cambios** - No contiene textos legacy relacionados con selección de local.

---

## CONFIRMACIÓN

### ✅ Verificación de textos legacy eliminados

**Búsqueda ejecutada:**
```bash
grep -i "Seleccioná un local|Selecciona el local|Local seleccionado|Seleccionar local" components/stock_locales/*
```

**Resultado:**
```
No matches found.
```

✅ **Confirmado:** Ya no existe ningún texto legacy en los componentes `stock_locales`.

---

## RESUMEN

| Archivo | Cambios | Estado |
|---------|---------|--------|
| `components/stock_locales/TablaStock.jsx` | 1 mensaje actualizado | ✅ Completado |
| `components/stock_locales/FiltrosStock.jsx` | Sin cambios necesarios | ✅ Verificado |

**Total:**
- ✅ 1 mensaje legacy eliminado
- ✅ 1 mensaje actualizado a formato consistente
- ✅ 0 errores de linting
- ✅ 0 textos legacy restantes en componentes stock_locales

---

**FIN DE DIFFS**

