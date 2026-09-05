import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { materializarDefaults, validarCambioDeMedio } from "@/lib/pos-ventas/mediosCobroServidor";
import { normalizarEntrada } from "@/lib/pos-ventas/mediosCobro";

// EDITAR O BORRAR UN MEDIO DE COBRO.
//
// ── EL `localId` DEL WHERE NO ES DECORATIVO ────────────────────────────────
//
// Cada consulta filtra por el local del alcance además del id. Es la misma
// defensa barata que usa el resto del sistema contra un id de otra ubicación
// colado en la URL: sin eso, un encargado podría apagarle un medio de cobro a
// otra boca escribiendo el número a mano.

export async function PATCH(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const medioId = Number(id);

    const body = await req.json();
    const datos = normalizarEntrada(body, { parcial: true });
    if (!datos.valido) return NextResponse.json({ ok: false, error: datos.error }, { status: 400 });
    const { valido, ...cambios } = datos;

    const actualizado = await prisma.$transaction(async (tx) => {
      // Si el local venía con los defaults, la PRIMERA edición tiene que
      // materializarlos: sin eso, apagar "Crédito" dejaría al local con una sola
      // fila y el POS se quedaría sin los otros tres botones.
      //
      // Y como los defaults no tienen id, el que llegó por la URL no existe
      // todavía. Se materializa primero y se resuelve el medio por su TIPO, que
      // es lo único estable entre un default y su fila.
      const materializado = await materializarDefaults(tx, { localId });

      let objetivo = await tx.medioCobroLocal.findFirst({
        where: { id: medioId, localId },
        select: { id: true },
      });

      if (!objetivo && materializado.materializados > 0 && body?.tipoContable) {
        objetivo = await tx.medioCobroLocal.findFirst({
          where: { localId, tipoContable: String(body.tipoContable).toUpperCase() },
          select: { id: true },
        });
      }

      if (!objetivo) {
        const e = new Error("Ese medio de cobro no existe en este local.");
        e.noEncontrado = true;
        throw e;
      }

      const choque = await validarCambioDeMedio(tx, { localId, medioId: objetivo.id, cambios });
      if (!choque.valido) {
        const e = new Error(choque.error);
        e.esChoqueDeTipo = true;
        throw e;
      }

      return tx.medioCobroLocal.update({ where: { id: objetivo.id }, data: cambios });
    });

    return NextResponse.json({ ok: true, medioId: actualizado.id });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    if (err.esChoqueDeTipo) return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    console.error("Error editando medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar el medio de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}

/**
 * Borrar un medio.
 *
 * NO se comprueba si se usó en ventas, y no hace falta: `VentaPago` congela el
 * TIPO CONTABLE, no el id del medio configurado. Una venta vieja de DEBITO sigue
 * diciendo DEBITO aunque el botón que la produjo ya no exista. Es la misma razón
 * por la que el nombre visible no es la identidad.
 *
 * Lo que sí se impide es dejar al local sin ningún medio activo: un POS sin
 * botones no puede cobrar, y eso se descubriría en la caja.
 */
export async function DELETE(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const medioId = Number(id);

    await prisma.$transaction(async (tx) => {
      const medio = await tx.medioCobroLocal.findFirst({
        where: { id: medioId, localId },
        select: { id: true, activo: true },
      });
      if (!medio) {
        const e = new Error("Ese medio de cobro no existe en este local.");
        e.noEncontrado = true;
        throw e;
      }

      const activos = await tx.medioCobroLocal.count({ where: { localId, activo: true } });
      if (medio.activo && activos <= 1) {
        const e = new Error(
          "Es el único medio de cobro activo del local. Si se borra, el POS queda sin botones y " +
            "no se puede cobrar. Agregá otro antes de borrar éste."
        );
        e.dejariaSinMedios = true;
        throw e;
      }

      await tx.medioCobroLocal.delete({ where: { id: medio.id } });
    });

    return NextResponse.json({ ok: true, eliminado: true });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    if (err.dejariaSinMedios) return NextResponse.json({ ok: false, error: err.message }, { status: 409 });
    console.error("Error borrando medio de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo borrar el medio de cobro: ${err.message}` },
      { status: 500 }
    );
  }
}
