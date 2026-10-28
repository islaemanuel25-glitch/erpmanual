// app/api/pos-transferencias/cancelar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { requireOperadorSegunConfig } from "@/lib/operador";
import { ESTADO_PEDIDO, sinCancelados } from "@/lib/pedidos/estados";
import { bloquearParDelPedido, bloquearFilaDelPedido, depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";
import { esDepositoDelPedido } from "@/lib/pedidos/depositosDelPedido";
import { checkPerm } from "@/lib/authorize";

/** El permiso con que el depósito cancela: el mismo que pide `enviar` para despachar. */
const PERMISO_DEL_DEPOSITO = "pos_transferencias.enviar";

/** Ya salió, o está saliendo: se maneja desde la transferencia, no cancelando el pedido. */
const YA_SALIO = [ESTADO_PEDIDO.ENVIANDO, ESTADO_PEDIDO.ENVIADO];
const MENSAJE_YA_SE_ENVIO = "El pedido ya se envió. Se maneja desde la transferencia.";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Local autorizado = el de la sesión (identidad del JWT, no del body). El
    // scope de propiedad del POS (destino + grupo) se valida más abajo. Para
    // DUEÑO_LOCAL el bypass de operario solo aplica en su propio local.
    const gateOp = await requireOperadorSegunConfig(req, session, { localId: session.localId });
    if (!gateOp.ok) {
      return NextResponse.json(
        { ok: false, error: gateOp.error, needsOperador: true },
        { status: gateOp.status }
      );
    }

    // ============================
    // Permiso: admin (*), pedidos.editar (el local) o pos_transferencias.enviar
    // (el depósito, con el mismo permiso que pide despachar)
    // ============================
    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    // Admin = "*" SIN local asignado (mismo criterio que solicitados/enviar/opciones).
    // Un usuario "*" CON local no debe saltarse la validación de propiedad (destino+grupo).
    const esAdmin = permisos.includes("*") && !session.localId;
    const puedeComoDeposito = checkPerm(session, PERMISO_DEL_DEPOSITO).ok;

    if (!esAdmin && !permisos.includes("pedidos.editar") && !puedeComoDeposito) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para cancelar pedidos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const posId = Number(body.posId || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: "posId requerido" },
        { status: 400 }
      );
    }

    // ============================
    // Validar POS
    // ============================
    // Un pedido ya cancelado da 404, como cuando cancelar lo borraba.
    const pos = await prisma.posTransferencia.findUnique({
      where: sinCancelados({ id: posId }),
      select: { id: true, estado: true, origenId: true, destinoId: true },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    // ============================
    // EL DEPÓSITO ORIGEN DE ESTE PEDIDO (2026-10-23)
    // ============================
    // Regla de Emanuel: el depósito puede cancelar un pedido de un local
    // mientras lo prepara, empezado o no. Antes le daba 403 —solo cancelaba el
    // admin sin local— y un pedido empezado quedaba sin forma de sacarlo.
    //
    // Es el depósito de ESTE pedido: su local es el origen y es un depósito, y
    // tiene el mismo permiso que `enviar` pide para despachar. Uno de otro
    // depósito no es el origen y cae en el control del local de abajo (403).
    //
    // Desde el 2026-10-28 "el depósito de este pedido" es cualquiera de los de
    // la empresa del local: los dos arman el mismo pedido, y cualquiera lo
    // cancela (`lib/pedidos/depositosDelPedido.js`). Uno de otra empresa sigue
    // cayendo en el 403.
    const localDeSesion = Number(session.localId) || null;
    let esDelDeposito = false;
    if (!esAdmin && localDeSesion && puedeComoDeposito && (await esDepositoDelPedido(prisma, localDeSesion, pos))) {
      const local = await prisma.local.findUnique({ where: { id: localDeSesion }, select: { es_deposito: true } });
      esDelDeposito = !!local?.es_deposito;
    }

    // ============================
    // Ownership: usuario no-admin debe pertenecer al local destino y al mismo grupo
    // ============================
    if (!esAdmin && !esDelDeposito) {
      const localId = Number(session.localId);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Usuario sin local asignado" },
          { status: 403 }
        );
      }

      // El local cancela con `pedidos.editar`, como siempre: el permiso del
      // depósito no le alcanza para cancelar desde el local.
      if (!permisos.includes("*") && !permisos.includes("pedidos.editar")) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso para cancelar pedidos" },
          { status: 403 }
        );
      }

      if (pos.destinoId !== localId) {
        return NextResponse.json(
          { ok: false, error: "No tenés acceso a este pedido" },
          { status: 403 }
        );
      }

      // Verificar que el POS pertenezca al mismo grupo del usuario
      const grupoUsuario = await getGrupoIdDeLocal(localId);
      const grupoOrigen = await getGrupoIdDeLocal(pos.origenId);

      if (!grupoUsuario || grupoUsuario !== grupoOrigen) {
        return NextResponse.json(
          { ok: false, error: "No tenés acceso a este pedido" },
          { status: 403 }
        );
      }
    }

    // ============================
    // Estado: solo se puede cancelar "Solicitado"
    // ============================
    if (YA_SALIO.includes(pos.estado)) {
      return NextResponse.json({ ok: false, error: MENSAJE_YA_SE_ENVIO }, { status: 409 });
    }
    if (pos.estado !== ESTADO_PEDIDO.SOLICITADO) {
      return NextResponse.json(
        {
          ok: false,
          error: `No se puede cancelar un pedido en estado "${pos.estado}". Solo se pueden cancelar pedidos solicitados.`,
        },
        { status: 409 }
      );
    }

    // ============================
    // Marcar como cancelado (Tanda 9A)
    // ============================
    // Antes se borraban el pedido y sus líneas. Ahora se MARCA y las líneas
    // quedan: el rastro es lo que el dueño pidió. Las lecturas lo dejan afuera
    // con `sinCancelados`, así que para el resto del ERP sigue sin existir.
    //
    // La condición `estado: Solicitado` va en el mismo update: si el depósito
    // empezó a enviarlo entre la lectura de arriba y acá, el estado ya es
    // "Enviando" y no se marca nada.
    //
    // ── EL LOCAL NO CANCELA LO QUE EL DEPÓSITO YA EMPEZÓ ──────────────────
    // Regla de Emanuel (2026-10-22): desde que el depósito lo empieza
    // (`depositoEmpezo`, el mismo criterio que traba `set-cantidad`), el
    // local ya no lo cancela; se perdería lo preparado. La pregunta va
    // adentro del MISMO bloqueo del par y la fila que toman `set-cantidad` y
    // las rutas del depósito: si no, el local podía cancelar en el mismo
    // instante en que el depósito empezaba. El admin sin local cancela como
    // antes, también empezado: es el único que hoy cancela desde el lado del
    // depósito —un usuario del depósito no pasa el control de propiedad de
    // arriba—.
    //
    // ── Y EL DEPÓSITO SÍ (2026-10-23) ─────────────────────────────────────
    // El depósito de este pedido cancela empezado o no: lo preparado es suyo.
    // Lo preparado NO movió stock —ni `detalle/editar`, ni `detalle/agregar`, ni
    // `agregarItem` escriben `StockLocal`; el stock se mueve recién en
    // `enviar`, al crear la transferencia—, así que no hay nada que revertir.
    //
    // Con el MISMO bloqueo del par y la fila que `enviar`: o el envío pasó
    // antes y el pedido ya no está Solicitado (409, "ya se envió"), o la
    // cancelación pasó antes y el envío encuentra el pedido cancelado. Las dos
    // cosas juntas no pueden quedar (sección 15 de
    // `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, 20 vueltas).
    const marcados = await prisma.$transaction(async (tx) => {
      await bloquearParDelPedido(tx, pos.origenId, pos.destinoId);
      const fila = await bloquearFilaDelPedido(tx, posId);
      if (YA_SALIO.includes(fila?.estado)) return "YA_SALIO";
      if (!esAdmin && !esDelDeposito && fila?.estado === ESTADO_PEDIDO.SOLICITADO && (await depositoEmpezo(tx, fila))) {
        return "EMPEZADO";
      }
      const r = await tx.posTransferencia.updateMany({
        where: { id: posId, estado: ESTADO_PEDIDO.SOLICITADO },
        data: {
          estado: ESTADO_PEDIDO.CANCELADO,
          canceladoAt: new Date(),
          canceladoPorUserId: session.id,
        },
      });
      return r.count;
    });

    if (marcados === "YA_SALIO") {
      return NextResponse.json({ ok: false, error: MENSAJE_YA_SE_ENVIO }, { status: 409 });
    }

    if (marcados === "EMPEZADO") {
      return NextResponse.json(
        { ok: false, error: "El depósito ya está preparando tu pedido. Ya no se puede cancelar desde el local." },
        { status: 409 }
      );
    }

    if (marcados === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "El pedido cambió de estado mientras se cancelaba. Actualizá y volvé a intentar.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      item: null,
      error: null,
    });

  } catch (err) {
    console.error("Error cancelar POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al cancelar POS" },
      { status: 500 }
    );
  }
}
