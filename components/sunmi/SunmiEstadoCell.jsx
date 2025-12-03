"use client";

import SunmiBadgeEstado from "./SunmiBadgeEstado";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiEstadoCell({ value }) {
  const { ui } = useUIConfig();

  return (
    <div
      className="flex justify-center"
      style={{ transform: `scale(${ui.scale})` }}
    >
      <SunmiBadgeEstado value={value} />
    </div>
  );
}
