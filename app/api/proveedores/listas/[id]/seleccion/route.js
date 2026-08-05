// POST /api/proveedores/listas/[id]/seleccion
//
// Marca y desmarca filas para aplicar.
//
// La pantalla ya sabe qué filas son seleccionables y solo dibuja esos checkbox,
// pero eso NO alcanza: el estado que vale es el de la base. Entre que se pintó
// la tabla y que llega este pedido, una fila pudo aplicarse desde otra pestaña,
// perder el vínculo o cambiar de estado. Por eso cada id que llega se vuelve a
// validar contra la fila viva antes de tocar nada.
//
// Guardar la selección en la base y no en el componente es lo que permite que
// recargar la página, filtrar por estado o pasar de escritorio a teléfono no
// pierda lo que el usuario venía marcando en una lista de dos mil filas.
//
// NO APLICA NINGÚN COSTO. Solo mueve el flag `seleccionada`.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import {
  validarSeleccion,
  normalizarIds,
  idsSeleccionables,
  resumirSeleccion,
  TEXTO_NO_SELECCIONABLE,
} from "@/lib/proveedores/listas/seleccion";

const ACCIONES = new Set(["MARCAR", "DESMARCAR", "TODOS", "NINGUNO"]);

export async function POST(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const accion = String(body?.accion ?? "").toUpperCase();
    if (!ACCIONES.has(accion)) {
      return NextResponse.json({ ok: false, error: "Acción inválida." }, { status: 400 });
    }

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // Se traen solo los campos que deciden la selección. Son 2.000 filas: pedir
    // la fila entera para mover un booleano es traer medio archivo por gusto.
    const filas = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: {
        id: true, estado: true, aplicada: true, seleccionada: true,
        productoBaseId: true, costoMaestroPropuesto: true,
      },
    });

    let aMarcar = [];
    let aDesmarcar = [];
    let rechazadas = [];

    if (accion === "TODOS") {
      aMarcar = idsSeleccionables(filas, importacion);
    } else if (accion === "NINGUNO") {
      aDesmarcar = filas.filter((f) => f.seleccionada).map((f) => f.id);
    } else {
      const ids = normalizarIds(body?.ids);
      if (ids.length === 0) {
        return NextResponse.json({ ok: false, error: "No llegó ninguna fila." }, { status: 400 });
      }
      if (accion === "MARCAR") {
        // Estricto: si el cliente pide marcar algo que no corresponde, se le
        // dice cuál y por qué en vez de marcar "las que se podían" y dejarlo
        // creyendo que entraron todas.
        const v = validarSeleccion(ids, filas, importacion, { estricto: true });
        if (!v.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: v.rechazadas[0]?.texto ?? TEXTO_NO_SELECCIONABLE.ESTADO_NO_APLICABLE,
              rechazadas: v.rechazadas,
            },
            { status: 409 }
          );
        }
        aMarcar = v.aceptadas;
        rechazadas = v.rechazadas;
      } else {
        // Desmarcar nunca se rechaza: quitar una fila de la selección no puede
        // hacer daño, y bloquearlo dejaría al usuario sin poder corregirse.
        const existentes = new Set(filas.map((f) => f.id));
        aDesmarcar = ids.filter((x) => existentes.has(x));
      }
    }

    if (aMarcar.length > 0 || aDesmarcar.length > 0) {
      await prisma.$transaction(async (tx) => {
        if (aMarcar.length > 0) {
          await tx.importacionListaFila.updateMany({
            where: { id: { in: aMarcar }, importacionId },
            data: { seleccionada: true },
          });
        }
        if (aDesmarcar.length > 0) {
          await tx.importacionListaFila.updateMany({
            where: { id: { in: aDesmarcar }, importacionId },
            data: { seleccionada: false },
          });
        }
      }, OPCIONES_TX);
    }

    const frescas = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: {
        id: true, estado: true, aplicada: true, seleccionada: true,
        productoBaseId: true, costoMaestroPropuesto: true,
      },
    });

    return NextResponse.json({
      ok: true,
      accion,
      marcadas: aMarcar.length,
      desmarcadas: aDesmarcar.length,
      rechazadas,
      resumen: resumirSeleccion(frescas, importacion),
      seleccionadas: frescas.filter((f) => f.seleccionada).map((f) => f.id),
    });
  } catch (e) {
    console.error("[listas/seleccion] error:", e);
    return NextResponse.json({ ok: false, error: "Error al guardar la selección." }, { status: 500 });
  }
}
