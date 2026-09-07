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
    comisionParcial,
    ventasPendientes,
  } = resumen;

  const gnNeg = gananciaNeta < 0;

  // TRES DE ESTOS OCHO NÚMEROS NO SON EXACTOS SI HAY VENTAS PENDIENTES.
  //
  // Comisión, neto y ganancia suman ceros estructurales de ventas que se
  // cobraron sin la comisión configurada. Se siguen mostrando —el subtotal
  // conocido sirve para tener una idea— pero rotulados, porque un número sin
  // rótulo se lee como cerrado. El margen directamente no se muestra: sale
  // inflado y no hay forma de rotular un porcentaje falso.
  const parcial = comisionParcial === true;
  const sufijoParcial = parcial ? " (parcial)" : "";

  const kpis = [
    { label: "Facturado", value: `$${formatPrecio(ventaBruta)}` },
    { label: "Tickets", value: totalTickets ?? "—" },
    {
      label: `Comisiones${sufijoParcial}`,
      value: `$${formatPrecio(comisionTotal)}`,
      cls: "sunmi-text-accent",
    },
    {
      label: `Neto recibido${sufijoParcial}`,
      value: `$${formatPrecio(netoRecibido)}`,
      cls: "sunmi-text-success",
    },
    { label: "Costo", value: `$${formatPrecio(costoVendido)}`, cls: "sunmi-text-muted" },
    {
      label: `Ganancia${sufijoParcial}`,
      value: `$${formatPrecio(gananciaNeta)}`,
      cls: gnNeg ? "sunmi-text-danger" : "sunmi-text-success",
      bg: gnNeg ? "sunmi-state-danger" : "sunmi-state-success",
    },
    {
      label: "Margen",
      value: parcial ? "Pendiente" : margenPct == null ? "—" : `${formatPrecio(margenPct)}%`,
    },
    { label: "Ticket prom.", value: ticketPromedio == null ? "—" : `$${formatPrecio(ticketPromedio)}` },
  ];

  return (
    <div className="space-y-1.5">
      {/* Dicho con palabras y con el número de ventas, porque "(parcial)" en un
          rótulo explica QUE falta algo pero no QUÉ. */}
      {parcial && (
        <p className="text-sm2 sunmi-text-muted px-1">
          {ventasPendientes === 1
            ? "1 venta se cobró sin la comisión configurada: comisión, neto y ganancia son parciales."
            : `${ventasPendientes} ventas se cobraron sin la comisión configurada: comisión, neto y ganancia son parciales.`}
        </p>
      )}
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
    </div>
  );
}
