// GET /api/compras-proveedor/comprobantes/foto/[id]
//
// LA FOTO DEL COMPROBANTE, SERVIDA.
//
// ── POR QUÉ NO EXISTÍA, Y POR QUÉ HACE FALTA AHORA ────────────────────────
//
// Hasta hoy ninguna ruta servía la imagen de un comprobante: se subía, se leía
// y nadie la volvía a ver. Se podía trabajar así mientras la lectura cerraba.
//
// Deja de alcanzar en el momento en que la pantalla dice "este número está mal
// leído, mirá el papel": sin la foto al lado, "mirá el papel" significa ir a
// buscar el papel físico o la galería del teléfono, y ahí se termina la
// corrección. La foto ES parte del control.
//
// ── EL ALCANCE ES EL MISMO QUE PARA VER EL COMPROBANTE ────────────────────
//
// Mismo permiso y mismo grupo: si alguien no puede ver el comprobante, tampoco
// su foto. Va en el WHERE y no en un chequeo posterior, así que un comprobante
// de otro grupo no existe en vez de existir y estar prohibido.
//
// ── LA IMAGEN PUEDE NO ESTAR, Y ES NORMAL ─────────────────────────────────
//
// Vive siete días. Pedir la de un comprobante viejo no es un error del sistema:
// es la ventana funcionando, y se contesta 410 con eso dicho.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, ["compras.ver", "compras.recibir"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId)) {
      return NextResponse.json({ ok: false, error: "id requerido" }, { status: 400 });
    }

    // Cuál de las fotos: por defecto la primera, que es la que casi siempre hay.
    const orden = Number(new URL(req.url).searchParams.get("orden") || 1);

    const archivo = await prisma.comprobanteArchivo.findFirst({
      where: { comprobante: { id: comprobanteId, grupoId }, orden },
      select: { ubicacion: true, mime: true, nombre: true },
    });
    if (!archivo?.ubicacion) {
      return NextResponse.json(
        {
          ok: false,
          error: "La imagen de este comprobante ya no está.",
          queHacer: "Las fotos viven siete días desde que se suben.",
        },
        { status: 410 }
      );
    }

    let bytes;
    try {
      bytes = await readFile(archivo.ubicacion);
    } catch {
      return NextResponse.json(
        { ok: false, error: "No se pudo abrir la foto.", queHacer: "Avisá: puede que el almacén no esté montado." },
        { status: 410 }
      );
    }

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": archivo.mime || "image/jpeg",
        // La foto de un comprobante no cambia nunca. Se cachea en el navegador
        // porque en la corrección se la abre y se la cierra varias veces
        // seguidas, y volver a bajar 5 MB por cada vistazo es la diferencia
        // entre mirar el papel y no mirarlo.
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(archivo.nombre || "comprobante")}"`,
      },
    });
  } catch (err) {
    console.error("Error comprobantes/foto:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "traer la foto del comprobante",
          quedo: "No se tocó nada: esto solo muestra una imagen que ya estaba guardada.",
        }),
      },
      { status: 500 }
    );
  }
}
