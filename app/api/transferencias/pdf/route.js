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

    // ===========================================================
    // 🔥 Obtener transferencia con todo lo necesario
    // ===========================================================
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        origen: true,
        destino: true,
        detalle: {
          include: {
            producto: {
              include: { base: true }
            }
          }
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
    // 🔥 Crear PDF
    // ===========================================================
    const pdf = await PDFDocument.create();
    const pageWidth = 600;
    const pageHeight = 820;

    let page = pdf.addPage([pageWidth, pageHeight]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let y = 780;

    const drawText = (text, x, y, size = 12, f = font) => {
      page.drawText(String(text), { x, y, size, font: f });
    };

    // ===========================================================
    // 🔥 TÍTULO PRINCIPAL
    // ===========================================================
    drawText(`Transferencia #${transferenciaId}`, 180, y, 24, bold);
    y -= 40;

    // ===========================================================
    // 🔥 DATOS GENERALES
    // ===========================================================
    drawText("Origen:", 50, y, 12, bold);
    drawText(transferencia.origen.nombre, 150, y);
    y -= 18;

    drawText("Destino:", 50, y, 12, bold);
    drawText(transferencia.destino.nombre, 150, y);
    y -= 18;

    drawText("Estado:", 50, y, 12, bold);
    drawText(transferencia.estado, 150, y);
    y -= 18;

    drawText("Fecha envío:", 50, y, 12, bold);
    drawText(
      transferencia.fechaEnvio
        ? new Date(transferencia.fechaEnvio).toLocaleString()
        : "-",
      150,
      y
    );
    y -= 30;

    // Separador
    page.drawLine({
      start: { x: 50, y },
      end: { x: 550, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 30;

    // ===========================================================
    // 🔥 ENCABEZADO DE TABLA
    // ===========================================================
    drawText("Detalle del envío", 50, y, 16, bold);
    y -= 25;

    drawText("Producto", 50, y, 12, bold);
    drawText("Código", 230, y, 12, bold);
    drawText("Cant.", 350, y, 12, bold);
    drawText("Costo", 410, y, 12, bold);
    drawText("Subtotal", 480, y, 12, bold);
    y -= 15;

    page.drawLine({
      start: { x: 50, y },
      end: { x: 550, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 20;

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
        Number(d.producto?.precio_costo) ||
        Number(d.producto?.base?.precio_costo) ||
        0;

      const subtotal = cantidad * costo;
      total += subtotal;

      // Fondo intercalado
      if (row % 2 === 0) {
        page.drawRectangle({
          x: 45,
          y: y - 2,
          width: 510,
          height: 20,
          color: rgb(0.95, 0.95, 0.95),
        });
      }

      drawText(nombre.substring(0, 28), 50, y);
      drawText(codigo, 230, y);
      drawText(String(cantidad), 350, y);
      drawText(`$${costo.toFixed(2)}`, 410, y);
      drawText(`$${subtotal.toFixed(2)}`, 480, y);

      y -= 22;
      row++;

      // Cambio automático de página
      if (y < 80) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = 760;
      }
    }

    // ===========================================================
    // 🔥 TOTAL — SIEMPRE EN ÚLTIMA PÁGINA
    // ===========================================================
    const totalPage = pdf.addPage([pageWidth, pageHeight]);
    let yTotal = 760;

    totalPage.drawText("TOTAL DE LA TRANSFERENCIA", {
      x: 50,
      y: yTotal,
      size: 16,
      font: bold,
    });

    yTotal -= 40;

    totalPage.drawRectangle({
      x: 50,
      y: yTotal - 10,
      width: 500,
      height: 40,
      color: rgb(0.95, 0.95, 0.95),
      borderWidth: 1,
      borderColor: rgb(0.2, 0.2, 0.2),
    });

    totalPage.drawText(`$${total.toFixed(2)}`, {
      x: 60,
      y: yTotal + 5,
      size: 22,
      font: bold,
    });

    // ===========================================================
    // 🔥 ENVIAR PDF
    // ===========================================================
    const bytes = await pdf.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=transferencia_${transferenciaId}.pdf`,
      },
    });

  } catch (err) {
    console.error("❌ Error PDF:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
