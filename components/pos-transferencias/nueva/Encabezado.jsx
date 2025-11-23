"use client";

export default function Encabezado({ origen, destino, me }) {
  return (
    <div
      className="
        bg-slate-900
        border border-slate-800
        rounded-2xl 
        p-4 
        shadow-md
        text-[12px]
        mb-4
      "
    >

      {/* =============================== */}
      {/* 🔶 TITULO POS */}
      {/* =============================== */}
      <div className="flex items-center justify-between mb-4">

        {/* ICONO POS */}
        <div className="flex items-center gap-3">
          <div
            className="
              h-11 w-11 
              rounded-2xl 
              bg-amber-400 
              flex items-center justify-center
              text-slate-900 font-black text-[13px]
              shadow-[0_0_10px_rgba(250,204,21,0.6)]
            "
          >
            POS
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Sesión de preparación
            </div>
            <div className="text-[15px] font-semibold text-slate-100">
              Transferencia de mercadería
            </div>
          </div>
        </div>

        {/* ESTADO */}
        <span
          className="
            px-3 py-1 
            text-[10px] font-semibold 
            rounded-full 
            bg-emerald-500/20 
            text-emerald-300 
            border border-emerald-400/40
          "
        >
          ● POS activa
        </span>
      </div>

      {/* =============================== */}
      {/* 🔶 ORIGEN → DESTINO */}
      {/* =============================== */}
      <div className="flex items-center justify-center mb-4">
        <span className="text-[13px] text-slate-100 font-semibold">
          {origen?.nombre || "-"}
        </span>

        <div className="mx-3 flex items-center">
          <div className="w-10 h-[2px] bg-amber-500/40 relative overflow-hidden rounded-full">
            <div className="absolute inset-0 bg-amber-400 animate-[pulseLine_1.4s_linear_infinite]"></div>
          </div>

          <span className="ml-2 text-amber-400 text-[16px]">→</span>
        </div>

        <span className="text-[13px] text-slate-100 font-semibold">
          {destino?.nombre || "-"}
        </span>
      </div>

      {/* =============================== */}
      {/* 🧊 TARJETAS RESUMEN */}
      {/* =============================== */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* ORIGEN */}
        <div
          className="
            bg-slate-800 
            rounded-xl 
            px-4 py-3 
            shadow-inner
            border border-slate-700
          "
        >
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Origen
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-amber-400 text-[13px]">🏬</span>
            <span className="text-[13px] text-slate-100 font-medium truncate">
              {origen?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* DESTINO */}
        <div
          className="
            bg-slate-800 
            rounded-xl 
            px-4 py-3 
            shadow-inner
            border border-slate-700
          "
        >
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Destino
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-amber-400 text-[13px]">📦</span>
            <span className="text-[13px] text-slate-100 font-medium truncate">
              {destino?.nombre || "-"}
            </span>
          </div>
        </div>

        {/* USUARIO */}
        <div
          className="
            bg-slate-800 
            rounded-xl 
            px-4 py-3 
            shadow-inner
            border border-slate-700
          "
        >
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Usuario
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-amber-400 text-[13px]">👤</span>
            <span className="text-[13px] text-slate-100 font-medium truncate">
              {me?.nombre || "Usuario"}
            </span>
          </div>
        </div>
      </div>

      {/* =============================== */}
      {/* ANIMACIONES */}
      {/* =============================== */}
      <style>{`
        @keyframes pulseLine {
          0% { transform: translateX(-100%); opacity: 0.3; }
          50% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
