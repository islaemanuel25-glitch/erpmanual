# Changelog

## [2025-02-13] - Estandarizacion UI Sunmi

### Agregado
- docs/INCONSISTENCIAS-SUNMI.md - Auditoria completa de 71 problemas
- docs/05-GUIA-ESTILOS-UI.md - Guia oficial de estilos
- SunmiToast para feedback (reemplaza alert)
- color='slate' en SunmiButton

### Modificado
- 13 `<select>` nativos reemplazados por SunmiSelect
- 19 `<input>` nativos reemplazados por SunmiInput
- 40+ archivos: colores hardcodeados migrados al sistema de themes
- Props invalidos eliminados (variant, size, color en separator)
- Labels estandarizados: `text-[11px] text-slate-400 mb-1 block`
- Responsive mejorado en stock y POS transferencias

### Corregido
- `titulo` por `title` en SunmiCardHeader
- `mensaje` por `message` en SunmiTableEmpty
- `border-slate-700` por `border-slate-800` en todo el proyecto
- `text-slate-100` hardcodeado eliminado (heredado del theme)
- `overflow-auto` por `overflow-x-auto` en wrappers de tablas
