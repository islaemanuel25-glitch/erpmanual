import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const transferenciaId = Number(searchParams.get("id"));

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        origen: true,
        destino: true,
        detalle: {
          include: { producto: { include: { base: true } } }
        }
      }
    });

    if (!transferencia) {
      return NextResponse.json(
        { ok: false, error: "Transferencia no encontrada" },
        { status: 404 }
      );
    }


    // ===========================================================
    // 🔥 CONFIG PDF PRO
    // ===========================================================
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Transferencia #${transferenciaId}`);
    pdf.setAuthor("ERP Azul");

    const pageWidth = 595;   // A4 ancho
    const pageHeight = 842;  // A4 alto
    const margin = 40;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const draw = (text, x, y, size = 9, f = font) =>
      page.drawText(String(text), { x, y, size, font: f });

    // ===========================================================
    // 🔥 ENCABEZADO
    // ===========================================================
    draw(`Transferencia #${transferenciaId}`, margin, y, 18, bold);
    y -= 28;

    draw("Origen:", margin, y, 10, bold);
    draw(transferencia.origen.nombre, margin + 80, y, 10);
    y -= 14;

    draw("Destino:", margin, y, 10, bold);
    draw(transferencia.destino.nombre, margin + 80, y, 10);
    y -= 14;

    draw("Estado:", margin, y, 10, bold);
    draw(transferencia.estado, margin + 80, y, 10);
    y -= 14;

    draw("Fecha envío:", margin, y, 10, bold);
    draw(
      transferencia.fechaEnvio
        ? new Date(transferencia.fechaEnvio).toLocaleString()
        : "-",
      margin + 90,
      y,
      10
    );
    y -= 20;

    // Línea separadora
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });
    y -= 18;


    // ===========================================================
    // 🔥 COLUMNAS PRO
    // ===========================================================
    const col = {
      producto: margin,
      cod: margin + 180,
      cant: margin + 270,
      costo: margin + 345,
      subt: margin + 430  // ✔ distancia PRO, no se corta
    };

    draw("Producto", col.producto, y, 10, bold);
    draw("Código", col.cod, y, 10, bold);
    draw("Cant.", col.cant, y, 10, bold);
    draw("Costo", col.costo, y, 10, bold);
    draw("Subtotal", col.subt, y, 10, bold);

    y -= 14;

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });
    y -= 12;


    // ===========================================================
    // 🔥 DETALLE
    // ===========================================================
    let total = 0;
    let row = 0;

    for (const d of transferencia.detalle) {
      const nombre = d.producto?.nombre ?? d.producto?.base?.nombre ?? "-";
      const codigo = d.producto?.codigo_barra ?? "-";
      const cantidad = Number(d.cantidad) || 0;
      const costo =
        Number(d.precioCosto) ||
        Number(d.producto?.base?.precio_costo) ||
        0;
      const subtotal = cantidad * costo;

      total += subtotal;

      // Fondo alternado
      if (row % 2 === 0) {
        page.drawRectangle({
          x: margin - 5,
          y: y - 1,
          width: pageWidth - margin * 2 + 10,
          height: 15,
          color: rgb(0.96, 0.96, 0.96),
        });
      }

      draw(nombre.substring(0, 35), col.producto, y);
      draw(codigo, col.cod, y);
      draw(String(cantidad), col.cant, y);
      draw(`$${costo.toFixed(2)}`, col.costo, y);
      draw(`$${subtotal.toFixed(2)}`, col.subt, y);

      y -= 16; // ✔ espaciado PRO
      row++;

      if (y < margin + 80) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    }


    // ===========================================================
    // 🔥 TOTAL — ABAJO DEL TODO + LÍNEA
    // ===========================================================
    const totalY = margin + 15;

    page.drawLine({
      start: { x: margin, y: totalY + 20 },
      end: { x: pageWidth - margin, y: totalY + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });

    draw("TOTAL:", col.subt - 60, totalY, 14, bold);
    draw(`$${total.toFixed(2)}`, col.subt, totalY, 14, bold);


    const bytes = await pdf.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=transferencia_${transferenciaId}.pdf`
      }
    });

  } catch (err) {
    console.error("❌ Error PDF:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
