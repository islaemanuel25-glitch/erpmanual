// app/api/compras-proveedor/crear/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { esComboBase } from "@/lib/combos/guards";
import { aliasesDeImportacion } from "@/lib/compras-proveedor/importacion/aliases";
import { persistirIdentidad } from "@/lib/proveedores/identidad/persistirIdentidad";

export async function POST(req) {
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

    const body = await req.json();
    const { proveedorId, notas, items } = body;

    if (!proveedorId) {
      return NextResponse.json(
        { ok: false, error: "proveedorId requerido" },
        { status: 400 }
      );
    }

    // depositoId = SIEMPRE el depósito del grupo (referencia); NUNCA del body. El
    // DESTINO de stock lo fija creadoEnLocalId (contexto autorizado), abajo.
    const gd = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });
    if (!gd) {
      return NextResponse.json(
        { ok: false, error: "No se encontró depósito para el grupo" },
        { status: 400 }
      );
    }
    const depId = gd.localId;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Debe incluir al menos un producto" },
        { status: 400 }
      );
    }

    // Validar cantidades: entero finito >= 1
    for (const it of items) {
      const c = Number(it.cantidad);
      if (!Number.isFinite(c) || !Number.isInteger(c) || c < 1) {
        return NextResponse.json(
          { ok: false, error: `cantidad debe ser un entero >= 1 (productoLocalId: ${it.productoLocalId})` },
          { status: 400 }
        );
      }
      if (!["BULTO", "UNIDAD"].includes(it.unidad || "BULTO")) {
        return NextResponse.json(
          { ok: false, error: `unidad inválida (productoLocalId: ${it.productoLocalId})` },
          { status: 400 }
        );
      }
      if (it.precioCosto !== null && it.precioCosto !== undefined && it.precioCosto !== "") {
        const costo = Number(it.precioCosto);
        if (!Number.isFinite(costo) || costo < 0) {
          return NextResponse.json(
            { ok: false, error: `precioCosto inválido (productoLocalId: ${it.productoLocalId})` },
            { status: 400 }
          );
        }
      }
    }

    // Validar proveedor
    const proveedor = await prisma.proveedor.findUnique({
      where: { id: Number(proveedorId) },
    });
    if (!proveedor) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const ids = [...new Set(items.map((item) => Number(item.productoLocalId)))];
    if (ids.length !== items.length || ids.some((id) => !Number.isInteger(id) || id < 1)) {
      return NextResponse.json(
        { ok: false, error: "Hay productos repetidos o inválidos." },
        { status: 400 }
      );
    }

    // Los combos no se compran a proveedor: se compran sus componentes. Los
    // productos salen del depósito autorizado; un id de otro local en el cuerpo
    // no puede crear una línea ni una memoria de proveedor fuera de alcance.
    const productosLocales = await prisma.productoLocal.findMany({
      where: { id: { in: ids }, localId: depId, activo: true },
      select: { id: true, baseId: true, base: { select: { id: true, es_combo: true } } },
    });
    if (productosLocales.length !== ids.length || productosLocales.some((pl) => esComboBase(pl.base))) {
      return NextResponse.json(
        { ok: false, error: "Uno de los productos no pertenece al depósito o no se puede comprar." },
        { status: 400 }
      );
    }

    const productosPorLocal = new Map(productosLocales.map((p) => [p.id, p]));
    const aliases = aliasesDeImportacion({
      items,
      productosPorLocal,
      grupoId,
      proveedorId: Number(proveedorId),
      // Quién firma, para los renglones donde una persona eligió el producto.
      // El servidor pone el usuario y la hora: el cuerpo no puede declarar que
      // lo confirmó otro ni cuándo.
      confirmadaPorUsuarioId: session.id,
      confirmadaEn: new Date(),
    });

    const pedido = await prisma.$transaction(async (tx) => {
      const creado = await tx.pedidoProveedor.create({
        data: {
          grupoId,
          depositoId: depId,
          // Ubicación DUEÑA del pedido = contexto activo (server-authoritative,
          // no del body). Aísla la compra a la ubicación que la creó.
          creadoEnLocalId: localId,
          proveedorId: Number(proveedorId),
          notas: notas || null,
          creadoPorId: session.id,
          detalles: {
            create: items.map((it) => ({
              productoLocalId: Number(it.productoLocalId),
              cantidad: Number(it.cantidad || 1),
              unidad: it.unidad || "BULTO",
              precioCosto:
                it.precioCosto === null || it.precioCosto === undefined || it.precioCosto === ""
                  ? null
                  : Number(it.precioCosto),
            })),
          },
        },
        include: {
          detalles: {
            include: {
              producto: {
                include: {
                  base: {
                    select: {
                      id: true,
                      nombre: true,
                      factor_pack: true,
                      modoCompraProveedor: true,
                      unidad_medida: true,
                    },
                  },
                },
              },
            },
          },
          proveedor: { select: { id: true, nombre: true } },
          deposito: { select: { id: true, nombre: true } },
        },
      });

      // La memoria del proveedor la escribe UNA sola pieza, compartida con
      // Listas de precios. No es un upsert ciego: respeta lo que una persona
      // confirmó y no deja que una deducción lo pise.
      await persistirIdentidad(tx, aliases);
      return creado;
    });

    // Acá se propagaba el costo de cada línea al costo maestro del producto.
    //
    // YA NO. Un pedido registra lo que se le está por pagar al proveedor; no es
    // el lugar donde se decide cuánto vale el producto en el catálogo. Toda
    // edición de un dato del producto —precio, código, lo que sea— se hace desde
    // editar producto, y desde la línea del pedido hay un botón que lleva ahí y
    // vuelve.
    //
    // El caso que motivaba la propagación —el proveedor canta un aumento
    // mientras se arma el pedido— se resuelve ahora abriendo el producto,
    // cambiándole el costo y volviendo: la línea toma el costo nuevo y el
    // catálogo queda actualizado de forma explícita, no como efecto lateral de
    // haber cargado un pedido.
    //
    // `PedidoProveedorDetalle.precioCosto` SIGUE guardándose: es lo que se pidió
    // y a qué precio. Lo que desapareció es que eso reescriba `ProductoBase` y
    // los overrides de todas las ubicaciones.
    //
    // ── O ENTRA TODO O NO ENTRA NADA ──────────────────────────────────────────
    //
    // El pedido y los alias confirmados se guardan en LA MISMA transacción. Si
    // falla cualquiera, no queda un borrador sin memoria ni una memoria sin el
    // borrador que la justificó.
    //
    // Antes NO era así. El pedido se creaba acá y después un bucle propagaba el
    // costo línea por línea, sin transacción: si fallaba en la tercera de cinco,
    // el pedido existía, dos productos ya tenían el costo nuevo, y la respuesta
    // decía "Error interno al crear pedido". Quien lo veía asumía que no había
    // pasado nada.
    //
    // Si alguna vez se agrega otra escritura, entra en esta misma transacción o
    // el mensaje vuelve a mentir.

    return NextResponse.json({ ok: true, item: pedido });
  } catch (err) {
    console.error("Error compras-proveedor/crear:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear pedido" },
      { status: 500 }
    );
  }
}
