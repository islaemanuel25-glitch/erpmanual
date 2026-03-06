const {
  printer: ThermalPrinter,
  types: PrinterTypes,
} = require("node-thermal-printer");

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

function lineLR(left, right, width) {
  const gap = width - left.length - right.length;
  if (gap < 1) {
    const maxL = width - right.length - 1;
    return left.slice(0, Math.max(1, maxL)) + " " + right;
  }
  return left + " ".repeat(gap) + right;
}

async function buildTicket(venta, ancho, printerName) {
  if (!printerName) {
    throw new Error("No se encontro impresora configurada");
  }

  const chars = ancho === 58 ? 32 : 48;
  const nameChars = ancho === 58 ? 24 : 32;

  const tp = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `printer:${printerName}`,
    characterSet: "LATINA",
    removeSpecialCharacters: false,
    lineCharacter: "-",
    width: chars,
  });

  let connected;
  try {
    connected = await tp.isPrinterConnected();
  } catch {
    connected = false;
  }
  if (!connected) {
    throw new Error(
      `La impresora "${printerName}" no esta disponible. Verifica que este encendida y conectada por USB.`
    );
  }

  const now = new Date();
  const fechaStr = now.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // Encabezado
  tp.alignCenter();
  tp.setTextSize(1, 1);
  tp.bold(true);
  tp.println(venta.localNombre || "POS Ventas");
  tp.bold(false);
  tp.setTextNormal();
  tp.println(`Ticket #${venta.numero}`);
  tp.println(`${fechaStr}  ${horaStr}`);
  tp.alignLeft();
  tp.println(`Vendedor: ${venta.vendedor || "-"}`);

  tp.drawLine();

  // Items
  for (const item of venta.items) {
    const nameLines = wrapWords(item.nombre, nameChars);
    const subtotalItem = "$" + formatPrecio(item.precio * item.cantidad);
    const cantPrecio = `${item.cantidad} x $${formatPrecio(item.precio)}`;

    tp.bold(true);
    for (const ln of nameLines) {
      tp.println(ln);
    }
    tp.bold(false);
    tp.println(lineLR(cantPrecio, subtotalItem, chars));
  }

  tp.drawLine();

  // Subtotal
  tp.println(lineLR("Subtotal:", "$" + formatPrecio(venta.subtotal), chars));

  // Descuento
  if (venta.descuento && Number(venta.descuento) > 0) {
    tp.println(
      lineLR("Descuento:", "-$" + formatPrecio(venta.descuento), chars)
    );
  }

  // TOTAL
  tp.newLine();
  tp.alignCenter();
  tp.setTextSize(1, 1);
  tp.bold(true);
  tp.println("TOTAL");
  tp.setTextSize(2, 2);
  tp.println("$" + formatPrecio(venta.total));
  tp.setTextNormal();
  tp.bold(false);
  tp.newLine();

  // Forma de pago
  tp.alignCenter();
  tp.bold(true);
  tp.println(String(venta.formaPago || "").toUpperCase());
  tp.bold(false);

  // Paga con / vuelto
  if (venta.pagaCon) {
    tp.alignLeft();
    tp.drawLine();
    tp.println(
      lineLR("Paga con:", "$" + formatPrecio(venta.pagaCon), chars)
    );
    tp.bold(true);
    tp.setTextSize(1, 1);
    tp.println(lineLR("Vuelto:", "$" + formatPrecio(venta.vuelto), chars));
    tp.setTextNormal();
    tp.bold(false);
  }

  tp.drawLine();

  // Footer
  tp.alignCenter();
  tp.println("Gracias por su compra");
  tp.newLine();
  tp.newLine();

  tp.cut();
  await tp.execute();
}

module.exports = { buildTicket };
