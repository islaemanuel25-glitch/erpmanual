"use client";

// components/pos-ventas/PanelConsumoPersonal.jsx
//
// CONSUMO DEL PERSONAL, adentro del panel de cobro (Figma EVJ2KvVCrY0oVSowfboymQ,
// nodo 392:576). El carrito no se cobra: sale del stock y queda como gasto al
// costo, a nombre de quien lo consume (lib/pos-ventas/consumoPersonalServer.js).
//
// Lo de arriba —"No se cobra", "Sale del stock", "Gasto a costo"— es el
// resumen que se ve ANTES de confirmar, con el costo del carrito. El
// definitivo lo calcula el servidor con las líneas de la venta.

import { useEffect, useRef, useState } from "react";

import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { nuevaClaveDePago } from "@/lib/finanzas/pagosProveedores";
import { formatearMoneda } from "@/lib/moneda";
import { itemsCrearPayload } from "@/lib/pos-ventas/payloadVenta";
import { resumenDelConsumo } from "@/lib/pos-ventas/consumoPersonal";

export default function PanelConsumoPersonal({ carrito, turnoId, onRegistrado }) {
  const { requerirOperador } = useOperadorContext();
  const [operarios, setOperarios] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [operadorId, setOperadorId] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState("");
  // Un intento por carrito: el mismo envío repetido cae en el mismo consumo.
  const clave = useRef(nuevaClaveDePago(`consumo-${turnoId}`));

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const r = await fetch("/api/operador/listar", { credentials: "include", cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (!vigente) return;
        if (!d?.ok) setErrorCarga(d?.error || "No se pudo cargar quién consume.");
        else setOperarios(d.items || []);
      } catch {
        if (vigente) setErrorCarga("No se pudo cargar quién consume.");
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  const resumen = resumenDelConsumo(carrito);
  const puedeConfirmar = Boolean(turnoId) && Boolean(operadorId) && resumen.productos > 0 && !resumen.hayServicios && !registrando;

  async function confirmar() {
    if (!puedeConfirmar) return;
    setRegistrando(true);
    setError("");
    try {
      const r = await fetch("/api/pos-ventas/consumo-personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId,
          operadorId: Number(operadorId),
          items: itemsCrearPayload(carrito),
          idempotencyKey: clave.current,
        }),
      });
      if (r.status === 428) {
        requerirOperador();
        return;
      }
      const d = await r.json().catch(() => null);
      if (!d?.ok) {
        setError(d?.error || "No se pudo registrar el consumo.");
        return;
      }
      clave.current = nuevaClaveDePago(`consumo-${turnoId}`);
      setOperadorId("");
      onRegistrado?.(d);
    } catch {
      setError("Sin conexión: no se sabe si el consumo entró. Mirá el stock antes de repetirlo.");
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div data-consumo-personal className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-sm2 font-medium sunmi-text-muted">¿Quién lo consume?</span>
        {errorCarga ? (
          <p role="alert" className="text-sm2 sunmi-text-danger">
            {errorCarga}
          </p>
        ) : !operarios ? (
          <SunmiLoader />
        ) : (
          <SunmiSelectAdv
            value={operadorId}
            onChange={(v) => setOperadorId(v)}
            placeholder="Elegí quién"
            aria-label="Quién lo consume"
          >
            {operarios.map((o) => (
              <SunmiSelectOption key={o.id} value={String(o.id)}>
                {o.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        )}
      </div>

      <div data-resumen-consumo className="rounded-xl2 border sunmi-border sunmi-bg-card px-4 py-3.5 space-y-2.5 text-sm3">
        <div className="flex items-center justify-between gap-3">
          <span className="sunmi-text-muted">No se cobra</span>
          <span className="font-medium tabular-nums sunmi-text-strong">{formatearMoneda(0)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="sunmi-text-muted">Sale del stock</span>
          <span className="font-medium sunmi-text-strong">
            {resumen.productos} {resumen.productos === 1 ? "producto" : "productos"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 font-semibold">
          <span className="sunmi-text-strong">Gasto a costo</span>
          <span className="tabular-nums sunmi-text-danger">{formatearMoneda(resumen.costo)}</span>
        </div>
      </div>

      {resumen.hayServicios ? (
        <p role="alert" className="text-sm2 sunmi-text-danger">
          Un servicio no sale del stock: sacalo del carrito.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm2 sunmi-text-danger break-words">
          {error}
        </p>
      ) : null}

      <SunmiButton
        type="button"
        color="primary"
        disabled={!puedeConfirmar}
        onClick={confirmar}
        className="w-full min-h-toque justify-center rounded-xl text-base2 font-semibold"
      >
        {registrando ? "Registrando…" : "Confirmar consumo"}
      </SunmiButton>
    </div>
  );
}
