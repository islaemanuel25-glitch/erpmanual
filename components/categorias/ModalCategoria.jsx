"use client";

import { useEffect, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalCategoria({
  open,
  mode,              // "nuevo" | "editar"
  initialData = null,
  onClose,
  onSaved,
}) {
  // =========================
  // FORM STATE
  // =========================
  const [form, setForm] = useState({
    nombre: "",
    activo: true,
  });

  const [loading, setLoading] = useState(false);
  const editMode = mode === "editar";

  // =========================
  // CARGA DATOS EN EDICIÓN
  // =========================
  useEffect(() => {
    if (!open) return;

    if (editMode && initialData) {
      setForm({
        nombre: initialData.nombre || "",
        activo: Boolean(initialData.activo),
      });
    } else {
      // NUEVO → VACÍO por regla del usuario
      setForm({ nombre: "", activo: true });
    }
  }, [open, editMode, initialData]);

  // =========================
  // SUBMIT
  // =========================
  const handleSubmit = async () => {
    try {
      if (!form.nombre.trim()) {
        alert("El nombre es requerido");
        return;
      }

      setLoading(true);

      const url = editMode
        ? "/api/categorias/editar"
        : "/api/categorias/crear";

      const payload = editMode
        ? {
            id: initialData.id,
            nombre: form.nombre.trim(),
            activo: form.activo,
          }
        : {
            nombre: form.nombre.trim(),
            activo: form.activo,
          };

      const res = await fetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error");
        return;
      }

      onSaved?.();
      onClose?.();

    } catch (e) {
      console.error("Error guardando categoría:", e);
      alert("Error guardando categoría");
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // RENDER
  // =========================
  if (!open) return null;

  return (
    <div
      className="
        fixed inset-0 z-50 
        bg-black/50 
        backdrop-blur-sm 
        flex items-center justify-center
        p-4
      "
    >
      {/* CARD SUNMI */}
      <SunmiCard className="w-full max-w-md p-0 overflow-hidden">

        {/* ===== HEADER ===== */}
        <SunmiCardHeader
          titulo={editMode ? "Editar categoría" : "Nueva categoría"}
        />

        <div className="p-4 space-y-4">

          {/* Nombre */}
          <div>
            <label className="text-sm text-slate-300">Nombre</label>
            <SunmiInput
              value={form.nombre}
              onChange={(e) =>
                setForm((f) => ({ ...f, nombre: e.target.value }))
              }
              placeholder="Ingresar nombre"
            />
          </div>

          <SunmiSeparator />

          {/* Estado */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Activo</span>
            <SunmiToggleEstado
              value={form.activo}
              onChange={(v) =>
                setForm((f) => ({ ...f, activo: v }))
              }
            />
          </div>

          <SunmiSeparator />

          {/* Botones */}
          <div className="flex justify-end gap-3">
            <SunmiButton
              variant="secondary"
              onClick={onClose}
            >
              Cancelar
            </SunmiButton>

            <SunmiButton
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? "Guardando..." : "Guardar"}
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}
