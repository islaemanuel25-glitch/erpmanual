import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

const TIPOS_VALIDOS = ["PRECIO_VENTA", "COSTO", "MANUAL_AUTORIZADO"];

export async function POST(req) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const {
      nombre,
      tipoBase = "PRECIO_VENTA",
      margenPorcentaje = null,
      esDefault = false,
      redondeo_100 = false,
      notas = null,
    } = body || {};

    if (!nombre || !String(nombre).trim()) {
      return NextResponse.json({ ok: false, error: "Nombre requerido" }, { status: 400 });
    }

    if (!TIPOS_VALIDOS.includes(tipoBase)) {
      return NextResponse.json({ ok: false, error: "tipoBase invalido" }, { status: 400 });
    }

    let margenNum = null;
    if (margenPorcentaje !== null && margenPorcentaje !== "" && margenPorcentaje !== undefined) {
      margenNum = Number(margenPorcentaje);
      if (!Number.isFinite(margenNum) || margenNum < 0) {
        return NextResponse.json({ ok: false, error: "margenPorcentaje invalido" }, { status: 400 });
      }
    }

    const nombreLimpio = String(nombre).trim();

    const lista = await prisma.$transaction(async (tx) => {
      // Si esDefault=true, desmarcar la default actual del grupo
      if (esDefault) {
        await tx.listaPrecio.updateMany({
          where: { grupoId, esDefault: true },
          data: { esDefault: false },
        });
      }

      return tx.listaPrecio.create({
        data: {
          grupoId,
          nombre: nombreLimpio,
          tipoBase,
          margenPorcentaje: margenNum,
          esDefault: !!esDefault,
          redondeo_100: !!redondeo_100,
          notas: notas ? String(notas).trim() : null,
          activo: true,
        },
      });
    });

    return NextResponse.json({ ok: true, lista });
  } catch (error) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe una lista con ese nombre en el grupo" },
        { status: 409 }
      );
    }
    console.error("Error creando lista de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
