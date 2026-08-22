// SERVIR LA FOTO DE UN PRODUCTO.
//
// ── POR QUÉ UNA RUTA Y NO UN ARCHIVO ESTÁTICO ─────────────────────────────
//
// Porque el volumen está FUERA de `public/`, y tiene que estarlo: lo que se
// sirve estático se copia adentro de la imagen al construirla, así que una foto
// guardada ahí se pierde al recrear el contenedor. Es exactamente lo que el
// centinela del almacén existe para impedir.
//
// ── POR QUÉ NO PIDE SESIÓN ────────────────────────────────────────────────
//
// Es una decisión, no un olvido. Esta url va adentro de `<img src>` en el
// listado de productos, y un `<img>` no manda credenciales de forma confiable en
// todos los contextos. Lo que se expone es la foto de un producto del catálogo,
// con un nombre que incluye ocho caracteres al azar: no se puede enumerar.
//
// No es material sensible —una foto de un paquete de yerba— y el resto del ERP
// sigue detrás de sesión. Si algún día hay que cerrarla, el cambio es acá y en
// cómo la pide la tarjeta, no en el almacén.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { TIPOS_ACEPTADOS, esNombreDeFotoValido } from "@/lib/productos/fotoProducto";
import { inspeccionarAlmacenDeFotos } from "@/lib/productos/almacenFotos";

export const runtime = "nodejs";

const TIPO_POR_EXTENSION = Object.fromEntries(
  Object.entries(TIPOS_ACEPTADOS).map(([tipo, ext]) => [ext, tipo])
);

export async function GET(_req, { params }) {
  try {
    const { archivo } = await params;

    // ── LA FORMA SE VALIDA ANTES DE TOCAR EL DISCO ───────────────────────
    //
    // Sin esto, un nombre con ".." adentro sube por el árbol de directorios y
    // esta ruta lee cualquier archivo del contenedor. Se valida por FORMA
    // COMPLETA y no sacando lo prohibido: una lista de cosas que filtrar siempre
    // se queda corta, y hay más formas de escribir ".." de las que uno recuerda.
    if (!esNombreDeFotoValido(archivo)) {
      return NextResponse.json({ ok: false, error: "Nombre de foto inválido." }, { status: 400 });
    }

    const almacen = await inspeccionarAlmacenDeFotos();
    if (!almacen.ok) {
      return NextResponse.json({ ok: false, error: almacen.motivo }, { status: 503 });
    }

    let bytes;
    try {
      bytes = await readFile(join(almacen.ruta, archivo));
    } catch {
      // Una foto que no está NO es un error del servidor: la fila puede apuntar
      // a un archivo borrado a mano. La tarjeta ya sabe esconderse sola con un
      // 404, así que se contesta 404 y no 500.
      return NextResponse.json({ ok: false, error: "Esa foto no está." }, { status: 404 });
    }

    const extension = String(archivo).split(".").pop();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": TIPO_POR_EXTENSION[extension] || "application/octet-stream",
        // Un año, e inmutable: el nombre lleva un azar adentro, así que una foto
        // nueva es una url nueva. Sin esto la lista vuelve a bajar las 25 fotos
        // en cada visita, que en un celular con datos es lo que se nota.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(bytes.length),
      },
    });
  } catch (e) {
    console.error("[productos/foto/leer]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo leer la foto: ${e?.message ?? "motivo desconocido"}` },
      { status: 500 }
    );
  }
}
