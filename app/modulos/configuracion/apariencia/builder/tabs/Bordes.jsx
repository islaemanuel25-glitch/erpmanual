"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function Bordes() {
  const { ui, updateUIConfig } = useUIConfig();

  const setRounded = (value) => {
    updateUIConfig({
      rounded: value,
    });
  };

  const setRoundedScale = (key, value) => {
    updateUIConfig({
      roundedScale: {
        ...ui.roundedScale,
        [key]: Number(value),
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* ======================================
          RADIO GLOBAL
      ====================================== */}
      <div>
        <SunmiSeparator label="Radio global (rounded)" />

        <label className="text-xs opacity-70">Preset global</label>
        <SunmiSelect
          value={ui.rounded}
          onChange={setRounded}
        >
          <option value="sm">Pequeño</option>
          <option value="md">Medio</option>
          <option value="lg">Grande</option>
          <option value="full">Circular</option>
        </SunmiSelect>
      </div>

      {/* ======================================
          RADIO PERSONALIZADO (Escala)
      ====================================== */}
      <div>
        <SunmiSeparator label="Escala numérica (roundedScale)" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">sm</label>
            <SunmiInput
              type="number"
              value={ui.roundedScale.sm}
              onChange={(e) =>
                setRoundedScale("sm", e.target.value)
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">md</label>
            <SunmiInput
              type="number"
              value={ui.roundedScale.md}
              onChange={(e) =>
                setRoundedScale("md", e.target.value)
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">lg</label>
            <SunmiInput
              type="number"
              value={ui.roundedScale.lg}
              onChange={(e) =>
                setRoundedScale("lg", e.target.value)
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">full</label>
            <SunmiInput
              type="number"
              value={ui.roundedScale.full}
              onChange={(e) =>
                setRoundedScale("full", e.target.value)
              }
            />
          </div>
        </div>
      </div>

    </div>
  );
}
