// app/api/compras-proveedor/exportar-pdf/[id]/route.js
//
// Devuelve el PDF descargable del pedido a proveedor.
// Sin cambios de estado ni de stock — solo lectura.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0,00";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, error: perm.error },
        { status: perm.status }
      );
    }

    const { id } = await params;
    const pedidoId = Number(id);
    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: {
        proveedor: {
          select: { id: true, nombre: true, telefono: true, email: true },
        },
        deposito: { select: { id: true, nombre: true } },
        detalles: {
          include: {
            producto: {
              include: {
                base: { select: { nombre: true, sku: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    // ===========================================================
    // Armado del PDF (pdf-lib, mismo patrón que /transferencias/pdf)
    // ===========================================================
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Pedido a proveedor #${pedido.id}`);
    pdf.setAuthor("ERP Azul");

    const pageWidth = 595;   // A4
    const pageHeight = 842;
    const margin = 40;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    const draw = (text, x, yy, size = 10, f = font) =>
      page.drawText(String(text), { x, y: yy, size, font: f });

    // Encabezado
    draw(`Pedido a proveedor #${pedido.id}`, margin, y, 18, bold);
    y -= 28;

    draw("Proveedor:", margin, y, 10, bold);
    draw(pedido.proveedor?.nombre || "-", margin + 90, y);
    y -= 14;

    if (pedido.proveedor?.telefono) {
      draw("Teléfono:", margin, y, 10, bold);
      draw(pedido.proveedor.telefono, margin + 90, y);
      y -= 14;
    }

    if (pedido.proveedor?.email) {
      draw("Email:", margin, y, 10, bold);
      draw(pedido.proveedor.email, margin + 90, y);
      y -= 14;
    }

    draw("Depósito:", margin, y, 10, bold);
    draw(pedido.deposito?.nombre || "-", margin + 90, y);
    y -= 14;

    draw("Estado:", margin, y, 10, bold);
    draw(pedido.estado, margin + 90, y);
    y -= 14;

    draw("Fecha pedido:", margin, y, 10, bold);
    draw(fmtFecha(pedido.fechaConfirmado || pedido.createdAt), margin + 90, y);
    y -= 20;

    // Línea separadora
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 18;

    // Encabezados de columnas
    const col = {
      producto: margin,
      sku: margin + 220,
      cant: margin + 300,
      unidad: margin + 350,
      costo: margin + 410,
      subtotal: margin + 480,
    };

    draw("Producto", col.producto, y, 10, bold);
    draw("SKU", col.sku, y, 10, bold);
    draw("Cant.", col.cant, y, 10, bold);
    draw("Unidad", col.unidad, y, 10, bold);
    draw("Costo", col.costo, y, 10, bold);
    draw("Subtotal", col.subtotal, y, 10, bold);
    y -= 12;

    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 12;

    // Detalle
    let totalEstimado = 0;
    let row = 0;

    for (const d of pedido.detalles || []) {
      const nombre = (d.producto?.base?.nombre || "Sin nombre").substring(0, 40);
      const sku = d.producto?.base?.sku || "-";
      const cantidad = Number(d.cantidad) || 0;
      const unidad = d.unidad || "BULTO";
      const costo = Number(d.precioCosto) || 0;
      const subtotal = cantidad * costo;
      totalEstimado += subtotal;

      // Fondo alternado
      if (row % 2 === 0) {
        page.drawRectangle({
          x: margin - 5,
          y: y - 2,
          width: pageWidth - margin * 2 + 10,
          height: 14,
          color: rgb(0.96, 0.96, 0.96),
        });
      }

      draw(nombre, col.producto, y);
      draw(String(sku), col.sku, y);
      draw(String(cantidad), col.cant, y);
      draw(unidad, col.unidad, y);
      draw(costo > 0 ? `$${fmt(costo)}` : "-", col.costo, y);
      draw(subtotal > 0 ? `$${fmt(subtotal)}` : "-", col.subtotal, y);

      y -= 16;
      row++;

      // Salto de página si nos quedamos sin espacio
      if (y < margin + 100) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
    }

    // Total estimado
    y -= 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 18;

    if (totalEstimado > 0) {
      draw("Total estimado:", col.costo - 50, y, 12, bold);
      draw(`$${fmt(totalEstimado)}`, col.subtotal, y, 12, bold);
      y -= 20;
    } else {
      draw("Total estimado: sin costos cargados.", margin, y, 10);
      y -= 16;
    }

    // Notas
    if (pedido.notas) {
      y -= 8;
      draw("Notas:", margin, y, 10, bold);
      y -= 14;
      // Wrap simple: dividir en chunks de ~80 chars por línea
      const notas = String(pedido.notas);
      const maxLen = 90;
      for (let i = 0; i < notas.length; i += maxLen) {
        if (y < margin + 30) {
          page = pdf.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        draw(notas.substring(i, i + maxLen), margin, y);
        y -= 12;
      }
    }

    const bytes = await pdf.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=pedido-proveedor-${pedido.id}.pdf`,
      },
    });
  } catch (err) {
    console.error("Error compras-proveedor/exportar-pdf:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al generar PDF" },
      { status: 500 }
    );
  }
}
