import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const proveedorId = Number(body?.proveedorId || 0);
    const text = String(body?.text || "");

    if (!proveedorId || !text.trim()) {
      return NextResponse.json({ ok: false, error: "proveedorId y text requeridos" }, { status: 400 });
    }

    const productos = await prisma.productoBase.findMany({
      where: {
        grupoId: Number(session.grupoId),
        proveedor_id: proveedorId,
      },
      select: {
        id: true,
        nombre: true,
        codigo_barra: true,
      },
    });

    const byBarcode = new Map(productos.filter((p) => p.codigo_barra).map((p) => [String(p.codigo_barra), p]));
    const byName = new Map(productos.map((p) => [normalized(p.nombre), p]));

    const parsedRows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [codigo, nombre, costo, venta] = line.split(/[|;\t]/).map((x) => x?.trim() || "");
        return { codigo, nombre, costo, venta };
      });

    const matchedRows = [];
    const noEncontrados = [];

    for (const row of parsedRows) {
      const m = byBarcode.get(row.codigo) || byName.get(normalized(row.nombre));
      if (!m) {
        noEncontrados.push(row);
        continue;
      }
      matchedRows.push({ ...row, productoBaseId: m.id, productoNombre: m.nombre });
    }

    return NextResponse.json({
      ok: true,
      parsedRows,
      matchedRows,
      noEncontrados,
    });
  } catch (e) {
    console.error("ERROR productos/precios/parse:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
