"use client";

export default function SunmiGrid({
  children,
  className = "",
  minWidth = 260, // ancho mínimo de cada card
  gap = 16,
}) {
  // Usamos CSS grid auto-fill con minmax
  const style = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
    gap: `${gap}px`,
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
