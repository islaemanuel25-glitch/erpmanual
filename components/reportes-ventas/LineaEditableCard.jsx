"use client";

// Card MÓVIL de UNA línea de la corrección — copia directa de la card de producto
// de Compras → Ver compra → Recibir mercadería (misma estructura/clases):
//   <div className="rounded-xl border sunmi-border p-3 sunmi-surface flex flex-col gap-2">
//   · Cabecera: nombre + botón "Quitar" (SunmiButton color="red").
//   · Estado de consumo legacy: reconstruido (badge) / ambiguo (SunmiSelectAdv).
//   · Campos original → corregido: Cant. (− [n] +) y Precio ($), como en recepción.
//   · Subtotal original → corregido + diferencia.
// Solo se adaptan los DATOS de ventas; el lenguaje visual es el de Compras.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import { MODO_PACK, MODO_UNIDAD, cantidadStockLinea } from "@/lib/pos-ventas/lineaModoDeposito";

const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };

export default function LineaEditableCard({ linea, onChange, onRemove, onModoVenta, permiteEditarPrecio }) {
  const l = linea;
  const rec = l.reconstruccion || null;
  const esAmbiguo = rec?.estado === "ambiguo";
  const esNuevo = l.origenDetalleId == null;
  const subtotalOrig = num(l.precioOriginal) * num(l.cantidadOriginal);
  const subtotalCorr = num(l.precio) * num(l.cantidad);
  const dif = subtotalCorr - subtotalOrig;
  const precioDeshab = l.esCombo || l.esServicio || !permiteEditarPrecio;
  const setCant = (v) => onChange({ cantidad: v });
  // Depósito pack/unidad (Opción A): un modo por línea.
  const esPack = (l.modoVentaLinea || MODO_PACK) === MODO_PACK;
  const factorPack = Math.max(1, Number(l.factorPack) || 1);
  const stockFisico = l.esServicio || l.esCombo ? null : cantidadStockLinea({ cantidad: num(l.cantidad), modoVentaLinea: l.modoVentaLinea, factorPack, modoEnvio: l.modoEnvio, esDeposito: l.esDeposito });

  return (
    <div className="rounded-xl border sunmi-border p-3 sunmi-surface flex flex-col gap-2">
      {/* Cabecera: nombre + badge de modo + Quitar */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium sunmi-text-strong truncate">
            {l.nombre}
            {l.esCombo && <span className="ml-2 text-[10px] sunmi-text-link font-medium">COMBO</span>}
            {l.esServicio && <span className="ml-2 text-[10px] sunmi-text-link font-medium">SERVICIO</span>}
            {esNuevo && <span className="ml-2 text-[10px] sunmi-text-success font-medium">NUEVO</span>}
            {l.puedeToggle && (
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full sunmi-surface sunmi-text-accent font-medium">
                {esPack ? "Pack" : "Unidad suelta"}
              </span>
            )}
          </div>
          <div className="text-[11px] sunmi-text-muted">{l.codigo || l.presentacion || ""}</div>
        </div>
        <SunmiButton color="red" type="button" onClick={onRemove}>Quitar</SunmiButton>
      </div>

      {/* Toggle Pack | Unidad suelta (depósito con factor > 1) */}
      {l.puedeToggle && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex rounded-lg overflow-hidden border sunmi-border">
            <button type="button" onClick={() => onModoVenta && onModoVenta(MODO_PACK)}
              className={`px-3 py-1 text-[12px] font-medium ${esPack ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Pack</button>
            <button type="button" onClick={() => onModoVenta && onModoVenta(MODO_UNIDAD)}
              className={`px-3 py-1 text-[12px] font-medium ${!esPack ? "sunmi-state-success sunmi-text-success" : "sunmi-text-muted"}`}>Unidad suelta</button>
          </div>
          <span className="text-[10px] sunmi-text-muted">1 pack = {factorPack} u · físico: {fmtCant(stockFisico)} u</span>
        </div>
      )}

      {/* Aviso: producto agregado sin costo resoluble → bloquea revisar */}
      {l.costoResoluble === false && (
        <div className="text-[11px] sunmi-state-danger sunmi-text-danger rounded px-2 py-1">
          ⚠ Este producto no tiene costo resoluble. No se puede revisar hasta definir un costo.
        </div>
      )}

      {/* Consumo histórico legacy */}
      {rec?.estado === "reconstruido" && (
        <div className="text-[11px] sunmi-state-success sunmi-text-success rounded px-2 py-1">
          ✓ Consumo histórico reconstruido — {rec.modalidad || "—"} · {fmtCant(rec.cantidadFisica)} u
        </div>
      )}
      {esAmbiguo && (
        <div className="sunmi-state-warning rounded px-2 py-1.5 space-y-1.5">
          <div className="text-[11px] sunmi-text-accent font-medium">⚠ Consumo original no registrado</div>
          <div className="text-[10px] sunmi-text-muted">Esta venta es anterior al registro exacto de consumo. Indicá cómo se vendió originalmente:</div>
          <SunmiSelectAdv
            value={l.modalidadConfirmada || ""}
            onChange={(v) => onChange({ modalidadConfirmada: v || null })}
          >
            <SunmiSelectOption value="">Elegí la modalidad…</SunmiSelectOption>
            {(rec.modalidadesPosibles || []).map((m) => (
              <SunmiSelectOption key={m.modalidad} value={m.modalidad}>
                {m.label}{rec.recomendada === m.modalidad ? " — recomendado" : ""}
              </SunmiSelectOption>
            ))}
          </SunmiSelectAdv>
          {!l.modalidadConfirmada && <div className="text-[10px] sunmi-text-danger">Seleccioná una modalidad para poder revisar los cambios.</div>}
        </div>
      )}

      {/* Cantidad / Precio: original → corregido */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] sunmi-text-muted">
            {l.puedeToggle ? (esPack ? "Packs corregidos" : "Unidades corregidas") : "Cant. corregida"}
            {!esNuevo && <> · orig. <span className="line-through">{fmtCant(l.cantidadOriginal)}</span></>}
          </span>
          <div className="flex items-center gap-1">
            <SunmiButton color="slate" type="button" onClick={() => setCant(Math.max(0, num(l.cantidad) - 1))}>−</SunmiButton>
            <SunmiInput
              type="text"
              inputMode="decimal"
              value={l.cantidad}
              onChange={(e) => { const raw = e.target.value; if (raw === "") { setCant(""); return; } const v = Number(raw.replace(",", ".")); setCant(Number.isFinite(v) ? Math.max(0, v) : 0); }}
              onBlur={() => { const cur = Number(l.cantidad); if (!Number.isFinite(cur) || cur < 0) setCant(0); }}
              className="w-[64px] text-center"
            />
            <SunmiButton color="slate" type="button" onClick={() => setCant(num(l.cantidad) + 1)}>+</SunmiButton>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] sunmi-text-muted">
            Precio corregido
            {!esNuevo && <> · orig. <span className="line-through">{money(l.precioOriginal)}</span></>}
          </span>
          <div className="flex items-center gap-0.5">
            <span className="sunmi-text-muted text-xs">$</span>
            <SunmiInput
              type="text"
              inputMode="decimal"
              value={l.precio}
              disabled={precioDeshab}
              onChange={(e) => onChange({ precio: e.target.value === "" ? 0 : Number(e.target.value.replace(",", ".")) })}
              className="w-[90px] text-center"
            />
          </div>
        </div>
      </div>

      {/* Subtotal original → corregido + diferencia */}
      <div className="flex items-center justify-between border-t sunmi-divider pt-2">
        <span className="text-xs sunmi-text-muted">
          Subtotal <span className="line-through">{money(subtotalOrig)}</span> → <span className="sunmi-text-strong font-semibold">{money(subtotalCorr)}</span>
        </span>
        <span className={`text-sm font-bold tabular-nums ${dif < 0 ? "sunmi-text-danger" : dif > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>
          {dif > 0 ? "+" : ""}{money(dif)}
        </span>
      </div>
    </div>
  );
}
