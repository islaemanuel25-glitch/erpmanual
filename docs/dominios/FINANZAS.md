# Finanzas — Contrato funcional

**Estado:** contrato funcional, segunda revisión. No hay implementación nueva detrás de este archivo.
**Relevado:** 2026-09-24 sobre `main` en `1af04216b67bba5776a7506309519745d706ab7d`, el mismo commit que producción ese día.
**Revisión 2 (2026-09-24):** incorpora las correcciones funcionales aprobadas por Emanuel sobre la primera versión (`df80b82`) y la auditoría del stock histórico valorizado (sección D).
**Revisión 3 (2026-09-24):** sobre `49d7e37`, con `main` todavía en `1af0421`. Incorpora:
- el método de valuación semanal y la revalorización;
- la reutilización de la semana de Transferencias;
- la pertenencia de un turno a la semana en que abrió;
- el contrato de consolidación y foto (G.4 a G.6);
- recaudación bruta frente a rendimiento real;
- la base del flujo neto;
- el plan técnico por etapas (J).
**Alcance:** qué existe hoy en el ERP que tenga que ver con plata y con el valor del stock, qué está decidido, qué falta y en qué orden conviene construirlo. **No es un schema ni un diseño de pantallas.**

## Cómo leer esta ficha

- **[VERIFICADO]** existe en el código de `main` en el commit de arriba, con archivo y símbolo.
- **[PROBLEMA]** hay evidencia concreta de una falla, divergencia o riesgo.
- **[DECISIÓN APROBADA]** regla de negocio decidida por Emanuel, o respaldada por código vigente. Es contrato: no se reinterpreta.
- **[DECISIÓN PENDIENTE]** el código no la puede resolver; hace falta una definición de negocio.
- **[INFERIDO]** se deduce del código, pero no se ejerció contra una base.
- **[NO MEDIDO]** depende de cómo están los datos de producción, que desde el repo no se pueden ver.
- **[IDEA]** propuesta conceptual. No existe y no es todavía una decisión.

Los nombres de conceptos nuevos (secciones F y J) son provisorios. **No son nombres de tablas.**

---

## 0. Para qué existe Finanzas

Finanzas tiene que poder contestar, **por local y por período**:

1. ¿Cuánto se recaudó?
2. ¿Qué produjo económicamente la operación?
3. ¿Qué pasó con la plata después de los pagos que efectivamente se hicieron?
4. ¿Qué pasó con el valor del stock?
5. ¿Dónde está la plata?
6. ¿Qué deudas y obligaciones siguen pendientes?
7. ¿Cuánto quedó disponible para repartir?

No es una contabilidad académica. Modela cómo funciona este negocio, y **no es una segunda contabilidad paralela a la que el ERP ya lleva**: reusa las fuentes que existen.

---

## A. Estado exacto

### A.1 Commit y árbol

- **[VERIFICADO]** `main` y `origin/main` están en `1af04216b67bba5776a7506309519745d706ab7d`, igual que en la primera versión de este contrato. El árbol estaba limpio al empezar.
- **[VERIFICADO]** `docs/CURRENT_STATE.md` se relevó sobre `d20afa9`. Es histórico y no se usa como fuente.
- **[VERIFICADO]** El clon es superficial (`git rev-parse --is-shallow-repository` da `true`). El historial del schema arranca en `dea40f9`, así que **no se puede fechar desde el repo** cuándo nació cada columna.

### A.2 Qué es hoy el módulo Finanzas

**[VERIFICADO]** Es un módulo **de lectura** que tiene **una sola escritura**, la de los pagos a proveedores.

**Pantallas**

- `app/modulos/finanzas/page.jsx`: tablero.
- `app/modulos/finanzas/local/[localId]/page.jsx`: la cuenta financiera de un local.
- `app/modulos/finanzas/local/[localId]/turno/[turnoId]/page.jsx`: detalle de un turno.
- `app/modulos/finanzas/pagos-proveedores/page.jsx`: lista Pendientes / Pagados / Todos.
- `app/modulos/finanzas/pagos-proveedores/[cuentaId]/page.jsx`: detalle de la cuenta y registro de pagos.

**API**

- `app/api/finanzas/tablero/route.js`: resumen del período y actividad por día.
- `app/api/finanzas/turno/[turnoId]/route.js`
- `app/api/finanzas/pagos-proveedores/route.js`: la lista.
- `app/api/finanzas/pagos-proveedores/[cuentaId]/route.js`: GET del detalle y PATCH de la fecha prevista de pago.
- `app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js`: POST de un pago.
- `app/api/finanzas/pagos-proveedores/turnos-operativos/route.js`

**Lógica**

- `lib/finanzas/`: `resumenFinanciero`, `movimientosDeCaja`, `actividadFinanciera`, `alcanceFinanciero`, `periodoFinanciero`, `pagosProveedores` y `pagosProveedoresServer`, `calendarioDePagos`, `contextoFinanzas`, `localesDelGrupo`.
- Cada uno tiene su `*.test.mjs`.
- Hay además una prueba contra Postgres en `scripts/pruebas-db/finanzas.mjs`.

**Componentes:** `components/finanzas/*`, con los de pagos en `components/finanzas/pagos/*`.

**Permisos:** `finanzas.ver` (mirar) y `finanzas.pagos_proveedores.registrar` (registrar un pago), en `lib/rbac/registry.js`. Ninguno está asignado a un rol de sistema.

### A.3 Piezas canónicas que existen y NO se duplican

Todas verificadas en el commit de arriba, con su ruta real.

**Ventas y cobro**

- `whereVentaComercial` — `lib/ventas/filtroVentaComercial.js:159`. Define venta comercial: excluye las anuladas y las que tienen remito (internas).
- `tendersParaAgregar` — `lib/pos-ventas/pagos.js:296`.

**Caja**

- `desglosarVentas` — `lib/caja/efectivoEsperado.js:66`.
- `calcularEfectivoEsperado` — `lib/caja/efectivoEsperado.js:125`.
- `aCentavos` y `desdeCentavos` — `lib/caja/efectivoEsperado.js:43` y `:49`.
  - **[PROBLEMA]** `aCentavos` está definido cinco veces en el repo; `desdeCentavos`, tres.
  - Finanzas usa el de caja.

**Resumen de Finanzas**

- `clasificarMovimientos` — `lib/finanzas/movimientosDeCaja.js:63`.
- `resumenDelPeriodo`, `desglosarCobros`, `calcularMargen` y `METRICAS_NO_DISPONIBLES` — `lib/finanzas/resumenFinanciero.js:241`, `:122`, `:92` y `:47`.
- `localesFinancieros` y `ubicacionesVisibles` — `lib/finanzas/alcanceFinanciero.js:37` y `:172`.
- `rangoFinanciero` y `CORTE_SEMANAL_FINANCIERO` — `lib/finanzas/periodoFinanciero.js`.

**Deudas con proveedores**

- `crearCuentaPorPagarDesdeCompra` — `lib/finanzas/pagosProveedoresServer.js:481`.
- `registrarPagoProveedor` — `:285`.
- `puedePagarLaCuenta` — `:222`.
- `cuentaEnAlcance` — `:234`.
- `estadoDeCuenta` — `lib/finanzas/pagosProveedores.js:100`. Es **genérica** sobre `{ total, pagos }`.

**Deuda con el depósito**

- `bloquesPorLocal`, `cuentaDelLocal`, `acuerdoDeLocal` y `fechaDeCorte` — `lib/transferencias/bloquesPorLocal.js:104`, `:280`, `:82` y `:71`.
- `rangoDelPeriodo` y `UNIDADES` — `lib/transferencias/periodoDePago.js:136` y `:66`.
- `importeRecibidoDeLinea` e `importeRecibidoDeDetalleCentavos` — `lib/transferencias/agregadosPeriodo.js:265` y `:294`.

**Compras**

- `resolverTotalDelCierre` — `lib/compras-proveedor/pagoDelCierre.js:100`.

**Traspaso de caja entre turnos**

- `CambioPendiente` — `prisma/schema.prisma`.

### A.4 Modelos con plata o con valor de stock

Todos en `prisma/schema.prisma`.

- `Venta` y `VentaDetalle`, más `VentaDetalleComponente` para los combos: el hecho comercial, con el costo y el consumo de stock congelados.
- `VentaPago`: el cobro.
- `VentaCorreccion`: la bitácora de correcciones y anulaciones, con `impactoStock`.
- `MovimientoCuenta`: la cuenta corriente de clientes.
- `Turno`, `CajaMovimiento`, `ArqueoCaja`, `RetiroPreparacion`, `CierrePreparacion` y `CambioPendiente`: la caja física.
- `PedidoProveedor`, `PedidoProveedorDetalle`, `ComprobanteProveedor` y `ComprobanteLinea`: la compra.
- `CuentaPorPagarProveedor` y `PagoProveedor`: la deuda con el proveedor y su pago.
- `Transferencia`, `TransferenciaDetalle`, `PosTransferencia` y `AcuerdoDepositoLocal`: la mercadería depósito → local.
- `StockLocal` (cantidad y `enTransito`) y `AuditoriaStock`.
- `AuditoriaBitacora`, `PrecioUpdate` y `PrecioUpdateItem`, `ImportacionListaFila` y `DecisionDePrecioProveedor`: rastros de cambios de costo (sección D.2).

**[VERIFICADO]** No existe ningún modelo de gasto, categoría de gasto, sueldo, cuenta financiera, banco, billetera, saldo por medio, conciliación, distribución a dueños, movimiento de stock ni foto de stock.

---

## B. Mapa de eventos

Para cada evento: qué pasa **económicamente**, qué pasa **financieramente**, si cambia una **deuda**, si cambia el **stock**, **dónde está hoy** y **qué falta**.

### B.1 Venta

- **Económico:** ingreso (`Venta.total`) y costo de la mercadería vendida (`Venta.costoTotal`, congelado al vender).
- **Financiero:** ninguno por sí sola; el cobro es aparte.
- **Deuda:** no, salvo fiado (B.6).
- **Stock:** baja.
- **Hoy:** **[VERIFICADO]** se crea en `app/api/pos-ventas/crear/route.js`. El consumo se descuenta con `aplicarConsumoStock` (`lib/combos/ventaConsumo.js:167`) y queda congelado en `VentaDetalle.productoLocalId` + `cantidadStock`, o en `VentaDetalleComponente` para los combos.
- **Falta:** decidir qué margen es el oficial (I.3).

### B.2 Cobro en efectivo

- **Económico:** nada.
- **Financiero:** entra plata al cajón del turno.
- **Hoy:** **[VERIFICADO]** `VentaPago` con `medio = EFECTIVO`. Entra al efectivo esperado por `desglosarVentas`.

### B.3 Cobro con débito

- **Económico:** la comisión es un costo financiero.
- **Financiero:** plata a acreditar en el procesador, por el neto.
- **Hoy:** **[VERIFICADO]** `VentaPago` guarda `medio = DEBITO`, la comisión congelada, el neto, `procesador` (BANCO, MERCADOPAGO u OTRO) y la identidad del medio y la modalidad. **El lugar lo dice `procesador`, no el tipo contable.**
- **Falta:** acreditación y conciliación. `MedioCobroLocal.integracionJson` existe y nadie lo escribe.

### B.4 Cobro con crédito

Igual que débito. El recargo al cliente vive en `Venta.recargoPago*`.

### B.5 Cobro con Mercado Pago / QR

- **Hoy:** **[VERIFICADO]** `medio = MERCADOPAGO`, `procesador = MERCADOPAGO`.
- Es un registro manual, **sin integración**: `app/modulos/configuracion/pos-ventas/integraciones/page.jsx` lo declara.

### B.6 Venta fiada

- **Económico:** igual que cualquier venta.
- **Financiero:** no entra plata.
- **Deuda:** el cliente pasa a deber.
- **Stock:** baja.
- **Hoy:** **[VERIFICADO]**
  - Un `VentaPago` FIADO único.
  - Un `MovimientoCuenta` VENTA / DEBITO.
  - El saldo se deriva: Σ DEBITO − Σ CREDITO.

### B.7 Cobro posterior de un fiado

- **Económico:** nada.
- **Financiero:** entra plata.
- **Deuda:** la del cliente baja.
- **Hoy:** **[VERIFICADO]** `app/api/clientes/[id]/cuenta-corriente/pagos/route.js:58` crea un `MovimientoCuenta` PAGO / CREDITO con **monto y nota solamente**. No guarda medio, turno, `CajaMovimiento` ni `VentaPago`.
- **[PROBLEMA]** El efectivo cobrado así no entra al arqueo. Si se mete en el cajón, aparece como sobrante. **[INFERIDO]**
- **Falta:** el medio y el destino del cobro.

### B.8 Compra de mercadería

- **Económico:** **no es gasto.** La plata o la deuda se convierte en stock; el costo llega al vender.
- **Financiero:** nace una deuda.
- **Stock:** sube.
- **Hoy:** **[VERIFICADO]** `app/api/compras-proveedor/recibir/[id]/route.js` es la única ruta que pasa un pedido a RECIBIDO.
  - El stock entra a la ubicación dueña del pedido (`recibir`, línea 680).
  - El costo se actualiza con `actualizarCostoRealProducto`: el último costo pisa al anterior.
  - El caso "compro 20 kg de pan" ya tiene camino: `PedidoProveedor.nacidoDeFactura`, con pago inicial opcional.

### B.9 Deuda con proveedor

- **Hoy:** **[VERIFICADO]** `crearCuentaPorPagarDesdeCompra`, dentro de la transacción de `recibir`.
  - `localGastoId` es la ubicación dueña.
  - `total` sale de las facturas o de un total confirmado a mano (`resolverTotalDelCierre`).
  - El estado se deriva con `estadoDeCuenta`.
- **[PROBLEMA]** Ver B.23.

### B.10 Pago a proveedor en efectivo

- **Económico:** nada. **Pago ≠ gasto.**
- **Financiero:** sale efectivo del cajón.
- **Deuda:** baja.
- **Hoy:** **[VERIFICADO]** `registrarPagoProveedor` crea el `PagoProveedor` y un `CajaMovimiento` RETIRO en un **turno operativo del mismo local**, vinculados por `PagoProveedor.cajaMovimientoId` (único). Un CHECK de la base exige que vayan juntos.
- **[DECISIÓN APROBADA]** Que el pago en efectivo exija un turno operativo **es correcto**. El efectivo operativo sale de una caja del local.
  - El efectivo que ya se retiró **no** paga directamente a un proveedor.
  - Si ese efectivo vuelve a usarse, primero **reingresa a una caja del mismo local** (B.15) y recién ahí sale como pago.
  - La primera versión de este contrato marcaba esto como contradicción; **no lo es**.
- **[PROBLEMA]** `clasificarMovimientos` no conoce el vínculo con el pago. En el tablero, el RETIRO del pago aparece como "retiro manual" (`app/api/finanzas/tablero/route.js:256`). Si se suman los pagos sin arreglar eso, **el mismo efectivo cuenta dos veces**.
- **[PROBLEMA]** El modal "Caja +/−" (`components/pos-ventas/ModalCajaMovimiento.jsx:66`) ofrece "Gastos y salidas puntuales: pago a proveedor, cambio, adelantos". Un cajero puede sacar la plata por ahí **y además** registrar el pago en Finanzas. Nada los vincula.

### B.11 Pago a proveedor por otro medio

- **Hoy:** **[VERIFICADO]** `PagoProveedor` con medio TRANSFERENCIA, MERCADO_PAGO u OTRO, sin turno ni movimiento de caja.
- **[DECISIÓN APROBADA]** Un pago que realmente sale de Mercado Pago, del banco o de otro medio no efectivo **no pasa por la caja**, y no hay que forzarlo a entrar.
- **Falta:** de qué lugar salió, solo si se decide llevar ese saldo (C.5 e I.3).

### B.12 Transferencia depósito → local

- **Económico para el local:** entra stock. **Es inversión, no gasto**; el costo llega al vender.
- **Económico para el depósito:** sale stock. **No es venta comercial**: las internas quedan fuera de `whereVentaComercial`, y el depósito vende al costo a propósito (`docs/business-rules/deposito-vende-al-costo.md`).
- **Financiero:** ninguno al transferir.
- **Stock:** baja en el origen al enviar y sube en el destino al recibir.
- **Hoy:** **[VERIFICADO]** hay dos caminos:
  1. **Manual:** `PosTransferencia` → `crearTransferencia` (`lib/transferencias/crearTransferencia.js`).
  2. **Venta interna:** `Venta` + `VentaPago` + `Transferencia` con `ventaId`. Según el schema, es el camino que crea **casi todas** las transferencias. Si se cobra fiado, nace además un `MovimientoCuenta` DEBITO.
- **[DECISIÓN APROBADA]** Transferencias sigue siendo un módulo operativo independiente: preparación, envío, recepción, cantidades, diferencias, valorización y período. **Finanzas consume la obligación que resulta; no se muda.**
- **[PROBLEMA]** `aplicarCorreccionEconomica` corrige la `Venta` interna, pero no el `MovimientoCuenta` (`lib/transferencias/correccionEconomica.js:36-42`).

### B.13 Deuda del local con el depósito

- **Hoy:** **[VERIFICADO]** se calcula y se muestra; no se persiste.
  - `cuentaDelLocal` suma `importeRecibidoDeLinea` de las transferencias no canceladas cuya `fechaDeCorte` (la de envío) cae en el período del acuerdo.
  - Cada línea vale recibido × `precioCosto` congelado. Si todavía no se contó, vale lo enviado.
- **[PROBLEMA]** `importeRecibidoDeLinea` cae al **costo vivo** cuando `precioCosto` es null (`agregadosPeriodo.js:267-268`).
- **[PROBLEMA]** El tablero de transferencias no excluye las que tienen `ventaId`. Una entrega interna puede tener hasta **tres** representaciones de lo que se debe:
  - el `aPagar`;
  - el total de la `Venta` interna;
  - el `MovimientoCuenta` DEBITO, si fue fiada.
- **[VERIFICADO]** El schema de `AcuerdoDepositoLocal` (`prisma/schema.prisma:90-112`) avisa que el día que exista el pago, el período tiene que quedar **congelado en el pago** y `diaDeCorte` necesita **historial**.

### B.14 Pago semanal al depósito

- **Económico:** nada. Es cancelación de una obligación: no es gasto y no vuelve a tocar el costo de la mercadería.
- **Financiero:** sale plata del local y entra al depósito.
- **Deuda:** baja.
- **Hoy:** **[VERIFICADO] no existe.**
- **[DECISIÓN APROBADA]** Objetivo: en Finanzas aparece el importe de las transferencias del período, con una acción **Pagar**.
  - Al pagar, la obligación queda pagada o parcial.
  - El pago aparece como salida financiera de la semana.
  - **No hay una deuda por cada transferencia**: la obligación es del local por período. Se reusa `bloquesPorLocal`, `cuentaDelLocal`, `periodoDePago`, `AcuerdoDepositoLocal` y la valorización existente.

### B.15 Retiro de recaudación

- **Económico:** nada. **No es gasto ni reparto.**
- **Financiero:** es un traspaso del cajón a "efectivo retirado".
- **[DECISIÓN APROBADA]** El efectivo retirado **sigue perteneciendo siempre al local del que salió**.
  - Si una misma persona tiene $500.000 de Casiano y $300.000 de Mini el 7, **financieramente no se mezclan**.
  - Si el efectivo vuelve a usarse como efectivo operativo, **reingresa a una caja del mismo local**. El reingreso **no se implementa todavía**.
- **Hoy:** **[VERIFICADO]**
  - El retiro: `RetiroPreparacion` → `app/api/pos-ventas/retiros/[token]/confirmar/route.js` crea un `ArqueoCaja` PARCIAL y un `CajaMovimiento` RETIRO.
  - El cierre crea otro RETIRO, referenciado desde `Turno.retiroCierreMovimientoId`.
  - Finanzas ya separa la recaudación de los manuales (`clasificarMovimientos`).
- **[PROBLEMA]** Nadie escribe `ArqueoCaja.destino`, `recibidoPor` ni `entregadoAt`. `estadoEntrega` nunca pasa a ENTREGADO.
- **[PROBLEMA]** El cierre con relevo no guarda destino. El clásico lo guarda como texto (`Turno.destinoRetiroCierre`).
- **[PROBLEMA]** El único camino de vuelta que existe hoy es un INGRESO manual con motivo libre: no dice de dónde viene.
- **Falta:** el saldo de "efectivo retirado" por local y su reingreso.

### B.16 Dinero preparado

- **Económico:** nada; mover plata no es gastarla.
- **Financiero:** traspaso a una reserva del local.
- **Hoy:** **[VERIFICADO]** lo más parecido es `CambioPendiente`, que es solo el fondo de cambio y queda absorbido en `montoInicial`.
- Registrarlo hoy como RETIRO manual hace desaparecer la plata. Si se mete en el sobre, se mezcla con el fondo.
- **Falta:** la reserva con propósito (I.3).
- **Regla que aplica ya:** si el dinero preparado es efectivo que salió de la caja, para usarlo en una compra en efectivo **vuelve a una caja del mismo local**, igual que el retirado.

### B.17 Gasto

- **Económico:** baja el resultado operativo del período al que corresponde.
- **Hoy:** **[VERIFICADO] no existe.** `lib/finanzas/resumenFinanciero.js:9-14` y `METRICAS_NO_DISPONIBLES` lo informan como ausencia.
- **[PROBLEMA]** `lib/caja/efectivoEsperado.js:94-100` dice que "un gasto se registra como RETIRO". Contradice que retiro ≠ gasto.

### B.18 Pago de un gasto

- **Hoy:** no existe. Solo se puede hacer como RETIRO manual.

### B.19 Pago a empleados

- Es un gasto del local, más su pago.
- **Hoy:** **[VERIFICADO] no existe.** `lib/menu/capabilityCatalog.js:148` declara `empleados` como módulo futuro.
- Retirar plata para después pagar sueldos es un traspaso, no un gasto. El gasto nace al registrar el sueldo.

### B.20 Reparto de ganancia

- No es gasto. Es la distribución a los dueños.
- **Hoy:** no existe.

### Otros eventos que aparecieron

- **B.21 Comisiones de medios.** **[VERIFICADO]** Congeladas por tender. Son costo financiero y hoy no entran al margen de Finanzas.
- **B.22 Diferencias de caja.** **[VERIFICADO]** `ArqueoCaja.diferencia` y `Turno.diferenciaEfectivo`. No se imputan.
- **B.23 La compra cambia después de cerrada.** **[VERIFICADO]**
  - La deuda y `PedidoProveedor.totalReal` son la misma cifra guardada dos veces.
  - Nadie escribe `ComprobanteProveedor.confirmadoEn`, así que las facturas de un pedido RECIBIDO siguen editables.
  - `comprobantes/aceptar-precio` (`route.js:356`) y `comprobantes/vincular` (`route.js:200`) escriben `PedidoProveedorDetalle.precioCosto` sin mirar el estado del pedido. **No se ejerció contra una base.**
  - Las rutas de ítems y `recepcion/correccion` sí rechazan un pedido RECIBIDO.
- **B.24 Correcciones de venta.** **[VERIFICADO]** `app/api/pos-ventas/venta/[id]/corregir/route.js`:
  - reescribe `VentaPago` sin la identidad del medio;
  - recalcula el total sin ofertas ni recargo;
  - usa otra base para los márgenes;
  - aplica un delta de stock (`aplicarDeltaStock`).
- **B.25 Anulación de venta.** **[VERIFICADO]** `revertirVenta` marca `anuladaEn` y devuelve el stock. Hoy la llama solo `app/api/transferencias/cancelar/route.js`.
- **B.26 Ingreso manual de caja.** **[VERIFICADO]** `CajaMovimiento` INGRESO con motivo libre. Hoy es el único camino por el que puede volver efectivo retirado, y no lo distingue.
- **B.27 Ajuste manual de stock y merma.** **[VERIFICADO]** `app/api/stock_locales/ajustar/route.js` deja `AuditoriaStock` con las acciones AJUSTE_FIJAR, AJUSTE_RESTAR y AJUSTE_SUMAR y un motivo libre. **No hay un tipo "merma" ni valor económico.**

---

## C. Las magnitudes, y por qué no se mezclan

**[DECISIÓN APROBADA]** Recaudación, resultado operativo y "lo que quedó" son tres magnitudes distintas. Además, la **variación del stock valorizado** es la explicación patrimonial que hace falta para leerlas juntas.

- Ninguna se deriva de las otras.
- **No se fuerza una fórmula para que "cierren"** si faltan hechos.
- Lo que falta se informa **NO DISPONIBLE**, con el mismo principio que `METRICAS_NO_DISPONIBLES`.

### C.1 Recaudación

**Qué es:** cuánto dinero se cobró por ventas en el período, por medio.

- **Suma:** los tenders de las ventas comerciales del período. Sale de `tendersParaAgregar` sobre `whereVentaComercial` e informa bruto, comisión y neto. **[VERIFICADO]** `desglosarCobros` ya lo hace.
- **No entra:**
  - FIADO (no es cobro);
  - las ventas internas y las anuladas;
  - los ingresos manuales de caja;
  - el fondo inicial;
  - los retiros, traspasos y reingresos.
- **Fuente:** `VentaPago`. **No se crea otra.**
- **Hueco:** los cobros posteriores de fiado también son recaudación y hoy no tienen medio (B.7).
- **[DECISIÓN APROBADA]** La semana de una venta es **la semana de su turno** (G.3), no la de su timestamp.
- **[PROBLEMA]** Hoy el resumen de Finanzas corta las ventas por `Venta.fecha` (`app/api/finanzas/tablero/route.js`). Es el calendario, así que contradice la regla aprobada. Los turnos, en cambio, ya se asignan por `apertura`, en ese mismo archivo.

### C.1 bis Recaudación bruta y rendimiento real del cobro

**[DECISIÓN APROBADA]** Se conservan las dos cifras y se explica el paso de una a otra:

**bruto → comisión o costo del medio → neto real.**

Ejemplo:

- Mercado Pago: 100.000 bruto, −4.000, **96.000 neto**.
- Débito: 100.000 bruto, −2.000, **98.000 neto**.
- Efectivo: 100.000 bruto, 0, **100.000 neto**.

No se esconde la comisión haciendo parecer que se vendió 96.000.

**[VERIFICADO] Qué significa hoy cada campo de `VentaPago`**, en `prisma/schema.prisma` (modelo `VentaPago`) y `lib/pos-ventas/pagos.js`:

- **`monto`**
  - Es el importe **aplicado a la venta** por ese tender. No es el "paga con": el vuelto no se guarda.
  - La suma de los tenders da `Venta.total`, así que **ya incluye el recargo de pago**.
  - Es el **bruto** por medio.
- **Recargo:** vive **solo en `Venta`**: `recargoPagoPct`, `recargoPagoImporte`, y el medio o la modalidad que lo impuso. **No se reparte por tender.** En un pago mixto no se sabe qué parte del recargo cobró cada medio.
- **`comisionPct`, `comision` y `neto`:** los calcula `comisionDeTender` (`lib/pos-ventas/pagos.js`).
  - `comision = monto × pct / 100`.
  - `neto = monto − comision`.
  - Quedan **congelados al vender**.
  - El pct sale de la cadena modalidad → medio → grupo (`MedioCobroModalidadLocal`).
  - **Es la comisión CONFIGURADA, no la liquidada por el procesador.**
- **Comisión sin configurar:** en un medio que cobra comisión y no tiene porcentaje:
  - `comisionPct` queda **null**;
  - `comision` queda en 0;
  - `neto = monto`, como **placeholder**;
  - `Venta.comisionPendiente = true`.
- **`procesador`:** por dónde pasó la plata (MERCADOPAGO, BANCO u OTRO). Es null en efectivo y en las ventas legacy.
- **`modalidadId` y `modalidadNombre`:** la condición elegida; su tipo contable es el que termina en `medio`.
- **Ventas legacy sin `VentaPago`:** `tendersParaAgregar` arma un único tender desde `formaPago`, `total`, `comisionBancaria` y `netoRecibido`.

**¿Alcanza `VentaPago` para bruto, comisión y neto por medio?**

**Sí, para bruto y comisión estimada; con dos huecos:**

- **[PROBLEMA]** `tendersParaAgregar` devuelve `medio`, `monto`, `comision` y `neto`, y **descarta `comisionPct`**. Finanzas tampoco pide `comisionPendiente` (`SELECT_VENTA` en `tablero/route.js`).
  - Resultado: en un débito sin comisión configurada, **el neto se suma igual al bruto, en silencio**.
  - El dato para marcarlo **existe**: `comisionPct` null en un medio de `MEDIOS_CON_COMISION`. **No hace falta schema:** hace falta llevarlo hasta el desglose.
- **[PROBLEMA]** La comisión es la **configurada**. No incluye:
  - el IVA sobre la comisión;
  - retenciones;
  - el costo de cuotas;
  - contracargos;
  - la fecha de acreditación.

  El neto de `VentaPago` es un **neto estimado**.
  - **[DECISIÓN PENDIENTE]** Si el "rendimiento real" exige la liquidación real, hace falta conciliación con el procesador. Hoy no existe, y `integracionJson` está sin uso.
- Después de una corrección completa, `VentaPago` pierde `procesador` y `modalidad` (B.24).

**Fuente única:** `desglosarCobros` ya devuelve `monto`, `comision` y `neto` por medio. **No se duplica ninguna cuenta.**

### C.2 Resultado operativo

**Qué es:** qué produjo económicamente la operación. Conceptualmente:

- ventas comerciales
- − costo de la mercadería vendida
- − personal, alquiler, electricidad, reparaciones, consumibles internos y otros gastos operativos reales
- − costos o comisiones financieras que correspondan
- = resultado operativo

**No entran:**

- **las compras de mercadería**: afectan por el costo de lo vendido;
- **los pagos de deudas**: a proveedor, al depósito, o de un gasto ya reconocido. Un pago no vuelve a ser gasto;
- los retiros, traspasos y reingresos;
- los repartos;
- los ingresos manuales de caja.

**Fuentes:**

- ventas y costo: `calcularMargen` (Σ `total` − Σ `costoTotal`) **[VERIFICADO]**;
- comisiones: `desglosarCobros` **[VERIFICADO]**;
- gastos: **no existen**.

**Huecos:**

- **[DECISIÓN PENDIENTE]** Las ventas, ¿con o sin recargo? La comisión, ¿en el margen o abajo, como costo financiero?
- **[PROBLEMA]** El costo congelado es el costo vigente al vender, no un promedio (D.2).
- **[PROBLEMA]** Las correcciones de venta reescriben el costo y los márgenes con otra base (B.24).
- **[DECISIÓN PENDIENTE]** Mermas y diferencias de caja: ¿entran como costo?
- Mientras no existan los gastos, **el resultado operativo es NO DISPONIBLE**. El margen de mercadería sí se muestra, con ese nombre y no como "resultado".

### C.3 Lo que quedó: flujo neto de la semana (nombre recomendado)

**[DECISIÓN APROBADA]** Es la verdad financiera de la semana: la recaudación menos los pagos **efectivamente realizados** en la semana.

Ejemplo conceptual:

- Recaudado: 700.000 en efectivo + 140.000 en Mercado Pago = 840.000.
- Pagos de la semana:
  - depósito: −300.000;
  - empleados: −100.000;
  - proveedores: −50.000.
- Quedó: 840.000 − 450.000 = **390.000**.

**Reglas:**

- Puede ser negativo. −10.000 significa que en la semana salió más de lo que se recaudó, **no** que el negocio perdió 10.000.
- **Nunca se llama "ganancia"** y nunca se lee aislado: va junto al resultado operativo (C.2) y a la variación del stock (C.4).

**Nombre: se recomienda "Flujo neto de la semana"** (solo terminología; no se impone). Las otras opciones tienen un choque:

- "Disponible de la semana" choca con "disponible para repartir" (C.6), que es otra cosa.
- "Resultado de caja" se confunde con el arqueo del turno y con el "resultado" económico.
- "Saldo de la semana" se confunde con el saldo de una cuenta.

"Flujo neto" dice lo que es —entradas reales menos salidas reales—, admite signo negativo sin parecer una pérdida y no suena a ganancia. La pantalla puede acompañarlo con una bajada: "cobros netos menos pagos realizados".

**[DECISIÓN APROBADA] Base: el neto real del cobro, no el bruto.**

- Se parte de la recaudación **neta** (C.1 bis): el bruto menos las comisiones que efectivamente se descuentan.
- La explicación **bruto → comisiones → neto** tiene que poder verse. No se oculta ninguno de los tres.
- Mientras haya tenders con comisión pendiente de configurar, el neto de esos tenders **no es una medición**, y el flujo neto se rotula incompleto (C.1 bis).

**Qué suma y qué resta:**

- **Suma:** la recaudación neta del período (C.1 bis), incluidos los cobros de fiado cuando tengan medio.
- **Resta:** los pagos **realmente realizados** en la semana:
  - a proveedores (`PagoProveedor.fecha`, cualquier medio);
  - al depósito (no existe todavía);
  - a empleados, alquiler, servicios y otros gastos (no existen todavía).
- **No es el resultado operativo:** acá sí resta el pago de una deuda, porque es plata que salió. En el resultado operativo no.
- **Tratamiento pendiente** — distribuciones, aportes, ingresos manuales y diferencias de caja: ¿entran o se informan aparte? **[DECISIÓN PENDIENTE]**
- **No entra:** los traspasos entre lugares del mismo local (retiro, reingreso, dinero preparado), que no son ni entrada ni salida.

**Fuentes hoy:**

- recaudación, **[VERIFICADO]**;
- pagos a proveedores, **[VERIFICADO]**: existen, pero el tablero todavía no los suma, y cuando lo haga tiene que resolver antes el doble conteo de B.10.

**Huecos:**

- el pago al depósito;
- los gastos y sus pagos;
- el medio de los cobros de fiado.

Mientras falten, "lo que quedó" solo se puede mostrar **parcial y rotulado como tal**, o como NO DISPONIBLE.

**Cerrado en la revisión 3:** el flujo neto se calcula sobre el **neto** de comisiones, mostrando también el bruto.

### C.4 Variación del stock valorizado

**[DECISIÓN APROBADA]** Es parte crítica de la explicación. "Lo que quedó" nunca se interpreta aislado como ganancia: se lee con el resultado operativo y con la variación del stock.

- **Caso reinversión:** quedó poca plata, pero el stock pasó de 10.000.000 a 12.000.000.
- **Caso desstockeo:** quedaron 10.000.000, pero el stock pasó de 18.000.000 a 8.000.000. No es una ganancia extraordinaria: se convirtió mercadería vieja en plata.

**Hoy:** **no se puede calcular de forma confiable.** La auditoría completa está en la sección D. En resumen:

- no hay foto histórica del stock;
- no hay libro de movimientos de stock;
- no hay costo histórico por producto que sea un registro financiero.

**Hasta que exista el dato que falta (D.6), la variación del stock es NO DISPONIBLE.** No se reemplaza por "compras − costo de lo vendido" presentado como si fuera la variación: eso deja afuera mermas, ajustes, revalorizaciones y errores de carga.

**[DECISIÓN APROBADA] Método de valuación: cantidad al corte × costo vigente al corte.**

- La foto congela, por local y producto:
  - la **cantidad**;
  - el **costo unitario vigente**;
  - el **valor** resultante;
  - el **método** (`COSTO_VIGENTE_AL_CORTE`, o el nombre que se elija).
- **No** hay promedio, **no** hay FIFO y **no** cambia el modelo de costos actual: el último costo sigue pisando al anterior.
- **Una foto no se recalcula nunca** aunque después cambie el costo.
- El costo vigente se toma con **la misma regla** que ya usa `app/api/reportes-stock/valorizado/route.js`:
  - `ProductoLocal.precio_costo` o, si falta, el de la base;
  - dividido por `factor_pack` cuando el precio es del bulto;
  - con el caso especial del fiambre fijo en depósito.

  Hoy esa regla está **escrita adentro de la ruta**. Tiene que salir a una función compartida, y no copiarse (regla 1 del repo).

**[DECISIÓN APROBADA] Revalorización.** Si entre dos fotos el valor cambia solo porque cambió el costo, esa diferencia se identifica como **REVALORIZACIÓN**.

- **No es:** venta, recaudación, compra ni ganancia por venta.
- **Se muestra aparte**, para explicar la variación.
- Ejemplo sin movimiento físico:
  - semana A: 20 × 1.500 = 30.000;
  - semana B: 20 × 1.700 = 34.000;
  - variación +4.000, por revalorización.
- **[DECISIÓN PENDIENTE] Convención cuando además hubo movimiento físico.** Se propone, por producto:
  - **revalorización = cantidad de la foto anterior × (costo nuevo − costo anterior);**
  - **variación por cantidad = (cantidad nueva − cantidad anterior) × costo nuevo.**

  Las dos suman exactamente la variación total y no dejan residuo. Otra convención válida invierte los costos; lo que importa es fijar una y no cambiarla.
- Un producto que aparece o desaparece entre dos fotos tiene cantidad 0 del otro lado, y la convención sigue valiendo. Si no tenía costo en la foto anterior, su revalorización es 0.

### C.5 Posición: dónde está la plata

- **Hoy se deriva:**
  - el efectivo en el cajón de un turno abierto (`calcularEfectivoEsperado`);
  - el sobre de cambio pendiente (`CambioPendiente`).
- **Hoy no existe:**
  - el efectivo retirado por local (B.15);
  - los saldos de Mercado Pago o banco;
  - el dinero preparado.
- **[DECISIÓN APROBADA]** Cada importe pertenece a un local. Plata de dos locales en manos de una persona no se suma.
- **No se asume** que la posición necesite desde ya un mayor, un banco o una billetera completos. Qué lugares hacen falta se decide después de esta auditoría (sección F, I.3).

### C.6 Disponible para repartir

- **No es** el resultado operativo **ni** "lo que quedó".
- Parte de la posición, menos obligaciones pendientes y reservas que se decida mantener.
- **[DECISIÓN PENDIENTE] No tiene fórmula cerrada.** Qué reservas se descuentan (fondo de caja, dinero preparado, capital de trabajo, obligaciones que vencen pronto) es una decisión de Emanuel.
- **Hoy:** solo existe la parte de proveedores (`estadoDeCuenta` sobre `CuentaPorPagarProveedor`). Todo lo demás es NO DISPONIBLE.

---

## D. Auditoría: stock histórico valorizado

La pregunta: ¿puede ERP Azul **hoy** reconstruir "stock valorizado al inicio de la semana → movimientos → stock valorizado al cierre"?

**Respuesta corta: no.**

- La cantidad actual es confiable.
- La cantidad histórica solo se puede reconstruir en parte.
- El valor histórico no se puede reconstruir como dato confiable.

La evidencia sigue.

### D.1 Cantidad histórica

**La fuente canónica de cantidades es `StockLocal.cantidad`**, junto con `enTransito`, por local y `ProductoLocal`. **[VERIFICADO]**

- Es un **saldo actual**, no un libro: cada escritor lo modifica en el lugar, con `increment`, `decrement` o sobrescribiendo.
- **No existe un modelo de movimientos de stock.**

**`AuditoriaStock` NO alcanza.** **[VERIFICADO]** Se enumeraron sus escritores con `git grep --untracked "auditoriaStock.create"` sobre `app/` y `lib/`. Son solo tres:

- `app/api/stock_locales/ajustar/route.js`: AJUSTE_FIJAR, AJUSTE_RESTAR y AJUSTE_SUMAR, con `cantidadAnterior` y `cantidadNueva`. También LIMITES, que no mueve cantidad.
- `app/api/stock_locales/limites/route.js`: LIMITES, que no mueve cantidad.
- `app/api/transferencias/confirmar-recepcion/route.js:668`: solo las **diferencias del lado del origen** en una recepción (faltante devuelto, excedente o agregado). Tiene `transferenciaDetalleId` desde la migración `20260908130000_recepcion_diferencias_positivas`.

**Todos los caminos que cambian `StockLocal.cantidad`**, enumerados con `git grep --untracked` sobre `app/` y `lib/`, y qué rastro fechado deja cada uno:

1. **Venta del POS** (`lib/combos/ventaConsumo.js:211`).
   - Rastro: `VentaDetalle.productoLocalId` + `cantidadStock` en escala física, o `VentaDetalleComponente` en los combos, con `Venta.fecha`.
   - **[PROBLEMA]** Las líneas **legacy** tienen `cantidadStock` en null.
   - Su consumo se reconstruye con heurísticas y **a veces es ambiguo**: `lib/pos-ventas/correccionCompletaServer.js:68-100` y `scripts/integracion-legacy-consumo.mjs`, con el caso "MIXTO sin coincidencia".
   - Cuántas líneas legacy hay es **[NO MEDIDO]**.
2. **Anulación de venta** (`lib/pos-ventas/reversionVenta.js:124`, con `aplicarDeltaStock`).
   - Rastro: `Venta.anuladaEn` + `VentaCorreccion.impactoStock` (JSON).
3. **Corrección completa de venta** (`app/api/pos-ventas/venta/[id]/corregir/route.js:217`).
   - Rastro: `VentaCorreccion.impactoStock` (JSON, con `productoLocalId`, `delta` y `resultante`) + `createdAt`, y los snapshots antes y después.
   - Los `VentaDetalle` se recrean: el consumo original queda solo en el snapshot.
4. **Compra recibida** (`app/api/compras-proveedor/recibir/[id]/route.js:680`).
   - Rastro: `PedidoProveedor.fechaRecibido` + `PedidoProveedorDetalle.cantidadRecibida`, `kgRecibidos`, `unidadesSueltas` y `unidadesFisicas`.
   - **[PROBLEMA]** El incremento que entró al stock **no se guarda como tal**: la ruta lo recalcula en el momento.
     - Toma `unidadesFisicas` si vino en el cuerpo del pedido.
     - Si no, `cantidadRecibida` × `factor_pack` **del catálogo vivo**.
     - En productos por kilo, `kgRecibidos`.
   - Reconstruirlo después con el `factor_pack` actual puede dar otro número si el factor cambió.
   - El `ProductoLocal` destino tampoco se guarda: se resuelve por `baseId` y dueño (`resolverProductoLocalDestino`, línea 89).
5. **Envío de transferencia** (`lib/transferencias/crearTransferencia.js:141`).
   - Rastro: `TransferenciaDetalle.cantidad` + `unidadEnviada` + `Transferencia.fechaEnvio` o `createdAt`.
   - El factor queda congelado en `factorPresentacion` desde la migración `20260909170000_presentacion_envio_snapshot`; antes se lee del catálogo vivo.
   - La venta interna usa `SOLO_TRANSITO`, porque la venta ya descontó.
6. **Recepción de transferencia en el destino** (`app/api/transferencias/confirmar-recepcion/route.js`).
   - Rastro: `TransferenciaDetalle.recibido` + `recibidoUnidadesSueltas` + snapshot + `fechaRecepcion` por línea.
   - En el destino **no** se escribe `AuditoriaStock`.
7. **Cancelación de transferencia** (`app/api/transferencias/cancelar/route.js:260`).
   - Rastro: `Transferencia.canceladaEn` + las líneas.
   - Si nació de una venta, también `revertirVenta`.
8. **Ajuste manual** (`stock_locales/ajustar`).
   - Rastro: `AuditoriaStock` con antes y después. **Es el único camino con rastro completo.**
   - Las mermas entran por acá como AJUSTE_RESTAR con motivo libre.
9. **Importación de productos con `stock_inicial`** (`app/api/productos/import/apply/route.js:288`).
   - **Sobrescribe** `cantidad` **sin ningún rastro**. **[PROBLEMA]**
10. **Borrados.**
    - `app/api/productos/eliminar/[id]/route.js:87` y `app/api/admin/reset-operativo/route.js:255` hacen `deleteMany` sin rastro.
11. **Altas de filas en cero.**
    - `productos/crear`, `stock_locales/nuevo`, `stock_locales/importar`, `stock_locales/listar`, `promover-a-deposito`, `lib/grupos.js` y `ajustar` cuando la fila no existe.
    - Crean la fila con cantidad 0. **Neutras.**
12. **Scripts** que escriben stock fuera de la aplicación, por ejemplo `scripts/diagnostico-fiambre-piezas.js:210`.
    - Si alguno se corrió sobre producción, no dejó rastro. **[NO MEDIDO]**

**Conclusión sobre la cantidad histórica:** **PARCIAL.**

- Se podría intentar "rebobinar" desde el saldo actual restando los eventos posteriores a una fecha. Para eso hacen falta **todos** los eventos con fecha y cantidad exacta.
- Hoy se rompe en seis puntos:
  - ventas legacy sin `cantidadStock`;
  - compras sin `unidadesFisicas`, que dependen del factor vivo;
  - transferencias anteriores al snapshot de presentación;
  - importaciones que sobrescriben;
  - borrados;
  - scripts.
- Para un producto que no pasó por ninguno de esos casos, la reconstrucción puede salir bien. **Para el stock total de un local, no se puede garantizar.**

### D.2 Valorización histórica: qué costo existe realmente

**Congelado en la operación [VERIFICADO]**

- **`VentaDetalle.precioCosto`**, `VentaDetalleComponente.precioCosto` y `Venta.costoTotal`: el costo por unidad **vigente al vender**.
  - **[PROBLEMA]** Viene del **cliente** cuando el cliente lo manda (`lib/combos/ventaConsumo.js:141-144`); si no, del catálogo, dividido por `factor_pack`.
  - El valor que manda el cliente sale de `buscar-producto` en el momento de agregar al carrito. En una venta offline repetida o con el carrito abierto mucho tiempo, puede no ser el vigente al registrar.
- **`TransferenciaDetalle.precioCosto`**: el costo del **origen** al enviar (`crearTransferencia.js`).
  - Se escribe como `origen.precio_costo || base.precio_costo || 0`: un producto sin costo viaja **valorizado en cero**.
  - Las filas anteriores a la columna tienen null y se valorizan **con el costo vivo** al leerlas (`agregadosPeriodo.js:267-268`).
- **`PedidoProveedorDetalle.precioCosto`**: el costo por unidad de pedido (bulto o unidad).
  - **[PROBLEMA]** Se puede reescribir después de recibido (B.23).
- **`ComprobanteLinea`**: los importes de la factura leída, editables mientras nadie la confirme (nadie la confirma).

**Historial del costo del producto — no es un registro financiero**

- **`AuditoriaBitacora`**, poblada por el interceptor `lib/auditoria/interceptor.js`.
  - Registra antes y después de `ProductoBase` y `ProductoLocal` en `update` y `updateMany`, así que el costo queda en JSON.
  - Es **best-effort por diseño** ("nunca rompe el negocio"). Funciona dentro de un request: lo que se escribe desde scripts no pasa por ahí.
  - `updateMany` de `ProductoBase` se agregó el 2026-09-05. Antes, el aumento masivo de costos no dejaba rastro (comentario en el mismo archivo).
  - Es la mejor fuente existente para reconstruir un costo a una fecha. **No sirve como base de un valor contable.**
- **`PrecioUpdateItem`**: `costoAnterior` y `costoNuevo`, solo de `app/api/productos/precios/apply/route.js`.
- **`ImportacionListaFila`**: `costoAnterior`, `costoAplicado`, `costoPrevioAplicacion` y `revertidaEn`, solo del circuito de listas de proveedor.
- **`DecisionDePrecioProveedor`**: **una fila por proveedor y producto, que se pisa**. No es historial.
- **El costo se escribe desde muchos caminos.** Entre otros: `productos/crear`, `productos/editar/[id]`, `productos/import/apply`, `productos/precios/apply`, `proveedores/listas/[id]/aplicar` y `revertir`, `compras-proveedor/recibir/[id]`, `grupos/[id]/sync-productos`, `productos/promover-a-deposito`, `lib/combos/service.js`, `lib/precios/propagarCostoALocales.js` y `lib/transferencias/crearTransferencia.js`, que lo copia al crear el `ProductoLocal` del destino. Se enumeraron con `git grep "precio_costo:"` sobre `app/` y `lib/`, descartando los `select`. **Solo los tres de arriba dejan un historial propio.** Los demás dependen de la bitácora best-effort.

**Método de costeo**

- **[VERIFICADO]** No hay costo promedio ni capas FIFO: el último costo pisa al anterior (`actualizarCostoRealProducto`) y se propaga a los locales (`lib/precios/propagarCostoALocales.js`).
- **[VERIFICADO]** El reporte actual `app/api/reportes-stock/valorizado/route.js` valoriza con el costo **actual**. No sirve para el pasado sin reescribirlo.

**Conclusión:** "cantidad histórica × costo histórico" **no es confiable hoy**.

- La cantidad es parcial (D.1).
- El costo de un producto a una fecha solo se puede aproximar desde una bitácora best-effort.

### D.3 Entradas, salidas y ajustes: ¿cierra la identidad?

La identidad "stock inicial + entradas − salidas ± ajustes = stock final" **solo cierra si todo se valoriza con el mismo método.** Hoy cada pieza usa uno distinto:

- **Entradas por compra:** a costo de factura. Además:
  - `CuentaPorPagarProveedor.total` es el total de la factura y puede incluir impuestos y renglones que no son mercadería;
  - `PedidoProveedor.totalFactura` (cantidad × costo) es más cercano al valor del stock, pero es un control.
  - Si el costo del producto incluye o no IVA es **[DECISIÓN PENDIENTE]**.
- **Entradas por transferencia:** a `precioCosto` del origen al enviar.
- **Salidas por venta:** al costo vigente al vender (`Venta.costoTotal`).
- **Ajustes y mermas:** solo cantidades. No tienen costo congelado.

Con "último costo", el mismo producto vale distinto en cada fecha. La diferencia entre la foto inicial y la final incluye una **revalorización** que ninguna operación registra.

Por eso:

- **[DECISIÓN APROBADA en la revisión 3]** El método es **costo vigente al corte**, con una línea de **revalorización** (C.4). Se descartaron:
  - el promedio ponderado, que cambiaría el costo que ya congelan las ventas;
  - FIFO, que exige un libro de movimientos completo.
- **[PROBLEMA]** Si se muestra "entradas − costo de lo vendido" como variación de stock, se esconden las mermas, los ajustes, la revalorización y los errores. Está prohibido presentarlo así (C.4).

### D.4 Transferencias internas

- **Para el local:** entra stock valorizado a `TransferenciaDetalle.precioCosto`, y nace una obligación valorizada **igual**, por `importeRecibidoDeLinea`. Son la misma cifra: **Δstock = obligación**.
  - Después, el costo de lo vendido del local usa el costo vigente de **su** `ProductoLocal`, propagado del maestro, que puede haber cambiado.
- **Para el depósito:** sale stock al mismo `precioCosto` y nace una cuenta a cobrar al local. **No es venta comercial.**
  - La `Venta` interna tiene `costoTotal`, pero queda correctamente fuera de todo total (`whereVentaComercial`).
  - Como el depósito vende al costo, no hay margen en ese paso.
- **[PROBLEMA]** Los huecos de B.13 valen también acá:
  - un `precioCosto` en cero o en null distorsiona el valor patrimonial del movimiento;
  - en una venta interna conviven tres importes.
- Lo congelado alcanza para explicar el movimiento patrimonial **de las transferencias con snapshot y costo**. No alcanza para las viejas.

### D.5 Qué se puede calcular hoy

- **Stock actual por local, en unidades:** **CONFIABLE HOY** (`StockLocal.cantidad`, con `enTransito` aparte).
- **Stock actual valorizado:** **CONFIABLE HOY a costo vigente** (`reportes-stock/valorizado`). Solo vale para "ahora".
- **Stock histórico en unidades:** **PARCIAL.** Para que sea confiable, **REQUIERE NUEVO HECHO PERSISTIDO**.
- **Stock histórico valorizado:** **NO RECONSTRUIBLE HISTÓRICAMENTE** de forma confiable.
- **Stock inicial de una semana:** **REQUIERE NUEVO HECHO PERSISTIDO.** La única excepción: si la semana en curso empezó después de tomada una foto.
- **Stock final de una semana:** igual. La semana en curso puede usar el actual.
- **Entradas valorizadas:** **PARCIAL.**
  - Compras: totales de factura o `totalFactura`, con costos que se pueden reescribir.
  - Transferencias: `aPagar`, con ceros y nulls.
- **Salidas valorizadas por venta, o sea el costo de lo vendido:** **CONFIABLE HOY como dato congelado**, con dos reservas: el costo puede venir del cliente y las correcciones cambian la base.
- **Salidas valorizadas a otros locales, desde el depósito:** **PARCIAL** (D.4).
- **Variación del stock valorizado:** **NO DISPONIBLE HOY.** **REQUIERE NUEVO HECHO PERSISTIDO.**
- **Mermas y ajustes:** en cantidad son **CONFIABLES HOY** desde `AuditoriaStock` (solo los manuales). En valor, **REQUIEREN NUEVO DATO**: no hay costo congelado ni tipo "merma".

### D.6 El dato mínimo que falta

**La foto de stock valorizado por local al corte de cada semana financiera.**

Por cada producto con stock: la cantidad y el costo unitario usado, más el total y el método.

Con fotos consecutivas:

- **stock inicial = foto anterior**;
- **stock final = foto nueva**;
- la variación sale de restarlas.

Las entradas congeladas y el costo de lo vendido **explican** esa variación, y el residuo queda a la vista como "ajustes, mermas y revalorización". No hace falta inventar el pasado:

- **la historia anterior a la primera foto queda NO RECONSTRUIBLE, y se dice así**;
- **no se estima.**

Alternativas, con su costo:

1. **Foto al corte, sin libro de movimientos.** Es el cambio más chico: no toca a ninguno de los escritores de stock.
   - **[VERIFICADO]** Hoy la aplicación no tiene un mecanismo programado. `instrumentation.js` solo chequea al arrancar, y el único cron del proyecto es el del backup (`ops/backup/vps-backup-erpazul.sh`).
   - **Revisión 3:** la foto ya **no** se toma a las 00:00. Se toma en la **consolidación operativa** de la semana (G.4), así que no necesita un reloj.
2. **Libro de movimientos de stock.** Cada uno de los escritores de D.1 registra un movimiento con fecha, cantidad y costo.
   - La cantidad a cualquier fecha se deriva, y la foto puede tomarse en cualquier momento restando lo posterior.
   - Es un cambio **grande**: toca venta, compra, transferencia, recepción, cancelación, corrección, ajuste e importación.
3. **Foto más una corrección.** La foto se toma en cualquier momento y se ajusta restando los eventos posteriores que tienen rastro: ventas, recepciones y ajustes.
   - Hereda los huecos de D.1 **para la ventana** entre el corte y la foto.
   - Es chica si la foto se toma cerca del corte.

**Dos datos que conviene congelar aparte**, sea cual sea la alternativa:

- el costo al momento de un ajuste o merma, para que tenga valor;
- el incremento físico exacto que entró por una compra, para no depender del `factor_pack` vivo.

**Cerrado en la revisión 3:**

- el método es el costo vigente al corte (D.3);
- la foto representa el **cierre operativo** de la semana, no las 00:00 (G.4).

**Recomendado:** la alternativa 1, foto sin libro, con la frontera y la reversión de la semana siguiente que define G.5. Solo necesita revertir hechos que **sí** tienen rastro exacto.

El libro de movimientos (alternativa 2) queda como evolución posible. No es requisito.

---

## E. Cómo se leen juntas

"Lo que quedó" no se interpreta nunca solo. La pantalla y el informe presentan tres cifras con su nombre:

1. **Resultado operativo:** qué produjo la operación.
2. **Lo que quedó:** qué pasó con la plata después de los pagos realizados.
3. **Variación del stock valorizado:** qué pasó con la mercadería.

Ejemplos que el ERP tiene que poder contar, con palabras y sin forzar una suma:

- "Quedaron $2.000.000 más de dinero, pero el stock cayó $1.500.000."
- "Quedó poco efectivo, pero el stock aumentó $2.000.000."
- "Resultado operativo +$1.500.000 y lo que quedó $0: la plata se usó para reponer y aumentar stock, o para cancelar obligaciones."

Las diferencias entre resultado y lo que quedó se explican con **categorías**, no con una fórmula forzada. Cada una se muestra solo si tiene fuente, y si no, NO DISPONIBLE:

1. **Variación del stock valorizado** (C.4, D). Hoy NO DISPONIBLE.
2. **Deudas generadas en el período y no pagadas.** Proveedores sí; depósito, cuando exista su pago.
3. **Pagos de deudas de períodos anteriores:** `PagoProveedor.fecha` sobre cuentas viejas.
4. **Fiado vendido y no cobrado, y cobros de fiados viejos:** `MovimientoCuenta`. El cobro no tiene medio (B.7).
5. **Cobros digitales no acreditados y comisiones.** Hoy sin dato.
6. **Traspasos entre lugares del mismo local:** retiro, reingreso, dinero preparado. Son neutros para el total.
7. **Distribuciones, aportes y diferencias de caja.** Hoy no existen, o no se distinguen.

El "disponible para repartir" (C.6) se explica después, a partir de la posición y de las reservas decididas. **No tiene fórmula todavía.**

---

## F. Modelo conceptual (no Prisma)

Todos son **[IDEA]**. **No se elige schema** ni se implementa nada, tampoco el "lugar del dinero", hasta cerrar las decisiones de la sección I.

### F.1 Foto de stock valorizado

- **Problema:** C.4 y D.6.
- **Reusa:** `StockLocal`; el costo vigente (`ProductoLocal` o `ProductoBase.precio_costo`, con la regla de `factor_pack` de `reportes-stock/valorizado`); el período financiero.
- **Riesgo:** que exista otra valuación de stock distinta de la del reporte actual. Tiene que ser **una sola** regla de valuación.

### F.2 Lugar del dinero, recortado a lo que hace falta

- **Problema:** C.5, y el saldo de "efectivo retirado" por local con su reingreso (B.15).
- **Lo mínimo que la evidencia justifica:** el efectivo retirado **por local**, alimentado por los retiros que ya existen (vinculándose a ellos, no copiándolos) y bajado por el reingreso a una caja del mismo local.
- **El cajón no se re-registra:** sigue siendo `Turno` + `CajaMovimiento`.
- Banco y Mercado Pago **solo** si se decide llevar su saldo (I.3). No hace falta un mayor completo desde el principio.
- **Riesgo:** llevar un saldo de caja paralelo al del turno.

### F.3 Reingreso de efectivo retirado

- **Problema:** B.15 y B.16.
- **Reusa:** el lado del cajón sería un `CajaMovimiento` INGRESO del turno operativo del mismo local, **vinculado** al reingreso como ya se hace con `PagoProveedor.cajaMovimientoId`.
- Hoy ese INGRESO existe **sin origen**.

### F.4 Gasto, con categoría configurable

- **Problema:** C.2.
- Pertenece a un local; las categorías son configurables por grupo, sin lista cerrada en el código.
- **Gasto y pago son dos hechos.** El gasto reconoce el costo y el pago mueve plata.
- **Riesgo:** un gasto pagado en efectivo que además genere un RETIRO manual por "Caja +/−".

### F.5 Obligación y pago, generalizando lo que ya anda

- Para la deuda con el depósito, los gastos a pagar y los sueldos.
- **Reusa:** `estadoDeCuenta`, que ya es genérica; `puedePagarLaCuenta`; la idempotencia de `registrarPagoProveedor`.
- **Alternativas:**
  1. generalizar lo de proveedores;
  2. hermanos por tipo que reusen las funciones puras;
  3. una obligación genérica nueva.
- **[DECISIÓN PENDIENTE]**

### F.6 Obligación con el depósito por período, y su pago

- **Reusa:** `cuentaDelLocal` para el importe y `rangoDelPeriodo` + `acuerdoDeLocal` para el período. **No hay una deuda por cada transferencia.**
- Al pagar, **congela el período y el importe** en el pago.
- `AcuerdoDepositoLocal` necesita historial de `diaDeCorte` (su propio comentario lo dice).
- **Antes hay que resolver cuál de las tres representaciones es la canónica** (B.13).

### F.7 Cobro de cuenta corriente con medio y destino

- **Problema:** B.7.
- `MovimientoCuenta` sigue siendo la deuda del cliente; el cobro gana un medio y un destino. Si es efectivo al cajón, se vincula a un `CajaMovimiento` INGRESO.

### F.8 Distribución a dueños

- Sale del local. No es gasto ni retiro.

### F.9 Cierre semanal

- Ver sección G. Es el lugar natural de la foto de stock (F.1).

### F.10 Empleados, sin RRHH

- Un gasto de categoría "personal" con un beneficiario, más su pago.
- **[DECISIÓN PENDIENTE]** si los adelantos exigen algo más.

---

## G. Semana financiera

### G.1 Qué hay hoy

**En Finanzas [VERIFICADO]** — `lib/finanzas/periodoFinanciero.js`:

- `CORTE_SEMANAL_FINANCIERO = 0` (domingo), **fijo y global, a propósito**, y **desacoplado a propósito** de `AcuerdoDepositoLocal`.
- Unidades DIA, SEMANA y MES. "OTRO" está declarado y no implementado.
- La aritmética delega en `rangoDelPeriodo`.

**En Transferencias [VERIFICADO]** — ya existe una configuración funcional equivalente:

- **Dónde vive:** `AcuerdoDepositoLocal.diaDeCorte`, de 0 (domingo) a 6 (sábado), el número de `Date.getUTCDay()`. **El ámbito es el PAR depósito–local**, con único `(depositoLocalId, localId)` (`prisma/schema.prisma:113`).
- **Quién la escribe:** `app/api/transferencias/acuerdos/route.js`, con upsert, exigiendo el permiso `transferencias.crear`.
- **Quién la lee:** `acuerdoDeLocal(acuerdos, localId)` (`lib/transferencias/bloquesPorLocal.js:82`). Devuelve `{ diaDeCorte, sinConfigurar }`.
- **Sin fila:** cae a `DIA_DE_CORTE_POR_DEFECTO = 0` (`lib/transferencias/periodoDePago.js:64`) con la marca "sin configurar". **La base no tiene default, a propósito.**
- **La aritmética:** `rangoDelPeriodo({ unidad, diaDeCorte, hoy })` y `caeEnElPeriodo` (`lib/transferencias/periodoDePago.js`), puras y ya compartidas con Finanzas.
- **Sin historial:** el propio schema (líneas 90-112) avisa que, cuando existan pagos, el período tiene que quedar congelado en el pago y el corte necesita historial.

### G.2 Reutilizar la semana de Transferencias

**[DECISIÓN APROBADA]** No se crea una segunda configuración semanal: se reusa la de Transferencias. **No se asume domingo como hardcode.**

**Qué se reusa exactamente:**

- el **dato**, `AcuerdoDepositoLocal.diaDeCorte` del local;
- la **lectura con su marca**, `acuerdoDeLocal`;
- la **aritmética**, `rangoDelPeriodo` y `caeEnElPeriodo`.

`periodoFinanciero` deja de usar su constante y pide el corte del local por la misma puerta. **[PROBLEMA, contradicción con el código]** Hoy `periodoFinanciero.js` dice lo contrario a propósito: **ese comentario y esa constante son los que cambian.**

**Lo que el ámbito actual cubre y lo que no:**

- **Cubre** que distintos locales tengan semanas distintas: el acuerdo es por local.
- **No cubre** tres casos, que hay que decidir sin crear otra tabla:
  1. **El depósito**, que vende y tiene caja, **no tiene acuerdo consigo mismo**: cae al default. **[DECISIÓN PENDIENTE]** ¿Su semana es el default, o se toma de otro lado?
  2. **Un local sin depósito** o sin acuerdo cargado cae al default, con la marca "sin configurar". Una instalación nueva hereda el domingo del código.
     - **[DECISIÓN PENDIENTE]** Si hace falta un default por grupo o por instalación, el lugar natural es la configuración de grupo que ya existe (`ConfiguracionGrupo`). **No se crea hasta que se decida.**
  3. **Un local con acuerdo con dos depósitos** (el único es por par) tendría dos cortes. **[INFERIDO]** El modelo lo permite; `acuerdoDeLocal` se queda con el primero que encuentra.

**Dos consecuencias que cambian de peso al reusar:**

- **Permiso:** hoy mover el corte exige `transferencias.crear`. Con la reutilización, eso también mueve la semana financiera y la foto de stock. **[DECISIÓN PENDIENTE]** ¿Hace falta un permiso propio para cambiar el corte?
- **Historial:** una foto ya tomada congela su rango, y cambiar el corte no la mueve. Pero las semanas siguientes quedarían desalineadas si el corte se recalcula hacia atrás.
  - **El historial del corte, que el schema ya pedía para los pagos al depósito, ahora también lo pide la foto.** Es un solo historial para las dos cosas.
  - Hasta que exista, cada foto tiene que guardar **su propio rango** (desde y hasta) y no derivarlo después.

### G.3 A qué semana pertenece un turno

**[DECISIÓN APROBADA]** Las 00:00 cambian el día y la semana del **calendario**, pero **no parten un turno**. **Un turno pertenece COMPLETO a la semana en la que abrió.**

Ejemplo: un turno de sábado que abre a las 16:00 y cierra el domingo a las 00:30. Todo lo del turno es de la semana anterior: lo de las 23:50, lo de las 00:10 y lo de las 00:29.

**Precedente en el código [VERIFICADO], que se reusa:**

- `app/api/finanzas/tablero/route.js` ya asigna los turnos por `apertura`: "un turno que abre el sábado a las 22 y cierra el domingo pertenece al sábado".
- El mismo archivo ya suma el total de un turno **por turno** y no por rango, para que coincida con su detalle.
- `lib/finanzas/actividadFinanciera.js` agrupa por día argentino con `fechaArgentinaISO`, la misma puerta que usa `periodoDePago`.

**Contrato propuesto:**

- **Semana del turno** = la semana, según el corte del local, que contiene `fechaArgentinaISO(Turno.apertura)`.
- **Hechos atados a un turno** van a la semana del turno, **sin mirar su timestamp**:
  - ventas y sus `VentaPago`;
  - `CajaMovimiento`;
  - retiros y arqueos;
  - pagos a proveedores en efectivo (`PagoProveedor.turnoId`);
  - correcciones con `turnoIdCorreccion`.
- **[PROBLEMA]** Hoy el resumen de Finanzas corta las ventas por `Venta.fecha` (C.1). Hay que pasarlo a la semana del turno.
  - Una venta sin `turnoId` —el campo es nullable— sigue yendo por su fecha.
  - Cuántas hay es **[NO MEDIDO]**.
- **Hechos sin turno** (compras recibidas, transferencias, ajustes de stock, pagos no efectivo, cobros de cuenta corriente) van por su fecha, con una excepción para el stock que define G.5.

**[PROBLEMA, contradicción con el código] El POS hoy no deja vender a las 00:10 en el turno del sábado.**

- `app/api/pos-ventas/crear/route.js:157-169` rechaza la venta si el turno abrió en un **día calendario anterior**: "Caja abierta de un día anterior. Cerrá caja antes de vender."
- `app/api/pos-ventas/turnos/actual/route.js:89-100` marca el turno como `requiereCierre`, y `app/modulos/pos-ventas/page.jsx:1786` muestra una pantalla que bloquea.
- Después de las 00:00, un turno del día anterior **solo puede cerrar**, y quizás retirar o registrar movimientos (no verificado ruta por ruta).
- La regla aprobada se cumple igual: lo que ese turno haga después de las 00:00 es de su semana. Pero **el ejemplo de una venta a las 00:10 hoy no puede ocurrir.**
- **[DECISIÓN PENDIENTE]** Mantener esta regla del POS, que es diaria y no semanal, o relajarla para que el turno siga vendiendo pasada la medianoche. Es una decisión del POS, no de Finanzas. **Finanzas funciona con cualquiera de las dos.**

### G.4 Cuándo se consolida una semana

**[DECISIÓN APROBADA]** La semana cambia en el calendario a las 00:00, pero su **cierre financiero se consolida cuando ya no queda ningún turno de esa semana operando**. La foto de stock representa ese cierre operativo real.

**Contrato propuesto: la semana W del local L es consolidable cuando se cumplen las dos:**

1. terminó en el calendario (ya pasó el inicio de W+1);
2. **ningún turno de L con apertura en W está operativo.**

"Operativo" es la condición que ya existe: `WHERE_TURNO_OPERATIVO`, o sea `cierre = null` y `cierreEnPreparacionEn = null` (`lib/caja/cierreRelevo.js:88`).

**Por qué alcanza el corte y no hace falta la confirmación del cierre:**

- El **corte** del cierre con relevo ya congela el universo del turno. Desde ese momento el turno no vende, no mueve caja y no retira (`prisma/schema.prisma`, comentario de `Turno.cierreEnPreparacionEn`).
- El stock deja de moverse por ese turno en el corte. Contar el efectivo después no cambia el stock.
- Un turno **anulado técnicamente** (`anuladoEn`) no cuenta como operativo.

**Qué dispara la consolidación:** no hace falta un reloj.

- Se consolida **en el mismo acto que deja a la semana sin turnos operativos**: el corte, el cierre clásico o la anulación técnica del último turno de W.
- O **en el primer acceso posterior**, si ese acto falló. Es idempotente (G.6).
- Es la misma idea que el corte con relevo: el hecho que cambia el estado es el que deja constancia.

### G.5 Qué representa la foto: la frontera

**El problema.** Cuando el último turno de W corta, el stock ya puede incluir hechos de W+1:

- las ventas de un turno que abrió después de las 00:00 en otra caja del mismo local (un turno es único por usuario y local, así que puede haber varias cajas);
- hechos sin turno ocurridos después de las 00:00.

Una foto "del stock en ese instante" los mezclaría.

**Contrato propuesto:**

- **foto de W = stock leído en el instante T de la consolidación + reversión de los hechos de W+1 ocurridos antes de T.**
- **Qué se revierte, y con qué rastro exacto:**
  - **ventas de turnos de W+1**, con su consumo congelado: `VentaDetalle.productoLocalId` + `cantidadStock`, o `VentaDetalleComponente`. Las ventas nuevas no son legacy, así que el rastro es **exacto**.
  - **anulaciones y correcciones de W+1**, con `VentaCorreccion.impactoStock`.
- **Hechos sin turno entre las 00:00 y T** (compras recibidas, recepciones y envíos de transferencias, ajustes):
  - **[DECISIÓN PENDIENTE]**, con una recomendación.
  - **Recomendado: "la semana W sigue abierta para el stock hasta que se consolida".** Un hecho de stock sin turno ocurrido antes de la consolidación de W pertenece a W. No hace falta revertirlo.
    - Es coherente con la regla del turno completo: la operación del local sigue en W hasta que W termina de verdad.
    - Evita revertir compras, cuyo incremento **no** se guarda exacto (D.1, punto 4).
    - Costo: una compra recibida a las 00:20 cuenta en el stock de W, aunque su deuda se vea por su fecha.
  - **Alternativa:** asignar esos hechos por calendario (W+1) y revertirlos. Exige guardar antes el incremento exacto de la compra (D.6).
- **La frontera va por id, no por timestamp**, igual que `CierrePreparacion.ultimaVentaId` (`lib/caja/cierreRelevoServer.js:93-107`): "dos filas creadas en el mismo milisegundo son indistinguibles por fecha".
  - La foto guarda los ids máximos que vio: de `Venta`, de `VentaCorreccion` y de lo que corresponda.
  - Así la reversión se puede reproducir y auditar.
- **Dos decisiones más sobre qué entra en la foto [DECISIÓN PENDIENTE]:**
  - **Stock negativo** (el grupo puede permitirlo): ¿se valoriza negativo tal cual, o se informa aparte?
  - **Mercadería en tránsito** (`StockLocal.enTransito` del origen): ya salió del depósito y todavía no entró al local, pero la deuda del local ya corre por fecha de envío. Se recomienda **una línea aparte, "en tránsito"**, para que su valor no desaparezca entre dos fotos.

### G.6 Carreras e idempotencia

- **El último turno corta mientras otra caja vende.**
  - La venta toma `pg_advisory_xact_lock(localId)` en su transacción (`app/api/pos-ventas/crear/route.js:1074`).
  - La consolidación toma **el mismo bloqueo del local** y lee el stock **en esa misma transacción**. Con eso ninguna venta del local cambia el stock mientras se toma la foto.
  - Las ventas de W+1 que ya se registraron se revierten por la frontera (G.5).
- **Una venta de W que valida su turno antes del corte y se registra después.**
  - **[INFERIDO]** Es posible: `crear` valida el turno **fuera** de su transacción (`prisma.turno.findFirst`, línea 128), mientras el corte bloquea la fila del turno (`bloquearTurno`, `lib/caja/cierreRelevoServer.js:163`).
  - Esa venta queda con el `turnoId` de W y un id posterior a la frontera del corte.
  - **El contrato:** una venta de un turno de W que llega después de la foto se informa como **hecho tardío de W** (abajo). No se pierde.
- **Otros escritores de stock** (recepciones, ajustes, compras) no toman el bloqueo del local.
  - La lectura de la foto tiene que ser **un solo snapshot consistente**: una transacción `REPEATABLE READ`, o una sola sentencia. Hoy **nada** en el repo usa `isolationLevel`, así que el nivel es el de Postgres por defecto, `READ COMMITTED`.
  - El costo vigente se lee **en el mismo snapshot** que la cantidad.
- **Idempotencia:** una sola consolidación por local y semana, protegida con un **único** de base (local + inicio de semana), por el mismo patrón que `CierrePreparacion` y `PagoProveedor`. Un reintento devuelve la foto existente.
- **Espacio de bloqueos.** **[PROBLEMA]** `pg_advisory_xact_lock` se usa hoy con **un solo entero** para cosas distintas:
  - `localId` en ventas y ofertas;
  - `ventaId` en la corrección (`venta/[id]/corregir/route.js:98`).

  Un local y una venta con el mismo número se bloquean entre sí sin motivo. Un bloqueo nuevo de consolidación tiene que usar la forma de dos enteros (espacio + id), o reusar exactamente el de ventas **a propósito**.
- **Un turno de W queda abierto horas o días.**
  - W **no se consolida**: no se toma la foto "a medias". El estado **"semana sin consolidar"** se ve en Finanzas con el turno que la traba, igual que `EstadoCierrePreparacion.VENCIDO` marca un atraso sin liberar nada.
  - Mientras tanto, W+1 sigue operando, y su reversión crece pero sigue siendo exacta.
  - Salidas que ya existen: cerrar el turno, o **anularlo técnicamente** si fue un error (`Turno.anuladoEn`).
  - **[DECISIÓN PENDIENTE]** ¿Hace falta además "forzar la consolidación" con un permiso propio, dejando el turno marcado?
  - La regla del POS de G.3 ya empuja a cerrar antes de vender al día siguiente.
- **Hechos tardíos**, como una venta de W después de la foto o un gasto de W cargado más tarde:
  - **la foto no se recalcula**;
  - el hecho se informa en W como **tardío**, y su efecto en stock aparece en la **variación de W+1**, rotulado.
  - **[DECISIÓN PENDIENTE]** Si además se permite "reabrir" una semana consolidada.

### G.7 ¿Cierre persistido o derivado?

**Lo que se deriva bien:**

- recaudación;
- costo de lo vendido;
- pagos a proveedores por fecha;
- deuda con proveedores a una fecha.

**Lo que no se deriva:**

- **stock valorizado inicial y final** (D);
- la deuda con el depósito, que se mueve con el corte, las recepciones tardías, las cancelaciones y el costo vivo;
- el saldo de lugares sin movimientos;
- la decisión de reparto.

**Alternativas:**

1. Todo derivado. **No alcanza:** sin foto de stock, C.4 queda NO DISPONIBLE para siempre.
2. **Cierre liviano** que congele solo lo no derivable: la foto de stock, la deuda con el depósito del período, los saldos declarados y el reparto.
3. Cierre completo. Duplica fuentes que ya están congeladas: no conviene.

**Recomendado: la 2**, cuyo primer contenido es la foto de stock con su frontera (G.4 a G.6).

**Hechos tardíos:** ver G.6.

---

## H. Invariantes

1. Pago de una deuda ≠ gasto: al proveedor, al depósito, o de un gasto ya reconocido.
2. Retiro de caja ≠ gasto.
3. Retiro de caja ≠ distribución a dueños.
4. Compra de stock ≠ gasto operativo. La mercadería afecta el resultado por el costo de lo vendido.
5. Traspaso entre lugares del mismo local ≠ ingreso o egreso.
6. La deuda de un local no se paga con fondos de otro local ni del depósito.
7. Poder ver una deuda no habilita a pagarla.
8. **El efectivo retirado pertenece siempre al local del que salió.** Importes de locales distintos no se suman aunque los tenga la misma persona.
9. **El efectivo retirado no paga directamente.** Para volver a usarse como efectivo operativo, reingresa a una caja del mismo local.
10. **Un pago en efectivo sale de un turno operativo del local de la deuda.** Un pago no efectivo no pasa por la caja.
11. Cómo se cobró una venta lo dice `VentaPago`, por `tendersParaAgregar`.
12. Un mismo flujo de plata vive en una sola fuente. Si toca el cajón, el otro registro apunta al `CajaMovimiento` con un vínculo único.
13. Qué es cada `CajaMovimiento` lo decide el vínculo, nunca el texto del motivo.
14. El retiro de cierre no entra en el esperado de su propio turno.
15. Las ventas internas y las anuladas no son ventas comerciales.
16. FIADO no es cobro, y su cobro posterior no es una venta nueva.
17. Toda aritmética de plata va en centavos enteros.
18. Lo que no se conoce es NO DISPONIBLE, nunca cero.
19. Saldo y estado de una deuda se derivan de total y pagos.
20. Un envío que mueve plata exige clave de idempotencia.
21. Las diferencias de arqueos anteriores no son movimientos de dinero.
22. La configuración no reescribe la historia.
23. Las deudas nacen de su hecho de origen, nunca a mano.
24. `CajaMovimiento` no se convierte en un mayor general.
25. El período de un pago al depósito queda congelado en el pago.
26. La deuda con el depósito es **por local y período**, valorizada por lo recibido a costo congelado. No hay una deuda por transferencia.
27. Transferencias sigue siendo dueño de la operación; Finanzas consume la obligación.
28. Las capacidades se habilitan por permiso, nunca por nombre de rol.
29. Todo hecho financiero pertenece a exactamente un local.
30. **"Lo que quedó" nunca se presenta como ganancia ni se lee aislado:** va con el resultado operativo y con la variación del stock.
31. **Recaudación, resultado operativo, lo que quedó y variación del stock son cifras distintas.** No se deriva una de otra para que "cierren".
32. **El stock histórico no se valoriza con el costo actual.** Eso reescribe el pasado.
33. **Un valor de stock anterior a la primera foto es NO RECONSTRUIBLE.** No se estima para llenar el hueco.
34. **"Compras − costo de lo vendido" no se presenta como variación del stock.**
35. El resultado operativo no se calcula mientras no existan los gastos. El margen de mercadería se muestra con su nombre.
36. **El stock semanal se valoriza como cantidad al corte × costo vigente al corte.** Una foto tomada no se recalcula nunca.
37. **La revalorización se informa aparte.** No es venta, recaudación, compra ni ganancia por venta.
38. **Un turno pertenece completo a la semana en que abrió.** Sus hechos no se reparten entre dos semanas por timestamp.
39. **Una semana no se consolida mientras tenga un turno operativo**, y la foto de stock representa esa consolidación, no las 00:00.
40. **La frontera de una foto va por id, no por timestamp.** Lo de la semana siguiente que ya ocurrió se revierte con rastro exacto.
41. **Hay una sola configuración semanal**: la de Transferencias. Finanzas no crea otra.
42. **La recaudación se informa bruta y neta, con la comisión en el medio.** El flujo neto parte del neto, y un neto con comisión sin configurar no se presenta como medido.
43. **Hay una sola regla de valuación del stock** para la foto y para el reporte valorizado, en una función compartida.

---

## I. Huecos y preguntas

### I.1 Lo que el código ya contesta

- La recaudación por medio y local.
- El circuito físico del cajón.
- Deudas y pagos a proveedores, con la regla de ubicación.
- Que el costo de lo vendido queda congelado al vender.
- Cómo se valoriza y a qué período va la deuda con el depósito.
- Que no existen gasto, lugar, reingreso, distribución, pago al depósito, movimiento de stock ni foto de stock.
- Que `AuditoriaStock` no cubre ventas, compras ni transferencias en el destino.
- Que el costo histórico del producto solo existe en una bitácora best-effort.
- Que no hay mecanismo programado dentro de la aplicación.

### I.2 Lo ya decidido

**Primera versión:**

- las magnitudes son distintas;
- deuda de X → paga X con fondos de X;
- retiro ≠ gasto ≠ reparto;
- compra ≠ gasto;
- pago al depósito ≠ gasto;
- pago ≠ gasto;
- categorías de gasto configurables;
- semana configurable;
- reuso de la valorización de transferencias;
- mobile-first;
- permisos, no roles.

**Revisión 2:**

- el efectivo retirado pertenece a su local y no se mezcla;
- no paga directamente: reingresa a una caja del mismo local;
- el turno operativo para pagar en efectivo es correcto;
- los pagos no efectivo no pasan por la caja;
- hay dos verdades de la semana, resultado operativo y lo que quedó;
- Transferencias sigue siendo independiente y Finanzas consume la obligación con una acción Pagar;
- el stock valorizado es parte de la explicación;
- lo que quedó no se lee aislado.

**Revisión 3:**

- el método de valuación es cantidad × costo vigente al corte;
- la revalorización se muestra aparte;
- las fotos no se recalculan;
- se reusa la semana de Transferencias;
- un turno pertenece a la semana en que abrió;
- la semana se consolida sin turnos operativos, y ahí va la foto;
- la recaudación se informa bruta y neta;
- el flujo neto usa el neto y los pagos realmente realizados.

### I.3 Lo que sigue abierto

Ordenado por cuánto bloquea el primer bloque estructural (la foto).

**Bloquean la foto y la consolidación (G):**

1. **Hechos de stock sin turno entre las 00:00 y la consolidación** (G.5). Recomendado: pertenecen a la semana todavía no consolidada. La alternativa exige guardar antes el incremento exacto de las compras.
2. **Stock negativo y mercadería en tránsito en la foto** (G.5). Recomendado: el tránsito en una línea aparte.
3. **Convención de revalorización cuando hubo movimiento** (C.4). Recomendado: cantidad anterior × diferencia de costo.
4. **La semana del depósito y de un local sin acuerdo** (G.2). El default de hoy es el domingo del código.
5. **Permiso para cambiar el corte semanal**, que hoy es `transferencias.crear` y ahora también mueve Finanzas (G.2).
6. **¿Hace falta "forzar la consolidación" de una semana trabada por un turno abierto?** ¿Se puede reabrir una semana consolidada? (G.6)

**No bloquean la foto, pero sí piezas posteriores:**

7. **La regla del POS "caja de un día anterior no vende"** (G.3). ¿Se mantiene o se relaja para vender pasada la medianoche? Es una decisión del POS.
8. **La deuda canónica con el depósito cuando la entrega fue una venta interna** (B.13). Bloquea el Pagar al depósito.
9. **Los gastos: ¿van a la semana en que se generan o en que se pagan?** Bloquea gastos (F.4 / F.5).
10. **Comisión estimada o liquidación real.** ¿Alcanza el neto estimado de `VentaPago`, o el rendimiento real exige conciliación con el procesador? (C.1 bis)
11. **Qué más entra en el flujo neto:** distribuciones, aportes, reingresos, diferencias de caja (C.3).
12. **Margen: ventas con o sin recargo; comisión en el margen o abajo** (C.2).
13. **Cobros digitales: ¿se lleva el saldo de Mercado Pago y del banco?** (C.5)
14. **Cobro de un fiado en efectivo: ¿entra al cajón?** (B.7)
15. **Diferencias de caja y mermas: ¿son resultado operativo?**
16. **Dinero preparado: ¿un lugar propio o retirado con propósito?** (B.16)
17. **¿El depósito tiene resultado propio en Finanzas?**
18. **Disponible para repartir: reservas, y reparto por local o consolidado** (C.6).
19. **¿El costo del producto incluye IVA?** (D.3)
20. **Empleados: ¿hay adelantos?** (F.10)
21. **El nombre final del flujo neto.** Recomendado: "Flujo neto de la semana" (C.3).

---

## J. Orden de implementación recomendado

Tandas chicas y reversibles. **Nada de esto está implementado.** El orden sigue a las **dependencias funcionales**, no a la comodidad técnica.

### J.1 El criterio que ordena

- **Lo que se pierde para siempre va primero.** Una semana sin foto de stock queda sin valor inicial y **no se puede recuperar después** (D, invariante 33). En cambio:
  - un gasto no registrado se puede cargar más tarde con su fecha;
  - el pago al depósito se puede registrar desde el día en que exista;
  - lo que ya está congelado (ventas, pagos) no se pierde.
- **Pero la foto no puede tomarse bien sin su semana.** Necesita saber a qué semana pertenece cada turno, cuándo termina la semana del local y cómo se valoriza. Esas tres piezas van antes o juntas.
- **Lo que hoy muestra un número equivocado se corrige antes de sumar nada encima.**

### J.2 Etapa 0 — correcciones sin schema

Son independientes entre sí y no dependen de decisiones abiertas.

- **0.1 — Clase PAGO_PROVEEDOR en `clasificarMovimientos`.**
  - **Sigue siendo correcto empezar por acá.** El vínculo `PagoProveedor.cajaMovimientoId` existe y es único; hoy el tablero muestra ese retiro como manual (B.10).
  - Arregla lo que se ve **hoy**, y es prerrequisito de sumar pagos al flujo neto sin doble conteo.
  - Toca:
    - `lib/finanzas/movimientosDeCaja.js` (la clase y el orden de las preguntas);
    - las dos rutas que la usan (`tablero` y `turno/[turnoId]`), que tienen que pedir también los ids de pago;
    - `actividadFinanciera.js`, cuyo comentario ya lo anuncia.
  - **Riesgo a cuidar:** `paraElEsperado` tiene que **seguir incluyendo** ese retiro, porque salió del cajón antes del corte. La clase nueva no puede sacarlo del esperado.
- **0.2 — Neto honesto.**
  - Llevar la marca de "comisión sin configurar" hasta `desglosarCobros`: `comisionPct` null en un medio que cobra comisión.
  - Que el neto de esos tenders se rotule como no medido.
  - Sin schema: el dato ya existe en `VentaPago` (C.1 bis).
- **0.3 — Una sola regla de valuación del stock.**
  - Sacar la valuación a costo vigente, hoy escrita **adentro** de `app/api/reportes-stock/valorizado/route.js`, a una función compartida.
  - El reporte tiene que quedar idéntico.
  - Es el insumo de la foto (invariante 43).
- **0.4 — La semana del local.**
  - Una función pura que diga la semana de un local (el corte con `acuerdoDeLocal` + `rangoDelPeriodo`) y la semana de un turno (por `apertura`).
  - Sin tocar todavía el tablero.

### J.3 Etapa 1 — primera pieza estructural: consolidación semanal con foto de stock

- **Por qué esta primero:** es la única que pierde historia cada semana que se posterga. No depende de gastos, del depósito ni del lugar del dinero.
- **Qué incluye, y nada más:**
  - la condición de consolidación (G.4);
  - la foto con frontera y reversión (G.5);
  - la idempotencia y los bloqueos (G.6);
  - el rango congelado en la foto;
  - la valuación de 0.3.
- **No incluye** saldos, reparto ni resultado: el cierre semanal completo viene al final (J.5).
- **Depende de:**
  - 0.3 y 0.4;
  - las decisiones abiertas 1 a 6 de I.3.
- **Consecuencia:** la primera variación de stock aparece recién **entre la primera y la segunda foto**. Lo anterior es NO RECONSTRUIBLE.

### J.4 Etapa 2 — piezas independientes entre sí

Se pueden hacer en cualquier orden después de la etapa 0, en paralelo con la etapa 1.

- **2.a — Pagos a proveedores en el resumen, y flujo neto parcial y rotulado.**
  - Depende de 0.1 y 0.2.
  - Además hay que mover la atribución de ventas a la semana del turno (G.3), que depende de 0.4.
- **2.b — Obligación con el depósito por período, con su Pagar** (F.6).
  - Depende de la decisión 8 y del historial del corte (G.2).
  - Sigue el patrón de Pagos a proveedores.
- **2.c — Gasto con categoría configurable, y su pago** (F.4 / F.5).
  - Depende de la decisión 9.
  - Recién con esto el resultado operativo deja de ser NO DISPONIBLE.
- **2.d — Cobro de cuenta corriente con medio y destino** (F.7). Depende de la decisión 14.

### J.5 Etapa 3 — lo que necesita a las anteriores

- **3.a — Efectivo retirado por local y su reingreso** (F.2 / F.3).
  - No hace falta para el flujo neto: los traspasos son neutros.
  - Sí hace falta para "dónde está la plata".
- **3.b — Cierre semanal completo**, con la lectura conjunta de la sección E: resultado operativo, flujo neto y variación de stock con revalorización. Depende de 1, 2.a, 2.b y 2.c.
- **3.c — Distribución y disponible para repartir** (F.8, C.6). Depende de 3.a, 3.b y la decisión 18.

### J.6 Mapa de dependencias

- **Independientes ya:** 0.1, 0.2, 0.3 y 0.4.
- **La etapa 1** depende de 0.3 y 0.4, más las decisiones 1 a 6.
- **2.a** depende de 0.1, 0.2 y 0.4.
- **2.b, 2.c y 2.d** no dependen entre sí.
- **3.b** depende de 1, 2.a, 2.b y 2.c.
- **3.c** depende de 3.a y 3.b.

### J.7 El PR número 1

**0.1 — PAGO_PROVEEDOR en `clasificarMovimientos`.**

- Es una corrección de algo que el tablero muestra mal **hoy**.
- No necesita ninguna decisión abierta ni schema, y es una sola unidad revertible.
- Todo lo que sume pagos después depende de él.

La etapa 1 es la **primera pieza estructural**, y conviene empezarla apenas se cierren sus seis decisiones, porque cada semana sin foto se pierde.

### J.8 Lo que no se toca todavía

- la semántica de `CajaMovimiento` y de `calcularEfectivoEsperado`;
- `VentaPago` y la creación de ventas, incluido el costo que se congela en ellas;
- la regla del POS de "caja de un día anterior", hasta que se decida (I.3, decisión 7);
- el contrato de `CuentaPorPagarProveedor` / `PagoProveedor`;
- las rutas de `auditoria-pos-ventas`;
- las correcciones de venta;
- los escritores de stock, salvo que se elija el libro de movimientos (D.6, alternativa 2).

Los problemas de B.23, B.24, D.1 (la importación sin rastro) y K.2 se arreglan en tandas propias, no mezclados con Finanzas.

---

## K. Reglas transversales

### K.1 UI y UX

- **[DECISIÓN APROBADA]** Mobile-first.
- El patrón para las pantallas de pagos es **Pagos a proveedores en el celular**: `components/finanzas/pagos/ListaCuentasPorPagar.jsx`, `TarjetaCuentaPorPagar.jsx`, `DetalleCuentaPorPagar.jsx`, `ModalRegistrarPago.jsx`, `CamposDeOrigenDelPago.jsx` y `ResumenDeCuentasPorPagar.jsx`. La acción **Pagar** del depósito (B.14) tiene que seguirlo.
- Piezas del kit Sunmi, sin colores ni medidas fijas: 14 temas en `lib/sunmiThemes.js`, y el trinquete con `node scripts/hardcodeo.mjs --trinquete`.
- **El escritorio de Finanzas no tiene diseño definitivo. No se improvisa.**

### K.2 Permisos

- **[VERIFICADO]** Van por código de permiso (`lib/rbac/registry.js`, `checkPerm` en `lib/authorize.js`). Los de Finanzas no están en ningún rol de sistema.
- Cada acción nueva que mueva plata lleva **su propio** permiso: registrar un gasto, reingresar efectivo, pagar al depósito, repartir, tomar o cerrar la semana.
- **Nunca** `if (rol === "DUEÑO")`.
- **[PROBLEMA]** Detalles vistos:
  - `tablero` y `turno/[turnoId]` escriben `"finanzas.ver"` literal;
  - el comentario del registro dice que Finanzas "no escribe nada";
  - mover la fecha prevista de pago no exige operar la ubicación de la deuda;
  - cerrar una compra exige `compras.crear`, mientras que las facturas usan `compras.recibir`.

### K.3 Contradicciones entre las reglas y el código actual

1. **La semana es configurable y reusa la de Transferencias**, pero `lib/finanzas/periodoFinanciero.js` fija `CORTE_SEMANAL_FINANCIERO = 0`, global y desacoplado a propósito (G.2).
1. bis. **Un turno pertenece completo a la semana en que abrió**, pero:
   - el resumen de Finanzas corta las ventas por `Venta.fecha`;
   - el POS no deja vender pasadas las 00:00 en un turno del día anterior (`app/api/pos-ventas/crear/route.js:157-169`), así que el ejemplo aprobado de una venta a las 00:10 hoy no puede ocurrir (G.3).
2. **Retiro ≠ gasto**, pero `lib/caja/efectivoEsperado.js:94-100` dice que "un gasto se registra como RETIRO", y el modal "Caja +/−" ofrece "Gastos y salidas puntuales: pago a proveedor…".
3. **El pago al depósito cancela una única obligación**, pero una venta interna tiene hasta tres representaciones de esa deuda (B.13).
4. **El stock histórico no se valoriza con el costo actual**, pero el único reporte de stock valorizado (`reportes-stock/valorizado`) usa el costo actual, y la deuda con el depósito cae al costo vivo cuando falta el congelado.
5. **Comentarios desactualizados:**
   - `lib/finanzas/pagosProveedoresServer.js:9-12` dice que solo los candados llaman a `crearCuentaPorPagarDesdeCompra`;
   - `lib/rbac/registry.js` dice que Finanzas "no escribe nada".

**Retirado respecto de la primera versión:** "el pago en efectivo exige turno abierto" **ya no es una contradicción**. Es la regla aprobada (B.10, H.10).
