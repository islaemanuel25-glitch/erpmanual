// GET /api/compras-proveedor/recetas-lectura/listar?proveedorId=
//
// Las variantes de formato que ya se le enseñaron a este proveedor. Solo lee.
//
// Devuelve TODAS, no "la" receta: un mismo proveedor factura con formatos
// distintos y quien está importando tiene que poder elegir cuál corresponde al
// papel que tiene en la mano. Elegir por el sistema sería adivinar, y adivinar
// mal significa leer las columnas cambiadas de lugar.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import {
  recetaEnCastellano,
  recetaValida,
} from "@/lib/compras-proveedor/importacion/recetaDeLectura";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const perm = checkPerm(ctx.session, ["compras.ver", "compras.crear"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const proveedorId = Number(new URL(req.url).searchParams.get("proveedorId"));
    if (!Number.isInteger(proveedorId) || proveedorId < 1) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }

    const filas = await prisma.recetaLecturaProveedor.findMany({
      where: { grupoId: ctx.grupoId, proveedorId },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        receta: true,
        explicacion: true,
        version: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      items: filas.map((fila) => {
        // Se vuelve a validar lo que salió de la base. Una receta guardada con
        // una versión vieja del vocabulario podría traer campos que ya no
        // existen, y aplicarlos sería leer con reglas que nadie escribió hoy.
        const receta = recetaValida(fila.receta);
        return {
          id: fila.id,
          nombre: fila.nombre,
          receta,
          enCastellano: recetaEnCastellano(receta),
          explicacion: fila.explicacion,
          version: fila.version,
          actualizada: fila.updatedAt,
        };
      }),
    });
  } catch (err) {
    console.error("Error recetas-lectura/listar:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "abrir las recetas de lectura",
          quedo: "No se tocó nada: esto solo muestra lo que ya estaba guardado.",
        }),
      },
      { status: 500 }
    );
  }
}
