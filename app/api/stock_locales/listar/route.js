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

      // Estados de stock movidos a la BASE DE DATOS.
      const estadoStockClauses = [];
      if (conStock) estadoStockClauses.push({ stock: { some: { cantidad: { gt: 0 } } } });
      if (sinStock)
        estadoStockClauses.push({
          OR: [{ stock: { none: {} } }, { stock: { some: { cantidad: 0 } } }],
        });
      if (negativo) estadoStockClauses.push({ stock: { some: { cantidad: { lt: 0 } } } });

      // WHERE único, compartido por count(), findMany paginado y camino hybrid.
      const whereLocal = {
        localId,
        activo: true,
        ...(estadoStockClauses.length ? { AND: estadoStockClauses } : {}),
        base: {
          activo: true,
          categoria_id: categoria ? Number(categoria) : undefined,
          area_fisica_id: area ? Number(area) : undefined,
          AND: [baseClause],
        },
      };

      const includeLocal = {
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
      };

      // Orden movido a DB. Acepta variación menor de collation respecto al
      // localeCompare("es") JS anterior (aceptado explícitamente).
      const orderByLocal = { base: { nombre: "asc" } };

      // Faltantes (cantidad < stockMin = comparación entre 2 columnas) no se
      // puede expresar limpio en Prisma sin $queryRaw → camino HYBRID: la DB ya
      // recortó por filtros de texto/categoría/proveedor/área/estado; el filtro
      // faltante y la paginación quedan en JS. Único caso que aún trae el set
      // completo (acotado) antes de cortar; el resto pagina 100% en DB.
      if (faltantes) {
        const rows = await prisma.productoLocal.findMany({
          where: whereLocal,
          orderBy: orderByLocal,
          include: includeLocal,
        });
        const mapped = rows
          .map((p) => mapStockItemLocal(p, p.base, p.stock?.[0]))
          .filter((p) => p.faltante);
        const total = mapped.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const items = mapped.slice(offset, offset + PAGE_SIZE);
        return NextResponse.json({ ok: true, items, total, totalPages });
      }

      // Resto de casos: filtros + orden + paginación + count 100% en DB.
      const total = await prisma.productoLocal.count({ where: whereLocal });
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const rows = await prisma.productoLocal.findMany({
        where: whereLocal,
        orderBy: orderByLocal,
        skip: offset,
        take: PAGE_SIZE,
        include: includeLocal,
      });
      const items = rows.map((p) => mapStockItemLocal(p, p.base, p.stock?.[0]));
      return NextResponse.json({ ok: true, items, total, totalPages });
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

      // ── Guard self-healing: materializar en BATCH los ProductoLocal de
      // depósito faltantes (bases activas del grupo sin PL en el depósito) y su
      // StockLocal. Reemplaza la auto-creación secuencial dentro del GET. Si no
      // hay faltantes → CERO escrituras. Idempotente por @@unique + skipDuplicates.
      const faltantesBases = await prisma.productoBase.findMany({
        where: { grupoId: { in: grupoIds }, activo: true, locales: { none: { localId } } },
        select: { id: true, precio_costo: true, precio_venta: true, margen: true, activo: true },
      });
      if (faltantesBases.length) {
        await prisma.productoLocal.createMany({
          data: faltantesBases.map((b) => ({
            localId,
            baseId: b.id,
            precio_costo: b.precio_costo,
            precio_venta: b.precio_venta,
            margen: b.margen,
            activo: b.activo,
          })),
          skipDuplicates: true,
        });

        const nuevos = await prisma.productoLocal.findMany({
          where: { localId, baseId: { in: faltantesBases.map((b) => b.id) }, stock: { none: {} } },
          select: { id: true },
        });
        if (nuevos.length) {
          await prisma.stockLocal.createMany({
            data: nuevos.map((pl) => ({ localId, productoId: pl.id, cantidad: 0, stockMin: 0, stockMax: 0 })),
            skipDuplicates: true,
          });
        }
      }

      // ── Depósito consulta ProductoLocal del depósito y pagina en DB igual que
      // la rama LOCAL (mismo patrón de filtros), pero con precio de bulto
      // (mapStockItemDeposito). Como el guard garantiza un PL por cada base activa
      // del grupo, el universo es el mismo que antes (depósito ve todas las bases).
      const provNumDep = proveedor ? Number(proveedor) : null;
      const baseIdsCodigoDepo = await getBaseIdsCodigo({ in: grupoIds }, provNumDep, q);
      const proveedorBaseFilterDepo = provNumDep ? { proveedor_id: provNumDep } : {};
      let baseClauseDepo;
      if (q) {
        const proveedorYTextoDepo = { AND: [proveedorBaseFilterDepo, buildTextOR(q)] };
        baseClauseDepo = baseIdsCodigoDepo.length
          ? { OR: [proveedorYTextoDepo, { id: { in: baseIdsCodigoDepo } }] }
          : proveedorYTextoDepo;
      } else {
        baseClauseDepo = proveedorBaseFilterDepo;
      }

      const estadoStockClausesDepo = [];
      if (conStock) estadoStockClausesDepo.push({ stock: { some: { cantidad: { gt: 0 } } } });
      if (sinStock)
        estadoStockClausesDepo.push({
          OR: [{ stock: { none: {} } }, { stock: { some: { cantidad: 0 } } }],
        });
      if (negativo) estadoStockClausesDepo.push({ stock: { some: { cantidad: { lt: 0 } } } });

      const whereDepo = {
        localId,
        activo: true,
        ...(estadoStockClausesDepo.length ? { AND: estadoStockClausesDepo } : {}),
        base: {
          activo: true,
          categoria_id: categoria ? Number(categoria) : undefined,
          area_fisica_id: area ? Number(area) : undefined,
          AND: [baseClauseDepo],
        },
      };

      const includeDepo = {
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
        stock: { take: 1, select: { cantidad: true, stockMin: true, stockMax: true } },
      };

      const orderByDepo = { base: { nombre: "asc" } };

      // Faltantes (cantidad < stockMin = 2 columnas) → hybrid JS, igual que LOCAL.
      if (faltantes) {
        const rows = await prisma.productoLocal.findMany({
          where: whereDepo,
          orderBy: orderByDepo,
          include: includeDepo,
        });
        const mapped = rows
          .map((p) => mapStockItemDeposito(p, p.base, p.stock?.[0], localId))
          .filter((p) => p.faltante);
        const total = mapped.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const items = mapped.slice(offset, offset + PAGE_SIZE);
        return NextResponse.json({ ok: true, items, total, totalPages });
      }

      // Resto: filtros + orden + paginación + count 100% en DB.
      const total = await prisma.productoLocal.count({ where: whereDepo });
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const rows = await prisma.productoLocal.findMany({
        where: whereDepo,
        orderBy: orderByDepo,
        skip: offset,
        take: PAGE_SIZE,
        include: includeDepo,
      });
      const items = rows.map((p) => mapStockItemDeposito(p, p.base, p.stock?.[0], localId));
      return NextResponse.json({ ok: true, items, total, totalPages });
    }
  } catch (err) {
    console.error("❌ ERROR STOCK LISTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
