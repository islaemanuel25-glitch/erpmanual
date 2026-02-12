# Componentes Sunmi (Design System)

Todos los componentes estan en `/components/sunmi/`. Usan `"use client"` y acceden al tema via `useSunmiTheme()`.

## Theming

El tema se gestiona con `SunmiThemeProvider` que lee/guarda en localStorage (`erp-sunmi-theme`). Los temas se definen en `lib/sunmiThemes.js`.

```javascript
const { themeKey, theme, setThemeKey } = useSunmiTheme();
```

Colores principales: **amber-400** (primario), **cyan-500** (secundario), **slate** (neutros).

---

## Componentes de Layout

### SunmiCard
Contenedor principal con bordes redondeados y sombra.
```jsx
<SunmiCard className="extra-class">
  {children}
</SunmiCard>
```
Props: `children`, `className?`

### SunmiCardHeader
Header de tarjeta con titulo y acciones.
```jsx
<SunmiCardHeader title="Productos">
  <SunmiButton>Accion</SunmiButton>
</SunmiCardHeader>
```
Props: `title`, `children?`

### SunmiPanel
Contenedor con rounded-2xl y padding opcional.
```jsx
<SunmiPanel noPadding>{children}</SunmiPanel>
```
Props: `children`, `className?`, `noPadding?`

### SunmiRow
Layout de 3 columnas (left, center, right).
```jsx
<SunmiRow
  left={<span>Label</span>}
  center={<span>Medio</span>}
  right={<SunmiButton>OK</SunmiButton>}
  align="center"
/>
```
Props: `left`, `right?`, `center?`, `align?` ("start"|"center"|"end"), `className?`

### SunmiGrid
Grid responsivo con auto-fill.
```jsx
<SunmiGrid minWidth={260} gap={16}>
  {cards}
</SunmiGrid>
```
Props: `children`, `className?`, `minWidth?` (260), `gap?` (16)

### SunmiSection
Seccion con titulo, descripcion y separador.
```jsx
<SunmiSection title="Datos" description="Completa los campos">
  {fields}
</SunmiSection>
```
Props: `title`, `description?`, `children`, `footer?`, `noSeparator?`, `className?`

### SunmiSeparator
Linea horizontal con label opcional.
```jsx
<SunmiSeparator label="Paso 1" className="!my-0" />
```
Props: `label?`, `className?`

### SunmiHeader
Header con gradiente para secciones.
```jsx
<SunmiHeader title="STOCK" color="amber" />
```
Props: `title`, `color?` ("amber"|"cyan"), `children?`

### SunmiModalLayout
Modal full-screen con scroll.
```jsx
<SunmiModalLayout open={true} title="Editar" onClose={close} footer={<SunmiButton>Guardar</SunmiButton>}>
  {content}
</SunmiModalLayout>
```
Props: `open`, `title`, `subtitle?`, `color?`, `onClose`, `children`, `footer?`, `maxWidth?`, `showCloseButton?`

---

## Componentes de Formulario

### SunmiButton
Boton con 3 variantes de color.
```jsx
<SunmiButton color="amber" onClick={fn} disabled={loading}>
  Guardar
</SunmiButton>
```
Props: `color?` ("amber"|"red"|"cyan"), `children`, `...htmlButtonProps`

### SunmiButtonIcon
Boton de icono compacto.
```jsx
<SunmiButtonIcon icon={Pencil} color="amber" size={16} onClick={fn} />
```
Props: `icon` (componente Lucide), `color?` ("amber"|"red"|"slate"), `size?` (16), `onClick?`

### SunmiInput
Input de texto con estilos del tema.
```jsx
<SunmiInput type="number" step="0.01" value={val} onChange={fn} placeholder="Ej: 10" />
```
Props: `className?`, `...htmlInputProps`

### SunmiSelect
Select con chevron custom.
```jsx
<SunmiSelect value={sel} onChange={fn} disabled={loading}>
  <option value="">Seleccionar</option>
  {items.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
</SunmiSelect>
```
Props: `className?`, `children`, `...htmlSelectProps`

### SunmiSelectAdv
Select avanzado con multi-select y dropdown custom.
```jsx
<SunmiSelectAdv value={selected} onChange={fn} multiple placeholder="Elegir...">
  <SunmiSelectOption value="a">Opcion A</SunmiSelectOption>
</SunmiSelectAdv>
```
Props: `value`, `onChange`, `children`, `placeholder?`, `className?`, `multiple?`

### SunmiToggle
Toggle switch con label.
```jsx
<SunmiToggle value={activo} onChange={setActivo} label="Habilitado" />
```
Props: `value?`, `onChange?`, `label?`

### SunmiToggleEstado
Toggle de estado activo/inactivo.
```jsx
<SunmiToggleEstado value={activo} onChange={fn} />
```
Props: `value?`, `onChange?`

---

## Componentes de Tabla

### SunmiTable
Tabla con headers fijos y scroll horizontal.
```jsx
<SunmiTable headers={["Nombre", "Precio", "Stock"]}>
  <tr className="bg-slate-950 hover:bg-slate-900">
    <td className="px-2 py-1.5">Coca Cola</td>
    <td className="px-2 py-1.5 text-right">$ 1.500,00</td>
    <td className="px-2 py-1.5 text-right">42</td>
  </tr>
</SunmiTable>
```
Props: `headers` (string[]), `children` (tr elements)

### SunmiTableMaster
Tabla completa con paginacion y acciones.
```jsx
<SunmiTableMaster
  columns={[{id: "nombre", label: "Nombre"}]}
  rows={data}
  actions={[{icon: "edit", onClick: fn}]}
  page={1} totalPages={5}
  onPrev={fn} onNext={fn}
  loading={false}
/>
```
Props: `columns`, `rows`, `actions?`, `page`, `totalPages`, `onPrev`, `onNext`, `pageSize?`, `pageSizeOptions?`, `onChangePageSize?`, `loading?`, `emptyMessage?`

### SunmiTableRow
Fila con hover y seleccion.
```jsx
<SunmiTableRow selected={active} onClick={fn}>
  <td>...</td>
</SunmiTableRow>
```
Props: `children`, `selected?`, `onClick?`

### SunmiTableEmpty
Estado vacio para tablas.
```jsx
<SunmiTableEmpty message="No hay productos" colSpan={6} />
```
Props: `message?`, `colSpan?`

---

## Componentes de Display

### SunmiBadge
Badge/etiqueta inline (importar de SunmiBadge.jsx).

### SunmiBadgeEstado
Badge de estado activo/inactivo.
```jsx
<SunmiBadgeEstado value={true} />  // → "Activo" (verde)
<SunmiBadgeEstado value={false} /> // → "Inactivo" (rojo)
```
Props: `estado` o `value` (boolean/string)

### SunmiEstadoCell
Celda centrada con badge de estado (wrapper de SunmiBadgeEstado).
```jsx
<SunmiEstadoCell value={row.activo} />
```
Props: `value`

### SunmiPill
Pill/badge compacto.
```jsx
<SunmiPill>NUEVO</SunmiPill>
```
Props: `children`

### SunmiUserCell
Celda de usuario con avatar y email.
```jsx
<SunmiUserCell nombre="Juan" email="juan@mail.com" />
```
Props: `nombre?`, `email?`

### SunmiLoader
Spinner de carga.
```jsx
<SunmiLoader size={20} />
```
Props: `size?` (20)

---

## Componentes de Lista

### SunmiList
Contenedor de lista con divisores.
```jsx
<SunmiList>{items}</SunmiList>
```
Props: `children`, `className?`

### SunmiListItem
Item de lista con icono y accion.
```jsx
<SunmiListItem label="Producto" description="Categoria X" left={<Icon />} right={<Button />} clickable onClick={fn} />
```
Props: `label`, `description?`, `left?`, `right?`, `onClick?`, `clickable?`, `className?`

### SunmiListCard / SunmiListCardItem / SunmiListCardRemove
Lista tipo card con items removibles.
```jsx
<SunmiListCard>
  <SunmiListCardItem>
    <span>Item 1</span>
    <SunmiListCardRemove onClick={fn} />
  </SunmiListCardItem>
</SunmiListCard>
```

### SunmiEntityCard
Card de entidad con titulo, subtitulo, icono y acciones.
```jsx
<SunmiEntityCard title="Grupo Norte" subtitle="3 locales" icon={<Icon />} actions={<Button />}>
  {content}
</SunmiEntityCard>
```
Props: `title`, `subtitle?`, `color?`, `icon?`, `actions?`, `children`, `className?`

---

## Wrapper

### ThemeClientWrapper
Envuelve toda la app con el provider de tema. Se usa en `app/layout.jsx`.
```jsx
<ThemeClientWrapper>
  <UserProvider>{children}</UserProvider>
</ThemeClientWrapper>
```

## Convenciones de UI

- Tipografia: 10.5px, 11px, 12px, 13px, 15px
- Spacing: p-2, p-3, gap-2, gap-3
- Bordes: rounded-md (inputs), rounded-xl (cards), rounded-2xl (panels)
- Focus: border-amber-400
- Disabled: opacity reducida
- Dark mode por defecto (fondo slate-900/950)
