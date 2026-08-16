"use client";

import { TICKET_SECTIONS } from "@/lib/pos-ventas/ticketConfig";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";

const FONT_WEIGHTS = [
  { value: 100, label: "100 - Thin" },
  { value: 300, label: "300 - Light" },
  { value: 400, label: "400 - Normal" },
  { value: 500, label: "500 - Medium" },
  { value: 600, label: "600 - Semi Bold" },
  { value: 700, label: "700 - Bold" },
  { value: 900, label: "900 - Black" },
];

const TEXT_ALIGNS = [
  { value: "left", label: "Izquierda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Derecha" },
  { value: "justify", label: "Justificado" },
];

const FONT_FAMILIES = [
  { value: "Arial", label: "Arial" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Roboto", label: "Roboto" },
  { value: "Inter", label: "Inter" },
  { value: "Courier New", label: "Courier New" },
  { value: "Consolas", label: "Consolas" },
  { value: "Roboto Mono", label: "Roboto Mono" },
];

function ElementControls({ elKey, val, onUpdate }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <div>
        <label className="text-[10px] sunmi-text-muted block mb-0.5">
          Tamano: {val.fontSize}px
        </label>
        <input
          type="range"
          min={7}
          max={32}
          step={1}
          value={val.fontSize}
          onChange={(e) => onUpdate(elKey, "fontSize", Number(e.target.value))}
          className="w-full h-1.5 accent-amber-500"
        />
      </div>

      <div>
        <label className="text-[10px] sunmi-text-muted block mb-0.5">Peso</label>
        <SunmiSelectAdv
          value={val.fontWeight}
          onChange={(v) => onUpdate(elKey, "fontWeight", Number(v))}
        >
          {FONT_WEIGHTS.map((fw) => (
            <option key={fw.value} value={fw.value}>{fw.label}</option>
          ))}
        </SunmiSelectAdv>
      </div>

      <div>
        <label className="text-[10px] sunmi-text-muted block mb-0.5">Alineacion</label>
        <SunmiSelectAdv
          value={val.textAlign}
          onChange={(v) => onUpdate(elKey, "textAlign", v)}
        >
          {TEXT_ALIGNS.map((ta) => (
            <option key={ta.value} value={ta.value}>{ta.label}</option>
          ))}
        </SunmiSelectAdv>
      </div>

      <div>
        <label className="text-[10px] sunmi-text-muted block mb-0.5">Font Family</label>
        <SunmiSelectAdv
          value={val.fontFamily || "Arial"}
          onChange={(v) => onUpdate(elKey, "fontFamily", v)}
        >
          {FONT_FAMILIES.map((ff) => (
            <option key={ff.value} value={ff.value}>{ff.label}</option>
          ))}
        </SunmiSelectAdv>
      </div>

      <div>
        <label className="text-[10px] sunmi-text-muted block mb-0.5">
          Margen sup: {val.marginTop}px
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={val.marginTop}
          onChange={(e) => onUpdate(elKey, "marginTop", Number(e.target.value))}
          className="w-full h-1.5 accent-amber-500"
        />
      </div>

      <div className="col-span-2">
        <label className="text-[10px] sunmi-text-muted block mb-0.5">
          Margen inf: {val.marginBottom}px
        </label>
        <input
          type="range"
          min={0}
          max={20}
          step={1}
          value={val.marginBottom}
          onChange={(e) => onUpdate(elKey, "marginBottom", Number(e.target.value))}
          className="w-full h-1.5 accent-amber-500"
        />
      </div>
    </div>
  );
}

export default function TicketEditor({ config, onChange }) {
  const updateField = (key, field, value) => {
    onChange({
      ...config,
      [key]: { ...config[key], [field]: value },
    });
  };

  return (
    <div className="space-y-5">
      {TICKET_SECTIONS.map((section) => (
        <div key={section.section}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider sunmi-text-accent mb-2">
            {section.section}
          </h3>
          <div className="space-y-2">
            {section.elements.map((el) => {
              const val = config[el.key] || el.defaults;
              // Acá decía `!p-3`, y el `!` era lo único que hacía ganar a este
              // padding contra el `p-6` que `SunmiCard` concatenaba. Desde que la
              // pieza negocia el eje no hay contra qué ganar, y el `!` se sacó
              // DESPUÉS de medirlo: `p-3` solo y `!p-3` solo dan los mismos
              // 10.5 px, y la pieza sin nada da 0 — o sea que el `p-6` ya no
              // compite. Esta pantalla no se pudo fotografiar: es el editor de
              // ticket del POS y no hay ninguna caja abierta en desarrollo.
              return (
                <SunmiCard key={el.key} className="p-3">
                  <h4 className="text-[12px] font-semibold sunmi-text-strong mb-2">{el.label}</h4>
                  <ElementControls elKey={el.key} val={val} onUpdate={updateField} />
                </SunmiCard>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
