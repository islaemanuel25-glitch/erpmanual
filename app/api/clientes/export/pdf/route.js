import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;

    // Query params
    const { searchParams } = new URL(req.url);
    const activoParam = searchParams.get("activo");
    const tagIdParam = searchParams.get("tagId");
    const limitParam = searchParams.get("limit");

    const limit = limitParam
      ? Math.min(Math.max(Number(limitParam), 1), 1000)
      : 1000;

    // Construir where
    const where = { grupoId, localId };
    if (activoParam === "true") {
      where.activo = true;
    } else if (activoParam === "false") {
      where.activo = false;
    }

    if (tagIdParam) {
      const tagId = Number(tagIdParam);
      if (tagId > 0) {
        where.tags = { some: { tagId } };
      }
    }

    // Obtener clientes + nombre del local
    const [clientes, local] = await Promise.all([
      prisma.cliente.findMany({
        where,
        orderBy: { nombre: "asc" },
        take: limit,
      }),
      prisma.local.findUnique({
        where: { id: localId },
        select: { nombre: true },
      }),
    ]);

    // =========================================================
    // PDF
    // =========================================================
    const pdf = await PDFDocument.create();
    pdf.setTitle("Listado de Clientes");
    pdf.setAuthor("ERP Azul");

    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;

    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const hoy = new Date().toLocaleDateString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    // Columnas
    const col = {
      nombre: margin,
      telefono: margin + 160,
      email: margin + 255,
      documento: margin + 380,
      activo: margin + 475,
    };

    // Truncar texto a ancho aproximado
    const trunc = (text, max) => {
      const s = String(text || "");
      return s.length > max ? s.substring(0, max - 1) + "…" : s;
    };

    let page = null;
    let y = 0;

    function newPage() {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    function draw(text, x, yPos, size = 8, f = font) {
      page.drawText(String(text ?? ""), { x, y: yPos, size, font: f });
    }

    function drawHeader() {
      // Encabezado
      draw("Listado de Clientes", margin, y, 16, bold);
      y -= 20;

      draw("Local:", margin, y, 9, bold);
      draw(local?.nombre || `#${localId}`, margin + 40, y, 9);

      draw("Fecha:", margin + 250, y, 9, bold);
      draw(hoy, margin + 290, y, 9);

      draw(`(${clientes.length} registros)`, margin + 400, y, 8);
      y -= 14;

      // Linea separadora
      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 16;

      // Cabecera de tabla (fondo sombreado)
      page.drawRectangle({
        x: margin - 4,
        y: y - 3,
        width: pageWidth - margin * 2 + 8,
        height: 14,
        color: rgb(0.91, 0.91, 0.91),
      });

      draw("Nombre", col.nombre, y, 8, bold);
      draw("Teléfono", col.telefono, y, 8, bold);
      draw("Email", col.email, y, 8, bold);
      draw("Documento", col.documento, y, 8, bold);
      draw("Activo", col.activo, y, 8, bold);
      y -= 14;

      page.drawLine({
        start: { x: margin, y },
        end: { x: pageWidth - margin, y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      });
      y -= 10;
    }

    // Primera página
    newPage();
    drawHeader();

    // Filas
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i];

      // Salto de página
      if (y < margin + 30) {
        newPage();
        drawHeader();
      }

      // Fondo alternado
      if (i % 2 === 0) {
        page.drawRectangle({
          x: margin - 4,
          y: y - 3,
          width: pageWidth - margin * 2 + 8,
          height: 13,
          color: rgb(0.97, 0.97, 0.97),
        });
      }

      draw(trunc(c.nombre, 30), col.nombre, y);
      draw(trunc(c.telefono, 18), col.telefono, y);
      draw(trunc(c.email, 24), col.email, y);
      draw(trunc(c.documento, 18), col.documento, y);
      draw(c.activo ? "SI" : "NO", col.activo, y);

      y -= 14;

      // Linea inferior de fila
      page.drawLine({
        start: { x: margin, y: y + 3 },
        end: { x: pageWidth - margin, y: y + 3 },
        thickness: 0.3,
        color: rgb(0.9, 0.9, 0.9),
      });
    }

    const bytes = await pdf.save();

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="clientes_${localId}.pdf"`,
      },
    });
  } catch (e) {
    console.error("ERROR clientes/export/pdf:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
