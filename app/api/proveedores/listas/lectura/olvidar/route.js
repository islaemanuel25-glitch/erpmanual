// POST /api/proveedores/listas/lectura/olvidar
//
// Borra el mapa de columnas guardado de un proveedor, para volver a confirmarlo
// desde cero.
//
// ── POR QUÉ HACE FALTA UNA PUERTA PARA ESTO ─────────────────────────────────
//
// Porque la receta se vence sola cuando el ARCHIVO cambia, y no cuando el que
// confirmó se equivocó. Alguien que marcó "Precio S/IVA" como la columna de
// precio y se dio cuenta después queda atrapado: el archivo del mes que viene
// tiene la misma estructura, así que la huella coincide, y el sistema lee todas
// las listas siguientes con la columna equivocada sin volver a preguntar nunca.
//
// Es una acción chica y es la única salida de ese pozo.
//
// NO TOCA NINGÚN COSTO ni ninguna importación ya hecha: las que se leyeron con la
// receta vieja quedan como están, con su `decisionDeLectura` guardada, que es lo
// que permite entender después con qué se leyeron.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { proveedorVisibleWhere } from "@/lib/visibilidad";

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
    const proveedorId = Number(body?.proveedorId);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    const proveedor = await prisma.proveedor.findFirst({
      where: { id: proveedorId, ...proveedorVisibleWhere(localId, grupoId) },
      select: { id: true, nombre: true, listaRecetaLectura: true },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado en tu alcance." },
        { status: 404 }
      );
    }

    if (!proveedor.listaRecetaLectura) {
      return NextResponse.json({
        ok: true,
        yaEstaba: true,
        mensaje: `${proveedor.nombre} no tiene guardado ningún mapa de columnas.`,
      });
    }

    await prisma.proveedor.update({
      where: { id: proveedor.id },
      data: { listaRecetaLectura: null, listaRecetaHuella: null },
    });

    return NextResponse.json({
      ok: true,
      yaEstaba: false,
      mensaje: `Listo. La próxima lista de ${proveedor.nombre} te va a volver a preguntar qué columna es cada cosa.`,
    });
  } catch (e) {
    console.error("[listas/lectura/olvidar]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo borrar el mapa de columnas. Probá de nuevo." },
      { status: 500 }
    );
  }
}
