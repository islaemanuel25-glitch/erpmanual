import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { declararOrigenDeStock, ORIGEN_STOCK } from "@/lib/stock/libro/libroStock";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { mapStockItemLocal, mapStockItemDeposito } from "@/lib/stock/mapItem";
import { buscarProductoLocalPorCodigo } from "@/lib/productos/busquedaCodigoBarra";
// Búsqueda de texto de stock (nombre / código de barras / secundario). La
// comparte el Control de stock.
import { buildTextOR } from "@/lib/stock/busquedaStock";
// La búsqueda por texto de la caja: la usa el Control de stock.
import { SELECT_CANDIDATO_DE_BUSQUEDA, rankearComoLaCaja } from "@/lib/productos/busquedaComoLaCaja";
// Qué productos lista Stock: lo comparte el Control de stock.
import { whereUniversoStock } from "@/lib/stock/universoStock";
import { listadoDelControl } from "@/lib/stock/control/controlStockServer";
import {
  condicionesPrisma,
  condicionesSql,
  esEstadoValido,
} from "@/lib/stock/estadosDeStock";

const PAGE_SIZE = 25;

// ── UN CÓDIGO ESCANEADO O TIPEADO SE RESUELVE COMO EN LA CAJA ───────────────
//
// `buildTextOR` mira los dos códigos globales de la base y no ve el código PROPIO
// que el local le agrega a un producto del depósito (vive en ProductoLocal): la
// caja lo leía y Stock no lo encontraba. Si `q` es un código que el buscador del
// POS reconoce en este local, el listado es ese producto y nada más —con los
// filtros de la pantalla encima—; si no, sigue la búsqueda de texto de siempre.
// El propio de otro local no cuenta, y un propio gana sobre un global igual.
async function getProductoLocalIdPorCodigo(localId, q) {
  if (!q) return null;
  const pl = await buscarProductoLocalPorCodigo(prisma, { localId, codigo: q, consulta: { select: { id: true } } });
  return pl?.id ?? null;
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

    // ── EL CONTROL DE STOCK USA ESTE MISMO LISTADO ──────────────────────────
    //
    // Con `?control=`, el chip del control filtra encima de los filtros de
    // siempre —sin contar, contados, con diferencia; `todos` no filtra— y cada
    // ítem trae su conteo. Sin el parámetro, el listado es el de siempre.
    const ctrl = searchParams.has("control")
      ? await listadoDelControl({ localId, esDeposito, filtro: searchParams.get("control") })
      : null;
    const responder = async (items, total, totalPages, lecturaControl = null) =>
      NextResponse.json({
        ok: true,
        items: ctrl ? await ctrl.enriquecer(items) : items,
        total,
        totalPages,
        ...(ctrl ? { resumenControl: ctrl.resumen, lecturaControl } : {}),
      });

    // ── EN EL CONTROL, EL BUSCADOR ES EL DE LA CAJA ──────────────────────────
    //
    // Un código del local —propio, principal o secundario, con la misma
    // resolución que la caja (`buscarProductoLocalPorCodigo`)— muestra SOLO ese
    // producto, sin el chip encima. Una lectura del lector (`lectura=1`) que no
    // es de ningún producto del local deja la lista vacía y lo dice. El texto se
    // busca con `rankearComoLaCaja` y sale en su orden. Sin `control`, Stock
    // Locales busca como siempre.
    const lectura = searchParams.get("lectura") === "1";
    const conBuscadorDeCaja = Boolean(ctrl && q);
    const listarComoLaCaja = async ({ where, include, mapear }) => {
      const candidatos = await prisma.productoLocal.findMany({ where, select: SELECT_CANDIDATO_DE_BUSQUEDA });
      const ids = rankearComoLaCaja(candidatos, q).map((r) => r.item.id);
      const filas = ids.length ? await prisma.productoLocal.findMany({ where: { id: { in: ids } }, include }) : [];
      const orden = new Map(ids.map((id, i) => [id, i]));
      filas.sort((a, b) => orden.get(a.id) - orden.get(b.id));
      let mapeados = filas.map(mapear);
      if (faltantes) mapeados = mapeados.filter((p) => p.faltante);
      const total = mapeados.length;
      return responder(mapeados.slice(offset, offset + PAGE_SIZE), total, Math.max(1, Math.ceil(total / PAGE_SIZE)));
    };

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
      const plIdPorCodigo = await getProductoLocalIdPorCodigo(localId, q);
      if (conBuscadorDeCaja && !plIdPorCodigo && lectura) return responder([], 0, 1, { codigoSinProducto: q });
      let baseClause;
      if (plIdPorCodigo || conBuscadorDeCaja) {
        baseClause = proveedorBaseFilter;
      } else if (q) {
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
      // Un código en el control muestra ese producto aunque el chip no lo incluya.
      if (ctrl?.clausula && !plIdPorCodigo) estadoStockClauses.push(ctrl.clausula);

      const universoLocal = whereUniversoStock(localId, false);
      const whereLocal = {
        ...universoLocal,
        ...(plIdPorCodigo ? { id: plIdPorCodigo } : {}),
        ...(estadoStockClauses.length ? { AND: estadoStockClauses } : {}),
        base: {
          ...universoLocal.base,
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
        // La fila de ESTE local: `StockLocal` es único por (local, producto), no
        // por producto, y con `take: 1` solo se podía mostrar otra fila que la
        // que ajustan el control y Ajustar.
        stock: {
          where: { localId },
          take: 1,
          // `limitesConfiguradosAt` viaja porque `mapItem` lo necesita para poder
          // decir `limitesConfigurados` sin adivinarlo desde los valores.
          select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
        },
      };

      // Orden movido a DB. Acepta variación menor de collation respecto al
      // localeCompare("es") JS anterior (aceptado explícitamente).
      const orderByLocal = { base: { nombre: "asc" } };

      if (plIdPorCodigo && ctrl) {
        const rows = await prisma.productoLocal.findMany({ where: whereLocal, include: includeLocal });
        const items = rows.map((p) => mapStockItemLocal(p, p.base, p.stock?.[0]));
        return responder(items, items.length, 1, { porCodigo: plIdPorCodigo });
      }
      if (conBuscadorDeCaja) {
        return listarComoLaCaja({ where: whereLocal, include: includeLocal, mapear: (p) => mapStockItemLocal(p, p.base, p.stock?.[0]) });
      }

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
        return responder(items, total, totalPages);
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
      return responder(items, total, totalPages);
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
          // Una sola sentencia, envuelta solo para decirle al Libro de Stock de
          // dónde vienen estas filas en cero. No cambia qué se escribe.
          await prisma.$transaction(async (tx) => {
            await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.ALTA_AL_LISTAR_STOCK, referencia: String(localId) });
            await tx.stockLocal.createMany({
              // stockMin/stockMax en NULL y no en 0: esta fila la está creando el
              // listado al abrirse, no un encargado configurando límites. Con 0,
              // "nunca configurado" y "ajustado en cero" quedaban idénticos — y
              // como acá se crean filas por el solo hecho de MIRAR la pantalla,
              // ésta era la vía que más contaminaba el dato.
              data: nuevos.map((pl) => ({ localId, productoId: pl.id, cantidad: 0, stockMin: null, stockMax: null })),
              skipDuplicates: true,
            });
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
      const plIdPorCodigoDepo = await getProductoLocalIdPorCodigo(localId, q);
      if (conBuscadorDeCaja && !plIdPorCodigoDepo && lectura) return responder([], 0, 1, { codigoSinProducto: q });
      let baseClauseDepo;
      if (plIdPorCodigoDepo || conBuscadorDeCaja) {
        baseClauseDepo = proveedorBaseFilterDepo;
      } else if (q) {
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

      if (ctrl?.clausula && !plIdPorCodigoDepo) estadoStockClausesDepo.push(ctrl.clausula);

      // Regla A, adentro del universo: defensa por si quedara alguna PL cáscara
      // de un producto de local en el depósito — no se lista.
      const universoDepo = whereUniversoStock(localId, true);
      const whereDepo = {
        ...universoDepo,
        ...(plIdPorCodigoDepo ? { id: plIdPorCodigoDepo } : {}),
        ...(estadoStockClausesDepo.length ? { AND: estadoStockClausesDepo } : {}),
        base: {
          ...universoDepo.base,
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
        // La fila del depósito, no una cualquiera: ver la rama LOCAL.
        stock: {
          where: { localId },
          take: 1,
          select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
        },
      };

      const orderByDepo = { base: { nombre: "asc" } };

      if (plIdPorCodigoDepo && ctrl) {
        const rows = await prisma.productoLocal.findMany({ where: whereDepo, include: includeDepo });
        const items = rows.map((p) => mapStockItemDeposito(p, p.base, p.stock?.[0], localId));
        return responder(items, items.length, 1, { porCodigo: plIdPorCodigoDepo });
      }
      if (conBuscadorDeCaja) {
        return listarComoLaCaja({ where: whereDepo, include: includeDepo, mapear: (p) => mapStockItemDeposito(p, p.base, p.stock?.[0], localId) });
      }

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
        return responder(items, total, totalPages);
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
      return responder(items, total, totalPages);
    }
  } catch (err) {
    console.error("❌ ERROR STOCK LISTAR:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
