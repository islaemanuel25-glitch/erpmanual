"use client";

import { memo, useState } from "react";
import { Banknote, CreditCard, Wallet } from "lucide-react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { showError } from "@/components/sunmi/SunmiToast";
import { aCentavos } from "@/lib/pos-ventas/pagos";
import { componerCobroSimple, evaluarDivisionPago } from "@/lib/pos-ventas/servicios";

const COMISION_DEFAULT = 7;

const FORMAS_PAGO = [
  { key: "efectivo", label: "Efectivo", tieneComision: false },
  { key: "mercadopago", label: "MercadoPago", tieneComision: true },
  { key: "debito", label: "Debito", tieneComision: true },
  { key: "credito", label: "Credito", tieneComision: true },
  { key: "fiado", label: "Fiado", tieneComision: false },
];

// Medios grandes del cobro simple (fiado se muestra aparte, solo sin servicios).
const MEDIOS_COBRO = [
  { key: "efectivo", label: "Efectivo" },
  { key: "debito", label: "Débito" },
  { key: "credito", label: "Crédito" },
  { key: "mercadopago", label: "Mercado Pago" },
];

// Medios del "Dividir pago" (sin fiado: fiado es tender único, va en el modo simple).
const MEDIOS_DIVIDIR = MEDIOS_COBRO;

// Íconos de medios — ÚNICA fuente, reutilizada por el cobro simple y por "Dividir pago"
// para que se vean idénticos: billete verde (efectivo), tarjeta azul (débito),
// tarjeta violeta (crédito), billetera celeste (Mercado Pago).
const MEDIO_ICONO = {
  efectivo: { Icon: Banknote, color: "#22c55e" },
  debito: { Icon: CreditCard, color: "#3b82f6" },
  credito: { Icon: CreditCard, color: "#8b5cf6" },
  mercadopago: { Icon: Wallet, color: "#38bdf8" },
};

function IconoMedio({ medio, size = 18 }) {
  const cfg = MEDIO_ICONO[medio];
  if (!cfg) return null;
  const { Icon, color } = cfg;
  return <Icon size={size} color={color} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />;
}

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Filas iniciales del "Dividir pago": efectivo + débito, importes vacíos.
function filasIniciales() {
  return [
    { medio: "efectivo", monto: "" },
    { medio: "debito", monto: "" },
  ];
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
}) {
  const base = subtotal - descuento - descuentoPorPuntos;
  const total = base; // Cliente paga subtotal - descuentos, SIN comisión

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
  const [filas, setFilas] = useState(filasIniciales); // [{ medio, monto:string }]

  // Recalcular ante cambios del carrito: si cambió el total o el mínimo de servicios,
  // resetear las filas del "Dividir pago" para no arrastrar importes obsoletos.
  // Patrón React de "ajustar estado al cambiar props durante el render".
  const carritoKey = `${totalCent}-${minEfCent}`;
  const [prevCarritoKey, setPrevCarritoKey] = useState(carritoKey);
  if (carritoKey !== prevCarritoKey) {
    setPrevCarritoKey(carritoKey);
    setFilas(filasIniciales());
  }

  // ── Cobro SIMPLE: un medio → componer payload server-authoritative ─────────
  const cobrarSimple = (medio) => {
    if (!puedeVender) return;
    if (medio === "fiado" && hayServicios) {
      return showError("No se puede fiar una venta que contiene servicios");
    }
    onCobrar(componerCobroSimple({ medio, total, minEfectivoServicios: minEf }));
  };

  // ── Modo AVANZADO: editor de filas (medio + importe). Lógica en helper puro. ──
  const div = evaluarDivisionPago({ filas, total, minEfectivoServicios: minEf });
  const puedeCobrarDividido = puedeVender && div.puedeCobrar;
  const mediosUsados = filas.map((f) => f.medio);

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
    setFilas(filasIniciales());
    setModo("avanzado");
  };
  const volverSimple = () => {
    setModo("simple");
    setFilas(filasIniciales());
  };
  const cobrarDividido = () => {
    if (!puedeCobrarDividido) return;
    const pagos = div.pagos;
    const fp = pagos.length === 1 ? pagos[0].medio : "mixto";
    onCobrar({ formaPago: fp, total, pagos });
  };

  const BTN_PRIMARIO = "sunmi-btn sunmi-pos-btn-primary w-full min-h-14 lg:min-h-16 text-lg lg:text-xl font-bold rounded-md";
  const BTN_MEDIO = "sunmi-btn sunmi-pos-btn-secondary min-h-14 text-sm font-semibold rounded-md";

  // Texto/estado del botón de cobro del modo dividido.
  let textoCobrarDiv;
  if (cobrando) textoCobrarDiv = "Procesando...";
  else if (puedeCobrarDividido) textoCobrarDiv = `COBRAR $${formatPrecio(total)}`;
  else if (div.estado === "falta") textoCobrarDiv = `FALTAN $${formatPrecio(div.restante)}`;
  else if (div.estado === "excedente") textoCobrarDiv = `SOBRAN $${formatPrecio(div.excedente)}`;
  else textoCobrarDiv = `COBRAR $${formatPrecio(total)}`;

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
            <span className="text-xl font-black pos-text-accent tabular-nums">${formatPrecio(total)}</span>
          </div>

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
            <div className="flex justify-between"><span className="pos-text-muted">Total</span><b className="tabular-nums">${formatPrecio(total)}</b></div>
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
          {/* 1) TOTAL */}
          <div className="text-center py-1">
            <div className="text-[11px] pos-text-muted uppercase tracking-widest font-medium">Total a cobrar</div>
            <div className="text-4xl lg:text-5xl font-black pos-text-accent mt-1 tabular-nums tracking-tight">
              ${formatPrecio(total)}
            </div>
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
                {hayServicios ? `Elegí cómo pagar $${formatPrecio(resto)}` : "Elegí cómo cobrar"}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {MEDIOS_COBRO.map((m) => (
                  <button key={m.key} type="button" onClick={() => cobrarSimple(m.key)} disabled={!puedeVender}
                    className={`${BTN_MEDIO} flex items-center justify-center gap-2`}>
                    <IconoMedio medio={m.key} /> {m.label}
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
export { COMISION_DEFAULT, FORMAS_PAGO };
