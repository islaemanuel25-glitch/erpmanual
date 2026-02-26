# Auditoría SunmiSelectAdv — filtros categoría/área en TablaSugeridos

## 1) ¿Se ejecuta el handler?

En `TablaSugeridos.jsx` se añadieron logs **siempre** en ambos selects:

- Categoría: `console.log("[TablaSugeridos] onChange categoria raw:", v, "typeof:", typeof v);` antes de `onChangeCategoria?.(v)`.
- Área: `console.log("[TablaSugeridos] onChange área raw:", v, "typeof:", typeof v);` antes de `onChangeArea?.(v)`.

**Prueba:** Elegir una categoría/área distinta de "Todas".  
- Si **aparece el log** → el select sí dispara `onChange`; el fallo puede ser estado en page o comparación de valor.  
- Si **no aparece** → el select no está llamando `onChange` (p. ej. solo `onMouseDown` en dispositivo táctil).

---

## 2) Evidencia en SunmiSelectAdv.jsx

### Props que usa

Solo usa estas props (no hay `onValueChange`, `defaultValue`, `selectedValue`):

```13:19:components/sunmi/SunmiSelectAdv.jsx
export default function SunmiSelectAdv({
  value,
  onChange,
  children,
  placeholder = "Seleccionar...",
  className = "",
  multiple = false,
}) {
```

- **value:** valor controlado (string o array si `multiple`).
- **onChange:** callback al elegir opción; lo llama con el valor de la opción.

### Cómo obtiene las opciones

Opciones = hijos válidos; el valor de cada opción viene de `child.props.value`:

```29:29:components/sunmi/SunmiSelectAdv.jsx
  const optionList = Children.toArray(children).filter((c) => isValidElement(c));
```

```133:135:components/sunmi/SunmiSelectAdv.jsx
      {optionList.map((child, idx) => {
        const val = child.props.value;
        const selected = isSelected(val);
```

Estructura esperada: cada hijo debe ser un elemento con `props.value` (y `props.children` para el texto).  
`SunmiSelectOption` cumple eso:

```193:195:components/sunmi/SunmiSelectAdv.jsx
export function SunmiSelectOption({ value, children }) {
  return <div value={value}>{children}</div>;
}
```

### Qué pasa al seleccionar

El handler interno es `handlePick(val)` con `val = child.props.value`. Se dispara con **onMouseDown** (no `onClick`):

```139:144:components/sunmi/SunmiSelectAdv.jsx
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handlePick(val);
            }}
```

```45:58:components/sunmi/SunmiSelectAdv.jsx
  const handlePick = (val) => {
    if (!multiple) {
      onChange(val);
      setOpen(false);
      return;
    }
    ...
    onChange(newArr);
  };
```

Conclusión: al elegir una opción se llama `onChange(val)` con `val` = string (o número si se pasó así) del `value` de esa opción. No se pasa evento ni objeto con otra forma.

---

## 3) Conclusión y fix mínimo

- **TablaSugeridos** está bien conectado: usa `value` y `onChange`, que son los que SunmiSelectAdv usa.
- No hace falta cambiar nombre de props en TablaSugeridos (no existe `onValueChange` ni otra API).

Si los logs **no** aparecen al elegir otra opción, la causa probable es que **solo se usa `onMouseDown`**: en muchos dispositivos táctiles el primer tap no dispara `mousedown` o se pierde. En ese caso el fix mínimo es en **SunmiSelectAdv.jsx**: añadir también `onClick` (o `onPointerDown`) en la fila de la opción para que la selección se dispare también por touch/tap. No hay cambio necesario en TablaSugeridos para eso.

Si los logs **sí** aparecen pero el select no cambia visualmente o no filtra, el fallo está en el estado/padre (page.jsx): valor recibido, `normalizarValorFiltro` o comparación con `__ALL__`.

---

## 4) Fix aplicado en SunmiSelectAdv

Se añadió **onClick** además de **onMouseDown** en la opción del dropdown para que la selección se dispare también en dispositivos táctiles (donde a veces no se dispara `mousedown`). Así tanto mouse como touch llaman a `handlePick(val)` y por tanto a `onChange`.
