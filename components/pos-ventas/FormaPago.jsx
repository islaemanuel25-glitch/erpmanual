"use client";

import { memo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { IconoMedio } from "@/components/pos-ventas/IconosMedios";
import SelectorModalidad from "@/components/pos-ventas/SelectorModalidad";
import { showError } from "@/components/sunmi/SunmiToast";
import { aCentavos } from "@/lib/pos-ventas/pagos";
import {
  CONDICION_FIADO,
  botonesDisponiblesParaFila,
  botonesDeCobro,
  claveDeOpcion,
  condicionesDeFilas,
  filaDeBoton,
  filasIniciales,
  formaPagoDeSeleccion,
  identidadDeSeleccion,
  modalidadesDisponiblesParaFila,
  opcionesDeModalidad,
  primeraFilaLibre,
  totalDeBoton,
} from "@/lib/pos-ventas/cobroPantalla";
import { componerCobroSimple, evaluarDivisionPago } from "@/lib/pos-ventas/servicios";
import { avisoPagoCombinado, recargoDeVenta } from "@/lib/recargos-pago/recargoPago";
import { aMedioEnum } from "@/lib/ofertas/previewPos";

// ── LOS BOTONES SALEN DE LA CONFIGURACIÓN DEL LOCAL ────────────────────────
//
// Antes había acá una lista fija de cuatro. Ahora los medios se configuran por
// local —cuáles, cómo se llaman y en qué orden— y llegan por props desde
// `/api/medios-cobro`. Quien los arma es `botonesDeCobro`, que además decide el
// respaldo cuando no llega configuración: sale de `MEDIOS_POR_DEFECTO`, la MISMA
// constante que usa el servidor.
//
// ── LA IDENTIDAD DE UN BOTÓN DEJÓ DE SER SU TIPO CONTABLE ──────────────────
//
// Este componente derivaba la `key` de `tipoContable.toLowerCase()`. Desde que
// un medio puede tener modalidades, dos botones distintos pueden compartir ese
// enum —"Banco X" y una modalidad de crédito de Mercado Pago son los dos
// CREDITO— y con la misma key React reusaría el nodo y el panel dividido no
// podría distinguirlos. Ahora la clave es la del medio, y la de una opción
// cobrable es la de la modalidad: la MISMA que indexa el preview.
//
// ── UN MEDIO CON MODALIDADES ES UN SOLO BOTÓN ──────────────────────────────
//
// Tocarlo NO cobra: abre el selector. Es la regla visual central del diseño y no
// tiene excepciones —tampoco cuando hay una sola modalidad activa—, porque un
// botón que unas veces cobra al toque y otras abre una pantalla es un botón en
// el que no se puede confiar. Ver `abreSelector` en `cobroPantalla.js`.

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  // un total por cada TIPO CONTABLE. Sirve mientras un tipo contable sea una
  // condición, y deja de servir con modalidades: dos condiciones distintas
  // comparten CREDITO y la segunda pisaría a la primera.
  //
  // `previewPorOpcion` es `totalesPorOpcionDeCobro`, indexado por la identidad de
  // cada opción cobrable. Cuando está, manda. Todos esos números los produjo el
  // MISMO motor que corre en el servidor al cobrar; acá no se calcula ninguno.
  //
  // Cuando los dos llegan en `null` —modo offline, o una pantalla que todavía no
  // los pasa— este componente se comporta EXACTAMENTE como antes, usando
  // `subtotal` y los descuentos. Esa rama no se tocó a propósito: es el camino
  // por donde entra la plata todos los días.
  previewPorMedio = null,
  previewPorOpcion = null,
  recargosPorMedio = null,
  hayOfertaSoloEfectivo = false,
  // Los medios configurados del local, de `/api/medios-cobro`, ya con sus
  // modalidades. Sin esto se usan los defaults, que son la MISMA constante que
  // usa el servidor.
  mediosCobro = null,
}) {
  // Los botones del cobro simple y del pago dividido salen de la configuración.
  // Fiado no está: es tender único y se dibuja aparte, con sus propias
  // condiciones.
  const BOTONES = botonesDeCobro(mediosCobro);
  const base = subtotal - descuento - descuentoPorPuntos;
  const hayPreviewOpcion = Boolean(previewPorOpcion);

  // ── EL TOTAL DE UNA OPCIÓN, SIEMPRE PEDIDO, NUNCA CALCULADO ──────────────
  const totalDeClave = (clave) => {
    const p = hayPreviewOpcion ? previewPorOpcion[clave] : null;
    return p ? Number(p.total) : null;
  };
  const totalDeOpcion = (boton, modalidad = null) => {
    const porOpcion = totalDeClave(claveDeOpcion(boton, modalidad));
    if (porOpcion != null) return porOpcion;
    // Camino de siempre: un total por tipo contable.
    const tipo = aMedioEnum(modalidad?.tipoContable ?? boton?.tipoContable);
    const p = previewPorMedio ? previewPorMedio[tipo] : null;
    return p ? Number(p.total) : base;
  };
  const resumenDe = (boton) =>
    hayPreviewOpcion
      ? totalDeBoton(boton, previewPorOpcion, base)
      : { total: totalDeOpcion(boton), min: 0, max: 0, difiere: false };

  // ── ¿HACE FALTA MOSTRAR UN NÚMERO POR BOTÓN? ─────────────────────────────
  //
  // Solo cuando NO dan todos lo mismo. Sin ofertas y sin recargos —que es casi
  // todo el día en casi todos los locales— coinciden y el panel queda idéntico a
  // como estaba: un total grande arriba y los botones. Poner el mismo número
  // cuatro veces no informa, ocupa lugar y desplaza los botones.
  //
  // Con modalidades un botón puede no tener UN total: se cuenta su rango.
  const resumenes = BOTONES.map(resumenDe);
  const importesVisibles = resumenes.flatMap((r) =>
    r.difiere ? [aCentavos(r.min), aCentavos(r.max)] : [aCentavos(r.total)]
  );
  const totalPorMedioDifiere = importesVisibles.length > 0 && new Set(importesVisibles).size > 1;

  // El total "sin elegir medio". Con todos iguales es ese valor común; si
  // difieren, no existe un único total honesto y el número grande se reemplaza
  // por los de cada botón.
  const total =
    (hayPreviewOpcion || previewPorMedio) && !totalPorMedioDifiere && BOTONES.length > 0
      ? resumenes[0].total
      : base;

  // El total de FIADO sale del motor igual que todo lo demás: no tiene recargo,
  // así que da el total antes del recargo, pero eso lo decide el motor y no una
  // resta escrita acá.
  const totalFiado =
    hayPreviewOpcion && previewPorOpcion.__paraCondiciones
      ? previewPorOpcion.__paraCondiciones([CONDICION_FIADO]).total
      : previewPorMedio?.__paraMedios
        ? previewPorMedio.__paraMedios(["FIADO"]).total
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

  // El botón de efectivo del local: el que cobra una venta 100 % de servicios.
  // Si tiene modalidades, tocarlo abre el selector igual que cualquier otro.
  const botonEfectivo = BOTONES.find((b) => b.tipoContable === "EFECTIVO") || null;
  // Su identidad para el REPARTO de servicios, y solo si no exige elegir: un
  // reparto automático no puede elegir una modalidad por el cajero. Ver
  // `componerCobroSimple`.
  const identidadEfectivo = botonEfectivo && !botonEfectivo.abreSelector
    ? identidadDeSeleccion(botonEfectivo)
    : null;

  // ── Modo: simple, selector de modalidad, o avanzado (Dividir pago) ────────
  const [modo, setModo] = useState("simple");
  const [botonAbierto, setBotonAbierto] = useState(null);
  const [filas, setFilas] = useState(() => filasIniciales(BOTONES));

  // Recalcular ante cambios del carrito: si cambió el total o el mínimo de servicios,
  // resetear las filas del "Dividir pago" para no arrastrar importes obsoletos.
  // Patrón React de "ajustar estado al cambiar props durante el render".
  const carritoKey = `${totalCent}-${minEfCent}`;
  const [prevCarritoKey, setPrevCarritoKey] = useState(carritoKey);
  if (carritoKey !== prevCarritoKey) {
    setPrevCarritoKey(carritoKey);
    setFilas(filasIniciales(BOTONES));
  }

  // ── Cobro SIMPLE: una opción → payload server-authoritative ───────────────
  //
  // Lo que viaja es IDENTIDAD y monto. El tipo contable, el recargo, la comisión
  // y el procesador los relee el servidor de la configuración: mandarlos desde
  // acá sería mandar datos que se ignoran y sugerir que el navegador decide algo.
  //
  // El total que se manda es EL DE ESA OPCIÓN, el mismo número que el cajero
  // acaba de ver. Viaja además como `totalPantalla` para que el servidor pueda
  // rechazar la venta si su cuenta da otra cosa.
  const cobrarOpcion = (boton, modalidad = null) => {
    if (!puedeVender) return;
    const totalOpcion = totalDeOpcion(boton, modalidad);
    onCobrar({
      ...componerCobroSimple({
        medio: formaPagoDeSeleccion(boton, modalidad),
        total: totalOpcion,
        minEfectivoServicios: minEf,
        identidad: identidadDeSeleccion(boton, modalidad),
        identidadEfectivo,
      }),
      totalPantalla: totalOpcion,
    });
  };

  // Tocar un botón: cobra, o abre el selector si el medio tiene modalidades.
  const tocarBoton = (boton) => {
    if (!puedeVender) return;
    if (boton.abreSelector) {
      setBotonAbierto(boton);
      setModo("modalidad");
      return;
    }
    cobrarOpcion(boton);
  };

  const cobrarFiado = () => {
    if (!puedeVender) return;
    if (hayServicios) return showError("No se puede fiar una venta que contiene servicios");
    onCobrar({
      ...componerCobroSimple({ medio: "fiado", total: totalFiado, minEfectivoServicios: minEf }),
      totalPantalla: totalFiado,
    });
  };

  // ── Modo AVANZADO: editor de filas (medio + modalidad + importe) ──────────
  //
  // El total del panel dividido SE RECALCULA con el conjunto elegido: agregar
  // débito a un pago en efectivo puede perder una oferta de solo efectivo Y sumar
  // un recargo, y las dos cosas mueven el número que el cajero tiene que cobrar.
  const resultadoDividido =
    hayPreviewOpcion && previewPorOpcion.__paraCondiciones
      ? previewPorOpcion.__paraCondiciones(condicionesDeFilas(filas, BOTONES))
      : previewPorMedio?.__paraMedios
        ? previewPorMedio.__paraMedios(filas.map((f) => aMedioEnum(f.tipoContable ?? f.medio)))
        : null;
  const totalDividido = resultadoDividido ? resultadoDividido.total : base;
  const div = evaluarDivisionPago({ filas, total: totalDividido, minEfectivoServicios: minEf });
  const puedeCobrarDividido = puedeVender && div.puedeCobrar;

  // Aviso del pago combinado. El texto lo arma `recargoPago.js` para que el POS y
  // el backend digan exactamente lo mismo; acá solo se lo muestra. El GANADOR
  // sale del resultado del motor —no se reconstruye acá— y por eso puede nombrar
  // la modalidad, que es lo único que distingue dos condiciones del mismo tipo.
  const mediosUsados = filas.map((f) => aMedioEnum(f.tipoContable ?? f.medio));
  const avisoCombinado = resultadoDividido
    ? avisoPagoCombinado({
        mediosUsados,
        recargo: { pct: resultadoDividido.recargoPagoPct, medio: resultadoDividido.recargoPagoMedio },
        etiquetaGanador: resultadoDividido.recargoPagoModalidadNombre
          ? `${resultadoDividido.recargoPagoMedioNombre} · ${resultadoDividido.recargoPagoModalidadNombre}`
          : resultadoDividido.recargoPagoMedioNombre,
        hayOfertaSoloEfectivoEnCarrito: hayOfertaSoloEfectivo,
      })
    : recargosPorMedio
      ? avisoPagoCombinado({
          mediosUsados,
          recargo: recargoDeVenta(mediosUsados, recargosPorMedio),
          hayOfertaSoloEfectivoEnCarrito: hayOfertaSoloEfectivo,
        })
      : null;

  const botonDe = (clave) => BOTONES.find((b) => b.clave === clave) || null;

  const cambiarMedio = (idx, botonClave) => {
    const boton = botonDe(botonClave);
    if (!boton) return;
    setFilas((prev) => {
      const libres = modalidadesDisponiblesParaFila(boton, prev.filter((_, i) => i !== idx), -1);
      const modalidad = boton.abreSelector ? libres[0] ?? opcionesDeModalidad(boton)[0] : null;
      return prev.map((f, i) => (i === idx ? filaDeBoton(boton, modalidad, f.monto) : f));
    });
  };
  const cambiarModalidad = (idx, modalidadId) => {
    setFilas((prev) =>
      prev.map((f, i) => {
        if (i !== idx) return f;
        const boton = botonDe(f.botonClave);
        const modalidad = opcionesDeModalidad(boton).find((o) => String(o.modalidadId) === String(modalidadId));
        return modalidad ? filaDeBoton(boton, modalidad, f.monto) : f;
      })
    );
  };
  const cambiarMonto = (idx, monto) =>
    setFilas((prev) => prev.map((f, i) => (i === idx ? { ...f, monto } : f)));
  const agregarFila = () => {
    const fila = primeraFilaLibre(BOTONES, filas);
    if (!fila) return showError("No hay más medios para agregar");
    setFilas((prev) => [...prev, fila]);
  };
  const quitarFila = (idx) =>
    setFilas((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  const abrirDividir = () => {
    setFilas(filasIniciales(BOTONES));
    setModo("avanzado");
  };
  const volverSimple = () => {
    setModo("simple");
    setBotonAbierto(null);
    setFilas(filasIniciales(BOTONES));
  };
  const cobrarDividido = () => {
    if (!puedeCobrarDividido) return;
    const pagos = div.pagos;
    // `formaPago` sigue siendo el contrato de hoy: el tipo contable si hay uno
    // solo, "mixto" si hay varios. Con identidad el servidor igual lo deriva de
    // los tenders; esto es lo que la ruta exige recibir.
    const tipos = [...new Set(filas.map((f) => String(f.tipoContable ?? f.medio).toLowerCase()))];
    const fp = tipos.length === 1 ? tipos[0] : "mixto";
    onCobrar({ formaPago: fp, total: totalDividido, pagos, totalPantalla: totalDividido });
  };

  // ── UN SOLO ENCABEZADO PARA LAS DOS PANTALLAS DE ADENTRO ────────────────
  //
  // El selector de modalidad y el panel de dividir tienen la misma fila arriba:
  // volver, título, y un hueco para que el título quede centrado. Escribirla dos
  // veces es como empiezan a separarse —una gana un margen, la otra cambia el
  // tamaño— y además duplicaría un `<button>` crudo que el trinquete cuenta.
  const encabezado = (titulo) => (
    <div className="flex items-center justify-between">
      <button type="button" onClick={volverSimple} className="text-sm pos-text-link">← Volver</button>
      <span className="text-sm font-bold uppercase tracking-wide">{titulo}</span>
      <span className="w-12" />
    </div>
  );

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
      {modo === "modalidad" && botonAbierto ? (
        /* ═══════════════ ELEGIR MODALIDAD ═══════════════ */
        <>
          {encabezado(botonAbierto.nombre)}
          <SelectorModalidad
            opciones={opcionesDeModalidad(botonAbierto)}
            totalDe={(clave) => totalDeClave(clave) ?? base}
            onElegir={(opcion) => cobrarOpcion(botonAbierto, opcion)}
            deshabilitado={!puedeVender}
            formatearImporte={formatPrecio}
          />
        </>
      ) : modo === "avanzado" ? (
        /* ═══════════════ DIVIDIR PAGO (editor de filas) ═══════════════ */
        <>
          {encabezado("Dividir pago")}

          <div className="text-center">
            <span className="text-xs pos-text-muted">Total: </span>
            <span className="text-xl font-black pos-text-accent tabular-nums">${formatPrecio(totalDividido)}</span>
          </div>

          {/* El cajero tiene que conocer el total NUEVO antes de registrar, no
              después: con dos medios puede haberse perdido una oferta de solo
              efectivo y haberse sumado el recargo más alto. */}
          {avisoCombinado && (
            <div className="px-2 py-1.5 rounded-lg text-xs text-center font-medium sunmi-text-accent"
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

          {/* Filas: [ medio ▼ / modalidad ▼ ] [ importe ] [ × ] */}
          <div className="flex flex-col gap-2">
            {filas.map((f, idx) => {
              const boton = botonDe(f.botonClave);
              const modalidades = boton ? modalidadesDisponiblesParaFila(boton, filas, idx) : [];
              return (
                <div key={f.clave} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {/* Ícono real del medio (mismo set que el cobro simple); cambia al cambiar el medio. */}
                    <IconoMedio tipoContable={boton?.tipoContable} procesador={boton?.procesador} size={20} />
                    {/* Select NATIVO (picker del SO en móvil): robusto en todo dispositivo,
                        sin portal ni posicionamiento fijo. Estilizado con la clase sunmi-control. */}
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <select
                        value={f.botonClave ?? ""}
                        onChange={(e) => cambiarMedio(idx, e.target.value)}
                        aria-label="Medio de pago"
                        className="sunmi-control w-full min-w-0 min-h-11 rounded-md px-3 text-base cursor-pointer"
                      >
                        {botonesDisponiblesParaFila(BOTONES, filas, idx).map((b) => (
                          <option key={b.clave} value={b.clave}>{b.nombre}</option>
                        ))}
                      </select>
                      {/* LA MODALIDAD SE ELIGE ADENTRO DE LA FILA DEL MEDIO, y no
                          como otra opción de medio: "Mercado Pago · Crédito" es
                          una condición de Mercado Pago, no un medio aparte.

                          Éste sí es el selector del kit y no uno nativo: el de
                          arriba viene de antes y no se toca en esta tanda, pero
                          lo que se agrega sigue la convención del proyecto. */}
                      {boton?.abreSelector && (
                        <SunmiSelectAdv
                          className="w-full min-w-0"
                          value={String(f.modalidadId ?? "")}
                          onChange={(v) => cambiarModalidad(idx, v)}
                          placeholder="Modalidad"
                          aria-label={`Modalidad de ${boton.nombre}`}
                          data-modalidad-de={boton.nombre}
                        >
                          {modalidades.map((o) => (
                            <SunmiSelectOption key={o.clave} value={String(o.modalidadId)}>
                              {o.nombre}
                            </SunmiSelectOption>
                          ))}
                        </SunmiSelectAdv>
                      )}
                    </div>
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
              );
            })}
          </div>

          <button type="button" onClick={agregarFila}
            disabled={primeraFilaLibre(BOTONES, filas) == null}
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
              Cuando los medios NO dan lo mismo, no hay un total único que sea
              verdad, y un número grande arriba sería falso en casi todos los
              casos. En vez de inventar uno se dice el rango y el importe real
              vive en cada botón. Con todos iguales —que es casi todo el día—
              esto queda exactamente como estaba. */}
          <div className="text-center py-1">
            <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">
              {totalPorMedioDifiere ? "Total según el medio" : "Total a cobrar"}
            </div>
            {totalPorMedioDifiere ? (
              <div className="text-2xl lg:text-3xl font-black sunmi-text-accent mt-1 tabular-nums tracking-tight">
                ${formatPrecio(Math.min(...importesVisibles) / 100)}
                {" – "}
                ${formatPrecio(Math.max(...importesVisibles) / 100)}
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
              <button type="button"
                onClick={() => (botonEfectivo ? tocarBoton(botonEfectivo) : null)}
                disabled={!puedeVender || !botonEfectivo}
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
                {BOTONES.map((m, i) => {
                  const r = resumenes[i];
                  return (
                    <button key={m.clave} type="button" onClick={() => tocarBoton(m)} disabled={!puedeVender}
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
                            <IconoMedio tipoContable={m.tipoContable} procesador={m.procesador}
                              size={m.tipoContable === "MERCADOPAGO" ? 16 : 18} /> {m.nombre}
                          </span>
                          {/* EL NÚMERO QUE EL CAJERO NECESITA ANTES DE TOCAR NADA.
                              Sale del mismo motor que va a cobrar el servidor. Con
                              modalidades de distinto recargo no hay UN número: se
                              muestra el rango y el importe exacto está adentro. */}
                          <span className="text-base font-black sunmi-text-accent tabular-nums leading-tight">
                            {r.difiere
                              ? `$${formatPrecio(r.min)} – $${formatPrecio(r.max)}`
                              : `$${formatPrecio(r.total)}`}
                          </span>
                        </>
                      ) : (
                        <>
                          <IconoMedio tipoContable={m.tipoContable} procesador={m.procesador}
                            size={m.tipoContable === "MERCADOPAGO" ? 19 : 22} /> {m.nombre}
                        </>
                      )}
                    </button>
                  );
                })}
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
                  <button type="button" onClick={cobrarFiado} disabled={!puedeVender}
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
