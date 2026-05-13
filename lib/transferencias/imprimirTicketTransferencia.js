/**
 * Impresion termica de Transferencia via browser print dialog.
 * Copia el patron visual de lib/pos-ventas/imprimirTicketTermico.js
 * (mismas clases, mismo @page, misma fuente, mismos separadores)
 * pero con contenido de transferencia (sin precios/cobros).
 *
 * Lee la misma configuracion de tipografia que el ticket POS
 * desde localStorage (key: "ticket-config"), asi mantiene el mismo
 * look-and-feel que el cajero ya configuro.
 */

import { loadTicketConfig } from "@/lib/pos-ventas/ticketConfig";

function wrapWords(text, maxChars) {
  const words = String(text || "").split(/\s+/);
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
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function num(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function fmtFecha(d) {
  if (!d) return null;
  try {
    const f = new Date(d);
    const dia = f.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const hora = f.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} ${hora}`;
  } catch {
    return String(d);
  }
}

export default function imprimirTicketTransferencia(item, me, ancho = 58) {
  if (!item) return;

  const is58 = ancho === 58;
  const anchoPx = is58 ? "48mm" : "72mm";
  const nameChars = is58 ? 22 : 30;

  const tc = loadTicketConfig();

  const fechaPrincipal = item.fechaCreada
    ? new Date(item.fechaCreada)
    : new Date();
  const fechaStr = fechaPrincipal.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = fechaPrincipal.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const operador = me?.nombre || me?.email || me?.usuario || "-";
  const numeroTransfer = item.numero ?? item.id ?? "-";

  // Bloque Origen/Destino/Estado/Fechas (usa el mismo CSS .t-client-row del POS)
  const datosRows = [];
  if (item.origen?.nombre) datosRows.push({ label: "Origen:", value: item.origen.nombre });
  if (item.destino?.nombre) datosRows.push({ label: "Destino:", value: item.destino.nombre });
  if (item.estado) datosRows.push({ label: "Estado:", value: item.estado });
  if (item.fechaEnvio) datosRows.push({ label: "Envio:", value: fmtFecha(item.fechaEnvio) });
  if (item.fechaRecepcion) datosRows.push({ label: "Recepcion:", value: fmtFecha(item.fechaRecepcion) });

  let datosHTML = "";
  if (datosRows.length > 0) {
    datosHTML = `<div class="t-sep"></div>`;
    for (const r of datosRows) {
      datosHTML += `<div class="t-client-row"><span class="t-client-label">${escapeHtml(r.label)}</span> <span class="t-client-value">${escapeHtml(r.value)}</span></div>`;
    }
  }

  // Items
  const items = Array.isArray(item.items) ? item.items : [];
  let itemsHTML = "";
  let totalUnidades = 0;
  for (const it of items) {
    const nombre = it.nombre || "(sin nombre)";
    const cantidad = num(it.cantidadEnviada);
    totalUnidades += cantidad;

    const nameLines = wrapWords(nombre, nameChars);
    for (const ln of nameLines) {
      itemsHTML += `<div class="t-prod">${escapeHtml(ln)}</div>`;
    }
    const izq = it.codigoBarra ? `Cod: ${escapeHtml(it.codigoBarra)}` : "";
    const der = `Cant: ${cantidad}`;
    itemsHTML += `<div class="t-lr"><span>${izq}</span><span>${der}</span></div>`;
  }

  // Observacion (si existe)
  let observacionHTML = "";
  if (item.observacion) {
    observacionHTML = `
<div class="t-sep"></div>
<div class="t-prod"><strong>Observacion:</strong> ${escapeHtml(item.observacion)}</div>`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Transferencia #${escapeHtml(numeroTransfer)}</title>
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

    /* Cliente (reutilizado para Origen/Destino/Estado/Fechas) */
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

    /* Subtotal row (reutilizado para totales de items/unidades) */
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

    /* Footer */
    .t-footer {
      font-family: ${g(tc, "footer", "fontFamily")}, sans-serif;
      text-align: ${g(tc, "footer", "textAlign") || "center"};
      font-size: ${g(tc, "footer", "fontSize")}px;
      font-weight: ${g(tc, "footer", "fontWeight")};
      margin-top: ${g(tc, "footer", "marginTop")}px;
      margin-bottom: ${g(tc, "footer", "marginBottom")}px;
    }

    /* Firma manual */
    .t-firma-linea {
      border-top: 1px solid #000;
      margin-top: 14mm;
      margin-bottom: 2px;
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
    <div class="t-local">TRANSFERENCIA</div>
    <div class="t-ticket-num">N° ${escapeHtml(numeroTransfer)}</div>
    <div class="t-datetime">${fechaStr}  ${horaStr}</div>
    <div class="t-seller">Operador: ${escapeHtml(operador)}</div>
  </div>

  ${datosHTML}

  <div class="t-sep"></div>

  ${itemsHTML}

  <div class="t-sep"></div>

  <div class="t-lr t-subtotal"><span>Total items:</span><span>${items.length}</span></div>
  <div class="t-lr t-subtotal"><span>Total unidades:</span><span>${totalUnidades}</span></div>

  <div class="t-total">
    <span class="t-total-label">TRANSFERENCIA</span>
    <span class="t-total-monto">${items.length} items</span>
  </div>

  ${observacionHTML}

  <div class="t-firma-linea"></div>
  <div class="t-footer">Firma / Control</div>

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
