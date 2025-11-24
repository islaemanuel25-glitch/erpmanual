"use client";

import { useEffect, useRef, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { PERMISOS } from "@/lib/permisos";

export default function ModalRol({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const modalRef = useRef(null);
  const editMode = Boolean(initialData);

  const [form, setForm] = useState({
    nombre: "",
    permisos: [],
  });

  // Reset total al abrir
  useEffect(() => {
    if (!open) return;

    // Reset scroll interno
    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 50);

    // Nuevo rol → form vacío
    if (!initialData) {
      setForm({
        nombre: "",
        permisos: [],
      });
      return;
    }

    // Editar rol
    setForm({
      nombre: initialData.nombre || "",
      permisos: Array.isArray(initialData.permisos)
        ? initialData.permisos
        : [],
    });
  }, [open, initialData]);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const togglePermiso = (p) => {
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(p)
        ? prev.permisos.filter((x) => x !== p)
        : [...prev.permisos, p],
    }));
  };

  const setAdmin = () => setForm((prev) => ({ ...prev, permisos: ["*"] }));

  const validar = () => {
    if (!String(form.nombre).trim()) return "Completá el nombre del rol.";
    return null;
  };

  const handleSubmitInternal = () => {
    const err = validar();
    if (err) return alert(err);

    const payload = {
      nombre: form.nombre.trim(),
      permisos: form.permisos,
    };

    onSubmit(payload);
  };

  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        bg-black/60 backdrop-blur-sm
        flex items-center justify-center
        p-3
      "
    >
      <div
        className="
          w-[95%] max-w-xl
          rounded-2xl 
          overflow-hidden
        "
      >
        {/* CARD SUNMI */}
        <SunmiCard>
          {/* HEADER + BOTÓN CERRAR */}
          <div className="flex items-center justify-between">
            <SunmiHeader
              title={editMode ? "Editar rol" : "Nuevo rol"}
              color="amber"
            />

            <SunmiButton color="slate" onClick={onClose} size="sm">
              Cerrar
            </SunmiButton>
          </div>

          {/* SCROLL INTERNO */}
          <div
            ref={modalRef}
            className="max-h-[65vh] overflow-y-auto px-2 pb-4 mt-2 space-y-4"
          >
            <SunmiSeparator label="Datos" color="amber" />

            {/* Nombre */}
            <Field label="Nombre *">
              <SunmiInput
                value={form.nombre}
                onChange={(e) => setField("nombre", e.target.value)}
                placeholder="Ingresá el nombre del rol…"
              />
            </Field>

            {/* Permisos */}
            <SunmiSeparator label="Permisos" color="amber" />

            <div className="flex justify-end">
              <SunmiButton color="amber" size="sm" onClick={setAdmin}>
                Set Admin (*)
              </SunmiButton>
            </div>

            {Object.entries(PERMISOS).map(([grupo, lista]) => (
              <div
                key={grupo}
                className="bg-slate-900/70 border border-slate-700 rounded-xl p-3"
              >
                <h3 className="text-[13px] font-semibold mb-2 capitalize text-slate-200">
                  {grupo}
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  {lista.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 text-[12px] text-slate-300"
                    >
                      <input
                        type="checkbox"
                        className="accent-amber-400 cursor-pointer"
                        checked={form.permisos.includes(p)}
                        onChange={() => togglePermiso(p)}
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* FOOTER */}
          <div className="flex justify-end gap-2 pt-2">
            <SunmiButton color="slate" onClick={onClose}>
              Cancelar
            </SunmiButton>

            <SunmiButton color="amber" onClick={handleSubmitInternal}>
              {editMode ? "Guardar cambios" : "Crear rol"}
            </SunmiButton>
          </div>
        </SunmiCard>
      </div>
    </div>
  );
}

// Mini componente Field igual al de usuarios
function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <label className="text-[11px] text-slate-400">{label}</label>
      {children}
    </div>
  );
}
