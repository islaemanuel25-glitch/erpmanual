"use client";

import SunmiBadgeEstado from "./SunmiBadgeEstado";
import { useUIConfig } from "@/components/providers/UIConfigProvider";
import { useSunmiAnimation } from "./useSunmiAnimation";

export default function SunmiEstadoCell({ value }) {
  const { ui } = useUIConfig();
  const { fade } = useSunmiAnimation();

  return (
    <div
      className="flex justify-center"
      style={{
        transform: `scale(${ui.scale})`,
        animation: `fadeAnim ${fade.duration}ms ease`,
      }}
    >
      <style>
        {`
        @keyframes fadeAnim {
          from { opacity: ${fade.from}; }
          to { opacity: 1; }
        }
        `}
      </style>

      <SunmiBadgeEstado value={value} />
    </div>
  );
}
