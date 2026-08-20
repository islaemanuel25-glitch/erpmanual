// app/api/pos-ventas/venta/[id]/desvincular/route.js
//
// "ESTA VENTA NO ERA INTERNA". Cambia el cliente de la venta a uno SIN local
// vinculado y cancela su transferencia, en una sola transacción: o pasan las dos
// cosas o no pasa ninguna.
//
// El porqué de que sea una sola operación está en
// `lib/ventas-internas/desvincularVenta.js`, junto al predicado. En una línea:
// cancelar sin cambiar el cliente deja mercadería descontada del depósito que no
// entra en ningún lado, y cambiar el cliente sin cancelar deja un remito viajando
// hacia un local que nunca compró.
//
// ── LO QUE ESTA RUTA NO TOCA ────────────────────────────────────────────────
//
// El total, los pagos, la caja y el turno. La venta ocurrió y se cobró: el
// dinero está bien donde está. Tampoco toca el `cantidad` del origen — ver la
// reversión simétrica más abajo, que es la parte delicada.
//
// ── LOS DOS PERMISOS, NO UNO NUEVO ──────────────────────────────────────────
//
// Exige `ventas.corregir_simple` Y `transferencias.cancelar`, porque hace las dos
// cosas. Un permiso nuevo habría nacido sin estar asignado en ningún rol y la
// operación no funcionaría para nadie hasta que alguien se acordara de darlo.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { toUnidades } from "@/lib/conversiones/stock";
import {
  reversionStockOrigen,
  politicaDeLaTransferencia,
} from "@/lib/transferencias/politicasStock";
import {
  puedeDesvincular,
  CODIGOS_DESVINCULAR,
} from "@/lib/ventas-internas/desvincularVenta";

const j = (body, status = 200) => NextResponse.json(body, { status });

export async function POST(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    for (const code of ["ventas.corregir_simple", "transferencias.cancelar"]) {
      const perm = checkPerm(session, code);
      if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);
    }

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId || Number.isNaN(ventaId)) {
      return j({ ok: false, error: "ID de venta inválido" }, 400);
    }

    const body = await req.json().catch(() => ({}));
    const clienteNuevoId = Number(body?.clienteNuevoId || 0);
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    const expectedVersion = Number(body?.version);

    const venta = await prisma.venta.findUnique({
      where: { id: ventaId },
      select: {
        id: true,
        numero: true,
        total: true,
        clienteId: true,
        localId: true,
        operadorId: true,
        turnoId: true,
        version: true,
        cliente: { select: { id: true, nombre: true, localVinculadoId: true } },
        transferencia: {
          select: {
            id: true,
            estado: true,
            origenId: true,
            destinoId: true,
            ventaId: true,
            destino: { select: { id: true, nombre: true } },
            detalle: {
              select: {
                id: true,
                cantidad: true,
                recibido: true,
                unidadEnviada: true,
                producto: {
                  select: {
                    id: true,
                    base: { select: { id: true, nombre: true, factor_pack: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!venta) return j({ ok: false, error: "No se encontró la venta." }, 404);

    const grupoId = await getGrupoIdDeLocal(venta.localId);

    const clienteNuevo = clienteNuevoId
      ? await prisma.cliente.findUnique({
          where: { id: clienteNuevoId },
          select: { id: true, nombre: true, localVinculadoId: true, grupoId: true },
        })
      : null;

    const veredicto = puedeDesvincular({
      venta: { ...venta, grupoId },
      clienteNuevo,
      motivo,
    });

    if (!veredicto.puede) {
      // 404 para la venta que no está; 409 para todo lo que es un conflicto con
      // el estado del mundo; 400 para lo que el que llama escribió mal.
      const status =
        veredicto.codigo === CODIGOS_DESVINCULAR.VENTA_AUSENTE
          ? 404
          : veredicto.codigo === CODIGOS_DESVINCULAR.MOTIVO_AUSENTE ||
            veredicto.codigo === CODIGOS_DESVINCULAR.CLIENTE_NUEVO_AUSENTE
          ? 400
          : 409;
      return j({ ok: false, error: veredicto.error, code: veredicto.codigo }, status);
    }

    const t = venta.transferencia;
    const politica = politicaDeLaTransferencia(t);

    const snapshotAntes = {
      clienteId: venta.clienteId,
      clienteNombre: venta.cliente?.nombre ?? null,
      clienteLocalVinculadoId: venta.cliente?.localVinculadoId ?? null,
      transferencia: {
        id: t.id,
        estado: t.estado,
        destinoId: t.destinoId,
        destinoNombre: t.destino?.nombre ?? null,
      },
    };

    const resultado = await prisma.$transaction(async (tx) => {
      // ── BARRERA ATÓMICA ────────────────────────────────────────────────────
      // Misma forma que usa `transferencias/cancelar`: el updateMany condicional
      // es lo único que garantiza que nadie esté recibiendo el remito en el
      // mismo instante. Sin esto, dos pedidos concurrentes revierten el tránsito
      // dos veces.
      const lock = await tx.transferencia.updateMany({
        where: { id: t.id, estado: "Enviada" },
        data: { estado: "Cancelando" },
      });
      if (lock.count === 0) throw new Error("TRANSFERENCIA_YA_PROCESADA");

      // ── LA REVERSIÓN, SIMÉTRICA A LA POLÍTICA ──────────────────────────────
      //
      // Acá está lo delicado de toda la operación. `reversionStockOrigen` con
      // SOLO_TRANSITO baja el tránsito y NO devuelve la cantidad, porque esta
      // transferencia nunca la descontó: la descontó la venta, y la venta sigue
      // en pie. Devolverla sería inventar mercadería que ya salió por la puerta.
      const impactoStock = [];
      for (const d of t.detalle) {
        const enviada = Number(d.cantidad || 0);
        if (enviada <= 0) continue;

        const unidades = toUnidades({
          cantidad: enviada,
          unidad: d.unidadEnviada || "BULTO",
          factorPack: Number(d.producto?.base?.factor_pack || 1),
        });
        if (unidades <= 0) continue;

        // La fila de stock del ORIGEN. `TransferenciaDetalle.productoId` apunta
        // al ProductoLocal del DESTINO, así que el del origen se resuelve por
        // baseId — igual que hace `transferencias/cancelar`.
        const productoOrigen = await tx.productoLocal.findUnique({
          where: {
            localId_baseId: { localId: t.origenId, baseId: d.producto.base.id },
          },
          select: { id: true },
        });
        if (!productoOrigen) continue;

        const { update } = reversionStockOrigen(politica, unidades);
        await tx.stockLocal.updateMany({
          where: { localId: t.origenId, productoId: productoOrigen.id },
          data: update,
        });

        impactoStock.push({
          baseId: d.producto.base.id,
          nombre: d.producto.base.nombre,
          unidades,
          politica,
        });
      }

      await tx.transferencia.update({
        where: { id: t.id },
        data: { estado: "Cancelada" },
      });

      // ── EL CLIENTE, CON BLOQUEO OPTIMISTA ──────────────────────────────────
      // `version` viaja desde el UI. Si otra corrección la movió mientras tanto,
      // count 0 → se tira todo, incluida la cancelación de arriba. Ése es el
      // "todo o nada" que pide el diseño.
      const versionBase = Number.isFinite(expectedVersion) ? expectedVersion : venta.version;
      const upd = await tx.venta.updateMany({
        where: { id: venta.id, version: versionBase },
        data: { clienteId: clienteNuevo.id, version: { increment: 1 } },
      });
      if (upd.count === 0) throw new Error("VERSION_DESACTUALIZADA");

      // ── EL RASTRO ──────────────────────────────────────────────────────────
      //
      // No es burocracia: una transferencia cancelada sin motivo es, dentro de un
      // mes, indistinguible de una que nunca debió existir. Y el error que esta
      // operación arregla NO se puede detectar desde los datos —lo medimos: el
      // destino de una transferencia siempre coincide con el cliente elegido, así
      // que un cliente mal elegido no deja ningún rastro—. Este registro es el
      // único lugar donde va a quedar dicho qué pasó.
      const correccion = await tx.ventaCorreccion.create({
        data: {
          ventaId: venta.id,
          tipo: "DESVINCULAR",
          motivo,
          usuarioId: session.id ?? null,
          operadorId: venta.operadorId ?? null,
          localId: venta.localId,
          grupoId: grupoId ?? null,
          turnoIdOriginal: venta.turnoId ?? null,
          turnoIdCorreccion: null, // no toca caja
          turnoCerrado: false,
          versionAntes: versionBase,
          versionDespues: versionBase + 1,
          totalAnterior: venta.total,
          totalNuevo: venta.total, // invariante: no se toca plata
          diferencia: 0,
          snapshotAntes,
          snapshotDespues: {
            clienteId: clienteNuevo.id,
            clienteNombre: clienteNuevo.nombre,
            clienteLocalVinculadoId: null,
            transferencia: { id: t.id, estado: "Cancelada", destinoId: t.destinoId },
          },
          diffProductos: null,
          diffPagos: null,
          impactoStock,
          impactoCaja: null,
        },
      });

      return { correccionId: correccion.id, transferenciaId: t.id, impactoStock };
    });

    return j({
      ok: true,
      ...resultado,
      clienteNuevo: { id: clienteNuevo.id, nombre: clienteNuevo.nombre },
    });
  } catch (err) {
    if (err.message === "TRANSFERENCIA_YA_PROCESADA") {
      return j(
        {
          ok: false,
          error: "Alguien tocó esta transferencia mientras deshacíamos la venta. Volvé a cargar la pantalla.",
          code: "TRANSFERENCIA_YA_PROCESADA",
        },
        409
      );
    }
    if (err.message === "VERSION_DESACTUALIZADA") {
      return j(
        {
          ok: false,
          error: "La venta fue modificada por otra persona mientras tanto. Volvé a cargar la pantalla.",
          code: "VERSION_DESACTUALIZADA",
        },
        409
      );
    }
    // Mensaje concreto y no "Error interno": ver la regla del catálogo de errores.
    console.error("ERROR desvinculando venta:", err);
    return j(
      {
        ok: false,
        error: `No se pudo deshacer la venta interna: ${err.message}`,
        code: "DESVINCULAR_FALLO",
      },
      500
    );
  }
}
