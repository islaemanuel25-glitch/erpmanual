/**
 * Impresion termica via browser print dialog.
 * Abre una ventana con formato de ticket (58mm/80mm) y llama a window.print().
 * Lee configuracion de tipografia desde localStorage (key: "ticket-config").
 */

import { loadTicketConfig } from "./ticketConfig";
import { lineasPagoTicket, esPagoDividido } from "./pagos";
import { snapshotServicioTicket } from "./servicios";
import { subtotalLinea } from "./lineaPorImporte";
import { fechaAR, horaAR } from "../fechas/formatearFechaHora";
// La etiqueta del medio sale del kit de recargos y no de un objeto escrito acá:
// el ticket, el POS y la pantalla de configuración tienen que nombrar los medios
// exactamente igual.
import { MEDIO_RECARGO_LABEL } from "../recargos-pago/recargoPago";

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

function g(tc, key, prop) {
  if (prop === "fontFamily") return tc[key]?.fontFamily || "Arial";
  return tc[key]?.[prop] ?? 0;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// opts.copia = true → marca visible "REIMPRESIÓN — COPIA" y conserva el número
// y la fecha originales (los datos vienen del histórico en `venta`). Sin la
// opción, comportamiento idéntico al de la venta en vivo (no rompe el POS).
export default function imprimirTicketTermico(venta, ancho = 58, opts = {}) {
  const copia = opts?.copia === true;
  const is58 = ancho === 58;
  const anchoPx = is58 ? "48mm" : "72mm";
  const nameChars = is58 ? 22 : 30;

  const tc = loadTicketConfig();

  const fechaTicket = venta.fecha ? new Date(venta.fecha) : new Date();
  // EN ARGENTINA Y EN 24 HORAS, igual que el PDF. Antes las dos líneas usaban la
  // zona DEL DISPOSITIVO —tres horas de más en una Sunmi que quedó en UTC— y la
  // hora salía con "a. m." / "p. m.".
  const fechaStr = fechaAR(fechaTicket);
  const horaStr = horaAR(fechaTicket, { segundos: true });

  // Items
  let itemsHTML = "";
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);

    for (const ln of nameLines) {
      itemsHTML += `<div class="t-prod">${escapeHtml(ln)}</div>`;
    }

    if (item.esServicio) {
      // Servicio de importe variable: desglose importe / recargo / total (snapshot).
      const s = snapshotServicioTicket(item);
      itemsHTML += `<div class="t-lr"><span>Carga solicitada:</span><span>$${formatPrecio(s.importeBase)}</span></div>`;
      if (s.mostrarRecargo) {
        itemsHTML += `<div class="t-lr"><span>Recargo ${s.recargoPct}%:</span><span>$${formatPrecio(s.recargoImporte)}</span></div>`;
      }
      itemsHTML += `<div class="t-lr"><span>Total:</span><span>$${formatPrecio(s.total)}</span></div>`;
    } else {
      const subtotalItem = "$" + formatPrecio(subtotalLinea(item));
      const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;
      itemsHTML += `<div class="t-lr"><span>${cantPrecio}</span><span>${subtotalItem}</span></div>`;
    }
  }

  // Descuento
  let descuentoHTML = "";
  if (venta.descuento && Number(venta.descuento) > 0) {
    descuentoHTML = `<div class="t-lr"><span>Descuento:</span><span>-$${formatPrecio(venta.descuento)}</span></div>`;
  }

  // ── CONDICIÓN COMERCIAL: QUÉ SE AHORRÓ Y QUÉ SE SUMÓ ─────────────────────
  //
  // Las líneas ya se imprimen al precio COBRADO, así que Σ (cantidad × precio)
  // da el subtotal y el ticket cierra sin esto. Estos dos renglones no están
  // para que cierre: están para que se pueda LEER por qué el total no es la
  // suma de los precios de la góndola.
  //
  // El ahorro va como un renglón y no como una columna en cada línea: el papel
  // tiene 58 mm y una segunda columna de precios tachados lo vuelve ilegible.
  // El renglón dice el total ahorrado, que es lo que el cliente mira.
  //
  // El recargo NOMBRA EL MEDIO que lo impuso. "Recargo: $450" a secas se lee
  // como un cargo arbitrario; "Recargo Débito 5 %" se puede discutir en el
  // mostrador con el papel en la mano. En un pago combinado ese medio es el de
  // la condición más alta, que puede no ser con el que se pagó casi todo.
  let condicionHTML = "";
  const ahorro = Number(venta.descuentoPromocional) || 0;
  if (ahorro > 0) {
    condicionHTML += `<div class="t-lr"><span>Ahorro por ofertas:</span><span>-$${formatPrecio(ahorro)}</span></div>`;
  }
  const recargo = Number(venta.recargoPagoImporte) || 0;
  if (recargo > 0) {
    const etiquetaMedio = MEDIO_RECARGO_LABEL[venta.recargoPagoMedio] || venta.recargoPagoMedio || "";
    const pct = Number(venta.recargoPagoPct) || 0;
    const detalle = [etiquetaMedio, pct > 0 ? `${pct} %` : ""].filter(Boolean).join(" ");
    condicionHTML += `<div class="t-lr"><span>Recargo${detalle ? ` ${detalle}` : ""}:</span><span>+$${formatPrecio(recargo)}</span></div>`;
  }

  // Bloque cliente (solo si existe)
  let clienteHTML = "";
  const cl = venta.cliente;
  if (cl) {
    const rows = [];
    if (cl.nombre) rows.push({ label: "Cliente:", value: cl.nombre });
    if (cl.documento) rows.push({ label: "Documento:", value: cl.documento });
    if (cl.telefono) rows.push({ label: "Telefono:", value: cl.telefono });
    if (cl.direccion) rows.push({ label: "Direccion:", value: cl.direccion });
    if (rows.length > 0) {
      clienteHTML = `<div class="t-sep"></div>`;
      for (const r of rows) {
        clienteHTML += `<div class="t-client-row"><span class="t-client-label">${escapeHtml(r.label)}</span> <span class="t-client-value">${escapeHtml(r.value)}</span></div>`;
      }
    }
  }

  // Pago efectivo (paga con / vuelto) — solo display, no altera montos.
  let pagoHTML = "";
  if (venta.pagaCon) {
    pagoHTML = `
<div class="t-sep"></div>
<div class="t-lr t-pays"><span>Paga con:</span><span>$${formatPrecio(venta.pagaCon)}</span></div>
<div class="t-lr t-vuelto"><span>Vuelto:</span><span>$${formatPrecio(venta.vuelto)}</span></div>`;
  }

  // Desglose de pagos desde el snapshot de tenders (VentaPago). Venta con 1 medio:
  // una sola línea; venta dividida (≥2): todas las líneas + comisión/neto.
  const lineasPago = lineasPagoTicket(venta);
  const dividido = esPagoDividido(venta);
  const comisionV = Number(venta.comisionBancaria) || 0;
  const netoV = Number(venta.netoRecibido) || 0;
  let medioPagoHTML;
  if (dividido) {
    medioPagoHTML = `
<div class="t-pago" style="text-align:left">Pagos:</div>
${lineasPago.map((l) => `<div class="t-lr t-pays"><span>${l.label}:</span><span>$${formatPrecio(l.monto)}</span></div>`).join("")}
${comisionV > 0 ? `<div class="t-lr"><span>Comisión bancaria:</span><span>-$${formatPrecio(comisionV)}</span></div><div class="t-lr"><span>Neto recibido:</span><span>$${formatPrecio(netoV)}</span></div>` : ""}`;
  } else {
    medioPagoHTML = `<div class="t-pago">${String(lineasPago[0]?.label || venta.formaPago || "").toUpperCase()}</div>`;
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

    /* Marca de reimpresión / copia */
    .t-copia {
      border: 1px solid #000;
      text-align: center;
      font-weight: bold;
      font-size: 12px;
      letter-spacing: 1px;
      padding: 2px 0;
      margin-bottom: 4px;
    }

    /* Fila izq-der (flex, nunca desborda) */
    .t-lr {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      font-family: ${g(tc, "qtyPrice", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "qtyPrice", "fontSize")}px;
      font-weight: ${g(tc, "qtyPrice", "fontWeight")};
      margin-bottom: ${g(tc, "qtyPrice", "marginBottom")}px;
      margin-top: ${g(tc, "qtyPrice", "marginTop")}px;
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
      margin-bottom: 4px;
    }
    .t-local {
      font-family: ${g(tc, "businessName", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "businessName", "fontSize")}px;
      font-weight: ${g(tc, "businessName", "fontWeight")};
      text-align: ${g(tc, "businessName", "textAlign") || "center"};
      margin-top: ${g(tc, "businessName", "marginTop")}px;
      margin-bottom: ${g(tc, "businessName", "marginBottom")}px;
    }
    .t-ticket-num {
      font-family: ${g(tc, "ticketNumber", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "ticketNumber", "fontSize")}px;
      font-weight: ${g(tc, "ticketNumber", "fontWeight")};
      text-align: ${g(tc, "ticketNumber", "textAlign") || "center"};
      line-height: 1.3;
      margin-top: ${g(tc, "ticketNumber", "marginTop")}px;
      margin-bottom: ${g(tc, "ticketNumber", "marginBottom")}px;
    }
    .t-datetime {
      font-family: ${g(tc, "ticketDateTime", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "ticketDateTime", "fontSize")}px;
      font-weight: ${g(tc, "ticketDateTime", "fontWeight")};
      text-align: ${g(tc, "ticketDateTime", "textAlign") || "center"};
      line-height: 1.3;
      margin-top: ${g(tc, "ticketDateTime", "marginTop")}px;
      margin-bottom: ${g(tc, "ticketDateTime", "marginBottom")}px;
    }
    .t-seller {
      font-family: ${g(tc, "sellerName", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "sellerName", "fontSize")}px;
      font-weight: ${g(tc, "sellerName", "fontWeight")};
      text-align: ${g(tc, "sellerName", "textAlign") || "center"};
      line-height: 1.3;
      margin-top: ${g(tc, "sellerName", "marginTop")}px;
      margin-bottom: ${g(tc, "sellerName", "marginBottom")}px;
    }

    /* Cliente */
    .t-client-row {
      display: flex;
      gap: 4px;
      margin-top: ${g(tc, "clientLabel", "marginTop")}px;
      margin-bottom: ${g(tc, "clientValue", "marginBottom")}px;
    }
    .t-client-label {
      font-family: ${g(tc, "clientLabel", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "clientLabel", "fontSize")}px;
      font-weight: ${g(tc, "clientLabel", "fontWeight")};
      flex-shrink: 0;
    }
    .t-client-value {
      font-family: ${g(tc, "clientValue", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "clientValue", "fontSize")}px;
      font-weight: ${g(tc, "clientValue", "fontWeight")};
      word-break: break-word;
    }

    /* Nombre producto */
    .t-prod {
      font-family: ${g(tc, "productName", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "productName", "fontSize")}px;
      font-weight: ${g(tc, "productName", "fontWeight")};
      text-align: ${g(tc, "productName", "textAlign") || "left"};
      line-height: 1.15;
      word-break: break-word;
      margin-top: ${g(tc, "productName", "marginTop")}px;
      margin-bottom: ${g(tc, "productName", "marginBottom")}px;
    }

    /* Fila cant x precio debajo del producto */
    .t-item-row {
      margin-bottom: 5px;
    }

    /* Subtotal row */
    .t-subtotal {
      font-family: ${g(tc, "subtotal", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "subtotal", "fontSize")}px;
      font-weight: ${g(tc, "subtotal", "fontWeight")};
      margin-top: ${g(tc, "subtotal", "marginTop")}px;
      margin-bottom: ${g(tc, "subtotal", "marginBottom")}px;
    }

    /* Total — fila unica, label izq + importe der, bordes finos */
    .t-total {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 4px;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      margin-top: ${Math.max(g(tc, "totalLabel", "marginTop"), g(tc, "totalAmount", "marginTop"), 6)}px;
      margin-bottom: ${Math.max(g(tc, "totalLabel", "marginBottom"), g(tc, "totalAmount", "marginBottom"), 6)}px;
    }
    .t-total-label {
      font-family: ${g(tc, "totalLabel", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "totalLabel", "fontSize")}px;
      font-weight: ${g(tc, "totalLabel", "fontWeight")};
    }
    .t-total-monto {
      font-family: ${g(tc, "totalAmount", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "totalAmount", "fontSize")}px;
      font-weight: ${g(tc, "totalAmount", "fontWeight")};
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      text-align: right;
    }

    /* Forma de pago */
    .t-pago {
      font-family: ${g(tc, "paymentMethod", "fontFamily")}, sans-serif;
      text-align: ${g(tc, "paymentMethod", "textAlign") || "center"};
      font-size: ${g(tc, "paymentMethod", "fontSize")}px;
      font-weight: ${g(tc, "paymentMethod", "fontWeight")};
      margin-top: ${g(tc, "paymentMethod", "marginTop")}px;
      margin-bottom: ${g(tc, "paymentMethod", "marginBottom")}px;
    }

    /* Paga con */
    .t-pays {
      font-family: ${g(tc, "paysWith", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "paysWith", "fontSize")}px;
      font-weight: ${g(tc, "paysWith", "fontWeight")};
      margin-top: ${g(tc, "paysWith", "marginTop")}px;
      margin-bottom: ${g(tc, "paysWith", "marginBottom")}px;
    }

    /* Vuelto destacado */
    .t-vuelto {
      font-family: ${g(tc, "change", "fontFamily")}, sans-serif;
      font-size: ${g(tc, "change", "fontSize")}px;
      font-weight: ${g(tc, "change", "fontWeight")};
      margin-top: ${g(tc, "change", "marginTop")}px;
      margin-bottom: ${g(tc, "change", "marginBottom")}px;
    }

    /* Footer */
    .t-footer {
      font-family: ${g(tc, "footer", "fontFamily")}, sans-serif;
      text-align: ${g(tc, "footer", "textAlign") || "center"};
      font-size: ${g(tc, "footer", "fontSize")}px;
      font-weight: ${g(tc, "footer", "fontWeight")};
      margin-top: ${g(tc, "footer", "marginTop")}px;
      margin-bottom: ${g(tc, "footer", "marginBottom")}px;
    }

    /* Disclaimer */
    .t-disclaimer {
      font-family: ${g(tc, "disclaimer", "fontFamily")}, sans-serif;
      text-align: ${g(tc, "disclaimer", "textAlign") || "center"};
      font-size: ${g(tc, "disclaimer", "fontSize")}px;
      font-weight: ${g(tc, "disclaimer", "fontWeight")};
      margin-top: ${g(tc, "disclaimer", "marginTop")}px;
      margin-bottom: ${g(tc, "disclaimer", "marginBottom")}px;
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
  ${copia ? `<div class="t-copia">REIMPRESIÓN — COPIA</div>` : ""}
  <div class="t-header">
    <div class="t-local">${escapeHtml(venta.localNombre || "POS Ventas")}</div>
    <div class="t-ticket-num">Ticket #${venta.numero}</div>
    <div class="t-datetime">${fechaStr}  ${horaStr}</div>
    <div class="t-seller">Vendedor: ${escapeHtml(venta.vendedor || "-")}</div>
  </div>

  ${clienteHTML}

  <div class="t-sep"></div>

  ${itemsHTML}

  <div class="t-sep"></div>

  <div class="t-lr t-subtotal"><span>Subtotal:</span><span>$${formatPrecio(venta.subtotal)}</span></div>
  ${condicionHTML}
  ${descuentoHTML}

  <div class="t-total">
    <span class="t-total-label">TOTAL</span>
    <span class="t-total-monto">$${formatPrecio(venta.total)}</span>
  </div>

  ${medioPagoHTML}
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
