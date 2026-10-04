// app/api/finanzas/tesoreria/verificaciones/route.js
//
// POST /api/finanzas/tesoreria/verificaciones — VERIFICAR EFECTIVO ENTREGADO.
//
//   { cajaMovimientoIds: number[], importeVerificado: number|string,
//     idempotencyKey: string, observacion?: string }
//
// El responsable dice QUÉ entregas contó y CUÁNTO contó. Todo lo demás lo
// decide el servidor: el local (el de las entregas), el declarado (la suma de
// los movimientos tomados), la diferencia, la clase y las fotos. Un cuerpo que
// traiga alguno de esos campos se rechaza.
//
// "Correcto" no es otra acción: es contar lo mismo que se declaró, y la
// respuesta lo dice con `correcta: true` y diferencia 0.
//
// ── QUIÉN Y DE QUÉ LOCAL ─────────────────────────────────────────────────
//
// Pide `tesoreria.verificar_efectivo`; `tesoreria.ver` solo no alcanza. El
// alcance es el de Finanzas, con las mismas piezas (`alcanceDePagos` →
// `ubicacionesVisibles`): un local verifica solo lo suyo; el depósito, o un
// admin en vista global, cualquier local de su grupo. El local NO viaja en el
// cuerpo: sale de las entregas.
//
// ── LA RESPUESTA ─────────────────────────────────────────────────────────
//
// 201 con la verificación creada; 200 con `repetida: true` si la misma clave ya
// se usó en ese local con el MISMO contenido; 409 IDEMPOTENCIA_CONFLICTO si se
// usó con otro. Los rechazos llevan `codigo`, `error` y, cuando ayuda, `detalle`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { alcanceDePagos } from "@/lib/finanzas/pagosProveedoresServer";
import { PERMISO_VERIFICAR_EFECTIVO } from "@/lib/tesoreria/permisos";
import { leerPedidoDeVerificacion } from "@/lib/tesoreria/verificacionEfectivo";
import {
  CODIGO_VERIFICACION,
  RechazoVerificacion,
  localDeLasEntregas,
  resolverClave,
  verificarEfectivo,
} from "@/lib/tesoreria/verificacionEfectivoServer";

const rechazo = (e) =>
  NextResponse.json({ ok: false, codigo: e.codigo, error: e.message, detalle: e.detalle ?? null }, { status: e.status });

export async function POST(req) {
  let localId = null;
  let pedido = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // Admin pasa por el comodín "*", como en todo el ERP.
    const perm = checkPerm(session, PERMISO_VERIFICAR_EFECTIVO);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const leido = leerPedidoDeVerificacion(await req.json().catch(() => null));
    if (leido.error) {
      return NextResponse.json(
        { ok: false, codigo: CODIGO_VERIFICACION.PEDIDO_INVALIDO, error: leido.error, campo: leido.campo ?? null },
        { status: 400 }
      );
    }
    pedido = leido.pedido;

    const alcance = await alcanceDePagos(req, session, { permisoEscribir: PERMISO_VERIFICAR_EFECTIVO });
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    localId = await localDeLasEntregas(prisma, pedido.cajaMovimientoIds, { visibles: alcance.visibles });

    const resultado = await prisma.$transaction(
      (tx) => verificarEfectivo(tx, { localId, pedido, usuarioId: session.id }),
      OPCIONES_TX
    );
    return NextResponse.json({ ok: true, ...resultado }, { status: resultado.repetida ? 200 : 201 });
  } catch (e) {
    if (e instanceof RechazoVerificacion) return rechazo(e);
    // La base fue la última defensa: otro envío ganó la carrera. Si fue el
    // mismo intento (misma clave), se devuelve lo que quedó; si no, la entrega
    // ya está tomada.
    if (e?.code === "P2002" && localId && pedido) {
      try {
        const previa = await resolverClave(prisma, { localId, pedido });
        if (previa) return NextResponse.json({ ok: true, ...previa }, { status: 200 });
      } catch (conflicto) {
        if (conflicto instanceof RechazoVerificacion) return rechazo(conflicto);
      }
      return rechazo(
        new RechazoVerificacion(
          CODIGO_VERIFICACION.ENTREGA_YA_VERIFICADA,
          "Alguna de las entregas ya está en una verificación vigente. Para volver a verificarla, primero hay que anular esa verificación.",
          409
        )
      );
    }
    console.error("[finanzas/tesoreria/verificaciones POST]", e);
    // El mensaje dice QUÉ pasó: "Error interno" deja a la pantalla muda.
    return NextResponse.json({ ok: false, error: `No se pudo registrar la verificación: ${e.message}` }, { status: 500 });
  }
}
