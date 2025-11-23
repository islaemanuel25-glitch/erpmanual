import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import prisma from "@/lib/prisma";

export async function GET(req, { params }) {
  try {
    const transferenciaId = Number(params.id);

    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        origen: true,
        destino: true,
        detalle: {
          include: {
            producto: {
              select: {
                nombre: true,
                codigo_barra: true,
                base: { select: { precio_costo: true } }
              }
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

    const doc = new PDFDocument({ margin: 40 });
    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));

    doc.fontSize(20).text(`Recepción #${transferenciaId}`, { align: "center" });
    doc.moveDown();

    doc.fontSize(12).text(`Origen: ${transferencia.origen.nombre}`);
    doc.text(`Destino: ${transferencia.destino.nombre}`);
    doc.text(`Estado: ${transferencia.estado}`);
    doc.text(
      `Fecha Recepción: ${
        transferencia.fechaRecepcion
          ? new Date(transferencia.fechaRecepcion).toLocaleString()
          : "-"
      }`
    );
    doc.moveDown();

    doc.fontSize(14).text("Detalle de Recepción", { underline: true });
    doc.moveDown(0.4);

    doc.fontSize(12);
    doc.text("Producto", 40);
    doc.text("Cod.", 200);
    doc.text("Env.", 260);
    doc.text("Rec.", 310);
    doc.text("Motivo", 370);
    doc.text("Subtotal", 480);
    doc.moveDown(0.4);

    let total = 0;

    transferencia.detalle.forEach((d) => {
      const nombre = d.producto?.nombre ?? "Producto";
      const codigo = d.producto?.codigo_barra ?? "-";

      const enviado = Number(d.cantidad);
      const recibido = Number(d.recibido ?? enviado);

      const motivo =
        d.motivoPrincipal === "Otro"
          ? d.motivoDetalle ?? "Otro"
          : d.motivoPrincipal ?? "-";

      const costo =
        Number(d.precioCosto) ||
        Number(d.producto?.base?.precio_costo) ||
        0;

      const subtotal = recibido * costo;
      total += subtotal;

      doc.text(nombre, 40);
      doc.text(codigo, 200);
      doc.text(enviado.toString(), 260);
      doc.text(recibido.toString(), 310);
      doc.text(motivo, 370);
      doc.text(`$${subtotal.toFixed(2)}`, 480);

      doc.moveDown(0.3);
    });

    doc.moveDown();
    doc.fontSize(13).text(`Total recibido: $${total.toFixed(2)}`, {
      align: "right",
    });

    doc.end();

    return new NextResponse(Buffer.concat(buffers), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=recepcion_${transferenciaId}.pdf`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
