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
// ── DE DÓNDE SALE LA PLATA NO SE ELIGE ───────────────────────────────────
//
// Es la ubicación que debe: cada ubicación paga sus deudas con su plata. Se
// muestra fija y no viaja en el pedido —el servidor la deriva de la cuenta—.
// Este formulario solo se abre cuando quien mira OPERA esa ubicación.

import { useEffect, useRef, useState } from "react";

import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import { formatearMoneda } from "@/lib/moneda";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  MEDIO_PAGO_PROVEEDOR,
  medioTocaLaCaja,
  nuevaClaveDePago,
} from "@/lib/finanzas/pagosProveedores";

import CamposDeOrigenDelPago, { Campo } from "./CamposDeOrigenDelPago";

// ── LO MISMO PARA UN GASTO ───────────────────────────────────────────────
//
// Un gasto se paga con el mismo formulario: mismos medios, mismo origen fijo,
// mismo turno para el efectivo y la misma clave del intento. Lo único que
// cambia es A DÓNDE se manda, qué dice el subtítulo y de qué ubicación sale la
// plata. Van como props opcionales; sin ellas, todo es lo de una cuenta por
// pagar, tal cual estaba. La clave del intento es la de siempre,
// `nuevaClaveDePago(id)`: el servidor la guarda junto con el gasto o la cuenta,
// así que no choca entre los dos.

export default function ModalRegistrarPago({
  abierto,
  cuenta,
  medios = [],
  onCerrar,
  onRegistrado,
  /** A dónde se manda el pago. Por defecto, el de la cuenta por pagar. */
  urlPago = null,
  /** El subtítulo. Por defecto, el proveedor y el saldo de la cuenta. */
  subtitulo = null,
  /** `{ id, nombre }` de donde sale la plata. Por defecto, la ubicación de la cuenta. */
  origen = null,
}) {
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState(MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA);
  const [turnoId, setTurnoId] = useState("");
  const [fecha, setFecha] = useState(hoyArgentinaISO());
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Cada vez que se abre, arranca limpio.
  // LA CLAVE DEL INTENTO. Nace al abrir y se conserva en cada reintento de este
  // mismo formulario: si la respuesta se pierde y se vuelve a tocar "Registrar",
  // el servidor reconoce el intento y devuelve el pago que ya hizo en vez de
  // hacer otro. Es la misma idea que el arqueo de Caja (`claveRef`). Abrir el
  // formulario otra vez es otro intento, y lleva otra clave.
  const claveRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    claveRef.current = cuenta ? nuevaClaveDePago(cuenta.id) : null;
    setMonto("");
    setMedio(MEDIO_PAGO_PROVEEDOR.TRANSFERENCIA);
    setTurnoId("");
    setFecha(hoyArgentinaISO());
    setNota("");
    setError("");
    // `cuenta` NO va en las dependencias a propósito: la pantalla la recarga, y
    // cambiarla no es abrir otro intento. Rehacer la clave con el formulario
    // abierto convertiría el reintento en un pago nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const efectivo = medioTocaLaCaja(medio);

  const registrar = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(urlPago || `/api/finanzas/pagos-proveedores/${cuenta.id}/pagos`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Tal cual se escribió: "185.300,50" lo interpreta `leerImporte` en
          // el servidor, que es donde vive la regla.
          monto,
          medio,
          turnoId: efectivo && turnoId ? Number(turnoId) : null,
          fecha: efectivo ? null : fecha,
          nota,
          idempotencyKey: claveRef.current,
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

  const faltaAlgo = !monto || (efectivo && !turnoId);

  return (
    <SunmiModalLayout
      open={abierto}
      title="Registrar pago"
      subtitle={
        subtitulo ??
        (cuenta ? `${cuenta.proveedor?.nombre || "Proveedor"} · saldo ${formatearMoneda(cuenta.saldo)}` : "")
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

      <CamposDeOrigenDelPago
        activo={abierto}
        medios={medios}
        medio={medio}
        onMedio={setMedio}
        // La ubicación que debe, de la cuenta misma.
        origen={origen || cuenta?.localGasto || null}
        turnoId={turnoId}
        onTurno={setTurnoId}
        onError={setError}
      />

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
