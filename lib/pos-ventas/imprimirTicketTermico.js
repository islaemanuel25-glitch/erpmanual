/**
 * Impresion termica via browser print dialog.
 * Abre una ventana con formato de ticket (58mm/80mm) y llama a window.print().
 */

// ── Constantes de ajuste fino ──
const FONT_BODY = 12;
const FONT_ITEM = 13;
const FONT_TOTAL = 22;
const FONT_LOCAL = 18;
const WEIGHT_STRONG = 900;

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Divide un texto en lineas que no excedan maxChars,
 * cortando por palabras. Si una palabra sola excede, la trunca.
 */
function wrapWords(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    } else if ((current + " " + word).length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export default function imprimirTicketTermico(venta, ancho = 80) {
  const anchoPx = ancho === 58 ? "48mm" : "72mm";
  const chars = ancho === 58 ? 24 : 32;
  const fecha = new Date().toLocaleString("es-AR");

  // Construir HTML de items con wrap por palabras
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre.toUpperCase(), chars);
    const subtotalItem = formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;

    for (const line of nameLines) {
      itemsHTML += `<div class="item-name">${line}</div>`;
    }
    itemsHTML += `<div class="item-line2"><span>${cantPrecio}</span><span class="item-subt">$${subtotalItem}</span></div>`;
  }

  // Descuento
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<div class="linea"><span>Descuento:</span><span>-$${formatPrecio(venta.descuento)}</span></div>`;
  }

  // Pago efectivo
  const pagoEfectivoHTML = venta.pagaCon
    ? `<div class="sep-dash"></div>
       <div class="linea"><span>Paga con:</span><span>$${formatPrecio(venta.pagaCon)}</span></div>
       <div class="linea vuelto"><span>Vuelto:</span><span>$${formatPrecio(venta.vuelto)}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket #${venta.numero}</title>
  <style>
    @page {
      size: ${anchoPx} auto;
      margin: 0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${FONT_BODY}px;
      font-weight: 600;
      width: ${anchoPx};
      margin: 0 auto;
      padding: 3mm 1.5mm;
      color: #000;
      text-rendering: geometricPrecision;
      -webkit-font-smoothing: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Separadores */
    .sep-solid {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .sep-dash {
      border-top: 1px dashed #000;
      margin: 5px 0;
    }

    /* Header */
    .local-name {
      text-align: center;
      font-size: ${FONT_LOCAL}px;
      font-weight: ${WEIGHT_STRONG};
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .ticket-info {
      text-align: center;
      font-size: ${FONT_BODY}px;
      font-weight: 700;
      margin: 1px 0;
    }
    .vendedor {
      font-size: ${FONT_BODY}px;
      font-weight: 700;
      margin: 2px 0;
    }

    /* Items */
    .item-name {
      font-size: ${FONT_ITEM}px;
      font-weight: 800;
      text-transform: uppercase;
      word-break: break-word;
      line-height: 1.3;
      margin-bottom: 1px;
    }
    .item-line2 {
      display: flex;
      justify-content: space-between;
      font-size: ${FONT_BODY}px;
      font-weight: 700;
      margin-bottom: 7px;
    }
    .item-subt {
      font-weight: 800;
    }

    /* Totales */
    .linea {
      display: flex;
      justify-content: space-between;
      font-size: ${FONT_BODY}px;
      font-weight: 700;
      margin: 2px 0;
    }
    .total-box {
      text-align: center;
      font-size: ${FONT_TOTAL}px;
      font-weight: ${WEIGHT_STRONG};
      letter-spacing: 0.5px;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 6px 0;
      margin: 6px 0;
    }
    .forma-pago {
      font-size: ${FONT_BODY}px;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      margin: 3px 0;
    }
    .vuelto {
      font-size: 16px;
      font-weight: ${WEIGHT_STRONG};
    }

    /* Footer */
    .footer {
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      margin-top: 6px;
    }

    @media print {
      body { margin: 0; padding: 2mm 1.5mm; }
    }
  </style>
</head>
<body>
  <div class="local-name">${venta.localNombre || "POS Ventas"}</div>
  <div class="ticket-info">Ticket #${venta.numero}</div>
  <div class="ticket-info">${fecha}</div>
  <div class="vendedor">Vendedor: ${venta.vendedor || "-"}</div>

  <div class="sep-solid"></div>

  ${itemsHTML}

  <div class="sep-solid"></div>

  <div class="linea"><span>Subtotal:</span><span>$${formatPrecio(venta.subtotal)}</span></div>
  ${descuentoHTML}

  <div class="total-box">TOTAL: $${formatPrecio(venta.total)}</div>

  <div class="forma-pago">${venta.formaPago}</div>
  ${pagoEfectivoHTML}

  <div class="sep-dash"></div>
  <div class="footer">Gracias por su compra</div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1000);
    };
  </script>
</body>
</html>`;

  const ventana = window.open("", "_blank", "width=400,height=600");
  if (ventana) {
    ventana.document.write(html);
    ventana.document.close();
  }
}
