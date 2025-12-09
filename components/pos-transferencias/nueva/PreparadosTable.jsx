"use client";

import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
  const { ui } = useUIConfig();

  return (
    <div
      className="bg-slate-900 border border-slate-800 shadow-md overflow-hidden"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        fontSize: ui.helpers.font("xs"),
      }}
    >
      {/* CABECERA */}
      <div
        className="bg-[#22D3EE] text-slate-900 flex items-center justify-between shadow-[0_0_12px_rgba(34,211,238,0.45)]"
        style={{
          paddingLeft: ui.helpers.spacing("lg"),
          paddingRight: ui.helpers.spacing("lg"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        <span
          className="font-bold tracking-wide uppercase"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
          Preparados
        </span>

        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <span className="opacity-80">Mostrar:</span>
          <select
            className="bg-slate-900 text-slate-100 border border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            style={{
              borderRadius: ui.helpers.radius("lg"),
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
              fontSize: ui.helpers.font("xs"),
            }}
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <button
            className="bg-slate-900 text-slate-200 border border-slate-700 disabled:opacity-30 hover:bg-slate-800/60 active:scale-95 transition"
            style={{
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
              borderRadius: ui.helpers.radius("lg"),
            }}
            onClick={onPrev}
            disabled={page <= 1}
          >
            ←
          </button>

          <span>{page} / {totalPages}</span>

          <button
            className="bg-slate-900 text-slate-200 border border-slate-700 disabled:opacity-30 hover:bg-slate-800/60 active:scale-95 transition"
            style={{
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
              borderRadius: ui.helpers.radius("lg"),
            }}
            onClick={onNext}
            disabled={page >= totalPages}
          >
            →
          </button>
        </div>
      </div>

      {/* BUSCADOR */}
      <div
        className="border-b border-slate-800 bg-slate-900"
        style={{
          paddingLeft: ui.helpers.spacing("md"),
          paddingRight: ui.helpers.spacing("md"),
          paddingTop: ui.helpers.spacing("md"),
          paddingBottom: ui.helpers.spacing("md"),
        }}
      >
        {buscador}
      </div>

      {/* TABLA */}
      <div className="overflow-x-auto">
        <table
          className="w-full"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <thead className="bg-slate-900 border-b border-slate-800 text-slate-400">
            <tr>
              <th
                className="text-left"
                style={{
                  paddingLeft: ui.helpers.spacing("md"),
                  paddingRight: ui.helpers.spacing("md"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                Producto
              </th>
              <th
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  width: parseInt(ui.helpers.controlHeight()) * 2,
                }}
              >
                Tipo
              </th>
              <th
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  width: parseInt(ui.helpers.controlHeight()) * 2.5,
                }}
              >
                Stock Dep.
              </th>
              <th
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  width: parseInt(ui.helpers.controlHeight()) * 2.5,
                }}
              >
                Stock Local
              </th>
              <th
                className="text-right"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  width: parseInt(ui.helpers.controlHeight()) * 2.5,
                }}
              >
                Preparado (bultos)
              </th>
              <th
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                  width: parseInt(ui.helpers.controlHeight()) * 2,
                }}
              >
                Acción
              </th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="text-center text-slate-500"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: parseInt(ui.helpers.spacing("lg")) * 1.5,
                    paddingBottom: parseInt(ui.helpers.spacing("lg")) * 1.5,
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  No hay productos preparados.
                </td>
              </tr>
            )}

            {datos.map((p) => (
              <tr
                key={p.detalleId}
                className="border-t border-slate-800 hover:bg-slate-800/60 transition"
              >
                {/* PRODUCTO */}
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                  }}
                >
                  <div className="flex flex-col">
                    <span
                      className="font-medium text-slate-100"
                      style={{
                        fontSize: ui.helpers.font("xs"),
                      }}
                    >
                      {p.productoNombre}
                    </span>
                    <span
                      className="text-slate-500"
                      style={{
                        fontSize: ui.helpers.font("xs"),
                      }}
                    >
                      {p.codigoBarra || "Sin código"}
                    </span>
                  </div>
                </td>

                {/* TIPO */}
                <td
                  className="text-center text-slate-300"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  {p.tipo === "manual" ? (
                    <span className="text-cyan-400 font-semibold">Manual</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">Sug.</span>
                  )}
                </td>

                {/* STOCK DEPÓSITO */}
                <td
                  className="text-center text-slate-300"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  {p.stockActual}
                </td>

                {/* STOCK LOCAL */}
                <td
                  className="text-center text-slate-300"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                    fontSize: ui.helpers.font("xs"),
                  }}
                >
                  {p.cantidadReal}
                </td>

                {/* INPUT PREPARADO (BULTOS) */}
                <td className="text-right" style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="bg-slate-900 border border-slate-700 text-right text-cyan-300 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition"
                    style={{
                      width: parseInt(ui.helpers.controlHeight()) * 2.5,
                      borderRadius: ui.helpers.radius("lg"),
                      paddingLeft: ui.helpers.spacing("sm"),
                      paddingRight: ui.helpers.spacing("sm"),
                      paddingTop: ui.helpers.spacing("xs"),
                      paddingBottom: ui.helpers.spacing("xs"),
                      fontSize: ui.helpers.font("xs"),
                    }}
                    value={p.preparado}
                    onChange={(e) =>
                      onEditPreparado(p.detalleId, Number(e.target.value))
                    }
                  />
                </td>

                {/* BTN QUITAR */}
                <td className="text-center" style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}>
                  <button
                    onClick={() => onDesmarcar(p.detalleId)}
                    className="font-semibold bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-[0_0_8px_rgba(255,0,0,0.45)] active:scale-95 transition"
                    style={{
                      paddingLeft: ui.helpers.spacing("md"),
                      paddingRight: ui.helpers.spacing("md"),
                      paddingTop: ui.helpers.spacing("xs"),
                      paddingBottom: ui.helpers.spacing("xs"),
                      borderRadius: ui.helpers.radius("full"),
                      fontSize: ui.helpers.font("xs"),
                    }}
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
