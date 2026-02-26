# Reporte: Filtros categoría/área no se aplican en Productos sugeridos (pos-transferencias)

**Objetivo:** Mapear por qué los filtros categoría y área no se aplican en la sección "Productos sugeridos" del módulo pos-transferencias → nueva.  
**Alcance:** Solo mapeo y evidencia; sin implementar cambios.

---

## 1. Archivos clave (solo lectura)

| Rol | Ruta |
|-----|------|
| Pantalla creación | `app/modulos/pos-transferencias/nueva/page.jsx` |
| Componente sugeridos | `components/pos-transferencias/nueva/TablaSugeridos.jsx` |
| Filtros depósito (no usados en sugeridos) | `components/pos-transferencias/nueva/FiltrosDeposito.jsx` |
| API sugeridos | `app/api/pos-transferencias/sugeridos/route.js` |
| Select genérico | `components/sunmi/SunmiSelectAdv.jsx` |

**Nota:** En la pantalla "Productos sugeridos" (modo normal) **no** se usa `FiltrosDeposito`. Los filtros de categoría/área están dentro de `TablaSugeridos` (dos `SunmiSelectAdv`). `FiltrosDeposito` usa `areaId`/`categoriaId` (IDs) y no aparece en esta página.

---

## 2. Diagrama del flujo de datos (texto)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ app/modulos/pos-transferencias/nueva/page.jsx                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ ESTADO                                                                       │
│   useState("todos") → categoriaFiltro, setCategoriaFiltro  (L60)             │
│   useState("todos") → areaFiltro, setAreaFiltro            (L61)             │
│   useState([])      → sugeridos, setSugeridos              (L46)            │
├─────────────────────────────────────────────────────────────────────────────┤
│ OPCIONES (desde sugeridos)                                                   │
│   categoriasOpciones = useMemo(seen.values() → strings)     (L179–186)       │
│   areasOpciones      = useMemo(seen.values() → strings)     (L189–196)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ FILTRADO                                                                     │
│   sugeridosFiltrados = useMemo(                                              │
│     sugeridos.filter(okCat && okArea)          (L199–209)                     │
│     deps: [sugeridos, categoriaFiltro, areaFiltro]                            │
│   )                                                                          │
│   okCat  = fc === "todos" || norm(s.categoriaNombre, "Sin categoría") === fc │
│   okArea = fa === "todos" || norm(s.areaFisicaNombre, "Sin área") === fa     │
│   fc = norm(categoriaFiltro, "todos"), fa = norm(areaFiltro, "todos")        │
├─────────────────────────────────────────────────────────────────────────────┤
│ PAGINACIÓN                                                                   │
│   sugeridosPaginados = useMemo(                                              │
│     sugeridosFiltrados.slice(start, start + sugPageSize)    (L214–217)       │
│   )                                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ RENDER → TablaSugeridos (L659–676)                                           │
│   datos={sugeridosPaginados}     ← lista ya filtrada y paginada              │
│   categoriaSeleccionada={categoriaFiltro}                                    │
│   areaSeleccionada={areaFiltro}                                               │
│   onChangeCategoria={(v) => { setCategoriaFiltro(v); setSugPage(1); }}        │
│   onChangeArea={(v) => { setAreaFiltro(v); setSugPage(1); }}                 │
│   categorias={categoriasOpciones}  (array de strings)                        │
│   areas={areasOpciones}            (array de strings)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ components/pos-transferencias/nueva/TablaSugeridos.jsx                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ PROPS: datos, categoriaSeleccionada, areaSeleccionada, categorias, areas,   │
│        onChangeCategoria, onChangeArea                                       │
│ NO re-filtra: renderiza directamente props.datos (L190: datos.map((p) => …))  │
│ Filtros UI: SunmiSelectAdv value={categoriaSeleccionada} onChange=onChange…   │
│   Opciones: "todos" + categorias.map(c => value={c})  (L119–124)             │
│   Idem áreas (L134–141)                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

Resumen del flujo:
- **categoriaFiltro / areaFiltro** se definen en `page.jsx` (useState L60–61).
- **sugeridosFiltrados** se calculan en `page.jsx` (useMemo L199–209) con dependencias correctas.
- **TablaSugeridos** recibe **datos = sugeridosPaginados** (derivado de sugeridosFiltrados) y **no** vuelve a filtrar; solo pinta `datos`.

---

## 3. Snippets de lugares clave

### 3.1 Definición estado y filtrado (page.jsx)

```60:61:app/modulos/pos-transferencias/nueva/page.jsx
  const [categoriaFiltro, setCategoriaFiltro] = useState("todos");
  const [areaFiltro, setAreaFiltro] = useState("todos");
```

```199:209:app/modulos/pos-transferencias/nueva/page.jsx
  const sugeridosFiltrados = useMemo(() => {
    const fc = norm(categoriaFiltro, "todos");
    const fa = norm(areaFiltro, "todos");
    const resultado = sugeridos.filter((s) => {
      const okCat = fc === "todos" || norm(s.categoriaNombre, "Sin categoría") === fc;
      const okArea = fa === "todos" || norm(s.areaFisicaNombre, "Sin área") === fa;
      return okCat && okArea;
    });
    console.debug("filtros", { categoriaFiltro, areaFiltro, fc, fa, total: sugeridos.length, filtrados: resultado.length, muestra: sugeridos.slice(0, 3).map(s => ({ cat: s.categoriaNombre, area: s.areaFisicaNombre })) });
    return resultado;
  }, [sugeridos, categoriaFiltro, areaFiltro]);
```

### 3.2 Opciones de categoría/área (page.jsx)

```179:196:app/modulos/pos-transferencias/nueva/page.jsx
  const categoriasOpciones = useMemo(() => {
    const seen = new Map();
    sugeridos.forEach((s) => {
      const display = s.categoriaNombre ? String(s.categoriaNombre).trim() : "Sin categoría";
      const key = norm(s.categoriaNombre, "Sin categoría");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridos]);

  const areasOpciones = useMemo(() => {
    const seen = new Map();
    sugeridos.forEach((s) => {
      const display = s.areaFisicaNombre ? String(s.areaFisicaNombre).trim() : "Sin área";
      const key = norm(s.areaFisicaNombre, "Sin área");
      if (!seen.has(key)) seen.set(key, display);
    });
    return Array.from(seen.values());
  }, [sugeridos]);
```

### 3.3 Props a TablaSugeridos (page.jsx)

```659:676:app/modulos/pos-transferencias/nueva/page.jsx
              <TablaSugeridos
                datos={sugeridosPaginados}
                page={sugPage}
                totalPages={totalPagesSug}
                ...
                categorias={categoriasOpciones}
                areas={areasOpciones}
                categoriaSeleccionada={categoriaFiltro}
                areaSeleccionada={areaFiltro}
                onChangeCategoria={(v) => { setCategoriaFiltro(v); setSugPage(1); }}
                onChangeArea={(v) => { setAreaFiltro(v); setSugPage(1); }}
              />
```

### 3.4 TablaSugeridos: props y render (TablaSugeridos.jsx)

```7:24:components/pos-transferencias/nueva/TablaSugeridos.jsx
export default function TablaSugeridos({
  datos,
  ...
  categorias = [],
  areas = [],
  categoriaSeleccionada = "todos",
  areaSeleccionada = "todos",
  onChangeCategoria,
  onChangeArea,
}) {
```

```114:124:components/pos-transferencias/nueva/TablaSugeridos.jsx
          <SunmiSelectAdv
            value={categoriaSeleccionada}
            onChange={(v) => onChangeCategoria?.(v)}
            ...
          >
            <SunmiSelectOption value="todos">Todas</SunmiSelectOption>
            {categorias.map((c) => (
              <SunmiSelectOption key={c} value={c}>
                {c}
              </SunmiSelectOption>
            ))}
```

```190:197:components/pos-transferencias/nueva/TablaSugeridos.jsx
            {datos.map((p) => (
              <SugeridoRow
                key={p.productoLocalDestinoId}
                p={p}
                ...
              />
            ))}
```

### 3.5 API sugeridos – forma del item (route.js)

```178:181:app/api/pos-transferencias/sugeridos/route.js
        categoriaNombre: base?.categoria?.nombre?.trim() || null,
        areaFisicaNombre: base?.area_fisica?.nombre?.trim() || null,
```

---

## 4. Naming: variables reales

| Dónde | Categoría | Área |
|-------|-----------|------|
| Estado en page.jsx | `categoriaFiltro`, `areaFiltro` (strings: "todos" o nombre) | Idem |
| Props a TablaSugeridos | `categoriaSeleccionada`, `areaSeleccionada` | Idem |
| Opciones | `categoriasOpciones` / `areasOpciones` → array de **strings** (nombres para display y value) | Idem |
| Cada item de sugerido (API + page) | `s.categoriaNombre` (string o null) | `s.areaFisicaNombre` (string o null) |
| Filtro en useMemo | Compara con `norm(s.categoriaNombre, "Sin categoría")` | `norm(s.areaFisicaNombre, "Sin área")` |
| FiltrosDeposito (no usado aquí) | `categoriaId` (numérico) | `areaId` (numérico) |

No hay uso de `categoriaId` ni `areaId` en el flujo de sugeridos; todo es por **nombre** (`categoriaNombre`, `areaFisicaNombre`). El filtro compara contra esos nombres normalizados con `norm()`. No se detecta mismatch de nombre de campo (ej. filtrar por `i.area` cuando el dato es `i.areaId`).

---

## 5. Punto exacto del bug (causa raíz)

Del mapeo se deduce:

- El flujo está bien encadenado: estado → useMemo (sugeridosFiltrados) → sugeridosPaginados → `datos` de TablaSugeridos; TablaSugeridos no re-filtra y pinta `datos`.
- Las dependencias del useMemo incluyen `categoriaFiltro` y `areaFiltro`.
- Los nombres de campos en los items coinciden con lo que usa el filtro (`categoriaNombre`, `areaFisicaNombre`).

**Causa raíz más probable (elegir 1–2):**

1. **Valor que llega a `onChangeCategoria`/`onChangeArea`**  
   Si `SunmiSelectAdv` (o el uso de `SunmiSelectOption`) pasa a `onChange` un valor distinto al string del option (por ejemplo tipo número, índice, o el `children` en vez de `value`), entonces `categoriaFiltro`/`areaFiltro` podrían quedar en algo que no coincide con `norm(s.categoriaNombre, …)` y el filtro no aplicaría como se espera.

2. **Colisión "todos" vs categoría llamada "todos"**  
   Si existe una categoría con nombre literal `"todos"`, esa opción tendría `value="todos"` igual que "Todas". Al elegirla, `fc` sigue siendo `"todos"` y el filtro se comporta como "Todas" (no filtra). Es un caso borde que haría que “elegir esa categoría” no aplique filtro.

No se encontró: lista equivocada (se pasa `sugeridosPaginados`), TablaSugeridos ignorando props para los filtros, ni dependencias faltantes en el useMemo.

---

## 6. Fix mínimo probable (sin code)

1. **Comprobar tipo y valor en onChange:** En el handler que hace `setCategoriaFiltro(v)` / `setAreaFiltro(v)`, loguear `v` (y `typeof v`). Si no es string o no es el nombre tal cual aparece en los items, normalizar a string o asegurar que el `value` de cada `SunmiSelectOption` sea exactamente el string que se usa en el filtro (o un sentinel único para "Todas").
2. **Evitar colisión con "todos":** Usar un valor sentinel para "Todas" (por ejemplo `"__todas__"` o `""`) en el option y en el useMemo tratar ese valor como “no filtrar por categoría/área”, de forma que no coincida con una categoría real llamada "todos".
3. **Confirmar modo de la pantalla:** Verificar que se está en modo normal (no manual): la sección "Productos sugeridos" con filtros solo se muestra cuando `!esModoManual`; en manual se usa otra instancia de TablaSugeridos con filtros vacíos y no-op.

---

## 7. Repro y logging (3 console.log mínimos)

Solo para sugeridos; colocar y revisar en consola sin tocar más lógica.

**Log 1 – Valores actuales de los filtros**  
**Dónde:** `app/modulos/pos-transferencias/nueva/page.jsx`, dentro del `useMemo` de `sugeridosFiltrados` (por ejemplo justo después de `const fa = norm(areaFiltro, "todos");`).

```js
console.log("[sugeridos filtros] categoriaFiltro, areaFiltro", categoriaFiltro, areaFiltro, "types", typeof categoriaFiltro, typeof areaFiltro);
```

**Log 2 – Tamaño sugeridos vs sugeridosFiltrados**  
**Dónde:** mismo `useMemo`, antes del `return resultado;`.

```js
console.log("[sugeridos filtros] lengths", sugeridos.length, "->", resultado.length);
```

**Log 3 – Forma del primer item (shape)**  
**Dónde:** mismo `useMemo`, una sola vez (por ejemplo `if (sugeridos.length && resultado.length) { ... }`).

```js
if (sugeridos.length && resultado.length) {
  console.log("[sugeridos filtros] primer item shape", {
    categoriaNombre: resultado[0].categoriaNombre,
    areaFisicaNombre: resultado[0].areaFisicaNombre,
    keys: Object.keys(resultado[0]).filter((k) => k.includes("ategoria") || k.includes("area")),
  });
}
```

Con esto se verifica: que los filtros llegan como string y con el valor esperado, que el conteo pasa de `sugeridos.length` a `resultado.length` al cambiar filtro, y que los campos usados en el filtro existen en el item.

---

## 8. Comandos sugeridos (ya ejecutados conceptualmente)

```bash
rg -n "TablaSugeridos|sugeridosFiltrados|categoriaFiltro|areaFiltro|FiltrosDeposito" app components
rg -n "categoriaId|areaId|categoria|area" app/modulos/pos-transferencias components/pos-transferencias
```

Resultados relevantes: `TablaSugeridos` y filtros solo en `page.jsx` y `TablaSugeridos.jsx`; `FiltrosDeposito` no se usa en la pantalla de nueva transferencia para sugeridos. Naming consistente con `categoriaNombre` / `areaFisicaNombre` en API y filtro.
