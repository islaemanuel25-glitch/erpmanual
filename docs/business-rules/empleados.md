# Empleados

Desde 2026-10-15. Regla de Emanuel.

## Operador y empleado

- **Operador**: quien maneja la caja; entra al POS con PIN (`OperadorLocal`).
- **Empleado**: quien trabaja en el local (`Empleado`).
- Todo operador es empleado: `Empleado.operadorId` lo asocia, único. No todo
  empleado es operador: cocina, reparto [CÓDIGO: `prisma/schema.prisma`].
- Un operador nuevo nace con su empleado —mismo nombre y mismo local— en la
  misma transacción. Si en el local ya hay un empleado con ese nombre y sin
  operador, es esa persona: se le asocia, no se crea otro [CÓDIGO:
  `app/api/operador/crear/route.js`, `crearEmpleadoDeOperador`] [VERIFICADO:
  `scripts/pruebas-db/operadoresPorLocal.mjs` C].

## Cada uno es de UN local (2026-10-15)

- Un operador y un empleado son del local que los contrata: `localId` en
  `OperadorLocal` y en `Empleado`. Si alguien trabaja en dos locales, se carga
  una vez en cada uno: dos registros [CÓDIGO].
- El nombre es único dentro del local, no en todo el sistema: dos locales
  pueden tener un "Juan" [CÓDIGO: `@@unique([localId, nombre])`]
  [VERIFICADO: `operadoresPorLocal.mjs` A y C].
- `OperadorEnLocal` y `EmpleadoEnLocal` quedan en la base, sin que el código
  las lea ni las escriba [CÓDIGO] [VERIFICADO: candado
  `lib/empleados/operadoresPorLocal.test.mjs`, con su contraprueba].

## Quién elige de dónde

- "Sueldo" y "Consumo del personal" eligen SIEMPRE de los empleados activos del
  local de la caja, con una sola condición para la lista y para lo que se
  acepta (`empleadosDelLocal`, `empleadoActivoDelLocal` en
  `lib/empleados/empleadosServer.js`) [CÓDIGO]. Uno de otro local se rechaza
  en el servidor, no solo en la pantalla: en Consumo con 403, en Sueldo con
  400 desde el 2026-10-19 —lo rechaza `crearGasto`, la regla única de
  sueldos, ver [sueldos.md](sueldos.md)— [VERIFICADO: `operadoresPorLocal.mjs`
  D; contraprueba OL-1].
- El gasto de un sueldo o de un consumo es del local de la caja, que es el del
  empleado, y guarda su `empleadoId` [VERIFICADO: `operadoresPorLocal.mjs` D].
- El login del POS, la lista de operadores de la caja y la validación del
  operador activo (`getOperadorActivoDelLocal`, que usan turnos, cierres,
  retiros y ventas) leen `OperadorLocal.localId` [CÓDIGO] [VERIFICADO: D;
  contraprueba OL-5].

## Las pantallas

- Administración → Operadores y Administración → Empleados, con el permiso
  `config_local.operadores`: lista, alta, edición y baja son las del local
  activo —el selector de arriba para un admin, el de su sesión para el resto—
  (`resolveLocalAndGrupo`). El alta crea en ese local y no se elige otro; un
  registro no se muda de local [CÓDIGO: `app/api/operador/*`,
  `app/api/empleados/*`] [VERIFICADO: `operadoresPorLocal.mjs` C; contrapruebas
  OL-3 y OL-4].

## Las migraciones

- `20261015154425_empleados`: un empleado por operador con sus locales, y el
  `empleadoId` de consumos, sus gastos y los sueldos [VERIFICADO:
  `empleados.mjs` A; contraprueba EM-1]. Reposición en
  `scripts/deploy/reposicion-empleados.sql`.
- `20261015232632_operadores_y_empleados_por_local`: el `localId` de cada uno
  desde su única fila de vínculo, con un freno que para la migración si alguno
  tiene más de una [VERIFICADO: `operadoresPorLocal.mjs` A y B, con los 6
  operadores y 6 empleados de producción; contraprueba OL-2]. Reposición en
  `scripts/deploy/reposicion-operadores-por-local.sql`.
