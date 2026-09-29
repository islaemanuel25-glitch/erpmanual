"use client";

// components/finanzas/pagos/DetalleCuentaPorPagar.jsx
//
// UNA CUENTA POR PAGAR ABIERTA: importes, las dos fechas y el historial.
//
// ── LAS DOS FECHAS SE MUESTRAN SEPARADAS Y SE TRATAN DISTINTO ────────────
//
// El vencimiento es lo que dijo el PROVEEDOR y acá solo se lee. La fecha
// prevista es NUESTRA y se cambia desde acá, si se tiene el permiso. Mostrarlas
// como una sola —o dejar editar las dos— borraría la diferencia que el modelo
// guarda a propósito.
//
// ── CADA PAGO DICE DE DÓNDE SALIÓ LA PLATA ───────────────────────────────
//
// El gasto es de una ubicación y el pago puede haber salido de otra. Por eso el
// historial nombra el origen de cada pago, y la cabecera nombra el gasto.

import { useEffect, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { formatearMoneda } from "@/lib/moneda";
import { fechaAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { ESTADO_CUENTA, diaLegible, medioTocaLaCaja } from "@/lib/finanzas/pagosProveedores";

import ModalRegistrarPago from "./ModalRegistrarPago";
import { COLOR_ESTADO_CUENTA, ImporteConRotulo, rotuloDeCompra } from "./TarjetaCuentaPorPagar";

/** Un renglón rótulo / valor, a lo ancho. Lo usa también el detalle de un gasto. */
export function Renglon({ rotulo, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="text-sm3 sunmi-text-muted">{rotulo}</div>
      <div className="text-sm3 sunmi-text-strong text-right">{children}</div>
    </div>
  );
}

function FechaPrevista({ cuenta, puedeEscribir, onGuardada }) {
  const [valor, setValor] = useState(cuenta.fechaPrevistaPago || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setValor(cuenta.fechaPrevistaPago || ""), [cuenta.fechaPrevistaPago]);

  if (!puedeEscribir) {
    return <Renglon rotulo="Fecha prevista de pago">{diaLegible(cuenta.fechaPrevistaPago)}</Renglon>;
  }

  const guardar = async (nueva) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/pagos-proveedores/${cuenta.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaPrevistaPago: nueva || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo guardar la fecha prevista.");
      onGuardada?.(j.cuenta);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambio = (valor || null) !== (cuenta.fechaPrevistaPago || null);

  return (
    <div className="space-y-1.5">
      <div className="text-sm3 sunmi-text-muted">Fecha prevista de pago</div>
      <div className="flex items-center gap-2">
        <SunmiInput
          type="date"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label="Fecha prevista de pago"
          className="flex-1 min-w-0"
        />
        <SunmiButton color="primary" onClick={() => guardar(valor)} disabled={guardando || !cambio}>
          Guardar
        </SunmiButton>
        {cuenta.fechaPrevistaPago && (
          <SunmiButton color="ghost" onClick={() => guardar(null)} disabled={guardando}>
            Quitar
          </SunmiButton>
        )}
      </div>
      {error && <div className="text-xs sunmi-text-danger">{error}</div>}
    </div>
  );
}

/**
 * Un pago del historial. Lo usa también el detalle de un gasto: un `PagoGasto`
 * llega de la API con la misma forma —medio y su rótulo, monto, fecha, origen,
 * turno, quién lo registró y nota—.
 */
export function RenglonDePago({ pago }) {
  return (
    <div className="py-2 space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm3 font-medium sunmi-text-strong">{pago.rotuloMedio}</div>
        <div className="text-sm3 font-semibold tabular-nums sunmi-text-strong">
          {formatearMoneda(pago.monto)}
        </div>
      </div>
      <div className="text-xs2 sunmi-text-muted">
        {fechaAR(pago.fecha)}
        {medioTocaLaCaja(pago.medio) ? ` ${horaAR(pago.fecha)}` : ""} · Salió de{" "}
        <span className="sunmi-text-strong">{pago.origen?.nombre || "—"}</span>
        {pago.turnoId ? ` · turno #${pago.turnoId}` : ""}
      </div>
      <div className="text-xs2 sunmi-text-muted">
        Registró {pago.usuario?.nombre || "—"}
        {pago.nota ? ` · ${pago.nota}` : ""}
      </div>
    </div>
  );
}

export default function DetalleCuentaPorPagar({ datos, onCambio }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  // `puedeEscribir` es el permiso (fecha prevista); `puedePagar` además exige
  // operar la ubicación que debe. Ver la cuenta no es poder pagarla.
  const { cuenta, pagos = [], puedeEscribir, puedePagar = false, medios = [] } = datos;
  const saldada = cuenta.estado === ESTADO_CUENTA.PAGADA;

  return (
    <>
      <SunmiCard className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg2 font-semibold sunmi-text-strong truncate">
              {cuenta.proveedor?.nombre || "—"}
            </div>
            <div className="text-xs2 sunmi-text-muted">{rotuloDeCompra(cuenta)}</div>
            <div className="text-xs2 sunmi-text-muted">
              Gasto de <span className="sunmi-text-strong">{cuenta.localGasto?.nombre || "—"}</span>
            </div>
          </div>
          <SunmiPill color={COLOR_ESTADO_CUENTA[cuenta.estado] || "slate"}>{cuenta.rotuloEstado}</SunmiPill>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ImporteConRotulo rotulo="Total" valor={cuenta.total} />
          <ImporteConRotulo rotulo="Pagado" valor={cuenta.pagado} />
          <ImporteConRotulo rotulo="Saldo" valor={cuenta.saldo} fuerte />
        </div>

        <SunmiSeparator />

        <Renglon rotulo="Vencimiento del proveedor">{diaLegible(cuenta.vencimientoProveedor)}</Renglon>
        <FechaPrevista
          cuenta={cuenta}
          puedeEscribir={puedeEscribir}
          onGuardada={() => onCambio?.()}
        />

        {puedePagar && !saldada && (
          <SunmiButton color="primary" className="w-full" onClick={() => setModalAbierto(true)}>
            Registrar pago
          </SunmiButton>
        )}
        {/* Con permiso pero mirando desde otra ubicación: se dice por qué no
            hay botón, en vez de que parezca que falta. */}
        {puedeEscribir && !puedePagar && !saldada && (
          <p className="text-xs sunmi-text-muted break-words">
            Esta deuda la paga {cuenta.localGasto?.nombre || "la ubicación que la debe"}: para
            registrar un pago hay que estar operando en esa ubicación.
          </p>
        )}
      </SunmiCard>

      <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">PAGOS</h2>

      {pagos.length === 0 ? (
        <SunmiAviso tono="neutral" titulo="Sin pagos">
          Todavía no se registró ningún pago de esta compra.
        </SunmiAviso>
      ) : (
        <SunmiCard className="p-4 divide-y sunmi-divide">
          {pagos.map((p) => (
            <RenglonDePago key={p.id} pago={p} />
          ))}
        </SunmiCard>
      )}

      {puedePagar && (
        <ModalRegistrarPago
          abierto={modalAbierto}
          cuenta={cuenta}
          medios={medios}
          onCerrar={() => setModalAbierto(false)}
          onRegistrado={() => {
            setModalAbierto(false);
            onCambio?.();
          }}
        />
      )}
    </>
  );
}
