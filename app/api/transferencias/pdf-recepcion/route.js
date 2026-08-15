// app/api/transferencias/pdf-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requirePerm } from "@/lib/authorize";
import { valorizarDetalle } from "@/lib/transferencias/costoTransferencia";

// El remito de recepción lleva los mismos costos que el de envío, más el motivo
// de cada diferencia. Mismo permiso que su gemelo.
const PERMISO_VER_TRANSFERENCIAS = "transferencias.ver";

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_VER_TRANSFERENCIAS);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(req.url);
    const transferenciaId = Number(searchParams.get("id") || 0);

    if (!transferenciaId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ===========================================================
    // 🔥 Obtener transferencia
    // ===========================================================
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      include: {
        origen: true,
        destino: true,
        detalle: {
          include: {
            producto: { include: { base: true } }
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

    // Scope: non-admin debe ser origen o destino
    const session = auth.session;
    if (!session.esAdmin) {
      const localId = Number(session.localId || 0);
      if (!localId || (transferencia.origenId !== localId && transferencia.destinoId !== localId)) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso" },
          { status: 403 }
        );
      }
    }

    // ===========================================================
    // 🔥 PDF CONFIG PRO
    // ===========================================================
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Recepción #${transferenciaId}`);
    pdf.setAuthor("ERP Azul");

    const pageWidth = 595;
    const pageHeight = 842;
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
    draw(`Recepción #${transferenciaId}`, margin, y, 18, bold);
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

    draw("Fecha recepción:", margin, y, 10, bold);
    draw(
      transferencia.fechaRecepcion
        ? new Date(transferencia.fechaRecepcion).toLocaleString("es-AR")
        : "-",
      margin + 110,
      y,
      10
    );
    y -= 20;

    // Línea
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });
    y -= 18;


    // ===========================================================
    // 🔥 COLUMNAS PRO RECEPCIÓN
    // ===========================================================
    const col = {
      producto: margin,
      cod: margin + 150,
      enviado: margin + 240,
      recibido: margin + 300,
      motivo: margin + 360,
      subt: margin + 445 // seguro, no se corta
    };

    draw("Producto", col.producto, y, 10, bold);
    draw("Código", col.cod, y, 10, bold);
    draw("Env.", col.enviado, y, 10, bold);
    draw("Rec.", col.recibido, y, 10, bold);
    draw("Motivo", col.motivo, y, 10, bold);
    draw("Subtotal", col.subt, y, 10, bold);

    y -= 14;

    // Línea
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

      const enviado = Number(d.cantidad) || 0;
      // Acta de RECEPCIÓN: valoriza lo recibido (0 incluido) y cae a lo enviado
      // solo si todavía no se cargó recepción. Mismo helper que detalle, lista
      // y remito, con el costo bajado a la escala de unidadEnviada.
      const { costoUnitario: costo, cantidad: recibido, subtotal } = valorizarDetalle(
        {
          cantidad: d.cantidad,
          recibido: d.recibido,
          unidadEnviada: d.unidadEnviada,
          precioCosto:
            d.precioCosto ?? d.producto?.base?.precio_costo ?? 0,
        },
        d.producto?.base
      );

      const motivo =
        d.motivoPrincipal === "Otro"
          ? d.motivoDetalle || "Otro"
          : d.motivoPrincipal || "-";

      total += subtotal;

      // Fila gris
      if (row % 2 === 0) {
        page.drawRectangle({
          x: margin - 5,
          y: y - 1,
          width: pageWidth - margin * 2 + 10,
          height: 15,
          color: rgb(0.96, 0.96, 0.96)
        });
      }

      draw(nombre.substring(0, 30), col.producto, y);
      draw(codigo, col.cod, y);
      draw(String(enviado), col.enviado, y);
      draw(String(recibido), col.recibido, y);
      draw(motivo.substring(0, 15), col.motivo, y);
      draw(`$${subtotal.toFixed(2)}`, col.subt, y);

      y -= 16;
      row++;

      if (y < margin + 80) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    }


    // ===========================================================
    // 🔥 TOTAL — ABAJO + LÍNEA
    // ===========================================================
    const totalY = margin + 15;

    // línea arriba del total
    page.drawLine({
      start: { x: margin, y: totalY + 20 },
      end: { x: pageWidth - margin, y: totalY + 20 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7)
    });

    draw("TOTAL:", col.subt - 60, totalY, 14, bold);
    draw(`$${total.toFixed(2)}`, col.subt, totalY, 14, bold);


    // ===========================================================
    // 🔥 OUTPUT
    // ===========================================================
    const bytes = await pdf.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=recepcion_${transferenciaId}.pdf`
      }
    });

  } catch (err) {
    console.error("❌ Error PDF:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
