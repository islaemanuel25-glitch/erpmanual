// app/api/pos-ventas/turnos/[id]/turno-operativo/route.js
//
// CORREGIR EL TURNO OPERATIVO DE UNA CAJA ABIERTA, desde el POS.
//
//   GET  — el turno de la caja y las opciones de corrección: las que el ciclo
//          del local ofrecía en la APERTURA de esa caja, con la fecha
//          operativa de cada una. Sin opciones si la caja no se puede corregir.
//   POST — `{ turnoOperativoId }`: reclasifica la caja ENTERA en ese turno.
//          La fecha operativa la calcula el servidor; una que mande el cliente
//          se ignora.
//
// `pos.usar`, sobre la caja PROPIA (DEC-0012): los mismos que la abren y la
// operan. Solo con la caja abierta, de un turno a otro —una caja sin turno no
// recibe uno— y sin efectivo de la caja en una verificación vigente. La regla
// vive en `corregirTurnoOperativoDeCaja` (lib/caja/turnoOperativoServer.js) y
// la base sostiene lo estructural.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { ERROR_CAJA_AJENA, puedeActuarSobreCaja } from "@/lib/caja/cierreRelevo";
import { identidadParaOperar } from "@/lib/caja/identidadCajaServer";
import { OPCIONES_TX, bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { fechaOperativaISO } from "@/lib/caja/turnoOperativo";
import {
  SELECT_CAJA_A_CORREGIR,
  corregirTurnoOperativoDeCaja,
  opcionesDeCorreccion,
  rechazoDeCajaACorregir,
} from "@/lib/caja/turnoOperativoServer";

/** Sesión, local y operador; o la respuesta de rechazo. */
async function contexto(req) {
  const perm = requirePerm(req, "pos.usar");
  if (!perm.ok) return { respuesta: NextResponse.json({ ok: false, error: perm.error }, { status: perm.status }) };
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) return { respuesta: NextResponse.json({ ok: false, error: scope.error }, { status: scope.status }) };
  const id = await identidadParaOperar(req, scope.session, { localId: scope.localId });
  if (!id.ok) {
    return { respuesta: NextResponse.json({ ok: false, error: id.error, needsOperador: true }, { status: id.status }) };
  }
  return { localId: scope.localId, identidad: id.identidad };
}

/** La caja de este local y de quien opera, o la respuesta de rechazo. */
function rechazoDeAcceso(caja, localId, identidad) {
  if (!caja || caja.localId !== localId) {
    return NextResponse.json({ ok: false, error: "Caja no encontrada en este local." }, { status: 404 });
  }
  if (!puedeActuarSobreCaja(caja, identidad)) {
    return NextResponse.json({ ok: false, error: ERROR_CAJA_AJENA, cajaAjena: true }, { status: 403 });
  }
  return null;
}

const idDeCaja = async (params) => {
  const n = Number((await params)?.id);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Lo que la pantalla necesita para dibujar la clasificación de la caja. */
const clasificacion = (caja, turno) => ({
  id: caja.id,
  turnoOperativo: turno ? { id: turno.id, nombre: turno.nombre } : null,
  fechaOperativa: fechaOperativaISO(caja.fechaOperativa),
});

export async function GET(req, { params }) {
  try {
    const ctx = await contexto(req);
    if (ctx.respuesta) return ctx.respuesta;
    const id = await idDeCaja(params);
    const caja = id
      ? await prisma.turno.findUnique({
          where: { id },
          select: { ...SELECT_CAJA_A_CORREGIR, turnoOperativo: { select: { id: true, nombre: true } } },
        })
      : null;
    const acceso = rechazoDeAcceso(caja, ctx.localId, ctx.identidad);
    if (acceso) return acceso;

    const rechazo = rechazoDeCajaACorregir(caja);
    return NextResponse.json({
      ok: true,
      caja: clasificacion(caja, caja.turnoOperativo),
      corregible: !rechazo,
      motivo: rechazo ? { codigo: rechazo.codigo, error: rechazo.error } : null,
      opciones: await opcionesDeCorreccion(prisma, caja),
    });
  } catch (error) {
    console.error("Error leyendo el turno operativo de la caja:", error);
    return NextResponse.json({ ok: false, error: "No se pudo leer el turno operativo de la caja." }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const ctx = await contexto(req);
    if (ctx.respuesta) return ctx.respuesta;
    const id = await idDeCaja(params);
    if (!id) return NextResponse.json({ ok: false, error: "Caja no encontrada en este local." }, { status: 404 });
    const body = await req.json().catch(() => ({}));

    const resultado = await prisma.$transaction(async (tx) => {
      // La fila de la caja primero: serializa con quien la opera, la cierra o
      // verifica su efectivo.
      await bloquearTurno(tx, id);
      const caja = await tx.turno.findUnique({ where: { id }, select: SELECT_CAJA_A_CORREGIR });
      const acceso = rechazoDeAcceso(caja, ctx.localId, ctx.identidad);
      if (acceso) return { respuesta: acceso };
      const r = await corregirTurnoOperativoDeCaja(tx, caja, body);
      return r.ok ? { ...r, caja: { ...caja, ...r.datos } } : r;
    }, OPCIONES_TX);

    if (resultado.respuesta) return resultado.respuesta;
    if (!resultado.ok) {
      return NextResponse.json(
        { ok: false, error: resultado.error, codigo: resultado.codigo },
        { status: resultado.status }
      );
    }
    return NextResponse.json({ ok: true, cambio: resultado.cambio, caja: clasificacion(resultado.caja, resultado.turno) });
  } catch (error) {
    console.error("Error corrigiendo el turno operativo de la caja:", error);
    return NextResponse.json({ ok: false, error: "No se pudo corregir el turno operativo de la caja." }, { status: 500 });
  }
}
