"use client";

export default function OptionCard({ label, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-3 rounded-lg border text-left transition
        ${active ? "border-amber-400 bg-amber-400/10" : "border-slate-700 bg-slate-900"}
      `}
    >
      <span className={`text-sm font-medium ${active ? "text-amber-300" : "text-slate-200"}`}>
        {label}
      </span>
    </button>
  );
}
