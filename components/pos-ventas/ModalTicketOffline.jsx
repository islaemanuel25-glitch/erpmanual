"use client";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { subtotalLinea } from "@/lib/pos-ventas/lineaPorImporte";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFecha(timestamp) {
  // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
  return fechaHoraAR(timestamp);
}

export default function ModalTicketOffline({ ticket, onCerrar }) {
  const handleImprimir = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Ticket Offline - ${ticket.clientVentaIdCorto}</title>
            <style>
              @media print {
                @page {
                  size: 80mm auto;
                  margin: 0;
                }
                body {
                  margin: 0;
                  padding: 10px;
                }
              }
              body {
                font-family: 'Courier New', monospace;
                font-size: 11px;
                padding: 15px;
                max-width: 300px;
                margin: 0 auto;
                background: white;
                color: black;
              }
              .header {
                text-align: center;
                border-bottom: 2px dashed #000;
                padding-bottom: 10px;
                margin-bottom: 10px;
              }
              .pendiente {
                font-weight: bold;
                font-size: 13px;
                color: #dc2626;
                margin: 10px 0;
                text-transform: uppercase;
              }
              .info {
                margin: 4px 0;
                font-size: 10px;
              }
              .items {
                border-top: 1px dashed #000;
                border-bottom: 1px dashed #000;
                padding: 8px 0;
                margin: 10px 0;
              }
              .item {
                display: flex;
                justify-content: space-between;
                margin: 3px 0;
                font-size: 10px;
              }
              .item-name {
                flex: 1;
                margin-right: 10px;
              }
              .totales {
                margin-top: 10px;
              }
              .total {
                font-weight: bold;
                font-size: 13px;
                border-top: 2px solid #000;
                padding-top: 5px;
                margin-top: 5px;
              }
              .footer {
                text-align: center;
                margin-top: 15px;
                font-size: 9px;
                color: #333;
                border-top: 1px dashed #000;
                padding-top: 10px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="pendiente">⚠ PENDIENTE DE SINCRONIZACIÓN ⚠</div>
              <div class="info"><strong>${ticket.localNombre}</strong></div>
              <div class="info">Local ID: ${ticket.localId}</div>
              <div class="info">${formatFecha(ticket.createdAt)}</div>
            </div>

            <div class="info">
              <strong>Usuario:</strong> ${ticket.vendedor}
            </div>
            <div class="info">
              <strong>Forma de pago:</strong> ${ticket.formaPago.toUpperCase()}
            </div>
            ${ticket.cliente && ticket.cliente !== "Consumidor Final" ? `
            <div class="info">
              <strong>Cliente:</strong> ${ticket.cliente}
            </div>
            ` : ''}

            <div class="items">
              ${ticket.items.map((item, idx) => `
                <div class="item">
                  <span class="item-name">${item.cantidad}x ${item.nombre}</span>
                  <span>$${formatPrecio(subtotalLinea(item))}</span>
                </div>
              `).join('')}
            </div>

            <div class="totales">
              <div class="item">
                <span>Subtotal:</span>
                <span>$${formatPrecio(ticket.subtotal)}</span>
              </div>
              ${ticket.descuento > 0 ? `
              <div class="item">
                <span>Descuento:</span>
                <span>-$${formatPrecio(ticket.descuento)}</span>
              </div>
              ` : ''}
              ${ticket.descuentoPorPuntos > 0 ? `
              <div class="item">
                <span>Descuento por puntos:</span>
                <span>-$${formatPrecio(ticket.descuentoPorPuntos)}</span>
              </div>
              ` : ''}
              <div class="total">
                <div class="item">
                  <span>TOTAL:</span>
                  <span>$${formatPrecio(ticket.total)}</span>
                </div>
              </div>
            </div>

            ${ticket.pagaCon ? `
            <div class="info">
              <div>Paga con: $${formatPrecio(ticket.pagaCon)}</div>
              ${ticket.vuelto > 0 ? `<div>Vuelto: $${formatPrecio(ticket.vuelto)}</div>` : ''}
            </div>
            ` : ''}

            <div class="footer">
              <div><strong>ID:</strong> ${ticket.clientVentaIdCorto}</div>
              <div style="margin-top: 8px;">
                Se enviará automáticamente cuando vuelva internet.
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        // No cerrar automáticamente para que el usuario pueda ver el resultado
      }, 250);
    } else {
      // Fallback: usar window.print() directamente
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4">
        <div className="text-center mb-4">
          <div className="sunmi-text-danger text-3xl mb-2">⚠</div>
          <h3 className="text-lg font-bold sunmi-text-danger">PENDIENTE DE SINCRONIZACIÓN</h3>
        </div>


        {/* Vista previa en pantalla */}
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          <div className="text-center border-b sunmi-divider pb-2">
            <div className="sunmi-text-danger font-bold text-sm mb-1">⚠ PENDIENTE DE SINCRONIZACIÓN ⚠</div>
            <div className="text-xs sunmi-text-muted">{ticket.localNombre} (ID: {ticket.localId})</div>
            <div className="text-xs sunmi-text-muted">{formatFecha(ticket.createdAt)}</div>
          </div>

          <div className="text-xs space-y-1">
            <div><strong>Usuario:</strong> {ticket.vendedor || "-"}</div>
            <div><strong>Forma de pago:</strong> {ticket.formaPago.toUpperCase()}</div>
            {ticket.cliente && ticket.cliente !== "Consumidor Final" && (
              <div><strong>Cliente:</strong> {ticket.cliente}</div>
            )}
          </div>

          <div className="border-t border-b sunmi-divider py-2 space-y-1">
            {ticket.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span>{item.cantidad}x {item.nombre}</span>
                <span>${formatPrecio(subtotalLinea(item))}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>${formatPrecio(ticket.subtotal)}</span>
            </div>
            {ticket.descuento > 0 && (
              <div className="flex justify-between">
                <span>Descuento:</span>
                <span>-${formatPrecio(ticket.descuento)}</span>
              </div>
            )}
            {ticket.descuentoPorPuntos > 0 && (
              <div className="flex justify-between">
                <span>Descuento por puntos:</span>
                <span>-${formatPrecio(ticket.descuentoPorPuntos)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t sunmi-divider pt-1 mt-1">
              <span>TOTAL:</span>
              <span>${formatPrecio(ticket.total)}</span>
            </div>
          </div>

          {ticket.pagaCon && (
            <div className="text-xs space-y-1">
              <div>Paga con: ${formatPrecio(ticket.pagaCon)}</div>
              {ticket.vuelto > 0 && (
                <div>Vuelto: ${formatPrecio(ticket.vuelto)}</div>
              )}
            </div>
          )}

          <div className="text-center text-xs sunmi-text-muted border-t sunmi-divider pt-2">
            <div><strong>ID:</strong> {ticket.clientVentaIdCorto}</div>
            <div className="mt-1">Se enviará automáticamente cuando vuelva internet.</div>
          </div>
        </div>

        <div className="space-y-2">
          <SunmiButton
            color="cyan"
            onClick={handleImprimir}
            className="w-full py-3"
          >
            IMPRIMIR
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onCerrar}
            className="w-full py-3"
          >
            CERRAR
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}

