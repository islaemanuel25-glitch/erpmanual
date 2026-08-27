// POST /api/compras-proveedor/recetas-lectura/guardar
//
// "Confirmar y recordar". Es la ÚNICA ruta que escribe una receta de lectura, y
// solo se llega acá desde una confirmación explícita: "usar solo esta vez" pasa
// por `interpretar` y termina ahí.
//
// La receta se vuelve a validar ACÁ aunque la pantalla ya la haya validado. No
// es desconfianza del navegador en abstracto: el cuerpo es JSON y cualquier otro
// camino llegaría con lo que quiera. La validación es la misma función, así que
// no puede haber dos criterios.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { errorInesperado } from "@/lib/compras-proveedor/comprobante/errorDeRuta";
import {
  recetaAporta,
  recetaValida,
  valoresDeFacturaEnLaReceta,
} from "@/lib/compras-proveedor/importacion/recetaDeLectura";

export async function POST(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    // Los DOS permisos, igual que la receta de impuestos: la pantalla pide
    // `compras.crear` y quien enseña un formato está cargando configuración.
    const perm = checkPerm(ctx.session, ["compras.ver", "compras.crear"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => ({}));
    const proveedorId = Number(body.proveedorId);
    const nombre = String(body.nombre ?? "").trim();
    if (!Number.isInteger(proveedorId) || proveedorId < 1) {
      return NextResponse.json({ ok: false, error: "Falta el proveedor." }, { status: 400 });
    }
    if (!nombre) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Poné un nombre para este formato, por ejemplo Consumidor Final o Remito. " +
            "Es lo que después distingue una variante de la otra.",
        },
        { status: 400 }
      );
    }

    const receta = recetaValida(body.receta);
    if (!recetaAporta(receta)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La receta quedó vacía: no se entendió ninguna columna ni ninguna regla. " +
            "Probá explicando qué columna es cada una.",
        },
        { status: 400 }
      );
    }

    // ── NO SE GUARDAN VALORES DE UNA FACTURA, Y SE DICE CUÁLES ───────────
    //
    // `recetaValida` ya los filtra, así que llegar acá con alguno significa que
    // se coló por una forma que el filtro no contempla. Se rechaza en vez de
    // guardar lo que quedó: una receta que reconoce UN documento en vez de un
    // formato falla recién con la factura siguiente, y sin decir por qué.
    const valoresVariables = valoresDeFacturaEnLaReceta(receta);
    if (valoresVariables.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La receta no puede guardar datos de una factura concreta, porque cambian " +
            `en la siguiente. Sacá: ${valoresVariables.join("; ")}.`,
        },
        { status: 400 }
      );
    }

    const proveedor = await prisma.proveedor.findUnique({
      where: { id: proveedorId },
      select: { id: true, nombre: true, grupoId: true },
    });
    if (!proveedor || proveedor.grupoId !== ctx.grupoId) {
      return NextResponse.json({ ok: false, error: "No existe ese proveedor." }, { status: 404 });
    }

    const explicacion = String(body.explicacion ?? "").trim() || null;
    const existente = await prisma.recetaLecturaProveedor.findUnique({
      where: { grupoId_proveedorId_nombre: { grupoId: ctx.grupoId, proveedorId, nombre } },
      select: { id: true, version: true },
    });

    const fila = existente
      ? await prisma.recetaLecturaProveedor.update({
          where: { id: existente.id },
          // La versión sube en cada edición, igual que en la receta de impuestos:
          // es lo que después permite explicar por qué un documento viejo se
          // leyó como se leyó.
          data: {
            receta,
            explicacion,
            version: existente.version + 1,
            confirmadaPorUsuarioId: ctx.session?.id ?? null,
          },
        })
      : await prisma.recetaLecturaProveedor.create({
          data: {
            grupoId: ctx.grupoId,
            proveedorId,
            nombre,
            receta,
            explicacion,
            confirmadaPorUsuarioId: ctx.session?.id ?? null,
          },
        });

    return NextResponse.json({
      ok: true,
      receta: { id: fila.id, nombre: fila.nombre, version: fila.version, receta: fila.receta },
      creada: !existente,
    });
  } catch (err) {
    console.error("Error recetas-lectura/guardar:", err);
    return NextResponse.json(
      {
        ok: false,
        error: errorInesperado({
          operacion: "guardar la receta de lectura",
          quedo:
            "El pedido que estabas armando no se tocó: esto solo guarda cómo leer el formato.",
        }),
      },
      { status: 500 }
    );
  }
}
