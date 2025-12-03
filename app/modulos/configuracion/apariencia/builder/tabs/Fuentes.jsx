"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Fuentes() {
  const { ui, updateUIConfig } = useUIConfig();

  const cambio = (path, value) => {
    updateUIConfig({
      font: {
        ...ui.font,
        [path]: value,
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ========================================================= */}
      {/* TAMAÑO BASE */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Tamaño base" />

        <SunmiInput
          type="number"
          value={ui.font.sizeBase}
          onChange={(e) => cambio("sizeBase", Number(e.target.value))}
        />

        <p className="text-[11px] opacity-60 mt-1">
          Tamaño principal en px (default: 13).
        </p>
      </div>


      {/* ========================================================= */}
      {/* ESCALA XS / SM / MD / LG */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Escalas tipográficas" />

        <div className="flex flex-col gap-3">

          {/* XS */}
          <div>
            <label className="text-xs opacity-70">Escala XS</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={ui.font.scaleSm}
              onChange={(e) => cambio("scaleSm", Number(e.target.value))}
            />
          </div>

          {/* MD */}
          <div>
            <label className="text-xs opacity-70">Escala MD</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={ui.font.scaleMd}
              onChange={(e) => cambio("scaleMd", Number(e.target.value))}
            />
          </div>

          {/* LG */}
          <div>
            <label className="text-xs opacity-70">Escala LG</label>
            <SunmiInput
              type="number"
              step="0.05"
              value={ui.font.scaleLg}
              onChange={(e) => cambio("scaleLg", Number(e.target.value))}
            />
          </div>
        </div>

        <p className="text-[11px] opacity-60 mt-1">
          Ajusta la proporción del texto en distintos tamaños.
        </p>
      </div>


      {/* ========================================================= */}
      {/* PESOS TIPOGRÁFICOS */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Peso de fuente" />

        <div className="flex flex-col gap-3">

          {/* Normal */}
          <div>
            <label className="text-xs opacity-70">Normal</label>
            <SunmiInput
              type="number"
              value={ui.font.weightNormal}
              onChange={(e) =>
                cambio("weightNormal", Number(e.target.value))
              }
            />
          </div>

          {/* Semibold */}
          <div>
            <label className="text-xs opacity-70">Semibold</label>
            <SunmiInput
              type="number"
              value={ui.font.weightSemibold}
              onChange={(e) =>
                cambio("weightSemibold", Number(e.target.value))
              }
            />
          </div>

          {/* Bold */}
          <div>
            <label className="text-xs opacity-70">Bold</label>
            <SunmiInput
              type="number"
              value={ui.font.weightBold}
              onChange={(e) =>
                cambio("weightBold", Number(e.target.value))
              }
            />
          </div>
        </div>

        <p className="text-[11px] opacity-60 mt-1">
          Controla la densidad visual del texto.
        </p>
      </div>

    </div>
  );
}
