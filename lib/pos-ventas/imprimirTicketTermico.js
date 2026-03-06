/**
 * Impresion termica via browser print dialog.
 * Formato tipo ticket fiscal: encabezado, productos (nombre + cant x precio | subtotal), totales con lineas y TOTAL destacado.
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
  const fechaStr = now.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", year: "numeric" });
  const horaStr = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Items: linea 1 = nombre (wrap), linea 2 = "CANT x PRECIO" izq, SUBTOTAL der (indentado)
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);
    const subtotalItem = formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x ${formatPrecio(item.precio)}`;

    for (const ln of nameLines) {
      itemsHTML += `<div class="t-prod">${ln}</div>`;
    }
    itemsHTML += `<div class="t-item-lr"><span>${cantPrecio}</span><span>${subtotalItem}</span></div>`;
  }

  // Descuento (etiqueta "Desc." como en referencia)
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<div class="t-lr"><span>Desc.:</span><span>-${formatPrecio(venta.descuento)}</span></div>`;
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
    @page { size: ${anchoPx} auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      font-weight: 400;
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

    /* Encabezado */
    .t-disclaimer-top {
      text-align: center;
      font-size: 9px;
      font-weight: 400;
      margin-bottom: 1px;
    }
    .t-header {
      text-align: center;
      margin-bottom: 2px;
    }
    .t-local {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .t-doc {
      font-size: 11px;
      font-weight: 700;
      margin: 1px 0;
    }
    .t-meta {
      font-size: 11px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0 6px;
      margin-top: 1px;
    }
    .t-meta span { font-variant-numeric: tabular-nums; }

    /* Separador punteado (antes de totales) */
    .t-sep-dots {
      text-align: center;
      font-size: 10px;
      letter-spacing: 1px;
      margin: 2px 0;
    }
    /* Separador linea */
    .t-sep {
      border-top: 1px dashed #000;
      margin: 2px 0;
    }
    /* Linea gruesa (antes/despues TOTAL) */
    .t-sep-thick {
      text-align: center;
      font-size: 10px;
      letter-spacing: 2px;
      margin: 2px 0;
      font-weight: 700;
    }

    .t-lr {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      font-size: 12px;
    }
    .t-lr > span:first-child { min-width: 0; }
    .t-lr > span:last-child {
      flex-shrink: 0;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }

    /* Producto: nombre — negro y negrita para que imprima fuerte en Windows */
    .t-prod {
      font-size: 12px;
      font-weight: 700;
      color: #000;
      line-height: 1.15;
      word-break: break-word;
      margin-bottom: 0;
    }
    /* Una sola linea: "CANT x PRECIO" (izq) y SUBTOTAL (der). Sin wrap. */
    .t-item-lr {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      flex-wrap: nowrap;
      gap: 4px;
      font-size: 11px;
      font-weight: 700;
      color: #000;
      padding-left: 2px;
      margin-bottom: 1px;
    }
    .t-item-lr > span:first-child {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .t-item-lr > span:last-child {
      flex-shrink: 0;
      min-width: 10ch;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .t-subtotal { font-size: 12px; font-weight: 700; color: #000; margin-bottom: 0; }

    /* Bloque TOTAL: una fila "TOTAL $" | monto */
    .t-total-block { margin: 3px 0; }
    .t-total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: #000;
    }
    .t-total-row .t-total-amount { text-align: right; }

    .t-pago {
      text-align: center;
      font-size: 12px;
      font-weight: 700;
      margin: 2px 0;
      color: #000;
    }
    .t-vuelto { font-size: 12px; font-weight: 700; color: #000; }

    .t-footer {
      text-align: center;
      font-size: 13px;
      font-weight: 700;
      margin-top: 4px;
      color: #000;
    }
    .t-disclaimer {
      text-align: center;
      font-size: 9px;
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
  <div class="t-disclaimer-top">Documento no valido como factura</div>
  <div class="t-header">
    <div class="t-local">${(venta.localNombre || "POS Ventas").toUpperCase()}</div>
    <div class="t-doc">TICKET</div>
    <div class="t-meta">
      <span>Nro. ${String(venta.numero).padStart(8, "0")}</span>
      <span>Fecha ${fechaStr}</span>
      <span>Hora: ${horaStr}</span>
    </div>
    <div class="t-meta" style="justify-content: center; margin-top: 1px;">
      <span>Vendedor: ${venta.vendedor || "-"}</span>
    </div>
  </div>

  <div class="t-sep"></div>

  ${itemsHTML}

  <div class="t-sep-dots">........................</div>
  <div class="t-lr t-subtotal"><span>Subtotal:</span><span>${formatPrecio(venta.subtotal)}</span></div>
  ${descuentoHTML}
  <div class="t-sep-thick">================</div>
  <div class="t-total-block">
    <div class="t-total-row">
      <span>TOTAL $</span>
      <span class="t-total-amount">${formatPrecio(venta.total)}</span>
    </div>
  </div>
  <div class="t-sep-thick">================</div>

  <div class="t-pago">${String(venta.formaPago || "").toUpperCase()}</div>
  ${pagoHTML}

  <div class="t-sep"></div>
  <div class="t-footer">Gracias por su compra!</div>
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
