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

export default function imprimirTicketTermico(venta, ancho = 80) {
  const anchoPx = ancho === 58 ? "48mm" : "72mm";
  const fecha = new Date().toLocaleString("es-AR");

  const itemsHTML = venta.items
    .map(
      (item) => `
      <tr>
        <td style="text-align:left">${item.nombre}</td>
        <td style="text-align:center">${item.cantidad}</td>
        <td style="text-align:right">$${formatPrecio(item.precio * item.cantidad)}</td>
      </tr>`
    )
    .join("");

  const comisionHTML =
    venta.comision > 0
      ? `<div class="linea">Comision 7%: <strong>+$${formatPrecio(venta.comision)}</strong></div>`
      : "";

  const pagoEfectivoHTML = venta.pagaCon
    ? `<div class="sep"></div>
       <div class="linea">Paga con: $${formatPrecio(venta.pagaCon)}</div>
       <div class="linea" style="font-size:16px;font-weight:bold">Vuelto: $${formatPrecio(venta.vuelto)}</div>`
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
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: ${anchoPx};
      margin: 0 auto;
      padding: 4mm 2mm;
      color: #000;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .sep {
      border-top: 1px dashed #000;
      margin: 4px 0;
    }
    .linea {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
    }
    .total {
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      margin: 6px 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    td { padding: 1px 0; }
    @media print {
      body { margin: 0; padding: 2mm; }
    }
  </style>
</head>
<body>
  <div class="center bold" style="font-size:14px">${venta.localNombre || "POS Ventas"}</div>
  <div class="center" style="font-size:10px">Ticket #${venta.numero}</div>
  <div class="center" style="font-size:10px">${fecha}</div>
  <div style="font-size:10px">Vendedor: ${venta.vendedor || "-"}</div>

  <div class="sep"></div>

  <table>
    <thead>
      <tr>
        <td><strong>Prod.</strong></td>
        <td style="text-align:center"><strong>Cant</strong></td>
        <td style="text-align:right"><strong>Subt</strong></td>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div class="sep"></div>

  <div class="linea">Subtotal: <strong>$${formatPrecio(venta.subtotal)}</strong></div>
  ${comisionHTML}
  <div class="total">TOTAL: $${formatPrecio(venta.total)}</div>
  <div class="linea" style="font-size:10px">Pago: ${venta.formaPago}</div>
  ${pagoEfectivoHTML}

  <div class="sep"></div>
  <div class="center" style="font-size:10px;margin-top:4px">Gracias por su compra</div>

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
