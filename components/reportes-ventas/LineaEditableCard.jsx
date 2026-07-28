"use client";

// Tarjeta editable de UNA línea de la corrección (patrón "recibir mercadería"):
// muestra original vs corregido (cantidad/precio/subtotal + diferencia), permite
// editar/eliminar, y resuelve el estado de consumo LEGACY:
//   · reconstruido (auto)  → badge "Consumo histórico reconstruido" + modalidad/física.
//   · ambiguo              → bloque "Consumo original no registrado" + selector de
//                            modalidad (el admin DEBE elegir conscientemente).

const money = (n) => `$ ${Number(n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtCant = (n) => { const x = Number(n); return Number.isInteger(x) ? String(x) : x.toLocaleString("es-AR", { maximumFractionDigits: 3 }); };

export default function LineaEditableCard({ linea, onChange, onRemove, permiteEditarPrecio }) {
  const l = linea;
  const rec = l.reconstruccion || null;
  const subtotalOrig = Number(l.precioOriginal) * Number(l.cantidadOriginal);
  const subtotalCorr = Number(l.precio) * Number(l.cantidad);
  const dif = subtotalCorr - subtotalOrig;
  const esAmbiguo = rec?.estado === "ambiguo";
  const precioDeshab = l.esCombo || l.esServicio;

  return (
    <div className="sunmi-surface rounded-lg p-3 space-y-2">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">
            {l.nombre}
            {l.esCombo ? <span className="ml-1 text-[10px] sunmi-text-muted">(combo)</span> : null}
            {l.esServicio ? <span className="ml-1 text-[10px] sunmi-text-muted">(servicio)</span> : null}
          </div>
          <div className="text-[11px] sunmi-text-muted flex flex-wrap gap-x-2">
            {l.codigo ? <span>Cód. {l.codigo}</span> : null}
            {l.presentacion ? <span>{l.presentacion}</span> : null}
          </div>
        </div>
        <button type="button" className="text-[11px] sunmi-text-danger underline shrink-0" onClick={onRemove}>eliminar</button>
      </div>

      {/* Bloque LEGACY */}
      {rec?.estado === "reconstruido" && (
        <div className="text-[11px] sunmi-state-success sunmi-text-success rounded px-2 py-1">
          ✓ Consumo histórico reconstruido — {rec.modalidad || "—"} · {fmtCant(rec.cantidadFisica)} u
        </div>
      )}
      {esAmbiguo && (
        <div className="sunmi-state-warning rounded px-2 py-1.5 space-y-1.5">
          <div className="text-[11px] sunmi-text-accent font-medium">⚠ Consumo original no registrado</div>
          <div className="text-[10px] sunmi-text-muted">Esta venta es anterior al registro de consumo exacto de stock. Indicá cómo se vendió originalmente:</div>
          <select
            value={l.modalidadConfirmada || ""}
            onChange={(e) => onChange({ modalidadConfirmada: e.target.value || null })}
            className="sunmi-input w-full text-sm"
          >
            <option value="">Elegí la modalidad…</option>
            {(rec.modalidadesPosibles || []).map((m) => (
              <option key={m.modalidad} value={m.modalidad}>
                {m.label}{rec.recomendada === m.modalidad ? " — recomendado" : ""}
              </option>
            ))}
          </select>
          {!l.modalidadConfirmada && <div className="text-[10px] sunmi-text-danger">Seleccioná una modalidad para poder revisar los cambios.</div>}
        </div>
      )}

      {/* Cantidad / Precio: original → corregido */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] sunmi-text-muted">Cantidad</div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] sunmi-text-muted line-through tabular-nums">{fmtCant(l.cantidadOriginal)}</span>
            <span className="text-[11px]">→</span>
            <input type="number" min="0" step="0.001" value={l.cantidad}
              onChange={(e) => onChange({ cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
              className="sunmi-input w-20 text-sm" />
          </div>
        </div>
        <div>
          <div className="text-[10px] sunmi-text-muted">Precio unit.</div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] sunmi-text-muted line-through tabular-nums">{money(l.precioOriginal)}</span>
            <span className="text-[11px]">→</span>
            <input type="number" min="0" step="0.01" value={l.precio} disabled={precioDeshab || !permiteEditarPrecio}
              onChange={(e) => onChange({ precio: e.target.value === "" ? 0 : Number(e.target.value) })}
              className="sunmi-input w-24 text-sm disabled:opacity-50" />
          </div>
        </div>
      </div>

      {/* Subtotal + diferencia */}
      <div className="flex items-center justify-between text-[12px] pt-1 border-t sunmi-divider">
        <span className="sunmi-text-muted">Subtotal <span className="line-through">{money(subtotalOrig)}</span> → <span className="font-semibold">{money(subtotalCorr)}</span></span>
        <span className={`tabular-nums font-medium ${dif < 0 ? "sunmi-text-danger" : dif > 0 ? "sunmi-text-accent" : "sunmi-text-muted"}`}>
          {dif > 0 ? "+" : ""}{money(dif)}
        </span>
      </div>
    </div>
  );
}
