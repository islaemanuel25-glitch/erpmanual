# Módulo: Turnos / Cajas

**Archivos principales:** `app/modulos/turnos/*`, `app/api/pos-ventas/turnos/*`,
`components/turnos/*`

## Descripción

Consulta de turnos de caja: listado, detalle, circuito del dinero y las dos
bandejas del relevo. Es donde se busca una caja que quedó a medio cerrar o un
cambio que nadie tomó — buscarlos en el POS obligaría a tener un turno abierto.

## Ubicación

- Listado: `app/modulos/turnos/page.jsx`
- Detalle: `app/modulos/turnos/[id]/page.jsx`
- Cambios pendientes: `app/modulos/turnos/cambios-pendientes/page.jsx`
- Cierres pendientes: `app/modulos/pos-ventas/cierres/page.jsx`
- Circuito: `components/turnos/CircuitoDelDinero.jsx`, `lib/caja/circuitoDinero.js`

## Los cuatro estados

El listado filtra por **Abiertas**, **Cierre en preparación**, **Cerradas**,
**Anuladas** y **Todas**. Los predicados viven en `lib/turnos/filtrosListado.js`
y son mutuamente excluyentes.

`cierre === null` **ya no alcanza** para decir que una caja está abierta: un
turno que tomó su corte de cierre también lo tiene en null y no vende. La fuente
única es `estadoDelTurno()` en `lib/caja/cierreRelevo.js`, y los endpoints
devuelven el estado ya resuelto en el campo `estado` para que ninguna pantalla lo
deduzca por su cuenta.

Un turno en preparación de cierre:

- no figura como operativo ni se cuenta entre las cajas abiertas;
- aparece bajo su propio filtro, con acceso a "Continuar cierre";
- no admite ventas, Caja +/−, retiros ni el cierre clásico.

## Detalle del turno

Secciones, en orden:

1. **Al abrir** — monto inicial, y si vino de un cambio anterior: turno origen
   con enlace, quién lo dejó, quién lo recibió, total declarado, total contado,
   diferencia, las dos columnas de denominaciones y el motivo de la diferencia.
2. **Durante el turno** — ventas en efectivo, ingresos manuales, retiros
   manuales y retiros de recaudación, cada uno de su fuente.
3. **Al cerrar** — hora del corte, efectivo esperado congelado, contado,
   diferencia y retiro final.
4. **Cambio para el turno siguiente** — importe, denominaciones, estado del sobre
   y enlace al turno destino.
5. **Resultado del circuito** — cuánto salió del local, cuánto se transfirió, y
   las igualdades que prueban que nada se contó dos veces.

No se mezclan **retiro final**, **cambio dejado** y **apertura del siguiente
turno**: son tres cosas distintas y viven en bloques separados.

## El circuito del dinero

Los retiros de recaudación y el retiro final **salieron del local**. El cambio
dejado **no**: se quedó en el cajón. Sumarlo a "dinero retirado" inflaría la
recaudación por plata que nunca se fue, y contarlo otra vez como ingreso del
turno siguiente la duplicaría.

`verificarCircuito()` comprueba dos igualdades y las muestra en pantalla:

    esperado = inicial + ventas efectivo + ingresos − retiros
    contado  = retiro final + cambio dejado

Si alguna no se cumple, la tarjeta lo dice en vez de mostrar el total como si
diera.

El detalle completo del circuito, las fuentes por concepto y el ejemplo numérico
están en [caja-relevo.md](./caja-relevo.md).

## Compatibilidad con turnos históricos

Los turnos anteriores al circuito no registran retiro ni fondo: se muestran con
"—" y la sección se reemplaza por una explicación, en vez de inventar ceros.
`null` y `0` no significan lo mismo y no se muestran igual.

Los turnos que usaron la cadena vieja de fondo (`fondoOrigenTurnoId` y compañía,
hoy desactivada) se siguen leyendo con esos campos. El componente lee primero el
relevo real y cae a los campos viejos solo si no hay.
