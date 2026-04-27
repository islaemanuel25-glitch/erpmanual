"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
import { kgToPiezas } from "@/lib/conversiones/stock";

const DEBUG_FILTROS_SUGERIDOS = false;

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
  categoriaSeleccionada = "__ALL__",
  areaSeleccionada = "__ALL__",
  onChangeCategoria,
  onChangeArea,
}) {
  return (
    <div
      className="
        rounded-2xl
        sunmi-surface sunmi-border
        shadow-md
        overflow-hidden
        text-[12px]
      "
    >
      {/* HEADER */}
      <div
        className="
          sunmi-header-accent
          flex flex-wrap items-center justify-between gap-2
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
              sunmi-control sunmi-border
              disabled:opacity-30
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
              sunmi-control sunmi-border
              disabled:opacity-30
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
          sunmi-surface
          border-b sunmi-divider
          flex flex-wrap gap-2 sm:gap-4
        "
      >
        {/* CATEGORÍAS — mismo patrón que FiltrosProductos: value + onChange directo + placeholder */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="sunmi-text-muted">Categorías</span>

          <SunmiSelectAdv
            value={categoriaSeleccionada}
            onChange={(v) => {
              if (DEBUG_FILTROS_SUGERIDOS) console.debug("[TablaSugeridos] categoria raw:", v, "typeof:", typeof v);
              onChangeCategoria?.(v);
            }}
            placeholder="Categoría..."
            className="w-[140px]"
          >
            <SunmiSelectOption value="__ALL__">Todas</SunmiSelectOption>
            {categorias.map((c) => (
              <SunmiSelectOption key={c} value={c}>
                {c}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {/* AREAS — mismo patrón que FiltrosProductos: value + onChange directo + placeholder */}
        <div className="flex items-center gap-2 text-[11px]">
          <span className="sunmi-text-muted">Áreas</span>

          <SunmiSelectAdv
            value={areaSeleccionada}
            onChange={(v) => {
              if (DEBUG_FILTROS_SUGERIDOS) console.debug("[TablaSugeridos] área raw:", v, "typeof:", typeof v);
              onChangeArea?.(v);
            }}
            placeholder="Área..."
            className="w-[140px]"
          >
            <SunmiSelectOption value="__ALL__">Todas</SunmiSelectOption>
            {areas.map((a) => (
              <SunmiSelectOption key={a} value={a}>
                {a}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
        </div>

        {loading && (
          <span className="ml-auto text-[11px] sunmi-text-muted animate-pulse">
            Cargando sugeridos...
          </span>
        )}
      </div>

      {/* TABLA */}
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-[12px]">
          <thead
            className="
              sunmi-thead
              border-b sunmi-divider
            "
          >
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-left hidden md:table-cell">Categoría</th>
              <th className="px-2 py-2 text-left hidden md:table-cell">Área</th>
              <th className="px-2 py-2 text-left hidden md:table-cell">Código</th>
              <th className="px-2 py-2 text-left">Presentación</th>
              <th className="px-2 py-2 text-right min-w-[140px] md:min-w-[200px]">Sugerido</th>
              <th className="px-2 py-2 text-center w-[72px]">Acción</th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="
                    px-3 py-4 text-center
                    sunmi-text-muted text-[11px]
                  "
                >
                  No hay productos sugeridos.
                </td>
              </tr>
            )}

            {datos.map((p) => (
              <SugeridoRow
                key={p.productoLocalDestinoId}
                p={p}
                onEditSugerido={onEditSugerido}
                onMarcarPreparado={onMarcarPreparado}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ====================================================
// Fila editable con estado local bultos/uds + rotura
// Hardened: debounce 350ms, flush on blur, sync guard
// ====================================================
function SugeridoRow({ p, onEditSugerido, onMarcarPreparado }) {
  const sugeridoCantidad = p.sugeridoCantidad ?? p.sugerido ?? 0;
  const factorPack = Number(p.factorPack || 1);
  const bultoMode = p.modoEnvio !== "SOLO_UNIDAD" && factorPack > 1;
  const solosBultos = p.modoEnvio === "SOLO_BULTO";
  const sugeridoUnidad = p.sugeridoUnidad || (factorPack > 1 ? "BULTO" : "UNIDAD");
  const esFiambre = !!p.esFiambre && Number(p.pesoReferenciaKg || 0) > 0;
  const ventaDepositoPieza = p.modoVentaDeposito === "PIEZA";
  const pesoRefKg = Number(p.pesoReferenciaKg || 0);

  const labelBulto =
    p.unidadMedida === "cajon" ? "caj." :
    p.unidadMedida === "pack" ? "packs" :
    p.unidadMedida === "caja" ? "cajas" :
    p.unidadMedida === "carton" ? "cart." :
    "bultos";

  const [rotura, setRotura] = useState(false);
  const [inputEnPiezas, setInputEnPiezas] = useState(ventaDepositoPieza);

  // Estado local: bultos o uds según modo
  // Cuando sugeridoUnidad es BULTO, sugeridoCantidad ya está en bultos
  const [bultos, setBultos] = useState(() => {
    if (!bultoMode) return 0;
    return sugeridoUnidad === "BULTO"
      ? sugeridoCantidad
      : Math.floor(sugeridoCantidad / factorPack);
  });
  const [uds, setUds] = useState(
    bultoMode ? 0 : (esFiambre && sugeridoUnidad === "PIEZA" ? kgToPiezas(sugeridoCantidad, pesoRefKg) : sugeridoCantidad)
  );

  // Guard: no pisar state local mientras el usuario edita
  const [isEditing, setIsEditing] = useState(false);

  // Debounce refs
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  // Sincronizar cuando el valor externo cambia (solo si no está editando)
  useEffect(() => {
    if (isEditing) return;
    if (bultoMode) {
      if (sugeridoUnidad === "BULTO") {
        setBultos(sugeridoCantidad);
      } else {
        setBultos(Math.floor(sugeridoCantidad / factorPack));
        if (rotura) setUds(sugeridoCantidad % factorPack);
      }
    } else {
      if (esFiambre && inputEnPiezas) {
        setUds(sugeridoUnidad === "PIEZA" ? sugeridoCantidad : kgToPiezas(sugeridoCantidad, pesoRefKg));
      } else {
        setUds(sugeridoCantidad);
      }
    }
  }, [sugeridoCantidad, factorPack, bultoMode, isEditing, sugeridoUnidad, rotura, esFiambre, inputEnPiezas, pesoRefKg]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const emitirDebounced = useCallback((val, unidad) => {
    pendingRef.current = { val, unidad };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onEditSugerido(p.productoLocalDestinoId, val, unidad);
      pendingRef.current = null;
    }, 350);
  }, [onEditSugerido, p.productoLocalDestinoId]);

  const flush = useCallback(() => {
    if (pendingRef.current !== null) {
      clearTimeout(timerRef.current);
      onEditSugerido(
        p.productoLocalDestinoId,
        pendingRef.current.val,
        pendingRef.current.unidad
      );
      pendingRef.current = null;
    }
    setIsEditing(false);
  }, [onEditSugerido, p.productoLocalDestinoId]);

  const handleFocus = () => setIsEditing(true);

  const handleBultos = (val) => {
    const nb = Math.max(0, Number(val) || 0);
    setBultos(nb);
    if (rotura) {
      emitirDebounced(nb * factorPack + uds, "UNIDAD");
    } else {
      emitirDebounced(nb, "BULTO");
    }
  };

  const handleUds = (val) => {
    const nu = Math.max(0, Number(val) || 0);
    setUds(nu);
    if (bultoMode && rotura) {
      emitirDebounced(bultos * factorPack + nu, "UNIDAD");
    } else if (esFiambre && inputEnPiezas) {
      emitirDebounced(nu, "PIEZA");
    } else {
      emitirDebounced(nu, "UNIDAD");
    }
  };

  const toggleRotura = () => {
    const next = !rotura;
    setRotura(next);
    if (!next) {
      // Desactivar rotura: emit bultos como BULTO
      setUds(0);
      onEditSugerido(p.productoLocalDestinoId, bultos, "BULTO");
    } else {
      // Activar rotura: convertir a total unidades
      const totalUnits = bultos * factorPack;
      if (totalUnits > 0) {
        onEditSugerido(p.productoLocalDestinoId, totalUnits, "UNIDAD");
      }
    }
  };

  const total = (() => {
    if (!bultoMode) return uds;
    if (rotura) return bultos * factorPack + uds;
    return bultos * factorPack;
  })();

  const productoId =
    p.productoLocalOrigenId ?? p.productoLocalDestinoId ?? p.productoLocalId;

  return (
    <tr
      className="
        border-t sunmi-divider
        sunmi-row-hover
        transition
      "
    >
      {/* PRODUCTO */}
      <td className="px-3 py-2 align-middle">
        <span className="font-medium">{p.productoNombre}</span>
        {String(p?.tipo || "").toLowerCase() === "rotura" && (
          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full sunmi-state-danger sunmi-text-danger font-semibold">
            Rotura
          </span>
        )}
      </td>

      {/* CATEGORÍA */}
      <td className="px-2 py-2 text-[11px] sunmi-text-muted align-middle hidden md:table-cell">
        {p.categoriaNombre || "Sin categoría"}
      </td>

      {/* ÁREA */}
      <td className="px-2 py-2 text-[11px] sunmi-text-muted align-middle hidden md:table-cell">
        {p.areaFisicaNombre || "Sin área"}
      </td>

      {/* CODIGO */}
      <td className="px-2 py-2 text-[11px] sunmi-text-muted align-middle hidden md:table-cell">
        {p.codigoBarra || "-"}
      </td>

      {/* PRESENTACIÓN */}
      <td className="px-2 py-2 text-[11px] sunmi-text-muted align-middle">
        {bultoMode ? `${p.unidadMedida} x ${factorPack}` : (ventaDepositoPieza ? "pieza (dep.)" : esFiambre ? `${p.unidadMedida} (fiambre)` : p.unidadMedida)}
      </td>

      {/* SUGERIDO EDITABLE + ROTURA */}
      <td className="px-2 py-2 min-w-[140px] md:min-w-[200px] align-middle">
        <div className="ml-auto">
          <div className="flex items-center justify-end gap-3">
            {bultoMode ? (
              <>
                {/* Bultos */}
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => handleBultos(Math.max(0, bultos - 1))} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                  <SunmiInput
                    type="text"
                    inputMode="numeric"
                    value={bultos}
                    onFocus={handleFocus}
                    onBlur={flush}
                    onChange={(e) => handleBultos(e.target.value)}
                    className="w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button type="button" onClick={() => handleBultos(bultos + 1)} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                  <span className="text-[10px] sunmi-text-muted">{labelBulto}</span>
                </div>
                {/* Uds sueltas (solo si rotura) */}
                {rotura && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleUds(Math.max(0, uds - 1))} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                    <SunmiInput
                      type="text"
                      inputMode="numeric"
                      value={uds}
                      onFocus={handleFocus}
                      onBlur={flush}
                      onChange={(e) => handleUds(e.target.value)}
                      className="w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button type="button" onClick={() => handleUds(uds + 1)} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                    <span className="text-[10px] sunmi-text-muted">uds</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => handleUds(Math.max(0, uds - 1))} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                <SunmiInput
                  type="text"
                  inputMode="numeric"
                  value={uds}
                  onFocus={handleFocus}
                  onBlur={flush}
                  onChange={(e) => handleUds(e.target.value)}
                  className="w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button type="button" onClick={() => handleUds(uds + 1)} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                <span className="text-[10px] sunmi-text-muted">{esFiambre && inputEnPiezas ? "pzs" : (esFiambre ? "kg" : "uds")}</span>
              </div>
            )}
          </div>
          <div className="min-h-[14px] text-right text-[10px] leading-tight flex items-center justify-end gap-2">
            {bultoMode && (
              <span className="sunmi-text-muted">= {total} uds</span>
            )}
            {esFiambre && !bultoMode && (
              <span className="sunmi-text-muted">
                {inputEnPiezas
                  ? `= ${(sugeridoCantidad || 0).toFixed(2)} kg`
                  : `= ${kgToPiezas(sugeridoCantidad, pesoRefKg)} pzs`}
              </span>
            )}
            {esFiambre && ventaDepositoPieza && !bultoMode && (
              <button
                type="button"
                onClick={() => {
                  if (!inputEnPiezas) {
                    setInputEnPiezas(true);
                    onEditSugerido(p.productoLocalDestinoId, kgToPiezas(sugeridoCantidad, pesoRefKg), "PIEZA");
                  } else {
                    setInputEnPiezas(false);
                    onEditSugerido(p.productoLocalDestinoId, (uds * pesoRefKg), "UNIDAD");
                  }
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${inputEnPiezas ? "sunmi-btn sunmi-btn-primary" : "sunmi-control"}`}
              >
                {inputEnPiezas ? "Kg" : "Piezas"}
              </button>
            )}
            {bultoMode && !solosBultos && (
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotura}
                  onChange={toggleRotura}
                  className="w-3 h-3 accent-[var(--pos-accent)]"
                />
                <span className="sunmi-text-accent">Rotura</span>
              </label>
            )}
          </div>
        </div>
      </td>

      {/* BOTÓN PREP. */}
      <td className="px-2 py-2 text-center w-[72px] align-middle">
        <button
          onClick={() => onMarcarPreparado(productoId)}
          className="
            sunmi-btn sunmi-btn-primary
            px-3 py-1 rounded-full
            text-[11px] font-semibold
            active:scale-95 transition
          "
        >
          Prep.
        </button>
      </td>
    </tr>
  );
}
