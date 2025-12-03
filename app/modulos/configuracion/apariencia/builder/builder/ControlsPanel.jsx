"use client";

import { cn } from "@/lib/utils";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";

import Fuentes from "../tabs/Fuentes";
import Bordes from "../tabs/Bordes";
import Densidad from "../tabs/Densidad";
import Sombras from "../tabs/Sombras";
import Spacing from "../tabs/Spacing";
import Animaciones from "../tabs/Animaciones";

export default function ControlsPanel({ tab }) {
  const { theme } = useSunmiTheme();

  return (
    <div
      className={cn(
        "rounded-xl p-4",
        theme.card
      )}
    >
      {tab === "fuentes" && <Fuentes />}
      {tab === "bordes" && <Bordes />}
      {tab === "densidad" && <Densidad />}
      {tab === "sombras" && <Sombras />}
      {tab === "spacing" && <Spacing />}
      {tab === "animaciones" && <Animaciones />}
    </div>
  );
}
