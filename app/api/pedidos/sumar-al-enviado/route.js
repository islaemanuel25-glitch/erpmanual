// app/api/pedidos/sumar-al-enviado/route.js
//
// SUMAR AL PEDIDO ENVIADO, CON CONFIRMACIÓN: TODOS LOS CAMBIOS JUNTOS.
//
// Emanuel (2026-10-22): "Sumar productos debería dejar sumar pero con una
// confirmación". La pantalla junta los cambios del modo sumar y los manda acá
// cuando la persona toca "Agregar al pedido (N)". Se aplican TODOS en una
// transacción, o ninguno: si el depósito ya empezó el pedido, 409 y no se
// escribe nada.
//
// Los mismos bloqueos que `set-cantidad` y las rutas del depósito
// (`lib/pedidos/bloqueoDelPedido.js`), el mismo criterio de "empezado", y la
// misma escritura de cada producto (`lib/pedidos/cantidadEnPedido.js`): una
// línea por producto, 0 lo saca. Mismos permisos que `set-cantidad`
// (`pedidos.editar`, no el depósito) y, como ella, sin pedir operario.
//
// El pedido viene en el cuerpo (`posId`): es el que la persona tenía en la
// pantalla. Si ya no es un pedido enviado de este local sin cancelar, no se
// escribe en otro.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { ESTADO_PEDIDO, sinCancelados } from "@/lib/pedidos/estados";
import { bloquearParDelPedido, bloquearFilaDelPedido, depositoEmpezo } from "@/lib/pedidos/bloqueoDelPedido";
import { validarCambio, fijarCantidadEnPedido } from "@/lib/pedidos/cantidadEnPedido";

const MENSAJE_EMPEZADO = "El depósito ya está preparando tu pedido. Ya no se puede cambiar.";
const MENSAJE_SIN_PEDIDO = "Este pedido ya no está esperando al depósito. Volvé a abrir Pedidos.";

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto || false },
        { status: scope.status }
      );
    }

    const { localId, grupoId, session } = scope;

    const permisos = Array.isArray(session.permisos) ? session.permisos : [];
    if (!permisos.includes("*") && !permisos.includes("pedidos.editar")) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso para editar pedidos" },
        { status: 403 }
      );
    }

    const localUser = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (localUser?.es_deposito) {
      return NextResponse.json(
        { ok: false, error: "El depósito no usa esta función. Usá POS Transferencias." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const posId = Number(body?.posId || 0);
    const entrada = Array.isArray(body?.cambios) ? body.cambios : [];

    if (!posId) {
      return NextResponse.json({ ok: false, error: "posId requerido" }, { status: 400 });
    }
    if (entrada.length === 0) {
      return NextResponse.json({ ok: false, error: "No hay cambios para agregar" }, { status: 400 });
    }

    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "No se encontró un depósito para el grupo" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.localId;

    // Todos se validan ANTES de escribir: uno malo y no entra ninguno. Si el
    // mismo producto viene dos veces, vale el último, como en la pantalla.
    const porProducto = new Map();
    for (const e of entrada) {
      const v = await validarCambio(prisma, depositoId, e);
      if (!v.ok) {
        return NextResponse.json({ ok: false, error: v.error }, { status: v.status });
      }
      porProducto.set(v.cambio.productoLocalId, v.cambio);
    }
    const cambios = [...porProducto.values()];

    const resultado = await prisma.$transaction(async (tx) => {
      await bloquearParDelPedido(tx, depositoId, localId);
      const fila = await bloquearFilaDelPedido(tx, posId);
      // Solo un pedido de este local a este depósito, y sin cancelar.
      const pos = fila
        ? await tx.posTransferencia.findFirst({
            where: sinCancelados({ id: posId, origenId: depositoId, destinoId: localId }),
            select: { id: true },
          })
        : null;
      if (!pos) return { sinPedido: true };
      if (await depositoEmpezo(tx, fila)) return { empezado: true };
      if (fila.estado !== ESTADO_PEDIDO.SOLICITADO) return { sinPedido: true };

      for (const cambio of cambios) {
        await fijarCantidadEnPedido(tx, posId, cambio);
      }

      const itemCount = await tx.posTransferenciaDetalle.count({
        where: { posTransferenciaId: posId, pos: sinCancelados() },
      });
      return { itemCount };
    });

    if (resultado.empezado) {
      return NextResponse.json({ ok: false, error: MENSAJE_EMPEZADO }, { status: 409 });
    }
    if (resultado.sinPedido) {
      return NextResponse.json({ ok: false, error: MENSAJE_SIN_PEDIDO }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      posId,
      aplicados: cambios.length,
      itemCount: resultado.itemCount,
    });
  } catch (err) {
    console.error("Error pedidos/sumar-al-enviado:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudieron agregar los cambios al pedido. Probá de nuevo." },
      { status: 500 }
    );
  }
}
