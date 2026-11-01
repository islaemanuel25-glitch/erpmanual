# Turnos y cierres

Módulo del 2026-10-12, en `/modulos/turnos-y-cierres`. Desde el 2026-11-01 es
el ÚNICO lugar de turnos, cajas, arqueos y cierres. Diseño: Figma
`EVJ2KvVCrY0oVSowfboymQ`, página "Turnos y cierres · móvil" (A2 364:577,
A3 364:674, B 359:523, C 359:605, D 359:2367).

## Lo que se borró el 2026-11-01

*(verificado en código)*

- Las pantallas viejas: `/modulos/turnos` (lista, ficha `[id]` y
  `cambios-pendientes`), Auditoría POS → Cajas y → Turnos (lista y `[id]`), y la
  ficha del turno de Finanzas (`/modulos/finanzas/local/[localId]/turno/[turnoId]`,
  con `components/finanzas/DetalleDeTurno.jsx`). Sin redirecciones: esas URL dan
  404.
- Lo que solo ellas usaban: `components/turnos/ArqueosDelTurno.jsx`,
  `CircuitoDelDinero.jsx` y `ResumenCierre.jsx`; `hooks/useAuditoriaCajas.js` y
  `useAuditoriaTurnos.js`; `lib/caja/circuitoDinero.js`; de
  `lib/caja/vistaTurno.js`, todo menos `resultadoCierre` (lo usa Azul Chat); de
  `lib/caja/cierreRelevo.js`, `turnoSinConteo`; de
  `lib/finanzas/contextoFinanzas.js`, `urlDelTurno`.
- Las rutas que solo ellas llamaban: `GET /api/finanzas/turno/[turnoId]`,
  `GET /api/pos-ventas/turnos/listar`, `GET /api/pos-ventas/turnos/ventas`,
  `GET /api/pos-ventas/caja-movimientos/listar` y, de Auditoría POS, `cajas`,
  `turnos`, `turnos/personas` y `turnos/sin-turno`.
- Desaparecen el ingreso y retiro manual desde la ficha del turno y la consulta
  de cambios pendientes. Se quedan, porque las usa el POS:
  `POST /api/pos-ventas/caja-movimientos/crear` (modal del POS) y
  `GET /api/pos-ventas/cambios-pendientes/listar` (aperturas). También se quedan
  `GET /api/pos-ventas/turnos/resumen` (cierre y retiro del POS), el comprobante
  Z compartido (`components/turnos/imprimirZReport.js`) y
  `lib/turnos/filtrosListado.js` (lo usa Finanzas → Gastos).
- Los enlaces que iban a lo borrado van al módulo: el "Ver el detalle" del
  cierre del POS y las filas de turno de la cuenta del local en Finanzas abren
  la caja (`/modulos/turnos-y-cierres/cajas/[id]`; el id de la caja es el del
  turno). En Finanzas la fila solo se puede tocar con la puerta de este módulo.
- Auditoría POS sigue con Balances, Productos y Correcciones.

## Dónde está cada cosa

- Lectura pura: `lib/turnosYCierres/lecturaTurnosYCierres.js`. Lector contra la
  base: `lecturaTurnosYCierresServer.js`. Quién ve qué: `alcance.js`. Textos y
  tonos: `pantallaTurnosYCierres.js`. *(verificado en código)*
- API: `GET /api/turnos-y-cierres` (lista o "mis cajas") y
  `GET /api/turnos-y-cierres/cajas/:id` (detalle y datos del Z). Solo leen.
  *(verificado en código)*
- Pantallas: `app/modulos/turnos-y-cierres/` y `components/turnos-y-cierres/`.
- Candados: `lib/turnosYCierres/turnosYCierres.test.mjs`, con
  `filasReales.fixture.json` sacado del lector real contra la base de una
  sesión de desarrollo. *(verificado en código)*

## De dónde sale cada número

- Tenía que haber: `calcularEfectivoEsperado` sobre todo menos el retiro de
  cierre (`paraElEsperado`). Diferencia: `calcularDiferencia` contra lo contado
  al cerrar; la guardada no se muestra, se compara (`coincideConGuardada`).
  *(verificado en código y ejercido)*
- Efectivo, digital y fiado: `desglosarVentas`; por medio, `desglosarPorMedio`.
  El fiado nunca suma como cobrado. *(verificado en código y ejercido)*
- Bruto, neto, ganancia y tickets: `resumirVentas`, la de Reportes → Ventas,
  sobre ventas comerciales (`whereVentaComercial`). *(verificado en código)*
- Grupos: `grupoDeTesoreria` + `compararGrupos`. Una caja con turno entra entera
  por su fecha operativa; una sin turno, por el día de su apertura; las
  anuladas no entran. *(verificado en código)*
- Ventas sin caja: la consulta que tenía `auditoria-pos-ventas/turnos/sin-turno`
  (ruta borrada el 2026-11-01) con el filtro de venta comercial, en
  `whereVentasSinCaja`. *(verificado en código y ejercido)*
- La diferencia de un turno no se netea: cada caja con diferencia va en su
  renglón del desglose —"Faltante de caja · Alexis", "Sobrante de caja ·
  Roxana"—, y el resultado resta los faltantes y suma los sobrantes (regla de
  Emanuel, 2026-10-17). La de cada arqueo es la acumulada guardada y no se
  suma. *(verificado en código)*
- Resultado del turno, desde 2026-10-17: ganancia de las ventas − sueldos y
  gastos − consumo del personal − faltantes de caja + sobrantes de caja. Lo
  de abajo es la historia. *(verificado en código y ejercido)*
- "Quién trabajó": una tarjetita por caja con cómo cerró y "Este mes: N faltas
  · N sobras" de esa persona —sus cajas cerradas del mes en curso, con la
  diferencia calculada (`historialDelMes`)—. Si hubo dos o más cajas abiertas a
  la vez, una pastilla con la franja (`cajasSuperpuestas`). *(verificado en
  código; consulta ejercida contra Postgres)*
- Mercado Pago QR y crédito: el tender guarda el tipo contable —QR es
  `MERCADOPAGO`, el crédito por Mercado Pago es `CREDITO`, ambos con procesador
  MERCADOPAGO—, así que van en renglones distintos. *(verificado en código)*
- Resultado del turno (desde 2026-10-13, Figma "V2 · A" 367:607): neto después
  de comisiones − costo de la mercadería − pagos desde la caja
  (`resultadoDelTurno`). Neto y costo de `resumirVentas`. Pagos desde la caja:
  todo RETIRO que no es recaudación (arqueo) ni cierre, por la clasificación
  canónica (`pagosDesdeCaja`); incluye los Caja − manuales. *(verificado en
  código y ejercido)*
- Comisión por medio: la de los tenders; si alguna venta del medio no tiene la
  comisión exacta (`comisionEsExacta`), se muestra "Comisión sin calcular" y no
  $0. *(verificado en código y ejercido)*

## Quién ve qué

**La puerta, desde 2026-10-24: `posventas.turnos.ver`.** Decisión de Emanuel:
el módulo lo ven solo DUEÑO_LOCAL y Admin. Ningún otro rol ni un operador por
PIN (se le resta en `lib/rbac/permisosDelOperador.js`; el Admin con operador
tampoco). Cierra en el menú, en cada pantalla (`puedeVerTurnosYCierres`) y en
cada ruta del módulo. Se lo da al dueño existente la migración
`20261024120000_permiso_turnos_y_cierres`. Candado:
`lib/turnosYCierres/puertaTurnosYCierres.test.mjs`, que además afirma que el
ítem "Turnos y cierres (anterior)" no vuelve al menú. *(verificado en código;
migración ejercida contra Postgres)*

Detrás de la puerta, el alcance de siempre: `reportes.ver`, `tesoreria.ver`, `turnos.ver_todos` (desde 2026-10-13), Admin o
el dueño (`puedeOperarSinOperador`) ven el local entero. Solo `pos.usar` ve
únicamente sus cajas (`whereCajaPropia`), hoy y las últimas 30, sin período; la
de otro operador da 403. *(verificado en código y ejercido)*

El detalle de una caja (Figma "V2 · B" 367:650) muestra el efectivo y lo
cobrado; "Arqueos, pagos y Z ›" lleva a `cajas/[id]/movimientos`, con los
arqueos, los pagos desde la caja y el botón al Z. *(verificado en código)*

## Pendiente conocido

- El residuo de centavos entre el último arqueo y el cierre no se trató.
  *(documentado)*
- Las ventas internas no se pudieron ejercer con datos: el filtro está probado
  sobre la condición que llega a la base, no con una fila interna real.
  *(documentado)*
