"use client";

export default function PreparadosTable({
  datos = [],
  onDesmarcar,
  onEditPreparado,
  page,
  totalPages,
  onPrev,
  onNext,
  pageSize,
  onPageSizeChange,
  buscador,
}) {
  return (
    <div
      className="
        rounded-2xl 
        bg-slate-900 
        border border-slate-800 
        shadow-md
        overflow-hidden
        text-[12px]
      "
    >
      {/* =============================== */}
      {/* 🟦 CABECERA CELESTE SUNMI */}
      {/* =============================== */}
      <div
        className="
          bg-[#22D3EE]
          text-slate-900 
          px-4 py-2
          flex items-center justify-between
          shadow-[0_0_12px_rgba(34,211,238,0.45)]
        "
      >
        <span className="font-bold text-xs tracking-wide uppercase">
          Preparados
        </span>

        <div className="flex items-center gap-2 text-[11px]">

          {/* PAGE SIZE */}
          <span className="opacity-80">Mostrar:</span>
          <select
            className="
              bg-slate-900 text-slate-100 
              border border-slate-700 
              rounded-lg px-2 py-1 text-[11px]
              focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500
            "
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          {/* BTN PREV */}
          <button
            className="
              px-2 py-1 rounded-lg
              bg-slate-900 text-slate-200 
              border border-slate-700 
              disabled:opacity-30
              hover:bg-slate-800/60 
              active:scale-95 
              transition
            "
            onClick={onPrev}
            disabled={page <= 1}
          >
            ←
          </button>

          <span>{page} / {totalPages}</span>

          {/* BTN NEXT */}
          <button
            className="
              px-2 py-1 rounded-lg
              bg-slate-900 text-slate-200 
              border border-slate-700 
              disabled:opacity-30
              hover:bg-slate-800/60 
              active:scale-95 
              transition
            "
            onClick={onNext}
            disabled={page >= totalPages}
          >
            →
          </button>
        </div>
      </div>

      {/* =============================== */}
      {/* 🔍 BUSCADOR MANUAL CELESTE */}
      {/* =============================== */}
      <div
        className="
          border-b border-slate-800 
          bg-slate-900 
          px-3 py-3
        "
      >
        {buscador}
      </div>

      {/* =============================== */}
      {/* TABLA */}
      {/* =============================== */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead
            className="
              bg-slate-900 
              border-b border-slate-800 
              text-slate-400
            "
          >
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-center w-[70px]">Tipo</th>
              <th className="px-2 py-2 text-center w-[80px]">Stock Dep.</th>
              <th className="px-2 py-2 text-center w-[80px]">Stock Local</th>
              <th className="px-2 py-2 text-right w-[80px]">Preparado</th>
              <th className="px-2 py-2 text-center w-[70px]">Acción</th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-slate-500 text-[11px]"
                >
                  No hay productos preparados.
                </td>
              </tr>
            )}

            {datos.map((p) => (
              <tr
                key={p.detalleId}
                className="
                  border-t border-slate-800 
                  hover:bg-slate-800/60
                  transition
                "
              >
                {/* PRODUCTO */}
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-100 text-[12px]">
                      {p.productoNombre}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {p.codigoBarra || "Sin código"}
                    </span>
                  </div>
                </td>

                {/* TIPO */}
                <td className="px-2 py-2 text-center text-[11px] text-slate-300">
                  {p.tipo === "manual" ? (
                    <span className="text-cyan-400 font-semibold">Manual</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Sug.</span>
                  )}
                </td>

                {/* STOCK DEPÓSITO */}
                <td className="px-2 py-2 text-center text-[11px] text-slate-300">
                  {p.stockActual}
                </td>

                {/* STOCK LOCAL */}
                <td className="px-2 py-2 text-center text-[11px] text-slate-300">
                  {p.cantidadReal}
                </td>

                {/* INPUT PREPARADO */}
                <td className="px-2 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    className="
                      w-[80px]
                      bg-slate-900
                      border border-slate-700 
                      rounded-lg px-2 py-1 
                      text-right text-[12px]
                      text-cyan-300
                      focus:border-cyan-400 
                      focus:ring-1 focus:ring-cyan-400
                      transition
                    "
                    value={p.preparado}
                    onChange={(e) =>
                      onEditPreparado(p.detalleId, Number(e.target.value))
                    }
                  />
                </td>

                {/* BTN QUITAR */}
                <td className="px-2 py-2 text-center">
                  <button
                    onClick={() => onDesmarcar(p.detalleId)}
                    className="
                      px-3 py-1 rounded-full 
                      text-[11px] font-semibold
                      bg-red-500 
                      hover:bg-red-600 
                      active:bg-red-700
                      text-white 
                      shadow-[0_0_8px_rgba(255,0,0,0.45)]
                      active:scale-95 
                      transition
                    "
                  >
                    Quitar
                  </button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
