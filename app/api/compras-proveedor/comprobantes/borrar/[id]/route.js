// DELETE /api/compras-proveedor/comprobantes/borrar/[id]
//
// Borra un comprobante que todavía no se confirmó: la fila, sus líneas y su foto
// del volumen.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────
//
// Confirmado NO se borra, se anula. Un comprobante confirmado ya escribió costos
// en una recepción y esos costos están en productos que se venden; borrarlo
// dejaría esos números sin de dónde salieron. La regla vive en `borrado.js` con
// sus candados y se comprueba ACÁ, del lado del servidor: la pantalla esconde el
// botón, pero quien llama a esta ruta puede ser cualquiera.
//
// ── EL ORDEN: PRIMERO LA BASE, DESPUÉS EL DISCO ────────────────────────────
//
// Las filas se borran en una transacción y recién después se borran los
// archivos. Al revés —disco primero— una transacción que falla dejaría un
// comprobante en la base apuntando a una foto que ya no existe, o sea uno que no
// se puede leer y que tampoco se puede explicar.
//
// En este orden el peor caso es un archivo huérfano en el volumen: ocupa lugar y
// no rompe nada. Se avisa en el log para poder limpiarlo, y no se hace fallar la
// operación por eso — la fila ya no está y contestar un error haría que alguien
// intentara borrar de nuevo algo que ya se borró.
//
// Las líneas y los archivos se van solos: las dos relaciones son `onDelete:
// Cascade` en el esquema. No se borran a mano acá para no tener dos criterios.

import { NextResponse } from "next/server";
import { unlink } from "node:fs/promises";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { sePuedeBorrar, MOTIVO_NO_BORRAR } from "@/lib/compras-proveedor/comprobante/borrado";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";

export async function DELETE(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { grupoId, session } = ctx;

    // Borrar un comprobante es parte de recibir mercadería, no de mirarla.
    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const comprobanteId = Number(id);
    if (!Number.isFinite(comprobanteId) || comprobanteId <= 0) {
      return NextResponse.json({ ok: false, error: "Falta decir qué comprobante." }, { status: 400 });
    }

    // El alcance va en el WHERE: uno de otro grupo no existe.
    const comprobante = await prisma.comprobanteProveedor.findFirst({
      where: { id: comprobanteId, grupoId },
      select: {
        id: true, confirmadoEn: true, tipo: true, puntoVenta: true, numero: true,
        _count: { select: { lineas: true } },
        archivos: { select: { id: true, ubicacion: true } },
      },
    });

    const puede = sePuedeBorrar(comprobante);
    if (!puede.ok) {
      return NextResponse.json(
        { ok: false, error: puede.motivo },
        { status: puede.motivo === MOTIVO_NO_BORRAR.NO_EXISTE ? 404 : 409 }
      );
    }

    const rutas = comprobante.archivos.map((a) => a.ubicacion).filter(Boolean);
    const lineas = comprobante._count.lineas;

    // Primero la base. Las líneas y los archivos caen por cascada.
    await prisma.comprobanteProveedor.delete({ where: { id: comprobante.id } });

    // Y ahora el disco. Un archivo que no se pudo borrar NO hace fallar esto: la
    // fila ya no está, y contestar un error haría que alguien lo intentara de
    // nuevo sobre algo que ya se borró.
    let huerfanos = 0;
    for (const ruta of rutas) {
      try {
        await unlink(ruta);
      } catch (e) {
        // ENOENT no es un problema: el archivo ya no estaba.
        if (e?.code !== "ENOENT") {
          huerfanos++;
          console.error(`No se pudo borrar el archivo ${ruta}:`, e?.message);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      queHacer:
        `Comprobante borrado, con sus ${lineas === 1 ? "1 línea" : `${lineas} líneas`} y ` +
        `${rutas.length === 1 ? "su foto" : `sus ${rutas.length} fotos`}.` +
        (huerfanos ? " Quedó un archivo sin borrar en el servidor; avisá para que lo limpien." : ""),
      lineas,
      fotos: rutas.length,
    });
  } catch (err) {
    console.error("Error comprobantes/borrar:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "borrar el comprobante",
          quedo: "Puede que se haya borrado igual: mirá la lista antes de intentarlo de nuevo.",
        }),
      },
      { status: 500 }
    );
  }
}
