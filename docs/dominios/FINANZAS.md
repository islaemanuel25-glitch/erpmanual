# Finanzas — Contrato funcional

**Estado:** contrato funcional, borrador para decisión. No hay implementación nueva detrás de este archivo.
**Relevado:** 2026-09-24 sobre `main` en `1af04216b67bba5776a7506309519745d706ab7d` (el mismo commit que producción ese día).
**Alcance:** qué existe hoy en el ERP que tenga que ver con plata, qué reglas de negocio están decididas, qué falta y en qué orden conviene construirlo. **No es un schema ni un diseño de pantallas.**

## Cómo leer esta ficha

- **[VERIFICADO]** existe en el código de `main` en el commit de arriba, con archivo y símbolo.
- **[PROBLEMA]** hay evidencia concreta de una falla, divergencia o riesgo.
- **[DECISIÓN APROBADA]** regla de negocio decidida por Emanuel (2026-09-24) o respaldada por código ya vigente. Es contrato: no se reinterpreta.
- **[DECISIÓN PENDIENTE]** el código no la puede resolver; hace falta una definición de negocio.
- **[INFERIDO]** se deduce del código pero no se ejerció contra una base.
- **[IDEA]** propuesta conceptual. No existe y no es todavía una decisión.

Los nombres de conceptos nuevos de la sección E son provisorios. **No son nombres de tablas.**

---

## 0. Para qué existe Finanzas

Finanzas tiene que poder contestar, **por local y por período**:

1. ¿Cuánto se vendió y cuánto se recaudó?
2. ¿Cuánto margen dejó la mercadería vendida?
3. ¿Cuánto ganó o perdió económicamente el local?
4. ¿Cuánta plata entró y salió realmente?
5. ¿Dónde está la plata?
6. ¿Qué deudas y obligaciones siguen pendientes?
7. ¿Cuánto dinero quedó disponible para repartir?
8. Si el resultado fue positivo pero quedó poca plata, ¿dónde quedó la diferencia?

No es una contabilidad académica. Modela cómo funciona este negocio, y **no es una segunda contabilidad paralela a la que el ERP ya lleva**: reusa las fuentes que existen.

---

## A. Estado exacto

### A.1 Commit y árbol

- **[VERIFICADO]** `main` y `origin/main` están en `1af04216b67bba5776a7506309519745d706ab7d`. El árbol estaba limpio al empezar el relevamiento.
- **[VERIFICADO]** `docs/CURRENT_STATE.md` se relevó sobre `d20afa9`. Es histórico y no se usó como fuente.

### A.2 Qué es hoy el módulo Finanzas

**[VERIFICADO]** Es un módulo **de lectura** que tiene **una sola escritura**, la de los pagos a proveedores.

Pantallas:

- `app/modulos/finanzas/page.jsx`: tablero.
- `app/modulos/finanzas/local/[localId]/page.jsx`: la cuenta financiera de un local.
- `app/modulos/finanzas/local/[localId]/turno/[turnoId]/page.jsx`: detalle de turno.
- `app/modulos/finanzas/pagos-proveedores/page.jsx`: lista Pendientes / Pagados / Todos.
- `app/modulos/finanzas/pagos-proveedores/[cuentaId]/page.jsx`: detalle de la cuenta y registro de pagos.

API:

- `app/api/finanzas/tablero/route.js`: resumen del período y actividad por día.
- `app/api/finanzas/turno/[turnoId]/route.js`
- `app/api/finanzas/pagos-proveedores/route.js`: la lista.
- `app/api/finanzas/pagos-proveedores/[cuentaId]/route.js`: GET del detalle y PATCH de la fecha prevista.
- `app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js`: POST de un pago.
- `app/api/finanzas/pagos-proveedores/turnos-operativos/route.js`: los turnos de los que puede salir un pago en efectivo.

Lógica, en `lib/finanzas/`:

- `resumenFinanciero.js`
- `movimientosDeCaja.js`
- `actividadFinanciera.js`
- `alcanceFinanciero.js`
- `periodoFinanciero.js`
- `pagosProveedores.js` y `pagosProveedoresServer.js`
- `calendarioDePagos.js`
- `contextoFinanzas.js`
- `localesDelGrupo.js`

Cada uno tiene su `*.test.mjs`. Hay además una prueba contra Postgres en `scripts/pruebas-db/finanzas.mjs`.

Componentes: `components/finanzas/*`, con los de pagos en `components/finanzas/pagos/*`.

Permisos, en `lib/rbac/registry.js`:

- `finanzas.ver`: mirar.
- `finanzas.pagos_proveedores.registrar`: registrar un pago y mover la fecha prevista.

Ninguno de los dos está asignado a un rol de sistema.

### A.3 Piezas canónicas que existen y NO se duplican

Todas verificadas en el commit de arriba, con su ruta real.

**Ventas y cobro**

- `whereVentaComercial` — `lib/ventas/filtroVentaComercial.js:159`. Define qué es una venta comercial: excluye las anuladas y las que tienen remito (las internas).
- `tendersParaAgregar` — `lib/pos-ventas/pagos.js:296`. Devuelve los tenders de una venta desde `VentaPago`, con un respaldo en `formaPago` para las ventas históricas.

**Caja**

- `desglosarVentas` — `lib/caja/efectivoEsperado.js:66`.
- `calcularEfectivoEsperado` — `lib/caja/efectivoEsperado.js:125`. Calcula fondo inicial + tenders EFECTIVO + INGRESO − RETIRO.
- `aCentavos` y `desdeCentavos` — `lib/caja/efectivoEsperado.js:43` y `:49`.
  - **[PROBLEMA]** `aCentavos` está definido **cinco veces**: además está en `lib/pos-ventas/pagos.js:95`, `lib/transferencias/agregadosPeriodo.js:132`, `lib/proveedores/listas/calculoCosto.js:110` y `lib/compras-proveedor/comprobante/impuestos.js:70`.
  - `desdeCentavos` está definido tres veces.
  - Finanzas importa el de caja.

**Finanzas**

- `clasificarMovimientos` — `lib/finanzas/movimientosDeCaja.js:63`. Clases MANUAL, RECAUDACION y CIERRE.
- `resumenDelPeriodo` — `lib/finanzas/resumenFinanciero.js:241`.
- `desglosarCobros` — `lib/finanzas/resumenFinanciero.js:122`.
- `calcularMargen` — `lib/finanzas/resumenFinanciero.js:92`.
- `METRICAS_NO_DISPONIBLES` — `lib/finanzas/resumenFinanciero.js:47`.
- `localesFinancieros` y `ubicacionesVisibles` — `lib/finanzas/alcanceFinanciero.js:37` y `:172`.
- `rangoFinanciero` y `CORTE_SEMANAL_FINANCIERO` — `lib/finanzas/periodoFinanciero.js`.

**Deudas con proveedores**

- `crearCuentaPorPagarDesdeCompra` — `lib/finanzas/pagosProveedoresServer.js:481`. Es la única puerta de nacimiento de una deuda con proveedor.
- `registrarPagoProveedor` — `lib/finanzas/pagosProveedoresServer.js:285`. Es la única puerta de un pago.
- `puedePagarLaCuenta` — `:222`.
- `cuentaEnAlcance` — `:234`.
- `estadoDeCuenta` — `lib/finanzas/pagosProveedores.js:100`. Recibe `{ total, pagos }` y devuelve total, pagado, saldo y estado. **Es genérica: no sabe nada de proveedores.**

**Deuda con el depósito**

- `bloquesPorLocal` y `cuentaDelLocal` — `lib/transferencias/bloquesPorLocal.js:104` y `:280`.
- `acuerdoDeLocal` y `fechaDeCorte` — mismo archivo, `:82` y `:71`.
- `rangoDelPeriodo` y `UNIDADES` — `lib/transferencias/periodoDePago.js:136` y `:66`.
- `importeRecibidoDeLinea` e `importeRecibidoDeDetalleCentavos` — `lib/transferencias/agregadosPeriodo.js:265` y `:294`.

**Compras**

- `resolverTotalDelCierre` — `lib/compras-proveedor/pagoDelCierre.js:100`. Define cuánto se debe al cerrar una compra.

**Caja: el traspaso entre turnos**

- `CambioPendiente` — `prisma/schema.prisma`, `model CambioPendiente`.

### A.4 Modelos con plata

Todos en `prisma/schema.prisma`.

- `Venta` y `VentaDetalle`: el hecho comercial. Costo y márgenes quedan congelados al vender.
- `VentaPago`: el cobro, un renglón por medio. Tiene tipo contable, comisión, neto e identidad del medio y la modalidad congeladas.
- `MedioCobroLocal`, `MedioCobroModalidadLocal` y `RecargoPagoLocal`: la configuración de los medios de cobro.
- `MovimientoCuenta`: la cuenta corriente de clientes, con tipo VENTA, PAGO o AJUSTE.
- `Turno`, `CajaMovimiento`, `ArqueoCaja`, `RetiroPreparacion`, `CierrePreparacion` y `CambioPendiente`: la caja física.
- `PedidoProveedor`, `PedidoProveedorDetalle` y `ComprobanteProveedor`: la compra.
- `CuentaPorPagarProveedor` y `PagoProveedor`: la deuda con el proveedor y su pago.
- `Transferencia`, `TransferenciaDetalle`, `PosTransferencia` y `AcuerdoDepositoLocal`: la mercadería depósito → local.

**[VERIFICADO]** No existe ningún modelo de gasto, categoría de gasto, sueldo, cuenta financiera, banco, billetera, saldo por medio, conciliación ni distribución a dueños.

---

## B. Mapa de eventos

Para cada evento: qué pasa **económicamente**, qué pasa **financieramente**, si cambia una **deuda**, si cambia el **stock**, **dónde está hoy** y **qué falta**.

### B.1 Venta

- **Económico:** ingreso por ventas (`Venta.total`) y costo de la mercadería vendida (`Venta.costoTotal`, congelado al vender).
- **Financiero:** la venta sola no mueve plata; el cobro es el evento siguiente.
- **Deuda:** no, salvo que sea fiado (B.6).
- **Stock:** baja.
- **Hoy:** **[VERIFICADO]** se crea en `app/api/pos-ventas/crear/route.js`.
  - El costo unitario sale de `lib/combos/ventaConsumo.js` y queda en `VentaDetalle.precioCosto`.
  - `gananciaBruta = totalAntesRecargo − costoTotal`.
  - `gananciaNeta = netoRecibido − costoTotal`.
  - Las ventas internas y las anuladas quedan fuera de todo total con `whereVentaComercial`.
- **Falta:** nada estructural. Hay que decidir qué margen es el oficial (H.3).

### B.2 Cobro en efectivo

- **Económico:** nada; es el cobro de una venta ya reconocida.
- **Financiero:** entra plata al cajón del turno.
- **Deuda y stock:** no.
- **Hoy:** **[VERIFICADO]**
  - Hay un `VentaPago` con `medio = EFECTIVO`, cuyo `monto` es lo aplicado a la venta.
  - El "paga con" y el vuelto no se persisten.
  - El cobro entra al efectivo esperado del turno por `desglosarVentas`.
- **Falta:** nada para la caja.

### B.3 Cobro con débito

- **Económico:** la comisión del procesador es un costo financiero.
- **Financiero:** nace plata **a acreditar** en el procesador, por el neto. No entra al cajón.
- **Hoy:** **[VERIFICADO]** `VentaPago` guarda:
  - `medio = DEBITO`;
  - `comisionPct`, `comision` y `neto`, congelados;
  - `procesador`, que es BANCO, MERCADOPAGO u OTRO;
  - `medioCobroLocalId`, `medioNombre`, `modalidadId` y `modalidadNombre`.

  **El lugar donde queda la plata lo dice `procesador`, no el tipo contable:** un "MP Débito" es DEBITO y pasa por MERCADOPAGO.
- **Falta:**
  - El saldo del procesador.
  - La acreditación real, que tiene fecha y monto.
  - La conciliación. `MedioCobroLocal.integracionJson` existe y nadie lo escribe.

### B.4 Cobro con crédito

Igual que débito. Además, el recargo al cliente vive en `Venta.recargoPago*`, no en `VentaPago`.

**Falta:** lo mismo que en débito, más los plazos de acreditación, que ningún dato registra.

### B.5 Cobro con Mercado Pago / QR

- **Hoy:** **[VERIFICADO]** se registra como `medio = MERCADOPAGO` con `procesador = MERCADOPAGO`. **No hay integración:** `app/modulos/configuracion/pos-ventas/integraciones/page.jsx` lo declara. El cobro se registra a mano.
- **Falta:** lo mismo que en débito. El saldo de Mercado Pago no existe en el sistema.

### B.6 Venta fiada

- **Económico:** igual que cualquier venta. Ingreso y costo se reconocen al vender.
- **Financiero:** no entra plata.
- **Deuda:** el cliente pasa a deber.
- **Stock:** baja.
- **Hoy:** **[VERIFICADO]**
  - Un único `VentaPago` con `medio = FIADO`.
  - `Venta.esFiado = true`.
  - Un `MovimientoCuenta` VENTA / DEBITO por el total (`crear/route.js`, alrededor de las líneas 1351–1376), dentro de un try/catch que no frena la venta.
  - El saldo del cliente se deriva: Σ DEBITO − Σ CREDITO.
- **Falta:** nada para la deuda. Finanzas ya informa el fiado como "no es cobro" (`MEDIOS_SIN_COBRO`).

### B.7 Cobro posterior de un fiado

- **Económico:** nada. El ingreso ya se reconoció en la venta.
- **Financiero:** entra plata, por algún medio, a algún lugar.
- **Deuda:** la del cliente baja.
- **Hoy:** **[VERIFICADO]** `app/api/clientes/[id]/cuenta-corriente/pagos/route.js:58` crea un `MovimientoCuenta` PAGO / CREDITO con **monto y nota solamente**. No guarda medio, turno, `CajaMovimiento` ni `VentaPago`.
- **[PROBLEMA]** Si el cliente paga en efectivo y la plata va al cajón, el arqueo muestra un sobrante que nadie puede explicar. **[INFERIDO]**
- **[PROBLEMA]** Si paga por Mercado Pago, no queda en ningún lado.
- **Falta:** el medio y el lugar de destino del cobro.

### B.8 Compra de mercadería

- **Económico:** **no es gasto.** El dinero o la deuda se convierte en stock. El impacto económico llega **al vender**, por el costo de lo vendido.
- **Financiero:** ninguno al recibir; nace una deuda.
- **Stock:** sube.
- **Hoy:** **[VERIFICADO]** `app/api/compras-proveedor/recibir/[id]/route.js`.
  - Es la única ruta que pasa un pedido a RECIBIDO.
  - El stock entra a la ubicación dueña del pedido (`ownerLocalIdDePedido`, en `lib/compras/scope.js`).
  - El costo se actualiza con `actualizarCostoRealProducto` (`lib/compras-proveedor/costoMaestro.js`): el último costo reemplaza al anterior, no hay costo promedio.
- **El caso "el local compra 20 kg de pan":** **[VERIFICADO]** ya tiene camino.
  - `PedidoProveedor.nacidoDeFactura` permite armar la compra desde la factura, sin pedido previo.
  - El cierre acepta un pago inicial: pendiente, parcial o total.
  - Si se paga en efectivo, sale del turno abierto del mismo local.
- **Falta:** nada para la compra.

### B.9 Deuda con proveedor

- **Hoy:** **[VERIFICADO]** `crearCuentaPorPagarDesdeCompra`, llamada dentro de la transacción de `recibir`.
  - `localGastoId` es la ubicación dueña de la compra.
  - `total` es la suma de los `totalLeido` de las facturas, o un total que se confirma a mano (`resolverTotalDelCierre`). Nunca es la suma de las líneas.
  - `vencimientoProveedor` lo escribe el usuario.
  - `fechaPrevistaPago` arranca en null.
  - El estado se deriva con `estadoDeCuenta`.
- **[PROBLEMA]** Ver B.23: la compra puede seguir cambiando después de congelada la deuda.

### B.10 Pago a proveedor en efectivo

- **Económico:** nada. Es cancelación de deuda: **pago ≠ gasto**.
- **Financiero:** sale efectivo del cajón.
- **Deuda:** baja.
- **Hoy:** **[VERIFICADO]** `registrarPagoProveedor`:
  - crea el `PagoProveedor`;
  - crea un `CajaMovimiento` RETIRO en un **turno operativo del mismo local** (`pagosProveedoresServer.js:380`);
  - los vincula con `PagoProveedor.cajaMovimientoId`, que es único;
  - la base exige con un CHECK que efectivo y movimiento vayan juntos.
- **[PROBLEMA]** `clasificarMovimientos` no conoce ese vínculo. En el tablero de Finanzas el RETIRO del pago aparece como "retiro manual" (`app/api/finanzas/tablero/route.js:256`). Si mañana se suman los pagos a proveedores sin arreglar eso, **el mismo efectivo cuenta dos veces**.
- **[PROBLEMA]** El modal "Caja +/−" (`components/pos-ventas/ModalCajaMovimiento.jsx:66`) dice literalmente "Gastos y salidas puntuales: pago a proveedor, cambio, adelantos". Un cajero puede sacar la plata por ahí **y además** registrar el pago en Finanzas: el cajón se descuenta dos veces y nada vincula los dos registros.
- **[PROBLEMA, contra la operación real]** El efectivo **solo** puede salir de un turno abierto (`ERROR_FALTA_TURNO`: "Un pago en efectivo tiene que salir de un turno abierto."). Hoy no se puede registrar que se le pagó al proveedor **con el efectivo que el dueño ya retiró** (sección 3 del pedido). Ese pago terminaría cargado como "OTRO" o "TRANSFERENCIA", lo cual es falso.

### B.11 Pago a proveedor por otro medio

- **Hoy:** **[VERIFICADO]** `PagoProveedor` con `medio` TRANSFERENCIA, MERCADO_PAGO u OTRO. `localOrigenId` es igual a la ubicación de la deuda; no tiene turno ni movimiento de caja.
- **Falta:** de qué **lugar** salió (qué banco, qué cuenta de MP) y el saldo de ese lugar.

### B.12 Transferencia depósito → local

- **Económico, para el local:** entra stock (**inversión, no gasto**). El costo llega al vender.
- **Económico, para el depósito:** sale stock. No es una venta: las internas quedan fuera de `whereVentaComercial`, y el depósito vende al costo a propósito (`docs/business-rules/deposito-vende-al-costo.md`).
- **Financiero:** ninguno al transferir.
- **Stock:** baja en origen y sube en destino al recibir.
- **Hoy:** **[VERIFICADO]** hay dos caminos:
  1. **Manual.** `PosTransferencia` (un documento de preparación, sin precios) → `crearTransferencia`. Mueve stock y congela `TransferenciaDetalle.precioCosto`. No hay venta.
  2. **Venta interna.** Una venta del POS del depósito a un cliente vinculado a un local crea una `Venta` + `VentaPago` + una `Transferencia` con `ventaId`. Según el propio schema, es el camino que crea **casi todas** las transferencias. Si esa venta se cobra FIADO, además nace un `MovimientoCuenta` DEBITO.
- **[PROBLEMA]** `lib/transferencias/aplicarCorreccionEconomica.js` corrige los totales de la `Venta` cuando la recepción difiere, pero **no** toca el `MovimientoCuenta`: lo dice `lib/transferencias/correccionEconomica.js:36-42`. Una venta interna fiada puede quedar con deuda desalineada.

### B.13 Deuda del local con el depósito

- **Hoy:** **[VERIFICADO]** se **calcula y se muestra**; no se persiste.
  - `cuentaDelLocal` suma `importeRecibidoDeLinea` sobre las transferencias no canceladas cuya `fechaDeCorte` (la de envío, o la de creación) cae en el período del acuerdo.
  - Una línea se valoriza como recibido × `precioCosto` congelado. **Si todavía no se contó, se valoriza lo enviado.**
  - El período sale de `AcuerdoDepositoLocal.diaDeCorte` con `rangoDelPeriodo`.
- **[PROBLEMA]** `importeRecibidoDeLinea` cae al **costo vivo del catálogo** cuando `precioCosto` es null (`agregadosPeriodo.js:267-268`). Una línea vieja sin costo congelado cambia su importe si alguien edita el costo.
- **[PROBLEMA]** El tablero de transferencias no excluye las que tienen `ventaId`. Una misma entrega interna puede tener **hasta tres representaciones de lo que el local debe**:
  - el `aPagar` del tablero, valorizado a `precioCosto`;
  - el total de la `Venta` interna, a la lista "Costo" del depósito;
  - el `MovimientoCuenta` DEBITO, si se cobró fiado.

  Qué tan seguido ocurre la tercera es un dato de producción que no se midió.
- **[VERIFICADO]** El propio schema de `AcuerdoDepositoLocal` (`prisma/schema.prisma:90-112`) avisa lo que hay que resolver el día que exista el pago:
  - el período tiene que quedar **congelado en el pago**;
  - `diaDeCorte` necesita **historial**.

### B.14 Pago semanal al depósito

- **Económico:** nada, ni para el local ni para el depósito. Es cancelación de una obligación.
- **Financiero:** sale plata de un lugar del local y entra a un lugar del depósito.
- **Deuda:** la del local con el depósito baja.
- **Hoy:** **[VERIFICADO] no existe.** El schema lo dice: "El sistema no registra pagos".
- **Falta:** el evento de pago, con período congelado, medio, lugar de origen y lugar de destino.

### B.15 Retiro de recaudación

- **Económico:** nada. **No es gasto ni reparto.**
- **Financiero:** es un **traspaso**. La plata va del cajón a "efectivo en poder del dueño", y sigue siendo del local.
- **Hoy:** **[VERIFICADO]**
  - `RetiroPreparacion` → `app/api/pos-ventas/retiros/[token]/confirmar/route.js` crea un `ArqueoCaja` PARCIAL y un `CajaMovimiento` RETIRO, vinculados por `cajaMovimientoRetiroId`.
  - El cierre crea otro RETIRO, referenciado desde `Turno.retiroCierreMovimientoId`.
  - Finanzas ya separa la recaudación de los manuales, por vínculo y no por texto: `clasificarMovimientos`.
- **[PROBLEMA]** Ningún código escribe `ArqueoCaja.destino`, `recibidoPor` ni `entregadoAt`. `estadoEntrega` nace en PENDIENTE_ENTREGA y **nunca pasa a ENTREGADO**.
- **[PROBLEMA]** El cierre clásico guarda el destino en `Turno.destinoRetiroCierre`, como texto libre; el cierre con relevo, que es el que usa hoy el POS, ni eso.
- Resultado: **la plata retirada desaparece del sistema.**
- **Falta:** el lugar de destino y su saldo.

### B.16 Dinero preparado

Es el caso de un turno que deja plata para que el siguiente compre pan.

- **Económico:** nada; mover plata no es gastarla.
- **Financiero:** traspaso a un lugar reservado del local.
- **Hoy:** **[VERIFICADO]** lo más parecido es `CambioPendiente`, el sobre que el cierre deja para el turno siguiente. Pero:
  - es solo el fondo de cambio;
  - `montoInicial` del turno que lo toma lo absorbe entero.
- **Qué pasa si se registra hoy:**
  - Como RETIRO manual con motivo libre: la plata desaparece.
  - Metido en el sobre: se mezcla con el fondo.
  - La compra del pan después: o no se registra, o es otro RETIRO y descuenta dos veces.
  - Se pierden el propósito, quién lo tiene y cuánto sobró.
- **Falta:** un lugar o una reserva con propósito. Ver H.3.

### B.17 Gasto

Luz, alquiler, bolsas camiseta, limpieza, reparaciones, insumos que no se venden.

- **Económico:** baja el resultado del período al que corresponde.
- **Financiero:** ninguno hasta que se paga.
- **Deuda:** puede nacer una obligación.
- **Hoy:** **[VERIFICADO] no existe.**
  - `lib/finanzas/resumenFinanciero.js:9-14`: "No hay gastos, no hay sueldos y no hay resultado del negocio".
  - `METRICAS_NO_DISPONIBLES` lo informa como ausencia, no como cero.
  - `lib/caja/efectivoEsperado.js:94-100` dice que "un gasto se registra como RETIRO con motivo descriptivo". **Contradice la regla de que retiro ≠ gasto** (ver H.2).

### B.18 Pago de un gasto

- **Económico:** nada, si el gasto ya se reconoció.
- **Financiero:** sale plata de un lugar.
- **Deuda:** la obligación baja.
- **Hoy:** **no existe.** Solo se puede hacer como RETIRO manual del cajón.

### B.19 Pago a empleados

- Es un gasto del local, más su pago.
- **Hoy:** **[VERIFICADO] no existe.** `lib/menu/capabilityCatalog.js:148` declara `empleados` como módulo **futuro**.
- **Regla:** si antes se retiró plata del cajón para pagar sueldos, ese retiro es un traspaso. El gasto nace cuando se registra el sueldo, y el pago sale del lugar donde está esa plata.

### B.20 Reparto de ganancia

- **Económico:** no es gasto. Es distribución del resultado a los dueños.
- **Financiero:** sale plata del local.
- **Hoy:** **no existe.**

### Otros eventos con plata que aparecieron

- **B.21 Comisiones de medios.**
  - **[VERIFICADO]** Congeladas por tender, con `comisionPendiente` cuando no hay configuración.
  - Son un costo financiero. Hoy no entran al margen de Finanzas (`calcularMargen = total − costo`).
- **B.22 Diferencias de caja.**
  - **[VERIFICADO]** `ArqueoCaja.diferencia` y `Turno.diferenciaEfectivo`.
  - No se imputan a ningún lado.
- **B.23 Cambios en una compra después de cerrada.** **[VERIFICADO]**
  - La deuda (`CuentaPorPagarProveedor.total`) y `PedidoProveedor.totalReal` son la misma cifra guardada dos veces.
  - Nadie escribe `ComprobanteProveedor.confirmadoEn`, así que las facturas de un pedido RECIBIDO se pueden borrar, subir o releer. La suma de `totalLeido` puede dejar de coincidir con la deuda congelada.
  - `comprobantes/aceptar-precio` (`route.js:356`) y `comprobantes/vincular` (`route.js:200`) escriben `PedidoProveedorDetalle.precioCosto` sin preguntar el estado del pedido. **No se ejerció contra una base.**
  - Las rutas de ítems (`agregar-item`, `editar-item`, `eliminar-item`, `importar/aplicar`) y `recepcion/correccion` **sí** rechazan un pedido RECIBIDO.
- **B.24 Correcciones de venta.**
  - **[VERIFICADO]** `app/api/pos-ventas/venta/[id]/corregir/route.js` borra y recrea `VentaPago` sin los campos de identidad del medio.
  - Recalcula `totalNuevo = subtotal − descuento`, sin ofertas ni recargo.
  - Usa otro camino de consolidación: `normalizarYConsolidarPagos` y `aplicarComisiones`.
  - Cambia la base de `gananciaBruta` (`subtotal − costo`) y de `gananciaNeta` (`bruta − comisión`).
- **B.25 Anulación de venta.**
  - **[VERIFICADO]** `revertirVenta` (`lib/pos-ventas/reversionVenta.js`) marca `anuladaEn`, devuelve el stock y revierte cuenta corriente y puntos.
  - No toca `VentaPago` ni caja.
  - Hoy su único llamador es `app/api/transferencias/cancelar/route.js`.
- **B.26 Ingreso manual de caja.**
  - **[VERIFICADO]** `CajaMovimiento` INGRESO desde "Caja +/−", con motivo libre.
  - Puede ser plata que vuelve al local o un aporte del dueño; no se distingue.

---

## C. Las cinco magnitudes

### C.1 Recaudación

- **Suma:** los tenders de las ventas comerciales del período, por medio, con `tendersParaAgregar` sobre ventas filtradas con `whereVentaComercial`. Se informan bruto, comisión y neto. **[VERIFICADO]** `desglosarCobros` ya lo hace.
- **No entra:**
  - el tender FIADO (no es cobro, `MEDIOS_SIN_COBRO`);
  - las ventas internas y anuladas;
  - los ingresos manuales de caja;
  - el fondo inicial;
  - los retiros y los traspasos.
- **Fuente actual:** `VentaPago`, por `desglosarCobros`. **No se crea otra.**
- **Huecos:**
  - Los **cobros posteriores de fiado** también son recaudación y hoy no tienen medio (B.7).
  - El período se asigna por `Venta.fecha` en el resumen y por turno en la actividad (`app/api/finanzas/tablero/route.js`). Las dos atribuciones conviven y hay que decir cuál manda en el cierre semanal (F).

### C.2 Margen de mercadería

- **Suma:** ventas comerciales.
- **Resta:** costo de la mercadería vendida, Σ `Venta.costoTotal`, congelado al vender.
- **No entra:** compras, pagos a proveedores, pagos al depósito, retiros, gastos.
- **Fuente actual:** **[VERIFICADO]** `calcularMargen`, que calcula `Σ total − Σ costoTotal` y controla contra Σ `gananciaBruta`.
- **Huecos:**
  - **[DECISIÓN PENDIENTE]** ¿Las ventas van con o sin el recargo de pago? Hoy conviven dos definiciones: Finanzas usa `total` (con recargo) y `gananciaBruta` usa `totalAntesRecargo` (sin recargo).
  - **[PROBLEMA]** El costo congelado es el último costo al momento de vender, no un promedio. Es una definición válida, pero tiene que quedar escrita.
  - **[PROBLEMA]** Las correcciones reescriben `costoTotal` y los márgenes con bases distintas (B.24).
  - No hay valorización de mermas ni de ajustes de stock (ver D).

### C.3 Resultado económico

- **Suma:** el margen de mercadería.
- **Resta:**
  - las comisiones de medios, como costo financiero **[DECISIÓN PENDIENTE: si van acá o en el margen]**;
  - los gastos **del período**;
  - otros costos económicos que se decidan: mermas valorizadas, diferencias de caja **[DECISIÓN PENDIENTE]**.
- **No entra:**
  - las compras de mercadería (van por costo de lo vendido);
  - los pagos de deudas (proveedor, depósito, gasto ya reconocido);
  - los retiros y traspasos;
  - los repartos a dueños;
  - los ingresos manuales de caja.
- **Fuente actual:** margen y comisiones sí (`desglosarCobros` ya da `comisiones`). Gastos, no.
- **Hueco:** **el gasto no existe.** Hoy `resultadoReal` está en `METRICAS_NO_DISPONIBLES`, y así tiene que quedar hasta que exista: **no se calcula con cero gastos**.

### C.4 Posición: dónde está la plata

Es la suma de los saldos de los **lugares** del local en un instante dado.

- **Lo que hoy se puede derivar:**
  - El efectivo en el cajón de un turno abierto: `calcularEfectivoEsperado`, o lo contado en el último arqueo.
  - El sobre de cambio pendiente: `CambioPendiente` DISPONIBLE o RESERVADO.
- **Lo que hoy no existe:**
  - el efectivo retirado en poder del dueño (B.15);
  - el saldo en Mercado Pago o banco (B.3–B.5, B.11);
  - el dinero preparado (B.16).
- **No debe entrar:** plata de otro local, aunque la tenga la misma persona. La regla A lo impone.
- **Hueco:** **no hay forma de saber hoy dónde está la plata fuera del cajón.** No se escribe una fórmula final.

### C.5 Disponible para repartir

- **Suma:** la posición del local.
- **Resta, con conceptos todavía por decidir:**
  - las obligaciones pendientes: saldo de cuentas por pagar a proveedores, deuda con el depósito no pagada y gastos reconocidos no pagados;
  - las reservas que se decida mantener: fondo de caja, dinero preparado, capital de trabajo **[DECISIÓN PENDIENTE]**.
- **No es** el resultado económico. Pueden diferir sin contradicción (D).
- **Fuente actual:** solo la parte de proveedores, con `estadoDeCuenta` sobre `CuentaPorPagarProveedor`.
- **Hueco:** faltan la posición, la deuda con el depósito persistida y los gastos. **No se escribe una fórmula final.**

---

## D. Puente Resultado → Disponible

La pregunta es: **"Si gané $1.500.000, ¿por qué solo tengo $300.000 disponibles para repartir?"**

El resultado mira lo **devengado** y el disponible mira la **plata**. Las categorías que explican la diferencia son estas, cada una con su fuente de hoy.

1. **Aumento de stock (reinversión).** Si entró más mercadería de la que se vendió al costo, la plata quedó en la góndola.
   - Hoy se puede aproximar como entradas valorizadas − costo de lo vendido:
     - las entradas son `CuentaPorPagarProveedor.total` por fecha de compra, más el `aPagar` de las transferencias recibidas;
     - el costo de lo vendido es Σ `Venta.costoTotal`.
   - **[PROBLEMA]** Es aproximado: `AuditoriaStock` registra cantidades y no importes, las mermas y los ajustes no están valorizados, y no hay foto histórica del stock valorizado (`reportes-stock/valorizado` usa el costo **actual**).
   - Una disminución de stock funciona al revés: libera plata.
2. **Deudas generadas en el período y todavía no pagadas.** No cambian el resultado, pero esa plata ya está comprometida. Salen de las cuentas por pagar con saldo, y de la deuda con el depósito cuando exista.
3. **Pagos de deudas de períodos anteriores.** Salió plata sin tocar el resultado de este período. Salen de `PagoProveedor.fecha` dentro del período sobre cuentas creadas antes. Para el depósito, todavía no existen.
4. **Ventas fiadas no cobradas y cobros de fiados viejos.** Las primeras suman al resultado sin plata; los segundos traen plata sin resultado. Salen de `MovimientoCuenta`. **[PROBLEMA]** El cobro no tiene lugar (B.7).
5. **Cobros digitales todavía no acreditados, y comisiones.** La plata existe pero todavía no está en un lugar usable. Hoy no hay dato.
6. **Movimientos entre lugares.** Son neutros para el total y solo cambian dónde está la plata. Hoy no existen, salvo el retiro, que "desaparece".
7. **Efectivo retirado en poder del dueño.** Sigue siendo del local. Si no se cuenta, el disponible sale subestimado.
8. **Dinero preparado y fondo de caja.** Es del local pero no está disponible, por decisión.
9. **Diferencias de caja.** Un faltante bajó la plata sin que nadie lo decidiera. Hay que decidir si también baja el resultado.
10. **Aportes, o plata que vuelve al local.** Suben la plata sin ser resultado. Hoy son INGRESO manual, sin distinguir.
11. **Distribuciones ya hechas en el período.** Hoy no existen.

Un ejemplo **ilustrativo**, no una fórmula:

- Resultado +1.500.000.
- Menos 700.000 de aumento de stock.
- Menos 400.000 pagados de deudas de la semana anterior.
- Menos 100.000 de fondo de caja y dinero preparado que se mantiene.
- Queda 300.000 disponible.

Para que el puente cierre de verdad hace falta **una posición inicial y una final por lugar**. Sin un cierre que congele saldos (F), esa posición inicial exige recalcular desde el primer día. **Hoy no se puede armar el puente completo**: faltan los datos de 3 (para el depósito), 5, 6, 7, 8, 10 y 11.

---

## E. Modelo conceptual (no Prisma)

Solo los conceptos que la evidencia muestra que faltan. Todos son **[IDEA]**.

### E.1 Lugar del dinero

- **Problema que resuelve:** contestar "¿dónde está la plata?" (C.4) y darle un origen y un destino a cada pago, traspaso y reparto.
- **Por qué lo existente no alcanza:**
  - `Turno` sabe el saldo de un cajón mientras está abierto.
  - `MedioCobroLocal.procesador` sabe **por dónde pasó** un cobro, no cuánto hay.
  - `PagoProveedor.localOrigenId` sabe de qué **ubicación** salió, no de qué lugar.
- **Qué reusa:**
  - el cajón sigue siendo `Turno` + `CajaMovimiento` + `calcularEfectivoEsperado`, y el lugar "cajón" **se deriva de ahí** en vez de duplicarse;
  - `ProcesadorCobro` y `VentaPago.procesador` asignan cada cobro digital a un lugar;
  - `CambioPendiente` es el traspaso cajón → cajón que ya funciona.
- **Riesgo de duplicación:** alto si se lleva un "saldo de caja" paralelo al del turno. Regla: **el cajón no se re-registra**.
- **Relaciones:** pertenece a UN local (regla A). Tiene un tipo que se pueda extender (efectivo fuera de caja, procesador, banco, reservado…), sin fijar la lista en el código.
- **Alternativa:** que "efectivo en poder del dueño" sea un único lugar por local sin tabla de lugares, y que banco y Mercado Pago se agreguen después. Es más chico, pero no resuelve C.4 completo.

### E.2 Traspaso entre lugares

- **Problema:** el retiro de recaudación, el dinero preparado, el depósito en banco y la plata que vuelve al local.
- **Por qué lo existente no alcanza:** el RETIRO no dice a dónde va y el INGRESO no dice de dónde viene.
- **Qué reusa:** el lado del cajón **ya está** en `CajaMovimiento`, que se vincula con `ArqueoCaja` y `Turno`. El traspaso **apunta** a ese movimiento y no lo copia, siguiendo el mismo patrón que `PagoProveedor.cajaMovimientoId`.
- **Riesgo:** doble conteo si el mismo retiro vive como `CajaMovimiento` y como traspaso con monto propio. Regla: **una fila por lado, con vínculo único**.

### E.3 Gasto, con categoría configurable

- **Problema:** C.3.
- **Por qué lo existente no alcanza:** `CajaMovimiento` es caja física y un retiro no es un gasto.
- **Qué reusa:** `alcanceFinanciero` para la visibilidad y el período financiero para imputarlo.
- **Qué lo separa del pago:** el gasto reconoce el costo; el pago mueve plata. Un gasto pagado en el acto son **dos hechos que ocurren juntos**, no uno.
- **Categorías:** configurables por grupo y extensibles, sin una lista cerrada en el código (sección 6 del pedido).
- **Riesgo:** que "gasto pagado en efectivo" cree además un RETIRO manual por "Caja +/−". Mismo problema que B.10.

### E.4 Obligación y pago, generalizando lo que ya anda

- **Problema:** la deuda con el depósito, los gastos a pagar y los sueldos a pagar tienen la misma forma que la deuda con el proveedor: un total, pagos parciales, un saldo derivado.
- **Qué reusa:** `estadoDeCuenta`, que ya es genérica sobre `{ total, pagos }`; `puedePagarLaCuenta` (operar la ubicación de la deuda); la idempotencia de `registrarPagoProveedor`.
- **Alternativas, con sus costos:**
  1. **Generalizar** `CuentaPorPagarProveedor` / `PagoProveedor`. Toca una pieza que funciona en producción.
  2. **Hermanos por tipo** que reusen las funciones puras. Más tablas, cero riesgo sobre lo existente.
  3. **Una obligación genérica nueva**, dejando la de proveedores como está. Crea dos maneras de modelar una deuda.
- **[DECISIÓN PENDIENTE]** Ninguna se elige en esta tanda.

### E.5 Pago al depósito por período

- **Problema:** B.14.
- **Qué reusa:** `cuentaDelLocal` para el importe y `rangoDelPeriodo` + `acuerdoDeLocal` para el período. **No se crea una deuda por transferencia aislada.**
- **Qué exige el propio schema:** congelar el período en el pago y guardar historial de `diaDeCorte`.
- **Riesgo:** la triple representación de B.13. Antes de registrar pagos hay que decidir cuál es la deuda canónica (H.3).

### E.6 Cobro de cuenta corriente con medio y lugar

- **Problema:** B.7.
- **Qué reusa:** `MovimientoCuenta` sigue siendo la deuda del cliente. El cobro gana un medio y un destino. Si es efectivo al cajón, gana un vínculo a un `CajaMovimiento` INGRESO, con el mismo patrón que el pago a proveedor.
- **Riesgo:** tratarlo como una venta nueva y contarlo dos veces en la recaudación.

### E.7 Distribución a dueños

- Sale de un lugar del local. **No es gasto ni retiro.**
- Es la única salida que baja el "disponible para repartir" por haberse repartido.

### E.8 Cierre semanal

Ver F. Es **opcional** según la alternativa que se elija.

### E.9 Empleados, sin RRHH

- Mínimo: un gasto de categoría "personal" con un beneficiario, más su pago.
- **[DECISIÓN PENDIENTE]** si hace falta una entidad empleado. Depende de los adelantos: un adelanto de sueldo es plata que el empleado le debe al local hasta que se liquida.

---

## F. Semana financiera

### F.1 Qué hay hoy

**[VERIFICADO]** `lib/finanzas/periodoFinanciero.js`:

- `CORTE_SEMANAL_FINANCIERO = 0`: domingo, **fijo y global**. El comentario lo dice textual: "Es una CONSTANTE y no un parámetro a propósito".
- Está **desacoplado a propósito** de `AcuerdoDepositoLocal`: "la semana financiera de un local cambiaría el día que alguien le mueve el corte de pago".
- Unidades: DIA, SEMANA y MES, de `periodoDePago.UNIDADES`. "OTRO" está declarado y **no implementado**.
- Desplazamiento entre 0 y −120; el futuro no se consulta.
- Toda la aritmética de calendario delega en `rangoDelPeriodo`, que es puro y ya recibe un `diaDeCorte` como argumento.

### F.2 La contradicción con el pedido

- **[PROBLEMA, contradicción]** La regla nueva dice que los períodos semanales son **configurables** y que no se asuma domingo–sábado global. El código hoy fija domingo global.
- Lo que **sí** está resuelto: la aritmética. Hacerlo configurable no requiere cuentas nuevas, solo decidir **de dónde** sale el `diaDeCorte` financiero.
- **[DECISIÓN PENDIENTE]** Alternativas:
  1. Por grupo.
  2. Por local.
  3. Igual al del acuerdo con el depósito.

  La 3 es la que el código rechazó explícitamente, con motivo.
- Cualquier corte configurable necesita **historial**, por la misma razón que el acuerdo: si cambia, las semanas viejas no pueden moverse.

### F.3 ¿Cierre persistido o todo derivado?

**Lo que se deriva bien** a partir de hechos congelados:

- recaudación y margen, porque ventas y pagos están congelados;
- pagos a proveedores por fecha;
- deudas con proveedores a una fecha, porque los pagos tienen `fecha` y la cuenta `createdAt`.

**Lo que no se deriva de forma estable:**

- **la deuda con el depósito del período**: se mueve con `diaDeCorte`, con recepciones tardías, con cancelaciones y con el costo vivo cuando falta el congelado;
- **el stock valorizado**: no hay historia de importes;
- **el saldo de lugares que hoy no tienen movimientos**;
- **la decisión de cuánto repartir.**

**Alternativas:**

1. **Todo derivado**, sin cierre. Simple, pero el puente de D no cierra y los números viejos pueden cambiar.
2. **Cierre semanal liviano** que congele solo lo no derivable:
   - saldos por lugar al cierre, contados o declarados;
   - deuda con el depósito del período;
   - disponible calculado;
   - reparto decidido.
3. **Cierre completo** que congele además las magnitudes derivadas. Duplica números que ya son fuente congelada: **no conviene**.

**Hechos tardíos**, como un gasto cargado después del cierre:

- o se reabre la semana;
- o se imputa como ajuste en la semana siguiente.

**[DECISIÓN PENDIENTE]**

**No conviene congelar:** ventas, pagos y deudas individuales (ya son su propia fuente), ni las reglas de cálculo.

---

## G. Invariantes

Ningún cambio futuro puede romper esto:

1. Pago de una deuda ≠ gasto.
2. Retiro de caja ≠ gasto.
3. Retiro de caja ≠ distribución a dueños.
4. Compra de stock ≠ costo del período. El costo entra por lo vendido (`Venta.costoTotal`).
5. Movimiento entre lugares ≠ ingreso o egreso económico.
6. La deuda de un local no se paga con fondos de otro local ni del depósito (`puedePagarLaCuenta` y `registrarPagoProveedor` lo imponen para proveedores; cualquier deuda nueva hereda la regla).
7. Poder ver una deuda no habilita a pagarla. Son permisos distintos, y además hay que operar la ubicación de la deuda.
8. Cómo se cobró una venta lo dice `VentaPago`, por `tendersParaAgregar`. `Venta.formaPago` es derivado o legacy.
9. Un mismo flujo de plata vive en **una** fuente. Si toca el cajón, el otro registro **apunta** al `CajaMovimiento` con un vínculo único; no crea un segundo importe.
10. Qué es cada `CajaMovimiento` lo decide el **vínculo** con otra fila, nunca el texto del `motivo`.
11. El retiro de cierre no entra en el esperado de su propio turno (`paraElEsperado`).
12. Las ventas internas y las anuladas no son ventas comerciales, y no suman ni en recaudación, ni en margen, ni en caja (`whereVentaComercial`).
13. FIADO no es cobro, y su cobro posterior no es una venta nueva.
14. Toda aritmética de plata se hace en centavos enteros (`aCentavos` / `desdeCentavos`).
15. Una métrica que el sistema no conoce se informa como **no disponible**, nunca como cero (`METRICAS_NO_DISPONIBLES`).
16. Saldo y estado de una deuda se derivan de total y pagos (`estadoDeCuenta`); no se guarda una columna de saldo.
17. Un envío que mueve plata exige clave de idempotencia (patrón de `PagoProveedor` y `ArqueoCaja`).
18. Las diferencias de arqueos anteriores no son movimientos de dinero (`lib/caja/efectivoEsperado.js`).
19. La configuración no reescribe la historia: medio, modalidad, comisión y costo quedan congelados en la operación.
20. Las deudas nacen de su hecho de origen. No hay endpoint para inventar una deuda (`crearCuentaPorPagarDesdeCompra`).
21. `CajaMovimiento` no se convierte en un mayor general: está atado a `turnoId`, cada RETIRO baja el esperado por construcción y no tiene medio ni local propio.
22. El período de un pago al depósito, una vez registrado, queda congelado en el pago y no se recalcula desde `AcuerdoDepositoLocal`.
23. Lo que el local debe al depósito se valoriza por lo **recibido** (y, sin recepción, por lo enviado) a costo congelado. No se crea una deuda por transferencia aislada.
24. Las capacidades se habilitan por permiso, nunca por nombre de rol.
25. Todo hecho financiero pertenece a exactamente un local.
26. El resultado económico no se calcula mientras no existan los gastos.

---

## H. Huecos y preguntas

### H.1 Lo que el código ya contesta

Esto no se pregunta:

- Recaudación por medio y local: sale de `VentaPago` sin tablas nuevas.
- El efectivo esperado y el circuito físico del cajón.
- La deuda con proveedores, sus pagos y la regla de ubicación.
- El costo de lo vendido, congelado al vender (último costo).
- Que la deuda con el depósito se valoriza a costo congelado por lo recibido, por período de acuerdo.
- Que no existen gasto, lugar, traspaso, distribución ni pago al depósito.
- Que el pago en efectivo a proveedor exige turno abierto.
- Que el cobro de un fiado no guarda medio.
- Que la semana financiera está fija en domingo.

### H.2 Lo que ya está decidido (sección 1 a 13 del pedido del 2026-09-24)

**[DECISIÓN APROBADA]**

- Las cinco magnitudes son distintas.
- Deuda de X → la paga X con fondos de X.
- Retiro ≠ gasto ≠ reparto.
- El efectivo retirado sigue siendo del local.
- Compra ≠ gasto: el costo entra por lo vendido.
- Pago al depósito ≠ gasto.
- Pago ≠ gasto, y un gasto puede existir antes de pagarse.
- Las categorías de gasto son configurables.
- La semana es configurable.
- Se reusa `bloquesPorLocal` / `periodoDePago` / `aPagar` / `AcuerdoDepositoLocal`.
- Mobile-first, con el patrón de Pagos a proveedores.
- Permisos, no roles.

### H.3 Lo que requiere una decisión de Emanuel

1. **Efectivo en poder del dueño: ¿un lugar por local, o por persona que lo tiene?** Define si "lugar" necesita un responsable. Si el dueño lleva en el bolsillo plata de dos locales, el sistema igual tiene que llevar saldos separados por local.
2. **¿Se puede pagar a un proveedor en efectivo con plata ya retirada, sin turno abierto?** Hoy el código lo prohíbe. Si la respuesta es sí, `registrarPagoProveedor` necesita un origen "lugar" además de "turno", y es la primera pieza que el lugar del dinero tendría que habilitar.
3. **La semana financiera: ¿por grupo, por local o igual a la del depósito?** Cambia dónde se configura y si la semana del pago al depósito coincide con la del cierre. Si no coinciden, el cierre tiene que explicar pagos de un período de depósito que cruza dos semanas.
4. **¿Qué margen es el oficial: con o sin recargo? ¿La comisión va en el margen o en el resultado?** Cambia la fórmula de C.2 y C.3, y cuál de los márgenes persistidos es el de control.
5. **Gastos: ¿se imputan a la semana en que se generan o a la semana en que se pagan?** Si es la primera, hace falta la obligación (E.4). Si es la segunda, alcanza con registrar el pago con su categoría, pero el resultado va a saltar según cuándo se pague.
6. **Cobros digitales: ¿hay que llevar el saldo de Mercado Pago y del banco, con acreditaciones? ¿O alcanza con considerarlos disponibles al cobrar, por el neto?** Define si el procesador es un lugar con saldo y si hace falta conciliación.
7. **Cobro de un fiado en efectivo: ¿entra al cajón del turno?** Define si el cobro de cuenta corriente necesita un turno y si mueve el esperado.
8. **Las diferencias de caja: ¿son resultado?** Define si un faltante baja la ganancia o solo la plata.
9. **Deuda con el depósito: ¿cuál es la canónica cuando la entrega fue una venta interna?** El `aPagar` del tablero, el total de la `Venta` o el `MovimientoCuenta` si fue fiada (B.13). Sin esta respuesta, registrar el pago al depósito puede cancelar una deuda y dejar viva otra.
10. **El depósito: ¿tiene resultado económico propio?** Vende al costo a propósito, pero tiene caja, turnos y probablemente gastos. Define si el depósito es "un local más" en Finanzas o una cuenta aparte.
11. **Disponible para repartir: ¿qué se reserva antes de repartir?** Fondo de caja, dinero preparado, obligaciones que vencen en los próximos N días, un capital de trabajo mínimo. Es la fórmula de C.5.
12. **El reparto: ¿por local o consolidado del grupo?** La regla A sugiere por local; un reparto consolidado mezclaría fondos de varios locales.
13. **Mermas y ajustes de stock: ¿se valorizan y bajan el resultado?** Hoy no tienen importe (`AuditoriaStock` es de cantidades).
14. **Empleados: ¿alcanza con un gasto de categoría "personal" con beneficiario, o hacen falta adelantos que el empleado debe?** Define si E.9 necesita una entidad.
15. **La plata que vuelve al local o que aporta un dueño: ¿se distingue de un ingreso manual cualquiera?** Define si el INGRESO manual necesita origen.

---

## I. Orden de implementación recomendado

Tandas chicas y reversibles. **Nada de esto está implementado.**

1. **Clase PAGO_PROVEEDOR en `clasificarMovimientos`.**
   - Pura, sin schema. Quita el riesgo de doble conteo de B.10.
   - Es **prerrequisito** de sumar pagos al tablero.
   - No bloquea ninguna decisión.
2. **Sumar los pagos a proveedores al resumen del período**, como salida financiera y **no** como gasto.
   - Sale de `PagoProveedor.fecha`. Saca "Pagos a proveedores" de `METRICAS_NO_DISPONIBLES`.
   - Sin schema. Depende de 1.
3. **Primera pieza estructural: el lugar del dinero (E.1) más el traspaso (E.2)**, arrancando por "efectivo retirado del local" y vinculado al retiro existente.
   - Es lo que casi todo lo demás necesita para decir **de dónde** sale un pago, un gasto o un reparto.
   - Depende de H.3 preguntas 1 y 2.
   - No bloquea gastos ni depósito si el lugar se define extensible.
4. **Semana financiera configurable con historial.** Depende de H.3 pregunta 3. Se puede hacer en paralelo con 3.
5. **Cobro de cuenta corriente con medio y lugar (E.6).** Depende de 3 y de H.3 pregunta 7.
6. **Gasto con categoría configurable, y su pago (E.3 / E.4).** Depende de 3 y de H.3 pregunta 5. Recién ahí se puede sacar "Gastos operativos" de `METRICAS_NO_DISPONIBLES`.
7. **Pago al depósito por período congelado (E.5).** Depende de 3, 4 y H.3 pregunta 9.
8. **Distribución a dueños (E.7).** Depende de 3.
9. **Cierre semanal y puente Resultado → Disponible (F, D).** Depende de todo lo anterior y de H.3 preguntas 10 y 11.

**Lo que no se toca todavía:**

- la semántica de `CajaMovimiento` y de `calcularEfectivoEsperado`;
- `VentaPago` y la creación de ventas;
- el contrato de `CuentaPorPagarProveedor` / `PagoProveedor`, salvo lo que decida H.3 pregunta 2;
- las rutas de `auditoria-pos-ventas`;
- las correcciones de venta.

Los problemas de B.23, B.24 y J.2 se arreglan en tandas propias y no se mezclan con Finanzas.

---

## J. Reglas transversales para lo que venga

### J.1 UI y UX

- **[DECISIÓN APROBADA]** ERP Azul es mobile-first.
- Para las pantallas de pagos, el patrón visual y de interacción es **Pagos a proveedores en el celular**:
  - `components/finanzas/pagos/ListaCuentasPorPagar.jsx`
  - `TarjetaCuentaPorPagar.jsx`
  - `DetalleCuentaPorPagar.jsx`
  - `ModalRegistrarPago.jsx`
  - `CamposDeOrigenDelPago.jsx`
  - `ResumenDeCuentasPorPagar.jsx`
- Piezas del kit Sunmi, sin colores ni medidas fijas. El ERP tiene 14 temas (`lib/sunmiThemes.js`) y el contador de hardcodeo (`node scripts/hardcodeo.mjs --trinquete`) vigila que no entre deuda visual.
- **El escritorio de Finanzas no tiene diseño definitivo. No se improvisa:** antes de una pantalla nueva se define su UI reusando el sistema existente (regla 2 del kit en `CLAUDE.md`).

### J.2 Permisos

- **[VERIFICADO]** El sistema es por código de permiso (`lib/rbac/registry.js`, `checkPerm` en `lib/authorize.js`).
- Los de Finanzas **no** están en ningún rol de sistema, a propósito: se tildan por grupo.
- Cada acción nueva que mueva plata lleva **su propio** permiso, separado de `finanzas.ver`. Por ejemplo: registrar un gasto, un traspaso, un pago al depósito, un reparto.
- **Nunca** `if (rol === "DUEÑO")`.
- **[PROBLEMA]** Detalles vistos en el relevamiento:
  - `app/api/finanzas/tablero/route.js` y `turno/[turnoId]/route.js` escriben `"finanzas.ver"` literal en vez de `PERMISO_VER_FINANZAS`.
  - El comentario de `finanzas.ver` en `lib/rbac/registry.js` dice que el módulo "no escribe nada", y ya escribe pagos.
  - Mover la fecha prevista de una deuda (`PATCH pagos-proveedores/[cuentaId]`) exige los permisos y visibilidad, pero no operar la ubicación de la deuda.
  - Cerrar una compra exige `compras.crear` (`recibir/[id]/route.js:124`), mientras que las facturas usan `compras.recibir`.

### J.3 Contradicciones entre las reglas decididas y el código actual

1. **Semana configurable** frente a `CORTE_SEMANAL_FINANCIERO = 0` fijo y global (F.2).
2. **La plata retirada paga proveedores** frente a un pago en efectivo que exige turno abierto (B.10).
3. **Retiro ≠ gasto** frente a `lib/caja/efectivoEsperado.js:94-100` ("un gasto se registra como RETIRO") y al modal "Caja +/−", que ofrece "Gastos y salidas puntuales: pago a proveedor…".
4. **El pago al depósito cancela una única obligación** frente a una venta interna que puede tener hasta tres representaciones de la misma deuda (B.13).
5. **Comentarios desactualizados:**
   - `lib/finanzas/pagosProveedoresServer.js:9-12` dice que `crearCuentaPorPagarDesdeCompra` la llaman "solamente los candados", y hoy la llama `recibir`.
   - `lib/rbac/registry.js` dice que Finanzas "no escribe nada".
