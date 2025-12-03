"use client";

import { useState } from "react";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import ControlsPanel from "./ControlsPanel";
import PreviewPanel from "./PreviewPanel";

const TABS = [
  { key: "fuentes", label: "Fuentes" },
  { key: "spacing", label: "Espaciado" },
  { key: "densidad", label: "Densidad" },
  { key: "bordes", label: "Bordes" },
  { key: "escala", label: "Escala" },
  { key: "avanzado", label: "Avanzado" },
];

export default function BuilderLayout() {
  const { theme } = useSunmiTheme();
  const [tab, setTab] = useState("fuentes");

  return (
    <div
      className={`
        w-full h-[calc(100vh-60px)]
        flex flex-col
        ${theme.layout}
      `}
    >
      {/* ========================= HEADER SUPERIOR ========================= */}
      <div
        className={`
          flex items-center gap-4
          px-6 py-3
          border-b
          sticky top-0 z-20
          bg-opacity-80 backdrop-blur
          ${theme.card}
        `}
      >
        <h1 className="text-lg font-semibold">Ajustes Avanzados de UI</h1>

        <div className="flex items-center gap-2 ml-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`
                px-3 py-1.5
                text-sm rounded-md
                transition-all
                ${
                  tab === t.key
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "opacity-60 hover:opacity-100"
                }
              `}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ========================= LAYOUT PRINCIPAL ========================= */}
      <div className="flex flex-1 overflow-hidden">

        {/* ========================= PANEL IZQUIERDO ========================= */}
        <div
          className={`
            w-[350px]
            border-r
            overflow-y-auto
            p-4
            ${theme.card}
          `}
        >
          <ControlsPanel tab={tab} />
        </div>

        {/* ========================= PANEL DERECHO ========================= */}
        <div
          className="
            flex-1
            overflow-y-auto
            p-6
          "
        >
          <PreviewPanel tab={tab} />
        </div>

      </div>
    </div>
  );
}
