// app/api/pedidos/pdf/[id]/route.js
//
// EL PDF DE UN PEDIDO DEL LOCAL AL DEPÓSITO (2026-11-02). Solo lectura.
//
// ── QUIÉN LO PUEDE BAJAR: LOS MISMOS QUE PUEDEN VER EL PEDIDO ─────────────
//
// Lo piden dos pantallas y cada una ya tiene su regla; acá no se inventa una
// tercera, se pregunta por las dos:
//
//   · el DEPÓSITO, con la de `/api/pos-transferencias/detalle` —la que lee la
//     pantalla de preparar—: `pos_transferencias.ver`, el pedido sin cancelar,
//     y ser admin, el local que pidió o uno de los depósitos que lo arman
//     (`esDepositoDelPedido`);
//   · el LOCAL, con la de `/api/pedidos/historial/[id]` —la que lee "Ver
//     pedido" y el detalle de un pedido anterior—: `alcanceDelHistorial`, los
//     pedidos de ese local al depósito de su grupo, en `ESTADOS_DEL_HISTORIAL`.
//
// Uno que no pasa ninguna de las dos contesta 404, como esas rutas: decir
// "existe pero no es tuyo" ya es contar algo.
//
// ── SIN PRECIOS ───────────────────────────────────────────────────────────
//
// El producto se trae entero (el include es el de las otras lecturas del
// pedido), pero la línea del papel es una lista cerrada de campos
// (`lineaDelPdf`) sin costo ni precio.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { sinCancelados } from "@/lib/pedidos/estados";
import { esDepositoDelPedido } from "@/lib/pedidos/depositosDelPedido";
import { alcanceDelHistorial, pedidosDelHistorial, ESTADOS_DEL_HISTORIAL } from "@/lib/pedidos/alcanceDelHistorial";
import { BASE_CON_CATEGORIA } from "@/lib/pedidos/itemDelPedido";
import { depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";
import { estadoParaElLocal } from "@/lib/pedidos/estadoParaElLocal";
import { lineaDelPdf, datosDelPdfDelPedido, nombreDelArchivo } from "@/lib/pedidos/pdfDelPedido";
import { armarPedidoAlDepositoPdf } from "@/lib/pdf/pedidoAlDepositoPdf";

const NO_ENCONTRADO = { ok: false, error: "No se encontró ese pedido." };

/** El id del pedido si esta sesión lo puede ver, o la respuesta de error. */
async function pedidoQuePuedeVer(req, posId) {
  const session = getUsuarioSession(req);
  if (!session) return { respuesta: NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 }) };

  // El depósito: la regla de `/api/pos-transferencias/detalle`.
  const comoDeposito = checkPerm(session, "pos_transferencias.ver").ok;
  if (comoDeposito) {
    const pos = await prisma.posTransferencia.findUnique({
      where: sinCancelados({ id: posId }),
      select: { id: true, origenId: true, destinoId: true },
    });
    if (
      pos &&
      (session.esAdmin ||
        Number(session.localId) === pos.destinoId ||
        (await esDepositoDelPedido(prisma, session.localId, pos)))
    ) {
      return { id: pos.id };
    }
  }

  // El local: la regla de `/api/pedidos/historial/[id]`.
  const alcance = await alcanceDelHistorial(req);
  if (alcance.respuesta) {
    // Con permiso de depósito, el "solo locales" del historial no es la razón:
    // el pedido no es suyo.
    return comoDeposito ? { respuesta: NextResponse.json(NO_ENCONTRADO, { status: 404 }) } : alcance;
  }
  const pos = await prisma.posTransferencia.findFirst({
    where: { ...pedidosDelHistorial(alcance), id: posId, estado: { in: ESTADOS_DEL_HISTORIAL } },
    select: { id: true },
  });
  if (!pos) return { respuesta: NextResponse.json(NO_ENCONTRADO, { status: 404 }) };
  return { id: pos.id };
}

export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const posId = Number(id);
    if (!Number.isInteger(posId) || posId <= 0) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 });
    }

    const permitido = await pedidoQuePuedeVer(req, posId);
    if (permitido.respuesta) return permitido.respuesta;

    const pos = await prisma.posTransferencia.findUnique({
      where: { id: permitido.id },
      include: {
        origen: { select: { nombre: true } },
        destino: { select: { nombre: true } },
        detalles: {
          include: { producto: { include: BASE_CON_CATEGORIA } },
          orderBy: { id: "asc" },
        },
        transferencias: {
          select: { estado: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!pos) return NextResponse.json(NO_ENCONTRADO, { status: 404 });

    // El estado con la ÚNICA traducción que hay (`estadoParaElLocal`), la de
    // la entrada, el historial y el detalle.
    const estado = estadoParaElLocal({
      estado: pos.estado,
      depositoEmpezo: await depositoEmpezo(prisma, pos),
      transferenciaEstado: pos.transferencias?.[0]?.estado ?? null,
    });

    const datos = datosDelPdfDelPedido({
      numero: pos.id,
      local: pos.destino?.nombre,
      deposito: pos.origen?.nombre,
      enviadoAt: pos.solicitadoAt,
      estado,
      lineas: pos.detalles.map(lineaDelPdf),
    });
    const bytes = await armarPedidoAlDepositoPdf(datos);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nombreDelArchivo(pos.id, pos.destino?.nombre)}"`,
      },
    });
  } catch (err) {
    console.error("Error pedidos/pdf/[id]:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo armar el PDF del pedido: ${err?.message || "error desconocido"}` },
      { status: 500 }
    );
  }
}
