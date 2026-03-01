"use client";

import { useEffect, useState } from "react";
import { fromUnidades } from "@/lib/conversiones/stock";

const PAGE_SIZE = 25;

function formatCantidad(valor, unidadMedida) {
  const n = Number(valor || 0);
  if (unidadMedida === "kg") return `${n.toFixed(3)} kg`;
  return `${Math.round(n)} uds`;
}

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

  // ¿Debe mostrarse como packs en depósito?
  const esPackDeposito = (p) => {
    if (!localEsDeposito) return false;
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);
    return f > 1 && (u === "pack" || u === "cajon");
  };

  // Unidad para DEPÓSITO: muestra unidad_medida + factor_pack
  const getUnidadDeposito = (p) => {
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

  // Unidad para LOCAL: siempre "Unidad" (o "Kg" si unidad_medida = kg)
  const getUnidadLocal = (p) => {
    const u = p.unidadMedida;
    if (u === "kg") return "Kg";
    return "Unidad";
  };

  // Presentación del depósito para mostrar en local (texto chico)
  const getPresentacionDeposito = (p) => {
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);

    if (f <= 1) return null;

    if (u === "pack") return `Pack x${f}`;
    if (u === "cajon") return `Cajón x${f}`;
    if (u === "unidad") return `Pack x${f}`;

    return null;
  };

  if (!localSeleccionado) {
    return (
      <p className="sunmi-text-muted text-sm py-4">
        No hay contexto operativo activo.
      </p>
    );
  }

  return (
    <div>
      {loading && (
        <p className="sunmi-text-muted text-[13px] mb-3">Cargando stock...</p>
      )}
      {error && <p className="sunmi-text-danger text-[13px] mb-3">{error}</p>}

      <div className="overflow-x-auto rounded-xl border sunmi-border">
        <table className="min-w-full text-[12px] sunmi-table">
          <thead className="sunmi-thead">
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
                <td
                  colSpan={9}
                  className="px-2 py-3 text-center sunmi-text-muted"
                >
                  No hay productos para mostrar.
                </td>
              </tr>
            )}

            {items.map((p) => {
              const presentacionDep = getPresentacionDeposito(p);
              return (
                <tr key={p.id} className="hover:bg-[var(--table-row-hover)]">
                  <td className="px-2 py-1">{p.nombre}</td>
                  <td className="px-2 py-1">{p.codigoBarra || "-"}</td>
                  <td className="px-2 py-1">
                    {localEsDeposito ? (
                      getUnidadDeposito(p)
                    ) : (
                      <div className="flex flex-col">
                        <span>{getUnidadLocal(p)}</span>
                        {presentacionDep && (
                          <span className="text-[10px] sunmi-text-muted">
                            Presentación dep: {presentacionDep}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                <td className="px-2 py-1 text-right">
                  {esPackDeposito(p) ? (
                    (() => {
                      const { bultos, sueltas } = fromUnidades({
                        unidades: Number(p.stock || 0),
                        factorPack: p.factorPack,
                      });
                      return (
                        <span>
                          {bultos > 0 && <strong>{bultos} bultos</strong>}
                          {bultos > 0 && sueltas > 0 && " + "}
                          {sueltas > 0 && `${sueltas} uds`}
                          {bultos === 0 && sueltas === 0 && "0"}
                        </span>
                      );
                    })()
                  ) : (
                    <span>{formatCantidad(p.stock, p.unidadMedida)}</span>
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  {esPackDeposito(p) && p.stockMin
                    ? fromUnidades({ unidades: Number(p.stockMin), factorPack: p.factorPack }).bultos
                    : p.stockMin != null ? formatCantidad(p.stockMin, p.unidadMedida) : "-"}
                </td>
                <td className="px-2 py-1 text-right">
                  {esPackDeposito(p) && p.stockMax
                    ? fromUnidades({ unidades: Number(p.stockMax), factorPack: p.factorPack }).bultos
                    : p.stockMax != null ? formatCantidad(p.stockMax, p.unidadMedida) : "-"}
                </td>

                <td className="px-2 py-1 text-right">
                  {localEsDeposito
                    ? `$ ${Number(p.precioCosto || 0).toFixed(2)}`
                    : `$ ${Number(p.precioUnitario || 0).toFixed(2)}`}
                </td>

                <td className="px-2 py-1 text-right">
                  {localEsDeposito
                    ? `$ ${Number(p.precioVenta || 0).toFixed(2)}`
                    : `$ ${Number(
                        p.precioVentaUnitario || p.precioVenta || 0
                      ).toFixed(2)}`}
                </td>

                <td className="px-2 py-1 text-center">
                  <div className="flex justify-center gap-1">
                    <button
                      className="sunmi-btn sunmi-btn-primary text-[11px] px-2 py-1"
                      onClick={() => onAjustar(p)}
                    >
                      Ajustar
                    </button>

                    <button
                      className="sunmi-btn sunmi-btn-secondary text-[11px] px-2 py-1"
                      onClick={() => onEditarLimites(p)}
                    >
                      Límites
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* PAGINACIÓN */}
      <div className="flex items-center justify-between mt-4 text-[12px] sunmi-text-muted">
        <div>
          Total: <strong className="sunmi-text-strong">{total}</strong> productos
        </div>

        <div className="flex items-center gap-2">
          <button
            className="sunmi-btn sunmi-control disabled:opacity-40 px-3 py-1"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            ◀
          </button>

          <span className="sunmi-text-strong">
            Página {page} de {totalPages}
          </span>

          <button
            className="sunmi-btn sunmi-control disabled:opacity-40 px-3 py-1"
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
