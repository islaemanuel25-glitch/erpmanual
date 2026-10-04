# Tesorería: la lectura canónica

Qué plata entró, salió y quedó, leída de los hechos que el sistema ya registra.
Desde 2026-10-04 (PR 1 de Tesorería: solo lectura, sin tablas nuevas).

Tesorería no es Finanzas. Finanzas explica el resultado económico y su fórmula
no se toca; Tesorería muestra movimientos de dinero [DECISIÓN de Emanuel,
2026-10-04]. No hay caja fuerte en el modelo: el recorrido físico de los billetes
después del retiro no le interesa a este módulo [DECISIÓN de Emanuel,
2026-10-04].

## Las fuentes

- **Efectivo declarado = las entregas.** Cada `CajaMovimiento` que
  `clasificarMovimientos` (`lib/finanzas/movimientosDeCaja.js`) marca
  RECAUDACION o CIERRE, por vínculo y nunca por el texto del motivo. Se cuenta
  una vez por `CajaMovimiento.id`. Su monto es lo que el cajero contó y se llevó,
  así que ya trae la diferencia de caja, el fondo que dejó, lo que pagó desde la
  caja y el Caja +/− [CÓDIGO, `lib/tesoreria/lecturaTesoreria.js`].
  - No se suman las copias del mismo retiro: `Turno.efectivoRetiradoCierre`,
    `ArqueoCaja.efectivoRetirado`, `RetiroPreparacion.totalRetiroContado`,
    `CierrePreparacion.retiroFinal` [CÓDIGO; el candado 3 lo exige leyendo el
    fuente].
  - No se reconstruye sumando ventas en efectivo: esa suma se informa aparte
    como `efectivoCobradoDeclarado`, y no es lo entregado.
- **Cobrado por medio** = los tenders de las ventas comerciales
  (`whereVentaComercial`) por `tendersParaAgregar`, ahora con procesador, medio y
  modalidad. FIADO no es cobro. Lo digital es **cobrado declarado por el POS**:
  no hay integración que pruebe una acreditación, así que nada se llama
  acreditado, conciliado ni disponible. Comisión y neto son **estimados**
  [CÓDIGO].
- **Egresos exteriores** = `PagoProveedor` y `PagoGasto` sin vínculo a una caja
  (la base obliga a que todo pago en efectivo tenga turno y movimiento, y los
  demás no: CHECK `*_efectivo_con_caja`). Restan [CÓDIGO].
- **Pagos desde caja** = los pagos en efectivo con su `cajaMovimientoId`. Ya
  salieron del cajón antes de la entrega, así que **no se restan otra vez**: son
  información [CÓDIGO; contraprueba TE-1].

**Base de Tesorería conocida** = efectivo declarado entregado + digital cobrado
declarado − egresos exteriores. No es un saldo bancario [CÓDIGO].

## Lo que no suma ni resta

- RECAUDACION y CIERRE: son la fuente del efectivo, no gastos.
- Fondo inicial y sobres de cambio: fondos operativos, no ingresos.
- Caja +/− manual: sin origen ni destino registrado; se muestra como manual.
- Cobros de cuenta corriente (`MovimientoCuenta` PAGO): sin medio ni caja; se
  informan como dinero sin ubicar.
- Pago a depósito por recepción: no prueba una entrega de dinero.
- Las diferencias de caja de cada operador: se leen por caja y nunca se suman
  entre operadores ni con una futura diferencia de Tesorería.

## Lo que se señala en vez de inventarse

- Cierre sin conteo: la caja queda con efectivo declarado `null`, no $0, y la
  alerta `SIN_IMPORTE_DECLARADO`.
- Caja abierta o en corte: `CAJA_SIN_CERRAR`, porque su entrega todavía no está
  completa.
- Venta digital con comisión pendiente: `COMISION_PENDIENTE`.

## El turno comercial es provisorio

Todo lo que agrupa pasa por `turnoComercialDe(localId, instante)`
(`lib/tesoreria/turnoComercial.js`). Hoy agrupa por local y día argentino del
instante del HECHO —venta, entrega, pago—, nunca por `Turno.apertura`, y no
persiste nada. Con este criterio un turno que cruza la medianoche queda partido:
es la limitación conocida, y la razón de que exista la frontera. Cuando exista la
configuración de franjas por local, se reemplaza esa función y nada más
[CÓDIGO; candado 20].

## Evidencia

- Armado puro y candados: `lib/tesoreria/lecturaTesoreria.js` y su `.test.mjs`.
- Lector: `lib/tesoreria/lecturaTesoreriaServer.js`. Los vínculos de clase los
  lee `lib/finanzas/movimientosDeCajaServer.js`, el mismo lector que usa el
  tablero de Finanzas.
- Contra PostgreSQL, con rutas reales: `scripts/pruebas-db/tesoreriaLectura.mjs`
  y las contrapruebas `TE-` en `scripts/pruebas-db/contrapruebasRevision.mjs`,
  en el job `finanzas_postgres`.
