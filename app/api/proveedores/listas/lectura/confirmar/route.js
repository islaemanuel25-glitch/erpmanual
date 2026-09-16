// POST /api/proveedores/listas/lectura/confirmar
//
// Guarda, PARA EL PROVEEDOR, qué columna es cada cosa. Desde la lista siguiente
// el archivo se lee solo.
//
// ── LA HUELLA VIAJA, NO SE RECALCULA ────────────────────────────────────────
//
// Se guarda la huella que devolvió `proponer`, que es la del archivo que la
// persona MIRÓ. Recalcularla acá con los títulos que manda el cliente dejaría que
// una pantalla desactualizada guardara un mapa confirmado contra un archivo y una
// huella de otro: la receta quedaría apuntando a columnas que nadie revisó, y eso
// no falla en ningún lado, se ve tres meses después en un costo absurdo.
//
// ── NO SE CONFIRMA UN MAPA QUE NO SIRVE ─────────────────────────────────────
//
// Sin código, sin descripción o sin ninguna columna de precio, la receta no se
// guarda. Guardarla dejaría al proveedor con una receta que va a fallar en cada
// importación futura, y el error aparecería lejos de acá.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";
import {
  recetaParaGuardar,
  huellaDeEstructura,
  TEXTO_MOTIVO_RECETA,
} from "@/lib/proveedores/listas/lectura/recetaDeLista";

export async function POST(req) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Se esperaba un cuerpo JSON." }, { status: 400 });
    }

    const proveedorId = Number(body.proveedorId);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    const titulos = Array.isArray(body.titulos) ? body.titulos.map((t) => String(t ?? "")) : null;
    if (!titulos || titulos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Falta la lista de columnas del archivo que se confirmó." },
        { status: 400 }
      );
    }

    // La huella tiene que ser la del archivo que se miró. Se exige y además se
    // comprueba contra los títulos: si no coinciden, lo que llegó está mezclado
    // y guardarlo sería guardar una confirmación que nadie hizo.
    const huella = String(body.huella ?? "");
    if (!huella || huella !== huellaDeEstructura(titulos)) {
      return NextResponse.json(
        {
          ok: false,
          error: "La confirmación no corresponde al archivo que se analizó. Volvé a subirlo y revisá las columnas otra vez.",
          codigo: "HUELLA_NO_COINCIDE",
        },
        { status: 409 }
      );
    }

    const armada = recetaParaGuardar({
      mapeo: body.mapeo,
      titulos,
      columnaPrecioElegida: body.columnaPrecioElegida ?? null,
      descuentoAplicado: typeof body.descuentoAplicado === "boolean" ? body.descuentoAplicado : null,
    });
    if (!armada.ok) {
      return NextResponse.json(
        {
          ok: false,
          codigo: armada.motivo,
          error:
            "Falta indicar alguna columna: hace falta el código, la descripción y al menos una de precio. " +
            (TEXTO_MOTIVO_RECETA[armada.motivo] ?? ""),
        },
        { status: 400 }
      );
    }

    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, ...proveedorVisibleWhere(localId, grupoId) },
      select: { id: true, nombre: true },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado en tu alcance." },
        { status: 404 }
      );
    }

    await prisma.proveedor.update({
      where: { id: proveedor.id },
      data: { listaRecetaLectura: armada.receta, listaRecetaHuella: armada.huella },
    });

    return NextResponse.json({
      ok: true,
      proveedor: { id: proveedor.id, nombre: proveedor.nombre },
      receta: armada.receta,
      huella: armada.huella,
      mensaje: `Guardado. Las próximas listas de ${proveedor.nombre} se van a leer con este mapa de columnas.`,
    });
  } catch (e) {
    console.error("[listas/lectura/confirmar]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar el mapa de columnas. Probá de nuevo." },
      { status: 500 }
    );
  }
}
