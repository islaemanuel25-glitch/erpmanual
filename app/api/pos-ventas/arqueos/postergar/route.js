// POST /api/pos-ventas/arqueos/postergar
//
// Posterga una alerta de arqueo YA VENCIDA. No cancela la obligación: corre el
// vencimiento unos minutos y deja registrado quién lo pidió y por qué.
//
// Pasada la tolerancia del local, la postergación deja de estar en manos del
// cajero y exige autorización de alguien con `turnos.ver_todos` —el permiso que
// hoy distingue a encargado/dueño del cajero raso en el módulo de caja—.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import {
  contextoArqueo,
  configArqueoDeLocal,
  ultimoArqueoDeTurno,
  postergacionesVigentes,
} from "@/lib/caja/arqueoServer";
import { estadoArqueo, vencimientoPostergacion } from "@/lib/caja/arqueo";

/** Permiso que habilita autorizar una postergación fuera de tolerancia. */
export const PERMISO_AUTORIZA_POSTERGACION = "turnos.ver_todos";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { turnoId, motivo } = body;

    const ctx = await contextoArqueo(req, { turnoId, exigirAbierto: true });
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error, needsContexto: ctx.needsContexto },
        { status: ctx.status }
      );
    }
    const { session, localId, turno } = ctx;

    if (!turno) {
      return NextResponse.json(
        { ok: false, error: "No hay una caja abierta" },
        { status: 409 }
      );
    }

    // Misma barrera que en registrar: la configuración manda y se relee acá.
    // Postergar una alerta que no existe no tiene sentido, y dejarlo pasar
    // ensuciaría el historial de un local que nunca activó la función.
    const config = await configArqueoDeLocal(localId);
    if (!config.arqueoCajaActivo) {
      return NextResponse.json(
        {
          ok: false,
          error: "Los arqueos parciales están desactivados en este local",
          funcionInactiva: true,
        },
        { status: 409 }
      );
    }

    const ahora = new Date();

    const ultimo = await ultimoArqueoDeTurno(turno.id);
    const previas = await postergacionesVigentes(turno.id, ultimo?.fechaHora ?? null);

    const estado = estadoArqueo({
      ahora,
      turno,
      ultimoArqueoEn: ultimo?.fechaHora ?? null,
      postergadoHasta: previas[0]?.venceEn ?? null,
      cantidadPostergaciones: previas.length,
      config,
    });

    if (!estado.activo) {
      return NextResponse.json(
        { ok: false, error: "El arqueo no está activo en este local" },
        { status: 409 }
      );
    }
    if (!estado.vencido) {
      return NextResponse.json(
        { ok: false, error: "La alerta todavía no venció" },
        { status: 409 }
      );
    }

    // Fuera de tolerancia: hace falta que alguien lo autorice. El autorizador es
    // el propio usuario si tiene el permiso; si no, se rechaza y la UI pide que
    // un encargado inicie sesión.
    let autorizadoPorId = null;
    if (estado.requiereAutorizacion) {
      const puede = checkPerm(session, PERMISO_AUTORIZA_POSTERGACION).ok;
      if (!puede) {
        return NextResponse.json(
          {
            ok: false,
            error: "La demora superó la tolerancia: se necesita autorización de un encargado",
            requiereAutorizacion: true,
            minutosDemora: estado.minutosDemora,
          },
          { status: 403 }
        );
      }
      autorizadoPorId = session.id;
    }

    const venceEn = vencimientoPostergacion({ ahora, config });

    const fila = await prisma.arqueoPostergacion.create({
      data: {
        turnoId: turno.id,
        localId: turno.localId,
        alertaProgramadaPara: estado.alertaProgramadaPara ?? estado.proximaAlerta ?? ahora,
        venceEn,
        minutosDemora: estado.minutosDemora ?? 0,
        postergadoPorId: session.id,
        motivo: motivo ? String(motivo).slice(0, 300) : null,
        autorizadoPorId,
      },
      select: { id: true, venceEn: true, minutosDemora: true, creadoEn: true },
    });

    return NextResponse.json({
      ok: true,
      postergacion: fila,
      cantidadPostergaciones: previas.length + 1,
      requirioAutorizacion: !!autorizadoPorId,
    });
  } catch (error) {
    console.error("Error postergando arqueo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
