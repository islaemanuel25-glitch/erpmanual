"use client";

// components/empleados/ModalEmpleado.jsx
//
// ALTA Y EDICIÓN DE UN EMPLEADO: nombre, su operador si maneja la caja, y si
// está activo. El local no se elige: es el activo. La forma es la de
// `ModalOperador`, sin PIN: el PIN es del operador, no del empleado.

import { useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

/** La opción "ninguno" del operador: desasocia. */
export const SIN_OPERADOR = "";

/** El formulario con lo que ya tiene el empleado, o vacío para uno nuevo. */
function formInicial(initialData) {
  if (!initialData) return { nombre: "", activo: true, operadorId: SIN_OPERADOR };
  return {
    nombre: initialData.nombre || "",
    activo: Boolean(initialData.activo),
    operadorId: initialData.operador ? String(initialData.operador.id) : SIN_OPERADOR,
  };
}

// La pantalla lo monta de nuevo —con otra `key`— cada vez que se abre para otro
// empleado: el formulario arranca de sus datos sin un efecto que lo copie.
export default function ModalEmpleado({ open, onClose, onSubmit, initialData = null, operadoresLibres = [], error = "" }) {
  const editMode = Boolean(initialData);
  const [form, setForm] = useState(() => formInicial(initialData));

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Los que se pueden elegir: los libres, más el que ya tiene este empleado.
  const operadores = [
    ...(initialData?.operador ? [initialData.operador] : []),
    ...operadoresLibres.filter((o) => o.id !== initialData?.operador?.id),
  ];

  const falta = !form.nombre.trim();

  if (!open) return null;

  return (
    <SunmiModalLayout
      open={open}
      title={editMode ? "Editar empleado" : "Nuevo empleado"}
      onClose={onClose}
      z={9999}
      // Es un formulario: un toque al costado tiraría lo escrito.
      destructivo
      espacioCuerpo=""
      espacioPie=""
      footer={
        <>
          <SunmiButton color="slate" onClick={onClose}>
            Cancelar
          </SunmiButton>
          <SunmiButton
            disabled={falta}
            onClick={() =>
              onSubmit({
                nombre: form.nombre.trim(),
                activo: Boolean(form.activo),
                operadorId: form.operadorId === SIN_OPERADOR ? null : Number(form.operadorId),
              })
            }
          >
            {editMode ? "Guardar cambios" : "Crear empleado"}
          </SunmiButton>
        </>
      }
    >
      <>
        <SunmiSeparator label="Datos" />

        <Field label="Nombre *">
          <SunmiInput
            value={form.nombre}
            onChange={(e) => setField("nombre", e.target.value)}
            placeholder="Nombre del empleado…"
            autoComplete="off"
          />
        </Field>

        <Field label="Operador de caja">
          <SunmiSelectAdv
            value={form.operadorId}
            onChange={(v) => setField("operadorId", v)}
            placeholder="Sin operador"
            aria-label="Operador de caja"
          >
            <SunmiSelectOption value={SIN_OPERADOR}>Sin operador</SunmiSelectOption>
            {operadores.map((o) => (
              <SunmiSelectOption key={o.id} value={String(o.id)}>
                {o.nombre}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </Field>

        <Field label="Estado">
          <SunmiToggleEstado value={form.activo} onChange={(v) => setField("activo", v)} />
        </Field>

        {error ? (
          <p role="alert" className="text-sm2 sunmi-text-danger break-words">
            {error}
          </p>
        ) : null}
      </>
    </SunmiModalLayout>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </div>
  );
}
