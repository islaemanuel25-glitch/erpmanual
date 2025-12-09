"use client";

import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

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
  const { ui } = useUIConfig();

  return (
    <div
      className="bg-slate-900 border border-slate-800 shadow-md overflow-hidden"
      style={{
        borderRadius: ui.helpers.radius("xl"),
        fontSize: ui.helpers.font("xs"),
      }}
    >
      {/* HEADER */}
      <div
        className="bg-[#FACC15] text-slate-900 flex items-center justify-between shadow-[0_0_12px_rgba(250,204,21,0.45)]"
        style={{
          paddingLeft: ui.helpers.spacing("lg"),
          paddingRight: ui.helpers.spacing("lg"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
        }}
      >
        <span
          className="font-bold uppercase tracking-wide"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
          Productos sugeridos
        </span>

        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <span className="opacity-80">Mostrar:</span>

          <SunmiSelectAdv
            value={pageSize}
            onChange={(v) => onPageSizeChange(Number(v))}
            style={{
              width: parseInt(ui.helpers.controlHeight()) * 2.5,
            }}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <SunmiSelectOption key={n} value={n}>
                {n}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>

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

          <span
            style={{
              fontSize: ui.helpers.font("xs"),
            }}
          >
            {page} / {totalPages}
          </span>

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

      {/* FILTROS */}
      <div
        className="bg-slate-900 border-b border-slate-800 flex flex-wrap"
        style={{
          paddingLeft: ui.helpers.spacing("md"),
          paddingRight: ui.helpers.spacing("md"),
          paddingTop: ui.helpers.spacing("sm"),
          paddingBottom: ui.helpers.spacing("sm"),
          gap: ui.helpers.spacing("lg"),
        }}
      >
        {/* CATEGORÍAS */}
        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <span className="text-slate-400">Categorías</span>

          <SunmiSelectAdv
            value={categoriaSeleccionada}
            onChange={(v) => onChangeCategoria?.(v)}
            style={{
              width: parseInt(ui.helpers.controlHeight()) * 4,
            }}
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
        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <span className="text-slate-400">Áreas</span>

          <SunmiSelectAdv
            value={areaSeleccionada}
            onChange={(v) => onChangeArea?.(v)}
            style={{
              width: parseInt(ui.helpers.controlHeight()) * 4,
            }}
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
          <span
            className="ml-auto text-slate-500 animate-pulse"
            style={{
              fontSize: ui.helpers.font("xs"),
            }}
          >
            Cargando sugeridos...
          </span>
        )}
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
                className="text-left"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                Código
              </th>
              <th
                className="text-left"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                Presentación
              </th>
              <th
                className="text-right"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                Sugerido (bultos)
              </th>
              <th
                className="text-center"
                style={{
                  paddingLeft: ui.helpers.spacing("sm"),
                  paddingRight: ui.helpers.spacing("sm"),
                  paddingTop: ui.helpers.spacing("sm"),
                  paddingBottom: ui.helpers.spacing("sm"),
                }}
              >
                Acción
              </th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-center text-slate-500"
                  style={{
                    paddingLeft: ui.helpers.spacing("md"),
                    paddingRight: ui.helpers.spacing("md"),
                    paddingTop: parseInt(ui.helpers.spacing("lg")) * 1.5,
                    paddingBottom: parseInt(ui.helpers.spacing("lg")) * 1.5,
                    fontSize: ui.helpers.font("xs"),
                  }}
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
                      <span className="text-slate-100 font-medium">
                        {p.productoNombre}
                      </span>
                      <span
                        className="text-slate-500"
                        style={{
                          fontSize: ui.helpers.font("xs"),
                        }}
                      >
                        {p.categoriaNombre || "Sin categoría"} ·{" "}
                        {p.areaFisicaNombre || "Sin área"}
                      </span>
                      {factor > 1 && (
                        <span
                          className="text-slate-500"
                          style={{
                            fontSize: ui.helpers.font("xs"),
                          }}
                        >
                          Faltan aprox. {unidadesAprox} uds
                        </span>
                      )}
                    </div>
                  </td>

                  {/* CODIGO */}
                  <td
                    className="text-slate-400"
                    style={{
                      paddingLeft: ui.helpers.spacing("sm"),
                      paddingRight: ui.helpers.spacing("sm"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("xs"),
                    }}
                  >
                    {p.codigoBarra || "-"}
                  </td>

                  {/* PRESENTACIÓN */}
                  <td
                    className="text-slate-300"
                    style={{
                      paddingLeft: ui.helpers.spacing("sm"),
                      paddingRight: ui.helpers.spacing("sm"),
                      paddingTop: ui.helpers.spacing("sm"),
                      paddingBottom: ui.helpers.spacing("sm"),
                      fontSize: ui.helpers.font("xs"),
                    }}
                  >
                    {factor > 1
                      ? `${p.unidadMedida} x ${factor}`
                      : p.unidadMedida}
                  </td>

                  {/* INPUT SUGERIDO */}
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
                  <td className="text-center" style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("sm"),
                    paddingBottom: ui.helpers.spacing("sm"),
                  }}>
                    <button
                      onClick={() => onMarcarPreparado(p.productoLocalOrigenId)}
                      className="font-semibold bg-cyan-400 hover:bg-cyan-500 active:bg-cyan-600 text-slate-900 shadow-[0_0_8px_rgba(45,212,191,0.4)] active:scale-95 transition"
                      style={{
                        paddingLeft: ui.helpers.spacing("md"),
                        paddingRight: ui.helpers.spacing("md"),
                        paddingTop: ui.helpers.spacing("xs"),
                        paddingBottom: ui.helpers.spacing("xs"),
                        borderRadius: ui.helpers.radius("full"),
                        fontSize: ui.helpers.font("xs"),
                      }}
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
