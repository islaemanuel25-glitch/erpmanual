"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import SunmiSelectAdv from "@/components/sunmi/SunmiSelectAdv";
import SunmiInput from "@/components/sunmi/SunmiInput";
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
  bloqueado = false,
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
      {/* CABECERA */}
      <div
        className="
          sunmi-header-accent
          flex items-center justify-between
        "
      >
        <span className="font-bold text-xs tracking-wide uppercase">
          Preparados
        </span>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="opacity-80">Mostrar:</span>
          <SunmiSelectAdv
            value={pageSize}
            onChange={(val) => onPageSizeChange(Number(val))}
          >
            {[25, 50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>{n}</option>
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

          <span>{page} / {totalPages}</span>

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

      {/* BUSCADOR */}
      {!bloqueado && (
        <div
          className="
            border-b sunmi-divider
            sunmi-surface
            px-3 py-3
          "
        >
          {buscador}
        </div>
      )}

      {/* TABLA */}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead
            className="
              sunmi-thead
              border-b sunmi-divider
            "
          >
            <tr>
              <th className="px-3 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-center w-[70px]">Tipo</th>
              <th className="px-2 py-2 text-center w-[80px]">Stock Dep.</th>
              <th className="px-2 py-2 text-center w-[80px]">Stock Local</th>
              <th className="px-2 py-2 text-right w-[220px]">
                Preparado
              </th>
              <th className="px-2 py-2 text-center w-[70px]">Acción</th>
            </tr>
          </thead>

          <tbody>
            {datos.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center sunmi-text-muted text-[11px]"
                >
                  No hay productos preparados.
                </td>
              </tr>
            )}

            {datos.map((p) => (
              <PreparadoRow
                key={p.detalleId}
                p={p}
                onDesmarcar={onDesmarcar}
                onEditPreparado={onEditPreparado}
                bloqueado={bloqueado}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ====================================================
// Fila preparado — con modo rotura mixto (bultos + uds)
// ====================================================
function PreparadoRow({ p, onDesmarcar, onEditPreparado, bloqueado = false }) {
  const factorPack = Number(p.factorPack || 1);
  const puedeRotura = factorPack > 1;
  const muestraEnBulto = p.unidadPreparada === "BULTO" && factorPack > 1;

  const labelBulto =
    p.unidadMedida === "cajon" ? "caj." :
    p.unidadMedida === "pack" ? "packs" :
    p.unidadMedida === "caja" ? "cajas" :
    p.unidadMedida === "carton" ? "cart." :
    "bultos";

  const preparadoVal = Number(p.preparado || 0);

  // --- Estado modo normal (un solo input) ---
  const [inputVal, setInputVal] = useState(preparadoVal);
  const [isEditing, setIsEditing] = useState(false);
  const timerRef = useRef(null);
  const pendingRef = useRef(null);

  // --- Estado modo rotura (mixto) ---
  const [roturaMode, setRoturaMode] = useState(false);
  const [mixBultos, setMixBultos] = useState(0);
  const [mixUds, setMixUds] = useState(0);

  // Sync desde props cuando no se edita
  useEffect(() => {
    if (isEditing) return;
    if (roturaMode) {
      const prepUds = muestraEnBulto ? preparadoVal * factorPack : preparadoVal;
      setMixBultos(Math.floor(prepUds / factorPack));
      setMixUds(prepUds % factorPack);
    } else {
      setInputVal(preparadoVal);
    }
  }, [preparadoVal, isEditing, roturaMode, muestraEnBulto, factorPack]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // --- Emit helpers ---
  const unidadEmitNormal = muestraEnBulto ? "BULTO" : "UNIDAD";

  const emitDebounced = useCallback((val, unidad) => {
    pendingRef.current = { val, unidad };
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onEditPreparado(p.detalleId, val, unidad);
      pendingRef.current = null;
    }, 350);
  }, [onEditPreparado, p.detalleId]);

  const flush = useCallback(() => {
    if (pendingRef.current !== null) {
      clearTimeout(timerRef.current);
      onEditPreparado(p.detalleId, pendingRef.current.val, pendingRef.current.unidad);
      pendingRef.current = null;
    }
    setIsEditing(false);
  }, [onEditPreparado, p.detalleId]);

  // --- Handlers modo normal ---
  const handleChange = (val) => {
    const v = Math.max(0, Number(val) || 0);
    setInputVal(v);
    emitDebounced(v, unidadEmitNormal);
  };

  // --- Handlers modo rotura ---
  const emitMix = (b, u) => emitDebounced(b * factorPack + u, "UNIDAD");

  const handleMixBultosInput = (e) => {
    const b = Math.max(0, parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0);
    setMixBultos(b);
    emitMix(b, mixUds);
  };
  const handleMixUdsInput = (e) => {
    const raw = parseInt(String(e.target.value).replace(/\D/g, ""), 10) || 0;
    const u = Math.min(Math.max(0, raw), factorPack - 1);
    setMixUds(u);
    emitMix(mixBultos, u);
  };

  const handlePlusBultos = () => {
    const b = mixBultos + 1;
    setMixBultos(b);
    emitMix(b, mixUds);
  };
  const handleMinusBultos = () => {
    const b = Math.max(0, mixBultos - 1);
    setMixBultos(b);
    emitMix(b, mixUds);
  };

  const handlePlusUds = () => {
    let b = mixBultos, u = mixUds + 1;
    if (u >= factorPack) { b += 1; u = 0; }
    setMixBultos(b);
    setMixUds(u);
    emitMix(b, u);
  };
  const handleMinusUds = () => {
    let b = mixBultos, u = mixUds - 1;
    if (u < 0) {
      if (b > 0) { b -= 1; u = factorPack - 1; }
      else { u = 0; }
    }
    setMixBultos(b);
    setMixUds(u);
    emitMix(b, u);
  };

  // --- Toggle rotura ---
  const toggleRotura = () => {
    if (roturaMode) {
      // Apagar: volver a modo normal, convertir total a bultos
      const totalNow = mixBultos * factorPack + mixUds;
      const bultos = Math.floor(totalNow / factorPack);
      setInputVal(bultos);
      setRoturaMode(false);
      onEditPreparado(p.detalleId, bultos, "BULTO");
    } else {
      // Encender: convertir preparado actual a bultos+uds
      const prepUds = muestraEnBulto ? preparadoVal * factorPack : preparadoVal;
      setMixBultos(Math.floor(prepUds / factorPack));
      setMixUds(prepUds % factorPack);
      setRoturaMode(true);
    }
  };

  // --- Cálculos para display ---
  const totalUdsDisplay = roturaMode
    ? mixBultos * factorPack + mixUds
    : (muestraEnBulto ? inputVal * factorPack : inputVal);

  // Pedido en uds para calcular rotura visual
  const pedidoUds = (p.unidadSugerida === "BULTO" || p.sugeridoUnidad === "BULTO")
    ? Number(p.sugerido || 0) * factorPack
    : Number(p.sugerido || 0);
  const roturaUds = Math.max(0, pedidoUds - totalUdsDisplay);

  const inputCls = "w-[46px] text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <tr
      className="
        border-t sunmi-divider
        sunmi-row-hover
        transition
      "
    >
      {/* PRODUCTO */}
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span className="font-medium text-[12px]">
            {p.productoNombre}
          </span>
          <span className="text-[11px] sunmi-text-muted">
            {p.codigoBarra || "Sin código"}
          </span>
        </div>
      </td>

      {/* TIPO */}
      <td className="px-2 py-2 text-center text-[11px] sunmi-text-muted">
        {p.tipo === "manual" ? (
          <span className="sunmi-text-link font-semibold">Manual</span>
        ) : p.tipo === "rotura" ? (
          <span className="sunmi-text-danger font-semibold">Rotura</span>
        ) : (
          <span className="sunmi-text-accent font-semibold">Sug.</span>
        )}
      </td>

      {/* STOCK DEPÓSITO */}
      <td className="px-2 py-2 text-center text-[11px] sunmi-text-muted">
        {p.stockActual}
      </td>

      {/* STOCK LOCAL */}
      <td className="px-2 py-2 text-center text-[11px] sunmi-text-muted">
        {p.cantidadReal}
      </td>

      {/* INPUT PREPARADO */}
      <td className="px-2 py-2 text-right">
        <div className="flex items-center gap-3 justify-end flex-nowrap">

          {/* Controles */}
          <div className="flex flex-col items-end gap-1">
            {roturaMode ? (
              <>
                <div className="flex items-center justify-end gap-3">
                  {/* Bultos */}
                  <div className="flex items-center gap-1">
                    {!bloqueado && (
                      <button type="button" onClick={handleMinusBultos} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                    )}
                    <SunmiInput
                      type="text"
                      inputMode="numeric"
                      value={mixBultos}
                      onFocus={() => setIsEditing(true)}
                      onBlur={flush}
                      onChange={handleMixBultosInput}
                      className={inputCls}
                      disabled={bloqueado}
                    />
                    {!bloqueado && (
                      <button type="button" onClick={handlePlusBultos} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                    )}
                    <span className="text-[10px] sunmi-text-muted">{labelBulto}</span>
                  </div>
                  {/* Uds sueltas */}
                  <div className="flex items-center gap-1">
                    {!bloqueado && (
                      <button type="button" onClick={handleMinusUds} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                    )}
                    <SunmiInput
                      type="text"
                      inputMode="numeric"
                      value={mixUds}
                      onFocus={() => setIsEditing(true)}
                      onBlur={flush}
                      onChange={handleMixUdsInput}
                      className={inputCls}
                      disabled={bloqueado}
                    />
                    {!bloqueado && (
                      <button type="button" onClick={handlePlusUds} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                    )}
                    <span className="text-[10px] sunmi-text-muted">uds</span>
                  </div>
                </div>
                <span className="text-[10px] sunmi-text-muted">= {totalUdsDisplay} uds</span>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  {!bloqueado && (
                    <button type="button" onClick={() => handleChange(Math.max(0, inputVal - 1))} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">−</button>
                  )}
                  <SunmiInput
                    type="number"
                    min={0}
                    step={1}
                    value={inputVal}
                    onFocus={() => setIsEditing(true)}
                    onBlur={flush}
                    onChange={(e) => handleChange(e.target.value)}
                    className={"w-[52px] " + inputCls}
                    disabled={bloqueado}
                  />
                  {!bloqueado && (
                    <button type="button" onClick={() => handleChange(inputVal + 1)} className="w-6 h-6 rounded-md sunmi-control text-[13px] font-bold active:scale-95 transition flex items-center justify-center">+</button>
                  )}
                  <span className="text-[10px] sunmi-text-muted">
                    {muestraEnBulto ? labelBulto : "uds"}
                  </span>
                </div>
                {muestraEnBulto && (
                  <span className="text-[10px] sunmi-text-muted">= {totalUdsDisplay} uds</span>
                )}
              </>
            )}
            {roturaUds > 0 && (
              <span className="text-[10px] sunmi-text-danger font-semibold">−{roturaUds} uds</span>
            )}
          </div>

          {/* Botón Rotura al costado */}
          {puedeRotura && !bloqueado && (
            <button
              type="button"
              onClick={toggleRotura}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                roturaMode
                  ? "sunmi-btn sunmi-btn-red"
                  : "sunmi-control"
              }`}
            >
              Rotura
            </button>
          )}

        </div>
      </td>

      {/* BTN QUITAR */}
      <td className="px-2 py-2 text-center">
        {!bloqueado && (
          <button
            onClick={() => onDesmarcar(p.detalleId)}
            className="
              sunmi-btn sunmi-btn-red
              px-3 py-1 rounded-full
              text-[11px] font-semibold
              active:scale-95
              transition
            "
          >
            Quitar
          </button>
        )}
      </td>
    </tr>
  );
}
