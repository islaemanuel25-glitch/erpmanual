"use client";

// components/finanzas/pagos/ModalRegistrarPago.jsx
//
// REGISTRAR UN PAGO sobre una cuenta.
//
// ── LA PANTALLA ARMA EL PEDIDO; LA REGLA LA APLICA EL SERVIDOR ───────────
//
// Acá no se decide si el importe entra en el saldo, si el turno está abierto ni
// si la ubicación es del grupo: todo eso lo decide `registrarPagoProveedor` y
// la respuesta vuelve con su motivo. El formulario solo evita pedir lo que no
// corresponde: el turno aparece con EFECTIVO —es el único medio que sale de un
// cajón— y la fecha con los demás, porque un efectivo sale AHORA.
//
// ── DE DÓNDE SALE LA PLATA SE ELIGE, NO SE DEDUCE ────────────────────────
//
// El origen no es la ubicación del gasto por defecto: el depósito le paga a
// Arcor una compra de Casiano. Si quien paga tiene una sola ubicación posible
// —un local—, ésa queda elegida porque no hay otra; si tiene varias, se elige.

import { useEffect, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { formatearMoneda } from "@/lib/moneda";
import { horaAR, fechaAR } from "@/lib/fechas/formatearFechaHora";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { MEDIO_PAGO_PROVEEDOR, medioTocaLaCaja } from "@/lib/finanzas/pagosProveedores";

/** Un campo con su rótulo arriba. */
function Campo({ rotulo, children }) {
  return (
    <div className="space-y-1">
      <div className="text-sm2 sunmi-text-muted">{rotulo}</div>
      {children}
    </div>
  );
}

export default function ModalRegistrarPago({
  abierto,
  cuenta,
  origenes = [],
  medios = [],
  onCerrar,
  onRegistrado,
}) {
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState(MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA);
  const [origen, setOrigen] = useState("");
  const [turnoId, setTurnoId] = useState("");
  const [fecha, setFecha] = useState(hoyArgentinaISO());
  const [nota, setNota] = useState("");
  const [turnos, setTurnos] = useState([]);
  const [cargandoTurnos, setCargandoTurnos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, arranca limpio. Con una sola ubicación posible queda
  // elegida: no hay nada que elegir.
  useEffect(() => {
    if (!abierto) return;
    setMonto("");
    setMedio(MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA);
    setOrigen(origenes.length === 1 ? String(origenes[0].localId) : "");
    setTurnoId("");
    setFecha(hoyArgentinaISO());
    setNota("");
    setError("");
  }, [abierto, origenes]);

  const efectivo = medioTocaLaCaja(medio);

  // Los turnos abiertos del origen, solo cuando hacen falta.
  useEffect(() => {
    if (!abierto || !efectivo || !origen) {
      setTurnos([]);
      return;
    }
    let vigente = true;
    setCargandoTurnos(true);
    setTurnoId("");
    (async () => {
      try {
        const url = new URL(
          "/api/finanzas/pagos-proveedores/turnos-operativos",
          window.location.origin
        );
        url.searchParams.set("origen", origen);
        const res = await fetch(url.toString(), { cache: "no-store", credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer los turnos abiertos.");
        if (!vigente) return;
        setTurnos(j.turnos || []);
        if ((j.turnos || []).length === 1) setTurnoId(String(j.turnos[0].id));
      } catch (e) {
        if (vigente) {
          setTurnos([]);
          setError(e.message);
        }
      } finally {
        if (vigente) setCargandoTurnos(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [abierto, efectivo, origen]);

  const registrar = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/pagos-proveedores/${cuenta.id}/pagos`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Tal cual se escribió: "185.300,50" lo interpreta `leerImporte` en
          // el servidor, que es donde vive la regla.
          monto,
          medio,
          localOrigenId: origen ? Number(origen) : null,
          turnoId: efectivo && turnoId ? Number(turnoId) : null,
          fecha: efectivo ? null : fecha,
          nota,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo registrar el pago.");
      onRegistrado?.(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const faltaAlgo = !monto || !origen || (efectivo && !turnoId);

  return (
    <SunmiModalLayout
      open={abierto}
      title="Registrar pago"
      subtitle={
        cuenta
          ? `${cuenta.proveedor?.nombre || "Proveedor"} · saldo ${formatearMoneda(cuenta.saldo)}`
          : ""
      }
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      // Es carga: el importe y el origen escritos se perderían con un toque al
      // costado.
      destructivo
      forma="hoja-o-centrado"
      // Los campos van en columna con el mismo aire que el default que el kit
      // tenía antes de exigir que cada modal lo declare.
      espacioCuerpo="mt-2 gap-3"
      footer={
        <div className="flex gap-2 justify-end">
          <SunmiButton color="slate" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="primary" onClick={registrar} disabled={enviando || faltaAlgo}>
            {enviando ? "Registrando…" : "Registrar pago"}
          </SunmiButton>
        </div>
      }
    >
      <Campo rotulo="Importe">
        <SunmiInput
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="0,00"
          aria-label="Importe del pago"
        />
      </Campo>

      <Campo rotulo="Medio de pago">
        <SunmiSelectAdv value={medio} onChange={(v) => setMedio(v)}>
          {medios.map((m) => (
            <SunmiSelectOption key={m.valor} value={m.valor}>
              {m.texto}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      <Campo rotulo="De dónde sale el dinero">
        <SunmiSelectAdv
          value={origen}
          onChange={(v) => setOrigen(v)}
          placeholder="Elegí la ubicación"
        >
          {origenes.map((o) => (
            <SunmiSelectOption key={o.localId} value={String(o.localId)}>
              {o.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      {efectivo && origen && (
        <Campo rotulo="Turno de caja">
          {cargandoTurnos ? (
            <div className="text-xs sunmi-text-muted">Buscando turnos abiertos…</div>
          ) : turnos.length === 0 ? (
            <SunmiAviso tono="warning" titulo="Sin turno abierto">
              El efectivo sale de un cajón que está operando, y esta ubicación no tiene ninguno.
            </SunmiAviso>
          ) : (
            <SunmiSelectAdv
              value={turnoId}
              onChange={(v) => setTurnoId(v)}
              placeholder="Elegí el turno"
            >
              {turnos.map((t) => (
                <SunmiSelectOption key={t.id} value={String(t.id)}>
                  {`${t.quien || "Turno"} · abierto ${fechaAR(t.apertura)} ${horaAR(t.apertura)}`}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          )}
        </Campo>
      )}

      {!efectivo && (
        <Campo rotulo="Fecha del pago">
          <SunmiInput
            type="date"
            value={fecha}
            max={hoyArgentinaISO()}
            onChange={(e) => setFecha(e.target.value)}
            aria-label="Fecha del pago"
          />
        </Campo>
      )}

      <Campo rotulo="Nota (opcional)">
        <SunmiInput
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="N° de operación, comentario…"
          aria-label="Nota del pago"
        />
      </Campo>

      {error && (
        <SunmiAviso tono="danger" titulo="No se registró">
          {error}
        </SunmiAviso>
      )}
    </SunmiModalLayout>
  );
}
