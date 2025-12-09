"use client";

import { useEffect, useState } from "react";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const PAGE_SIZE = 25;

export default function TablaStock({
  localSeleccionado,
  localNombre,
  localEsDeposito,
  filtro,
  page,
  setPage,
  refrescar,
  setRefrescar,
  onAjustar,
  onEditarLimites,
}) {
  const { ui } = useUIConfig();
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildQuery = () => {
    const params = new URLSearchParams();
    params.set("page", page);
    params.set("localId", localSeleccionado);

    if (filtro.q) params.set("q", filtro.q);
    if (filtro.categoria) params.set("categoria", filtro.categoria);
    if (filtro.proveedor) params.set("proveedor", filtro.proveedor);
    if (filtro.area) params.set("area", filtro.area);

    if (filtro.conStock) params.set("conStock", "true");
    if (filtro.sinStock) params.set("sinStock", "true");
    if (filtro.faltantes) params.set("faltantes", "true");

    return params.toString();
  };

  useEffect(() => {
    if (!localSeleccionado) {
      setItems([]);
      setTotal(0);
      setTotalPages(1);
      return;
    }

    let cancelado = false;
    const debeLimpiar = refrescar;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError("");

        const qs = buildQuery();
        const res = await fetch(`/api/stock_locales/listar?${qs}`, {
          cache: "no-store",
        });

        const json = await res.json();
        if (!json.ok) {
          if (!cancelado) {
            setError(json.error || "Error cargando stock.");
            setItems([]);
            setTotal(0);
            setTotalPages(1);
          }
          return;
        }

        if (!cancelado) {
          setItems(json.items || []);
          setTotal(json.total || 0);
          setTotalPages(json.totalPages || 1);
        }
      } catch (err) {
        console.error("Error cargando stock:", err);
        if (!cancelado) setError("Error interno al cargar stock.");
      } finally {
        if (!cancelado) {
          setLoading(false);
          if (debeLimpiar) setRefrescar(false);
        }
      }
    };

    fetchData();
    return () => (cancelado = true);
  }, [localSeleccionado, JSON.stringify(filtro), page, refrescar]);

  const getUnidad = (p) => {
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);

    if (!u || u === "unidad") {
      return f > 1 ? `Pack x${f}` : "Unidad";
    }

    if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
    if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
    if (u === "kg") return "Kg";
    if (u === "lt") return "Litro";

    return u.charAt(0).toUpperCase() + u.slice(1);
  };

  // ============================================
  // ACÁ EMPIEZA EL COMPONENTE VISUAL (NO CAMBIADO)
  // ============================================

  if (!localSeleccionado) {
    return (
      <div className="sunmi-card">
        <div className="sunmi-header-cyan">Stock</div>
        <p
          className="text-slate-400"
          style={{
            fontSize: ui.helpers.font("sm"),
            marginTop: ui.helpers.spacing("md"),
          }}
        >
          Seleccioná un local para ver el stock.
        </p>
      </div>
    );
  }

  return (
    <div className="sunmi-card">
      <div className="sunmi-header-cyan">Stock del Local</div>

      {loading && (
        <p
          className="text-slate-400"
          style={{
            fontSize: ui.helpers.font("sm"),
            marginTop: ui.helpers.spacing("md"),
          }}
        >
          Cargando stock...
        </p>
      )}
      {error && (
        <p
          className="text-red-400"
          style={{
            fontSize: ui.helpers.font("sm"),
            marginTop: ui.helpers.spacing("md"),
          }}
        >
          {error}
        </p>
      )}

      <div
        className="overflow-x-auto"
        style={{
          marginTop: ui.helpers.spacing("md"),
        }}
      >
        <table
          className="min-w-full sunmi-table"
          style={{
            fontSize: ui.helpers.font("xs"),
          }}
        >
          <thead>
            <tr>
              {[
                "Producto",
                "Código",
                "Unidad",
                "Stock",
                "Mín",
                "Máx",
                "Costo",
                "Venta",
                "Acciones",
              ].map((h) => (
                <th
                  key={h}
                  className="text-left"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={9}
                  className="text-center text-slate-500"
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("md"),
                    paddingBottom: ui.helpers.spacing("md"),
                  }}
                >
                  No hay productos para mostrar.
                </td>
              </tr>
            )}

            {items.map((p) => (
              <tr key={p.id} className="hover:bg-slate-800/40">
                {/* PRODUCTO */}
                <td
                  style={{
                    paddingLeft: ui.helpers.spacing("sm"),
                    paddingRight: ui.helpers.spacing("sm"),
                    paddingTop: ui.helpers.spacing("xs"),
                    paddingBottom: ui.helpers.spacing("xs"),
                  }}
                >
                  {p.nombre}
                </td>

                {/* CÓDIGO */}
                <td style={{ padding: ui.helpers.spacing("xs") }}>
                  {p.codigoBarra || "-"}
                </td>

                {/* UNIDAD */}
                <td style={{ padding: ui.helpers.spacing("xs") }}>
                  {getUnidad(p)}
                </td>

                {/* STOCK */}
                <td className="text-right" style={{ padding: ui.helpers.spacing("xs") }}>
                  {p.stock}
                </td>

                {/* MIN */}
                <td className="text-right" style={{ padding: ui.helpers.spacing("xs") }}>
                  {p.stockMin}
                </td>

                {/* MAX */}
                <td className="text-right" style={{ padding: ui.helpers.spacing("xs") }}>
                  {p.stockMax}
                </td>

                {/* COSTO */}
                <td className="text-right" style={{ padding: ui.helpers.spacing("xs") }}>
                  {localEsDeposito
                    ? `$ ${Number(p.precioCosto || 0).toFixed(2)}`
                    : `$ ${Number(p.precioUnitario || 0).toFixed(2)}`}
                </td>

                {/* PRECIO VENTA */}
                <td className="text-right" style={{ padding: ui.helpers.spacing("xs") }}>
                  {localEsDeposito
                    ? `$ ${Number(p.precioVenta || 0).toFixed(2)}`
                    : `$ ${Number(
                        p.precioVentaUnitario || p.precioVenta || 0
                      ).toFixed(2)}`}
                </td>

                {/* ACCIONES */}
                <td className="text-center" style={{ padding: ui.helpers.spacing("xs") }}>
                  <div
                    className="flex justify-center"
                    style={{
                      gap: ui.helpers.spacing("xs"),
                    }}
                  >
                    <button
                      className="sunmi-btn sunmi-btn-cyan"
                      style={{
                        fontSize: ui.helpers.font("xs"),
                        paddingLeft: ui.helpers.spacing("sm"),
                        paddingRight: ui.helpers.spacing("sm"),
                        paddingTop: ui.helpers.spacing("xs"),
                        paddingBottom: ui.helpers.spacing("xs"),
                      }}
                      onClick={() => onAjustar(p)}
                    >
                      Ajustar
                    </button>

                    <button
                      className="sunmi-btn sunmi-btn-amber"
                      style={{
                        fontSize: ui.helpers.font("xs"),
                        paddingLeft: ui.helpers.spacing("sm"),
                        paddingRight: ui.helpers.spacing("sm"),
                        paddingTop: ui.helpers.spacing("xs"),
                        paddingBottom: ui.helpers.spacing("xs"),
                      }}
                      onClick={() => onEditarLimites(p)}
                    >
                      Límites
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      <div
        className="flex items-center justify-between text-slate-400"
        style={{
          marginTop: ui.helpers.spacing("lg"),
          fontSize: ui.helpers.font("xs"),
        }}
      >
        <div>
          Total: <strong className="text-slate-200">{total}</strong> productos
        </div>

        <div
          className="flex items-center"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
          <button
            className="sunmi-btn bg-slate-800 text-slate-200 disabled:opacity-40"
            style={{
              paddingLeft: ui.helpers.spacing("md"),
              paddingRight: ui.helpers.spacing("md"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
            }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ◀
          </button>

          <span className="text-slate-300">
            Página {page} de {totalPages}
          </span>

          <button
            className="sunmi-btn bg-slate-800 text-slate-200 disabled:opacity-40"
            style={{
              paddingLeft: ui.helpers.spacing("md"),
              paddingRight: ui.helpers.spacing("md"),
              paddingTop: ui.helpers.spacing("xs"),
              paddingBottom: ui.helpers.spacing("xs"),
            }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
