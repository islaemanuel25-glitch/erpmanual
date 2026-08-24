import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { mapStockItemLocal, mapStockItemDeposito } from "@/lib/stock/mapItem";
import {
  condicionesPrisma,
  condicionesSql,
  esEstadoValido,
} from "@/lib/stock/estadosDeStock";

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
    // El estado que viene de tocar una card. Se valida contra la lista del
    // dominio: cualquier otra cosa se ignora en vez de filtrar por un id
    // inventado, que devolvería una lista vacía sin decir por qué.
    const estadoCrudo = searchParams.get("estado");
    const estadoCard = esEstadoValido(estadoCrudo) ? estadoCrudo : null;

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

      // ── EL FILTRO DE LAS CARDS, CON LA MISMA CONDICIÓN QUE EL CONTEO ─────
      //
      // Sale de `lib/stock/estadosDeStock.js`, que es de donde la toma
      // `/api/stock_locales/resumen`. Escribirla acá de nuevo dejaría que el
      // número de la card y el total del listado se separaran sin que nada
      // fallara.
      //
      // Dos de los cuatro comparan columna contra columna —`cantidad <
      // stockMin`— y el `where` de Prisma no lo expresa, así que esos resuelven
      // sus ids por SQL y entran como un `IN`. El conjunto es chico por
      // definición: los productos bajo mínimo o sobre máximo son la excepción.
      // Los otros dos entran directo en la consulta paginada.
      if (estadoCard) {
        const receta = condicionesPrisma()[estadoCard];
        if (receta?.prisma) {
          estadoStockClauses.push(receta.prisma);
        } else {
          const cond = condicionesSql("sl")[estadoCard];
          const filas = await prisma.$queryRawUnsafe(
            `SELECT sl."productoId" AS id
               FROM "StockLocal" sl
              WHERE sl."localId" = $1 AND ${cond}`,
            localId
          );
          const ids = filas.map((f) => Number(f.id));
          // Sin coincidencias, `in: []` deja el listado vacío — que es lo
          // correcto y no "sin filtro".
          estadoStockClauses.push({ id: { in: ids } });
        }
      }

      // WHERE único, compartido por count(), findMany paginado y camino hybrid.
      const whereLocal = {
        localId,
        activo: true,
        ...(estadoStockClauses.length ? { AND: estadoStockClauses } : {}),
        base: {
          activo: true,
          es_combo: false,
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
          // `limitesConfiguradosAt` viaja porque `mapItem` lo necesita para poder
          // decir `limitesConfigurados` sin adivinarlo desde los valores.
          select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
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
      // Regla A: el guard self-healing solo materializa PL de productos que le
      // corresponden al depósito (los suyos + los sin creador). NO sube los
      // creados por un local — esos existen solo en ese local.
      const faltantesBases = await prisma.productoBase.findMany({
        where: {
          grupoId: { in: grupoIds },
          activo: true,
          locales: { none: { localId } },
          ...productoVisibleWhere(localId),
          // Los combos NUNCA reciben ProductoLocal/StockLocal físico.
          es_combo: false,
        },
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
            // stockMin/stockMax en NULL y no en 0: esta fila la está creando el
            // listado al abrirse, no un encargado configurando límites. Con 0,
            // "nunca configurado" y "ajustado en cero" quedaban idénticos — y
            // como acá se crean filas por el solo hecho de MIRAR la pantalla,
            // ésta era la vía que más contaminaba el dato.
            data: nuevos.map((pl) => ({ localId, productoId: pl.id, cantidad: 0, stockMin: null, stockMax: null })),
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

      // El mismo filtro de cards que la rama LOCAL, con la misma condición del
      // dominio. Se repite la llamada, no la regla: si esto se escribiera a mano
      // acá, depósito y local podrían empezar a contestar distinto.
      if (estadoCard) {
        const recetaDepo = condicionesPrisma()[estadoCard];
        if (recetaDepo?.prisma) {
          estadoStockClausesDepo.push(recetaDepo.prisma);
        } else {
          const condDepo = condicionesSql("sl")[estadoCard];
          const filasDepo = await prisma.$queryRawUnsafe(
            `SELECT sl."productoId" AS id
               FROM "StockLocal" sl
              WHERE sl."localId" = $1 AND ${condDepo}`,
            localId
          );
          estadoStockClausesDepo.push({ id: { in: filasDepo.map((f) => Number(f.id)) } });
        }
      }

      const whereDepo = {
        localId,
        activo: true,
        ...(estadoStockClausesDepo.length ? { AND: estadoStockClausesDepo } : {}),
        base: {
          activo: true,
          es_combo: false,
          categoria_id: categoria ? Number(categoria) : undefined,
          area_fisica_id: area ? Number(area) : undefined,
          AND: [baseClauseDepo],
          // Regla A: defensa por si quedara alguna PL cáscara de un producto de
          // local en el depósito — no se lista.
          ...productoVisibleWhere(localId),
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
        // ── `limitesConfiguradosAt` TAMBIÉN ACÁ, Y FALTABA ─────────────────
        //
        // La rama LOCAL ya lo traía y ésta no: `mapStockItemDeposito` lo recibía
        // `undefined`, así que `limitesConfigurados` daba false para TODO el
        // depósito. Consecuencia: cada producto del depósito se dibujaba como
        // "Sin ajustar" aunque tuviera límites, y `faltante` no se disparaba
        // nunca — la card contaba bien pero la lista mentía.
        //
        // No fallaba en ningún lado: un `undefined` en un `!= null` es
        // exactamente igual de válido que un null.
        stock: {
          take: 1,
          select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
        },
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
