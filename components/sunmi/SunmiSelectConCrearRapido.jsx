"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

/**
 * Select con botón "+ Nuevo" al lado que abre un modal
 * para crear un item rápido sin salir del formulario.
 *
 * Props:
 *  - label: string opcional (label visible)
 *  - value: valor actual del select
 *  - onChange(value): callback al cambiar la selección
 *  - items: array de items del catálogo
 *  - placeholder: placeholder del select
 *  - getOptionLabel(item): default item.nombre
 *  - getOptionValue(item): default String(item.id)
 *  - crearLabel: texto del botón nuevo (default "+ Nuevo")
 *  - tituloModal: título del modal (default "Crear nuevo")
 *  - campos: [{ key, label, type?, requerido? }]
 *  - onCrear(payload): async, debe devolver el item creado o lanzar Error.
 *  - disabled
 *  - searchable
 */
export default function SunmiSelectConCrearRapido({
  label,
  value,
  onChange,
  items = [],
  placeholder = "Seleccionar...",
  getOptionLabel = (it) => it?.nombre ?? "",
  getOptionValue = (it) => (it?.id != null ? String(it.id) : ""),
  crearLabel = "+ Nuevo",
  tituloModal = "Crear nuevo",
  campos = [{ key: "nombre", label: "Nombre", requerido: true }],
  onCrear,
  disabled = false,
  searchable = true,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [formValues, setFormValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setFormValues({});
    setError("");
    setSaving(false);
  };

  const openModal = () => {
    reset();
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    reset();
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    setError("");

    for (const campo of campos) {
      if (campo.requerido) {
        const v = formValues[campo.key];
        if (!v || (typeof v === "string" && v.trim() === "")) {
          setError(`${campo.label} es requerido`);
          return;
        }
      }
    }

    if (typeof onCrear !== "function") {
      setError("Acción no disponible");
      return;
    }

    setSaving(true);
    try {
      const item = await onCrear(formValues);
      if (item) {
        setModalOpen(false);
        reset();
      } else {
        setError("No se pudo crear");
      }
    } catch (err) {
      setError(err?.message || "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0">
          <SunmiSelectAdv
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            searchable={searchable}
          >
            <SunmiSelectOption value="">-</SunmiSelectOption>
            {items.map((it) => (
              <SunmiSelectOption
                key={getOptionValue(it)}
                value={getOptionValue(it)}
              >
                {getOptionLabel(it)}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={disabled}
          className="shrink-0 inline-flex items-center gap-1 px-2 sunmi-control hover:sunmi-control-hover rounded-md text-[11px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={crearLabel}
          title={crearLabel}
        >
          <Plus size={14} />
          <span className="hidden sm:inline">Nuevo</span>
        </button>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3">
          <form
            onSubmit={handleSubmit}
            className="sunmi-card w-full max-w-md p-4 rounded-xl shadow-xl"
          >
            <h3 className="text-sm font-bold mb-3">{tituloModal}</h3>

            <div className="flex flex-col gap-2.5">
              {campos.map((campo) => (
                <div key={campo.key}>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    {campo.label}
                    {campo.requerido && <span className="sunmi-text-danger ml-0.5">*</span>}
                  </label>
                  <SunmiInput
                    type={campo.type || "text"}
                    value={formValues[campo.key] ?? ""}
                    onChange={(e) =>
                      setFormValues((prev) => ({
                        ...prev,
                        [campo.key]: e.target.value,
                      }))
                    }
                    placeholder={campo.placeholder || ""}
                    autoFocus={campo.key === campos[0].key}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>

            {error && (
              <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="mt-4 flex gap-2 justify-end">
              <SunmiButton color="slate" onClick={closeModal} disabled={saving}>
                Cancelar
              </SunmiButton>
              <SunmiButton color="amber" type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Crear"}
              </SunmiButton>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
