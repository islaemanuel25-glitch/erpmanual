// POST /api/compras-proveedor/recetas/guardar
//
// Guarda cómo cobra la cantidad el proveedor —por unidad o por bulto—.
//
// Es lo único que queda de la receta estructurada. Las respuestas de impuestos
// (alícuota, interno, percepciones) se borraron con la lectura interpretada
// (#165): el costo final lo dice cada renglón del papel, y ninguna regla de
// formato lo decide. `facturaPor` se conserva porque lo usa el importador de
// pedidos desde archivo para poner el precio en la escala correcta.
//
// Guardar esto no cambia cómo se lee un papel, así que no ofrece relectura.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    // Cambia cómo se interpretan los precios de un proveedor, así que pide el
    // permiso de recibir y no el de mirar.
    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const proveedorId = Number(body?.proveedorId);
    if (!Number.isFinite(proveedorId)) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true, nombre: true },
    });
    if (!proveedor) {
      return NextResponse.json({ ok: false, error: "No existe ese proveedor." }, { status: 404 });
    }

    const facturaPor = body?.respuestas?.facturaPor === "BULTO" ? "BULTO" : "UNIDAD";

    await prisma.recetaProveedor.upsert({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
      create: { grupoId, proveedorId, facturaPor },
      update: { facturaPor },
    });

    return NextResponse.json({
      ok: true,
      facturaPor,
      queHacer:
        facturaPor === "BULTO"
          ? `${proveedor.nombre}: la cantidad del pedido se toma por bulto o cajón.`
          : `${proveedor.nombre}: la cantidad del pedido se toma por unidad suelta.`,
    });
  } catch (err) {
    console.error("Error recetas/guardar:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "guardar cómo cobra la cantidad",
        quedo: "Puede que haya quedado guardado: volvé a abrir la pantalla y fijate.",
      }) }, { status: 500 });
  }
}
