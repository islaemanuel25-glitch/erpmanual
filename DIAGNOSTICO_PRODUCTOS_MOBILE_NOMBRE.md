# Diagnóstico: nombres no visibles en vista Productos (mobile)

**Ruta:** `/modulos/productos`  
**Síntoma:** En móvil la tabla muestra columnas (Código, Categoría, Proveedor, etc.) pero "Nombre" no se ve o no aparece. En desktop se ve bien.

---

## 1. Dónde se define el array de columnas/headers

| Archivo | Líneas | Qué hace |
|---------|--------|----------|
| `app/modulos/productos/page.jsx` | **72-90** | Define `allColumns`: array de `{ key, label }`. Incluye `{ key: "nombre", label: "Nombre" }` (línea 74). Orden: imagenUrl, **nombre**, codigoBarra, sku, categoriaId, proveedorId, … |
| `app/modulos/productos/page.jsx` | **614-616** | Pasa a `SunmiTablaProductos` la prop `columns={allColumns.filter((c) => c.key === "nombre" ? true : visibleCols.includes(c.key))}`. La columna "nombre" **siempre** se incluye. |
| `components/productos/SunmiTablaProductos.jsx` | **56-172** | Objeto `DEFINICIONES`: por cada `key` define `titulo`, `thClass`, `tdClass`, `titleKey`, `render`. Aquí se define cómo se ve cada columna en la tabla. |
| `components/productos/SunmiTablaProductos.jsx` | **174-186** | `columnas = columns.map(...).filter(Boolean)`: convierte el `columns` de la page en la lista interna usando `DEFINICIONES`. |
| `components/productos/SunmiTablaProductos.jsx` | **188-215** | `headers`: array de `{ label, className }` para el `<thead>`. `className` sale de `c.thClass || ""`. |
| `components/sunmi/SunmiTable.jsx` | **9-15, 20-30** | Tabla con `table-fixed` y `overflow-x-auto`. Renderiza `<th className={... extra}>` con el `className` de cada header. |

---

## 2. Lógica responsive (columnas mobile/desktop)

- **No hay** `columnasMobile` / `columnasDesktop`, ni `useMediaQuery` / `innerWidth` / `isMobile` en `app/modulos/productos` ni en `components/productos/SunmiTablaProductos.jsx`.
- **No hay** clases Tailwind `hidden` / `sm:table-cell` etc. en celdas o headers de esta tabla.
- Las mismas columnas (y el mismo orden) se usan en todos los viewports.

---

## 3. Estado de la columna "nombre"

- **a) ¿Omitida en mobile?** **No.** Siempre se incluye en `columns` (page 614-615) y no se filtra por viewport.
- **b) ¿Renderizada pero oculta por CSS?** **Sí, de hecho.** La columna se renderiza (hay `<th>` y `<td>` para "Nombre"), pero en móvil el **ancho efectivo** de esa columna puede ser **0 o casi 0** (véase punto 4).
- **c) ¿Campo equivocado?** **No.** Se usa `titleKey: "nombre"` y la celda muestra `row[c.key]` (es decir `row.nombre`) o el resultado de `render` si existiera; para "nombre" no hay `render`, se muestra el valor directo (líneas 226-234).

---

## 4. Snippets relevantes

### Donde se arma la lista de columnas (page)

```72:90:app/modulos/productos/page.jsx
  const allColumns = [
    { key: "imagenUrl", label: "Imagen" },
    { key: "nombre", label: "Nombre" },
    { key: "codigoBarra", label: "Código barra" },
    ...
  ];
```

### Donde se filtran para la tabla (nombre siempre incluido)

```614:616:app/modulos/productos/page.jsx
                    columns={allColumns.filter((c) =>
                      c.key === "nombre" ? true : visibleCols.includes(c.key)
                    )}
```

### Donde se define la columna "nombre" en la tabla (sin ancho)

```76:78:components/productos/SunmiTablaProductos.jsx
    nombre: { titulo: "Nombre", tdClass: "whitespace-normal break-words line-clamp-2 overflow-hidden leading-tight", titleKey: "nombre" },
```

Aquí **no hay `thClass`**; las demás columnas sí tienen `thClass` (p. ej. `w-[140px]`, `w-[90px]`).

### Donde el header recibe el ancho (nombre queda con clase vacía)

```211:213:components/productos/SunmiTablaProductos.jsx
      // Siempre devolver { label, className } para que SunmiTable renderice el encabezado (si no hay thClass, h.label era undefined)
      return { label, className: c.thClass || "" };
    }),
```

Para "nombre", `c.thClass` es `undefined`, así que `className: ""` para ese `<th>`.

### Donde se renderiza la celda de "nombre"

```226:234:components/productos/SunmiTablaProductos.jsx
              {columnas.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 py-1.5 text-[12px] ${c.tdClass || "whitespace-nowrap"}`}
                  title={c.titleKey ? String(row[c.titleKey] ?? "") : undefined}
                >
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "-"}
                </td>
              ))}
```

Para "nombre", no hay `render`, se muestra `row.nombre ?? "-"`. La celda tiene `tdClass`: `whitespace-normal break-words line-clamp-2 overflow-hidden leading-tight`.

### Tabla con table-fixed (contexto donde colapsa la columna sin ancho)

```9:15:components/sunmi/SunmiTable.jsx
    <div className="overflow-x-auto">
      <table
        className="
          w-full 
          text-[12px]              /* más compacto */
          table-fixed
        "
      >
```

Con `table-fixed`, el ancho de cada columna viene de la primera fila de celdas o del header. Si un `<th>` no tiene ancho (clase vacía), en tablas con muchas columnas de ancho fijo el navegador puede asignar a esa columna ancho **0 o mínimo**, sobre todo cuando el contenedor es estrecho y hay `overflow-x-auto`; la columna "Nombre" queda entonces sin espacio y el texto no se ve (o se recorta por `overflow-hidden`).

---

## 5. Archivos y líneas relevantes

| Archivo | Líneas | Rol |
|---------|--------|-----|
| `app/modulos/productos/page.jsx` | 72-90 | Definición de `allColumns` (incluye "nombre"). |
| `app/modulos/productos/page.jsx` | 93-94, 101-102, 110-112 | `LOCKED_COLS = ["nombre"]` y lógica que fuerza "nombre" visible. |
| `app/modulos/productos/page.jsx` | 614-616 | `columns` pasado a SunmiTablaProductos; "nombre" siempre incluido. |
| `components/productos/SunmiTablaProductos.jsx` | 76-78 | Definición de la columna "nombre": **sin `thClass`**. |
| `components/productos/SunmiTablaProductos.jsx` | 174-186 | Construcción de `columnas` desde `columns` + `DEFINICIONES`. |
| `components/productos/SunmiTablaProductos.jsx` | 189-212 | Construcción de `headers`; `className: c.thClass || ""` → "nombre" con `""`. |
| `components/productos/SunmiTablaProductos.jsx` | 226-234 | Render de cada `<td>`; para "nombre" se muestra `row.nombre ?? "-"`. |
| `components/sunmi/SunmiTable.jsx` | 9-15 | Contenedor `overflow-x-auto` y tabla `table-fixed`. |
| `components/sunmi/SunmiTable.jsx` | 24-27 | `<th className={... extra}>`; para "nombre" `extra` es `""`. |

---

## 6. Root cause (1 frase)

La columna "Nombre" es la **única** sin `thClass` (sin ancho) en `DEFINICIONES` de SunmiTablaProductos; con `table-fixed` en SunmiTable, el navegador le asigna ancho efectivo **0 o mínimo** en viewports estrechos, por lo que el texto no se ve (o queda recortado por `overflow-hidden`).

---

## 7. Fix mínimo sugerido (sin implementar)

- En `components/productos/SunmiTablaProductos.jsx`, en la definición de la columna `nombre` (línea 76), añadir un **`thClass`** con ancho mínimo (por ejemplo `min-w-[100px]` o `min-w-[120px]`) para que la columna no colapse en móvil.
- Opcional: en la misma columna, revisar si en móvil conviene dar algo de ancho fijo (p. ej. `w-[120px]`) además del `min-w` para que "Nombre" sea siempre legible sin romper el layout en desktop.

No modificar lógica de columnas ni de filtrado; solo añadir ancho mínimo (y opcionalmente ancho) a la columna "nombre" en SunmiTablaProductos.
