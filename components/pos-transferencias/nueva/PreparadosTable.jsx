"use client";

import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";

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
  loading = false,
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
      {/* CABECERA */}
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
          <span className="opacity-80">Mostrar:</span>
          <SunmiSelectAdv
            value={pageSize}
            onChange={(val) => onPageSizeChange(Number(val))}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </SunmiSelectAdv>

          <button
            className="
              px-2 py-1 rounded-lg
              bg-slate-900 text-slate-200 
              border border-slate-800 
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

          <button
            className="
              px-2 py-1 rounded-lg
              bg-slate-900 text-slate-200 
              border border-slate-800 
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

      {/* BUSCADOR */}
      <div
        className="
          border-b border-slate-800 
          bg-slate-900 
          px-3 py-3
        "
      >
        {buscador}
      </div>

      {/* TABLA */}
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
              <th className="px-2 py-2 text-right w-[80px]">
                Preparado (bultos)
              </th>
              <th className="px-2 py-2 text-center w-[70px]">Acción</th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && !loading && (
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
                    <span className="font-medium text-[12px]">
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

                {/* STOCK DEPÓSITO (unidades o bultos según tu lógica actual) */}
                <td className="px-2 py-2 text-center text-[11px] text-slate-300">
                  {p.stockActual}
                </td>

                {/* STOCK LOCAL (unidades) */}
                <td className="px-2 py-2 text-center text-[11px] text-slate-300">
                  {p.cantidadReal}
                </td>

                {/* INPUT PREPARADO CON SELECTOR DE UNIDAD */}
                <td className="px-2 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <SunmiInput
                      type="number"
                      min={0}
                      step={1}
                      value={p.preparado}
                      onChange={(e) =>
                        onEditPreparado(p.detalleId, Number(e.target.value), p.unidadPreparada || p.unidadSugerida || "BULTO")
                      }
                    />
                    {(p.modoEnvio === "MIXTO" && p.factorPack > 1) ? (
                      <SunmiSelectAdv
                        value={p.unidadPreparada || p.unidadSugerida || "BULTO"}
                        onChange={(val) =>
                          onEditPreparado(p.detalleId, p.preparado, val)
                        }
                      >
                        <option value="BULTO">bultos</option>
                        <option value="UNIDAD">uds</option>
                      </SunmiSelectAdv>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        {(p.unidadPreparada || p.unidadSugerida || "BULTO") === "BULTO" ? "bultos" : "uds"}
                      </span>
                    )}
                  </div>
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
