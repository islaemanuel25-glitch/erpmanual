"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Avanzado() {
  const { ui, updateUIConfig } = useUIConfig();

  const cambio = (prop, val) => updateUIConfig({ [prop]: val });

  return (
    <div className="flex flex-col gap-6">

      {/* Redondeo global */}
      <div>
        <SunmiSeparator label="Redondeo global" />
        <SunmiSelect
          value={ui.rounded?.selected || "md"}
          onChange={(v) => cambio("rounded", { ...ui.rounded, selected: v })}
          options={[
            { label: "SM", value: "sm" },
            { label: "MD", value: "md" },
            { label: "LG", value: "lg" },
            { label: "Full", value: "full" },
          ]}
        />
      </div>

      {/* Otros ajustes */}
      <div>
        <SunmiSeparator label="Velocidad de animaciones" />
        <SunmiSelect
          value={ui.animSpeed || "normal"}
          onChange={(v) => cambio("animSpeed", v)}
          options={[
            { label: "Rápidas", value: "fast" },
            { label: "Normales", value: "normal" },
            { label: "Lentas", value: "slow" },
          ]}
        />
      </div>

    </div>
  );
}
