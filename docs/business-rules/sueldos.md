# Sueldos

Qué es un sueldo en ERP Azul, de quién es y por dónde se paga. Regla de Emanuel
del 2026-10-19: Sueldos deja de ser un gasto común y pasa a ser una sección
propia de Finanzas.

## Qué es

- **Un sueldo sigue siendo un `Gasto` de la categoría Sueldos** [CÓDIGO]
  (`CATEGORIA_SUELDOS` en `lib/caja/tipoEgreso.js`). Por eso resta en la
  ganancia del turno y suma en el Resumen financiero exactamente como antes
  [VERIFICADO: `scripts/pruebas-db/sueldos.mjs` sección 4; contraprueba SU-3].
- **Es de un EMPLEADO del local** (`Gasto.empleadoId`), elegido de la misma
  lista que usa el POS (`empleadosDelLocal`), nunca un nombre escrito a mano. El
  beneficiario y el concepto ("Sueldo · Ana") los pone el servidor con el nombre
  del empleado [CÓDIGO] (`crearGasto`, `lib/finanzas/gastosServer.js`).
- **Dice qué fue**: `Gasto.modalidadSueldo` —SUELDO, ADELANTO, AGUINALDO o
  VACACIONES— [CÓDIGO] (migración `20261019200000_gasto_modalidad_sueldo`).

## La regla, una sola

- `crearGasto` exige, para TODO gasto de la categoría Sueldos, un empleado
  activo del local del gasto y una modalidad válida; si no, 400 —también para
  un empleado de otro local— [CÓDIGO] (`exigirEmpleadoDelSueldo`). Vale igual
  para "Pagar" del POS, para Finanzas → Sueldos y para Gastos [VERIFICADO:
  `sueldos.mjs` sección 1; contraprueba SU-1].
- Ni el POS ni la ruta de Sueldos validan el empleado por su cuenta: le pasan
  lo elegido a `crearGasto` [CÓDIGO] [VERIFICADO: candado
  `components/finanzas/sueldos/sueldos.test.mjs`].

## Dónde se ve

- **Finanzas → Sueldos** (`/modulos/finanzas/sueldos`), con `finanzas.ver`;
  pagar y asignar piden además `finanzas.gastos.registrar` [CÓDIGO]. Mira el
  local que se opera y nada más: empleados y pagos no se mezclan entre locales
  [VERIFICADO: `sueldos.mjs` sección 7].
- El período es el de `Gasto.fecha`, el mismo criterio del Resumen [CÓDIGO]
  (`leerSueldos`, `lib/finanzas/sueldosServer.js`).
- "Desde la caja" es un `PagoGasto` con turno; "Desde Finanzas", el resto
  [CÓDIGO] (`origenDelPago`, `lib/finanzas/sueldos.js`) [VERIFICADO: sección 2;
  contraprueba SU-6]. Los pagos del POS y los de Finanzas son el mismo historial
  por empleado.
- **Gastos ya no ofrece la categoría Sueldos ni lista sueldos**. El filtro va
  solo en `listarGastos`; `totalEconomicoDeGastos` no lo pide [VERIFICADO:
  sección 3; contraprueba SU-2]. Consecuencia conocida: el "Gastos" del Resumen
  incluye los sueldos y la lista a la que lleva "Ver gastos" no —es la regla
  pedida, no un descuadre—.

## Pagar y asignar

- Pagar desde Finanzas es `crearGasto` con el pago inicial por el total, con la
  clave de idempotencia del alta de gastos [CÓDIGO] (`POST /api/finanzas/sueldos`).
  Un sueldo se paga entero en el momento.
- **Los sueldos viejos sin empleado** —cargados en Gastos con un nombre a mano—
  aparecen en "Sin empleado asignado". "Asignar empleado" completa
  `empleadoId` y `modalidadSueldo` y nada más: ni montos, ni pagos, ni concepto,
  ni beneficiario, ni caja; un sueldo ya asignado no se reasigna (409) [CÓDIGO]
  (`asignarEmpleadoASueldo`) [VERIFICADO: sección 6; contraprueba SU-5].

## El relleno

- La migración rellena `modalidadSueldo` solo en los sueldos cuyo concepto
  empieza EXACTAMENTE con "Sueldo · " o "Adelanto · " —el formato que escribía
  el POS— y solo en la categoría Sueldos. Los conceptos libres quedan en null
  [VERIFICADO: sección 5; contraprueba SU-4].
