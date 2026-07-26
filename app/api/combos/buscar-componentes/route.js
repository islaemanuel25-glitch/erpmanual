// app/api/combos/buscar-componentes/route.js
//
// GET /api/combos/buscar-componentes?localId=&q=&limit=
// Autocomplete SEGURO de componentes candidatos para un combo. Devuelve SOLO
// ProductoLocal del local activo que sean: físicos, activos, visibles para el
// contexto y NO combos. Paginado (take acotado) — no vuelca el catálogo entero.
// El servidor vuelve a validar TODO al guardar (lib/combos/service); esto es solo
// para poblar el editor.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { costoUnitarioComponente } from "@/lib/combos/costo";
import { esFiambreFijo as checkFiambreFijo } from "@/lib/conversiones/stock";

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

export async function GET(req) {
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return NextResponse.json(
      { ok: false, error: scope.error, needsContexto: scope.needsContexto },
      { status: scope.status }
    );
  }
  const { localId, session } = scope;

  const perm = checkPerm(session, "productos.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(LIMIT_MAX, Math.max(1, Number(searchParams.get("limit")) || LIMIT_DEFAULT));

  if (!q) return NextResponse.json({ ok: true, items: [] });

  try {
    const local = await prisma.local.findUnique({ where: { id: localId }, select: { es_deposito: true } });
    const esDeposito = local?.es_deposito === true;

    const filtroBase = {
      activo: true,
      es_combo: false, // nunca un combo como componente
      ...productoVisibleWhere(localId), // visibilidad del contexto
    };

    const candidatos = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: filtroBase,
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { base: { nombre: { contains: q, mode: "insensitive" } } },
          { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
          { base: { codigo_barra_secundario: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: limit,
      orderBy: [{ nombre: "asc" }],
    });

    // El shape es COMPATIBLE con el buscador del POS (BuscadorProductos) para poder
    // reutilizar ese componente tal cual. `disponibleParaVenta: true` → un componente
    // siempre se puede agregar (incluso sin stock; el combo quedará no disponible).
    // `costoUnitario` es el extra que usa la composición del combo.
    const items = candidatos.map((pl) => {
      const tieneStockLocal = Array.isArray(pl.stock) && pl.stock.length > 0;
      const stock = tieneStockLocal ? Number(pl.stock[0].cantidad) : 0;
      const base = pl.base || {};
      return {
        productoLocalId: pl.id,
        productoBaseId: pl.baseId,
        nombre: pl.nombre || base.nombre || "",
        codigoBarra: base.codigo_barra || "",
        codigoBarraSecundario: base.codigo_barra_secundario || "",
        // Display (mismo shape que buscar-producto):
        precioVenta: Number(pl.precio_venta ?? base.precio_venta ?? 0),
        stock,
        sinStock: stock <= 0,
        disponibleParaVenta: true, // siempre agregable como componente
        allowNegativeStock: false,
        unidadMedida: base.unidad_medida || "unidad",
        factorPack: Number(base.factor_pack) || 1,
        esFiambreFijo: esDeposito && checkFiambreFijo(base),
        // Extra para la composición del combo:
        costoUnitario: costoUnitarioComponente({ base, productoLocal: pl, esDeposito }),
        tieneStockLocal,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("🔥 combos/buscar-componentes:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
