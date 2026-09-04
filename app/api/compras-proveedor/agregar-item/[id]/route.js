// app/api/compras-proveedor/agregar-item/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { esComboBase } from "@/lib/combos/guards";
import { pedidoEnAlcance, ownerLocalIdDePedido } from "@/lib/compras/scope";
import { productoVisibleWhere } from "@/lib/visibilidad";

export async function POST(req, { params }) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    const { grupoId, localId, session } = ctx;

    const perm = checkPerm(session, "compras.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;
    const pedidoId = Number(id);

    if (!pedidoId) {
      return NextResponse.json(
        { ok: false, error: "id requerido" },
        { status: 400 }
      );
    }

    const pedido = await prisma.pedidoProveedor.findUnique({
      where: { id: pedidoId },
      include: { detalles: { select: { productoLocalId: true } } },
    });

    if (!pedido || pedido.grupoId !== grupoId) {
      return NextResponse.json(
        { ok: false, error: "Pedido no encontrado" },
        { status: 404 }
      );
    }
    // Escritura sobre pedido de otra ubicación del mismo grupo → 403.
    if (!pedidoEnAlcance(pedido, { grupoId, localId })) {
      return NextResponse.json(
        { ok: false, error: "Pedido fuera de tu alcance" },
        { status: 403 }
      );
    }

    if (!["BORRADOR", "ENVIADO"].includes(pedido.estado)) {
      return NextResponse.json(
        { ok: false, error: "Solo se pueden agregar ítems en estado BORRADOR o ENVIADO" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { productoLocalId, cantidad, cantidadRecibida, precioCosto, unidad } = body;

    if (!productoLocalId || !Number.isFinite(Number(productoLocalId))) {
      return NextResponse.json(
        { ok: false, error: "productoLocalId requerido" },
        { status: 400 }
      );
    }

    // ── EL PRODUCTO TIENE QUE SER DE LA UBICACIÓN DUEÑA DEL PEDIDO ────────
    //
    // Comparaba contra `pedido.depositoId`, así que a un pedido de un local solo
    // se le podían agregar productos del DEPÓSITO. Es el mismo bloqueo que en
    // `crear`, una pantalla más tarde.
    //
    // Ahora se compara contra `ownerLocalIdDePedido(pedido)`, que es la función
    // que YA decide de quién es el pedido y dónde va a entrar el stock al
    // recibir. Se la LEE, no se la cambia: usar otra cosa acá dejaría que se
    // agregue una línea de un catálogo distinto del que va a recibir.
    //
    // Para un pedido del depósito el dueño ES `depositoId`, así que el
    // comportamiento anterior se conserva exacto.
    //
    // La segunda condición es la Regla A, con el predicado compartido: sin ella
    // una fila de `ProductoLocal` de esta ubicación que apunte a una base creada
    // por otro local seguiría siendo agregable.
    const ubicacionDelPedido = ownerLocalIdDePedido(pedido);
    const pl = await prisma.productoLocal.findFirst({
      where: {
        id: Number(productoLocalId),
        localId: ubicacionDelPedido,
        base: productoVisibleWhere(ubicacionDelPedido),
      },
      include: {
        base: {
          select: { modoCompraProveedor: true, es_combo: true },
        },
      },
    });

    if (!pl) {
      return NextResponse.json(
        { ok: false, error: "Producto no pertenece a la ubicación del pedido" },
        { status: 400 }
      );
    }

    if (esComboBase(pl.base)) {
      return NextResponse.json(
        { ok: false, error: "Los combos no se compran a proveedor; se compran sus componentes." },
        { status: 400 }
      );
    }

    // Verificar duplicado
    const yaExiste = pedido.detalles.some(
      (d) => d.productoLocalId === Number(productoLocalId)
    );
    if (yaExiste) {
      return NextResponse.json(
        { ok: false, error: "El producto ya está en el pedido" },
        { status: 409 }
      );
    }

    // Validar cantidad
    const cant = Number(cantidad);
    if (!Number.isFinite(cant) || !Number.isInteger(cant) || cant < 1) {
      return NextResponse.json(
        { ok: false, error: "cantidad debe ser un entero >= 1" },
        { status: 400 }
      );
    }

    const cantRec = cantidadRecibida !== undefined && cantidadRecibida !== null
      ? Number(cantidadRecibida)
      : cant;
    if (!Number.isFinite(cantRec) || !Number.isInteger(cantRec) || cantRec < 0) {
      return NextResponse.json(
        { ok: false, error: "cantidadRecibida debe ser un entero >= 0" },
        { status: 400 }
      );
    }

    // Validar precioCosto
    let costo = null;
    if (precioCosto !== undefined && precioCosto !== null && precioCosto !== "") {
      const c = Number(precioCosto);
      if (!Number.isFinite(c) || c < 0) {
        return NextResponse.json(
          { ok: false, error: "precioCosto debe ser un número >= 0" },
          { status: 400 }
        );
      }
      costo = c;
    }

    // Derivar unidad
    const unidadFinal = unidad || pl.base?.modoCompraProveedor || "BULTO";

    const detalle = await prisma.pedidoProveedorDetalle.create({
      data: {
        pedidoId,
        productoLocalId: Number(productoLocalId),
        cantidad: cant,
        cantidadRecibida: cantRec,
        precioCosto: costo,
        unidad: unidadFinal,
      },
    });

    return NextResponse.json({ ok: true, detalle });
  } catch (err) {
    console.error("Error compras-proveedor/agregar-item:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
