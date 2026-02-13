import jsPDF from "jspdf";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function generarTicketPDF(venta) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  // Header
  doc.setFontSize(18);
  doc.text(venta.localNombre || "POS Ventas", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.text(`Ticket #${venta.numero}`, 105, 30, { align: "center" });

  // Datos venta
  doc.setFontSize(11);
  doc.text(`Fecha: ${new Date().toLocaleString("es-AR")}`, 20, 45);
  doc.text(`Vendedor: ${venta.vendedor || "-"}`, 20, 52);
  doc.text(`Forma de pago: ${venta.formaPago}`, 20, 59);

  // Linea separadora
  doc.setDrawColor(150);
  doc.line(20, 65, 190, 65);

  // Encabezados tabla
  let y = 75;
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.text("Producto", 20, y);
  doc.text("Cant", 120, y, { align: "center" });
  doc.text("Precio", 150, y, { align: "right" });
  doc.text("Subtotal", 185, y, { align: "right" });

  doc.setFont(undefined, "normal");
  y += 3;
  doc.line(20, y, 190, y);
  y += 7;

  // Items
  venta.items.forEach((item) => {
    const nombre =
      item.nombre.length > 40
        ? item.nombre.substring(0, 37) + "..."
        : item.nombre;
    doc.text(nombre, 20, y);
    doc.text(String(item.cantidad), 120, y, { align: "center" });
    doc.text(`$${formatPrecio(item.precio)}`, 150, y, { align: "right" });
    doc.text(`$${formatPrecio(item.precio * item.cantidad)}`, 185, y, {
      align: "right",
    });
    y += 7;
  });

  // Totales
  y += 3;
  doc.line(20, y, 190, y);
  y += 8;

  doc.text("SUBTOTAL:", 150, y, { align: "right" });
  doc.text(`$${formatPrecio(venta.subtotal)}`, 185, y, { align: "right" });
  y += 7;

  if (venta.comision > 0) {
    doc.text(`Comision 7%:`, 150, y, { align: "right" });
    doc.text(`+$${formatPrecio(venta.comision)}`, 185, y, { align: "right" });
    y += 7;
  }

  if (venta.descuento > 0) {
    doc.text("Descuento:", 150, y, { align: "right" });
    doc.text(`-$${formatPrecio(venta.descuento)}`, 185, y, { align: "right" });
    y += 7;
  }

  y += 3;
  doc.setFontSize(14);
  doc.setFont(undefined, "bold");
  doc.text("TOTAL:", 150, y, { align: "right" });
  doc.text(`$${formatPrecio(venta.total)}`, 185, y, { align: "right" });

  // Pago en efectivo
  if (venta.pagaCon) {
    y += 10;
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(`Paga con: $${formatPrecio(venta.pagaCon)}`, 20, y);
    y += 7;
    doc.text(`Vuelto: $${formatPrecio(venta.vuelto)}`, 20, y);
  }

  // Footer
  doc.setFontSize(10);
  doc.setFont(undefined, "normal");
  doc.text("Gracias por su compra", 105, 280, { align: "center" });

  doc.save(`ticket-${venta.numero}.pdf`);
}
