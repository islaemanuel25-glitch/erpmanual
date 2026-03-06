/**
 * Impresion termica via browser print dialog.
 * Abre una ventana con formato de ticket (58mm/80mm) y llama a window.print().
 */

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

export default function imprimirTicketTermico(venta, ancho = 58) {
  const is58 = ancho === 58;
  const anchoPx = is58 ? "48mm" : "72mm";
  const nameChars = is58 ? 24 : 32;
  const widthChars = is58 ? 32 : 48;

  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Items
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);
    const subtotalItem = "$" + formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;
    const line2 = buildLineLR(cantPrecio, subtotalItem, widthChars);

    for (const ln of nameLines) {
      itemsHTML += `<div class="t-item-name">${ln}</div>`;
    }
    itemsHTML += `<pre class="t-row">${line2}</pre>`;
  }

  // Descuento
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<pre class="t-row">${buildLineLR("Descuento:", "-$" + formatPrecio(venta.descuento), widthChars)}</pre>`;
  }

  // Pago efectivo
  let pagoHTML = "";
  if (venta.pagaCon) {
    pagoHTML = `
<pre class="t-line">${lineDash(widthChars)}</pre>
<pre class="t-row">${buildLineLR("Paga con:", "$" + formatPrecio(venta.pagaCon), widthChars)}</pre>
<pre class="t-row t-vuelto">${buildLineLR("Vuelto:", "$" + formatPrecio(venta.vuelto), widthChars)}</pre>`;
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
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: 700;
      width: ${anchoPx};
      margin: 0 auto;
      padding: 2mm 1mm;
      color: #000;
      line-height: 1.3;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Lineas monoespaciadas */
    pre, .t-row, .t-line {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: 700;
      white-space: pre;
      line-height: 1.3;
      margin: 0;
      padding: 0;
    }

    /* Separador */
    .t-line {
      font-weight: 400;
      line-height: 1;
      margin: 2px 0;
    }

    /* Encabezado */
    .t-header {
      text-align: center;
      margin-bottom: 2px;
    }
    .t-local {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.3px;
    }
    .t-sub {
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
    }

    /* Producto nombre */
    .t-item-name {
      font-size: 11px;
      font-weight: 900;
      line-height: 1.2;
    }

    /* Fila cantidad x precio */
    .t-row {
      margin-bottom: 4px;
    }

    /* Total */
    .t-total {
      text-align: center;
      margin: 4px 0;
    }
    .t-total-label {
      font-size: 12px;
      font-weight: 900;
    }
    .t-total-monto {
      font-size: 20px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }

    /* Forma de pago */
    .t-pago {
      text-align: center;
      font-size: 12px;
      font-weight: 900;
      margin: 2px 0;
    }

    /* Vuelto destacado */
    .t-vuelto {
      font-size: 13px;
      font-weight: 900;
    }

    /* Footer */
    .t-footer {
      text-align: center;
      font-size: 10px;
      font-weight: 600;
      margin-top: 4px;
    }

    /* Disclaimer */
    .t-disclaimer {
      text-align: center;
      font-size: 8px;
      font-weight: 400;
      margin-top: 2px;
    }

    @media print {
      body { margin: 0; padding: 1mm 1mm; }
    }

    /* Preview en pantalla */
    @media screen {
      html { background: #e5e5e5; }
      body {
        background: #fff;
        margin: 20px auto;
        padding: 3mm 2mm;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        min-height: 200px;
      }
    }
  </style>
</head>
<body>
  <div class="t-header">
    <div class="t-local">${venta.localNombre || "POS Ventas"}</div>
    <div class="t-sub">Ticket #${venta.numero}</div>
    <div class="t-sub">${fechaStr}  ${horaStr}</div>
    <div class="t-sub">Vendedor: ${venta.vendedor || "-"}</div>
  </div>

  <pre class="t-line">${lineDash(widthChars)}</pre>

  ${itemsHTML}

  <pre class="t-line">${lineDash(widthChars)}</pre>

  <pre class="t-row">${buildLineLR("Subtotal:", "$" + formatPrecio(venta.subtotal), widthChars)}</pre>
  ${descuentoHTML}

  <div class="t-total">
    <div class="t-total-label">TOTAL</div>
    <div class="t-total-monto">$${formatPrecio(venta.total)}</div>
  </div>

  <div class="t-pago">${String(venta.formaPago || "").toUpperCase()}</div>
  ${pagoHTML}

  <pre class="t-line">${lineDash(widthChars)}</pre>
  <div class="t-footer">Gracias por su compra</div>
  <div class="t-disclaimer">Documento no valido como factura</div>

  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 1200);
    };
  </script>
</body>
</html>`;

  const ventana = window.open("", "_blank", "width=360,height=600");
  if (ventana) {
    ventana.document.write(html);
    ventana.document.close();
  }
}
