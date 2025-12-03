"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelect from "@/components/sunmi/SunmiSelect";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function Spacing() {
  const { ui, updateUIConfig } = useUIConfig();

  const setSpacingProp = (key, val) => {
    updateUIConfig({
      spacing: {
        ...ui.spacing,
        [key]: val,
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ========================================================= */}
      {/* SPACING GLOBAL */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Espaciado global" />

        <SunmiSelect
          value={ui.spacing.selected}
          onChange={(e) => setSpacingProp("selected", e.target.value)}
        >
          <option value="xs">XS</option>
          <option value="sm">SM</option>
          <option value="md">MD</option>
          <option value="lg">LG</option>
        </SunmiSelect>

        <p className="text-[11px] opacity-60 mt-1">
          Afecta el espaciado general entre secciones del ERP.
        </p>
      </div>

      {/* ========================================================= */}
      {/* VALORES BASE DE SPACING */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Valores base" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">XS</label>
            <SunmiInput
              type="number"
              value={ui.spacing.xs}
              onChange={(e) =>
                setSpacingProp("xs", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">SM</label>
            <SunmiInput
              type="number"
              value={ui.spacing.sm}
              onChange={(e) =>
                setSpacingProp("sm", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">MD</label>
            <SunmiInput
              type="number"
              value={ui.spacing.md}
              onChange={(e) =>
                setSpacingProp("md", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">LG</label>
            <SunmiInput
              type="number"
              value={ui.spacing.lg}
              onChange={(e) =>
                setSpacingProp("lg", Number(e.target.value))
              }
            />
          </div>
        </div>

        <p className="text-[11px] opacity-60 mt-2">
          Definen todos los tokens de espaciado disponibles.
        </p>
      </div>

      {/* ========================================================= */}
      {/* ESPACIADO LOCAL DE COMPONENTES */}
      {/* ========================================================= */}
      <div>
        <SunmiSeparator label="Espaciado entre componentes" />

        <div className="grid grid-cols-1 gap-3">
          {/* Espaciado entre cards */}
          <div>
            <label className="text-xs opacity-70">Entre tarjetas</label>
            <SunmiInput
              type="number"
              value={ui.spacing.cards ?? 12}
              onChange={(e) =>
                updateUIConfig({
                  spacing: {
                    ...ui.spacing,
                    cards: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          {/* Espaciado entre inputs */}
          <div>
            <label className="text-xs opacity-70">Entre inputs</label>
            <SunmiInput
              type="number"
              value={ui.spacing.inputs ?? 8}
              onChange={(e) =>
                updateUIConfig({
                  spacing: {
                    ...ui.spacing,
                    inputs: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          {/* Espaciado entre filas de tabla (Y) */}
          <div>
            <label className="text-xs opacity-70">Padding Y filas tabla</label>
            <SunmiInput
              type="number"
              value={ui.spacing.tableRow ?? 6}
              onChange={(e) =>
                updateUIConfig({
                  spacing: {
                    ...ui.spacing,
                    tableRow: Number(e.target.value),
                  },
                })
              }
            />
          </div>

          {/* Espaciado entre columnas de tabla (X) */}
          <div>
            <label className="text-xs opacity-70">Padding X filas tabla</label>
            <SunmiInput
              type="number"
              value={ui.spacing.tableCol ?? 8}
              onChange={(e) =>
                updateUIConfig({
                  spacing: {
                    ...ui.spacing,
                    tableCol: Number(e.target.value),
                  },
                })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
