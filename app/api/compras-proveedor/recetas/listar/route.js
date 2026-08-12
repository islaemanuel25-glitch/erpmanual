// GET /api/compras-proveedor/recetas/listar
//
// Los proveedores con su receta —o sin ella— para la pantalla de recetas.
//
// Devuelve TAMBIÉN los que no tienen ninguna, y a propósito: la pregunta que
// trae a esta pantalla es "¿a cuál le falta?", y una lista que solo muestra las
// cargadas no la contesta.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { resumenEnCriollo } from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    // LOS DOS PERMISOS, y no solo el de mirar. La pantalla y su entrada en el menú
    // piden `compras.recibir`, que es el que hace falta para cargar una receta.
    // Con solo "compras.ver" acá, un rol a medida con recibir y sin ver vería la
    // pantalla en el menú y comería un 403 en cada carga. Hoy ningún rol del
    // sistema está así —todos los que reciben también ven—, pero el desajuste ya
    // estaba escrito y se arregla ahora que se ve, no cuando aparezca el rol.
    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const proveedores = await prisma.proveedor.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });

    // El alcance va en el WHERE: la receta es POR GRUPO, aunque el proveedor
    // sea compartido.
    const recetas = await prisma.recetaProveedor.findMany({ where: { grupoId } });
    const porProveedor = new Map(recetas.map((r) => [r.proveedorId, r]));

    // Cuántos comprobantes sin confirmar tiene cada uno: es lo que se va a poder
    // releer al guardar, y verlo antes de entrar ayuda a decidir por cuál empezar.
    const sinConfirmar = await prisma.comprobanteProveedor.groupBy({
      by: ["proveedorId"],
      where: { grupoId, confirmadoEn: null, estado: { not: "ANULADO" }, imagenBorradaEn: null },
      _count: { _all: true },
    });
    const porConfirmar = new Map(sinConfirmar.map((x) => [x.proveedorId, x._count._all]));

    return NextResponse.json({
      ok: true,
      items: proveedores.map((p) => {
        const receta = porProveedor.get(p.id) ?? null;
        return {
          proveedorId: p.id,
          nombre: p.nombre,
          tieneReceta: !!receta,
          version: receta?.version ?? null,
          actualizadaEn: receta?.updatedAt ?? null,
          resumen: resumenEnCriollo(receta),
          comprobantesSinConfirmar: porConfirmar.get(p.id) ?? 0,
        };
      }),
    });
  } catch (err) {
    console.error("Error recetas/listar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
