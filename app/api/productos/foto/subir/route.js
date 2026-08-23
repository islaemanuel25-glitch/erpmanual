// SUBIR LA FOTO DE UN PRODUCTO.
//
// Recibe UNA imagen ya redimensionada por el cliente, la escribe en el volumen
// de fotos de producto y devuelve la url que va a `ProductoBase.imagen_url`.
//
// ── LO QUE ESTA RUTA NO HACE, Y ES A PROPÓSITO ────────────────────────────
//
// No escribe en la base. Devuelve la url y la pantalla la pone en el formulario,
// que se guarda con el resto del producto. Así subir una foto y arrepentirse
// antes de guardar no deja el producto apuntando a un archivo que la persona
// nunca confirmó — y, sobre todo, no hay dos caminos escribiendo `imagen_url`:
// sigue habiendo uno solo, el de guardar el producto.
//
// Tampoco redimensiona. Eso pasa en el navegador, antes de subir, y por dos
// motivos: no se gastan MB de datos del celular mandando una foto de 12 MB para
// tirar el 95 %, y el servidor no necesita una librería de imágenes.
//
// El tope de acá NO es la compresión: es el límite de lo que se acepta cuando la
// compresión no ocurrió.

import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import {
  MAXIMO_BYTES,
  TIPOS_ACEPTADOS,
  VARIABLE_RUTA_FOTOS,
  nombreDeFoto,
  urlDeFoto,
} from "@/lib/productos/fotoProducto";
import { exigirAlmacenDeFotos, traducirErrorDeEscritura } from "@/lib/productos/almacenFotos";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    // ── 1. Alcance y permiso ─────────────────────────────────────────────
    //
    // El contexto sale de la sesión, nunca del cuerpo. El permiso es el de
    // editar productos: cargar la foto es editar la ficha, no una acción aparte
    // con su propio permiso — inventarle uno haría que alguien pueda cambiar la
    // foto de un producto que no puede editar.
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const perm = checkPerm(ctx.session, "productos.editar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // ── 2. EL VOLUMEN, ANTES DE LEER UN SOLO BYTE ────────────────────────
    //
    // Si no está montado se corta acá con el motivo adentro. Sin esto la
    // escritura funcionaría igual sobre el disco del contenedor y la foto se
    // perdería al recrearlo, en silencio.
    let almacen;
    try {
      almacen = await exigirAlmacenDeFotos();
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: e.motivo || e.message,
          queHacer:
            "No se pueden guardar fotos hasta que el volumen esté montado. " +
            `Revisá la variable ${VARIABLE_RUTA_FOTOS} y el volumen del compose.`,
        },
        { status: 503 }
      );
    }

    // ── 3. El archivo ────────────────────────────────────────────────────
    const form = await req.formData();
    const productoBaseId = Number(form.get("productoBaseId"));
    if (!Number.isFinite(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Falta el producto al que pertenece la foto." },
        { status: 400 }
      );
    }

    const archivo = form.get("archivo");
    if (!archivo || typeof archivo.arrayBuffer !== "function") {
      return NextResponse.json(
        { ok: false, error: "No llegó ninguna imagen." },
        { status: 400 }
      );
    }

    const extension = TIPOS_ACEPTADOS[archivo.type];
    if (!extension) {
      return NextResponse.json(
        {
          ok: false,
          error: `El formato ${archivo.type || "desconocido"} no se acepta.`,
          queHacer: `Se aceptan ${Object.keys(TIPOS_ACEPTADOS).join(", ")}.`,
        },
        { status: 415 }
      );
    }

    const bytes = Buffer.from(await archivo.arrayBuffer());
    if (bytes.length > MAXIMO_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: `La imagen pesa ${Math.round(bytes.length / 1024)} KB y el máximo son ${Math.round(
            MAXIMO_BYTES / 1024
          )} KB.`,
          queHacer:
            "El navegador tendría que haberla achicado antes de subirla. " +
            "Probá de nuevo desde la cámara o elegí una foto más chica.",
        },
        { status: 413 }
      );
    }
    if (bytes.length === 0) {
      return NextResponse.json({ ok: false, error: "La imagen llegó vacía." }, { status: 400 });
    }

    // ── 4. A disco ───────────────────────────────────────────────────────
    const nombre = nombreDeFoto({ productoBaseId, extension });
    try {
      await writeFile(join(almacen.ruta, nombre), bytes);
    } catch (e) {
      const { mensaje, estado } = traducirErrorDeEscritura(e, almacen.ruta);
      return NextResponse.json({ ok: false, error: mensaje }, { status: estado });
    }

    return NextResponse.json({ ok: true, url: urlDeFoto(nombre), archivo: nombre, bytes: bytes.length });
  } catch (e) {
    // ── EL MENSAJE DICE QUÉ PASÓ ─────────────────────────────────────────
    //
    // "Error interno" es lo que producción mostró el día que se cayó, y no dejó
    // avanzar a nadie. Acá va el motivo real: esta ruta la usa una persona con
    // el teléfono en la mano y necesita saber si reintentar o avisar.
    console.error("[productos/foto/subir]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar la foto: ${e?.message ?? "motivo desconocido"}` },
      { status: 500 }
    );
  }
}
