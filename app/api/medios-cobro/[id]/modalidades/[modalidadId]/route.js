import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { normalizarEntradaModalidad } from "@/lib/pos-ventas/modalidadesDeMedio";
import { resolverMedioDeModalidad, resolverModalidad } from "@/lib/pos-ventas/mediosCobroServidor";

// EDITAR, ACTIVAR/DESACTIVAR O BORRAR UNA MODALIDAD.
//
// ── EL AISLAMIENTO SE RESUELVE POR COMPOSICIÓN, NO POR REPETICIÓN ─────────
//
// Los dos verbos hacen lo mismo y en el mismo orden: resolver el PADRE contra el
// local del alcance, y después buscar la modalidad DENTRO de ese padre. De ahí
// salen las tres defensas de una sola vez:
//
//   · un medio de otro local no se encuentra           → 404
//   · una modalidad de otro padre no se encuentra      → 404
//   · una modalidad inexistente no se encuentra        → 404
//
// Los tres contestan igual a propósito: desde afuera no se puede distinguir "no
// es tuya" de "no existe", así que la URL no sirve para averiguar qué configuró
// otra boca.
//
// ── DESACTIVAR NO ES BORRAR, Y LAS DOS COSAS SON SEGURAS ─────────────────
//
// `activo: false` la saca del POS y le conserva la configuración y el historial.
// El DELETE la borra de verdad, y tampoco pierde historia: las FK de `VentaPago`
// y `Venta` son SET NULL, así que las ventas viejas quedan con la referencia en
// null y el NOMBRE congelado sigue explicándolas. Está medido en
// `scripts/pruebas-db/mediosCobro.mjs`, sección 13.

/** Los dos verbos empiezan igual: padre del local, y modalidad de ese padre. */
async function ubicar(tx, { localId, clave, modalidadId }) {
  const medio = await resolverMedioDeModalidad(tx, { localId, clave });
  if (!medio) return null;
  const modalidad = await resolverModalidad(tx, { medioId: medio.id, modalidadId });
  if (!modalidad) return null;
  return { medio, modalidad };
}

export async function PATCH(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id, modalidadId } = await params;
    const body = await req.json();
    const datos = normalizarEntradaModalidad(body, { parcial: true });
    if (!datos.valido) return NextResponse.json({ ok: false, error: datos.error }, { status: 400 });
    const { valido, ...cambios } = datos;

    const actualizada = await prisma.$transaction(async (tx) => {
      const ubicada = await ubicar(tx, { localId, clave: id, modalidadId });
      if (!ubicada) {
        const e = new Error("Esa modalidad no existe en este medio de cobro.");
        e.noEncontrado = true;
        throw e;
      }
      return tx.medioCobroModalidadLocal.update({
        where: { id: ubicada.modalidad.id },
        data: cambios,
      });
    });

    return NextResponse.json({
      ok: true,
      modalidadId: actualizada.id,
      medioId: actualizada.medioCobroLocalId,
    });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    console.error("Error editando modalidad de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar la modalidad: ${err.message}` },
      { status: 500 }
    );
  }
}

export async function DELETE(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, "config_local.medios_cobro");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id, modalidadId } = await params;

    await prisma.$transaction(async (tx) => {
      const ubicada = await ubicar(tx, { localId, clave: id, modalidadId });
      if (!ubicada) {
        const e = new Error("Esa modalidad no existe en este medio de cobro.");
        e.noEncontrado = true;
        throw e;
      }
      await tx.medioCobroModalidadLocal.delete({ where: { id: ubicada.modalidad.id } });
    });

    return NextResponse.json({ ok: true, eliminada: true });
  } catch (err) {
    if (err.noEncontrado) return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    console.error("Error borrando modalidad de cobro:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo borrar la modalidad: ${err.message}` },
      { status: 500 }
    );
  }
}
