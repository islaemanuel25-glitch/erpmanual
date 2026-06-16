"use client";

import { fromUnidades, kgToPiezas } from "@/lib/conversiones/stock";
import { useStockData } from "@/hooks/useStockData";
import { useColumnasVisibles } from "@/hooks/useColumnasVisibles";
import ColumnPicker from "@/components/stock_locales/ColumnPicker";
import {
  formatCantidad,
  esPackDeposito,
  getUnidadDeposito,
  getUnidadLocal,
  getPresentacionDeposito,
  esFiambreFijoItem,
} from "@/lib/stock/presentacion";

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
  // Datos del listado (fetch/estado extraído a hook).
  const { items, total, totalPages, loading, error } = useStockData({
    localSeleccionado,
    filtro,
    page,
    refrescar,
    setRefrescar,
  });

  // Columnas visibles (estado + localStorage extraído a hook).
  const { isVisible, toggleCol, visibleCount, COLUMN_DEFS } = useColumnasVisibles();

  // ── Render helpers por columna ────────────────────────────────────────
  const renderCellStock = (p, fmtOpts, isFiambreFijo) => {
    if (esPackDeposito(p, localEsDeposito)) {
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
            = {(Number(p.stock || 0) * p.pesoReferenciaKg).toFixed(3)} kg
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
      <ColumnPicker columnDefs={COLUMN_DEFS} isVisible={isVisible} toggleCol={toggleCol} />

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
              const isFiambreFijo = esFiambreFijoItem(p);
              const fmtOpts = { esFiambreFijo: isFiambreFijo, esDeposito: localEsDeposito };
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
                      {esPackDeposito(p, localEsDeposito) && p.stockMin != null
                        ? fromUnidades({ unidades: Number(p.stockMin), factorPack: p.factorPack }).bultos
                        : p.stockMin != null ? formatCantidad(p.stockMin, p.unidadMedida, fmtOpts) : "-"}
                    </td>
                  )}
                  {isVisible("max") && (
                    <td className="px-2 py-1 text-right">
                      {esPackDeposito(p, localEsDeposito) && p.stockMax != null
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
