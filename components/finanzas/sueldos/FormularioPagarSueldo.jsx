"use client";

// components/finanzas/sueldos/FormularioPagarSueldo.jsx
//
// PAGAR SUELDO DESDE FINANZAS: empleado, tipo, monto, fecha, de dónde sale la
// plata y una nota. Al elegir el empleado aparece su tarjeta del período, con
// los pagos que ya cobró —del POS y de Finanzas, juntos—.
//
// ── LA PANTALLA ARMA EL PEDIDO; LA REGLA LA APLICA EL SERVIDOR ───────────
//
// Que el empleado sea activo y del local, que el tipo venga, que el turno esté
// abierto: todo lo decide `crearGasto` y la respuesta vuelve con su motivo. El
// empleado se elige de la lista del local que manda el servidor, nunca se
// escribe.
//
// ── LA CLAVE DEL INTENTO ─────────────────────────────────────────────────
//
// La del alta de gastos (`nuevaClaveDeGasto`): nace al abrir el formulario y
// se conserva en cada reintento, así un "Registrar pago" repetido devuelve el
// sueldo que ya se registró y no saca dos veces la plata.
//
// Medio, origen y turno son `CamposDeOrigenDelPago`, la misma pieza del pago de
// un gasto: los mismos medios, el mismo turno para el efectivo.

import { useRef, useState } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSelectorDeOpciones from "@/components/sunmi/SunmiSelectorDeOpciones";
import { showSuccess } from "@/components/sunmi/SunmiToast";
import CamposDeOrigenDelPago, { Campo } from "@/components/finanzas/pagos/CamposDeOrigenDelPago";
import { BotonTesoreria } from "@/components/tesoreria/PiezasTesoreria";
import { MEDIO_PAGO_GASTO, MEDIOS_PAGO_GASTO, ROTULO_MEDIO_GASTO, nuevaClaveDeGasto } from "@/lib/finanzas/gastos";
import { medioTocaLaCaja } from "@/lib/finanzas/pagosProveedores";
import { MODALIDAD_SUELDO, OPCIONES_MODALIDAD_SUELDO } from "@/lib/finanzas/sueldos";

import { TarjetaDePagos } from "./PiezasSueldos";

const MEDIOS = MEDIOS_PAGO_GASTO.map((m) => ({ valor: m, texto: ROTULO_MEDIO_GASTO[m] }));
const TIPOS = OPCIONES_MODALIDAD_SUELDO.map((o) => ({ clave: o.valor, texto: o.texto }));

/** EL CUERPO DEL POST, con los campos que acepta la ruta y ninguno más. */
export function cuerpoDelPagoDeSueldo(form, clave) {
  const efectivo = medioTocaLaCaja(form.medio);
  return {
    empleadoId: form.empleadoId ? Number(form.empleadoId) : null,
    modalidadSueldo: form.modalidad,
    monto: form.monto,
    fecha: form.fecha,
    medio: form.medio,
    turnoId: efectivo && form.turnoId ? Number(form.turnoId) : null,
    nota: String(form.nota || "").trim() || null,
    idempotencyKey: clave,
  };
}

/** ¿Falta algo para poder mandarlo? El servidor igual lo vuelve a mirar. */
export function faltaAlgoDelPagoDeSueldo(form) {
  if (!form.empleadoId || !form.modalidad || !form.monto || !form.fecha || !form.medio) return true;
  return medioTocaLaCaja(form.medio) && !form.turnoId;
}

export default function FormularioPagarSueldo({ datos, empleadoInicial = null, hoy, onPagado }) {
  const activos = (datos.empleados || []).filter((e) => e.activo);
  const [form, setForm] = useState(() => ({
    empleadoId: activos.some((e) => e.id === empleadoInicial) ? String(empleadoInicial) : "",
    modalidad: MODALIDAD_SUELDO.SUELDO,
    monto: "",
    fecha: hoy,
    // El mismo default que el pago de un gasto: el efectivo pide un turno abierto.
    medio: MEDIO_PAGO_GASTO.TRANSFERENCIA,
    turnoId: "",
    nota: "",
  }));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Un intento por formulario abierto.
  const clave = useRef(null);
  if (!clave.current) clave.current = nuevaClaveDeGasto(datos.local?.id ?? "x");

  const cambiar = (parcial) => setForm((f) => ({ ...f, ...parcial }));
  const elegido = activos.find((e) => String(e.id) === form.empleadoId) || null;

  const registrar = async () => {
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/finanzas/sueldos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoDelPagoDeSueldo(form, clave.current)),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo registrar el sueldo.");
      showSuccess("Sueldo registrado.");
      onPagado?.(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <Campo rotulo="Empleado">
        <SunmiSelectAdv
          value={form.empleadoId}
          onChange={(v) => cambiar({ empleadoId: v })}
          placeholder="Elegí el empleado"
          aria-label="Empleado"
          searchable
        >
          {activos.map((e) => (
            <SunmiSelectOption key={e.id} value={String(e.id)}>
              {e.nombre}
            </SunmiSelectOption>
          ))}
        </SunmiSelectAdv>
      </Campo>

      {elegido ? (
        <TarjetaDePagos titulo={`${elegido.nombre.toUpperCase()} · ESTE PERÍODO`} pagos={elegido.pagos} total={elegido.total} />
      ) : null}

      <Campo rotulo="Tipo">
        <SunmiSelectorDeOpciones opciones={TIPOS} valor={form.modalidad} onCambiar={(v) => cambiar({ modalidad: v })} etiqueta="Tipo de pago" />
      </Campo>

      <Campo rotulo="Monto">
        <SunmiInput inputMode="decimal" value={form.monto} onChange={(e) => cambiar({ monto: e.target.value })} placeholder="0,00" aria-label="Monto" />
      </Campo>

      <Campo rotulo="Fecha">
        <SunmiInput type="date" value={form.fecha} max={hoy} onChange={(e) => cambiar({ fecha: e.target.value })} aria-label="Fecha" />
      </Campo>

      <CamposDeOrigenDelPago
        activo
        medios={MEDIOS}
        medio={form.medio}
        onMedio={(v) => cambiar({ medio: v })}
        origen={datos.local}
        turnoId={form.turnoId}
        onTurno={(v) => cambiar({ turnoId: v })}
        onError={setError}
      />

      <Campo rotulo="Nota (opcional)">
        <SunmiInput value={form.nota} onChange={(e) => cambiar({ nota: e.target.value })} placeholder="Algo para recordar" aria-label="Nota" />
      </Campo>

      {error && (
        <SunmiAviso tono="danger" titulo="No se registró">
          {error}
        </SunmiAviso>
      )}

      <BotonTesoreria onClick={registrar} disabled={enviando || faltaAlgoDelPagoDeSueldo(form)}>
        {enviando ? "Registrando…" : "Registrar pago"}
      </BotonTesoreria>
    </div>
  );
}
