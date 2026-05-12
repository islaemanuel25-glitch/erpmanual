import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

const TIPOS_VALIDOS = ["PRECIO_VENTA", "COSTO", "MANUAL_AUTORIZADO"];

export async function PUT(req, { params }) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "ID invalido" }, { status: 400 });
    }

    // Verificar pertenencia al grupo
    const existente = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
      select: { id: true, esDefault: true, activo: true },
    });
    if (!existente) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    const body = await req.json();
    const { nombre, tipoBase, margenPorcentaje, esDefault, redondeo_100, notas } = body || {};

    const data = {};
    if (nombre !== undefined) {
      if (!String(nombre).trim()) {
        return NextResponse.json({ ok: false, error: "Nombre requerido" }, { status: 400 });
      }
      data.nombre = String(nombre).trim();
    }
    if (tipoBase !== undefined) {
      if (!TIPOS_VALIDOS.includes(tipoBase)) {
        return NextResponse.json({ ok: false, error: "tipoBase invalido" }, { status: 400 });
      }
      data.tipoBase = tipoBase;
    }
    if (margenPorcentaje !== undefined) {
      if (margenPorcentaje === null || margenPorcentaje === "") {
        data.margenPorcentaje = null;
      } else {
        const n = Number(margenPorcentaje);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ ok: false, error: "margenPorcentaje invalido" }, { status: 400 });
        }
        data.margenPorcentaje = n;
      }
    }
    if (redondeo_100 !== undefined) {
      data.redondeo_100 = !!redondeo_100;
    }
    if (notas !== undefined) {
      data.notas = notas ? String(notas).trim() : null;
    }

    if (esDefault === true && !existente.esDefault) {
      data.esDefault = true;
    } else if (esDefault === false && existente.esDefault) {
      data.esDefault = false;
    }

    if (Object.keys(data).length === 0) {
      if (esDefault === true && existente.esDefault) {
        const listaSinCambios = await prisma.listaPrecio.findFirst({
          where: { id, grupoId },
        });
        return NextResponse.json({ ok: true, lista: listaSinCambios, sinCambios: true });
      }
      return NextResponse.json({ ok: false, error: "Nada para actualizar" }, { status: 400 });
    }

    if (esDefault === false && existente.esDefault && existente.activo) {
      const otrasDefaults = await prisma.listaPrecio.count({
        where: { grupoId, esDefault: true, activo: true, id: { not: id } },
      });
      if (otrasDefaults === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No se puede quitar la default: debe existir otra lista default activa. Marcá otra como default primero.",
          },
          { status: 400 }
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (esDefault === true && !existente.esDefault) {
        await tx.listaPrecio.updateMany({
          where: { grupoId, esDefault: true, id: { not: id } },
          data: { esDefault: false },
        });
      }

      const upd = await tx.listaPrecio.updateMany({
        where: { id, grupoId },
        data,
      });
      if (upd.count === 0) {
        throw Object.assign(new Error("Lista no encontrada"), { status: 404 });
      }
    });

    const lista = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
    });

    return NextResponse.json({ ok: true, lista });
  } catch (error) {
    if (error?.status === 404) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe una lista con ese nombre en el grupo" },
        { status: 409 }
      );
    }
    console.error("Error editando lista de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
