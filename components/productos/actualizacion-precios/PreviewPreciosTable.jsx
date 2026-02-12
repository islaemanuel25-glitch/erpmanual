"use client";

import SunmiTable from "@/components/sunmi/SunmiTable";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

function formatMoney(value) {
  const num = Number(value ?? 0);
  return money.format(Number.isFinite(num) ? num : 0);
}

function changePct(item) {
  const base = Number(item?.costoAnterior || 0);
  if (!base) return 0;
  return ((Number(item?.costoNuevo || 0) - base) / base) * 100;
}

export default function PreviewPreciosTable({
  items,
  selectedIds,
  onToggleOne,
  onToggleAll,
}) {
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  return (
    <div className="rounded-lg border border-slate-800 overflow-hidden">
      <SunmiTable
        headers={[
          <label key="all" className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-400"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
            <span>Todos</span>
          </label>,
          "Producto",
          "Costo anterior",
          "Costo nuevo",
          "% costo",
          "Venta anterior",
          "Venta nueva",
          "Alertas",
        ]}
      >
        {items.map((item) => {
          const key = String(item.productoBaseId);
          const pct = changePct(item);
          const alertas = Array.isArray(item.alertas) ? item.alertas : [];

          return (
            <tr key={key} className="bg-slate-900/50 hover:bg-slate-800/60">
              <td className="px-2 py-2 align-top">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-amber-400"
                  checked={selectedIds.has(key)}
                  onChange={(e) => onToggleOne(key, e.target.checked)}
                />
              </td>
              <td className="px-2 py-2 align-top">{item.nombre || "-"}</td>
              <td className="px-2 py-2 text-slate-300 align-top">{formatMoney(item.costoAnterior)}</td>
              <td className="px-2 py-2 align-top">{formatMoney(item.costoNuevo)}</td>
              <td className="px-2 py-2 align-top">{pct.toFixed(2)}%</td>
              <td className="px-2 py-2 text-slate-300 align-top">{formatMoney(item.ventaAnterior)}</td>
              <td className="px-2 py-2 align-top">{formatMoney(item.ventaNueva)}</td>
              <td className="px-2 py-2 text-xs text-amber-200 align-top">
                {alertas.length ? alertas.join(" · ") : "-"}
              </td>
            </tr>
          );
        })}
      </SunmiTable>
    </div>
  );
}
