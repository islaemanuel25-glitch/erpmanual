# Reporte: Patrón select que funciona vs TablaSugeridos

## 1) Ejemplo bueno elegido

**Archivo:** `components/productos/FiltrosProductos.jsx`  
Filtros de Categoría, Proveedor, Área física y Estado que funcionan en el módulo Productos.

---

## 2) Patrón exacto del ejemplo bueno (FiltrosProductos)

### Estado (interno al componente)

```12:16:components/productos/FiltrosProductos.jsx
  const [search, setSearch] = useState(initial.search || "");
  const [categoria, setCategoria] = useState(initial.categoria || "");
  const [proveedor, setProveedor] = useState(initial.proveedor || "");
  const [area, setArea] = useState(initial.area || "");
  const [activo, setActivo] = useState(initial.activo ?? "");
```

### JSX del select (Categoría) – componente y props

```81:92:components/productos/FiltrosProductos.jsx
            <SunmiSelectAdv
              value={categoria}
              onChange={setCategoria}
              placeholder="Categoría..."
            >
              <SunmiSelectOption value="">Categoría...</SunmiSelectOption>
              {catalogos.CATEGORIAS?.map((c) => (
                <SunmiSelectOption key={c.id} value={String(c.id)}>
                  {c.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
```

### JSX del select (Área)

```110:120:components/productos/FiltrosProductos.jsx
            <SunmiSelectAdv
              value={area}
              onChange={setArea}
              placeholder="Área física..."
            >
              <SunmiSelectOption value="">Área física...</SunmiSelectOption>
              {catalogos.AREAS?.map((a) => (
                <SunmiSelectOption key={a.id} value={String(a.id)}>
                  {a.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
```

### Respuestas concretas

| Pregunta | Respuesta |
|----------|-----------|
| ¿value o selected o defaultValue? | **value** (controlado). |
| ¿Callback: onChange, onValueChange, onSelect? | **onChange**. |
| ¿Options? | **SunmiSelectOption** con `value` string ("" para “todos”, `String(id)` para ítems). |
| ¿Cómo maneja onChange? | **Setter directo:** `onChange={setCategoria}`. El select llama `onChange(val)` con el `value` de la opción. |

Resumen: mismo componente (`SunmiSelectAdv`), props `value` + `onChange` + `placeholder`, opciones como hijos `<SunmiSelectOption value="...">`, y **onChange = setter directo** (sin wrapper).

---

## 3) Comparación con TablaSugeridos

| Aspecto | FiltrosProductos (bueno) | TablaSugeridos (actual) |
|---------|---------------------------|--------------------------|
| Componente | SunmiSelectAdv | SunmiSelectAdv ✓ |
| value | value={categoria} | value={categoriaSeleccionada} ✓ |
| onChange | **onChange={setCategoria}** (referencia directa) | **onChange={(v) => { console.log(...); onChangeCategoria?.(v) }}** (wrapper) |
| placeholder | placeholder="Categoría..." | No tiene |
| Opción “todos” | value="" | value="__ALL__" (sentinel, OK) |
| Opciones | value={String(c.id)}, key={c.id} | value={c} (nombre), key={c} ✓ |

Diferencias relevantes:

1. **onChange:** en el ejemplo bueno se pasa el setter directo; en TablaSugeridos se pasa un wrapper (log + llamada a `onChangeCategoria?.(v)`). Replicar el patrón = pasar el callback directo y, si se quiere debug, usar un flag.
2. **placeholder:** el ejemplo bueno usa `placeholder`; TablaSugeridos no. Añadirlo para igualar el patrón.

---

## 4) Fix mínimo aplicado

- **TablaSugeridos.jsx**
  - Pasar **onChange** como callback directo: `onChange={onChangeCategoria}` y `onChange={onChangeArea}` (sin wrapper en el path normal).
  - Añadir **placeholder**: `placeholder="Categoría..."` y `placeholder="Área..."`.
  - Logs opcionales detrás de un flag (ej. `DEBUG_FILTROS_SUGERIDOS`) para no alterar el patrón en producción.

- **page.jsx**
  - Sin cambios de estructura: sigue pasando `onChangeCategoria` / `onChangeArea` que normalizan y hacen `setCategoriaFiltro` / `setAreaFiltro` + `setSugPage(1)`.

---

## 5) Diff mínimo aplicado

**TablaSugeridos.jsx**

- Mismo componente: `SunmiSelectAdv` (sin cambio).
- **Props alineadas con FiltrosProductos:** `value`, `onChange`, `placeholder`.
- `onChange`: se pasa un wrapper mínimo que solo reenvía al padre (`onChangeCategoria` / `onChangeArea`); opcionalmente loguea si `DEBUG_FILTROS_SUGERIDOS === true`.
- Añadido `placeholder="Categoría..."` y `placeholder="Área..."`.
- Añadido `const DEBUG_FILTROS_SUGERIDOS = false` para logs de prueba.

**page.jsx**

- Sin cambios: sigue pasando `onChangeCategoria` / `onChangeArea` (normalizar + setCategoriaFiltro/setAreaFiltro + setSugPage(1)).

---

## 6) Prueba final (logs / DEBUG)

- En **TablaSugeridos:** poner `DEBUG_FILTROS_SUGERIDOS = true` para ver en consola `[TablaSugeridos] categoria raw:` / `área raw:` y `typeof`.
- En **page.jsx** (si aplica): usar `DEBUG_FILTROS = true` para ver valor normalizado y longitud de filtrados.

Comprobar:

1. El texto visible del select cambia al elegir otra categoría/área.
2. `categoriaFiltro` / `areaFiltro` en el padre tienen el valor elegido (normalizado).
3. `sugeridosFiltrados.length` cambia según el filtro.

**Resultado de prueba (a rellenar tras probar):**

- ¿Cambia el texto del select? …
- ¿Los logs muestran `v` y tipo correctos? …
- ¿Baja el conteo al filtrar? …
