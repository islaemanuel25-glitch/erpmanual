// app/api/finanzas/sueldos/route.js
//
// FINANZAS → SUELDOS. GET lee la pantalla de un período; POST paga un sueldo.
//
//   GET ?unidad=DIA|SEMANA|MES|OTRO&desplazamiento=0|-1|…  (o desde/hasta con OTRO)
//   POST { empleadoId, modalidadSueldo, monto, fecha, medio, turnoId?, nota?, idempotencyKey }
//
// ── LOS SUELDOS SON DEL LOCAL QUE LOS CONTRATA ────────────────────────────
//
// Empleados y sus pagos son de UN local (regla de Emanuel, 2026-10-15 y
// 2026-10-19). La pantalla mira el local que se OPERA —`vista.localId`, el
// mismo de Gastos— y nunca mezcla: no hay lista de todo el grupo. Un admin en
// vista global elige el local arriba, como para pagar.
//
// ── PAGAR ES CREAR UN GASTO, NO OTRA VÍA ──────────────────────────────────
//
// El POST es `crearGasto` con la categoría Sueldos y su pago inicial por el
// total, en una transacción, con la clave de idempotencia del alta: la misma
// puerta, la misma regla y el mismo reintento que un gasto y que "Pagar" del
// POS. Que el empleado sea activo y del local, y que la modalidad venga, lo
// decide `crearGasto`, no esta ruta.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { CATEGORIA_SUELDOS } from "@/lib/caja/tipoEgreso";
import { PERMISO_REGISTRAR_GASTOS } from "@/lib/finanzas/gastos";
import { ErrorGasto, alcanceDeGastos, crearGasto, gastoYaRegistrado } from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import {
  DESPLAZAMIENTO_MINIMO,
  descripcionFinanciera,
  leerPeriodoDelPedido,
  puedeAvanzar,
} from "@/lib/finanzas/periodoFinanciero";
import { leerSueldos } from "@/lib/finanzas/sueldosServer";
import { rangoDeTesoreria } from "@/lib/tesoreria/lecturaTesoreriaServer";

const ERROR_SIN_LOCAL_SUELDOS = "Elegí el local arriba: los sueldos son de cada local.";

/** El local que se opera, o la respuesta de error. */
async function localOperado(req, session) {
  const alcance = await alcanceDeGastos(req, session);
  if (alcance.error) {
    return {
      respuesta: NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      ),
    };
  }
  const localId = Number(alcance.vista.localId) || null;
  const local = localId ? alcance.locales.find((l) => l.localId === localId) : null;
  if (!local) {
    return { respuesta: NextResponse.json({ ok: false, error: ERROR_SIN_LOCAL_SUELDOS, needsContexto: true }, { status: 400 }) };
  }
  return { alcance, local: { id: localId, nombre: local.nombre } };
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_VER_FINANZAS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const operado = await localOperado(req, session);
    if (operado.respuesta) return operado.respuesta;
    const { alcance, local } = operado;

    const periodo = leerPeriodoDelPedido(new URL(req.url).searchParams);
    if (periodo.error) return NextResponse.json({ ok: false, error: periodo.error }, { status: 400 });
    const { esOtro, unidad, desplazamiento, rangoFijo } = periodo;

    // El mismo corte que Tesorería: Día, Semana operativa del local, Mes u Otro.
    const rango = await rangoDeTesoreria(prisma, { localId: local.id, unidad, desplazamiento, rangoFijo });
    const sueldos = await leerSueldos(prisma, { localId: local.id, rango: { desde: rango.desde, hasta: rango.hasta } });

    return NextResponse.json({
      ok: true,
      unidad,
      desplazamiento: esOtro ? null : desplazamiento,
      local,
      periodo: {
        rango: { desde: rango.desde, hasta: rango.hasta },
        descripcion: descripcionFinanciera({ unidad, desplazamiento, vigencias: rango.vigencias, rangoFijo }),
      },
      puedeAvanzar: esOtro ? false : puedeAvanzar(desplazamiento),
      // Hacia atrás sin mirar la primera venta: un sueldo puede ser anterior.
      puedeRetroceder: esOtro ? false : desplazamiento > DESPLAZAMIENTO_MINIMO,
      // Pagar y asignar piden además el permiso de Gastos. Las rutas lo vuelven
      // a chequear; esto es para no ofrecer un botón que se va a rechazar.
      puedePagar: alcance.puedeEscribir,
      ...sueldos,
    });
  } catch (e) {
    console.error("[finanzas/sueldos GET]", e);
    // El mensaje dice QUÉ pasó: "Error interno" deja a la pantalla muda.
    return NextResponse.json({ ok: false, error: `No se pudieron leer los sueldos: ${e.message}` }, { status: 500 });
  }
}

export async function POST(req) {
  // Lo que hace falta para contestar un P2002 desde el `catch`.
  let localLeido = null;
  let claveLeida = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const operado = await localOperado(req, session);
    if (operado.respuesta) return operado.respuesta;
    const { alcance, local } = operado;

    const body = await req.json().catch(() => ({}));
    localLeido = local.id;
    claveLeida = body?.idempotencyKey ?? null;

    const sueldos = await prisma.categoriaGasto.findUnique({ where: { nombre: CATEGORIA_SUELDOS }, select: { id: true } });
    if (!sueldos) return NextResponse.json({ ok: false, error: "No existe la categoría de gasto Sueldos." }, { status: 500 });

    const resultado = await prisma.$transaction(
      (tx) =>
        crearGasto(tx, {
          session,
          grupoId: alcance.grupoId,
          localId: local.id,
          localOperativoId: local.id,
          categoriaId: sueldos.id,
          empleadoId: body?.empleadoId,
          modalidadSueldo: body?.modalidadSueldo,
          total: body?.monto,
          fecha: body?.fecha,
          idempotencyKey: body?.idempotencyKey,
          // Un sueldo se paga entero en el momento: el pago inicial es el total.
          // Su clave la deriva `crearGasto` del gasto, como en el alta de Gastos.
          pagoInicial: {
            monto: body?.monto,
            medio: body?.medio,
            turnoId: body?.turnoId,
            fecha: body?.fecha,
            nota: body?.nota,
          },
        }),
      OPCIONES_TX
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    // Otro envío del mismo intento ganó la carrera: se devuelve lo que quedó.
    if (e?.code === "P2002" && localLeido && claveLeida) {
      const ganador = await gastoYaRegistrado(prisma, { localId: localLeido, idempotencyKey: claveLeida }).catch(() => null);
      if (ganador) return NextResponse.json({ ok: true, ...ganador });
    }
    if (e instanceof ErrorGasto) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/sueldos POST]", e);
    return NextResponse.json({ ok: false, error: `No se pudo registrar el sueldo: ${e.message}` }, { status: 500 });
  }
}
