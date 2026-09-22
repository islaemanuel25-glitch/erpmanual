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
import { readFile, open } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import { giroDeLaFoto, giroTotal } from "@/lib/imagen/orientacionExif";

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
      select: { id: true, ubicacion: true, mime: true, nombre: true, giroGrados: true },
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

    // ── ¿CÓMO HAY QUE GIRARLA? ─────────────────────────────────────────
    //
    // Con `?meta=1` se contesta eso y nada más: el visor lo pregunta ANTES de
    // bajar la foto, que pesa cinco megas, para poder dibujarla derecha desde
    // el primer cuadro en vez de mostrarla mal y corregirla después.
    //
    // Se leen solo los primeros 64 KB del archivo: el EXIF vive al principio y
    // cargar la foto entera para sacar un número sería traer cinco megas a la
    // memoria del proceso que atiende a los cinco locales.
    const soloMeta = new URL(req.url).searchParams.get("meta") === "1";
    if (soloMeta) {
      let exif = 0;
      try {
        const fd = await open(archivo.ubicacion, "r");
        try {
          const buf = Buffer.alloc(64 * 1024);
          const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
          exif = giroDeLaFoto(buf.subarray(0, bytesRead));
        } finally {
          await fd.close();
        }
      } catch {
        // Sin poder leer la cabecera se contesta cero, que es lo que se venía
        // haciendo. Una foto que no se puede mirar no es un error de esta
        // pregunta: la ruta de la imagen lo dirá cuando la pidan.
        exif = 0;
      }
      const elegido = Number(archivo.giroGrados) || 0;
      return NextResponse.json({
        ok: true,
        giroExif: exif,
        giroElegido: elegido,
        giro: giroTotal({ exif, elegido }),
        mime: archivo.mime || "image/jpeg",
      });
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

/**
 * GUARDAR EL GIRO QUE ELIGIÓ LA PERSONA.
 *
 * ── POR QUÉ SE GUARDA ─────────────────────────────────────────────────────
 *
 * Porque una foto mal orientada se mira muchas veces: al probar la explicación,
 * al corregir un renglón, al controlar contra el papel. Girarla en cada vuelta
 * es trabajo repetido sobre algo que ya se resolvió una vez.
 *
 * Se guarda el giro RELATIVO a lo que la persona ve —o sea, sobre la foto ya
 * enderezada por el EXIF— porque es lo que ella tocó. Sumarlos al mostrar es lo
 * que hace que tocar «Girar» cuatro veces devuelva la foto a donde estaba.
 *
 * NO TOCA LA FOTO: escribe un número en una columna. El archivo es el documento
 * y queda exactamente como salió del celular.
 */
export async function POST(req, { params }) {
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

    const body = await req.json().catch(() => ({}));
    const orden = Number(body?.orden || 1);
    // Solo las cuatro posiciones que el botón puede producir. Un ángulo
    // cualquiera no lo genera la pantalla y guardarlo dejaría la foto torcida
    // sin que nadie sepa cómo volver.
    const giro = ((Math.round(Number(body?.giro) / 90) * 90) % 360 + 360) % 360;
    if (!Number.isFinite(giro)) {
      return NextResponse.json({ ok: false, error: "El giro tiene que ser un número." }, { status: 400 });
    }

    // El alcance va en el WHERE, igual que al servir la imagen: una foto de
    // otro grupo no existe, en vez de existir y estar prohibida.
    const actualizadas = await prisma.comprobanteArchivo.updateMany({
      where: { comprobante: { id: comprobanteId, grupoId }, orden },
      data: { giroGrados: giro },
    });
    if (!actualizadas.count) {
      return NextResponse.json({ ok: false, error: "No existe esa foto." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, giroElegido: giro });
  } catch (err) {
    console.error("Error comprobantes/foto POST:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "guardar cómo se ve la foto",
          quedo: "La foto no se tocó: esto solo anota en qué posición mirarla.",
        }),
      },
      { status: 500 }
    );
  }
}
