"use client";

import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

export default function TablaSugeridos({
  datos,
  page,
  totalPages,
  onPrev,
  onNext,
  pageSize,
  onPageSizeChange,
  onEditSugerido,
  onMarcarPreparado,
  loading = false,
  categorias = [],
  areas = [],
  categoriaSeleccionada = "todos",
  areaSeleccionada = "todos",
  onChangeCategoria,
  onChangeArea,
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
      {/* HEADER */}
      <div
        className="
          bg-[#FACC15]
          text-slate-900 
          px-4 py-2 
          flex items-center justify-between
          shadow-[0_0_12px_rgba(250,204,21,0.45)]
        "
      >
        <span className="font-bold text-xs uppercase tracking-wide">
          Productos sugeridos
        </span>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="opacity-80">Mostrar:</span>

          <SunmiSelectAdv
            value={pageSize}
            onChange={(v) => onPageSizeChange(Number(v))}
            className="w-[85px]"
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <SunmiSelectOption key={n} value={n}>
                {n}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>

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

          <span className="text-[11px]">
            {page} / {totalPages}
          </span>

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

      {/* FILTROS */}
      <div
        className="
          px-3 py-2 
          bg-slate-900 
          border-b border-slate-800 
          flex flex-wrap gap-4
        "
      >
        {/* CATEGORÍAS */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Categorías</span>

          <SunmiSelectAdv
            value={categoriaSeleccionada}
            onChange={(v) => onChangeCategoria?.(v)}
            className="w-[140px]"
          >
            <SunmiSelectOption value="todos">Todas</SunmiSelectOption>
            {categorias.map((c) => (
              <SunmiSelectOption key={c} value={c}>
                {c}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {/* AREAS */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Áreas</span>

          <SunmiSelectAdv
            value={areaSeleccionada}
            onChange={(v) => onChangeArea?.(v)}
            className="w-[140px]"
          >
            <SunmiSelectOption value="todos">Todas</SunmiSelectOption>
            {areas.map((a) => (
              <SunmiSelectOption key={a} value={a}>
                {a}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {loading && (
          <span className="ml-auto text-[11px] text-slate-500 animate-pulse">
            Cargando sugeridos...
          </span>
        )}
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
              <th className="px-2 py-2 text-left">Código</th>
              <th className="px-2 py-2 text-left">Presentación</th>
              <th className="px-2 py-2 text-right">Sugerido (bultos)</th>
              <th className="px-2 py-2 text-center">Acción</th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="
                    px-3 py-4 text-center 
                    text-slate-500 text-[11px]
                  "
                >
                  No hay productos sugeridos.
                </td>
              </tr>
            )}

            {datos.map((p) => {
              const factor = Number(p.factorPack || 1);
              const unidadesAprox =
                factor > 1 ? p.sugerido * factor : p.sugerido;

              return (
                <tr
                  key={p.productoLocalDestinoId}
                  className="
                    border-t border-slate-800
                    hover:bg-slate-800/60
                    transition
                  "
                >
                  {/* PRODUCTO */}
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-slate-100 font-medium">
                        {p.productoNombre}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {p.categoriaNombre || "Sin categoría"} ·{" "}
                        {p.areaFisicaNombre || "Sin área"}
                      </span>
                      {factor > 1 && (
                        <span className="text-[11px] text-slate-500">
                          Faltan aprox. {unidadesAprox} uds
                        </span>
                      )}
                    </div>
                  </td>

                  {/* CODIGO */}
                  <td className="px-2 py-2 text-[11px] text-slate-400">
                    {p.codigoBarra || "-"}
                  </td>

                  {/* PRESENTACIÓN */}
                  <td className="px-2 py-2 text-[11px] text-slate-300">
                    {factor > 1
                      ? `${p.unidadMedida} x ${factor}`
                      : p.unidadMedida}
                  </td>

                  {/* INPUT SUGERIDO */}
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className="
                        w-[80px]
                        bg-slate-900
                        border border-slate-700 
                        rounded-lg px-2 py-1 
                        text-right text-cyan-300
                        text-[12px]
                        focus:border-cyan-400 
                        focus:ring-1 focus:ring-cyan-400
                        transition
                      "
                      value={p.sugerido}
                      onChange={(e) =>
                        onEditSugerido(
                          p.productoLocalDestinoId,
                          Number(e.target.value)
                        )
                      }
                    />
                  </td>

                  {/* BOTÓN PREP. */}
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => onMarcarPreparado(p.productoLocalOrigenId)}
                      className="
                        px-3 py-1 rounded-full 
                        text-[11px] font-semibold
                        bg-cyan-400 
                        hover:bg-cyan-500 
                        active:bg-cyan-600
                        text-slate-900 
                        shadow-[0_0_8px_rgba(45,212,191,0.4)]
                        active:scale-95 transition
                      "
                    >
                      Prep.
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
