// app/api/transferencias/revisar-producto/route.js
//
// CERRAR EL CONTROL FÍSICO DE UN PRODUCTO.
//
// ── POR QUÉ ES UNA RUTA Y NO UN FLAG DE `guardar-recepcion` ───────────────
//
// Se evaluó reusar `guardar-recepcion` con un `revisar: true` por ítem. Son dos
// actos distintos y meterlos en un contrato los vuelve ilegibles:
//
//   · `guardar-recepcion` es un BORRADOR POR LOTES. Persiste cantidades y
//     motivos de N líneas y no dice nada sobre el control físico. Un producto
//     puede tener cantidad guardada y seguir sin revisar — eso es exactamente
//     "empecé a contarlo y no terminé", y tiene que poder existir.
//
//   · esto cierra el control de UN producto. Escribe autoría y hora del
//     servidor, y es lo que habilita confirmar la transferencia.
//
// Distinta cardinalidad, distinta semántica y distinto efecto sobre la
// confirmación. Con las dos en una ruta, "guardé pero no revisé" pasaría a ser
// un flag adentro de un lote, y el día que alguien lo omita el checklist se
// cerraría solo.
//
// Lo que SÍ comparten es todo lo que importa: el mismo mutex sobre la fila de
// `Transferencia`, la misma relectura después del lock, el mismo
// `validarDetalleRecepcion`. No hay una segunda validación al lado.
//
// ── LA AUTORÍA NO VIENE DEL CLIENTE ───────────────────────────────────────
//
// Ni el usuario ni la fecha. El usuario sale de la sesión y la fecha del reloj
// del servidor. Un checklist cuyo autor lo elige quien lo manda no es un
// registro de quién controló la mercadería.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import {
  mensajeRecepcion,
  statusRecepcion,
  validarDetalleRecepcion,
} from "@/lib/transferencias/recepcion";
import {
  ErrorRecepcion,
  estadoAdmiteRecepcion,
  puedeRecibir,
  reclamarOFallar,
} from "@/lib/transferencias/recepcionServidor";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.recibir");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // El autor sale de la sesión y de ningún otro lado.
    const usuarioId = Number(session.id || 0);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "USUARIO_SESION_INVALIDO",
          error: "Tu sesión no identifica un usuario válido. Volvé a iniciar sesión.",
        },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const transferenciaId = Number(body?.transferenciaId || 0);
    const detalleId = Number(body?.detalleId || 0);
    if (!transferenciaId || !detalleId) {
      return NextResponse.json(
        { ok: false, error: "transferenciaId y detalleId son obligatorios" },
        { status: 400 }
      );
    }
    // Permite deshacer una marca puesta por error mientras la recepción siga
    // abierta. Por defecto marca: es lo que hace el botón.
    const revisado = body?.revisado === false ? false : true;

    // Prechequeos baratos y NO autoritativos: contestan rápido y con un mensaje
    // bueno. El estado se vuelve a exigir adentro de la transacción, donde sí es
    // una garantía.
    const transferencia = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: { id: true, destinoId: true, estado: true },
    });
    if (!transferencia) {
      return NextResponse.json({ ok: false, error: "Transferencia no encontrada" }, { status: 404 });
    }

    const alcance = puedeRecibir(session, transferencia);
    if (!alcance.ok) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
    }

    const estado = estadoAdmiteRecepcion(transferencia.estado, { accion: "revisar productos" });
    if (!estado.ok) {
      return NextResponse.json({ ok: false, error: estado.error }, { status: estado.status });
    }

    const guardado = await prisma.$transaction(async (tx) => {
      // El mismo mutex que las otras escrituras de recepción, y como PRIMERA
      // escritura: si confirmar ya tomó la transferencia, esto no entra.
      await reclamarOFallar(tx, transferenciaId, "Recibiendo");

      // La línea se relee DESPUÉS del lock y acotada a esta transferencia: un id
      // de otra no aparece, así que no se puede revisar una línea ajena pasando
      // su número.
      const d = await tx.transferenciaDetalle.findFirst({
        where: { id: detalleId, transferenciaId },
        include: { producto: { include: { base: true } } },
      });
      if (!d) {
        throw new ErrorRecepcion(
          "DETALLE_INEXISTENTE",
          "Ese producto no pertenece a esta transferencia.",
          404
        );
      }

      // La MISMA validación que guardar y confirmar. La cantidad enviada, la
      // unidad y la procedencia salen de la BASE: si vinieran del request,
      // cualquiera podría marcar una línea del remito como agregada, o inflar lo
      // enviado para acreditarse stock que nunca salió.
      const plan = validarDetalleRecepcion({
        detalle: {
          cantidad: d.cantidad,
          unidadEnviada: d.unidadEnviada,
          motivoPrincipal: body?.motivoPrincipal,
          motivoDetalle: body?.motivoDetalle,
          agregadoEnRecepcion: d.agregadoEnRecepcion,
        },
        factorPack: Number(d.producto?.base?.factor_pack || 1),
        recibidoPropuesto: body?.recibido,
        sueltasPropuestas: body?.recibidoUnidadesSueltas,
      });

      if (!plan.ok) {
        const nombre = d.producto?.base?.nombre || d.producto?.nombre || null;
        throw new ErrorRecepcion(
          plan.error,
          mensajeRecepcion(plan.error, { nombre }),
          statusRecepcion(plan.error)
        );
      }

      const actualizado = await tx.transferenciaDetalle.update({
        where: { id: d.id },
        data: {
          recibido: plan.recibida,
          // Normalizado por el validador: 0 cuando no hay pack incompleto.
          recibidoUnidadesSueltas: plan.recibidaSueltas,
          motivoPrincipal: plan.hayDiferencia ? body?.motivoPrincipal || null : null,
          motivoDetalle:
            plan.hayDiferencia && body?.motivoPrincipal === "Otro"
              ? body?.motivoDetalle || null
              : null,
          revisadoEnRecepcion: revisado,
          // Autoría y hora del SERVIDOR. Desmarcar las limpia: un registro que
          // dice quién revisó algo que ya no está revisado no es un registro.
          revisadoEnRecepcionPorId: revisado ? usuarioId : null,
          revisadoEnRecepcionAt: revisado ? new Date() : null,
        },
        select: {
          id: true,
          recibido: true,
          recibidoUnidadesSueltas: true,
          motivoPrincipal: true,
          motivoDetalle: true,
          revisadoEnRecepcion: true,
          revisadoEnRecepcionAt: true,
        },
      });

      // Cuánto falta, para que la pantalla no tenga que recargar la
      // transferencia entera después de cada producto.
      const pendientes = await tx.transferenciaDetalle.count({
        where: { transferenciaId, agregadoEnRecepcion: false, revisadoEnRecepcion: false },
      });

      return { detalle: actualizado, pendientes };
    });

    return NextResponse.json({ ok: true, ...guardado });
  } catch (err) {
    // Abortos deliberados desde adentro de la transacción: nada quedó escrito.
    if (err.name === "ErrorRecepcion") {
      return NextResponse.json(
        { ok: false, codigo: err.code, error: err.message, ...(err.datos || {}) },
        { status: err.status || 409 }
      );
    }
    console.error("ERROR revisar producto de recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar la revisión del producto." },
      { status: 500 }
    );
  }
}
