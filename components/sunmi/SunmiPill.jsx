"use client";

// ── `green` SE AGREGÓ, Y NO INVENTA NINGÚN COLOR ─────────────────────────
//
// `.sunmi-badge-success` ya existía en `styles/sunmi.css` y sale de
// `--pos-success`, que está definido en los catorce temas. Lo único que faltaba
// era poder pedirlo por nombre desde acá.
//
// Es aditivo: los tres colores de antes dicen exactamente lo mismo, así que
// ningún consumidor cambia. Se agregó porque la lista de ofertas necesita
// distinguir "está cobrando" de "hay algo que decidir", y con solo ámbar, cian y
// gris las dos cosas se pintaban igual.
const PILL_MAP = {
  amber: "sunmi-badge-accent",
  cyan: "sunmi-pill-link",
  green: "sunmi-badge-success",
  slate: "sunmi-badge-muted",
};

export default function SunmiPill({ children, color = "amber" }) {
  const cls = PILL_MAP[color] || PILL_MAP.amber;

  return (
    <span
      className={`
        inline-block
        px-1.5 py-[1px]
        rounded-md
        text-[10.5px]
        font-semibold
        ${cls}
        leading-none
        whitespace-nowrap
      `}
    >
      {children}
    </span>
  );
}
