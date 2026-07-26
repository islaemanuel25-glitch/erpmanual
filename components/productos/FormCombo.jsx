"use client";

import { useMemo, useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggle from "@/components/sunmi/SunmiToggle";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import EditorComponentesCombo from "@/components/productos/EditorComponentesCombo";
import { costoCombo, gananciaYMargen, round2 } from "@/lib/combos/costo";
import {
  precioPorMargen,
  disponibilidadPreview,
  validarComposicionUI,
} from "@/lib/combos/formComboLogic";

// ============================================================
// Formulario de COMBO. 100% temático (tokens/clases del sistema).
// Formación de precio como en Productos: modo "Por margen" (margen → precio con
// redondeo) o "Manual" (precio → ganancia/margen resultante). Costo = Σ componentes
// (solo lectura). El backend es autoritativo. Errores solo tras tocar/guardar.
// ============================================================
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FormCombo({ mode = "crear", initial = null, localId, localNombre, esDeposito = false, onSubmit, onCancel, submitLabel }) {
  const [nombre, setNombre] = useState(initial?.nombre || "");
  const [codigoBarra, setCodigoBarra] = useState(initial?.codigo_barra || "");
  const [codigoBarraSecundario, setCodigoBarraSecundario] = useState(initial?.codigo_barra_secundario || "");
  const [componentes, setComponentes] = useState(initial?.componentes || []);
  const [activo, setActivo] = useState(initial?.activo !== false);

  // Modo de formación: "margen" | "manual" (reconstruido desde margenConfigurado).
  const modoInicial = initial ? (initial.margenConfigurado != null ? "margen" : "manual") : "margen";
  const [modoPrecio, setModoPrecio] = useState(modoInicial);
  const [margen, setMargen] = useState(initial?.margenConfigurado != null ? String(initial.margenConfigurado) : "");
  const [redondeo100, setRedondeo100] = useState(initial ? initial.redondeo_100 === true : true);
  const [precioManual, setPrecioManual] = useState(
    initial && initial.margenConfigurado == null ? String(initial.precio_venta ?? "") : ""
  );

  const [touched, setTouched] = useState({ nombre: false, precio: false });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorServer, setErrorServer] = useState(null);

  // ── Cálculos (preview cliente; el server recalcula autoritativo) ──
  const costoTotal = useMemo(
    () => costoCombo(componentes.map((c) => ({ costoUnitario: c.costoUnitario, cantidad: c.cantidad }))),
    [componentes]
  );
  const precioCalculado = useMemo(() => {
    if (modoPrecio === "margen") return round2(costoTotal * (1 + (Number(margen) || 0) / 100));
    return round2(Number(precioManual) || 0);
  }, [modoPrecio, costoTotal, margen, precioManual]);
  const precioFinal = useMemo(() => {
    if (modoPrecio === "margen") return precioPorMargen(costoTotal, margen, redondeo100);
    return round2(Number(precioManual) || 0);
  }, [modoPrecio, costoTotal, margen, redondeo100, precioManual]);
  const { ganancia, margen: margenEfectivo } = useMemo(
    () => gananciaYMargen({ precioVenta: precioFinal, costoTotal }),
    [precioFinal, costoTotal]
  );

  const disp = useMemo(() => disponibilidadPreview(componentes), [componentes]);
  const valComp = useMemo(() => validarComposicionUI(componentes), [componentes]);

  const limitante = useMemo(() => {
    if (!componentes.length) return null;
    let min = Infinity;
    let nombreLim = null;
    for (const c of disp.componentes) {
      if (c.disponibilidadComponente < min) {
        min = c.disponibilidadComponente;
        nombreLim = componentes.find((x) => x.componenteProductoLocalId === c.componenteProductoLocalId)?.nombre || null;
      }
    }
    return nombreLim;
  }, [disp, componentes]);

  const nombreOk = !!nombre.trim();
  const margenValido = modoPrecio !== "margen" || (margen !== "" && Number.isFinite(Number(margen)));
  const precioOk = precioFinal > 0 && margenValido;
  const puedeGuardar = nombreOk && precioOk && valComp.ok && !saving;

  const handleGuardar = async () => {
    setSubmitted(true);
    setErrorServer(null);
    if (!puedeGuardar) return;
    const payload = {
      nombre: nombre.trim(),
      codigo_barra: codigoBarra.trim() || null,
      codigo_barra_secundario: codigoBarraSecundario.trim() || null,
      componentes: componentes.map((c) => ({
        componenteProductoLocalId: c.componenteProductoLocalId,
        cantidad: Number(c.cantidad),
      })),
    };
    if (modoPrecio === "margen") {
      payload.margen = Number(margen);
      payload.redondeo_100 = redondeo100;
    } else {
      payload.precio_venta = Number(precioManual);
    }
    if (mode === "editar") payload.activo = activo;
    try {
      setSaving(true);
      await onSubmit(payload);
    } catch (e) {
      setErrorServer(e?.message || "No se pudo guardar el combo.");
    } finally {
      setSaving(false);
    }
  };

  const showNombreError = (touched.nombre || submitted) && !nombreOk;
  const showPrecioError = (touched.precio || submitted) && !precioOk;
  const avisoPrecio =
    precioFinal > 0 && precioFinal < costoTotal ? "MARGEN_NEGATIVO" : precioFinal > 0 && precioFinal === costoTotal ? "GANANCIA_CERO" : null;

  return (
    <div className="space-y-3">
      {/* ── Datos básicos ── */}
      <SunmiCard className="p-3 space-y-3">
        <h3 className="text-[13px] sunmi-section-title">Datos básicos</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Nombre del combo *</label>
            <SunmiInput
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, nombre: true }))}
              placeholder="Ej: Combo Fernet"
              className={showNombreError ? "!border-[var(--pos-danger)]" : ""}
            />
            {showNombreError && <p className="text-[11px] sunmi-text-danger mt-1">El nombre es obligatorio.</p>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">Código (opcional)</label>
              <SunmiInput value={codigoBarra} onChange={(e) => setCodigoBarra(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">Cód. secundario</label>
              <SunmiInput value={codigoBarraSecundario} onChange={(e) => setCodigoBarraSecundario(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>
        {mode === "editar" && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] sunmi-label">Activo</label>
            <SunmiToggle value={activo} onChange={setActivo} />
          </div>
        )}
      </SunmiCard>

      {/* ── Componentes ── */}
      <SunmiCard className="p-3 space-y-2">
        <h3 className="text-[13px] sunmi-section-title">Componentes</h3>
        <EditorComponentesCombo localId={localId} esDeposito={esDeposito} componentes={componentes} onChange={setComponentes} disabled={saving} />
        {componentes.length > 0 && !valComp.ok && (
          <ul className="text-[11px] sunmi-text-danger list-disc pl-4">
            {valComp.errores.filter((e) => e.tipo !== "VACIA").map((e, i) => (
              <li key={i}>{e.msg}</li>
            ))}
          </ul>
        )}
      </SunmiCard>

      {/* ── Formación de precio ── */}
      <SunmiCard className="p-3 space-y-3">
        <h3 className="text-[13px] sunmi-section-title">Formación de precio</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Costo del combo</label>
            <div className="sunmi-input flex items-center justify-end tabular-nums font-semibold">{money(costoTotal)}</div>
            <p className="text-[10px] sunmi-text-muted mt-1">Calculado automáticamente (suma de sus componentes).</p>
          </div>
          <div>
            <label className="text-[11px] sunmi-label mb-1 block">Modo de formación</label>
            <SunmiSelectAdv value={modoPrecio} onChange={setModoPrecio}>
              <SunmiSelectOption value="margen">Por margen</SunmiSelectOption>
              <SunmiSelectOption value="manual">Manual</SunmiSelectOption>
            </SunmiSelectAdv>
          </div>
        </div>

        {modoPrecio === "margen" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">Margen %</label>
              <SunmiInput
                type="number"
                step="any"
                value={margen}
                onChange={(e) => setMargen(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, precio: true }))}
                onWheel={(e) => e.target.blur()}
                placeholder="Ej: 40"
                className={showPrecioError ? "!border-[var(--pos-danger)]" : ""}
              />
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[11px] sunmi-label">Redondear a $100</label>
                <SunmiToggle value={redondeo100} onChange={setRedondeo100} />
              </div>
            </div>
            <div className="space-y-1">
              <Row label="Precio calculado" value={money(precioCalculado)} />
              {redondeo100 && <Row label="Precio final (redondeado)" value={money(precioFinal)} strong />}
              {!redondeo100 && <Row label="Precio final" value={money(precioFinal)} strong />}
              <Row label="Ganancia" value={money(ganancia)} />
              <Row label="Margen resultante" value={margenEfectivo == null ? "—" : `${margenEfectivo}%`} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] sunmi-label mb-1 block">Precio de venta *</label>
              <SunmiInput
                type="number"
                step="any"
                min="0"
                value={precioManual}
                onChange={(e) => setPrecioManual(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, precio: true }))}
                onWheel={(e) => e.target.blur()}
                placeholder="0.00"
                className={showPrecioError ? "!border-[var(--pos-danger)]" : ""}
              />
            </div>
            <div className="space-y-1">
              <Row label="Ganancia" value={money(ganancia)} />
              <Row label="Margen resultante" value={margenEfectivo == null ? "—" : `${margenEfectivo}%`} />
            </div>
          </div>
        )}

        {avisoPrecio === "MARGEN_NEGATIVO" && (
          <div className="sunmi-state-warning rounded-lg p-2 text-[11px]">
            ⚠ El precio es menor al costo: margen negativo. No se bloquea, pero revisalo.
          </div>
        )}
        {avisoPrecio === "GANANCIA_CERO" && (
          <div className="sunmi-state-warning rounded-lg p-2 text-[11px]">⚠ El precio iguala al costo: ganancia cero.</div>
        )}
        {showPrecioError && (
          <p className="text-[11px] sunmi-text-danger">
            {modoPrecio === "margen" ? "Ingresá un margen que dé un precio mayor a 0." : "El precio de venta debe ser mayor a 0."}
          </p>
        )}
        <p className="text-[10px] sunmi-text-muted">Los valores definitivos los calcula el sistema al guardar.</p>
      </SunmiCard>

      {/* ── Disponibilidad ── */}
      <SunmiCard className="p-3 space-y-1">
        <h3 className="text-[13px] sunmi-section-title">Disponibilidad</h3>
        {componentes.length === 0 ? (
          <p className="text-[12px] sunmi-text-muted">Agregá productos para calcular la disponibilidad estimada.</p>
        ) : disp.bloqueadoEstructural ? (
          <div className="sunmi-state-danger rounded-lg p-2 text-[11px]">
            Composición inválida: hay componentes desactivados, sin stock o con cantidad inválida. Corregilos para poder guardar.
          </div>
        ) : (
          <>
            <p className="text-[13px] font-semibold">
              {mode === "editar" ? "Disponibilidad actual" : `Disponibilidad estimada${localNombre ? ` en ${localNombre}` : ""}`}: {disp.disponibilidad} combos
            </p>
            {limitante && <p className="text-[11px] sunmi-text-muted">Limitado por: {limitante}</p>}
          </>
        )}
        <p className="text-[10px] sunmi-text-muted">La disponibilidad se calcula según el stock de los productos que contiene.</p>
      </SunmiCard>

      {errorServer && <div className="sunmi-state-danger rounded-lg p-2 text-[12px]">{errorServer}</div>}

      {/* ── Acciones ── */}
      <div className="flex justify-end gap-2">
        <SunmiButton color="slate" onClick={onCancel} disabled={saving}>
          Cancelar
        </SunmiButton>
        <SunmiButton color="amber" onClick={handleGuardar} disabled={!puedeGuardar}>
          {saving ? "Guardando…" : submitLabel || (mode === "editar" ? "Guardar combo" : "Crear combo")}
        </SunmiButton>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between text-[12px]">
      <span className="sunmi-text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : "font-medium"}`}>{value}</span>
    </div>
  );
}
