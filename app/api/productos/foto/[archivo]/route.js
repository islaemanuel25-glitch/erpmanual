// SERVIR LA FOTO DE UN PRODUCTO.
//
// ── POR QUÉ UNA RUTA Y NO UN ARCHIVO ESTÁTICO ─────────────────────────────
//
// Porque el volumen está FUERA de `public/`, y tiene que estarlo: lo que se
// sirve estático se copia adentro de la imagen al construirla, así que una foto
// guardada ahí se pierde al recrear el contenedor. Es exactamente lo que el
// centinela del almacén existe para impedir.
//
// ── PIDE PERMISO, COMO TODO GET DEL ERP ───────────────────────────────────
//
// La primera versión la dejó abierta, con un motivo escrito que era FALSO: que
// un `<img src>` no manda credenciales de forma confiable. Sí las manda — la
// url es del mismo origen, y una cookie `SameSite=Lax` viaja en subrecursos del
// mismo sitio sin problema. Lo que restringe Lax es lo que viene de OTRO sitio.
//
// Lo destapó el candado "ningún GET se sirve sin comprobar permiso", que existe
// justamente para esto: para que una excepción sea una decisión escrita en su
// lista y no un párrafo convincente adentro de una ruta.
//
// El permiso es el del módulo, `productos.ver`, sacado del hermano más cercano
// —la ruta de listar— y no uno nuevo: quien no puede ver el catálogo tampoco
// tiene por qué ver sus fotos.

import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { TIPOS_ACEPTADOS, esNombreDeFotoValido } from "@/lib/productos/fotoProducto";
import { inspeccionarAlmacenDeFotos } from "@/lib/productos/almacenFotos";

export const runtime = "nodejs";

const TIPO_POR_EXTENSION = Object.fromEntries(
  Object.entries(TIPOS_ACEPTADOS).map(([tipo, ext]) => [ext, tipo])
);

export async function GET(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const perm = checkPerm(ctx.session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

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

        // ── LA CACHÉ ES DEL NAVEGADOR, NUNCA DE UNA COMPARTIDA ─────────────
        //
        // Un año e inmutable, porque el nombre lleva un azar adentro y una foto
        // nueva es una url nueva. Sin esto la lista vuelve a bajar las 25 fotos
        // en cada visita, que en un celular con datos es lo que se nota. Eso no
        // cambia: lo que cambia es QUIÉN puede guardarlas.
        //
        // ── EL DEFECTO QUE ESTO CIERRA, MEDIDO EN PRODUCCIÓN ───────────────
        //
        // Acá decía `public`. El chequeo de permiso de arriba se cumplía —una
        // petición sin sesión llegaba y se iba con 401— pero la respuesta que sí
        // salía la guardaba Cloudflare, y a partir de ahí la servía el borde a
        // cualquiera que tuviera la url, sin volver a pasar por este archivo.
        //
        // Comprobado el 2026-08-23 contra `operix.cloud`: la foto contestó 200
        // sin ninguna credencial, con `cf-cache-status: HIT` y `Age: 11572`. El
        // permiso no fallaba; lo estaban salteando por afuera.
        //
        // Es la forma más difícil de ver de todas: la defensa está escrita, se
        // ejecuta, y aun así no defiende — porque el tráfico dejó de llegarle.
        //
        // Y la url ayudaba a que pasara: termina en `.webp`, que está en la
        // lista de extensiones que Cloudflare cachea por defecto. Parece un
        // archivo estático y no lo es.
        //
        // `private` es lo que lo arregla: el navegador la sigue guardando y una
        // caché compartida tiene prohibido hacerlo.
        "Cache-Control": "private, max-age=31536000, immutable",

        // ── Y EL CINTURÓN, PORQUE `private` SE PUEDE PISAR DESDE AFUERA ────
        //
        // Una Cache Rule del panel que diga "guardá igual, ignorá lo que mande
        // el origen" vuelve a dejar la foto en el borde, y desde acá no hay
        // forma de ver si esa regla existe. Esta cabecera es la que Cloudflare
        // mira ANTES que `Cache-Control` para decidir su propia caché, así que
        // sobrevive a esa configuración; solo le gana una Cache Response Rule
        // con `set_cache_control`.
        //
        // No toca la caché del navegador: es exclusiva de la del CDN. Por eso
        // se pueden pedir las dos cosas a la vez y no se contradicen.
        "Cloudflare-CDN-Cache-Control": "no-store",

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
