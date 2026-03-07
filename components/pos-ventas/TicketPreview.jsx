"use client";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const SAMPLE_DATA = {
  localNombre: "Mi Negocio",
  numero: "0042",
  vendedor: "Carlos",
  cliente: {
    nombre: "Juan Perez",
    documento: "30111222",
    telefono: "341-5551234",
    direccion: "Av. Pellegrini 1234, Rosario",
  },
  items: [
    { nombre: "Coca Cola 500ml", precio: 1500, cantidad: 2 },
    { nombre: "Alfajor triple chocolate", precio: 950, cantidad: 1 },
    { nombre: "Pan lactal grande", precio: 2800, cantidad: 1 },
  ],
  subtotal: 6750,
  descuento: 0,
  total: 6750,
  formaPago: "EFECTIVO",
  pagaCon: 10000,
  vuelto: 3250,
};

export default function TicketPreview({ config }) {
  const c = config;
  const v = SAMPLE_DATA;
  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const s = (key) => ({
    fontSize: c[key]?.fontSize + "px",
    fontWeight: c[key]?.fontWeight,
    textAlign: c[key]?.textAlign,
    fontFamily: c[key]?.fontFamily || "Arial",
    marginTop: (c[key]?.marginTop || 0) + "px",
    marginBottom: (c[key]?.marginBottom || 0) + "px",
  });

  const lrStyle = (key) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: "4px",
    fontSize: c[key]?.fontSize + "px",
    fontWeight: c[key]?.fontWeight,
    fontFamily: c[key]?.fontFamily || "Arial",
    marginTop: (c[key]?.marginTop || 0) + "px",
    marginBottom: (c[key]?.marginBottom || 0) + "px",
  });

  const clientRows = [
    { label: "Cliente:", value: v.cliente.nombre },
    { label: "Documento:", value: v.cliente.documento },
    { label: "Telefono:", value: v.cliente.telefono },
    { label: "Direccion:", value: v.cliente.direccion },
  ];

  return (
    <div
      style={{
        width: "48mm",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: "13px",
        background: "#fff",
        color: "#000",
        padding: "2mm 1.5mm",
        lineHeight: 1.2,
        boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
        margin: "0 auto",
      }}
    >
      {/* Encabezado desglosado */}
      <div style={{ marginBottom: "4px" }}>
        <div style={s("businessName")}>{v.localNombre}</div>
        <div style={s("ticketNumber")}>Ticket #{v.numero}</div>
        <div style={s("ticketDateTime")}>{fechaStr}  {horaStr}</div>
        <div style={s("sellerName")}>Vendedor: {v.vendedor}</div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Bloque cliente */}
      <div style={{ marginBottom: "2px" }}>
        {clientRows.map((row, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "4px",
              marginTop: (c.clientLabel?.marginTop || 0) + "px",
              marginBottom: (c.clientValue?.marginBottom || 0) + "px",
            }}
          >
            <span style={{
              fontSize: c.clientLabel?.fontSize + "px",
              fontWeight: c.clientLabel?.fontWeight,
              fontFamily: c.clientLabel?.fontFamily || "Arial",
              flexShrink: 0,
            }}>
              {row.label}
            </span>
            <span style={{
              fontSize: c.clientValue?.fontSize + "px",
              fontWeight: c.clientValue?.fontWeight,
              fontFamily: c.clientValue?.fontFamily || "Arial",
              wordBreak: "break-word",
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Items */}
      {v.items.map((item, i) => (
        <div key={i} style={{ marginBottom: "2px" }}>
          <div style={s("productName")}>{item.nombre}</div>
          <div style={lrStyle("qtyPrice")}>
            <span>{item.cantidad} x ${formatPrecio(item.precio)}</span>
            <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              ${formatPrecio(item.precio * item.cantidad)}
            </span>
          </div>
        </div>
      ))}

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Subtotal */}
      <div style={lrStyle("subtotal")}>
        <span>Subtotal:</span>
        <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          ${formatPrecio(v.subtotal)}
        </span>
      </div>

      {/* Total — franja completa de lado a lado.
          Se ignoran textAlign individuales; se usa flex space-between.
          Margen negativo horizontal compensa el padding del contenedor padre
          para que el fondo negro cubra todo el ancho del ticket. */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
        gap: "4px",
        ...(c.totalRowInverted ? {
          backgroundImage: 'url("/ticket/black.png")',
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
          backgroundColor: "#000",
          color: "#fff",
          marginLeft: "-1.5mm",
          marginRight: "-1.5mm",
          paddingLeft: "1.5mm",
          paddingRight: "1.5mm",
          paddingTop: "5px",
          paddingBottom: "5px",
          width: "calc(100% + 3mm)",
        } : {}),
        marginTop: Math.max(c.totalLabel?.marginTop || 0, c.totalAmount?.marginTop || 0, 6) + "px",
        marginBottom: Math.max(c.totalLabel?.marginBottom || 0, c.totalAmount?.marginBottom || 0, 6) + "px",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}>
        <span style={{
          fontSize: c.totalLabel?.fontSize + "px",
          fontWeight: c.totalLabel?.fontWeight,
          fontFamily: c.totalLabel?.fontFamily || "Arial",
        }}>TOTAL</span>
        <span style={{
          fontSize: c.totalAmount?.fontSize + "px",
          fontWeight: c.totalAmount?.fontWeight,
          fontFamily: c.totalAmount?.fontFamily || "Arial",
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}>${formatPrecio(v.total)}</span>
      </div>

      {/* Forma de pago */}
      <div style={s("paymentMethod")}>{v.formaPago}</div>

      {/* Paga con / vuelto */}
      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      <div style={lrStyle("paysWith")}>
        <span>Paga con:</span>
        <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          ${formatPrecio(v.pagaCon)}
        </span>
      </div>
      <div style={lrStyle("change")}>
        <span>Vuelto:</span>
        <span style={{ flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
          ${formatPrecio(v.vuelto)}
        </span>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Footer */}
      <div style={s("footer")}>Gracias por su compra</div>
      <div style={s("disclaimer")}>Documento no valido como factura</div>
    </div>
  );
}
