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
import { resumenDeExplicaciones, rotuloDelTipo } from "@/lib/compras-proveedor/comprobante/explicacionPorTipo";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

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

    // ── LAS EXPLICACIONES Y LAS PROPUESTAS, POR TIPO DE PAPEL ─────────────
    //
    // El alcance va en el WHERE: son POR GRUPO, aunque el proveedor sea
    // compartido. Una por tipo de papel (`explicacionPorTipo.js`).
    const explicaciones = await prisma.explicacionPorTipo.findMany({
      where: { grupoId },
      select: { proveedorId: true, tipoComprobante: true, version: true, actualizadaEn: true },
    });
    const propuestas = await prisma.recetaPropuestaProveedor.findMany({
      where: { grupoId },
      select: { proveedorId: true, tipoComprobante: true },
    });
    const agrupar = (filas) => {
      const m = new Map();
      for (const f of filas) m.set(f.proveedorId, [...(m.get(f.proveedorId) ?? []), f]);
      return m;
    };
    const confirmadasDe = agrupar(explicaciones);

    // Cómo cobra la cantidad cada uno: lo que queda de la receta estructurada,
    // porque el importador de pedidos lo necesita (`recetas/guardar`).
    const recetas = await prisma.recetaProveedor.findMany({
      where: { grupoId },
      select: { proveedorId: true, facturaPor: true },
    });
    const facturaPorDe = new Map(recetas.map((r) => [r.proveedorId, r.facturaPor]));
    const pendientesDe = agrupar(propuestas);

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
        const confirmadas = confirmadasDe.get(p.id) ?? [];
        const pendientes = pendientesDe.get(p.id) ?? [];
        return {
          proveedorId: p.id,
          nombre: p.nombre,
          tieneReceta: confirmadas.length > 0,
          explicaciones: confirmadas.map((e) => ({
            tipoComprobante: e.tipoComprobante,
            rotulo: rotuloDelTipo(e.tipoComprobante),
            version: e.version,
            actualizadaEn: e.actualizadaEn,
          })),
          pendientes: pendientes.map((x) => ({ tipoComprobante: x.tipoComprobante, rotulo: rotuloDelTipo(x.tipoComprobante) })),
          resumen: resumenDeExplicaciones({ confirmadas, pendientes }),
          facturaPor: facturaPorDe.get(p.id) === "BULTO" ? "BULTO" : "UNIDAD",
          comprobantesSinConfirmar: porConfirmar.get(p.id) ?? 0,
        };
      }),
    });
  } catch (err) {
    console.error("Error recetas/listar:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "cargar las recetas",
        quedo: "Las recetas guardadas están: esto es solo la pantalla.",
      }) }, { status: 500 });
  }
}
