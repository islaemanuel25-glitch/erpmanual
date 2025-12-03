"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Sombras() {
  const { ui, updateUIConfig } = useUIConfig();
  const shadows = ui.shadows;

  const set = (key, value) => {
    updateUIConfig({
      shadows: {
        ...shadows,
        [key]: value,
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* ===================================================== */}
      {/* SOMBRA DE CARDS */}
      {/* ===================================================== */}
      <div>
        <SunmiSeparator label="Sombra de Cards" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">Blur</label>
            <SunmiInput
              type="number"
              value={shadows.cardBlur}
              onChange={(e) => set("cardBlur", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Spread</label>
            <SunmiInput
              type="number"
              value={shadows.cardSpread}
              onChange={(e) => set("cardSpread", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Offset Y</label>
            <SunmiInput
              type="number"
              value={shadows.cardOffsetY}
              onChange={(e) => set("cardOffsetY", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Opacidad</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={shadows.cardOpacity}
              onChange={(e) => set("cardOpacity", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* SOMBRA DE INPUTS / SELECTS */}
      {/* ===================================================== */}
      <div>
        <SunmiSeparator label="Sombra Inputs / Selects" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Blur</label>
            <SunmiInput
              type="number"
              value={shadows.inputBlur}
              onChange={(e) => set("inputBlur", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Opacity</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={shadows.inputOpacity}
              onChange={(e) => set("inputOpacity", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* SOMBRA DE BOTONES */}
      {/* ===================================================== */}
      <div>
        <SunmiSeparator label="Sombra de Botones" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Blur</label>
            <SunmiInput
              type="number"
              value={shadows.buttonBlur}
              onChange={(e) => set("buttonBlur", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Opacity</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={shadows.buttonOpacity}
              onChange={(e) => set("buttonOpacity", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* SOMBRA DEL HEADER / SIDEBAR */}
      {/* ===================================================== */}
      <div>
        <SunmiSeparator label="Sombra Header / Sidebar" />

        <div className="grid grid-cols-3 gap-3">

          <div>
            <label className="text-xs opacity-70">Blur</label>
            <SunmiInput
              type="number"
              value={shadows.layoutBlur}
              onChange={(e) => set("layoutBlur", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Opacity</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={shadows.layoutOpacity}
              onChange={(e) => set("layoutOpacity", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Offset Y</label>
            <SunmiInput
              type="number"
              value={shadows.layoutOffsetY}
              onChange={(e) => set("layoutOffsetY", Number(e.target.value))}
            />
          </div>

        </div>
      </div>

    </div>
  );
}
