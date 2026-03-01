"use client";

const PILL_MAP = {
  amber: "sunmi-badge-accent",
  cyan: "sunmi-pill-link",
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
