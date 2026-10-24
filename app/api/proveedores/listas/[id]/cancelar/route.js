// POST /api/proveedores/listas/[id]/cancelar
//
// Cancela una importación que no sirve.
//
// ── QUÉ DESBLOQUEA ──────────────────────────────────────────────────────────
//
// Una importación equivocada dejaba al usuario sin salida: no se podía descartar
// ni borrar, seguía apareciendo como proceso activo, y el archivo quedaba
// bloqueado para siempre por el índice único —que no miraba el estado—. Volver a
// subir el mismo Excel corregido era imposible.
//
// Cancelar deja el registro como historial y libera el archivo: el índice único
// pasó a ser parcial y excluye las canceladas. La garantía contra carreras se
// mantiene, porque sigue sin poder haber dos importaciones VIVAS del mismo
// archivo.
//
// ── CANCELAR DESHACE LO QUE LA LISTA APLICÓ (Emanuel, 2026-10-24) ──────────
//
// Terminar es "queda como está": lo aplicado queda aplicado. Cancelar es "esto
// no servía": si la lista ya escribió costos, se DESHACEN con la reversión de
// siempre (`revertirEnLaBase.js`, las mismas reglas de «Deshacer»: vuelve al
// previo de la primera aplicación, devuelve la venta y las ubicaciones, y lo
// que alguien tocó a mano después se omite y se informa, nunca se pisa) y la
// lista queda Cancelada. Todo en UNA transacción: si la reversión falla, la
// lista no queda cancelada y ningún costo cambió.
//
// Con algo aplicado, cancelar exige la previa que vio la persona
// (`confirmacion`, los números de GET /revertir): sin ella no se escribe nada,
// y si cambiaron mientras tanto, tampoco.
//
// La bitácora es la de una reversión: `escribirReversion` declara
// LISTA_PROVEEDOR_REVERTIR con esta importación, y `requirePerm` —primero de
// todo— abre el contexto que pone quién.
//
// ── QUÉ NO TOCA ─────────────────────────────────────────────────────────────
//
// Ni un vínculo, ni una lectura recordada, ni un «No»: dicen quién es cada
// producto, no cuánto sale. Las filas se conservan para poder explicar después
// qué proponía esta importación; se les toca la marca de aplicación (al
// deshacer) y la de selección, porque una fila seleccionada dentro de un
// proceso cancelado es una contradicción.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import {
  ESTADO_IMPORTACION,
  OPCIONES_TX,
  esImportacionAbierta,
} from "@/lib/proveedores/listas/persistencia";
import {
  difiereDeLaPrevia,
  escribirReversion,
  omitidosDelPlan,
  planDeLaImportacion,
} from "@/lib/proveedores/listas/revertirEnLaBase";

export async function POST(req, context) {
  try {
    const acceso = requirePerm(req, "proveedores.listas");
    if (!acceso.ok) {
      return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { session, grupoId } = scope;

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId, ...importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin) },
      select: {
        id: true,
        estado: true,
        proveedorId: true,
        archivoNombre: true,
        canceladaEn: true,
        terminadaEn: true,
      },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    // Idempotente: cancelar dos veces no es un error, es la misma intención.
    if (importacion.estado === ESTADO_IMPORTACION.CANCELADA) {
      return NextResponse.json({
        ok: true,
        yaCancelada: true,
        canceladaEn: importacion.canceladaEn,
      });
    }

    // ── SOLO SE CANCELA LO QUE ESTÁ SIN CERRAR ───────────────────────────
    //
    // Abierta —CONCILIADA o PARCIALMENTE_APLICADA— o en BORRADOR, que es la que
    // quedó a medio leer. Nada más.
    //
    // ── POR QUÉ NO ALCANZABA CON RECHAZAR LA APLICADA ────────────────────
    //
    // Porque hasta el 2026-09-18 lo único rechazado era APLICADA, así que una
    // lista TERMINADA se podía cancelar por la API: quedaba con `terminadaEn` Y
    // `canceladaEn`, o sea terminada y cancelada a la vez. Nada fallaba y el
    // historial mostraba una de las dos según qué campo mirara cada pantalla.
    //
    // No era un agujero teórico: desde esta tanda el botón de cancelar aparece en
    // el listado, y en el listado conviven las abiertas con las terminadas.
    //
    // Y el motivo NO es el mismo para las dos, así que se dicen distinto: una
    // aplicada tiene costos escritos y llamarla cancelada sería mentir; una
    // terminada ya la cerró alguien y lo que corresponde es mirarla, no
    // descartarla.
    const abierta =
      esImportacionAbierta(importacion.estado) ||
      importacion.estado === ESTADO_IMPORTACION.BORRADOR;

    if (!abierta) {
      const error =
        importacion.estado === ESTADO_IMPORTACION.APLICADA
          ? "Esta lista ya se aplicó entera y quedó cerrada. Si querés volver atrás, usá «Deshacer»."
          : "Esta lista ya está cerrada, así que no hay nada que cancelar.";
      return NextResponse.json(
        { ok: false, error, codigo: "NO_ESTA_ABIERTA", estado: importacion.estado },
        { status: 409 }
      );
    }

    const usuarioId = Number(session?.id ?? session?.userId) || null;
    const ahora = new Date();
    const body = await req.json().catch(() => ({}));
    const esperado = body?.confirmacion ?? null;

    const resultado = await prisma.$transaction(async (tx) => {
      // Chequeo repetido DENTRO de la transacción: entre la lectura de afuera y
      // esta escritura alguien pudo aplicarla desde otra pestaña, y cancelar
      // una aplicada dejaría el registro diciendo algo falso.
      const actual = await tx.importacionListaProveedor.findUnique({
        where: { id: importacionId },
        select: { estado: true },
      });
      if (actual.estado === ESTADO_IMPORTACION.CANCELADA) return { yaCancelada: true };
      // El MISMO predicado que afuera, no una lista de estados escrita otra vez:
      // dos copias de esta regla se separan el día que alguien agregue un estado,
      // y la de adentro de la transacción es la que decide.
      const sigueAbierta =
        esImportacionAbierta(actual.estado) || actual.estado === ESTADO_IMPORTACION.BORRADOR;
      if (!sigueAbierta) return { carrera: true, estado: actual.estado };

      // ── LO APLICADO SE DESHACE, CON LA PREVIA QUE SE VIO ──────────────
      // El plan se arma acá adentro, con datos de esta transacción. Si la
      // lista escribió algo (`plan.items`: lo que se revierte y lo que se
      // omite), sin la previa o con una vieja no se toca nada.
      const plan = await planDeLaImportacion(tx, {
        importacionId,
        grupoId,
        proveedorId: importacion.proveedorId,
      });
      let revertido = null;
      if (plan.items.length > 0) {
        if (!esperado) return { faltaPrevia: true, resumen: plan.resumen };
        if (difiereDeLaPrevia(esperado, plan.resumen)) return { conflicto: true, resumen: plan.resumen };
        revertido = await escribirReversion(tx, { plan, importacionId, usuarioId, ahora });
      }

      // Las filas conservan su estado y sus números; solo se desmarcan.
      const { count } = await tx.importacionListaFila.updateMany({
        where: { importacionId, seleccionada: true },
        data: { seleccionada: false },
      });

      await tx.importacionListaProveedor.update({
        where: { id: importacionId },
        data: {
          estado: ESTADO_IMPORTACION.CANCELADA,
          canceladaEn: ahora,
          canceladaPorUsuarioId: usuarioId,
        },
      });

      return { desmarcadas: count, revertido, omitidos: revertido ? omitidosDelPlan(plan) : [] };
    }, OPCIONES_TX);

    if (resultado.faltaPrevia || resultado.conflicto) {
      return NextResponse.json(
        {
          ok: false,
          error: resultado.faltaPrevia
            ? "Esta lista ya aplicó precios: para cancelarla hay que ver antes qué se deshace. No se cambió nada."
            : "Los números cambiaron desde que se calculó qué se deshace: alguien tocó un producto mientras " +
              "tanto. No se canceló ni se deshizo nada. Volvé a abrir «Cancelar» para ver el estado de ahora.",
          codigo: resultado.faltaPrevia ? "FALTA_PREVIA" : "PREVIA_VIEJA",
          resumen: resultado.resumen,
        },
        { status: 409 }
      );
    }

    if (resultado.carrera) {
      return NextResponse.json(
        {
          ok: false,
          error: `La lista se cerró (${resultado.estado}) mientras se cancelaba.`,
          codigo: "NO_ESTA_ABIERTA",
        },
        { status: 409 }
      );
    }
    if (resultado.yaCancelada) {
      return NextResponse.json({ ok: true, yaCancelada: true });
    }

    return NextResponse.json({
      ok: true,
      yaCancelada: false,
      canceladaEn: ahora,
      filasDesmarcadas: resultado.desmarcadas,
      archivoLiberado: true,
      // Lo que se deshizo (null si no había nada aplicado) y lo que se omitió.
      revertido: resultado.revertido,
      omitidos: resultado.omitidos,
    });
  } catch (e) {
    // El motivo, y lo que más importa saber: la transacción es todo o nada,
    // así que ni se canceló ni cambió ningún costo.
    console.error("[listas/cancelar] error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: `No se pudo cancelar la lista: ${e?.message ?? "error desconocido"}. La lista sigue abierta y ningún costo cambió.`,
      },
      { status: 500 }
    );
  }
}
