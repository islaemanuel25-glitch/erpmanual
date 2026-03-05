/**
 * Impresion termica via browser print dialog.
 * Abre una ventana con formato de ticket (58mm/80mm) y llama a window.print().
 */

// ── Constantes de ajuste fino ──
const FONT_BODY = 12;
const FONT_ITEM = 13;
const FONT_TOTAL = 20;
const FONT_LOCAL = 16;
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

/**
 * Construye una linea con texto a izquierda y derecha,
 * rellenando con espacios para completar widthChars.
 * Si left + right exceden, trunca left.
 */
function buildLineLR(left, right, widthChars) {
  const gap = widthChars - left.length - right.length;
  if (gap < 1) {
    const maxLeft = widthChars - right.length - 1;
    return left.slice(0, maxLeft) + " " + right;
  }
  return left + " ".repeat(gap) + right;
}

function lineDash(widthChars) {
  return "-".repeat(widthChars);
}

export default function imprimirTicketTermico(venta, ancho = 80) {
  const anchoPx = ancho === 58 ? "48mm" : "72mm";
  const nameChars = ancho === 58 ? 24 : 32;
  const widthChars = ancho === 58 ? 32 : 48;
  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Construir HTML de items con alineacion por caracteres
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);
    const subtotalItem = "$" + formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;
    const line2 = buildLineLR(cantPrecio, subtotalItem, widthChars);

    for (const ln of nameLines) {
      itemsHTML += `<div class="item-name">${ln}</div>`;
    }
    itemsHTML += `<pre class="mono-line">${line2}</pre>`;
  }

  // Descuento
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<pre class="mono-line">${buildLineLR("Descuento:", "-$" + formatPrecio(venta.descuento), widthChars)}</pre>`;
  }

  // Pago efectivo
  let pagoEfectivoHTML = "";
  if (venta.pagaCon) {
    pagoEfectivoHTML = `
<pre class="dash">${lineDash(widthChars)}</pre>
<pre class="mono-line">${buildLineLR("Paga con:", "$" + formatPrecio(venta.pagaCon), widthChars)}</pre>
<pre class="mono-line vuelto">${buildLineLR("Vuelto:", "$" + formatPrecio(venta.vuelto), widthChars)}</pre>`;
  }

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

    /* Lineas monoespaciadas para alineacion por caracteres */
    pre, .mono-line, .dash {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${FONT_BODY}px;
      font-weight: 700;
      white-space: pre;
      line-height: 1.4;
      margin: 0;
      padding: 0;
    }
    .dash {
      font-weight: 400;
      line-height: 1.2;
      margin: 4px 0;
      color: #000;
    }

    /* Header */
    .header-center {
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      margin: 1px 0;
    }
    .header-factura {
      text-align: center;
      font-size: 14px;
      font-weight: ${WEIGHT_STRONG};
      letter-spacing: 1px;
      margin-bottom: 1px;
    }
    .local-name {
      text-align: center;
      font-size: ${FONT_LOCAL}px;
      font-weight: ${WEIGHT_STRONG};
      letter-spacing: 0.5px;
      margin: 4px 0 2px 0;
    }
    .header-disclaimer {
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      margin: 3px 0;
    }

    /* Items */
    .item-name {
      font-family: Arial, Helvetica, sans-serif;
      font-size: ${FONT_ITEM}px;
      font-weight: 800;
      word-break: break-word;
      line-height: 1.3;
      margin-bottom: 1px;
    }
    .mono-line {
      margin-bottom: 6px;
    }

    /* Total */
    .total-section {
      text-align: center;
      margin: 6px 0;
    }
    .total-label {
      font-size: 14px;
      font-weight: 800;
    }
    .total-monto {
      font-size: ${FONT_TOTAL}px;
      font-weight: ${WEIGHT_STRONG};
      letter-spacing: 0.5px;
    }
    .forma-pago {
      text-align: center;
      font-size: ${FONT_BODY}px;
      font-weight: 800;
      margin: 3px 0;
    }
    .vuelto {
      font-size: 14px;
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
  <div class="header-factura">FACTURA</div>
  <div class="header-center">ORIGINAL</div>
  <div class="local-name">${venta.localNombre || "POS Ventas"}</div>
  <div class="header-center">Nro: ${venta.numero}</div>
  <div class="header-center">Fecha: ${fechaStr}</div>
  <div class="header-center">Hora: ${horaStr}</div>
  <div class="header-center">Vendedor: ${venta.vendedor || "-"}</div>
  <div class="header-disclaimer">Documento no valido como factura</div>

  <pre class="dash">${lineDash(widthChars)}</pre>

  ${itemsHTML}

  <pre class="dash">${lineDash(widthChars)}</pre>

  <pre class="mono-line">${buildLineLR("Subtotal:", "$" + formatPrecio(venta.subtotal), widthChars)}</pre>
  ${descuentoHTML}

  <div class="total-section">
    <div class="total-label">TOTAL:</div>
    <div class="total-monto">$${formatPrecio(venta.total)}</div>
  </div>

  <div class="forma-pago">${venta.formaPago}</div>
  ${pagoEfectivoHTML}

  <pre class="dash">${lineDash(widthChars)}</pre>
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
