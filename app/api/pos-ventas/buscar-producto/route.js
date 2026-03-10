import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { defaultModoEnvio } from "@/lib/conversiones/stock";
import { redondear100 } from "@/lib/precios/redondeo";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos.usar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    let localId = Number(searchParams.get("localId") || 0);

    if (!localId) localId = Number(session.localId || 0);

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    if (!session.esAdmin && localId !== Number(session.localId)) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para este local" },
        { status: 403 }
      );
    }

    if (!q) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Obtener si el local es depósito (una sola query, cacheable)
    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = local?.es_deposito === true;

    // Leer config de stock negativo desde DB
    const grupoId = await getGrupoIdDeLocal(localId);
    let allowNegativeStock = false;
    if (grupoId) {
      const configGrupo = await prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { allowNegativeStock: true },
      });
      allowNegativeStock = configGrupo?.allowNegativeStock === true;
    }

    // Prioridad: match exacto por codigo_barra
    const exacto = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { codigo_barra: q, activo: true },
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 1,
    });

    if (exacto.length > 0) {
      const items = mapProductos(exacto, esDeposito, allowNegativeStock);
      return NextResponse.json({ ok: true, items });
    }

    // Busqueda por nombre (LIKE)
    const productos = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { activo: true },
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { base: { nombre: { contains: q, mode: "insensitive" } } },
          { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 10,
    });

    const items = mapProductos(productos, esDeposito, allowNegativeStock);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error buscar-producto POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

/**
 * Calcula modoSalidaDefault para un producto dado el contexto.
 *
 * - Local normal → siempre UNIDAD (vende unitario al público)
 * - Depósito → según modo_envio configurado del producto:
 *     SOLO_BULTO  → BULTO
 *     MIXTO       → BULTO  (default conservador para depósito)
 *     SOLO_UNIDAD → UNIDAD
 *     null        → usa defaultModoEnvio(unidadMedida) y aplica la misma lógica
 */
function calcularModoSalida(esDeposito, modoEnvio, unidadMedida) {
  if (!esDeposito) return "UNIDAD";

  const efectivo = modoEnvio || defaultModoEnvio(unidadMedida);
  if (efectivo === "SOLO_UNIDAD") return "UNIDAD";
  // SOLO_BULTO y MIXTO → default BULTO en depósito
  return "BULTO";
}

function mapProductos(lista, esDeposito, allowNegativeStock = false) {
  return lista
    .map((pl) => {
      const stock = Number(pl.stock?.[0]?.cantidad || 0);
      const unidadMedida = pl.base?.unidad_medida || "unidad";
      const factorPack = Number(pl.base?.factor_pack || 1);
      const modoEnvio = pl.base?.modo_envio || null;

      // precio_venta en DB: precio tal como está cargado (puede ser bulto o unitario según el producto)
      const precioDB = Number(pl.precio_venta || pl.base?.precio_venta || 0);

      // Calcular ambos precios
      let precioVentaBulto = precioDB;
      let precioVentaUnitario = precioDB;

      if (factorPack > 1 && unidadMedida !== "unidad" && precioDB > 0) {
        // DB guarda precio del bulto → derivar unitario
        precioVentaUnitario = Number((precioDB / factorPack).toFixed(2));
        precioVentaBulto = Number(precioDB.toFixed(2));
      }

      // Misma regla que stock_locales/listar: redondeo a 100 hacia arriba (helper compartido)
      if (pl.base?.redondeo_100 === true) {
        precioVentaUnitario = redondear100(precioVentaUnitario);
      }

      const modoSalidaDefault = calcularModoSalida(esDeposito, modoEnvio, unidadMedida);

      // precioVenta = el precio que corresponde según el modo de salida default
      const precioVenta = modoSalidaDefault === "BULTO"
        ? precioVentaBulto
        : precioVentaUnitario;

      return {
        productoBaseId: pl.baseId,
        productoLocalId: pl.id,
        nombre: pl.nombre || pl.base?.nombre || "",
        codigoBarra: pl.base?.codigo_barra || "",
        precioVenta: Number(precioVenta.toFixed(2)),
        precioVentaUnitario,
        precioVentaBulto,
        precioCosto: Number(pl.precio_costo || pl.base?.precio_costo || 0),
        stock,
        unidadMedida,
        factorPack,
        modoEnvio,
        modoSalidaDefault,
      };
    })
    .filter((p) => p.stock > 0 || allowNegativeStock);
}
