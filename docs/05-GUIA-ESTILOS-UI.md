# Guia de Estilos UI - Sistema Sunmi

## Componentes base

### SunmiButton
Props VALIDOS:
- color: 'amber' | 'cyan' | 'red' | 'slate'
- disabled: boolean
- onClick: function

Props que NO EXISTEN (no usar):
- variant
- size

Ejemplo:
```jsx
<SunmiButton color='amber' onClick={handleClick}>
  Guardar
</SunmiButton>
```

### SunmiSelect
```jsx
<SunmiSelect value={x} onChange={fn}>
  <option value=''>Seleccionar...</option>
  <option value='1'>Opcion 1</option>
</SunmiSelect>
```

### SunmiInput
```jsx
<div>
  <label className='text-[11px] text-slate-400 mb-1 block'>Campo</label>
  <SunmiInput type='text' value={x} onChange={fn} />
</div>
```

### SunmiSeparator
Props VALIDOS:
- label: string
- className: string

Props que NO EXISTEN:
- color

```jsx
<SunmiSeparator label='Seccion' />
```

### SunmiTableEmpty
Props VALIDOS:
- message: string (NO "mensaje")
- colSpan: number

```jsx
<SunmiTableEmpty message='No hay resultados' colSpan={5} />
```

### SunmiCardHeader
Props VALIDOS:
- title: string (NO "titulo")

```jsx
<SunmiCardHeader title='Titulo de la seccion' />
```

## Sistema de themes

CORRECTO:
```jsx
<SunmiCard className='p-3'>
  {/* El card ya tiene bg y border del theme */}
</SunmiCard>
```

INCORRECTO:
```jsx
<div className='bg-slate-900 border-slate-700'>
  {/* Colores hardcodeados, no respeta theme */}
</div>
```

### Bordes estandar
- Usar `border-slate-800` (coincide con theme sunmiDark)
- NO usar `border-slate-700` ni `border-slate-600`

### Colores de texto
- Texto principal: heredado del theme (no hardcodear `text-slate-100`)
- Texto secundario: `text-slate-400`
- Texto terciario: `text-slate-300`

## Responsive

Filtros:
```jsx
<div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
  {/* 3 filtros */}
</div>
```

Acciones:
```jsx
<div className='flex flex-col sm:flex-row gap-2'>
  {/* Botones */}
</div>
```

Tablas:
```jsx
<div className='overflow-x-auto'>
  <table>...</table>
</div>
```

Paneles lado a lado:
```jsx
<div className='grid grid-cols-1 lg:grid-cols-2 gap-3'>
  {/* Panel izquierdo */}
  {/* Panel derecho */}
</div>
```

## Labels estandar

```jsx
<label className='text-[11px] text-slate-400 mb-1 block'>
  Nombre del campo
</label>
```

## Feedback

USAR:
```jsx
import { showSuccess, showError, showWarning, showInfo } from '@/components/sunmi/SunmiToast';

showSuccess('Operacion exitosa');
showError('Error al procesar');
showWarning('Stock bajo');
showInfo('Procesando...');
```

NO USAR:
```jsx
alert('Mensaje'); // Bloqueante, mala UX
```

## Spacing estandar

- Pagina: `p-2`
- Card: `p-3` (default en SunmiCard)
- Gap entre elementos: `gap-2` o `gap-3`
- Margenes entre secciones: `space-y-3`

## Breakpoints

| Breakpoint | Pixels | Uso |
|------------|--------|-----|
| sm | 640px | Botones en fila, layouts simples |
| md | 768px | Grids de filtros, formularios |
| lg | 1024px | Paneles lado a lado |
