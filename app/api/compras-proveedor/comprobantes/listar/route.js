// GET /api/compras-proveedor/comprobantes/listar
//
// Los comprobantes de un pedido o de un proveedor, con lo que la pantalla
// necesita para dibujarlos: estado, fotos, y lo que se guarda para medir.
//
// No devuelve la ubicación de los archivos en disco: la pantalla no tiene nada
// que hacer con una ruta del volumen, y publicarla sería contar la estructura
// interna del servidor sin ninguna ganancia.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { resumenDeLista } from "@/lib/compras-proveedor/comprobante/pantalla";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const pedidoId = Number(searchParams.get("pedidoId")) || null;
    const proveedorId = Number(searchParams.get("proveedorId")) || null;

    if (!pedidoId && !proveedorId) {
      return NextResponse.json(
        { ok: false, error: "Hace falta pedidoId o proveedorId." },
        { status: 400 }
      );
    }

    const items = await prisma.comprobanteProveedor.findMany({
      // El alcance va en el WHERE: un comprobante de otro grupo no existe.
      where: {
        grupoId,
        ...(pedidoId ? { pedidoId } : {}),
        ...(proveedorId ? { proveedorId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        proveedorId: true,
        pedidoId: true,
        estado: true,
        tipo: true,
        puntoVenta: true,
        numero: true,
        fecha: true,
        totalLeido: true,
        diferenciaCentavos: true,
        createdAt: true,
        venceEn: true,
        imagenBorradaEn: true,
        confirmadoEn: true,
        // Lo que se guarda para que el número de acierto salga solo.
        leidoEn: true,
        modeloLectura: true,
        intentosLectura: true,
        cerroEnIntento: true,
        usoRespaldo: true,
        motivoPaseRespaldo: true,
        proveedor: { select: { id: true, nombre: true } },
        _count: { select: { lineas: true } },
        archivos: {
          orderBy: { orden: "asc" },
          // Sin `ubicacion`: la pantalla no tiene nada que hacer con una ruta
          // del volumen del servidor.
          select: { id: true, orden: true, nombre: true, tamano: true, mime: true },
        },
      },
    });

    // `archivos` viene sin ubicación, así que para el resumen hay que decirle
    // cuáles siguen teniendo foto: eso lo dice `imagenBorradaEn`, que es del
    // comprobante entero porque la ventana es del PAPEL y no de cada foto.
    const conFotos = items.map((c) => ({
      ...c,
      fotos: c.imagenBorradaEn ? 0 : c.archivos.length,
      archivos: c.imagenBorradaEn ? [] : c.archivos,
    }));

    return NextResponse.json({
      ok: true,
      items: conFotos,
      resumen: resumenDeLista(items),
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/listar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
