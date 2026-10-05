// app/api/config/turnos-operativos/route.js
//
// EL CATÁLOGO DE TURNOS OPERATIVOS DE UN LOCAL: los que configure el local,
// cada uno con su ventana de reconocimiento opcional.
//
//   GET  — el catálogo del local del alcance. Lo lee la configuración y lo lee
//          la apertura de caja: con `?activos=1` devuelve solo los turnos que
//          se pueden abrir a esta hora según el ciclo del local, con la fecha
//          operativa de cada uno, el que propone la ventana y, si el ciclo no
//          se puede resolver, el `bloqueo` con lo que falta configurar. Un
//          local que nunca tuvo turnos devuelve `legado: true`: abre sin turno.
//   POST — da de alta un turno, con o sin ventana. `config_local.pos`.
//   PUT  — reordena: `{ orden: [id, id, …] }`. `config_local.pos`.
//
// El local sale SIEMPRE del alcance, nunca del cuerpo, igual que el resto de la
// configuración del POS: un no-admin solo toca el de su sesión.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { CODIGO_TURNO_OPERATIVO, validarNombreTurnoOperativo, validarRangoReconocimiento } from "@/lib/caja/turnoOperativo";
import {
  SELECT_TURNO_OPERATIVO,
  reconocimientoDeApertura,
  turnosOperativosDelLocal,
} from "@/lib/caja/turnoOperativoServer";

// La lectura la hace también la caja para abrir: va el par, como la de las
// reglas del POS.
const PERMISO_LEER = ["config_local.pos", "pos.usar"];
const PERMISO_EDITAR = "config_local.pos";

async function sesionQueEdita(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: "No autenticado", status: 401 };
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) return { error: scope.error, status: scope.status, needsContexto: scope.needsContexto };
  if (!session.esAdmin && !checkPerm(session, PERMISO_EDITAR).ok) {
    return { error: `Sin permiso: ${PERMISO_EDITAR}`, status: 403 };
  }
  return { session, localId: scope.localId };
}

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_LEER);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto }, { status: scope.status });
    }
    // Para abrir caja: la propuesta la hace el servidor, con su hora, y no la
    // pantalla con la del celular. La apertura vuelve a validar y a calcular.
    if (new URL(req.url).searchParams.get("activos") === "1") {
      const { legado, turnos, reconocimiento, bloqueo } = await reconocimientoDeApertura(prisma, { localId: scope.localId });
      return NextResponse.json({ ok: true, localId: scope.localId, legado, turnos, reconocimiento, bloqueo });
    }
    const turnos = await turnosOperativosDelLocal(prisma, scope.localId);
    return NextResponse.json({ ok: true, localId: scope.localId, turnos });
  } catch (error) {
    console.error("Error leyendo turnos operativos:", error);
    return NextResponse.json({ ok: false, error: "No se pudieron leer los turnos operativos del local." }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const ctx = await sesionQueEdita(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error, needsContexto: ctx.needsContexto }, { status: ctx.status });
    }
    const body = await req.json().catch(() => ({}));
    const nombre = validarNombreTurnoOperativo(body?.nombre);
    if (!nombre.valido) {
      return NextResponse.json({ ok: false, error: nombre.error, codigo: CODIGO_TURNO_OPERATIVO.NOMBRE_INVALIDO }, { status: 400 });
    }
    // Solo integridad del rango: un solape con otro turno se acepta.
    const rango = validarRangoReconocimiento(body?.horaInicioReconocimiento, body?.horaFinReconocimiento);
    if (!rango.valido) {
      return NextResponse.json({ ok: false, error: rango.error, codigo: CODIGO_TURNO_OPERATIVO.RANGO_INVALIDO }, { status: 400 });
    }
    // Al final de la lista: el orden se cambia después, a propósito.
    const ultimo = await prisma.turnoOperativo.aggregate({ where: { localId: ctx.localId }, _max: { orden: true } });
    const turno = await prisma.turnoOperativo.create({
      data: { localId: ctx.localId, nombre: nombre.nombre, orden: (ultimo._max.orden ?? -1) + 1, ...rango.rango },
      select: SELECT_TURNO_OPERATIVO,
    });
    return NextResponse.json({ ok: true, turno });
  } catch (error) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya hay un turno con ese nombre en este local.", codigo: CODIGO_TURNO_OPERATIVO.NOMBRE_REPETIDO },
        { status: 409 }
      );
    }
    console.error("Error creando turno operativo:", error);
    return NextResponse.json({ ok: false, error: "No se pudo crear el turno operativo." }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const ctx = await sesionQueEdita(req);
    if (ctx.error) {
      return NextResponse.json({ ok: false, error: ctx.error, needsContexto: ctx.needsContexto }, { status: ctx.status });
    }
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.orden) ? body.orden.map(Number) : null;
    if (!ids || !ids.length || ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ ok: false, error: "El orden es la lista de ids de los turnos, sin repetir." }, { status: 400 });
    }
    const delLocal = await prisma.turnoOperativo.findMany({ where: { localId: ctx.localId }, select: { id: true } });
    const propios = new Set(delLocal.map((t) => t.id));
    // Todos y solo los del local: un id de otro local no se reordena ni se
    // revela si existe.
    if (ids.length !== propios.size || ids.some((id) => !propios.has(id))) {
      return NextResponse.json({ ok: false, error: "El orden tiene que nombrar todos los turnos de este local, y solo esos." }, { status: 400 });
    }
    await prisma.$transaction(ids.map((id, i) => prisma.turnoOperativo.update({ where: { id }, data: { orden: i } })));
    const turnos = await turnosOperativosDelLocal(prisma, ctx.localId);
    return NextResponse.json({ ok: true, turnos });
  } catch (error) {
    console.error("Error ordenando turnos operativos:", error);
    return NextResponse.json({ ok: false, error: "No se pudo guardar el orden de los turnos." }, { status: 500 });
  }
}
