"use client";

import { useState, useEffect, useRef } from "react";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiCard from "@/components/sunmi/SunmiCard";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import TicketEditor from "@/components/pos-ventas/TicketEditor";
import TicketPreview from "@/components/pos-ventas/TicketPreview";
import {
  fetchTicketConfig,
  saveTicketConfigRemote,
  buildDefaultConfig,
  PRESETS,
} from "@/lib/pos-ventas/ticketConfig";
import { Save, Printer, RotateCcw } from "lucide-react";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

export default function TicketConfigPage() {
  const { perfil, cargando } = useUser();
  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [preset, setPreset] = useState("");
  const previewRef = useRef(null);

  useEffect(() => {
    fetchTicketConfig().then(setConfig);
  }, []);

  if (cargando || !config) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin && !permisos.includes("config_local.ticket")) return <SinPermisos />;

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveTicketConfigRemote(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error("Error guardando ticket config:", err);
      setSaveError("Error guardando configuracion en servidor. Los cambios no se aplicaron.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const defaults = buildDefaultConfig();
    setConfig(defaults);
    setPreset("");
  };

  const handlePreset = (key) => {
    if (!key || !PRESETS[key]) return;
    setPreset(key);
    setConfig(JSON.parse(JSON.stringify(PRESETS[key].config)));
  };

  const handlePrintTest = () => {
    const el = previewRef.current;
    if (!el) return;

    const win = window.open("", "_blank", "width=360,height=600");
    if (!win) return;

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket prueba</title>
  <style>
    @page { size: 48mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>${el.innerHTML}
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1200);
    };
  </script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex justify-end mb-2">
        <SunmiBackButton href="/modulos/configuracion" />
      </div>

      <SunmiHeader title="Editor de Ticket" />

      {/* Toolbar */}
      <SunmiCard className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[180px] max-w-[240px]">
            <label className="text-[10px] sunmi-text-muted block mb-0.5">Preset</label>
            <SunmiSelectAdv
              value={preset}
              onChange={handlePreset}
              placeholder="Cargar preset..."
            >
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </SunmiSelectAdv>
          </div>

          <div className="flex gap-2 items-end">
            <SunmiButton size="sm" color="amber" onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-1 inline-block -mt-0.5" />
              {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
            </SunmiButton>
            <SunmiButton size="sm" onClick={handleReset}>
              <RotateCcw size={14} className="mr-1 inline-block -mt-0.5" />
              Resetear
            </SunmiButton>
            <SunmiButton size="sm" onClick={handlePrintTest}>
              <Printer size={14} className="mr-1 inline-block -mt-0.5" />
              Imprimir prueba
            </SunmiButton>
          </div>

          {saved && (
            <span className="text-[12px] sunmi-text-success font-medium">
              Configuracion guardada
            </span>
          )}
          {saveError && (
            <span className="text-[12px] text-red-500 font-medium">
              {saveError}
            </span>
          )}
        </div>
      </SunmiCard>

      {/* Layout dos columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        {/* Panel de configuracion */}
        <div className="order-2 lg:order-1 max-h-[80vh] overflow-y-auto pr-1">
          <TicketEditor config={config} onChange={setConfig} />
        </div>

        {/* Preview */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-4 self-start">
          <h3 className="text-[12px] font-semibold sunmi-text-muted mb-2 text-center">
            Vista previa (58mm)
          </h3>
          <div
            ref={previewRef}
            className="border sunmi-border rounded-lg p-2"
            style={{ background: "#f5f5f5" }}
          >
            <TicketPreview config={config} />
          </div>
        </div>
      </div>
    </div>
  );
}
