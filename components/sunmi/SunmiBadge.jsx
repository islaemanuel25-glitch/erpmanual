"use client";

export default function SunmiBadge({ label = "", color = "amber" }) {
  const colors = {
    amber:  "bg-amber-400 text-slate-900",
    green:  "bg-green-400 text-slate-900",
    red:    "bg-red-400 text-white",
    blue:   "bg-blue-400 text-slate-900",
    cyan:   "bg-cyan-400 text-slate-900",
    gray:   "bg-slate-600 text-white",
  };

  return (
    <span
      className={`px-2 py-[2px] rounded-md text-[11px] font-semibold tracking-wide ${
        colors[color] || colors.amber
      }`}
    >
      {label}
    </span>
  );
}
