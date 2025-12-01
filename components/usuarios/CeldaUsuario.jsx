"use client";

export default function CeldaUsuario({ nombre = "", email = "" }) {
  const inicial = nombre?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-sm font-bold">
        {inicial}
      </div>

      <div className="flex flex-col">
        <span className="font-medium">{nombre || "Sin nombre"}</span>
        <span className="text-xs text-slate-400">{email || "Sin email"}</span>
      </div>
    </div>
  );
}
