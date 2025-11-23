"use client";

import { useEffect, useRef, useState } from "react";
import { PERMISOS } from "@/lib/permisos";

/**
 * ModalRol — Modal unificado para Crear/Editar roles
 * ✅ camelCase en frontend
 * ✅ snake_case en payload
 * ✅ permisos como array
 * ✅ estados limpios
 */

export default function ModalRol({
  open,
  onClose,
  onSubmit,
  initialData = null,
}) {
  const inputClass =
    "h-[36px] w-full px-3 rounded-md border border-gray-300 bg-white text-[13px] text-gray-800 focus:border-blue-500 focus:outline-none";

  const modalRef = useRef(null);
  const editMode = Boolean(initialData);

  // -----------------------------------------------------
  // ESTADO DEL FORM
  // -----------------------------------------------------
  const [form, setForm] = useState({
    nombre: "",
    permisos: [],
  });

  // -----------------------------------------------------
  // RESET AL ABRIR
  // -----------------------------------------------------
  useEffect(() => {
    if (!open) return;

    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 20);

    if (editMode) {
      setForm({
        nombre: initialData.nombre || "",
        permisos: Array.isArray(initialData.permisos)
          ? initialData.permisos
          : [],
      });
    } else {
      setForm({
        nombre: "",
        permisos: [],
      });
    }
  }, [open, editMode, initialData]);

  // -----------------------------------------------------
  // HANDLERS
  // -----------------------------------------------------
  const togglePermiso = (p) => {
    setForm((prev) => ({
      ...prev,
      permisos: prev.permisos.includes(p)
        ? prev.permisos.filter((x) => x !== p)
        : [...prev.permisos, p],
    }));
  };

  const setAdmin = () => {
    setForm((prev) => ({ ...prev, permisos: ["*"] }));
  };

  const handleSubmit = () => {
    if (!form.nombre.trim()) return alert("Completá el nombre del rol");

    const payload = {
      nombre: form.nombre.trim(),
      permisos: form.permisos,
    };

    onSubmit(payload);
  };

  const labelHumano = (permiso) => {
    const [mod, act] = permiso.split(".");
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    return `${cap(mod)} · ${act ? cap(act) : ""}`.trim();
  };

  // -----------------------------------------------------
  // UI
  // -----------------------------------------------------
  const visible = open
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-3 transition-opacity duration-150 ${visible}`}
    >
      <div className="w-[95%] max-w-xl bg-white rounded-xl shadow-xl overflow-hidden">
        {/* HEADER */}
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {editMode ? "Editar rol" : "Nuevo rol"}
          </h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-md border bg-gray-50 hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>

        {/* BODY */}
        <div
          ref={modalRef}
          className="p-5 max-h-[65vh] overflow-y-auto space-y-4"
        >
          {/* Nombre */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-gray-600">Nombre *</label>
            <input
              className={inputClass}
              value={form.nombre}
              onChange={(e) =>
                setForm((p) => ({ ...p, nombre: e.target.value }))
              }
              placeholder="Ej: Administrador"
            />
          </div>

          {/* Permisos */}
          <div className="flex items-center justify-between">
            <label className="text-[12px] text-gray-600 font-medium">
              Permisos
            </label>
            <button
              type="button"
              onClick={setAdmin}
              className="px-3 py-1 border rounded-md text-sm"
            >
              Set Admin (*)
            </button>
          </div>

          {Object.entries(PERMISOS).map(([grupo, lista]) => (
            <div
              key={grupo}
              className="mb-3 border rounded-md p-3 bg-gray-50"
            >
              <h3 className="text-sm font-semibold mb-2 capitalize">
                {grupo}
              </h3>

              <div className="grid grid-cols-2 gap-2">
                {lista.map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.permisos.includes(p)}
                      onChange={() => togglePermiso(p)}
                    />
                    {labelHumano(p)}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border bg-white hover:bg-gray-50"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {editMode ? "Guardar cambios" : "Crear rol"}
          </button>
        </div>
      </div>
    </div>
  );
}
