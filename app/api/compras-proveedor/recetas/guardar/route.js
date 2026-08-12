// POST /api/compras-proveedor/recetas/guardar
//
// Crea o edita la receta de un proveedor, y dice qué se puede releer con ella.
//
// ── LA VERSIÓN SUBE, Y LO YA LEÍDO NO SE TOCA ──────────────────────────────
//
// Cada edición incrementa `version`. Los comprobantes ya leídos guardan una
// COPIA de la receta con la que se leyeron —`recetaUsada`— y esa copia no se
// reescribe nunca: dentro de seis meses, mirando un comprobante viejo, hay que
// poder explicar su resultado aunque la receta haya cambiado diez veces.
//
// Reescribirla haría que un comprobante que cerró con la receta de antes pasara
// a "no cerrar" sin que nada hubiera cambiado en el papel.
//
// ── GUARDAR NO RELEE ───────────────────────────────────────────────────────
//
// Esta ruta guarda y CUENTA. Releer es otra acción, con su propio botón, porque
// gasta cuota y eso se decide sabiendo cuánto cuesta.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { aReceta } from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";
import { ofrecerRelectura } from "@/lib/compras-proveedor/comprobante/relecturaTrasReceta";
import { cuotaDelDia } from "@/lib/compras-proveedor/comprobante/lector/cuota";
import { armarCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import "@/lib/compras-proveedor/comprobante/lector/index.js";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    // Cargar una receta cambia cómo se interpretan los números de un proveedor,
    // así que pide el permiso de recibir y no el de mirar.
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

    // La traducción de las respuestas a los campos vive en el módulo puro, que
    // es el mismo que usa la pantalla para mostrarlas. Escribir acá una segunda
    // conversión "parecida" es de donde salieron los últimos tres problemas.
    const receta = aReceta(body?.respuestas);

    const previa = await prisma.recetaProveedor.findUnique({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
      select: { id: true, version: true },
    });

    const guardada = await prisma.recetaProveedor.upsert({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
      create: { grupoId, proveedorId, ...receta, version: 1 },
      // La versión sube en cada edición. No se recalcula desde nada: es un
      // contador de veces que alguien la tocó.
      update: { ...receta, version: { increment: 1 } },
    });

    // ── QUÉ SE PUEDE RELEER CON ESTA RECETA ──────────────────────────────
    const comprobantes = await prisma.comprobanteProveedor.findMany({
      where: { grupoId, proveedorId },
      select: { id: true, estado: true, confirmadoEn: true, imagenBorradaEn: true },
    });

    let cuota = null;
    try {
      const cadena = armarCadena();
      const modelos = [cadena.titular?.lector?.nombre, cadena.respaldo?.lector?.nombre].filter(Boolean);
      if (modelos.length) {
        const llamadas = await prisma.llamadaLector.findMany({
          where: { creadoEn: { gte: new Date(Date.now() - 48 * 3600 * 1000) } },
          select: { modelo: true, creadoEn: true, ok: true, motivo: true },
        });
        cuota = cuotaDelDia({ llamadas, modelos, huso: process.env.COMPROBANTE_CUOTA_HUSO || undefined });
      }
    } catch (e) {
      console.error("No se pudo calcular la cuota al guardar la receta:", e?.message);
    }

    return NextResponse.json({
      ok: true,
      version: guardada.version,
      esNueva: !previa,
      queHacer: previa
        ? `Receta de ${proveedor.nombre} actualizada. Los comprobantes ya leídos quedan como están: ` +
          "guardaron la receta con la que se leyeron."
        : `Receta de ${proveedor.nombre} guardada.`,
      // El costo en lecturas viaja con la respuesta para que el aviso aparezca
      // ANTES de que apriete, no después.
      relectura: ofrecerRelectura({ comprobantes, cuota }),
    });
  } catch (err) {
    console.error("Error recetas/guardar:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
