# POS Venta — Manual Vivo

**Estado:** ficha piloto
**Relevado:** 2026-08-20 sobre `main`
**Alcance:** comportamiento actual verificado en código y documentación técnica vigente. Este archivo no describe deseos como si ya existieran.

## Cómo leer esta ficha

- **[VERIFICADO]** existe en el código actual o está respaldado por una fuente técnica vigente.
- **[PROBLEMA]** hay evidencia concreta de una falla, divergencia o deuda.
- **[DECISIÓN PENDIENTE]** el código no puede decidirla: requiere definición de negocio.
- **[DECISIÓN APROBADA]** hay una decisión respaldada por código/documentación existente.
- **[IDEA]** posibilidad futura; no forma parte del comportamiento actual.

---

## 1. Propósito

**[VERIFICADO]** POS Venta es el punto de venta al mostrador de ERP Azul. Busca productos, arma el carrito, identifica cliente y operario cuando corresponde, aplica reglas de precio/descuento/puntos, cobra con uno o varios medios, registra la venta, congela sus snapshots económicos y descuenta el stock físico.

**[VERIFICADO]** No es un módulo aislado: en una venta intervienen como mínimo contexto/local, permisos, operador, turno/caja, productos, precios/listas, stock, clientes, pagos, puntos y auditoría/reportes. En ventas internas también intervienen Transferencias.

Archivos principales:

- UI: `app/modulos/pos-ventas/page.jsx` y `components/pos-ventas/*`.
- creación de venta: `app/api/pos-ventas/crear/route.js`.
- pagos: `lib/pos-ventas/pagos.js`.
- servicios variables: `lib/pos-ventas/servicios.js`.
- líneas por importe/peso: `lib/pos-ventas/lineaPorImporte.js`.
- consumo de normales/combos: `lib/combos/ventaConsumo.js`.
- caja/cierre: `lib/caja/cierreRelevo.js` y pantallas bajo `app/modulos/pos-ventas/{aperturas,cierres,retiros}`.

---

## 2. Qué puede hacer el usuario hoy

**[VERIFICADO]** Desde el POS se puede buscar/agregar mercadería, trabajar con cantidades, vender productos por peso, usar líneas cargadas por importe cuando el producto lo admite, vender servicios de importe variable, seleccionar cliente, aplicar descuentos/canje de puntos según reglas, elegir un medio de pago o dividir el pago, cobrar efectivo con cálculo de vuelto, emitir ticket, consultar historial/estadísticas del día y operar con cola offline.

**[VERIFICADO]** El POS también convive con el circuito de caja: apertura, retiro de recaudación, arqueo y cierre/relevo. Un corte de cierre congela el universo del turno; desde ese momento el turno deja de ser operativo aunque `cierre` todavía sea `null`.

**[VERIFICADO]** En escritorio retiro/cierre pueden abrirse en otra pestaña para no inutilizar el mostrador mientras se cuenta; en móvil se navega en la misma pestaña.

---

## 3. Flujo completo de una venta

### 3.1 Entrada al POS

**[VERIFICADO]** La pantalla trabaja sobre el contexto/local activo. El backend de creación exige permiso `pos.usar` y vuelve a resolver local/grupo desde la sesión; el cliente no decide el scope.

**[VERIFICADO]** Si la configuración local exige operario, una venta online requiere un operario válido. Para replays offline se usa un voucher firmado por el servidor; si un registro offline legacy no permite verificar operario, la venta se conserva con `operadorId = null` antes que perder una venta ya cobrada, y se deja log de auditoría operativa.

### 3.2 Turno

**[VERIFICADO]** No se puede vender sin `turnoId`. El turno debe pertenecer al local y al usuario vendedor y cumplir `WHERE_TURNO_OPERATIVO`.

**[VERIFICADO]** Si el turno está preparando cierre, la venta se rechaza con un mensaje específico. También se bloquea vender con una caja abierta en un día calendario anterior de Argentina: hay que cerrarla antes de continuar.

### 3.3 Carrito y productos

**[VERIFICADO]** Cada ítem debe tener `productoBaseId`. El servidor consulta ProductoBase para clasificar modalidad, unidad, modo de venta del depósito, peso de referencia y combo; no confía en flags enviados por el navegador para decidir si algo es servicio o producto por peso.

**[VERIFICADO]** Los combos se resuelven contra la base dentro de la transacción. Su consumo físico se consolida con el de productos vendidos sueltos para descontar cada `ProductoLocal` una sola vez.

### 3.4 Servicios de importe variable

**[VERIFICADO]** La fuente de verdad está en `lib/pos-ventas/servicios.js`. El cajero ingresa el importe base y el servidor resuelve el recargo (`ProductoLocal.recargoServicioPct ?? ProductoBase.recargoServicioDefaultPct ?? 0`) y recalcula precio final, costo, ganancia y cantidad.

**[VERIFICADO]** Un servicio tiene cantidad 1, no descuenta stock, no usa listas, descuentos, puntos, margen normal ni redondeo a 100. Su importe debe quedar cubierto íntegramente por efectivo y no puede quedar fiado.

**[VERIFICADO]** El rango de importe del servicio está centralizado en constantes de dominio (`IMPORTE_SERVICIO_MIN` y `IMPORTE_SERVICIO_MAX`), no repetido en la pantalla.

### 3.5 Producto por peso cargado por importe

**[VERIFICADO]** Cuando el cajero fija un importe para un producto que realmente se vende por peso, el servidor revalida esa condición y recalcula el peso desde importe/precio. El importe fijado manda sobre el subtotal; el peso derivado sirve para stock, visualización y snapshot.

### 3.6 Cliente, listas, descuentos y puntos

**[VERIFICADO]** La obligación de cliente se obtiene de configuración efectiva local/grupo. No es una condición de UI solamente.

**[VERIFICADO]** El descuento automático toma el mayor porcentaje entre el cliente y sus tags.

**[VERIFICADO]** La lista de precios válida la resuelve el servidor con cliente + grupo + local. Si el ítem declara una lista distinta de la resuelta, la venta se rechaza con 409 en vez de degradar silenciosamente a otra lista.

**[VERIFICADO]** El valor monetario del canje de puntos se recalcula server-side usando `pesoPorPunto` vigente. El navegador no decide cuánto dinero valen los puntos.

**[VERIFICADO]** Los servicios quedan fuera de la base elegible de descuentos y puntos.

### 3.7 Total y pagos

**[VERIFICADO]** La suma monetaria usa centavos/redondeos controlados para evitar comparar floats crudos.

**[VERIFICADO]** La fuente de verdad de pagos múltiples es `VentaPago`; `Venta.formaPago`, `esFiado`, comisión y neto quedan como campos derivados/compatibilidad.

**[VERIFICADO]** Medios de pago de dominio: EFECTIVO, MERCADOPAGO, DEBITO, CREDITO y FIADO. Se consolidan medios repetidos y la suma de tenders debe coincidir exactamente con el total en centavos.

**[VERIFICADO]** FIADO es v1 de medio único: si existe, debe cubrir toda la venta. Requiere cliente y respeta límite/política de crédito.

**[VERIFICADO]** Las comisiones de Mercado Pago, débito y crédito se resuelven desde `ConfiguracionGrupo`; no están fijadas como un 7% dentro del motor actual de creación. El servidor calcula comisión y neto por tender y los congela en `VentaPago`.

### 3.8 Confirmación, stock y persistencia

**[VERIFICADO]** La creación usa una transacción de base. Dentro de ella se serializa la numeración por local con advisory lock, se construyen líneas comerciales, se calcula costo/ganancia, se valida/descuenta stock y se crean Venta, VentaPago, VentaDetalle y snapshots de componentes de combo.

**[VERIFICADO]** La configuración efectiva `allowNegativeStock` decide si una insuficiencia de stock puede continuar; un combo estructuralmente inválido bloquea siempre.

**[VERIFICADO]** La venta congela subtotal, descuentos, total, comisión, neto, costo, ganancia y forma de pago derivada. Cada detalle congela precio, costo, cantidad, subtotal, ganancia, lista/tipo de precio y consumo físico necesario para una reversión exacta.

### 3.9 Venta interna

**[VERIFICADO]** Si el cliente está vinculado a un local propio mediante `Cliente.localVinculadoId`, el POS puede convertir la operación en venta interna. El vínculo se valida otra vez dentro de la misma transacción.

**[VERIFICADO]** Venta, stock y transferencia se confirman o revierten juntos. Como la venta ya descontó stock del origen, la transferencia usa política `SOLO_TRANSITO` para no descontarlo por segunda vez.

### 3.10 Después de confirmar

**[VERIFICADO]** La respuesta devuelve número/id de venta, pagos congelados y breakdown de descuentos. La acreditación de puntos ocurre después de la transacción y es best-effort: un error de acreditación se registra pero no revierte una venta ya cobrada.

**[VERIFICADO]** `clientTxnId`/`clientVentaId` aporta idempotencia para reintentos y cola offline. Una venta interna huérfana de su transferencia no puede ser tratada como un duplicado exitoso.

---

## 4. Datos que lee

**[VERIFICADO]** Entre las fuentes relevantes están: sesión/permisos, contexto local/grupo, configuración efectiva local/grupo, Turno, Local, ProductoBase, ProductoLocal, StockLocal, Cliente/tags, listas de precio, ConfiguracionGrupo de comisiones, PuntosConfigLocal, saldo/movimientos de puntos, MovimientoCuenta y composición de combos.

---

## 5. Datos que modifica

**[VERIFICADO]** Una venta normal puede escribir/modificar: `Venta`, `VentaPago`, `VentaDetalle`, `VentaDetalleComponente`, stock local, movimientos de cuenta corriente si es fiado, movimientos/canje de puntos y contador/numeración de venta. Una venta interna agrega una Transferencia y su estado de tránsito dentro de la misma transacción.

---

## 6. Dependencias del dominio

**[VERIFICADO] POS consume:**

- Contexto / grupos / locales.
- RBAC (`pos.usar` y, para venta interna, `transferencias.crear`).
- Operadores.
- Turnos y Caja.
- Productos, ProductoLocal y Stock.
- Precios y listas de cliente.
- Combos.
- Clientes y cuenta corriente.
- Fidelidad/puntos.
- Configuración local y de grupo.
- Transferencias para venta interna.

**[VERIFICADO] POS alimenta:** ventas, pagos, detalles, stock, cuenta corriente, puntos, tickets, cierres/reportes y auditoría POS.

---

## 7. Fuentes únicas actuales

Estas piezas ya siguen la dirección “buscar → reutilizar → ampliar → crear”:

- **[VERIFICADO] Pagos:** `lib/pos-ventas/pagos.js` centraliza medios válidos, normalización, consolidación, comisiones, campos derivados, ticket y vuelto.
- **[VERIFICADO] Servicios:** `lib/pos-ventas/servicios.js` centraliza modalidad, límites, recargo, cálculo y restricciones.
- **[VERIFICADO] Turno operativo:** `WHERE_TURNO_OPERATIVO` / `estadoDelTurno()` en `lib/caja/cierreRelevo.js` evitan volver a definir “turno abierto” por pantalla.
- **[VERIFICADO] Config local efectiva:** `getConfigLocalEfectiva` concentra herencia local/grupo para reglas como cliente obligatorio y stock negativo.
- **[VERIFICADO] Lista de cliente:** `resolverListaCliente` decide la lista válida server-side.
- **[VERIFICADO] Venta de combos/stock:** `construirLineasComerciales` + `aplicarConsumoStock` concentran composición y consumo físico.
- **[VERIFICADO] Fechas Argentina:** helpers de `lib/fechas/` son la fuente compartida; el proyecto ya dejó un trinquete para impedir volver a formatear zonas horarias a mano.

---

## 8. Duplicaciones, hardcodeos y fuentes que todavía faltan

### 8.1 Precio que se cobra

**[PROBLEMA — CRÍTICO]** El servidor todavía acepta `item.precio` enviado por el navegador para mercadería normal: valida que sea > 0, pero no lo recalcula ni lo compara con el precio que debería resolver el servidor. La lista sí se revalida; el importe final normal no. Está documentado en `docs/roadmap/el-precio-que-se-cobra.md` como gravedad 1.

Esto significa que hoy la fuente única del precio cobrado **todavía no está cerrada**.

### 8.2 Regla “precio por bulto” duplicada

**[PROBLEMA]** La pregunta “¿el precio está guardado por bulto?” tiene criterios distintos entre POS, Stock y helpers de precio. La medición del 2026-08-19 encontró productos kg con factor > 1 que pueden verse a precios distintos según superficie. La corrección requiere una única función de dominio y una decisión de negocio previa.

### 8.3 Mapeo local de tipo de precio

**[PROBLEMA / DEUDA]** `mapTipoPrecioAplicado()` vive dentro de `app/api/pos-ventas/crear/route.js`. Es una regla de clasificación de dominio (`PRECIO_VENTA`, `COSTO_PURO`, `COSTO_MAS_MARGEN`) que conviene tener en una fuente única si otras superficies necesitan interpretar el mismo hecho. No se movió en esta tarea.

### 8.4 Valores de dominio vs “hardcodeo”

**[VERIFICADO]** No todo literal es un hardcodeo incorrecto. Por ejemplo, los enum de medios de pago y los límites de servicio están centralizados en archivos de dominio y compartidos. El problema es repetirlos o decidirlos dentro de una pantalla/ruta sin dueño.

**[DECISIÓN APROBADA]** Para el Manual Vivo rige la política transversal definida para ERP Azul: no crear nuevos valores de negocio/diseño/configuración directamente dentro de un módulo. Antes de crear: **buscar → reutilizar → ampliar → crear**. Si el concepto es realmente nuevo, primero debe nacer en su fuente única y después ser consumido por el módulo.

**[PROBLEMA]** Esta política todavía no aparece formalizada en un documento/candado específico de “cero hardcodeo” encontrado en el repositorio durante este relevamiento. Debe considerarse una regla de proyecto pendiente de materializar y automatizar, no una garantía técnica ya existente.

---

## 9. Problemas verificados que importan al POS

1. **[PROBLEMA — CRÍTICO] Precio normal client-authoritative.** El servidor persiste el precio normal recibido del navegador. Antes de hacerlo server-authoritative se necesita comparación en sombra con ventas reales para demostrar que el cálculo nuevo reproduce exactamente el comportamiento válido actual.

2. **[PROBLEMA] Escala/bulto con criterios divergentes.** Hay más de una definición de la misma pregunta entre POS/Stock/precios. Unificarla puede cambiar dinero cobrado y por eso requiere medición + decisión.

3. **[PROBLEMA] `Venta.turnoId` históricamente nullable en DB.** El runtime exige turno, pero la protección no es equivalente a una constraint de base. La auditoría antigua ya lo marcaba como limitación estructural; confirmar schema/migración vigente antes de planear una corrección.

4. **[PROBLEMA / COMPORTAMIENTO DELIBERADO] Acreditación de puntos post-venta es best-effort.** Si falla, la venta continúa. Esto evita perder una venta cobrada, pero implica que Fidelidad necesita mecanismos de reconciliación/auditoría propios.

---

## 10. Decisiones pendientes

### DP-01 — Qué significa precio guardado en productos kg con factor

**[DECISIÓN PENDIENTE]** Para un producto en kg con `factor_pack > 1`, ¿el precio guardado representa bulto o kilo? El código actual no da una respuesta única y elegir una cambia superficies y potencialmente el cobro.

### DP-02 — Cuándo pasar el precio normal a server-authoritative

**[DECISIÓN PENDIENTE OPERATIVA]** La dirección técnica es clara: el servidor debe resolver el precio. Pero no debe activarse a ciegas. Primero hay que desplegar comparación en sombra, observar diferencias reales y recién después decidir el corte. Esta decisión depende de evidencia de producción, no de preferencia de código.

### DP-03 — Formalización automática de cero hardcodeo

**[DECISIÓN PENDIENTE DE ARQUITECTURA]** Definir qué categorías tendrá el trinquete automático (colores/tokens, URLs/config, constantes de negocio, reglas duplicadas, etc.) y qué excepciones son legítimas. La regla conceptual está aprobada; falta convertirla en controles ejecutables sin falsos positivos masivos.

---

## 11. Decisiones aprobadas respaldadas

- **[DECISIÓN APROBADA]** El backend debe ser autoridad en datos sensibles ya migrados: modalidad de servicio, recargo, puntos, lista válida, composición de combo, stock y comisiones se recalculan/validan server-side.
- **[DECISIÓN APROBADA]** Una venta no entra en un turno cuyo corte de cierre ya comenzó.
- **[DECISIÓN APROBADA]** Una venta offline ya cobrada no se pierde solo porque el operario haya vencido al sincronizar; se usa voucher firmado y existe fallback auditable para legacy.
- **[DECISIÓN APROBADA]** Servicios variables: cantidad 1, sin stock, sin descuentos/listas/puntos, cobertura íntegra en efectivo.
- **[DECISIÓN APROBADA]** Pagos múltiples se congelan por tender en `VentaPago`; FIADO no se mezcla en v1.
- **[DECISIÓN APROBADA]** Venta interna y transferencia son atómicas y no duplican el descuento físico del depósito.
- **[DECISIÓN APROBADA]** No bloquear una venta del mostrador por la nueva detección de escala contradictoria: registrar la anomalía primero; corregir silenciosamente podría cambiar el precio dicho al cliente. La pieza de detección existe y su enganche pertenece a la tanda de congelar escala.

---

## 12. Pruebas y candados existentes

**[VERIFICADO]** `lib/pos-ventas/` ya contiene pruebas específicas junto a piezas del dominio. Entre las visibles en el árbol están `anularVenta.test.mjs`, `escalaContradictoria.test.mjs` y `generarTicketPDF.test.mjs`, además de otras pruebas del área que deben seguir enumerándose por `git ls-files "*.test.mjs"` al ejecutar la suite.

**[VERIFICADO]** El repositorio tiene una suite global y el proyecto usa candados/contrapruebas para reglas críticas. La existencia de tests de piezas puras **no equivale** a una prueba E2E completa del flujo POS navegador → API → DB → stock → ticket. Esta ficha no afirma cobertura total.

**[IDEA / PRÓXIMA CAPA DE CALIDAD]** Para declarar “POS completo protegido” hace falta una matriz E2E de escenarios de negocio: venta normal, pack/unidad remanente, peso, servicio, combo, pago mixto, fiado, puntos, cliente/lista, stock insuficiente/negativo permitido, offline/idempotencia, venta interna, corte de turno y reversión/corrección. Debe usar datos controlados y comprobar efectos en DB, no solo que la pantalla muestre éxito.

---

## 13. Estado general

**[VERIFICADO]** POS Venta es un módulo maduro y mucho más protegido que una pantalla de cobro simple: gran parte de las reglas sensibles ya se movieron a helpers compartidos y/o se recalculan en servidor. Pagos múltiples, servicios, puntos, listas, combos, stock y venta interna tienen defensas explícitas.

**[PROBLEMA PRINCIPAL]** La excepción más importante es justamente la más sensible: **el precio normal final todavía no tiene al servidor como fuente única de verdad**. Además, la noción de escala/bulto sigue duplicada en varias superficies.

**Conclusión de la ficha piloto:** el POS no necesita ser reescrito. Necesita terminar de cerrar sus fuentes únicas, documentar las decisiones de negocio que el código no puede resolver y proteger el flujo completo con pruebas de integración/E2E. Cualquier función nueva debe consumir fuentes existentes; si no existe una fuente adecuada, se crea primero en el dominio correspondiente y recién después se usa en POS.

---

## 14. Qué NO se hizo en este relevamiento

- No se modificó código funcional.
- No se cambió schema ni migraciones.
- No se cambió ningún precio, stock, venta, turno o configuración.
- No se resolvieron decisiones de negocio pendientes por inferencia.
- No se declaró que una deuda histórica siga abierta sin marcar cuándo necesita reconfirmación contra HEAD/schema.
- No se convirtió ninguna IDEA en funcionalidad.
