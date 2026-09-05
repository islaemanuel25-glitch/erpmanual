"use client";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { CONDICION_PAGO_OFERTA, CONDICION_PAGO_LABEL } from "@/lib/ofertas/vigencia";

// El encabezado de una oferta: nombre, vigencia, condición de pago y notas.
//
// El local NO es un campo: la oferta es del local ACTIVO, el mismo del contexto
// con el que se está trabajando. Ponerlo como selector invitaría a cargar una
// oferta para otra boca por error, y el precio de un producto es distinto en
// cada ubicación — una oferta "para otro local" tendría que releer otros
// precios. Se muestra, no se elige.

export default function FormularioOferta({ valor, onChange, localNombre, deshabilitado = false }) {
  const set = (campo, v) => onChange({ ...valor, [campo]: v });

  return (
    <div className="flex flex-col gap-3">
      <SunmiSeparator label="Datos de la oferta" />

      <label className="flex flex-col gap-1">
        <span className="text-sm2 sunmi-text-muted">Nombre</span>
        <SunmiInput
          placeholder="Ej: Semana Nueve de Oro"
          value={valor.nombre}
          disabled={deshabilitado}
          onChange={(e) => set("nombre", e.target.value)}
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm2 sunmi-text-muted">Empieza</span>
          <SunmiInput
            type="datetime-local"
            value={valor.inicioEn}
            disabled={deshabilitado}
            onChange={(e) => set("inicioEn", e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm2 sunmi-text-muted">Termina</span>
          <SunmiInput
            type="datetime-local"
            value={valor.finEn}
            disabled={deshabilitado}
            onChange={(e) => set("finEn", e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm2 sunmi-text-muted">Condición de pago</span>
        <SunmiSelectAdv
          value={valor.condicionPago}
          disabled={deshabilitado}
          onChange={(v) => set("condicionPago", v)}
        >
          {Object.values(CONDICION_PAGO_OFERTA).map((c) => (
            <option key={c} value={c}>
              {CONDICION_PAGO_LABEL[c]}
            </option>
          ))}
        </SunmiSelectAdv>
        {valor.condicionPago === CONDICION_PAGO_OFERTA.SOLO_EFECTIVO && (
          <span className="text-sm2 sunmi-text-muted">
            Solo efectivo significa efectivo por el total. Si el cliente paga una parte con
            tarjeta, la oferta no aplica y se cobra el precio normal.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-sm2 sunmi-text-muted">Local</span>
        <div className="text-sm sunmi-text-strong">{localNombre || "—"}</div>
        <span className="text-sm2 sunmi-text-muted">
          La oferta es de este local. Para otro local se carga desde su contexto.
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm2 sunmi-text-muted">Observaciones (opcional)</span>
        <SunmiTextarea
          rows={2}
          value={valor.observaciones}
          disabled={deshabilitado}
          onChange={(e) => set("observaciones", e.target.value)}
        />
      </label>
    </div>
  );
}
