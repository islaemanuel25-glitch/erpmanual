import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import * as XLSX from "xlsx";

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

    // Validar limit
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

    // Filtro por tagId
    if (tagIdParam) {
      const tagId = Number(tagIdParam);
      if (tagId > 0) {
        where.tags = { some: { tagId } };
      }
    }

    // Obtener clientes
    const clientes = await prisma.cliente.findMany({
      where,
      orderBy: { nombre: "asc" },
      take: limit,
      include: {
        tags: {
          include: {
            tag: { select: { nombre: true } },
          },
        },
      },
    });

    // Formatear filas para Excel (columnas exactas en orden)
    const filas = clientes.map((c) => ({
      nombre: c.nombre || "",
      documento: c.documento || "",
      telefono: c.telefono || "",
      email: c.email || "",
      direccion: c.direccion || "",
      observaciones: c.observaciones || "",
      limiteCredito:
        c.limiteCredito != null ? Number(c.limiteCredito) : "",
      descuentoPorcentaje:
        c.descuentoPorcentaje != null ? Number(c.descuentoPorcentaje) : "",
      tags: c.tags.map((ct) => ct.tag.nombre).join(", "),
      activo: c.activo ? "SI" : "NO",
    }));

    // Generar Excel
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clientes");

    // Ajustar ancho de columnas
    ws["!cols"] = [
      { wch: 30 }, // nombre
      { wch: 16 }, // documento
      { wch: 16 }, // telefono
      { wch: 25 }, // email
      { wch: 30 }, // direccion
      { wch: 30 }, // observaciones
      { wch: 14 }, // limiteCredito
      { wch: 14 }, // descuentoPorcentaje
      { wch: 25 }, // tags
      { wch: 6 },  // activo
    ];

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const hoy = new Date().toISOString().split("T")[0];

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clientes_${hoy}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("ERROR clientes/export/excel:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}

