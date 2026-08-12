// GET /api/compras-proveedor/recetas/obtener?proveedorId=
//
// La receta de un proveedor, ya traducida a las respuestas de la pantalla.
//
// La traducción se hace ACÁ y no en el navegador por la misma razón de siempre:
// si la hiciera la pantalla, el alta y la edición terminarían con dos criterios
// para lo mismo el día que alguien toque una sola.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { aPreguntas } from "@/lib/compras-proveedor/comprobante/recetaEnCriollo";
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

    const proveedorId = Number(new URL(req.url).searchParams.get("proveedorId"));
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

    const fila = await prisma.recetaProveedor.findUnique({
      where: { grupoId_proveedorId: { grupoId, proveedorId } },
    });

    return NextResponse.json({
      ok: true,
      proveedor,
      tieneReceta: !!fila,
      version: fila?.version ?? null,
      // Sin receta se devuelven los valores de arranque, que son los de la
      // genérica. Así la pantalla no tiene que saber cuáles son.
      respuestas: aPreguntas(fila),
    });
  } catch (err) {
    console.error("Error recetas/obtener:", err);
    return NextResponse.json({ ok: false, error: errorInesperado({
        operacion: "abrir la receta",
        quedo: "No se tocó nada: esto solo muestra lo que ya estaba guardado.",
      }) }, { status: 500 });
  }
}
