"use client";

import { useEffect, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import GrupoAvatar from "@/components/grupos/GrupoAvatar";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

export default function GrupoHeader({
  grupo,
  onSaveNombre,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(grupo?.nombre || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(grupo?.nombre || "");
  }, [grupo?.nombre, editing]);

  const startEdit = () => {
    setDraft(grupo?.nombre || "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(grupo?.nombre || "");
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const nuevo = draft.trim();
    if (!nuevo || nuevo === grupo?.nombre) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSaveNombre?.(nuevo);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-3 sm:gap-4 px-1">
      <GrupoAvatar nombre={grupo?.nombre || "?"} size={56} />

      <div className="flex-1 min-w-0">
        {editing ? (
          <form
            onSubmit={submit}
            className="flex flex-wrap items-center gap-2"
          >
            <div className="flex-1 min-w-[180px] max-w-md">
              <SunmiInput
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                disabled={saving}
                placeholder="Nombre del grupo"
              />
            </div>
            <SunmiButton color="amber" type="submit" disabled={saving}>
              <span className="inline-flex items-center gap-1">
                <Check size={14} />
                {saving ? "Guardando…" : "Guardar"}
              </span>
            </SunmiButton>
            <SunmiButton
              color="slate"
              type="button"
              onClick={cancelEdit}
              disabled={saving}
            >
              <span className="inline-flex items-center gap-1">
                <X size={14} />
                Cancelar
              </span>
            </SunmiButton>
          </form>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold sunmi-text-strong truncate">
              {grupo?.nombre || "Grupo"}
            </h1>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border sunmi-divider sunmi-text-muted hover:sunmi-control-hover hover:sunmi-text-strong transition shrink-0"
              aria-label="Editar nombre"
              title="Editar nombre"
            >
              <Pencil size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
