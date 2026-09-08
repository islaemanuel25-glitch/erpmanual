// app/api/transferencias/linea-recepcion/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { esComboBase } from "@/lib/combos/guards";
import { productoDelCatalogoLocal } from "@/lib/productos/buscarCatalogoLocal";
import { estadoAdmiteRecepcion, puedeRecibir } from "@/lib/transferencias/recepcionServidor";

// AGREGAR O QUITAR UNA LÍNEA QUE APARECIÓ AL ABRIR LOS BULTOS.
//
// ── LO QUE ESTA RUTA NO MUEVE ─────────────────────────────────────────────
//
// Stock. Ni una unidad. Agregar una línea es registrar que ese producto llegó;
// el inventario recién se toca al CONFIRMAR, dentro de la única transacción que
// ya existe. Por eso una línea agregada por error se puede borrar sin
// consecuencias mientras la recepción siga abierta: nunca movió nada.
//
// ── POR QUÉ NO CREA UNA LÍNEA SI EL PRODUCTO YA ESTÁ ──────────────────────
//
// Si el producto ya es una línea del remito, lo que llegó de más no es un
// producto nuevo: es MÁS de esa línea. Crear una segunda fila del mismo producto
// dejaría la transferencia con dos verdades sobre lo mismo —cuánto se envió se
// leería en una y cuánto llegó en las dos— y rompería la lectura de cualquier
// reporte que agrupe por producto. Se contesta con la línea existente para que
// el operador aumente su `recibido`, que es exactamente el caso 1.
//
// ── UNA LÍNEA DEL REMITO NO SE BORRA DESDE ACÁ ────────────────────────────
//
// Solo se puede borrar lo que se agregó en recepción. Borrar una línea original
// haría desaparecer mercadería que SÍ salió del origen: su tránsito quedaría
// reservado para siempre y el faltante no volvería a ningún stock. Si no llegó
// nada de esa línea, el camino es `recibido = 0`, que sí lo contempla la
// aritmética.

/** El producto que se pide agregar, resuelto contra el catálogo del ORIGEN. */
async function resolverPedido(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: { status: 401, body: { ok: false, error: "No autenticado" } } };

  const perm = checkPerm(session, "transferencias.recibir");
  if (!perm.ok) return { error: { status: perm.status, body: { ok: false, error: perm.error } } };

  const usuarioId = Number(session.id || 0);
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return {
      error: {
        status: 401,
        body: {
          ok: false,
          codigo: "USUARIO_SESION_INVALIDO",
          error: "Tu sesión no identifica un usuario válido. Volvé a iniciar sesión.",
        },
      },
    };
  }

  const body = await req.json().catch(() => ({}));
  const transferenciaId = Number(body?.transferenciaId || 0);
  if (!transferenciaId) {
    return { error: { status: 400, body: { ok: false, error: "transferenciaId requerido" } } };
  }

  const transferencia = await prisma.transferencia.findUnique({
    where: { id: transferenciaId },
    select: { id: true, origenId: true, destinoId: true, estado: true },
  });
  if (!transferencia) {
    return { error: { status: 404, body: { ok: false, error: "Transferencia no encontrada" } } };
  }

  const alcance = puedeRecibir(session, transferencia);
  if (!alcance.ok) {
    return { error: { status: alcance.status, body: { ok: false, error: alcance.error } } };
  }

  const estado = estadoAdmiteRecepcion(transferencia.estado, { accion: "modificar las líneas" });
  if (!estado.ok) {
    return { error: { status: estado.status, body: { ok: false, error: estado.error } } };
  }

  return { session, usuarioId, transferencia, body };
}

/**
 * POST — agregar una línea de recepción.
 *
 * Cuerpo: { transferenciaId, productoLocalId, unidadEnviada?, recibido? }
 *
 * `productoLocalId` es del catálogo del ORIGEN, y se comprueba contra ese
 * catálogo con el MISMO filtro que usa el buscador: lo que no se puede encontrar
 * tampoco se puede agregar.
 */
export async function POST(req) {
  try {
    const pedido = await resolverPedido(req);
    if (pedido.error) return NextResponse.json(pedido.error.body, { status: pedido.error.status });

    const { usuarioId, transferencia, body } = pedido;

    const producto = await productoDelCatalogoLocal(prisma, {
      localId: transferencia.origenId,
      productoLocalId: body?.productoLocalId,
    });

    // Un producto de otro origen, uno inexistente y uno no visible para ese local
    // se contestan IGUAL: desde afuera no se puede distinguir, así que el id no
    // sirve para averiguar qué tiene otro local en su catálogo.
    if (!producto) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "PRODUCTO_FUERA_DEL_ORIGEN",
          error: "Ese producto no pertenece al catálogo del local de origen de esta transferencia.",
        },
        { status: 404 }
      );
    }

    if (esComboBase(producto.base)) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "COMBO_NO_TRANSFERIBLE",
          error: "Un combo no tiene stock físico propio: no se puede recibir como línea.",
        },
        { status: 400 }
      );
    }

    // ── SI YA ESTÁ EN EL REMITO, NO SE DUPLICA ──────────────────────────────
    const existente = await prisma.transferenciaDetalle.findFirst({
      where: { transferenciaId: transferencia.id, productoId: producto.id },
      select: { id: true, cantidad: true, recibido: true, agregadoEnRecepcion: true },
    });

    if (existente) {
      return NextResponse.json({
        ok: true,
        yaExistia: true,
        detalleId: existente.id,
        agregadoEnRecepcion: existente.agregadoEnRecepcion,
        mensaje:
          "Ese producto ya figura en esta transferencia. Aumentá la cantidad recibida en su línea en vez de agregarlo de nuevo.",
      });
    }

    // La unidad de una línea agregada NO se hereda de nada: el operador cuenta
    // en bultos o en unidades y esa elección cambia el stock por el factor de
    // pack. Sin dato explícito se asume UNIDAD, que es la escala física de
    // StockLocal y la única que no multiplica. Asumir BULTO inventaría stock, que
    // es el mismo motivo por el que la recepción ya no tiene el viejo fallback
    // silencioso `unidadEnviada || "BULTO"`.
    const unidad = String(body?.unidadEnviada || "UNIDAD").toUpperCase();
    if (unidad !== "UNIDAD" && unidad !== "BULTO") {
      return NextResponse.json(
        { ok: false, codigo: "UNIDAD_ENVIADA_DESCONOCIDA", error: "Unidad desconocida: se esperaba BULTO o UNIDAD." },
        { status: 400 }
      );
    }

    const creado = await prisma.transferenciaDetalle.create({
      data: {
        transferenciaId: transferencia.id,
        productoId: producto.id,
        // CERO, y es el dato honesto: esta línea no se envió. De acá sale que su
        // tránsito no se toque y que su diferencia sea todo lo recibido.
        cantidad: 0,
        recibido: body?.recibido == null ? null : body.recibido,
        unidadEnviada: unidad,
        precioCosto: producto.precio_costo ?? producto.base?.precio_costo ?? null,
        agregadoEnRecepcion: true,
        agregadoEnRecepcionPorId: usuarioId,
        agregadoEnRecepcionAt: new Date(),
      },
      select: { id: true },
    });

    // La transferencia pasa a "Recibiendo" igual que al guardar cantidades: hay
    // trabajo de recepción en curso.
    await prisma.transferencia.update({
      where: { id: transferencia.id },
      data: { estado: "Recibiendo" },
    });

    return NextResponse.json({ ok: true, yaExistia: false, detalleId: creado.id });
  } catch (err) {
    console.error("ERROR agregar linea de recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo agregar la línea de recepción." },
      { status: 500 }
    );
  }
}

/**
 * DELETE — quitar una línea agregada por error.
 *
 * Cuerpo: { transferenciaId, detalleId }
 *
 * Solo líneas agregadas en recepción, y solo mientras la recepción esté abierta.
 * No mueve stock porque la línea nunca lo movió.
 */
export async function DELETE(req) {
  try {
    const pedido = await resolverPedido(req);
    if (pedido.error) return NextResponse.json(pedido.error.body, { status: pedido.error.status });

    const { transferencia, body } = pedido;
    const detalleId = Number(body?.detalleId || 0);

    // El detalle se busca DENTRO de la transferencia: un id de otra transferencia
    // no aparece, así que no se puede borrar una línea ajena pasando su número.
    const detalle = await prisma.transferenciaDetalle.findFirst({
      where: { id: detalleId, transferenciaId: transferencia.id },
      select: { id: true, agregadoEnRecepcion: true },
    });

    if (!detalle) {
      return NextResponse.json(
        { ok: false, error: "Esa línea no pertenece a esta transferencia." },
        { status: 404 }
      );
    }

    if (!detalle.agregadoEnRecepcion) {
      return NextResponse.json(
        {
          ok: false,
          codigo: "LINEA_DEL_REMITO_NO_SE_BORRA",
          error:
            "Esa línea es parte del envío original y no se puede eliminar desde la recepción. " +
            "Si no llegó nada de ese producto, cargá 0 como cantidad recibida.",
        },
        { status: 409 }
      );
    }

    await prisma.transferenciaDetalle.delete({ where: { id: detalle.id } });

    return NextResponse.json({ ok: true, eliminada: true });
  } catch (err) {
    console.error("ERROR eliminar linea de recepcion:", err);
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar la línea de recepción." },
      { status: 500 }
    );
  }
}
