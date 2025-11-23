"use client";

import { useEffect, useState } from "react";

const PAGE_SIZE = 25;

export default function TablaStock({
  localSeleccionado,
  localNombre,
  filtro,
  page,
  setPage,
  refrescar,
  setRefrescar,
  onAjustar,
  onEditarLimites,
}) {
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

    if (!u || u === "unidad") {
      return p.factorPack > 1 ? `Pack x${p.factorPack}` : "Unidad";
    }

    if (u === "cajon") return p.factorPack > 1 ? `Cajón x${p.factorPack}` : "Cajón";
    if (u === "pack") return p.factorPack > 1 ? `Pack x${p.factorPack}` : "Pack";
    if (u === "kg") return "Kg";
    if (u === "lt") return "Litro";

    return u.charAt(0).toUpperCase() + u.slice(1);
  };

  if (!localSeleccionado) {
    return (
      <div className="sunmi-card">
        <div className="sunmi-header-cyan">Stock</div>
        <p className="text-slate-400 text-sm mt-3">
          Seleccioná un local para ver el stock.
        </p>
      </div>
    );
  }

  return (
    <div className="sunmi-card">
      <div className="sunmi-header-cyan">Stock del Local</div>

      {loading && (
        <p className="text-slate-400 text-[13px] mt-3">Cargando stock...</p>
      )}
      {error && (
        <p className="text-red-400 text-[13px] mt-3">{error}</p>
      )}

      <div className="overflow-x-auto mt-3">
        <table className="min-w-full text-[12px] sunmi-table">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left">Producto</th>
              <th className="px-2 py-1 text-left">Código</th>
              <th className="px-2 py-1 text-left">Unidad</th>
              <th className="px-2 py-1 text-right">Stock</th>
              <th className="px-2 py-1 text-right">Mín</th>
              <th className="px-2 py-1 text-right">Máx</th>
              <th className="px-2 py-1 text-right">Costo</th>
              <th className="px-2 py-1 text-right">Venta</th>
              <th className="px-2 py-1 text-center">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-center text-slate-500">
                  No hay productos para mostrar.
                </td>
              </tr>
            )}

            {items.map((p) => (
              <tr key={p.id} className="hover:bg-slate-800/40">
                <td className="px-2 py-1">{p.nombre}</td>
                <td className="px-2 py-1">{p.codigoBarra || "-"}</td>
                <td className="px-2 py-1">{getUnidad(p)}</td>
                <td className="px-2 py-1 text-right">{p.stock}</td>
                <td className="px-2 py-1 text-right">{p.stockMin}</td>
                <td className="px-2 py-1 text-right">{p.stockMax}</td>
                <td className="px-2 py-1 text-right">
                  {Number(p.precioCosto || 0).toFixed(2)}
                </td>
                <td className="px-2 py-1 text-right">
                  {Number(p.precioVenta || 0).toFixed(2)}
                </td>

                <td className="px-2 py-1 text-center">
                  <div className="flex justify-center gap-1">
                    <button
                      className="sunmi-btn sunmi-btn-cyan text-[11px] px-2 py-1"
                      onClick={() => onAjustar(p)}
                    >
                      Ajustar
                    </button>

                    <button
                      className="sunmi-btn sunmi-btn-amber text-[11px] px-2 py-1"
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
      <div className="flex items-center justify-between mt-4 text-[12px] text-slate-400">
        <div>
          Total: <strong className="text-slate-200">{total}</strong> productos
        </div>

        <div className="flex items-center gap-2">
          <button
            className="sunmi-btn bg-slate-800 text-slate-200 disabled:opacity-40 px-3 py-1"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ◀
          </button>

          <span className="text-slate-300">
            Página {page} de {totalPages}
          </span>

          <button
            className="sunmi-btn bg-slate-800 text-slate-200 disabled:opacity-40 px-3 py-1"
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
