"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Avanzado() {
  const { ui, updateUIConfig } = useUIConfig();

  const cambio = (prop, val) => updateUIConfig({ [prop]: val });

  return (
    <div className="flex flex-col gap-6">

      {/* ========================= */}
      {/* REDONDEO GLOBAL REAL      */}
      {/* ========================= */}
      <div>
        <SunmiSeparator label="Redondeo global" />
        <SunmiSelect
          value={ui.rounded}
          onChange={(v) => cambio("rounded", v)}
          options={[
            { label: "SM", value: "sm" },
            { label: "MD", value: "md" },
            { label: "LG", value: "lg" },
            { label: "Full", value: "full" },
          ]}
        />
      </div>

      {/* ========================= */}
      {/* ANIM SPEED — NO EXISTE    */}
      {/* LO SACAMOS POR COMPLETO   */}
      {/* ========================= */}

    </div>
  );
}
