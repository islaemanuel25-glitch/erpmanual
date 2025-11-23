"use client";

import { useEffect, useRef, useState } from "react";

export default function ModalBase({
  open,
  onClose,
  onSubmit,
  title = "Nuevo registro",
  initialData = null,
}) {
  const visibleClass = open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none";
  const modalRef = useRef(null);

  const inputClass =
    "h-[36px] w-full px-3 rounded-md border border-gray-300 bg-white text-[13px] text-gray-800 focus:border-blue-500 focus:outline-none";

  const [form, setForm] = useState({});

  useEffect(() => {
    if (!open) return;

    setTimeout(() => {
      if (modalRef.current) modalRef.current.scrollTop = 0;
    }, 50);

    setForm(initialData || {}); // ✅ SIN AUTOCOMPLETAR
  }, [open, initialData]);

  const setField = (key, val) => setForm((p) => ({ ...p, [key]: val }));

  const handleSubmit = () => {
    onSubmit(form);
  };

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-3 transition-opacity duration-150 ${visibleClass}`}
    >
      <div className="w-[95%] max-w-3xl bg-white rounded-xl shadow-xl overflow-hidden">
        {/* HEADER */}
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1.5 rounded-md border bg-gray-50 hover:bg-gray-100"
          >
            Cerrar
          </button>
        </div>

        {/* BODY */}
        <div ref={modalRef} className="p-5 max-h-[70vh] overflow-y-auto space-y-4">

          {/* ✅ CAMPOS VACÍOS — acá pegás lo que quieras */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Campo 1">
              <input
                className={inputClass}
                value={form.campo1 || ""}
                onChange={(e) => setField("campo1", e.target.value)}
                autoComplete="off"
              />
            </Field>

            <Field label="Campo 2">
              <input
                className={inputClass}
                value={form.campo2 || ""}
                onChange={(e) => setField("campo2", e.target.value)}
                autoComplete="off"
              />
            </Field>
          </div>

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
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- */
/* Subcomponentes                  */
/* ------------------------------- */

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[12px] text-gray-600">{label}</label>
      {children}
    </div>
  );
}
