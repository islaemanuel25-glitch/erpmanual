# Finanzas — Contrato funcional

**Estado:** contrato funcional, segunda revisión. No hay implementación nueva detrás de este archivo.
**Relevado:** 2026-09-24 sobre `main` en `1af04216b67bba5776a7506309519745d706ab7d`, el mismo commit que producción ese día.
**Revisión 2 (2026-09-24):** incorpora las correcciones funcionales aprobadas por Emanuel sobre la primera versión (`df80b82`) y la auditoría del stock histórico valorizado (sección D).
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
- **[DECISIÓN PENDIENTE]** El período se asigna por `Venta.fecha` en el resumen y por turno en la actividad. El cierre semanal tiene que decir cuál manda.

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

### C.3 Lo que quedó (nombre por decidir)

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

**Nombre [DECISIÓN PENDIENTE]:**

- "Disponible de la semana" choca con "disponible para repartir" (C.6), que es otra cosa.
- "Resultado de caja" puede leerse como el arqueo del turno, que también es otra cosa.
- "Flujo neto semanal" es el más exacto, aunque menos coloquial.

**Qué suma y qué resta:**

- **Suma:** la recaudación del período (C.1), incluidos los cobros de fiado cuando tengan medio.
- **Resta:** los pagos realizados en la semana:
  - a proveedores (`PagoProveedor.fecha`, cualquier medio);
  - al depósito (no existe todavía);
  - gastos y sueldos (no existen todavía).
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

**[DECISIÓN PENDIENTE]** ¿La recaudación entra por el bruto o por el neto de comisiones? El ejemplo aprobado usa lo recaudado sin descontar comisiones. Si el neto es lo que realmente queda, la comisión es una salida más.

### C.4 Variación del stock valorizado

**[DECISIÓN APROBADA]** Es parte crítica de la explicación. "Lo que quedó" nunca se interpreta aislado como ganancia: se lee con el resultado operativo y con la variación del stock.

- **Caso reinversión:** quedó poca plata, pero el stock pasó de 10.000.000 a 12.000.000.
- **Caso desstockeo:** quedaron 10.000.000, pero el stock pasó de 18.000.000 a 8.000.000. No es una ganancia extraordinaria: se convirtió mercadería vieja en plata.

**Hoy:** **no se puede calcular de forma confiable.** La auditoría completa está en la sección D. En resumen:

- no hay foto histórica del stock;
- no hay libro de movimientos de stock;
- no hay costo histórico por producto que sea un registro financiero.

**Hasta que exista el dato que falta (D.6), la variación del stock es NO DISPONIBLE.** No se reemplaza por "compras − costo de lo vendido" presentado como si fuera la variación: eso deja afuera mermas, ajustes, revalorizaciones y errores de carga.

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

- **[DECISIÓN PENDIENTE]** Hay que elegir un método de valuación del stock. Las opciones, con sus costos:
  1. **Costo vigente al corte (reposición).** Es coherente con cómo el ERP ya congela el costo de las ventas. La variación se explica con una línea de revalorización. No toca ventas.
  2. **Promedio ponderado.** Cambiaría la definición del costo de lo vendido que ya se congela en cada venta. Toca el POS.
  3. **FIFO por capas.** Requiere un libro de movimientos completo. Es el más caro.
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
   - **[PROBLEMA]** La foto tiene que tomarse **en el instante del corte**, y hoy la aplicación no tiene un mecanismo programado. **[VERIFICADO]** `instrumentation.js` solo chequea al arrancar, y el único cron del proyecto es el del backup (`ops/backup/vps-backup-erpazul.sh`).
   - Si la foto se toma tarde, incluye movimientos de la semana siguiente. Si no se toma, esa semana queda sin stock inicial.
   - Los locales pueden vender pasada la medianoche. **[NO MEDIDO]**
2. **Libro de movimientos de stock.** Cada uno de los escritores de D.1 registra un movimiento con fecha, cantidad y costo.
   - La cantidad a cualquier fecha se deriva, y la foto puede tomarse en cualquier momento restando lo posterior.
   - Es un cambio **grande**: toca venta, compra, transferencia, recepción, cancelación, corrección, ajuste e importación.
3. **Foto más una corrección.** La foto se toma en cualquier momento y se ajusta restando los eventos posteriores que tienen rastro: ventas, recepciones y ajustes.
   - Hereda los huecos de D.1 **para la ventana** entre el corte y la foto.
   - Es chica si la foto se toma cerca del corte.

**Dos datos que conviene congelar aparte**, sea cual sea la alternativa:

- el costo al momento de un ajuste o merma, para que tenga valor;
- el incremento físico exacto que entró por una compra, para no depender del `factor_pack` vivo.

**[DECISIÓN PENDIENTE]** Qué alternativa, con qué método de valuación (D.3), y quién o qué dispara la foto: un proceso programado, el cierre semanal hecho por una persona, u otro.

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

**[VERIFICADO]** `lib/finanzas/periodoFinanciero.js`:

- `CORTE_SEMANAL_FINANCIERO = 0` (domingo): **fijo y global, a propósito**.
- **Desacoplado a propósito** de `AcuerdoDepositoLocal`.
- Unidades DIA, SEMANA y MES. "OTRO" está declarado y no implementado.
- La aritmética delega en `rangoDelPeriodo`, que ya recibe `diaDeCorte` como argumento.

### G.2 La contradicción

- **[PROBLEMA, contradicción]** La regla aprobada dice que la semana es configurable. El código fija domingo global.
- Hacerlo configurable no requiere aritmética nueva: hay que decidir **de dónde** sale el corte.
- **[DECISIÓN PENDIENTE]** Alternativas:
  1. por grupo;
  2. por local;
  3. igual al acuerdo con el depósito. El código rechazó esta explícitamente, con motivo.
- Cualquier corte configurable necesita **historial**.
- **Nuevo, por la sección D:** el corte financiero es también el instante de la foto de stock. **Cambiar el corte cambia cuándo hay que sacar la foto**, y una foto ya tomada no se puede mover.

### G.3 ¿Cierre persistido o derivado?

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

**Hechos tardíos:** reabrir la semana o ajustar en la siguiente. **[DECISIÓN PENDIENTE]**

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

### I.3 Lo que requiere una decisión de Emanuel

Ordenado por cuánto bloquea.

1. **Método de valuación del stock** (D.3): costo vigente al corte con línea de revalorización, promedio o FIFO. Define qué es "stock valorizado" y si se toca el costo de lo vendido que ya congelan las ventas.
2. **Cómo se toma la foto de stock** (D.6): un proceso programado al corte, un cierre semanal hecho por una persona, o una foto corregida. Define si hace falta un mecanismo programado nuevo y qué se hace con una semana sin foto.
3. **El corte de la semana financiera** (G.2): por grupo, por local o igual al del depósito. Define cuándo se saca la foto y cómo se cruza con el pago al depósito.
4. **El nombre de "lo que quedó"**, y si se calcula sobre el bruto o sobre el neto de comisiones (C.3). Define la cifra y su rótulo.
5. **Qué entra en "lo que quedó"** además de recaudación y pagos: distribuciones, aportes, reingresos, diferencias de caja (C.3). Define si es flujo operativo o flujo total.
6. **La deuda canónica con el depósito cuando la entrega fue una venta interna** (B.13). Sin esto, pagar al depósito puede cancelar una deuda y dejar viva otra.
7. **Los gastos: ¿se imputan a la semana en que se generan o a la semana en que se pagan?** Define si hace falta una obligación de gasto (F.5).
8. **Margen: ventas con o sin recargo; la comisión, ¿en el margen o como costo financiero?** (C.2)
9. **Cobros digitales: ¿se lleva el saldo de Mercado Pago y del banco?** Define si F.2 necesita esos lugares.
10. **Cobro de un fiado en efectivo: ¿entra al cajón?** (B.7)
11. **Diferencias de caja y mermas: ¿son resultado operativo?**
12. **Dinero preparado: ¿es un lugar propio, o efectivo retirado con un propósito?** (B.16)
13. **El depósito: ¿tiene resultado propio en Finanzas?**
14. **Disponible para repartir: ¿qué reservas se descuentan?** Y el reparto, ¿por local o consolidado? (C.6)
15. **El costo del producto, ¿incluye IVA?** Define si el total de una factura sirve para valorizar entradas de stock (D.3).
16. **Empleados: ¿alcanza con un gasto con beneficiario, o hay adelantos?** (F.10)

---

## J. Orden de implementación recomendado

Tandas chicas y reversibles. **Nada de esto está implementado.**

1. **Clase PAGO_PROVEEDOR en `clasificarMovimientos`.**
   - Pura, sin schema. Quita el doble conteo de B.10.
   - **Es el primer paso técnico recomendado**, porque:
     - no depende de ninguna decisión pendiente;
     - no crea tablas;
     - es prerrequisito de mostrar cualquier "lo que quedó" con pagos.
2. **Sumar los pagos a proveedores al resumen del período** como salida financiera, con "lo que quedó" **parcial y rotulado**.
   - Sin schema. Depende de 1 y del nombre (I.3 pregunta 4).
3. **Foto de stock valorizado al corte** (F.1).
   - Es la **primera pieza estructural** que esta auditoría pide.
   - Depende de I.3 preguntas 1, 2 y 3.
   - Mientras no esté, cada semana que pasa queda sin stock inicial para siempre: **cuanto antes empiece, antes hay historia**.
4. **Semana financiera configurable con historial.** Se decide junto con 3, porque define cuándo se saca la foto.
5. **Efectivo retirado por local y su reingreso** (F.2 / F.3). Depende de I.3 preguntas 9 y 12.
6. **Cobro de cuenta corriente con medio y destino** (F.7). Depende de 5 y de I.3 pregunta 10.
7. **Gasto con categoría configurable, y su pago** (F.4 / F.5). Depende de I.3 pregunta 7.
   - Recién ahí el resultado operativo sale de NO DISPONIBLE.
8. **Obligación con el depósito por período, con su Pagar** (F.6). Depende de I.3 pregunta 6 y del historial del corte.
9. **Distribución a dueños** (F.8).
10. **Cierre semanal completo, con la lectura conjunta de la sección E.**

**Lo que no se toca todavía:**

- la semántica de `CajaMovimiento` y de `calcularEfectivoEsperado`;
- `VentaPago` y la creación de ventas, incluido el costo que se congela en ellas, salvo que I.3 pregunta 1 elija promedio;
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

1. **La semana es configurable**, pero el código fija `CORTE_SEMANAL_FINANCIERO = 0`, global (G.2).
2. **Retiro ≠ gasto**, pero `lib/caja/efectivoEsperado.js:94-100` dice que "un gasto se registra como RETIRO", y el modal "Caja +/−" ofrece "Gastos y salidas puntuales: pago a proveedor…".
3. **El pago al depósito cancela una única obligación**, pero una venta interna tiene hasta tres representaciones de esa deuda (B.13).
4. **El stock histórico no se valoriza con el costo actual**, pero el único reporte de stock valorizado (`reportes-stock/valorizado`) usa el costo actual, y la deuda con el depósito cae al costo vivo cuando falta el congelado.
5. **Comentarios desactualizados:**
   - `lib/finanzas/pagosProveedoresServer.js:9-12` dice que solo los candados llaman a `crearCuentaPorPagarDesdeCompra`;
   - `lib/rbac/registry.js` dice que Finanzas "no escribe nada".

**Retirado respecto de la primera versión:** "el pago en efectivo exige turno abierto" **ya no es una contradicción**. Es la regla aprobada (B.10, H.10).
