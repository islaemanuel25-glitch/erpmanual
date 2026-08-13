"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function ModalCategoria({
  open,
  mode, // "nuevo" | "editar"
  initialData = null,
  onClose,
  onSaved,
}) {
  const router = useRouter();

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

      const url = editMode ? "/api/categorias/editar" : "/api/categorias/crear";

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

      // Debug: log del payload
      console.log("🔍 MODAL - payload enviado:", payload, "activo tipo:", typeof payload.activo);

      const res = await fetch(url, {
        method: editMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // ✅ Sesión vencida / no autenticado
      if (res.status === 401) {
        onClose?.();
        router.replace("/login");
        return;
      }

      const data = await res.json();

      if (!data?.ok) {
        alert(data?.error || "Error");
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
  return (
    <SunmiModalLayout
      open={open}
      title={editMode ? "Editar categoría" : "Nueva categoría"}
      onClose={onClose}
      // Es un formulario: un toque al costado con el nombre ya escrito tiraría
      // lo escrito, y en el teléfono ese toque pasa solo.
      destructivo
      // El ancho de esta pantalla es `max-w-md`, no el `max-w-xl` del kit. Sin
      // declararlo la tarjeta pasaría de 392 a 504 px a 1366.
      maxWidth="max-w-md"
      // El cuerpo tenía su propio `p-4 space-y-4` y se conserva tal cual: el
      // `mt-2 gap-3` del kit le separaría los campos del formulario, que es lo
      // que emparejar la capa NO es. Medido: el paso de bloque a `flex flex-col`
      // no mueve nada acá, cero píxeles a 1366 y a 360.
      espacioCuerpo="p-4 space-y-4"
    >
      <div>
        <label className="text-[11px] sunmi-label mb-1 block">Nombre</label>
        <SunmiInput
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          placeholder="Ingresar nombre"
        />
      </div>

      <SunmiSeparator />

      <div className="flex items-center justify-between">
        <span className="text-[11px] sunmi-label">Activo</span>
        <SunmiToggleEstado
          value={form.activo}
          onChange={(v) => setForm((f) => ({ ...f, activo: v }))}
        />
      </div>

      <SunmiSeparator />

      <div className="flex justify-end gap-3">
        <SunmiButton color="slate" onClick={onClose}>
          Cancelar
        </SunmiButton>

        <SunmiButton onClick={handleSubmit} disabled={loading}>
          {loading ? "Guardando..." : "Guardar"}
        </SunmiButton>
      </div>
    </SunmiModalLayout>
  );
}
