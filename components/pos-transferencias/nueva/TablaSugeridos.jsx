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
      className="border shadow-md overflow-hidden"
      style={{
        backgroundColor: "var(--sunmi-card-bg)",
        borderColor: "var(--sunmi-card-border)",
        borderWidth: "1px",
      }}
      style={{
        borderRadius: ui.helpers.radius("xl"),
        fontSize: ui.helpers.font("xs"),
      }}
    >
      {/* HEADER */}
      <div
        className="flex items-center justify-between"
        style={{
          backgroundColor: "#FACC15", // amarillo Sunmi
          color: "#0f172a", // slate-900
          boxShadow: "0 0 12px rgba(250,204,21,0.45)",
        }}
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
            className="border disabled:opacity-30 active:scale-95 transition"
            style={{
              backgroundColor: "var(--sunmi-card-bg)",
              color: "var(--sunmi-text)",
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.filter = "brightness(1.15)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
            }}
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
            className="border disabled:opacity-30 active:scale-95 transition"
            style={{
              backgroundColor: "var(--sunmi-card-bg)",
              color: "var(--sunmi-text)",
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
              paddingLeft: ui.helpers.spacing("sm"),
              paddingRight: ui.helpers.spacing("sm"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
              borderRadius: ui.helpers.radius("lg"),
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.filter = "brightness(1.15)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
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
        className="border-b flex flex-wrap"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          borderBottomColor: "var(--sunmi-card-border)",
          borderBottomWidth: "1px",
        }}
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
          <span
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
          >
            Categorías
          </span>

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
          <span
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
          >
            Áreas
          </span>

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
            className="ml-auto animate-pulse"
            style={{
              color: "var(--sunmi-text)",
              opacity: 0.6,
            }}
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
          <thead
            className="border-b"
            style={{
              backgroundColor: "var(--sunmi-table-header-bg)",
              borderBottomColor: "var(--sunmi-card-border)",
              borderBottomWidth: "1px",
              color: "var(--sunmi-text)",
              opacity: 0.7,
            }}
          >
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
                  className="text-center"
                  style={{
                    color: "var(--sunmi-text)",
                    opacity: 0.6,
                  }}
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
                  className="border-t transition"
                  style={{
                    borderTopColor: "var(--sunmi-card-border)",
                    borderTopWidth: "1px",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--sunmi-table-row-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
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
                        className="font-medium"
                        style={{
                          color: "var(--sunmi-text)",
                        }}
                      >
                        {p.productoNombre}
                      </span>
                      <span
                        style={{
                          color: "var(--sunmi-text)",
                          opacity: 0.6,
                          fontSize: ui.helpers.font("xs"),
                        }}
                      >
                        {p.categoriaNombre || "Sin categoría"} ·{" "}
                        {p.areaFisicaNombre || "Sin área"}
                      </span>
                      {factor > 1 && (
                        <span
                          style={{
                            color: "var(--sunmi-text)",
                            opacity: 0.6,
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
                    style={{
                      color: "var(--sunmi-text)",
                      opacity: 0.7,
                    }}
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
                    style={{
                      color: "var(--sunmi-text)",
                      opacity: 0.8,
                    }}
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
                      className="border text-right transition"
                      style={{
                        backgroundColor: "var(--sunmi-card-bg)",
                        borderColor: "var(--sunmi-card-border)",
                        borderWidth: "1px",
                        color: "#67e8f9", // cyan-300
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = "#22d3ee"; // cyan-400
                        e.target.style.boxShadow = "0 0 0 1px rgba(34,211,238,0.3)";
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "var(--sunmi-card-border)";
                        e.target.style.boxShadow = "none";
                      }}
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
                      className="font-semibold active:scale-95 transition"
                      style={{
                        backgroundColor: "#22d3ee", // cyan-400
                        color: "#0f172a", // slate-900
                        boxShadow: "0 0 8px rgba(45,212,191,0.4)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#06b6d4"; // cyan-500
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#22d3ee"; // cyan-400
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.backgroundColor = "#0891b2"; // cyan-600
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.backgroundColor = "#22d3ee"; // cyan-400
                      }}
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
