# Empleados

Desde 2026-10-15. Regla de Emanuel.

## Operador y empleado

- **Operador**: quien maneja la caja; entra al POS con PIN (`OperadorLocal`).
- **Empleado**: quien trabaja en el local (`Empleado`, con sus locales en
  `EmpleadoEnLocal`).
- Todo operador es empleado: `Empleado.operadorId` lo asocia, único. No todo
  empleado es operador: cocina, reparto [CÓDIGO: `prisma/schema.prisma`].
- Un operador nuevo nace con su empleado —mismo nombre y locales— en la misma
  transacción [CÓDIGO: `app/api/operador/crear/route.js`] [VERIFICADO:
  `scripts/pruebas-db/empleados.mjs`, sección B].

## Quién elige de dónde

- "Sueldo" y "Consumo del personal" eligen SIEMPRE de los empleados activos del
  local, con una sola consulta para la lista y para lo que se acepta
  (`empleadosDelLocal`, `empleadoActivoDelLocal` en
  `lib/empleados/empleadosServer.js`) [CÓDIGO]. Un empleado sin operador cobra
  su sueldo y registra su consumo; uno desactivado deja de ofrecerse y de
  aceptarse [VERIFICADO: `empleados.mjs` B y `consumoPersonal.mjs` 1 y 5].
- El gasto de un sueldo o de un consumo guarda su `empleadoId`. El consumo
  también guarda el `operadorId` del empleado si lo tiene, para que una vuelta
  atrás del código no lo encuentre vacío [CÓDIGO].

## La pantalla

- Administración → Empleados, al lado de Operadores, con el mismo permiso
  (`config_local.operadores`) y el mismo alcance: un no-admin ve y asigna solo
  su local [CÓDIGO: `app/modulos/empleados/page.jsx`, `app/api/empleados/*`].
- Lista, alta, editar, activar/desactivar, y asociar o desasociar su operador
  (solo uno libre de su alcance) [CÓDIGO].

## La migración `20261015154425_empleados`

- Estructura aditiva y un relleno de datos en la misma migración, idempotente:
  un empleado por operador con sus locales, y el `empleadoId` de consumos, sus
  gastos y los sueldos (por el beneficiario, que es el nombre del operador, en
  un local donde trabaja) [VERIFICADO: `empleados.mjs` A, con datos de antes;
  contraprueba EM-1].
- Un sueldo cuyo beneficiario no es un operador queda sin empleado: no se
  adivina [VERIFICADO: `empleados.mjs` A].
- La reposición está en `scripts/deploy/reposicion-empleados.sql` [CÓDIGO].
