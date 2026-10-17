# Turnos y cierres

Módulo nuevo del 2026-10-12, en `/modulos/turnos-y-cierres`. Convive con
`/modulos/turnos`, Tesorería, Auditoría POS → Cajas y Finanzas → caja, que no
cambiaron. Diseño: Figma `EVJ2KvVCrY0oVSowfboymQ`, página "Turnos y cierres ·
móvil" (A2 364:577, A3 364:674, B 359:523, C 359:605, D 359:2367).

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
- Ventas sin caja: la consulta de `auditoria-pos-ventas/turnos/sin-turno` con el
  filtro de venta comercial. *(verificado en código y ejercido)*
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

`reportes.ver`, `tesoreria.ver`, `turnos.ver_todos` (desde 2026-10-13), Admin o
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
