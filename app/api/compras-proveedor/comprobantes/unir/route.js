// POST /api/compras-proveedor/comprobantes/unir
//
// LA SALIDA DE EMERGENCIA. Junta varios comprobantes en uno solo, moviéndole
// las fotos al más viejo.
//
// Existe porque ALGUIEN SE VA A EQUIVOCAR IGUAL al subir —va a contestar que es
// una factura nueva cuando era la segunda hoja— y sin esto la única salida sería
// borrar y volver a fotografiar el papel, que a veces ya no está.
//
// NO es el camino normal. El camino normal es contestar la pregunta al subir,
// cuando quien la contesta tiene el papel en la mano y sabe la respuesta sin
// pensarla. Media hora después, frente a dos comprobantes que no cierran, ya no
// se acuerda.
//
// ── QUÉ PASA CON LO QUE YA SE HABÍA LEÍDO ──────────────────────────────────
//
// Se borra. Las líneas y la identidad de los comprobantes que se unen salían de
// leer medio papel cada uno: conservarlas dejaría la mitad de una factura
// mezclada con la mitad de la otra, y la suma no querría decir nada. El
// resultado vuelve a PENDIENTE_LECTURA para leerse entero.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { puedenUnirse } from "@/lib/compras-proveedor/comprobante/pantalla";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    }
    const { grupoId, session } = ctx;

    const perm = checkPerm(session, "compras.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json().catch(() => ({}));
    const ids = (Array.isArray(body?.ids) ? body.ids : []).map(Number).filter(Number.isFinite);
    if (ids.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Elegí al menos dos comprobantes para unir." },
        { status: 400 }
      );
    }

    const comprobantes = await prisma.comprobanteProveedor.findMany({
      where: { id: { in: ids }, grupoId },
      select: {
        id: true,
        proveedorId: true,
        estado: true,
        createdAt: true,
        confirmadoEn: true,
        archivos: { select: { id: true, orden: true, ubicacion: true } },
      },
    });

    // Que falte alguno se dice, no se ignora: unir tres cuando se pidieron
    // cuatro sería hacer algo distinto de lo que pidieron sin avisar.
    if (comprobantes.length !== ids.length) {
      return NextResponse.json(
        { ok: false, error: "Alguno de los comprobantes no existe o es de otro grupo." },
        { status: 404 }
      );
    }

    const veredicto = puedenUnirse(comprobantes);
    if (!veredicto.ok) {
      return NextResponse.json({ ok: false, error: veredicto.motivo }, { status: 409 });
    }

    const { destino, absorbidos } = veredicto;

    const resultado = await prisma.$transaction(async (tx) => {
      // Las fotos se renumeran EN ORDEN DE COMPROBANTE Y DE PÁGINA. El orden
      // importa: el lector las manda como páginas de un mismo papel, y el pie
      // antes del encabezado se entiende distinto.
      let orden = 0;
      const enOrden = [destino, ...absorbidos];
      for (const c of enOrden) {
        for (const a of [...c.archivos].sort((x, y) => x.orden - y.orden)) {
          orden += 1;
          await tx.comprobanteArchivo.update({
            where: { id: a.id },
            data: { comprobanteId: destino.id, orden },
          });
        }
      }

      // Lo leído se descarta: salía de medio papel cada uno.
      await tx.comprobanteLinea.deleteMany({ where: { comprobanteId: { in: [destino.id, ...absorbidos.map((c) => c.id)] } } });

      await tx.comprobanteProveedor.update({
        where: { id: destino.id },
        data: {
          estado: "PENDIENTE_LECTURA",
          tipo: null,
          puntoVenta: null,
          numero: null,
          fecha: null,
          cuitLeido: null,
          netoLeido: null,
          ivaLeido: null,
          internoLeido: null,
          percepcionesLeido: null,
          totalLeido: null,
          diferenciaCentavos: null,
          leidoEn: null,
          // `intentosLectura` NO se reinicia: los intentos ocurrieron y borrarlos
          // haría que el número de acierto contara este comprobante como si
          // hubiera cerrado a la primera.
          cerroEnIntento: null,
        },
      });

      // Los absorbidos se borran; sus fotos ya se movieron, así que el borrado
      // en cascada no se lleva ninguna imagen.
      await tx.comprobanteProveedor.deleteMany({ where: { id: { in: absorbidos.map((c) => c.id) } } });

      return { destinoId: destino.id, fotos: orden, absorbidos: absorbidos.length };
    });

    return NextResponse.json({
      ok: true,
      ...resultado,
      queHacer:
        `Quedó un solo comprobante con ${resultado.fotos} fotos, sin leer. ` +
        "Tocá «Leer» para que se lea entero.",
    });
  } catch (err) {
    console.error("Error compras-proveedor/comprobantes/unir:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
