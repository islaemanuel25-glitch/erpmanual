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
      {/* CABECERA */}
      <div
        className="flex items-center justify-between"
        style={{
          backgroundColor: "#22D3EE", // cyan-400
          color: "#0f172a", // slate-900
          boxShadow: "0 0 12px rgba(34,211,238,0.45)",
        }}
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
            className="border"
            style={{
              backgroundColor: "var(--sunmi-card-bg)",
              color: "var(--sunmi-text)",
              borderColor: "var(--sunmi-card-border)",
              borderWidth: "1px",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#06b6d4"; // cyan-500
              e.target.style.boxShadow = "0 0 0 1px rgba(6,182,212,0.3)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--sunmi-card-border)";
              e.target.style.boxShadow = "none";
            }}
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

          <span>{page} / {totalPages}</span>

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

      {/* BUSCADOR */}
      <div
        className="border-b"
        style={{
          backgroundColor: "var(--sunmi-card-bg)",
          borderBottomColor: "var(--sunmi-card-border)",
          borderBottomWidth: "1px",
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
                  No hay productos preparados.
                </td>
              </tr>
            )}

            {datos.map((p) => (
              <tr
                key={p.detalleId}
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
                      style={{
                        fontSize: ui.helpers.font("xs"),
                      }}
                    >
                      {p.productoNombre}
                    </span>
                    <span
                      style={{
                        color: "var(--sunmi-text)",
                        opacity: 0.6,
                      }}
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
                  className="text-center"
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
                  {p.tipo === "manual" ? (
                    <span
                      className="font-semibold"
                      style={{
                        color: "#22d3ee", // cyan-400
                      }}
                    >
                      Manual
                    </span>
                  ) : (
                    <span
                      className="font-semibold"
                      style={{
                        color: "#fbbf24", // amber-400
                      }}
                    >
                      Sug.
                    </span>
                  )}
                </td>

                {/* STOCK DEPÓSITO */}
                <td
                  className="text-center"
                  style={{
                    color: "var(--sunmi-text)",
                    opacity: 0.8,
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
                  className="text-center"
                  style={{
                    color: "var(--sunmi-text)",
                    opacity: 0.8,
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
                    className="font-semibold active:scale-95 transition"
                    style={{
                      backgroundColor: "#ef4444", // red-500
                      color: "#ffffff", // white
                      boxShadow: "0 0 8px rgba(255,0,0,0.45)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#dc2626"; // red-600
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#ef4444"; // red-500
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.backgroundColor = "#b91c1c"; // red-700
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.backgroundColor = "#ef4444"; // red-500
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
