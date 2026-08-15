import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    // grupoId SIEMPRE del alcance autorizado (no de un localId crudo del query).
    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }
    const grupoId = vista.grupoId;

    // `params` ES UNA PROMESA en esta versión de Next, y acá se leía sin
    // esperarla: `params?.id` daba undefined, `Number(0)` daba 0, y la ruta
    // contestaba "id inválido" A TODO EL MUNDO, admin incluido. Esa pantalla
    // estaba muerta y no lo sabía nadie.
    //
    // No lo ve el build ni ningún candado: es JavaScript leyendo una propiedad
    // que no existe. Solo aparece pidiendo la ruta. Relevadas las 71 rutas con
    // parámetro, ésta era la única.
    const { id: idCrudo } = await params;
    const id = Number(idCrudo || 0);
    if (!id) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }

    const update = await prisma.precioUpdate.findFirst({
      where: {
        id,
        grupoId,
      },
      include: {
        items: {
          orderBy: { id: "asc" },
        },
      },
    });

    if (!update) {
      return NextResponse.json({ ok: false, error: "No encontrado" }, { status: 404 });
    }

    const productoIds = update.items.map((it) => it.productoBaseId);
    const productos = await prisma.productoBase.findMany({
      where: { id: { in: productoIds } },
      select: { id: true, nombre: true },
    });
    const productoMap = new Map(productos.map((p) => [p.id, p.nombre]));

    const item = {
      id: update.id,
      metodo: update.metodo,
      pricingMode: update.pricingMode,
      proveedorId: update.proveedorId,
      createdAt: update.createdAt,
      items: update.items.map((it) => ({
        ...it,
        nombre: productoMap.get(it.productoBaseId) || null,
      })),
    };

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("ERROR productos/precios/history/[id]:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
