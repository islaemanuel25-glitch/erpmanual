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

export default function imprimirTicketTermico(venta, ancho = 58) {
  const is58 = ancho === 58;
  const anchoPx = is58 ? "48mm" : "72mm";
  const nameChars = is58 ? 22 : 30;

  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Items — nombre en sans-serif, precio en flex row
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);
    const subtotalItem = "$" + formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;

    for (const ln of nameLines) {
      itemsHTML += `<div class="t-prod">${ln}</div>`;
    }
    itemsHTML += `<div class="t-lr"><span>${cantPrecio}</span><span>${subtotalItem}</span></div>`;
  }

  // Descuento
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<div class="t-lr"><span>Descuento:</span><span>-$${formatPrecio(venta.descuento)}</span></div>`;
  }

  // Pago efectivo
  let pagoHTML = "";
  if (venta.pagaCon) {
    pagoHTML = `
<div class="t-sep"></div>
<div class="t-lr"><span>Paga con:</span><span>$${formatPrecio(venta.pagaCon)}</span></div>
<div class="t-lr t-vuelto"><span>Vuelto:</span><span>$${formatPrecio(venta.vuelto)}</span></div>`;
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
      font-size: 13px;
      font-weight: normal;
      width: ${anchoPx};
      max-width: ${anchoPx};
      overflow: hidden;
      margin: 0 auto;
      padding: 2mm 1.5mm;
      color: #000;
      line-height: 1.2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Separador */
    .t-sep {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }

    /* Fila izq-der (flex, nunca desborda) */
    .t-lr {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      font-size: 13px;
      font-weight: normal;
      margin-bottom: 2px;
    }
    .t-lr > span:first-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .t-lr > span:last-child {
      flex-shrink: 0;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* Encabezado */
    .t-header {
      text-align: center;
      margin-bottom: 4px;
    }
    .t-local {
      font-size: 17px;
      font-weight: 700;
    }
    .t-sub {
      font-size: 12px;
      font-weight: normal;
      line-height: 1.3;
    }

    /* Nombre producto */
    .t-prod {
      font-size: 13px;
      font-weight: 400;
      line-height: 1.15;
      word-break: break-word;
    }

    /* Fila cant x precio debajo del producto */
    .t-item-row {
      margin-bottom: 5px;
    }

    /* Subtotal row */
    .t-subtotal {
      font-size: 13px;
    }

    /* Total */
    .t-total {
      text-align: center;
      margin: 6px 0;
    }
    .t-total-label {
      font-size: 15px;
      font-weight: 700;
    }
    .t-total-monto {
      font-size: 14px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    /* Forma de pago */
    .t-pago {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      margin: 3px 0;
    }

    /* Vuelto destacado */
    .t-vuelto {
      font-size: 14px;
      font-weight: 700;
    }

    /* Footer */
    .t-footer {
      text-align: center;
      font-size: 12px;
      font-weight: normal;
      margin-top: 6px;
    }

    /* Disclaimer */
    .t-disclaimer {
      text-align: center;
      font-size: 9px;
      font-weight: normal;
      margin-top: 2px;
    }

    @media print {
      body { margin: 0; padding: 1mm 1.5mm; }
    }

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

  <div class="t-sep"></div>

  ${itemsHTML}

  <div class="t-sep"></div>

  <div class="t-lr t-subtotal"><span>Subtotal:</span><span>$${formatPrecio(venta.subtotal)}</span></div>
  ${descuentoHTML}

  <div class="t-total">
    <div class="t-total-label">TOTAL</div>
    <div class="t-total-monto">$${formatPrecio(venta.total)}</div>
  </div>

  <div class="t-pago">${String(venta.formaPago || "").toUpperCase()}</div>
  ${pagoHTML}

  <div class="t-sep"></div>
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
