"use client";

import { useEffect, useState, useRef } from "react";
import { fromUnidades, kgToPiezas } from "@/lib/conversiones/stock";
import { Settings2 } from "lucide-react";

const PAGE_SIZE = 25;
const LS_KEY = "stockColumnsVisible_v1";

// ── Definición de columnas ──────────────────────────────────────────────
const COLUMN_DEFS = [
  { key: "producto",   label: "Producto",   align: "left",   required: true },
  { key: "codigo",     label: "Código",     align: "left"   },
  { key: "unidad",     label: "Unidad",     align: "left"   },
  { key: "stock",      label: "Stock",      align: "right",  required: true },
  { key: "min",        label: "Mín",        align: "right"  },
  { key: "max",        label: "Máx",        align: "right"  },
  { key: "costo",      label: "Costo",      align: "right"  },
  { key: "venta",      label: "Venta",      align: "right"  },
  { key: "acciones",   label: "Acciones",   align: "center", required: true },
];

const DEFAULT_VISIBLE = COLUMN_DEFS.map((c) => c.key);

function loadVisibleCols() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    // Ensure required columns are always present
    const required = COLUMN_DEFS.filter((c) => c.required).map((c) => c.key);
    const merged = [...new Set([...required, ...parsed])];
    return merged.filter((k) => COLUMN_DEFS.some((d) => d.key === k));
  } catch {
    return DEFAULT_VISIBLE;
  }
}

function saveVisibleCols(cols) {
  localStorage.setItem(LS_KEY, JSON.stringify(cols));
}

// ── Helpers de formato ──────────────────────────────────────────────────
function formatCantidad(valor, unidadMedida, opts = {}) {
  const n = Number(valor || 0);
  if (opts.esFiambreFijo && opts.esDeposito) return `${Math.round(kgToPiezas(n, opts.pesoReferenciaKg))} pzs`;
  if (unidadMedida === "kg") return `${n.toFixed(3)} kg`;
  return `${Math.round(n)} uds`;
}

// ── Componente ──────────────────────────────────────────────────────────
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

  // ── Columnas visibles ─────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState(DEFAULT_VISIBLE);
  const [showColPicker, setShowColPicker] = useState(false);
  const pickerRef = useRef(null);

  // Cargar desde localStorage al montar
  useEffect(() => {
    setVisibleCols(loadVisibleCols());
  }, []);

  // Cerrar picker al hacer click fuera
  useEffect(() => {
    if (!showColPicker) return;
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowColPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showColPicker]);

  const isVisible = (key) => visibleCols.includes(key);

  const toggleCol = (key) => {
    const def = COLUMN_DEFS.find((c) => c.key === key);
    if (def?.required) return;
    const next = isVisible(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    setVisibleCols(next);
    saveVisibleCols(next);
  };

  const visibleCount = COLUMN_DEFS.filter((c) => isVisible(c.key)).length;

  // ── Fetch datos ───────────────────────────────────────────────────────
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
    if (filtro.negativo) params.set("negativo", "true");

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

  // ── Helpers de presentación ───────────────────────────────────────────
  const esPackDeposito = (p) => {
    if (!localEsDeposito) return false;
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);
    return f > 1 && (u === "pack" || u === "cajon");
  };

  const getUnidadDeposito = (p) => {
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);
    if (!u || u === "unidad") return f > 1 ? `Pack x${f}` : "Unidad";
    if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
    if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
    if (u === "kg") {
      if (p.modoCompraProveedor === "UNIDAD" && p.pesoReferenciaKg > 0 && (p.modoVentaDeposito === "PIEZA" || p.pesoEsFijo)) return "Pieza";
      return "Kg";
    }
    if (u === "lt") return "Litro";
    return u.charAt(0).toUpperCase() + u.slice(1);
  };

  const getUnidadLocal = (p) => {
    const u = p.unidadMedida;
    if (u === "kg") return "Kg";
    return "Unidad";
  };

  const getPresentacionDeposito = (p) => {
    const u = p.unidadMedida;
    const f = Number(p.factorPack || 1);
    if (f <= 1) return null;
    if (u === "pack") return `Pack x${f}`;
    if (u === "cajon") return `Cajón x${f}`;
    if (u === "unidad") return `Pack x${f}`;
    return null;
  };

  // ── Render helpers por columna ────────────────────────────────────────
  const renderCellStock = (p, fmtOpts, isFiambreFijo) => {
    if (esPackDeposito(p)) {
      const { bultos, sueltas } = fromUnidades({
        unidades: Number(p.stock || 0),
        factorPack: p.factorPack,
      });
      if (bultos > 0 || sueltas > 0) {
        return (
          <span>
            {bultos > 0 && <strong>{bultos} bultos</strong>}
            {bultos > 0 && sueltas > 0 && " + "}
            {sueltas > 0 && `${sueltas} uds`}
          </span>
        );
      }
      return <span>{formatCantidad(p.stock, p.unidadMedida, fmtOpts)}</span>;
    }
    return (
      <span>
        {formatCantidad(p.stock, p.unidadMedida, fmtOpts)}
        {p.unidadMedida === "kg" && p.modoCompraProveedor === "UNIDAD" && p.pesoReferenciaKg > 0 && !isFiambreFijo && (
          <span className="block text-[10px] sunmi-text-muted">
            ≈ {kgToPiezas(Number(p.stock || 0), p.pesoReferenciaKg)} pzs
          </span>
        )}
        {isFiambreFijo && localEsDeposito && (
          <span className="block text-[10px] sunmi-text-muted">
            = {Number(p.stock || 0).toFixed(3)} kg
          </span>
        )}
        {isFiambreFijo && !localEsDeposito && (
          <span className="block text-[10px] sunmi-text-muted">
            ≈ {kgToPiezas(Number(p.stock || 0), p.pesoReferenciaKg)} pzs
          </span>
        )}
      </span>
    );
  };

  // ── Guard ─────────────────────────────────────────────────────────────
  if (!localSeleccionado) {
    return (
      <p className="sunmi-text-muted text-sm py-4">
        No hay contexto operativo activo.
      </p>
    );
  }

  return (
    <div>
      {/* Barra superior: columnas */}
      <div className="flex items-center justify-end mb-2 relative" ref={pickerRef}>
        <button
          onClick={() => setShowColPicker((v) => !v)}
          className="sunmi-btn sunmi-control text-[11px] px-2 py-1 flex items-center gap-1"
          title="Columnas visibles"
        >
          <Settings2 size={14} />
          Columnas
        </button>

        {showColPicker && (
          <div className="absolute right-0 top-full mt-1 z-40 sunmi-card p-2 shadow-lg min-w-[180px]">
            <p className="text-[11px] sunmi-text-muted mb-2 font-medium">Columnas visibles</p>
            {COLUMN_DEFS.map((col) => (
              <label
                key={col.key}
                className={`flex items-center gap-2 text-[12px] py-1 cursor-pointer ${
                  col.required ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isVisible(col.key)}
                  disabled={col.required}
                  onChange={() => toggleCol(col.key)}
                  className="accent-cyan-500 scale-90"
                />
                {col.label}
              </label>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p className="sunmi-text-muted text-[13px] mb-3">Cargando stock...</p>
      )}
      {error && <p className="sunmi-text-danger text-[13px] mb-3">{error}</p>}

      <div className="overflow-x-auto rounded-xl border sunmi-border">
        <table className="min-w-full text-[12px] sunmi-table">
          <thead className="sunmi-thead">
            <tr>
              {isVisible("producto") && <th className="px-2 py-1 text-left">Producto</th>}
              {isVisible("codigo")   && <th className="px-2 py-1 text-left">Código</th>}
              {isVisible("unidad")   && <th className="px-2 py-1 text-left">Unidad</th>}
              {isVisible("stock")    && <th className="px-2 py-1 text-right">Stock</th>}
              {isVisible("min")      && <th className="px-2 py-1 text-right">Mín</th>}
              {isVisible("max")      && <th className="px-2 py-1 text-right">Máx</th>}
              {isVisible("costo")    && <th className="px-2 py-1 text-right">Costo</th>}
              {isVisible("venta")    && <th className="px-2 py-1 text-right">Venta</th>}
              {isVisible("acciones") && <th className="px-2 py-1 text-center">Acciones</th>}
            </tr>
          </thead>

          <tbody>
            {items.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={visibleCount}
                  className="px-2 py-3 text-center sunmi-text-muted"
                >
                  No hay productos para mostrar.
                </td>
              </tr>
            )}

            {items.map((p) => {
              const presentacionDep = getPresentacionDeposito(p);
              const isFiambreFijo = p.unidadMedida === "kg" && p.modoCompraProveedor === "UNIDAD" && p.pesoReferenciaKg > 0 && (p.modoVentaDeposito === "PIEZA" || p.pesoEsFijo === true);
              const fmtOpts = { esFiambreFijo: isFiambreFijo, esDeposito: localEsDeposito, pesoReferenciaKg: p.pesoReferenciaKg };
              return (
                <tr key={p.id} className="hover:bg-[var(--table-row-hover)]">
                  {isVisible("producto") && (
                    <td className="px-2 py-1">{p.nombre}</td>
                  )}
                  {isVisible("codigo") && (
                    <td className="px-2 py-1">{p.codigoBarra || "-"}</td>
                  )}
                  {isVisible("unidad") && (
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
                  )}
                  {isVisible("stock") && (
                    <td className="px-2 py-1 text-right">
                      {renderCellStock(p, fmtOpts, isFiambreFijo)}
                    </td>
                  )}
                  {isVisible("min") && (
                    <td className="px-2 py-1 text-right">
                      {esPackDeposito(p) && p.stockMin != null
                        ? fromUnidades({ unidades: Number(p.stockMin), factorPack: p.factorPack }).bultos
                        : p.stockMin != null ? formatCantidad(p.stockMin, p.unidadMedida, fmtOpts) : "-"}
                    </td>
                  )}
                  {isVisible("max") && (
                    <td className="px-2 py-1 text-right">
                      {esPackDeposito(p) && p.stockMax != null
                        ? fromUnidades({ unidades: Number(p.stockMax), factorPack: p.factorPack }).bultos
                        : p.stockMax != null ? formatCantidad(p.stockMax, p.unidadMedida, fmtOpts) : "-"}
                    </td>
                  )}
                  {isVisible("costo") && (
                    <td className="px-2 py-1 text-right">
                      {localEsDeposito
                        ? `$ ${Number(p.precioCosto || 0).toFixed(2)}`
                        : `$ ${Number(p.precioUnitario || 0).toFixed(2)}`}
                    </td>
                  )}
                  {isVisible("venta") && (
                    <td className="px-2 py-1 text-right">
                      {localEsDeposito
                        ? `$ ${Number(p.precioVenta || 0).toFixed(2)}`
                        : `$ ${Number(
                            p.precioVentaUnitario || p.precioVenta || 0
                          ).toFixed(2)}`}
                    </td>
                  )}
                  {isVisible("acciones") && (
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
                  )}
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
