import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { mapStockItemLocal, mapStockItemDeposito } from "@/lib/stock/mapItem";

const PAGE_SIZE = 25;

// Búsqueda de texto actual de stock (nombre / código de barras / secundario).
function buildTextOR(q) {
  return q
    ? {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigo_barra: { contains: q, mode: "insensitive" } },
          { codigo_barra_secundario: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
}

// Código interno por proveedor (Opción C): SOLO con proveedor + q. Match EXACTO.
async function getBaseIdsCodigo(grupoWhere, proveedorId, q) {
  if (!q || !proveedorId || !grupoWhere) return [];
  const m = await prisma.productoCodigoProveedor.findMany({
    where: {
      grupoId: grupoWhere,
      proveedorId,
      activo: true,
      codigoInterno: { equals: q, mode: "insensitive" },
    },
    select: { productoBaseId: true },
  });
  return [...new Set(m.map((x) => x.productoBaseId))];
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "stock.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const sessionLocalId = session.localId;
    const esAdmin = session.esAdmin;

    const { searchParams } = new URL(req.url);

    const page = Math.max(Number(searchParams.get("page") || 1), 1);
    const offset = (page - 1) * PAGE_SIZE;

    let localId = null;

    if (esAdmin && !sessionLocalId) {
      localId = Number(searchParams.get("localId") || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId requerido para admin sin local." },
          { status: 400 }
        );
      }
    } else {
      localId = Number(sessionLocalId || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "localId inválido" },
          { status: 400 }
        );
      }
    }

    const q = (searchParams.get("q") || "").trim();
    const categoria = searchParams.get("categoria");
    const proveedor = searchParams.get("proveedor");
    const area = searchParams.get("area");

    const conStock = searchParams.get("conStock") === "true";
    const sinStock = searchParams.get("sinStock") === "true";
    const faltantes = searchParams.get("faltantes") === "true";
    const negativo = searchParams.get("negativo") === "true";

    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    const esDeposito = local.es_deposito === true;

    let final = [];

    // ======================================================
    // 🟦 VISTA LOCAL → PRECIO UNITARIO + REDONDEO A 100
    // ======================================================
    if (!esDeposito) {
      // Opción C — código interno por proveedor SOLO con proveedor + q.
      // Como la consulta es sobre ProductoLocal del local, una base que matchee
      // por código pero sin ProductoLocal en este local NO devuelve fila
      // (no aparece y no se crea nada).
      const provNum = proveedor ? Number(proveedor) : null;
      const grupoIdLocal = await getGrupoIdDeLocal(localId);
      const baseIdsCodigo = await getBaseIdsCodigo(grupoIdLocal, provNum, q);
      const proveedorBaseFilter = provNum ? { proveedor_id: provNum } : {};
      let baseClause;
      if (q) {
        const proveedorYTexto = { AND: [proveedorBaseFilter, buildTextOR(q)] };
        baseClause = baseIdsCodigo.length
          ? { OR: [proveedorYTexto, { id: { in: baseIdsCodigo } }] }
          : proveedorYTexto;
      } else {
        baseClause = proveedorBaseFilter;
      }

      const rows = await prisma.productoLocal.findMany({
        where: {
          localId,
          activo: true,
          base: {
            activo: true,
            categoria_id: categoria ? Number(categoria) : undefined,
            area_fisica_id: area ? Number(area) : undefined,
            AND: [baseClause],
          },
        },
        orderBy: { id: "desc" },
        include: {
          base: {
            select: {
              id: true,
              nombre: true,
              codigo_barra: true,
              categoria_id: true,
              proveedor_id: true,
              area_fisica_id: true,
              unidad_medida: true,
              factor_pack: true,
              precio_costo: true,
              precio_venta: true,
              redondeo_100: true,
              modoCompraProveedor: true,
              pesoReferenciaKg: true,
              pesoEsFijo: true,
              modoVentaDeposito: true,
            },
          },
          stock: {
            take: 1,
            select: { cantidad: true, stockMin: true, stockMax: true },
          },
        },
      });

      // Armado del item centralizado en lib/stock/mapItem (mismo JSON de salida).
      final = rows.map((p) => mapStockItemLocal(p, p.base, p.stock?.[0]));
    }

    // ======================================================
    // 🟥 VISTA DEPÓSITO → PRECIO DE BULTO
    // ======================================================
    if (esDeposito) {
      const gruposDepo = await prisma.grupoDeposito.findMany({
        where: { localId },
        select: { grupoId: true },
      });

      const grupoIds = gruposDepo.map((g) => g.grupoId);

      if (grupoIds.length === 0) {
        return NextResponse.json({
          ok: true,
          items: [],
          total: 0,
          totalPages: 1,
        });
      }

      const bases = await prisma.productoBase.findMany({
        where: {
          grupoId: { in: grupoIds },
          activo: true,
          ...(q
            ? {
                OR: [
                  { nombre: { contains: q, mode: "insensitive" } },
                  { codigo_barra: { contains: q, mode: "insensitive" } },
                  { codigo_barra_secundario: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
          categoria_id: categoria ? Number(categoria) : undefined,
          proveedor_id: proveedor ? Number(proveedor) : undefined,
          area_fisica_id: area ? Number(area) : undefined,
        },
        orderBy: { id: "desc" },
        include: {
          locales: {
            where: { localId, activo: true },
            include: {
              stock: true,
              base: {
                select: {
                  unidad_medida: true,
                  factor_pack: true,
                  modoCompraProveedor: true,
                  pesoReferenciaKg: true,
                  pesoEsFijo: true,
                  modoVentaDeposito: true,
                },
              },
            },
          },
        },
      });

      final = [];

      for (const b of bases) {
        let pl = b.locales[0] || null;

        if (!pl) {
          pl = await prisma.productoLocal.create({
            data: {
              baseId: b.id,
              localId,
              precio_costo: b.precio_costo,
              precio_venta: b.precio_venta,
              margen: b.margen,
              activo: b.activo,
            },
            include: {
              stock: true,
              base: { select: { unidad_medida: true, factor_pack: true, modoCompraProveedor: true, pesoReferenciaKg: true, modoVentaDeposito: true } },
            },
          });

          await prisma.stockLocal.create({
            data: {
              localId,
              productoId: pl.id,
              cantidad: 0,
              stockMin: 0,
              stockMax: 0,
            },
          });
        }

        const stock = pl.stock?.[0] || {
          cantidad: 0,
          stockMin: 0,
          stockMax: 0,
        };

        // `b` es la ProductoBase completa; pl.base (select acotado) referencia
        // la misma base → mapStockItemDeposito(pl, b, ...) da el mismo resultado.
        final.push(mapStockItemDeposito(pl, b, stock, localId));
      }

      // Opción C — código interno por proveedor en depósito.
      // Suma bases vinculadas por código (proveedor + q) que YA tengan
      // ProductoLocal en este depósito. NO auto-crea ProductoLocal por código:
      // si no tiene ProductoLocal, no aparece y no se crea nada.
      const provNumDep = proveedor ? Number(proveedor) : null;
      if (q && provNumDep) {
        const codigoBaseIds = await getBaseIdsCodigo({ in: grupoIds }, provNumDep, q);
        const yaIncluidos = new Set(final.map((f) => f.baseId));
        const faltantes = codigoBaseIds.filter((id) => !yaIncluidos.has(id));

        if (faltantes.length) {
          const extras = await prisma.productoLocal.findMany({
            where: {
              localId,
              activo: true,
              baseId: { in: faltantes },
              base: { activo: true },
            },
            include: {
              stock: true,
              base: {
                select: {
                  id: true,
                  nombre: true,
                  codigo_barra: true,
                  categoria_id: true,
                  proveedor_id: true,
                  area_fisica_id: true,
                  unidad_medida: true,
                  factor_pack: true,
                  precio_costo: true,
                  precio_venta: true,
                  margen: true,
                  modoCompraProveedor: true,
                  pesoReferenciaKg: true,
                  pesoEsFijo: true,
                  modoVentaDeposito: true,
                },
              },
            },
          });

          for (const pl of extras) {
            const b = pl.base;
            const stock = pl.stock?.[0] || { cantidad: 0, stockMin: 0, stockMax: 0 };
            final.push(mapStockItemDeposito(pl, b, stock, localId));
          }
        }
      }
    }

    if (conStock) final = final.filter((p) => p.stock > 0);
    if (sinStock) final = final.filter((p) => p.stock === 0);
    if (faltantes) final = final.filter((p) => p.faltante);
    if (negativo) final = final.filter((p) => p.stock < 0);

    // Orden alfabético por nombre
    final.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));

    const total = final.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const items = final.slice(offset, offset + PAGE_SIZE);

    return NextResponse.json({ ok: true, items, total, totalPages });
  } catch (err) {
    console.error("❌ ERROR STOCK LISTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
