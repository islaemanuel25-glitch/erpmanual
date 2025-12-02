"use client";

export default function LayoutPreview({ type = "left", active = false }) {
  const commonBox = "rounded-md bg-slate-800";
  const activeRing = active ? "ring-2 ring-amber-400" : "";

  return (
    <div
      className={`
        w-full h-28 
        border border-slate-700 
        rounded-lg p-2 
        flex flex-col gap-2 
        bg-slate-900 
        ${activeRing}
      `}
    >
      {/* TOP BAR (solo para sidebar-top) */}
      {type === "top" && (
        <div className="h-4 bg-slate-700 rounded-md" />
      )}

      <div className="flex flex-1 gap-2">
        {/* LEFT SIDEBAR */}
        {type === "left" && (
          <div className="w-6 bg-slate-700 rounded-md" />
        )}

        {/* NO SIDEBAR (hidden) */}
        {type === "hidden" && (
          <div className="w-0" />
        )}

        {/* MAIN AREA */}
        <div className="flex-1 bg-slate-800/60 rounded-md" />
      </div>
    </div>
  );
}
