# REPORTE: Limpieza de Menciones Legacy en Documentación

**Fecha:** 2025-01-XX

---

## RESUMEN

✅ **Todas las menciones legacy eliminadas de la documentación**

---

## ARCHIVOS MODIFICADOS

### 1. `docs/modulos/productos.md`

**Línea 52:** Eliminada mención a `SelectorLocales`

**Antes:**
```markdown
- `SelectorLocales`: Selector de local activo
```

**Después:**
```markdown
**Nota:** El contexto se elige solo en /inicio y se muestra en Header.
```

---

### 2. `docs/modulos/grupos.md`

**Línea 51:** Eliminada mención a `SelectorGrupoActivo`

**Antes:**
```markdown
### Componente especial
- `SelectorGrupoActivo` (en `components/grupo/`): Selector global para admin que cambia el grupo activo via cookie
```

**Después:**
```markdown
**Nota:** El contexto se elige solo en /inicio y se muestra en Header.
```

---

### 3. `docs/modulos/actualizacion-precios.md`

**Línea 35:** Eliminada mención a `SelectorGrupoActivo` en sección "Usa"

**Antes:**
```markdown
- SelectorGrupoActivo (cambio de grupo sin reload)
```

**Después:**
```markdown
**Nota:** El contexto se elige solo en /inicio y se muestra en Header.
```

**Línea 54:** Eliminada mención a `SelectorGrupoActivo` en sección "Componentes principales"

**Antes:**
```markdown
- `SelectorGrupoActivo`: Selector de grupo (callback onGrupoChanged)
```

**Después:**
```markdown
**Nota:** El contexto se elige solo en /inicio y se muestra en Header.
```

---

### 4. `docs/INCONSISTENCIAS-SUNMI.md`

**Línea 172:** Eliminada fila de tabla con referencia a `SelectorGrupoActivo.jsx`

**Antes:**
```markdown
| `components/grupo/SelectorGrupoActivo.jsx` | `bg-slate-900`, `border-slate-700` |
```

**Después:**
```markdown
(Fila eliminada)
```

---

## VERIFICACIÓN FINAL

### Búsqueda de menciones legacy:

```bash
grep -i "SelectorLocales|SelectorGrupoActivo|useLocalSelector" docs/*
```

**Resultado:** ✅ **0 matches encontrados**

---

## RESUMEN DE CAMBIOS

| Archivo | Cambios | Estado |
|---------|---------|--------|
| `docs/modulos/productos.md` | 1 mención eliminada | ✅ Completado |
| `docs/modulos/grupos.md` | 1 mención eliminada | ✅ Completado |
| `docs/modulos/actualizacion-precios.md` | 2 menciones eliminadas | ✅ Completado |
| `docs/INCONSISTENCIAS-SUNMI.md` | 1 referencia eliminada | ✅ Completado |

**Total:**
- ✅ 5 menciones legacy eliminadas
- ✅ 4 notas agregadas: "El contexto se elige solo en /inicio y se muestra en Header."
- ✅ 0 matches restantes

---

## CONCLUSIÓN

✅ **Todas las menciones legacy han sido eliminadas de la documentación**

La documentación ahora refleja correctamente que:
- El contexto se elige solo en `/inicio`
- Se muestra en el `Header`
- No existen componentes `SelectorLocales`, `SelectorGrupoActivo` o `useLocalSelector`

---

**FIN DEL REPORTE**

