# Auditoría POS-Ventas — UX y flujo operativo (Fase 3)

**Alcance:** Diagnóstico de experiencia de uso, flujo de venta y velocidad real. Sin implementación, sin refactor, sin tocar backend.

---

## FLUJO DE VENTA

- **Cobrar venta típica (efectivo, sin cliente/descuento):** 1) Buscar/escanear producto (BuscadorProductos) → 2) Click en resultado o Enter (agrega 1 unidad) → repetir por cada ítem → 3) Seleccionar forma de pago (ya por defecto efectivo) → 4) Click COBRAR → 5) Modal pago efectivo: ingresar “paga con” o usar botón monto sugerido → 6) Confirmar → 7) Modal ticket: Imprimir térmica / PDF / No imprimir. **Mínimo ~5–7 acciones** (búsqueda + agregar N veces + forma pago + cobrar + efectivo + confirmar + opción ticket).
- **Pasos innecesarios o redundantes:** El modal de ticket post-venta obliga a elegir “Imprimir / PDF / No imprimir” en cada venta; no hay opción “no preguntar” o “siempre no imprimir” para acelerar. Para venta solo efectivo sin descuento no hace falta tocar cliente ni descuento, pero el header muestra muchos botones (Cliente, Descuento, Caja +/-, Cerrar turno, etc.) que pueden distraer.
- **Fricciones:** Si el cajero quiere cambiar cantidad después de agregar, debe ir al carrito y usar +/- o input (en mobile el stepper es compacto y el “Quitar” por ítem es texto pequeño). No hay “agregar y sumar N” en un solo paso (ej. “agregar 3” desde el resultado de búsqueda). Para efectivo, siempre se abre ModalPagoEfectivo aunque el total sea exacto (no hay “cobrar exacto” en un click).
- **Confusión posible:** Forma de pago “Fiado” sin cliente seleccionado da error después de apretar Cobrar; no se deshabilita el botón Cobrar ni se muestra aviso previo en el panel. Si el usuario eligió fiado y no puso cliente, recién al cobrar ve “Para venta fiado debés seleccionar un cliente.” El botón “Limpiar” en CarritoVenta (components/pos-ventas/CarritoVenta.jsx) vacía todo el carrito sin confirmación: riesgo de toque accidental.
- **Lento o repetitivo:** Agregar varios ítems del mismo producto implica: buscar una vez, click en resultado (agrega 1), luego ir al carrito y subir cantidad con +. No hay “agregar con cantidad” desde el buscador (ej. input cantidad + agregar). Debounce 300 ms en búsqueda (BuscadorProductos) puede sentirse lento al escribir rápido. Lista de resultados limitada a 10 ítems (take 10 en API); si hay muchos coincidencias, no hay “ver más”.
- **Optimización para velocidad:** El flujo está pensado para escaneo (Enter rápido + buffer) y teclado (F2–F6, F10); en mobile todo es touch y no hay atajos. El total a cobrar está bien visible en FormaPago; el COBRAR es el CTA principal. Falta camino “ultra rápido” para venta solo efectivo sin ticket (ej. “Cobrar y listo” que cierre venta y no abra modal ticket).

**Archivos:** app/modulos/pos-ventas/page.jsx (flujo), components/pos-ventas/BuscadorProductos.jsx (debounce 300, Enter, resultados 10), components/pos-ventas/FormaPago.jsx, components/pos-ventas/ModalPagoEfectivo.jsx, components/pos-ventas/ModalTicket.jsx.

---

## MOBILE

- **Comportamiento:** Layout en columna (flex-col) en pantalla chica; Buscador arriba, Carrito en el medio con scroll (max-h implícito en flex-1 min-h-0), FormaPago abajo. pb-24 en el contenedor (page.jsx) deja espacio al final; no hay barra fija inferior con acciones.
- **Botones chicos:** Header: botones con text-[11px] y py-1 (Historial, Pendientes, Cliente, Puntos, Caja +/-, Cerrar Turno, Salir). En touch son difíciles de apuntar sin equivocarse; varios en una sola fila con gap-2 que en móvil se aprietan. FormaPago: grid 3 columnas, min-h-11, text-xs: los 5 botones de forma de pago son relativamente pequeños; en celular el pulgar puede tocar el de al lado.
- **Zonas apretadas:** Carrito en mobile (CarritoVenta block lg:hidden): cada ítem en un bloque con nombre, precio, CantidadStepper y “Quitar” (text-xs pos-text-danger). El “Quitar” está cerca del subtotal del ítem; riesgo de toque al intentar cambiar cantidad. El botón “Limpiar” está en la misma barra que “Cliente” y “Descuento”, todos text-xs.
- **Modales:** ModalPagoEfectivo, ModalDescuento, ModalTicket, ClientePickerFullscreen usan fixed inset-0 y p-4; en pantalla chica el contenido (max-w-md o max-w-sm) puede requerir scroll si el teclado está abierto (ej. input “paga con”). ModalAperturaTurno y ModalCierreTurno con max-w-md/lg y overflow-y-auto; en móvil el cierre tiene bastante contenido (resumen, desglose, input monto, observaciones) y puede hacer scroll.
- **Scroll excesivo:** Lista de resultados del buscador max-h-60 overflow-y-auto; carrito sin límite de altura en la columna (flex-1 min-h-0 lg:overflow-auto), en mobile puede ser largo. Historial y Pendientes abren en modales con max-h-[85vh] y scroll interno; correcto. El problema es el scroll del body cuando hay muchos ítems en carrito y el panel de pago queda abajo.
- **Difícil de tocar rápido:** Botones de forma de pago (efectivo, mercadopago, debito, credito, fiado) en grid 3; en móvil el área efectiva de cada uno es reducida. CantidadStepper: botones − y + con w-7 h-7 (CarritoVenta.jsx); aceptable pero justo. “Elegir cliente” / “Cliente: X” y “Descuento” / “Desc. -$X” son enlaces tipo botón pequeños; en corrida es fácil saltar de pantalla o no acertar.

**Archivos:** app/modulos/pos-ventas/page.jsx (layout, pb-24, header), components/pos-ventas/CarritoVenta.jsx (mobile block lg:hidden, stepper w-7), components/pos-ventas/FormaPago.jsx (grid min-h-11).

---

## CARRITO

- **Edición de cantidad:** CantidadStepper en CarritoVenta: − / input / +. Input acepta vacío y en onBlur normaliza a min (1 o 0.001 para kg). Para kg step 0.001; para unidad entera. Límite superior: item.stockMax || 9999; no se muestra “máx. N” al lado. En mobile el stepper es compact (compact=true) con input w-14; en desktop w-16. Cambiar cantidad es claro pero requiere ir al carrito y tocar/click; no se puede desde la lista de búsqueda.
- **Borrar ítems:** Por ítem: botón “Quitar” (mobile) o “✕” (desktop). “Limpiar” vacía todo el carrito sin confirmación; texto “Limpiar” en text-xs pos-text-danger junto a Descuento.
- **Cambiar precio:** No existe. El carrito usa siempre el precio que trajo el producto al agregar (precioVenta); no hay campo ni acción para modificar precio desde el POS. Si aplica por política (ej. precio especial), hoy no está soportado en UI.
- **Claridad visual:** Subtotal al final del carrito en una sola línea: “SUBTOTAL $ X”. No se muestra en el carrito el total con descuento ni descuento por puntos; eso solo está en el panel FormaPago. Si hay descuento aplicado, en el carrito solo aparece el botón “Desc. -$X”; el usuario no ve “total a pagar” dentro del bloque carrito. En desktop tabla con columnas Producto, Cant., P. Unit., Subtotal, y ✕; legible.
- **Descuentos / puntos:** Descuento se abre con ModalDescuento (porcentaje o monto fijo, botones rápidos 5/10/15/20 %). Puntos solo si hay cliente con puntos activos; botón “Puntos” en header que abre ModalCanjePuntos. El descuento por puntos se refleja en FormaPago (y en total); en el carrito no hay línea “Descuento puntos”.
- **Riesgo de error humano:** Limpiar sin confirmación: un toque en “Limpiar” borra todo. Cantidad en kg con decimales: input libre; si alguien escribe “1,5” o “1.5” se normaliza en blur, pero durante la edición puede haber valores inválidos y al cobrar se valida; si queda vacío, onBlur pone minVal. No hay advertencia visual si cantidad > stock (solo límite en stepper con stockMax). Borrar ítem con “Quitar”/✕ no pide confirmación; aceptable para un ítem pero el botón está cerca del subtotal.

**Archivos:** components/pos-ventas/CarritoVenta.jsx (stepper, Limpiar, Quitar, subtotal, sin total con descuento en carrito).

---

## CLIENTE Y FIADO

- **Claridad del flujo:** Cliente es opcional. Se elige con “Elegir cliente” / “Cliente: X” en header o en el bloque carrito; abre ClientePickerFullscreen. Hay que escribir al menos 2 caracteres y pulsar “Buscar” (o Enter); no hay lista de “clientes frecuentes” ni acceso rápido. Para fiado: primero elegir cliente, luego forma de pago “Fiado”. Si no hay cliente y se elige Fiado, el error aparece al pulsar Cobrar.
- **Cuándo aparece cada cosa:** Info de crédito (saldo, límite, disponible) solo se muestra cuando formaPago === "fiado" y hay clienteSeleccionado y creditoInfo cargado (page.jsx). El botón “Puntos” solo si clienteSeleccionado && puntosActivo && saldoPuntos > 0 && !offlineMode; si el cliente no tiene programa de puntos no se ve. No hay mensaje del tipo “Seleccioná un cliente para fiado o puntos”.
- **Guiado:** No está explícito que “para vender fiado primero elegí cliente”. El botón Cobrar con forma fiado no se deshabilita sin cliente; el flujo corrige con toast/error. Modal de confirmación cuando límite excedido y política ADVERTIR está bien; si política BLOQUEAR se muestra error y no se puede seguir.
- **Errores posibles:** Vender fiado sin cliente → error al cobrar. Elegir cliente con límite excedido y BLOQUEAR → error claro. Elegir cliente, poner fiado, y luego cambiar a otro cliente sin cambiar forma de pago: el sistema sigue con el cliente actual; no hay inconsistencia pero puede confundir si el usuario pensaba que cambiaba la “venta a nombre de”. No se muestra en el header “Venta a nombre de: X” de forma muy visible cuando hay cliente; solo “Cliente: X” en un botón secundario.

**Archivos:** app/modulos/pos-ventas/page.jsx (creditoInfo, verificarLimiteCredito, handleCobrar), components/pos-ventas/ClientePickerFullscreen.jsx (buscar mínimo 2 caracteres), components/pos-ventas/FormaPago.jsx (botón fiado sin deshabilitar por falta de cliente).

---

## CAJA Y TURNO

- **Apertura:** ModalAperturaTurno (components/pos-ventas/ModalAperturaTurno.jsx) bloquea la pantalla hasta abrir turno. Campo “Monto inicial en caja” + botones rápidos 0, 5000, 10000. Sin turno no se puede hacer nada más; claro. No hay opción “abrir sin monto” explícita (se puede poner 0).
- **Cierre:** Botón “Cerrar Turno” en header (text-[11px] sunmi-pos-btn-danger). Abre ModalCierreTurno: carga GET turnos/resumen (ventas + totalIngresosCaja, totalRetirosCaja), muestra ventas/efectivo/digital, desglose digital y comisiones, “Monto inicial + Ventas efectivo + Ingresos caja - Retiros caja = Efectivo esperado”, input “Monto real contado”, diferencia, observaciones. Está claro y el resumen incluye movimientos de caja. Al confirmar, POST turnos/cerrar.
- **Caja +/-:** Botón “Caja +/-” en header (solo si hay turnoActual); abre ModalCajaMovimiento (components/pos-ventas/ModalCajaMovimiento.jsx). Permite registrar INGRESO o RETIRO con monto y motivo. El resumen de cierre usa esos movimientos (vía turnos/resumen). El botón está junto a Historial, Pendientes, Cliente, Puntos, Cerrar turno; en mobile puede pasar desapercibido o confundirse con “Cerrar turno”.
- **Claridad:** Apertura y cierre son claros. Falta en pantalla principal un indicador de “turno abierto desde las HH:MM” o “monto en caja esperado hasta ahora” sin tener que abrir el modal de cierre. El texto “Caja +/-” es breve; algún usuario puede no asociarlo a “ingresos y retiros de efectivo”.
- **Accesos:** Cerrar turno y Caja +/- están en el header a la derecha; en móvil el header se llena y puede hacer scroll horizontal o envolver; no hay menú “Caja” que agrupe apertura/cierre/movimientos.

**Archivos:** app/modulos/pos-ventas/page.jsx (header, setMostrarCierre, setMostrarCajaMovimiento), components/pos-ventas/ModalAperturaTurno.jsx, components/pos-ventas/ModalCierreTurno.jsx, components/pos-ventas/ModalCajaMovimiento.jsx.

---

## OFFLINE

- **Qué entiende el usuario:** Badge “OFFLINE” en header (verde/ámbar según estado). Mensaje bajo FormaPago: “OFFLINE: solo efectivo. Se guarda pendiente y se sincroniza al volver internet.” El botón de cobrar pasa a “GUARDAR PENDIENTE $X”. Las formas de pago no efectivo se deshabilitan (opacity-50) y al tocar muestran toast “Sin internet: solo efectivo disponible”. Pendientes: “Pendientes: N” o botón “Pendientes (N)” cuando queueLength > 0.
- **Qué no entiende:** No se explica que las ventas pendientes viven solo en ese navegador/dispositivo (localStorage); si cierra el navegador o cambia de dispositivo, se pierden. No se dice que al volver online hay que pulsar “PROCESAR COLA” para subir las ventas; el botón aparece pero no hay guía. Si hay pendientes y el usuario cierra turno, no se avisa que esas ventas quedarán para el próximo turno al procesar.
- **Riesgos operativos:** Creer que “guardar pendiente” ya está en el servidor; en realidad queda local hasta procesar cola. Hacer muchas ventas offline y no procesar cola: al cerrar o refrescar, las ventas siguen en cola pero el número de ticket no existe en el servidor hasta procesar. No hay indicador de “última sincronización” ni “X ventas pendientes de subir”.
- **Feedback insuficiente:** Tras “Guardar pendiente” se muestra ModalTicketOffline y toast “Venta guardada offline. Ticket generado.”; está bien. Al procesar cola, si una venta falla (ej. stock), se corta y se muestra error; no se indica “venta 1 OK, venta 2 falló” de forma explícita en lista. No hay feedback de “conectando…” al volver online antes de que el badge pase a ONLINE.

**Archivos:** app/modulos/pos-ventas/page.jsx (offlineMode, guardarVentaPendiente, procesarCola, mensaje OFFLINE), components/pos-ventas/FormaPago.jsx (GUARDAR PENDIENTE, deshabilitar no efectivo), components/pos-ventas/ModalPendientesOffline.jsx.

---

## HISTORIAL Y STATS

- **Si sirven:** StatsDelDia (ventas del día, total $, ítems) en header (hidden en sm en la barra principal, en sm:hidden en bloque aparte). Útil para ver “cuánto llevo hoy”. HistorialDia (modal) lista ventas del día con filtros (número, forma de pago, vendedor si turnos.ver_todos), permite reimprimir ticket. Sirve para consultar una venta o reimprimir.
- **Falta operativo:** Stats no desglosan por forma de pago ni por vendedor en pantalla. Historial no permite anular ni ver detalle de ítems por venta en el listado (solo al reimprimir se ve el ticket). No hay “última venta” rápida (ej. “Venta #N – $X” en una línea).
- **Ubicación:** Stats en header a la derecha del nombre del local (desktop) o en bloque debajo (mobile); compactos (text-[11px]). Botón “Historial” con icono ClipboardList y texto “Historial” (hidden en sm en móvil); en móvil solo el icono. Historial abre modal full overlay; bien. El botón compite con muchos otros en la misma barra; en móvil puede quedar poco visible.

**Archivos:** components/pos-ventas/StatsDelDia.jsx, components/pos-ventas/HistorialDia.jsx, app/modulos/pos-ventas/page.jsx (header).

---

## ATAJOS Y VELOCIDAD

- **F1:** Focus en input buscar (document.getElementById("buscar-producto")?.focus()). Útil si el usuario estaba en otro control. No se aplica si hay modal abierto (efectivo, ticket, descuento, picker cliente, historial).
- **F2–F6:** Cambian forma de pago (efectivo, mercadopago, debito, credito, fiado). No se aplican con modal abierto. En laptop/teclado ayudan; en tablet/celular no hay teclado F.
- **F10:** Inicia cobro (mismo que click en COBRAR) si carrito tiene ítems y no está cobrando. No se aplica con modal abierto; si el usuario tiene modal efectivo abierto, F10 no hace nada (debe cerrar modal o confirmar).
- **Ayuda:** Texto fijo al pie en desktop: “F1: Buscar | F2: Efectivo | F3: MP | F4: Debito | F5: Credito | F6: Fiado | F10: Cobrar” (hidden lg:block). En mobile no se muestra; no hay alternativa (gestos o botones grandes).
- **Qué falta:** No hay atajo para “limpiar carrito” (riesgo si se pusiera F12 u otro). No hay atajo para “agregar último producto otra vez” o “duplicar ítem”. Enter en buscador agrega primer resultado; bien. No hay atajo para abrir/cerrar cliente o descuento. No hay tecla “Escape” documentada para cerrar modales (depende del modal).
- **Acciones que podrían ser más rápidas:** “Cobrar exacto” en efectivo (un botón que cierre venta con “paga con = total” y sin abrir modal efectivo). “No imprimir por defecto” o “no preguntar ticket” para no abrir modal ticket. Agregar con cantidad desde búsqueda (ej. “3” + Enter = agregar 3 del primero). Descuento rápido por tecla (ej. F8 = 10 %).

**Archivos:** app/modulos/pos-ventas/page.jsx (useEffect handleShortcut, texto F1…F10).

---

## TOP 10 MEJORAS

1. **Confirmación antes de Limpiar carrito** (CarritoVenta) — evita borrado accidental.
2. **Deshabilitar o avisar “Cobrar” en fiado sin cliente** (FormaPago/page) — evita error después de click.
3. **Botones de header más grandes en mobile** (page.jsx header) — menos toques errados.
4. **Opción “No imprimir / no preguntar” ticket** (ModalTicket o preferencia) — menos pasos por venta.
5. **Agregar con cantidad desde búsqueda** (BuscadorProductos) — menos clicks para varios ítems iguales.
6. **“Cobrar exacto” para efectivo** (FormaPago/ModalPagoEfectivo) — un click cuando el cliente paga justo.
7. **Indicador claro de ventas pendientes de subir** (offline) — que no se pierdan o se olvide procesar.
8. **Atajo o botón rápido para focus búsqueda en mobile** — equivalente a F1 en touch.
9. **Mostrar total a pagar (con descuentos) en zona carrito** — refuerzo visual.
10. **Agrupar Caja / Turno en un menú o sección** (header) — menos botones sueltos y más claro “Caja +/-”.

---

## PRIORIDAD 1 (CRÍTICO)

- **Limpiar carrito sin confirmación** (CarritoVenta.jsx): Un toque en “Limpiar” borra todo. **CRÍTICO** riesgo operativo.
- **Fiado sin cliente:** Cobrar habilitado; error solo al confirmar. Debe deshabilitar Cobrar o mostrar aviso claro cuando formaPago === "fiado" && !clienteSeleccionado. **CRÍTICO** para evitar ventas mal registradas.
- **Offline: no explicar que pendientes son solo en este dispositivo** y que hay que “Procesar cola” al volver. Riesgo de pérdida de ventas o doble cobro si no se entiende. **CRÍTICO** comunicación.

---

## PRIORIDAD 2 (ALTO)

- **Header mobile:** Demasiados botones pequeños (text-[11px], py-1); difícil tocar bien. **ALTO** UX mobile.
- **Modal ticket obligatorio cada venta:** No hay “no preguntar” o “no imprimir por defecto”; fricción en ventas rápidas. **ALTO** velocidad.
- **Efectivo sin “cobrar exacto”:** Siempre abre modal “paga con”; si el cliente paga justo, un botón “Cobrar exacto” ahorraría un paso. **ALTO** velocidad.
- **Agregar cantidad desde búsqueda:** No se puede “agregar 3” del primer resultado; hay que agregar 1 y luego subir cantidad en carrito. **ALTO** velocidad.
- **Formas de pago en mobile:** Grid 3 columnas, botones pequeños; riesgo de tocar la forma equivocada. **ALTO** UX mobile.

---

## PRIORIDAD 3 (MEDIO / BAJO)

- **Total con descuento no visible en carrito:** Solo en panel derecho; refuerzo en carrito ayudaría. **MEDIO** claridad.
- **Atajos no visibles en mobile:** F1–F10 solo en desktop; no hay equivalente táctil documentado. **MEDIO** velocidad mobile.
- **“Caja +/-” poco descubrible:** Nombre corto; agrupar con Cierre en “Caja” podría ayudar. **MEDIO** descubribilidad.
- **Stats sin desglose por forma de pago en pantalla:** Solo total y cantidad; desglose sería útil. **BAJO** operativo.
- **Historial sin detalle de ítems en lista:** Solo al reimprimir; bajo impacto. **BAJO**.

---

**Documento de auditoría UX; no incluye implementación ni cambios de código.**
