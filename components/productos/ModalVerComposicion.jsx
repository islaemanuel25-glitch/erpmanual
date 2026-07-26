"use client";

import { useEffect, useState } from "react";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

// ============================================================
// Modal de SOLO LECTURA para ver la composición de un combo (desde el listado).
// 100% temático (tokens/clases del sistema). Carga el DTO autoritativo del backend.
// ============================================================
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ModalVerComposicion({ open, productoLocalId, localId, onClose, onEditar }) {
  const [combo, setCombo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !productoLocalId || !localId) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      setError(null);
      setCombo(null);
      try {
        const res = await fetch(`/api/combos/${productoLocalId}?localId=${localId}`, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (!vivo) return;
        if (!res.ok || !data?.ok) setError(data?.error || "No se pudo cargar el combo.");
        else setCombo(data.combo);
      } catch {
        if (vivo) setError("No se pudo cargar el combo.");
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [open, productoLocalId, localId]);

  const limitante = (() => {
    if (!combo?.componentes?.length) return null;
    let min = Infinity;
    let nom = null;
    for (const c of combo.componentes) {
      if (!c.activo || !c.tieneStockLocal || !(Number(c.cantidad) > 0)) continue;
      const d = Math.floor(Number(c.stock) / Number(c.cantidad));
      if (d < min) {
        min = d;
        nom = c.nombre;
      }
    }
    return nom;
  })();

  return (
    <SunmiModalLayout
      open={open}
      title="Composición del combo"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <SunmiButton color="slate" onClick={onClose}>
            Cerrar
          </SunmiButton>
          <SunmiButton color="amber" onClick={() => onEditar?.(productoLocalId)}>
            Editar combo
          </SunmiButton>
        </div>
      }
    >
      {loading && (
        <div className="flex justify-center p-4">
          <SunmiLoader />
        </div>
      )}
      {error && <p className="text-[12px] sunmi-text-danger">{error}</p>}
      {combo && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14px] font-semibold">{combo.nombre}</p>
            <SunmiPill color="cyan">Combo</SunmiPill>
          </div>

          <div className="overflow-x-auto rounded-lg border sunmi-divider">
            <table className="w-full text-[12px] table-auto">
              <thead className="bg-[var(--table-header-bg)] text-[var(--table-header-fg)] text-[11px]">
                <tr>
                  <th className="text-left font-semibold px-2 py-1.5">Componente</th>
                  <th className="text-right font-semibold px-2 py-1.5">Cantidad</th>
                  <th className="text-right font-semibold px-2 py-1.5">Costo unit.</th>
                  <th className="text-right font-semibold px-2 py-1.5">Subtotal</th>
                  <th className="text-right font-semibold px-2 py-1.5">Stock</th>
                  <th className="text-left font-semibold px-2 py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y sunmi-divider">
                {combo.componentes.map((c) => (
                  <tr key={c.comboComponenteId} className="hover:bg-[var(--table-row-hover)] transition">
                    <td className="px-2 py-1.5 font-medium">{c.nombre}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.cantidad}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{money(c.costoUnitario)}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">{money(c.costoLinea)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{c.stock ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      {!c.activo ? (
                        <SunmiPill color="amber">Desactivado</SunmiPill>
                      ) : !c.tieneStockLocal ? (
                        <SunmiPill color="amber">Sin stock</SunmiPill>
                      ) : (
                        <SunmiPill color="slate">OK</SunmiPill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
            <Kpi label="Precio" value={money(combo.precio_venta)} />
            <Kpi label="Costo total" value={money(combo.costoTotal)} />
            <Kpi label="Ganancia" value={money(combo.ganancia)} />
            <Kpi label="Margen" value={combo.margen == null ? "—" : `${combo.margen}%`} />
          </div>

          <div className="rounded-lg border sunmi-divider p-2">
            {combo.bloqueadoEstructural ? (
              <p className="text-[12px] sunmi-text-danger">
                Composición inválida (componente desactivado / sin stock / cantidad inválida). No se puede vender hasta corregirla.
              </p>
            ) : (
              <>
                <p className="text-[13px] font-semibold">Disponibilidad actual: {combo.disponibilidad} combos</p>
                {limitante && <p className="text-[11px] sunmi-text-muted">Limitado por: {limitante}</p>}
                {combo.allowNegativeStock && (
                  <p className="text-[11px] sunmi-text-warning">Esta ubicación permite vender con stock negativo.</p>
                )}
              </>
            )}
            <p className="text-[10px] sunmi-text-muted mt-1">
              La disponibilidad se calcula según el stock de los productos que contiene.
            </p>
          </div>
        </div>
      )}
    </SunmiModalLayout>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-lg sunmi-surface-soft p-2">
      <div className="text-[10px] sunmi-text-muted">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
