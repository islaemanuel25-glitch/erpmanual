import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { defaultModoEnvio, esFiambreFijo as checkFiambreFijo } from "@/lib/conversiones/stock";
import { redondear100 } from "@/lib/precios/redondeo";
import { rankearFuzzy } from "@/lib/productos/busquedaFuzzyProducto";

const FUZZY_CANDIDATE_LIMIT = 10000;
const FUZZY_MIN_LIKE_RESULTS = 3;
const FUZZY_TOP_RESULTS = 10;

/**
 * Búsqueda de productos para el módulo Stock.
 * Misma lógica que pos-ventas/buscar-producto: código exacto primero, luego contains;
 * ranking por relevancia. Permiso stock.ver.
 * No filtra por stock > 0 (en Stock se muestran todos para poder ajustar).
 */
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

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    let localId = Number(searchParams.get("localId") || 0);
    if (!localId) localId = Number(session.localId || 0);
    const fromVoice = searchParams.get("fromVoice") === "true";

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

    const local = await prisma.local.findUnique({
      where: { id: localId },
      select: { es_deposito: true },
    });
    const esDeposito = local?.es_deposito === true;

    // Match exacto por código de barras
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
      const items = mapProductos(exacto, esDeposito);
      return NextResponse.json({ ok: true, items });
    }

    // Búsqueda amplia
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
      take: 30,
    });

    const qLower = q.toLowerCase();
    productos.sort((a, b) => rankScore(a, qLower) - rankScore(b, qLower));

    // Fallback fuzzy para búsqueda por voz: tolera errores de transcripción
    // típicos ("brama" → BRAHMA, "acotar" → COTAR). Solo se activa con
    // fromVoice=true para no afectar la búsqueda manual ni el scanner.
    if (fromVoice && productos.length < FUZZY_MIN_LIKE_RESULTS) {
      const idsActuales = new Set(productos.map((p) => p.id));
      const candidatos = await prisma.productoLocal.findMany({
        where: {
          localId,
          activo: true,
          base: { activo: true },
        },
        select: {
          id: true,
          nombre: true,
          base: { select: { nombre: true, codigo_barra: true } },
        },
        take: FUZZY_CANDIDATE_LIMIT,
        orderBy: { id: "asc" },
      });

      const ranked = rankearFuzzy(candidatos, q, {
        getNombre: (p) => p.nombre || p.base?.nombre || "",
        getCodigo: (p) => p.base?.codigo_barra || null,
        maxDistance: 3,
      });

      const idsFuzzy = ranked
        .map((r) => r.item.id)
        .filter((id) => !idsActuales.has(id))
        .slice(0, FUZZY_TOP_RESULTS);

      if (idsFuzzy.length > 0) {
        const fuzzyFull = await prisma.productoLocal.findMany({
          where: { id: { in: idsFuzzy } },
          include: {
            base: true,
            stock: { where: { localId }, select: { cantidad: true } },
          },
        });
        const orderMap = new Map(idsFuzzy.map((id, idx) => [id, idx]));
        fuzzyFull.sort((a, b) => orderMap.get(a.id) - orderMap.get(b.id));
        productos.push(...fuzzyFull);
      }
    }

    const items = mapProductos(productos.slice(0, 10), esDeposito);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error buscar-producto Stock:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

function rankScore(pl, qLower) {
  const nombre = (pl.nombre || pl.base?.nombre || "").toLowerCase();
  const codigo = (pl.base?.codigo_barra || "").toLowerCase();
  if (codigo === qLower) return 0;
  if (nombre === qLower) return 1;
  if (nombre.startsWith(qLower)) return 2;
  const palabras = nombre.split(/\s+/);
  if (palabras.some((w) => w.startsWith(qLower))) return 3;
  if (nombre.includes(qLower)) return 4;
  return 5;
}

function calcularModoSalida(esDeposito, modoEnvio, unidadMedida) {
  if (!esDeposito) return "UNIDAD";
  const efectivo = modoEnvio || defaultModoEnvio(unidadMedida);
  if (efectivo === "SOLO_UNIDAD") return "UNIDAD";
  return "BULTO";
}

function mapProductos(lista, esDeposito) {
  return lista.map((pl) => {
    const stock = Number(pl.stock?.[0]?.cantidad || 0);
    let unidadMedida = pl.base?.unidad_medida || "unidad";
    const factorPack = Number(pl.base?.factor_pack || 1);
    const modoEnvio = pl.base?.modo_envio || null;

    const fiambreFijo = esDeposito && checkFiambreFijo(pl.base);
    const pesoReferenciaKg = fiambreFijo ? Number(pl.base.pesoReferenciaKg) : 0;

    const precioDB = Number(pl.precio_venta || pl.base?.precio_venta || 0);
    let precioVentaBulto = precioDB;
    let precioVentaUnitario = precioDB;

    if (fiambreFijo) {
      const precioPorPieza = Number((precioDB * pesoReferenciaKg).toFixed(2));
      precioVentaUnitario = precioPorPieza;
      precioVentaBulto = precioPorPieza;
      unidadMedida = "unidad";
    } else if (factorPack > 1 && unidadMedida !== "unidad" && precioDB > 0) {
      precioVentaUnitario = Number((precioDB / factorPack).toFixed(2));
      precioVentaBulto = Number(precioDB.toFixed(2));
    }

    if (pl.base?.redondeo_100 === true && !fiambreFijo) {
      precioVentaUnitario = redondear100(precioVentaUnitario);
    }

    const modoSalidaDefault = fiambreFijo
      ? "UNIDAD"
      : calcularModoSalida(esDeposito, modoEnvio, unidadMedida);

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
      esFiambreFijo: fiambreFijo || false,
      pesoReferenciaKg: fiambreFijo ? pesoReferenciaKg : undefined,
    };
  });
}
