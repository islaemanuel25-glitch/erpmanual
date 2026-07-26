// app/api/productos/promover-a-deposito/route.js
//
// Regla A (acción explícita): "subir un producto de local al catálogo del
// depósito". El producto pasa a SER del depósito (creadoEnLocalId = depósito) y
// baja a todos los locales del grupo, como cualquier producto de depósito.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo, getLocalesDeGrupo } from "@/lib/grupos";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { baseId } = await req.json();
    const id = Number(baseId);
    if (!id) {
      return NextResponse.json({ ok: false, error: "baseId requerido" }, { status: 400 });
    }

    const depositoId = await getDepositoIdDeGrupo(grupoId);
    if (!depositoId) {
      return NextResponse.json({ ok: false, error: "El grupo no tiene depósito asignado" }, { status: 400 });
    }

    const base = await prisma.productoBase.findFirst({
      where: { id, grupoId },
      include: { creadoEnLocal: { select: { es_deposito: true } } },
    });
    if (!base) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado en el grupo" }, { status: 404 });
    }

    // Guard combos: un combo es exclusivo del local que lo creó y no tiene stock
    // físico; no puede promoverse ni replicarse al depósito/otros locales.
    if (base.es_combo) {
      return NextResponse.json(
        { ok: false, error: "Un combo no puede promoverse al depósito: es exclusivo del local que lo creó." },
        { status: 400 }
      );
    }

    // Ya es de depósito (o sin creador = de depósito) → no-op idempotente.
    const yaEsDeposito = base.creadoEnLocalId == null || base.creadoEnLocal?.es_deposito === true;

    await prisma.$transaction(async (tx) => {
      if (!yaEsDeposito) {
        await tx.productoBase.update({ where: { id }, data: { creadoEnLocalId: depositoId } });
      }
      // Materializar ProductoLocal + StockLocal en depósito + todos los locales.
      const localesGrupo = await getLocalesDeGrupo(grupoId); // excluye depósitos
      const localIds = [depositoId, ...localesGrupo.map((l) => l.id)];

      await tx.productoLocal.createMany({
        data: localIds.map((localId) => ({
          localId,
          baseId: id,
          precio_costo: base.precio_costo,
          precio_venta: base.precio_venta,
          margen: base.margen,
          activo: base.activo,
        })),
        skipDuplicates: true,
      });

      const pls = await tx.productoLocal.findMany({
        where: { baseId: id, localId: { in: localIds } },
        select: { id: true, localId: true },
      });
      await tx.stockLocal.createMany({
        data: pls.map((pl) => ({ localId: pl.localId, productoId: pl.id, cantidad: "0", stockMin: null, stockMax: null })),
        skipDuplicates: true,
      });
    });

    return NextResponse.json({ ok: true, yaEraDeposito: yaEsDeposito });
  } catch (err) {
    console.error("Error promover-a-deposito:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
