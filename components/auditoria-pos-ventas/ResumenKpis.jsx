"use client";

function formatPrecio(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ResumenKpis({ resumen }) {
  if (!resumen) return null;

  const {
    totalTickets,
    ventaBruta,
    comisionTotal,
    netoRecibido,
    costoVendido,
    gananciaNeta,
    margenPct,
    ticketPromedio,
  } = resumen;

  const gnNeg = gananciaNeta < 0;

  const kpis = [
    { label: "Facturado", value: `$${formatPrecio(ventaBruta)}` },
    { label: "Tickets", value: totalTickets ?? "—" },
    { label: "Comisiones", value: `$${formatPrecio(comisionTotal)}`, cls: "sunmi-text-accent" },
    { label: "Neto recibido", value: `$${formatPrecio(netoRecibido)}`, cls: "sunmi-text-success" },
    { label: "Costo", value: `$${formatPrecio(costoVendido)}`, cls: "sunmi-text-muted" },
    {
      label: "Ganancia",
      value: `$${formatPrecio(gananciaNeta)}`,
      cls: gnNeg ? "sunmi-text-danger" : "sunmi-text-success",
      bg: gnNeg ? "sunmi-state-danger" : "sunmi-state-success",
    },
    { label: "Margen", value: margenPct == null ? "—" : `${formatPrecio(margenPct)}%` },
    { label: "Ticket prom.", value: ticketPromedio == null ? "—" : `$${formatPrecio(ticketPromedio)}` },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5">
      {kpis.map((k) => (
        <div
          key={k.label}
          className={`${k.bg || "sunmi-surface"} px-2 py-1.5 rounded-lg text-center`}
        >
          <div className="text-[9px] sunmi-text-muted leading-tight">{k.label}</div>
          <div className={`text-sm font-bold tabular-nums leading-snug ${k.cls || ""}`}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}
