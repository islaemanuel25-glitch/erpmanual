"use client";

import { memo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { IconoMedio } from "@/components/pos-ventas/IconosMedios";
import { showError } from "@/components/sunmi/SunmiToast";
import { aCentavos, MEDIO_LABEL } from "@/lib/pos-ventas/pagos";
import { MEDIOS_POR_DEFECTO } from "@/lib/pos-ventas/mediosCobro";
import { componerCobroSimple, evaluarDivisionPago } from "@/lib/pos-ventas/servicios";
import { avisoPagoCombinado, recargoDeVenta } from "@/lib/recargos-pago/recargoPago";
import { aMedioEnum } from "@/lib/ofertas/previewPos";

// ── LOS BOTONES SALEN DE LA CONFIGURACIÓN DEL LOCAL ────────────────────────
//
// Antes había acá una lista fija de cuatro. Ahora los medios se configuran por
// local —cuáles, cómo se llaman y en qué orden— y llegan por props desde
// `/api/medios-cobro`.
//
// El respaldo NO es otra lista escrita al lado: sale de `MEDIOS_POR_DEFECTO`,
// que es la MISMA constante que usa el servidor cuando un local no configuró
// nada. Una segunda lista acá se separaría de aquélla el día que una cambie, y
// el POS mostraría botones distintos de los que el backend cobra.
//
// Se usa cuando no llega configuración: modo offline, o una pantalla que todavía
// no la pasa.
function mediosDesdeDefaults() {
  return MEDIOS_POR_DEFECTO.map((d) => ({
    key: d.tipoContable.toLowerCase(),
    label: MEDIO_LABEL[d.tipoContable] || d.tipoContable,
    tipoContable: d.tipoContable,
  }));
}

/**
 * De la configuración a lo que dibuja el botón.
 *
 * `key` en minúscula porque es lo que espera `IconoMedio` y lo que viaja como
 * `formaPago` en el payload —que es el contrato de hoy y no se toca—. `label` es
 * el nombre configurado, que puede ser "MP Débito". `tipoContable` es lo que
 * decide todo lo comercial y lo que la venta congela.
 */
function aBotones(mediosCobro) {
  if (!Array.isArray(mediosCobro) || mediosCobro.length === 0) return mediosDesdeDefaults();
  return mediosCobro
    .filter((m) => m.activo !== false)
    .map((m) => ({
      key: String(m.tipoContable).toLowerCase(),
      label: m.nombre,
      tipoContable: m.tipoContable,
    }));
}

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Filas iniciales del "Dividir pago": los DOS PRIMEROS medios del local, con los
 * importes vacíos.
 *
 * Antes eran efectivo y débito fijos. Con medios configurables eso se rompe solo:
 * un local que no cobra con débito abriría el panel con una fila de un medio que
 * no tiene, y al confirmar el backend rechazaría la venta.
 *
 * Si el local tiene un solo medio, se abre con una fila: dividir entre uno no
 * tiene sentido, pero tampoco lo tiene inventar un segundo medio.
 */
function filasIniciales(medios) {
  return medios.slice(0, 2).map((m) => ({ medio: m.key, monto: "" }));
}

function FormaPago({
  subtotal,
  descuento = 0,
  descuentoPorPuntos = 0,
  formaPago,
  onFormaPagoChange,
  onCobrar,
  cobrando,
  disabled,
  offlineMode = false,
  queueLength = 0,
  onProcesarCola,
  procesandoCola = false,
  comisiones = null,
  clienteSeleccionado = null,
  minEfectivoServicios = 0,
  // ── CONDICIÓN COMERCIAL: EL TOTAL DEJÓ DE SER UN NÚMERO ───────────────────
  //
  // `previewPorMedio` es la salida de `totalesPorMedio` (lib/ofertas/previewPos):
  // un total por cada medio, más `__paraMedios(medios[])` para el panel dividido,
  // donde el conjunto lo arma la persona. Todos esos números los produjo el MISMO
  // motor que corre en el servidor al cobrar; acá no se calcula ninguno.
  //
  // Cuando llega `null` —modo offline, o una pantalla que todavía no lo pasa—
  // este componente se comporta EXACTAMENTE como antes, usando `subtotal` y los
  // descuentos. Esa rama no se tocó a propósito: es el camino por donde entra la
  // plata todos los días.
  previewPorMedio = null,
  recargosPorMedio = null,
  hayOfertaSoloEfectivo = false,
  // Los medios configurados del local, de `/api/medios-cobro`. Sin esto —modo
  // offline, o una pantalla que todavía no los pasa— se usan los defaults, que
  // son la MISMA constante que usa el servidor.
  mediosCobro = null,
}) {
  // Los botones del cobro simple y del pago dividido salen de la configuración.
  // Fiado no está: es tender único y se dibuja aparte, con sus propias
  // condiciones.
  const MEDIOS_COBRO = aBotones(mediosCobro);
  const MEDIOS_DIVIDIR = MEDIOS_COBRO;
  const base = subtotal - descuento - descuentoPorPuntos;

  // El total de un conjunto de medios. Sin preview, el de siempre.
  const totalDe = (medios) => {
    if (!previewPorMedio) return base;
    if (medios.length === 1) {
      const p = previewPorMedio[aMedioEnum(medios[0])];
      if (p) return p.total;
    }
    return previewPorMedio.__paraMedios ? previewPorMedio.__paraMedios(medios).total : base;
  };

  // ── ¿HACE FALTA MOSTRAR UN NÚMERO POR BOTÓN? ─────────────────────────────
  //
  // Solo cuando los cuatro NO dan lo mismo. Sin ofertas y sin recargos —que es
  // casi todo el día en casi todos los locales— los cuatro coinciden y el panel
  // queda idéntico a como estaba: un total grande arriba y cuatro botones. Poner
  // el mismo número cuatro veces no informa, ocupa lugar y desplaza los botones.
  const totalesMedios = previewPorMedio
    ? MEDIOS_COBRO.map((m) => aCentavos(previewPorMedio[aMedioEnum(m.key)]?.total ?? base))
    : [];
  const totalPorMedioDifiere =
    totalesMedios.length > 0 && new Set(totalesMedios).size > 1;

  // El total "sin elegir medio". Con los cuatro iguales es ese valor común (que
  // ya puede incluir una oferta de cualquier medio); si difieren, no existe un
  // único total honesto y el número grande se reemplaza por los de cada botón.
  //
  // Se pregunta por el PRIMER medio del local y no por "efectivo": desde que los
  // medios se configuran, un local puede no tener efectivo, y pedir el total de
  // un medio que no cobra devolvería un número que no corresponde a ningún botón.
  // En esta rama los totales son todos iguales, así que cuál se pregunte no
  // cambia el número — cambia que el número exista.
  const total =
    previewPorMedio && !totalPorMedioDifiere && MEDIOS_COBRO.length > 0
      ? totalDe([MEDIOS_COBRO[0].key])
      : base;

  // ── Servicios de importe variable: mínimo a cubrir en EFECTIVO ────────────
  const minEf = Math.max(0, Number(minEfectivoServicios) || 0);
  const totalCent = aCentavos(total);
  const minEfCent = aCentavos(minEf);
  const hayServicios = minEfCent > 0;
  const soloServicios = hayServicios && minEfCent >= totalCent; // totalServicios == totalVenta
  const restoCent = Math.max(0, totalCent - minEfCent);
  const resto = restoCent / 100;
  const puedeVender = !disabled && !cobrando && subtotal > 0;

  // ── Modo: simple (por defecto) o avanzado (Dividir pago) ──────────────────
  const [modo, setModo] = useState("simple");
  const [filas, setFilas] = useState(() => filasIniciales(MEDIOS_COBRO)); // [{ medio, monto:string }]

  // Recalcular ante cambios del carrito: si cambió el total o el mínimo de servicios,
  // resetear las filas del "Dividir pago" para no arrastrar importes obsoletos.
  // Patrón React de "ajustar estado al cambiar props durante el render".
  const carritoKey = `${totalCent}-${minEfCent}`;
  const [prevCarritoKey, setPrevCarritoKey] = useState(carritoKey);
  if (carritoKey !== prevCarritoKey) {
    setPrevCarritoKey(carritoKey);
    setFilas(filasIniciales(MEDIOS_COBRO));
  }

  // ── Cobro SIMPLE: un medio → componer payload server-authoritative ─────────
  //
  // El total que se manda es el DE ESE MEDIO, no el de la pantalla: es el mismo
  // número que el cajero acaba de ver en el botón que apretó. Viaja además como
  // `totalPantalla` para que el servidor pueda rechazar la venta si su cuenta da
  // otra cosa, en vez de registrar un total distinto del que se le pidió al
  // cliente.
  const cobrarSimple = (medio) => {
    if (!puedeVender) return;
    if (medio === "fiado" && hayServicios) {
      return showError("No se puede fiar una venta que contiene servicios");
    }
    const totalMedio = totalDe([medio]);
    onCobrar({
      ...componerCobroSimple({ medio, total: totalMedio, minEfectivoServicios: minEf }),
      totalPantalla: totalMedio,
    });
  };

  // ── Modo AVANZADO: editor de filas (medio + importe). Lógica en helper puro. ──
  //
  // El total del panel dividido SE RECALCULA con el conjunto de medios elegido:
  // agregar débito a un pago en efectivo puede perder una oferta de solo efectivo
  // Y sumar un recargo, y las dos cosas mueven el número que el cajero tiene que
  // cobrar. Los importes que se tipean abajo tienen que sumar ESE total.
  const mediosUsados = filas.map((f) => f.medio);
  const totalDividido = totalDe(mediosUsados);
  const div = evaluarDivisionPago({ filas, total: totalDividido, minEfectivoServicios: minEf });
  const puedeCobrarDividido = puedeVender && div.puedeCobrar;

  // Aviso del pago combinado. El texto lo arma `recargoPago.js` para que el POS y
  // el backend digan exactamente lo mismo; acá solo se lo muestra.
  const avisoCombinado = recargosPorMedio
    ? avisoPagoCombinado({
        mediosUsados: mediosUsados.map(aMedioEnum),
        recargo: recargoDeVenta(mediosUsados.map(aMedioEnum), recargosPorMedio),
        hayOfertaSoloEfectivoEnCarrito: hayOfertaSoloEfectivo,
      })
    : null;

  // Opciones de medio para una fila: su propio medio + los aún no usados (evita duplicados).
  const opcionesPara = (idx) =>
    MEDIOS_DIVIDIR.filter((m) => m.key === filas[idx].medio || !mediosUsados.includes(m.key));

  const cambiarMedio = (idx, medio) => {
    if (filas.some((f, i) => i !== idx && f.medio === medio)) {
      return showError("Ese medio ya está en la lista");
    }
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, medio } : f)));
  };
  const cambiarMonto = (idx, monto) =>
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, monto } : f)));
  const agregarFila = () => {
    const libre = MEDIOS_DIVIDIR.find((m) => !mediosUsados.includes(m.key));
    if (!libre) return showError("No hay más medios para agregar");
    setFilas((prev) => [...prev, { medio: libre.key, monto: "" }]);
  };
  const quitarFila = (idx) =>
    setFilas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const abrirDividir = () => {
    setFilas(filasIniciales(MEDIOS_COBRO));
    setModo("avanzado");
  };
  const volverSimple = () => {
    setModo("simple");
    setFilas(filasIniciales(MEDIOS_COBRO));
  };
  const cobrarDividido = () => {
    if (!puedeCobrarDividido) return;
    const pagos = div.pagos;
    const fp = pagos.length === 1 ? pagos[0].medio : "mixto";
    onCobrar({ formaPago: fp, total: totalDividido, pagos, totalPantalla: totalDividido });
  };

  const BTN_PRIMARIO = "sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md";
  const BTN_MEDIO = "sunmi-btn sunmi-pos-btn-secondary min-h-14 text-sm font-semibold rounded-md";

  // Texto/estado del botón de cobro del modo dividido.
  let textoCobrarDiv;
  if (cobrando) textoCobrarDiv = "Procesando...";
  else if (puedeCobrarDividido) textoCobrarDiv = `COBRAR $${formatPrecio(totalDividido)}`;
  else if (div.estado === "falta") textoCobrarDiv = `FALTAN $${formatPrecio(div.restante)}`;
  else if (div.estado === "excedente") textoCobrarDiv = `SOBRAN $${formatPrecio(div.excedente)}`;
  else textoCobrarDiv = `COBRAR $${formatPrecio(totalDividido)}`;

  return (
    <SunmiCard className="p-3 lg:p-4 flex flex-col gap-3">
      {modo === "avanzado" ? (
        /* ═══════════════ DIVIDIR PAGO (editor de filas) ═══════════════ */
        <>
          <div className="flex items-center justify-between">
            <button type="button" onClick={volverSimple}
              className="text-sm pos-text-link">← Volver</button>
            <span className="text-sm font-bold uppercase tracking-wide">Dividir pago</span>
            <span className="w-12" />
          </div>

          <div className="text-center">
            <span className="text-xs pos-text-muted">Total: </span>
            <span className="text-xl font-black pos-text-accent tabular-nums">${formatPrecio(totalDividido)}</span>
          </div>

          {/* El cajero tiene que conocer el total NUEVO antes de registrar, no
              después: con dos medios puede haberse perdido una oferta de solo
              efectivo y haberse sumado el recargo más alto. */}
          {avisoCombinado && (
            <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium pos-text-accent"
              style={{ background: "color-mix(in srgb, var(--pos-accent) 12%, transparent)" }}>
              {avisoCombinado.split("\n").map((linea, i) => (
                <div key={i}>{linea}</div>
              ))}
            </div>
          )}

          {hayServicios && (
            <div className="text-xs text-center pos-text-muted">
              Efectivo mínimo por servicios: <b className="pos-text-accent">${formatPrecio(minEf)}</b>
            </div>
          )}

          {/* Filas: [ medio ▼ ] [ importe ] [ × ] */}
          <div className="flex flex-col gap-2">
            {filas.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {/* Ícono real del medio (mismo set que el cobro simple); cambia al cambiar el medio. */}
                  <IconoMedio medio={f.medio} size={20} />
                  {/* Select NATIVO (picker del SO en móvil): robusto en todo dispositivo,
                      sin portal ni posicionamiento fijo. Estilizado con la clase sunmi-control. */}
                  <select
                    value={f.medio}
                    onChange={(e) => cambiarMedio(idx, e.target.value)}
                    aria-label="Medio de pago"
                    className="sunmi-control w-full min-w-0 min-h-11 rounded-md px-3 text-base cursor-pointer"
                  >
                    {opcionesPara(idx).map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28 shrink-0">
                  <SunmiInput type="number" inputMode="decimal" value={f.monto} placeholder="$0"
                    onChange={(e) => cambiarMonto(idx, e.target.value)}
                    className="!text-right text-base min-h-11" />
                </div>
                <button type="button" onClick={() => quitarFila(idx)} disabled={filas.length <= 1}
                  aria-label="Eliminar medio"
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md pos-text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={agregarFila}
            disabled={filas.length >= MEDIOS_DIVIDIR.length}
            className="sunmi-btn sunmi-pos-btn-secondary min-h-11 text-sm rounded-md disabled:opacity-40">
            + Agregar medio
          </button>

          {/* Resumen */}
          <div className="flex flex-col gap-0.5 text-sm pt-1 border-t border-[var(--app-border)]">
            <div className="flex justify-between"><span className="pos-text-muted">Total</span><b className="tabular-nums">${formatPrecio(totalDividido)}</b></div>
            <div className="flex justify-between"><span className="pos-text-muted">Pagado</span><b className="tabular-nums">${formatPrecio(div.pagado)}</b></div>
            {div.estado === "excedente" ? (
              <div className="flex justify-between pos-text-danger"><span>Excedente</span><b className="tabular-nums">${formatPrecio(div.excedente)}</b></div>
            ) : (
              <div className={`flex justify-between ${div.estado === "exacto" ? "pos-text-success-soft" : "pos-text-danger"}`}>
                <span>Restante</span><b className="tabular-nums">${formatPrecio(div.restante)}</b>
              </div>
            )}
          </div>

          {hayServicios && !div.cumpleEfectivo && (
            <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium"
              style={{ background: "color-mix(in srgb, var(--pos-danger) 12%, transparent)", color: "var(--pos-danger)" }}>
              Faltan ${formatPrecio(div.faltaEfectivo)} en efectivo para cubrir los servicios
            </div>
          )}

          <button type="button" onClick={cobrarDividido} disabled={!puedeCobrarDividido}
            className={BTN_PRIMARIO}>
            {textoCobrarDiv}
          </button>
        </>
      ) : (
        /* ═══════════════ COBRO SIMPLE ═══════════════ */
        <>
          {/* 1) TOTAL
              Cuando los cuatro medios NO dan lo mismo, no hay un total único que
              sea verdad, y un número grande arriba sería falso en tres de los
              cuatro casos. En vez de inventar uno se dice el rango y el importe
              real vive en cada botón. Con los cuatro iguales —que es casi todo el
              día— esto queda exactamente como estaba. */}
          <div className="text-center py-1">
            <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">
              {totalPorMedioDifiere ? "Total según el medio" : "Total a cobrar"}
            </div>
            {totalPorMedioDifiere ? (
              <div className="text-2xl lg:text-3xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
                ${formatPrecio(Math.min(...MEDIOS_COBRO.map((m) => totalDe([m.key]))))}
                {" – "}
                ${formatPrecio(Math.max(...MEDIOS_COBRO.map((m) => totalDe([m.key]))))}
              </div>
            ) : (
              <div className="text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
                ${formatPrecio(total)}
              </div>
            )}
          </div>

          {offlineMode ? (
            /* OFFLINE: solo efectivo, guardar pendiente */
            <button type="button" onClick={() => onCobrar({ formaPago: "efectivo", total })}
              disabled={!puedeVender} className={BTN_PRIMARIO}>
              {cobrando ? "Guardando..." : `GUARDAR PENDIENTE $${formatPrecio(total)}`}
            </button>
          ) : soloServicios ? (
            /* CASO A: venta 100% servicios → efectivo */
            <>
              <div className="text-sm text-center pos-text-muted">
                Este servicio debe abonarse en efectivo
              </div>
              <button type="button" onClick={() => cobrarSimple("efectivo")} disabled={!puedeVender}
                className={BTN_PRIMARIO}>
                {cobrando ? "Procesando..." : "COBRAR EN EFECTIVO"}
              </button>
            </>
          ) : (
            /* CASO B (normal) / CASO C (servicios + mercadería) */
            <>
              {hayServicios && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg px-3 py-2 text-center"
                    style={{ background: "color-mix(in srgb, var(--pos-accent) 12%, transparent)" }}>
                    <div className="text-[10px] pos-text-muted uppercase tracking-wide">Efectivo obligatorio</div>
                    <div className="text-lg font-bold pos-text-accent tabular-nums">${formatPrecio(minEf)}</div>
                  </div>
                  <div className="rounded-lg px-3 py-2 text-center pos-bg-panel">
                    <div className="text-[10px] pos-text-muted uppercase tracking-wide">Resta pagar</div>
                    <div className="text-lg font-bold tabular-nums">${formatPrecio(resto)}</div>
                  </div>
                </div>
              )}

              <div className="text-sm font-medium text-center pos-text-muted-strong">
                {hayServicios
                  ? `Elegí cómo pagar $${formatPrecio(resto)}`
                  : totalPorMedioDifiere
                  ? "Elegí cómo cobrar — el total cambia según el medio"
                  : "Elegí cómo cobrar"}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {MEDIOS_COBRO.map((m) => (
                  <button key={m.key} type="button" onClick={() => cobrarSimple(m.key)} disabled={!puedeVender}
                    className={`${BTN_MEDIO} ${
                      totalPorMedioDifiere
                        ? "flex flex-col items-center justify-center gap-0 py-1"
                        : "flex items-center justify-center gap-2 whitespace-nowrap"
                    }`}>
                    {/* El logo de MP es un óvalo (más ancho): se achica lo mínimo para que
                        "Mercado Pago" entre en una sola línea, sin deformarlo. */}
                    {totalPorMedioDifiere ? (
                      <>
                        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                          <IconoMedio medio={m.key} size={m.key === "mercadopago" ? 16 : 18} /> {m.label}
                        </span>
                        {/* EL NÚMERO QUE EL CAJERO NECESITA ANTES DE TOCAR NADA.
                            Sale del mismo motor que va a cobrar el servidor. */}
                        <span className="text-base font-black pos-text-accent tabular-nums leading-tight">
                          ${formatPrecio(totalDe([m.key]))}
                        </span>
                      </>
                    ) : (
                      <>
                        <IconoMedio medio={m.key} size={m.key === "mercadopago" ? 19 : 22} /> {m.label}
                      </>
                    )}
                  </button>
                ))}
              </div>

              {/* Fiado: solo en venta sin servicios */}
              {!hayServicios && (
                <>
                  {formaPago === "fiado" && !clienteSeleccionado && subtotal > 0 && (
                    <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium"
                      style={{ background: "color-mix(in srgb, var(--pos-danger) 12%, transparent)", color: "var(--pos-danger)" }}>
                      Seleccioná un cliente para vender fiado
                    </div>
                  )}
                  <button type="button" onClick={() => cobrarSimple("fiado")} disabled={!puedeVender}
                    className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-11 text-sm rounded-md">
                    Fiado
                  </button>
                </>
              )}

              {/* Acción avanzada discreta */}
              <button type="button" onClick={abrirDividir}
                className="text-xs pos-text-link text-center underline-offset-2 hover:underline">
                {hayServicios ? "Dividir de otra manera" : "Dividir pago"}
              </button>

              {queueLength > 0 && onProcesarCola && (
                <button type="button" onClick={onProcesarCola} disabled={procesandoCola || offlineMode}
                  className="sunmi-btn sunmi-pos-btn-secondary w-full min-h-12 text-base font-semibold rounded-md">
                  {procesandoCola ? "Procesando..." : `PROCESAR COLA (${queueLength})`}
                </button>
              )}
            </>
          )}

          {/* Info compacta de descuentos/puntos (si aplica) */}
          {(descuento > 0 || descuentoPorPuntos > 0) && (
            <div className="flex flex-wrap justify-center gap-2 text-[11px]">
              {descuento > 0 && (
                <span className="pos-text-success-soft">Descuento -${formatPrecio(descuento)}</span>
              )}
              {descuentoPorPuntos > 0 && (
                <span className="pos-text-points">Puntos -${formatPrecio(descuentoPorPuntos)}</span>
              )}
            </div>
          )}
        </>
      )}
    </SunmiCard>
  );
}

export default memo(FormaPago);
