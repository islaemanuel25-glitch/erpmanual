"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

export default function SunmiGrid({
  children,
  className = "",
  minWidth = 260, // ancho mínimo de cada card
  gap = 16,
}) {
  const { ui } = useUIConfig();
  
  // Usamos CSS grid auto-fill con minmax
  // Si no se pasa minWidth, usar un valor basado en density
  const cardMinWidth = minWidth || ui.density * 7;
  const gridGap = gap || parseInt(ui.helpers.spacing("lg"));
  
  const style = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))`,
    gap: `${gridGap}px`,
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
