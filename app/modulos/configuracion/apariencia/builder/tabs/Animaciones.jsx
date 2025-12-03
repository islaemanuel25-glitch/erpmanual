"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelect from "@/components/sunmi/SunmiSelect";

export default function Animaciones() {
  const { ui, updateUIConfig } = useUIConfig();
  const anim = ui.animations;

  const set = (key, val) => {
    updateUIConfig({
      animations: {
        ...anim,
        [key]: val,
      },
    });
  };

  return (
    <div className="flex flex-col gap-8">

      {/* =================================== */}
      {/* ANIMACIÓN GLOBAL */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Animación Global" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Duración (ms)</label>
            <SunmiInput
              type="number"
              value={anim.duration}
              onChange={(e) => set("duration", Number(e.target.value))}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Easing</label>
            <SunmiSelect
              value={anim.easing}
              onChange={(v) => set("easing", v)}
              options={[
                { label: "Ease", value: "ease" },
                { label: "Ease-in", value: "ease-in" },
                { label: "Ease-out", value: "ease-out" },
                { label: "Ease-in-out", value: "ease-in-out" },
                { label: "Linear", value: "linear" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* HOVER */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Hover" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Escala Hover</label>
            <SunmiSelect
              value={anim.hoverScale}
              onChange={(v) => set("hoverScale", Number(v))}
              options={[
                { label: "100%", value: 1 },
                { label: "102%", value: 1.02 },
                { label: "104%", value: 1.04 },
              ]}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Transición Hover (ms)</label>
            <SunmiInput
              type="number"
              value={anim.hoverDuration}
              onChange={(e) => set("hoverDuration", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* FOCUS */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Focus" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Escala Focus</label>
            <SunmiSelect
              value={anim.focusScale}
              onChange={(v) => set("focusScale", Number(v))}
              options={[
                { label: "100%", value: 1 },
                { label: "101%", value: 1.01 },
                { label: "103%", value: 1.03 },
              ]}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Duración Focus (ms)</label>
            <SunmiInput
              type="number"
              value={anim.focusDuration}
              onChange={(e) => set("focusDuration", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* FADE IN */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Fade-in (Aparición)" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Opacidad Inicial</label>
            <SunmiSelect
              value={anim.fadeFrom}
              onChange={(v) => set("fadeFrom", Number(v))}
              options={[
                { label: "0%", value: 0 },
                { label: "20%", value: 0.2 },
                { label: "40%", value: 0.4 },
              ]}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Duración Fade (ms)</label>
            <SunmiInput
              type="number"
              value={anim.fadeDuration}
              onChange={(e) => set("fadeDuration", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* SLIDE IN */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Slide-in (Desplazamiento)" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Offset Y inicial</label>
            <SunmiInput
              type="number"
              value={anim.slideOffsetY}
              onChange={(e) => set("slideOffsetY", Number(e.target.value))}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Duración Slide (ms)</label>
            <SunmiInput
              type="number"
              value={anim.slideDuration}
              onChange={(e) => set("slideDuration", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* MODALES */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Animación Modales" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Escala inicial</label>
            <SunmiSelect
              value={anim.modalScale}
              onChange={(v) => set("modalScale", Number(v))}
              options={[
                { label: "90%", value: 0.9 },
                { label: "95%", value: 0.95 },
                { label: "100%", value: 1 },
              ]}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Blur Fondo</label>
            <SunmiSelect
              value={anim.modalBackdropBlur}
              onChange={(v) => set("modalBackdropBlur", v)}
              options={[
                { label: "Ninguno", value: "none" },
                { label: "Pequeño", value: "sm" },
                { label: "Medio", value: "md" },
                { label: "Grande", value: "lg" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs opacity-70">Duración (ms)</label>
            <SunmiInput
              type="number"
              value={anim.modalDuration}
              onChange={(e) => set("modalDuration", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* =================================== */}
      {/* TABLA */}
      {/* =================================== */}
      <div>
        <SunmiSeparator label="Animación de Filas (Tabla)" />

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs opacity-70">Fade Tabla (ms)</label>
            <SunmiInput
              type="number"
              value={anim.tableFade}
              onChange={(e) => set("tableFade", Number(e.target.value))}
            />
          </div>

          <div className="col-span-2">
            <label className="text-xs opacity-70">Slide Tabla (offset Y)</label>
            <SunmiInput
              type="number"
              value={anim.tableSlideY}
              onChange={(e) => set("tableSlideY", Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
