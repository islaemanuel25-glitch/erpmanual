# Incidentes

Qué salió mal en producción y qué se aprendió. **Solo lo que tiene evidencia en el
repo**: un commit, una migración, un documento. Un incidente reconstruido de
memoria no es un incidente documentado, es un relato.

## Formato

```
INC-XXXX — Título

Estado:      Cerrado | Abierto | Mitigado
Cuándo:      fecha, con la precisión que la evidencia permita
Qué pasó:    los hechos
Detección:   cómo se enteró alguien
Resolución:  qué se hizo
Lección:     qué cambió para que no vuelva a pasar
Evidencia:   commit, archivo, documento
Sin verificar: lo que se cree pero no se puede sostener con el repo
```

El campo **"Sin verificar"** es obligatorio cuando existe. Es la diferencia entre
un incidente y una anécdota.

## Índice

| ID | Título | Estado |
|---|---|---|
| [INC-0001](INC-0001-react2shell.md) | React2Shell — RCE crítica en Next.js | Cerrado |
| [INC-0002](INC-0002-bitacora-incompleta.md) | La bitácora anterior al 2026-08-09 está incompleta | Mitigado |
| [INC-0003](INC-0003-stock-negativo.md) | Stock negativo grande y silencioso | **ABIERTO** |
| [INC-0004](INC-0004-mauro-no-es-una-factura.md) | El comprobante de Mauro no es una factura | Cerrado |
| [INC-0005](INC-0005-caidas-por-despliegue.md) | El sitio se cayó dos veces en una jornada de 15 despliegues | **ABIERTO** |
| [INC-0006](INC-0006-editar-proveedor-500.md) | Editar un proveedor devuelve 500 desde el 2026-07-26 | Arreglado, sin desplegar |

## Incidentes que existen pero no se documentaron acá

Se encontró evidencia de que ocurrieron, pero no la suficiente para escribirlos
sin inventar:

- **Un vínculo de código viejo metía productos ajenos en la conciliación.** Es el
  caso que originó `productoDelProveedorWhere` (mira `proveedor_id` y
  `proveedor2_id`, no los vínculos de código). Citado en `CLAUDE.md` §1 como
  justificación de la regla, pero sin commit aislado que lo muestre.
- **Una fila en `ERROR` desaparecía de la lista**, dejando un problema que nadie
  podía resolver porque nadie lo veía. Lo encontró un candado en rojo. Citado en
  `CLAUDE.md` §5.
- **`scripts/generador/fix-admin-role.js` fue invisible en tres auditorías
  seguidas** por estar en un subdirectorio. Citado en `CLAUDE.md` §10.

Los tres están en `CLAUDE.md` sosteniendo una regla permanente, que es donde
mejor sirven. Se listan acá para que quien busque incidentes sepa que existen.
