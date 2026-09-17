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

const ACCIONES = new Set(["MARCAR", "DESMARCAR", "TODOS", "NINGUNO", "EXCLUIR", "INCLUIR"]);

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
      // `proveedorId` desde esta tanda: "no lo cambio" se recuerda POR PRODUCTO
      // Y PROVEEDOR, así que sin este campo la memoria no sabría de quién es.
      // Sin pedirlo llegaría `undefined` y el `createMany` fallaría contra
      // Postgres —columna no nula— recién al apretar el botón.
      select: { id: true, estado: true, proveedorId: true },
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
        productoBaseId: true, costoMaestroPropuesto: true, excluidaManual: true,
      },
    });

    let aMarcar = [];
    let aDesmarcar = [];
    let rechazadas = [];

    if (accion === "TODOS") {
      aMarcar = idsSeleccionables(filas, importacion);
    } else if (accion === "NINGUNO") {
      aDesmarcar = filas.filter((f) => f.seleccionada).map((f) => f.id);
    } else if (accion === "EXCLUIR" || accion === "INCLUIR") {
      // Excluir es una decisión de una persona que miró la fila. No se valida
      // contra el estado: se puede excluir cualquier fila, incluso una que el
      // motor considera perfecta, porque el que sabe si el producto es el que
      // parece no es el motor.
      const ids = normalizarIds(body?.ids);
      if (ids.length === 0) {
        return NextResponse.json({ ok: false, error: "No llegó ninguna fila." }, { status: 400 });
      }
      const existentes = new Set(filas.map((f) => f.id));
      const objetivo = ids.filter((x) => existentes.has(x));
      if (objetivo.length === 0) {
        return NextResponse.json({ ok: false, error: "Ninguna fila pertenece a esta importación." }, { status: 404 });
      }
      const excluir = accion === "EXCLUIR";
      // Los productos de las filas que se están tocando. Se sacan ACÁ, de las
      // filas ya traídas, y no con otra consulta: el `select` de arriba ya pide
      // `productoBaseId`.
      const productosTocados = [
        ...new Set(
          filas
            .filter((f) => objetivo.includes(f.id) && f.productoBaseId)
            .map((f) => f.productoBaseId)
        ),
      ];

      await prisma.$transaction(async (tx) => {
        await tx.importacionListaFila.updateMany({
          where: { id: { in: objetivo }, importacionId },
          // Excluir DESELECCIONA en el mismo movimiento: dejar marcada una fila
          // excluida sería una contradicción que después hay que explicar.
          data: excluir
            ? { excluidaManual: true, seleccionada: false }
            : { excluidaManual: false },
        });

        // ── "NO LO CAMBIO" DEJÓ DE SER POR LISTA ──────────────────────────
        //
        // La regla de Emanuel, textual: "si ya le expliqué en una pasada, las
        // 100 listas que vengan son iguales". Antes esto excluía la fila y valía
        // para ESA lista nada más, así que el mismo producto volvía a la cola
        // todos los meses y había que volver a contestarlo.
        //
        // Va en la MISMA transacción que la exclusión de la fila: si se
        // escribiera aparte, un error entre las dos dejaría la fila excluida sin
        // memoria —y la decisión desaparecería en la lista siguiente— o la
        // memoria sin la fila, que es peor porque el usuario no vería su efecto
        // hasta el mes que viene.
        //
        // Y desmarcar lo DESHACE, que es la otra mitad: una decisión que no se
        // puede revertir desde donde se ve no es una decisión, es una trampa.
        if (productosTocados.length > 0) {
          if (excluir) {
            // `skipDuplicates` en vez de comprobar antes: el único de la tabla
            // ya garantiza uno por producto y proveedor, y preguntar primero
            // abriría una carrera entre la pregunta y la escritura.
            await tx.productoQueNoSeCambia.createMany({
              data: productosTocados.map((productoBaseId) => ({
                grupoId,
                proveedorId: importacion.proveedorId,
                productoBaseId,
                // QUIÉN LO DECIDIÓ. Sale de la sesión que ya resolvió
                // `requireAdmin`, no de una segunda lectura del token: es un
                // dato de autoría y tiene que ser el mismo con el que se
                // autorizó el pedido.
                decididoPorUsuarioId: admin.session?.id ?? null,
              })),
              skipDuplicates: true,
            });
          } else {
            await tx.productoQueNoSeCambia.deleteMany({
              where: {
                grupoId,
                proveedorId: importacion.proveedorId,
                productoBaseId: { in: productosTocados },
              },
            });
          }
        }
      }, OPCIONES_TX);

      const frescasEx = await prisma.importacionListaFila.findMany({
        where: { importacionId },
        select: {
          id: true, estado: true, aplicada: true, seleccionada: true,
          productoBaseId: true, costoMaestroPropuesto: true, excluidaManual: true,
        },
      });
      return NextResponse.json({
        ok: true,
        accion,
        afectadas: objetivo.length,
        resumen: resumirSeleccion(frescasEx, importacion),
        // Las aplicadas conservan la marca de cuando se aplicaron. No se limpia
        // —tocar una fila cerrada sería peor— pero no se informa como selección
        // viva: la pantalla dibujaría un tilde en una fila que no se puede tocar.
        seleccionadas: frescasEx.filter((f) => f.seleccionada && !f.aplicada).map((f) => f.id),
        excluidas: frescasEx.filter((f) => f.excluidaManual).map((f) => f.id),
      });
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
        productoBaseId: true, costoMaestroPropuesto: true, excluidaManual: true,
      },
    });

    return NextResponse.json({
      ok: true,
      accion,
      marcadas: aMarcar.length,
      desmarcadas: aDesmarcar.length,
      rechazadas,
      resumen: resumirSeleccion(frescas, importacion),
      seleccionadas: frescas.filter((f) => f.seleccionada && !f.aplicada).map((f) => f.id),
      excluidas: frescas.filter((f) => f.excluidaManual).map((f) => f.id),
    });
  } catch (e) {
    console.error("[listas/seleccion] error:", e);
    return NextResponse.json({ ok: false, error: "Error al guardar la selección." }, { status: 500 });
  }
}
