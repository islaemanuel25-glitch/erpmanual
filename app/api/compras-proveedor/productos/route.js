// app/api/compras-proveedor/productos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { checkPerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const ctx = await resolveLocalAndGrupo(req);
    if (ctx.error) {
      return NextResponse.json(
        { ok: false, error: ctx.error },
        { status: ctx.status }
      );
    }

    // ── A NOMBRE DE QUIÉN SE COMPRA: LA UBICACIÓN QUE OPERA ────────────────
    //
    // Acá se resolvía el depósito del grupo y se usaba para las TRES cosas: qué
    // productos son visibles, de qué ubicación son las filas de ProductoLocal y
    // de qué ubicación es el stock que se muestra. O sea que un local abriendo
    // esta pantalla armaba el pedido del depósito.
    //
    // El efecto medido: un local le ponía su proveedor propio a un producto que
    // él mismo había creado y después ese producto NO APARECÍA en el catálogo
    // del pedido —0 productos—, así que no lo podía comprar. Un producto creado
    // por un local es de ese local, y ese local hace con él lo mismo que el
    // depósito con los suyos: lo edita, le pone proveedor y LO COMPRA.
    //
    // ── LO QUE ESTO NO CAMBIA ──────────────────────────────────────────────
    //
    // La regla asimétrica queda intacta, y es `productoVisibleWhere` quien la
    // sostiene: lo del depósito se ve en los locales, lo del local NO se ve en
    // el depósito. Pasándole la ubicación que opera:
    //
    //   · el LOCAL ve sus productos propios MÁS los del depósito;
    //   · el DEPÓSITO sigue sin ver nada creado por un local.
    //
    // Por eso la frase de abajo —"el depósito no arma pedidos con productos
    // creados por un local"— sigue siendo verdadera y se conserva. Lo que estaba
    // mal era aplicarle ese mismo recorte AL LOCAL sobre lo suyo.
    //
    // Y para el depósito no cambia NADA: operando desde ahí, `localId` ES el
    // depósito, así que las tres consultas quedan idénticas a las de antes.
    const { grupoId, localId, session } = ctx;
    const ubicacionDelPedido = Number(localId);

    const perm = checkPerm(session, "compras.ver");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const url = new URL(req.url);
    const proveedorId = Number(url.searchParams.get("proveedorId") || 0);
    const search = (url.searchParams.get("search") || "").trim();

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    // ── EL DEPÓSITO DEL GRUPO YA NO HACE FALTA ACÁ ────────────────────────
    //
    // Se resolvía con un `grupoDeposito.findFirst` propio —no con
    // `getDepositoIdDeGrupo`, que es la función del repo para esto— solo para
    // usarlo como ubicación del pedido. Ahora la ubicación es la que opera, así
    // que la consulta no tiene consumidor y se va con ella el 400 "No se
    // encontró depósito para el grupo": un grupo sin depósito configurado deja
    // de impedir que un local le compre a su proveedor, que es una consecuencia
    // directa de comprar a nombre propio y no del depósito.

    // Vínculos activos de códigos internos para este proveedor (Etapa 4).
    // Amplían el universo comprable y permiten buscar por código interno.
    // No alteran de qué ubicación salen las filas de ProductoLocal.
    const vinculos = await prisma.productoCodigoProveedor.findMany({
      where: { grupoId, proveedorId, activo: true },
      select: {
        productoBaseId: true,
        codigoInterno: true,
        descripcionProveedor: true,
        productoBase: { select: { nombre: true } },
      },
    });
    const baseIdsVinculados = [...new Set(vinculos.map((v) => v.productoBaseId))];

    // Código interno del proveedor por base (el primero si hubiera más de uno).
    // Solo para mostrar como columna; no afecta la búsqueda ni la resolución.
    const codigoInternoPorBase = new Map();
    const vinculosPorBase = new Map();
    for (const v of vinculos) {
      if (!codigoInternoPorBase.has(v.productoBaseId)) {
        codigoInternoPorBase.set(v.productoBaseId, v.codigoInterno);
      }
      if (!vinculosPorBase.has(v.productoBaseId)) vinculosPorBase.set(v.productoBaseId, []);
      vinculosPorBase.get(v.productoBaseId).push({
        codigoInterno: v.codigoInterno,
        descripcionProveedor: v.descripcionProveedor || null,
      });
    }

    // Match por código interno del proveedor.
    // Se normaliza a SOLO dígitos (quita espacios, guiones y no-numéricos) para
    // tolerar formatos del proveedor (ej. "10-023456" vs "10023456").
    // Exacto o por SUFIJO: algunos proveedores informan el código sin el prefijo
    // que tenemos cargado (ej. ERP "10023456", proveedor manda "23456"). El sufijo
    // se permite solo con query >= 4 dígitos para evitar falsos positivos (ej. "56").
    // Acotado a los vínculos del proveedor seleccionado → no afecta otros proveedores.
    const normalizeCodigoInterno = (value) =>
      String(value || "").trim().toLowerCase().replace(/\D/g, "");
    const query = normalizeCodigoInterno(search);
    const matchCodigo = query
      ? vinculos.filter((v) => {
          const code = normalizeCodigoInterno(v.codigoInterno);
          return (
            !!code &&
            (code === query || (query.length >= 4 && code.endsWith(query)))
          );
        })
      : [];
    const baseIdsMatchCodigo = [...new Set(matchCodigo.map((v) => v.productoBaseId))];

    // Universo comprable: proveedor 1/2/3 + bases vinculadas por código interno.
    const baseWhere = {
      grupoId,
      activo: true,
      // ── UNA SOLA DEFINICIÓN DE "QUÉ SE LE COMPRA A ESTE PROVEEDOR" ────
      //
      // Acá estaban las tres relaciones escritas de nuevo, al lado de
      // `productoDelProveedorWhere`, que es la que usa la cascada de vínculo y
      // la conciliación de listas. Dos copias no se rompen el día que se
      // escriben: se rompen el día que una cambia. Ahora es la misma función.
      //
      // Lo que se SUMA acá y no está allá son los productos que este proveedor
      // ya nombró con un código interno: son suyos aunque nadie haya llenado la
      // relación, y esta pantalla los tiene que poder ofrecer. Va explícito
      // para que se vea que es un agregado y no otra definición.
      OR: [
        ...productoDelProveedorWhere(proveedorId).OR,
        ...(baseIdsVinculados.length ? [{ id: { in: baseIdsVinculados } }] : []),
      ],
      // Regla A, con la ubicación que opera: el depósito no arma pedidos con
      // productos creados por un local —eso sigue igual— y un local sí arma el
      // suyo con los propios, además de los del depósito.
      ...productoVisibleWhere(ubicacionDelPedido),
      // Los combos no se compran a proveedor: se compran sus componentes.
      es_combo: false,
    };

    if (search) {
      baseWhere.AND = [
        {
          OR: [
            { nombre: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { codigo_barra: { contains: search, mode: "insensitive" } },
            { codigo_barra_secundario: { contains: search, mode: "insensitive" } },
            ...(baseIdsMatchCodigo.length ? [{ id: { in: baseIdsMatchCodigo } }] : []),
          ],
        },
      ];
    }

    const productosLocal = await prisma.productoLocal.findMany({
      where: {
        // Las filas de la ubicación que compra: son las que tienen SU costo y
        // SU estado. Con las del depósito, un local veía precios y activaciones
        // que no son los suyos.
        localId: ubicacionDelPedido,
        activo: true,
        base: baseWhere,
      },
      include: {
        base: {
          select: {
            id: true,
            nombre: true,
            sku: true,
            codigo_barra: true,
            codigo_barra_secundario: true,
            categoria: { select: { id: true, nombre: true } },
            unidad_medida: true,
            factor_pack: true,
            modo_pedido: true,
            precio_costo: true,
            precio_venta: true,
            modoCompraProveedor: true,
            pesoReferenciaKg: true,
            pesoEsFijo: true,
            pesoPromedioKg: true,
            actualizaPromedioPorRecepcion: true,
          },
        },
        stock: {
          // Y el stock que se muestra para decidir cuánto pedir es el de quien
          // pide. Mostrarle a un local lo que hay en el depósito lo haría pedir
          // sobre un número que no es el suyo.
          where: { localId: ubicacionDelPedido },
          select: {
            cantidad: true,
            stockMin: true,
            stockMax: true,
          },
        },
      },
      orderBy: { base: { nombre: "asc" } },
      // Rediseño Nuevo pedido: el catálogo se arma en una sola pantalla, así que
      // hay que poder mostrar pedidos grandes (100-300 productos) sin paginar.
      take: 1000,
    });

    const items = productosLocal.map((pl) => {
      const st = pl.stock[0] || null;
      const cantidadRaw = Number(st?.cantidad ?? 0);
      const stockMinRaw = st?.stockMin != null ? Number(st.stockMin) : null;
      const stockMaxRaw = st?.stockMax != null ? Number(st.stockMax) : null;

      const sinParametros = stockMinRaw == null || stockMaxRaw == null;
      const factorPack = Number(pl.base.factor_pack) || 1;
      const modoCompra = pl.base.modoCompraProveedor || "BULTO";

      // En depósito el stock se guarda en UNIDADES (igual que en reposición).
      // Para BULTO (pack/cajón) debemos expresar todo en bultos en esta pantalla,
      // sin tocar kg/fiambre (modoCompra UNIDAD).
      let stockActual = cantidadRaw;
      let stockMin = stockMinRaw;
      let stockMax = stockMaxRaw;
      let faltante = 0;
      let sugerido = 0;
      let pesoRefKg = null;

      if (modoCompra === "UNIDAD") {
        // FIAMBRE: stock en KG, pedido en unidades (piezas). No tocar.
        faltante = sinParametros ? 0 : Math.max(0, (stockMax ?? 0) - stockActual);

        const pesoRef = Number(pl.base.pesoReferenciaKg || 0);
        const pesoProm = Number(pl.base.pesoPromedioKg || 0);
        pesoRefKg = pl.base.pesoEsFijo ? pesoRef : (pesoProm || pesoRef || 1);

        sugerido = faltante > 0 ? Math.ceil(faltante / pesoRefKg) : 0;
      } else {
        // BULTO (pack/cajón): DB tiene cantidad/stockMin/stockMax en UNIDADES.
        // Convertir a bultos para mostrar y calcular (igual que en reposición).
        if (factorPack > 1) {
          stockActual = Math.floor(cantidadRaw / factorPack);
          stockMin = stockMinRaw != null ? Math.floor(stockMinRaw / factorPack) : null;
          stockMax = stockMaxRaw != null ? Math.floor(stockMaxRaw / factorPack) : null;
        }
        faltante = sinParametros ? 0 : Math.max(0, (stockMax ?? 0) - stockActual);
        sugerido = faltante;
      }

      const bajoMin = !sinParametros && stockActual < (stockMin ?? 0);

      return {
        productoLocalId: pl.id,
        baseId: pl.base.id,
        nombre: pl.base.nombre,
        sku: pl.base.sku,
        codigo_barra: pl.base.codigo_barra,
        codigo_barra_secundario: pl.base.codigo_barra_secundario || null,
        codigoInterno: codigoInternoPorBase.get(pl.base.id) || null,
        codigosInternos: (vinculosPorBase.get(pl.base.id) || []).map((v) => v.codigoInterno),
        aliasesProveedor: vinculosPorBase.get(pl.base.id) || [],
        categoriaId: pl.base.categoria?.id ?? null,
        categoriaNombre: pl.base.categoria?.nombre ?? null,
        unidad_medida: pl.base.unidad_medida,
        factor_pack: factorPack,
        modoCompra,
        precio_costo: pl.base.precio_costo,
        precio_venta: pl.base.precio_venta,
        stockActual,
        stockMin,
        stockMax,
        faltante,
        sugerido,
        sinParametros,
        bajoMin,
        pesoRefKg,
        pesoEsFijo: pl.base.pesoEsFijo ?? false,
        pesoReferenciaKg: pl.base.pesoReferenciaKg ? Number(pl.base.pesoReferenciaKg) : null,
        pesoPromedioKg: pl.base.pesoPromedioKg ? Number(pl.base.pesoPromedioKg) : null,
      };
    });

    // Priorizar arriba los que matchean exacto por código interno (Etapa 4).
    // sort es estable: dentro de cada grupo se preserva el orden por nombre.
    if (baseIdsMatchCodigo.length) {
      const prioridad = new Set(baseIdsMatchCodigo);
      items.sort(
        (a, b) => (prioridad.has(a.baseId) ? 0 : 1) - (prioridad.has(b.baseId) ? 0 : 1)
      );
    }

    // Códigos internos que matchean pero cuyo ProductoBase no tiene ProductoLocal
    // habilitado en el depósito: no se agregan, se informan (Etapa 4).
    const baseIdsEnDeposito = new Set(items.map((it) => it.baseId));
    const codigosSinDeposito = matchCodigo
      .filter((v) => !baseIdsEnDeposito.has(v.productoBaseId))
      .map((v) => ({ codigoInterno: v.codigoInterno, nombre: v.productoBase?.nombre ?? null }));

    return NextResponse.json({ ok: true, items, codigosSinDeposito });
  } catch (err) {
    console.error("Error compras-proveedor/productos:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
