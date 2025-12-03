"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Bordes() {
  const { ui, updateUIConfig } = useUIConfig();
  const borders = ui.borders;

  const set = (key, value) => {
    updateUIConfig({
      borders: {
        ...borders,
        [key]: value,
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* ========================= RADIO GLOBAL ========================= */}
      <div>
        <SunmiSeparator label="Radio de bordes" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Card radius</label>
            <SunmiInput
              type="number"
              value={borders.cardRadius}
              onChange={(e) => set("cardRadius", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Input radius</label>
            <SunmiInput
              type="number"
              value={borders.inputRadius}
              onChange={(e) => set("inputRadius", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Button radius</label>
            <SunmiInput
              type="number"
              value={borders.buttonRadius}
              onChange={(e) => set("buttonRadius", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Select radius</label>
            <SunmiInput
              type="number"
              value={borders.selectRadius}
              onChange={(e) => set("selectRadius", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Pill / Badge radius</label>
            <SunmiInput
              type="number"
              value={borders.pillRadius}
              onChange={(e) => set("pillRadius", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Avatar radius</label>
            <SunmiInput
              type="number"
              value={borders.avatarRadius}
              onChange={(e) => set("avatarRadius", Number(e.target.value))}
            />
          </div>

        </div>
      </div>

      {/* ========================= GROSOR DE BORDE ========================= */}
      <div>
        <SunmiSeparator label="Grosor de borde" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs opacity-70">Border width</label>
            <SunmiInput
              type="number"
              value={borders.borderWidth}
              onChange={(e) => set("borderWidth", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ========================= TIPO DE BORDE ========================= */}
      <div>
        <SunmiSeparator label="Tipo de borde" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs opacity-70">Style</label>
            <SunmiSelect
              value={borders.borderStyle}
              onChange={(v) => set("borderStyle", v)}
              options={[
                { label: "Sólido", value: "solid" },
                { label: "Punteado", value: "dotted" },
                { label: "Rayado", value: "dashed" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ========================= OPACIDAD ========================= */}
      <div>
        <SunmiSeparator label="Opacidad" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs opacity-70">Border opacity (0 a 1)</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={borders.borderOpacity}
              onChange={(e) =>
                set("borderOpacity", Number(e.target.value))
              }
            />
          </div>
        </div>
      </div>

      {/* ========================= TABLAS ========================= */}
      <div>
        <SunmiSeparator label="Tablas" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Border Y interno (divide-y)</label>
            <SunmiInput
              type="number"
              value={borders.tableDivideY}
              onChange={(e) => set("tableDivideY", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Border X interno (divide-x)</label>
            <SunmiInput
              type="number"
              value={borders.tableDivideX}
              onChange={(e) => set("tableDivideX", Number(e.target.value))}
            />
          </div>

        </div>
      </div>

      {/* ========================= LAYOUT ========================= */}
      <div>
        <SunmiSeparator label="Bordes del Layout" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Sidebar border width</label>
            <SunmiInput
              type="number"
              value={borders.sidebarBorder}
              onChange={(e) => set("sidebarBorder", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Header border width</label>
            <SunmiInput
              type="number"
              value={borders.headerBorder}
              onChange={(e) => set("headerBorder", Number(e.target.value))}
            />
          </div>

        </div>
      </div>
    </div>
  );
}
