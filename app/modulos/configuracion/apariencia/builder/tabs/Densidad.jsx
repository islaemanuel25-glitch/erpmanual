"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";

export default function Densidad() {
  const { ui, updateUIConfig } = useUIConfig();
  const density = ui.density;

  const set = (key, value) => {
    updateUIConfig({
      density: {
        ...density,
        [key]: value,
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* ========================= INPUTS ========================= */}
      <div>
        <SunmiSeparator label="Inputs" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">Altura</label>
            <SunmiInput
              type="number"
              value={density.inputHeight}
              onChange={(e) => set("inputHeight", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding Y</label>
            <SunmiInput
              type="number"
              value={density.inputPaddingY}
              onChange={(e) => set("inputPaddingY", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding X</label>
            <SunmiInput
              type="number"
              value={density.inputPaddingX}
              onChange={(e) => set("inputPaddingX", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ========================= SELECTS ========================= */}
      <div>
        <SunmiSeparator label="Selects" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">Altura</label>
            <SunmiInput
              type="number"
              value={density.selectHeight}
              onChange={(e) => set("selectHeight", Number(e.target.value))}
            />
          </div>

        </div>
      </div>

      {/* ========================= BOTONES ========================= */}
      <div>
        <SunmiSeparator label="Botones" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">Altura</label>
            <SunmiInput
              type="number"
              value={density.buttonHeight}
              onChange={(e) => set("buttonHeight", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding X</label>
            <SunmiInput
              type="number"
              value={density.buttonPaddingX}
              onChange={(e) => set("buttonPaddingX", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* ========================= TABLAS ========================= */}
      <div>
        <SunmiSeparator label="Tablas" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Altura de fila</label>
            <SunmiInput
              type="number"
              value={density.tableRowHeight}
              onChange={(e) => set("tableRowHeight", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding Y celdas</label>
            <SunmiInput
              type="number"
              value={density.tableCellPaddingY}
              onChange={(e) =>
                set("tableCellPaddingY", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding X celdas</label>
            <SunmiInput
              type="number"
              value={density.tableCellPaddingX}
              onChange={(e) =>
                set("tableCellPaddingX", Number(e.target.value))
              }
            />
          </div>
        </div>
      </div>

      {/* ========================= TOGGLES ========================= */}
      <div>
        <SunmiSeparator label="Toggles" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Ancho del track</label>
            <SunmiInput
              type="number"
              value={density.toggleTrackWidth}
              onChange={(e) =>
                set("toggleTrackWidth", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Alto del track</label>
            <SunmiInput
              type="number"
              value={density.toggleTrackHeight}
              onChange={(e) =>
                set("toggleTrackHeight", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Tamaño del thumb</label>
            <SunmiInput
              type="number"
              value={density.toggleThumbSize}
              onChange={(e) =>
                set("toggleThumbSize", Number(e.target.value))
              }
            />
          </div>

        </div>
      </div>

      {/* ========================= BADGES / PILLS ========================= */}
      <div>
        <SunmiSeparator label="Badges / Pills" />

        <div className="grid grid-cols-2 gap-3">

          <div>
            <label className="text-xs opacity-70">Padding X</label>
            <SunmiInput
              type="number"
              value={density.badgePaddingX}
              onChange={(e) =>
                set("badgePaddingX", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Padding Y</label>
            <SunmiInput
              type="number"
              value={density.badgePaddingY}
              onChange={(e) =>
                set("badgePaddingY", Number(e.target.value))
              }
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Font size</label>
            <SunmiInput
              type="number"
              value={density.badgeFontSize}
              onChange={(e) =>
                set("badgeFontSize", Number(e.target.value))
              }
            />
          </div>

        </div>
      </div>

      {/* ========================= AVATARES ========================= */}
      <div>
        <SunmiSeparator label="Avatares" />

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs opacity-70">Tamaño</label>
            <SunmiInput
              type="number"
              value={density.avatarSize}
              onChange={(e) =>
                set("avatarSize", Number(e.target.value))
              }
            />
          </div>
        </div>
      </div>

      {/* ========================= ICON SIZES ========================= */}
      <div>
        <SunmiSeparator label="Tamaño de íconos" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs opacity-70">Icono pequeño</label>
            <SunmiInput
              type="number"
              value={density.iconSm}
              onChange={(e) => set("iconSm", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Icono mediano</label>
            <SunmiInput
              type="number"
              value={density.iconMd}
              onChange={(e) => set("iconMd", Number(e.target.value))}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Icono grande</label>
            <SunmiInput
              type="number"
              value={density.iconLg}
              onChange={(e) => set("iconLg", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
