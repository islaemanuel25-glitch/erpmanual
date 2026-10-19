"use client";

// components/finanzas/sueldos/HojaAsignarEmpleado.jsx
//
// ASIGNAR EMPLEADO A UN SUELDO VIEJO: elegir de la lista del local quién lo
// cobró y qué fue. Completa esos dos datos y nada más —el importe y los pagos
// quedan como estaban—; la regla la impone `asignarEmpleadoASueldo`.

import { useEffect, useState } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import { Campo } from "@/components/finanzas/pagos/CamposDeOrigenDelPago";
import { formatearMoneda } from "@/lib/moneda";
import { MODALIDAD_SUELDO, OPCIONES_MODALIDAD_SUELDO } from "@/lib/finanzas/sueldos";

const TIPOS = OPCIONES_MODALIDAD_SUELDO.map((o) => ({ clave: o.valor, texto: o.texto }));

export default function HojaAsignarEmpleado({ sueldo, empleados = [], onCerrar, onAsignado }) {
  const [empleadoId, setEmpleadoId] = useState("");
  const [modalidad, setModalidad] = useState(MODALIDAD_SUELDO.SUELDO);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sueldo) return;
    setEmpleadoId("");
    setModalidad(MODALIDAD_SUELDO.SUELDO);
    setError("");
  }, [sueldo]);

  const guardar = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/sueldos/${sueldo.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empleadoId: Number(empleadoId), modalidadSueldo: modalidad }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo asignar el empleado.");
      onAsignado?.(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <SunmiModalLayout
      open={Boolean(sueldo)}
      title="Asignar empleado"
      subtitle={sueldo ? `${sueldo.concepto} · ${formatearMoneda(sueldo.total)}` : null}
      onClose={enviando ? () => {} : onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2 gap-3"
      footer={
        <div className="flex gap-2 justify-end">
          <SunmiButton color="slate" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </SunmiButton>
          <SunmiButton color="primary" onClick={guardar} disabled={enviando || !empleadoId}>
            {enviando ? "Guardando…" : "Asignar"}
          </SunmiButton>
        </div>
      }
    >
      <Campo rotulo="Empleado">
        <SunmiSelectAdv value={empleadoId} onChange={setEmpleadoId} placeholder="Elegí el empleado" aria-label="Empleado" searchable>
          {empleados.map((e) => (
            <SunmiSelectOption key={e.id} value={String(e.id)}>
              {e.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>
      <Campo rotulo="Tipo">
        <SunmiSelectorDeOpciones opciones={TIPOS} valor={modalidad} onCambiar={setModalidad} etiqueta="Tipo de pago" />
      </Campo>
      <p className="text-sm2 sunmi-text-muted">El importe y los pagos quedan como están.</p>
      {error && (
        <SunmiAviso tono="danger" titulo="No se asignó">
          {error}
        </SunmiAviso>
      )}
    </SunmiModalLayout>
  );
}
