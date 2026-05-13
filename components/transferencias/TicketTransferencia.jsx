"use client";

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtFecha(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(d);
  }
}

export default function TicketTransferencia({ item, me }) {
  if (!item) return null;

  const items = Array.isArray(item.items) ? item.items : [];
  const totalItems = items.length;
  const totalUnidades = items.reduce(
    (acc, d) => acc + num(d.cantidadEnviada),
    0
  );

  const operador =
    me?.nombre || me?.email || me?.usuario || null;

  return (
    <>
      <style>{`
        @media screen {
          #ticket-transferencia-print { display: none; }
        }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #ticket-transferencia-print, #ticket-transferencia-print * {
            visibility: visible !important;
          }
          #ticket-transferencia-print {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            padding: 4mm 3mm;
            color: #000;
            background: #fff;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
            line-height: 1.25;
          }
          @page { margin: 0; size: 80mm auto; }
        }
      `}</style>

      <div id="ticket-transferencia-print">
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: "15px", marginBottom: "2px" }}>
          TRANSFERENCIA
        </div>
        <div style={{ textAlign: "center", fontSize: "11px", marginBottom: "4px" }}>
          {item.estado || "-"}
        </div>

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>N°:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {item.numero ?? item.id ?? "-"}
          </span>
        </div>

        {item.fechaCreada && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Creada:</span>
            <span>{fmtFecha(item.fechaCreada)}</span>
          </div>
        )}
        {item.fechaEnvio && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Envio:</span>
            <span>{fmtFecha(item.fechaEnvio)}</span>
          </div>
        )}
        {item.fechaRecepcion && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600 }}>Recepcion:</span>
            <span>{fmtFecha(item.fechaRecepcion)}</span>
          </div>
        )}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div>
          <span style={{ fontWeight: 600 }}>Origen: </span>
          <span>{item.origen?.nombre || "-"}</span>
        </div>
        <div>
          <span style={{ fontWeight: 600 }}>Destino: </span>
          <span>{item.destino?.nombre || "-"}</span>
        </div>
        {operador && (
          <div>
            <span style={{ fontWeight: 600 }}>Operador: </span>
            <span>{operador}</span>
          </div>
        )}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "12px", marginBottom: "2px" }}>
          <span>Producto</span>
          <span>Cant.</span>
        </div>

        {items.map((d, i) => (
          <div key={d.id ?? i} style={{ marginBottom: "3px" }}>
            <div style={{ fontWeight: 600, fontSize: "12px" }}>
              {d.nombre || "(sin nombre)"}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: "#000" }}>
                {d.codigoBarra ? `Cod: ${d.codigoBarra}` : ""}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {num(d.cantidadEnviada)}
              </span>
            </div>
          </div>
        ))}

        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Total items:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{totalItems}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Total unidades:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{totalUnidades}</span>
        </div>

        {item.observacion && (
          <>
            <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
            <div>
              <span style={{ fontWeight: 600 }}>Observacion: </span>
              <span>{item.observacion}</span>
            </div>
          </>
        )}

        <div style={{ marginTop: "14mm" }}>
          <div style={{ borderTop: "1px solid #000", marginTop: "4px" }} />
          <div style={{ textAlign: "center", fontSize: "11px", marginTop: "2px" }}>
            Firma / Control
          </div>
        </div>
      </div>
    </>
  );
}
