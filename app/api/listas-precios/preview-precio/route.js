import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { calcularPrecioConLista } from "@/lib/precios/calcularPrecioConLista";

export async function POST(req) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const productoBaseId = Number(body?.productoBaseId);
    const listaPrecioId = Number(body?.listaPrecioId);

    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json({ ok: false, error: "productoBaseId invalido" }, { status: 400 });
    }
    if (!Number.isInteger(listaPrecioId) || listaPrecioId <= 0) {
      return NextResponse.json({ ok: false, error: "listaPrecioId invalido" }, { status: 400 });
    }

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true, nombre: true, precio_venta: true, precio_costo: true },
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }

    const lista = await prisma.listaPrecio.findFirst({
      where: { id: listaPrecioId, grupoId },
      select: {
        id: true,
        nombre: true,
        tipoBase: true,
        margenPorcentaje: true,
        redondeo_100: true,
        activo: true,
      },
    });
    if (!lista) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    if (!lista.activo) {
      return NextResponse.json({ ok: false, error: "La lista no esta activa" }, { status: 400 });
    }

    if (lista.tipoBase === "MANUAL_AUTORIZADO") {
      return NextResponse.json({
        ok: true,
        preview: {
          productoBaseId: producto.id,
          nombre: producto.nombre,
          precioVenta: Number(producto.precio_venta),
          costo: Number(producto.precio_costo),
          lista,
          requiereManual: true,
          precioFinal: null,
          tipoPrecioAplicado: "MANUAL_AUTORIZADO",
          margenAplicado: null,
        },
      });
    }

    const calc = calcularPrecioConLista({
      precioVenta: Number(producto.precio_venta),
      costo: Number(producto.precio_costo),
      lista,
    });

    return NextResponse.json({
      ok: true,
      preview: {
        productoBaseId: producto.id,
        nombre: producto.nombre,
        precioVenta: Number(producto.precio_venta),
        costo: Number(producto.precio_costo),
        lista,
        requiereManual: false,
        ...calc,
      },
    });
  } catch (error) {
    console.error("Error en preview-precio:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
