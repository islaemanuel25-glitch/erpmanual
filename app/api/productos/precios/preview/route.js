import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";

function toNumber(value) {
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function roundUpTo100(value) {
  return Math.ceil(value / 100) * 100;
}

function normalizedText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parsePastedRows(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const [codigo, nombre, costo, venta] = line
      .split(/[|;\t]/)
      .map((t) => t?.trim() || "");
    return {
      codigo_barra: codigo || null,
      nombre: nombre || null,
      costoNuevo: toNumber(costo),
      ventaNueva: toNumber(venta),
    };
  });
}

function applyIncrease(base, increase) {
  let next = base;
  if (increase?.kind === "PCT") next = base * (1 + Number(increase.value || 0) / 100);
  if (increase?.kind === "ABS") next = base + Number(increase.value || 0);
  return next;
}

function ruleMatches(producto, rule) {
  const match = rule?.match || {};
  if (match?.categoriaId && Number(match.categoriaId) !== Number(producto.categoria_id)) return false;
  if (match?.nombreIncludes) {
    const n = normalizedText(producto.nombre);
    if (!n.includes(normalizedText(match.nombreIncludes))) return false;
  }
  return true;
}

function buildAlerts({ costoAnterior, costoNuevo, ventaAnterior, ventaNueva }) {
  const alertas = [];
  if (costoNuevo <= 0 || ventaNueva <= 0) alertas.push("precio_en_0");
  if (costoNuevo < costoAnterior || ventaNueva < ventaAnterior) alertas.push("baja");

  const costoDelta = costoAnterior ? Math.abs((costoNuevo - costoAnterior) / costoAnterior) : 0;
  const ventaDelta = ventaAnterior ? Math.abs((ventaNueva - ventaAnterior) / ventaAnterior) : 0;

  if (costoDelta >= 0.4 || ventaDelta >= 0.4) alertas.push("cambio_raro");
  return alertas;
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    
    // Resolver grupoId: session → body.localId → session.localId → contexto cookie
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId) {
      let localId = Number(body?.localId) || 0;
      if (!localId && session.localId) localId = Number(session.localId);
      if (!localId && session.esAdmin) {
        const ctx = getContextoActivo(req, session);
        if (ctx.localId) localId = Number(ctx.localId);
      }
      if (localId) grupoId = await getGrupoIdDeLocal(localId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[precios/preview] CTX:", { sessionGrupoId: session.grupoId, grupoIdResolved: grupoId });
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "Seleccioná un grupo activo para trabajar." },
        { status: 400 }
      );
    }
    const proveedorId = toNumber(body?.proveedorId);
    const pricingMode = body?.pricingMode;
    const metodo = body?.metodo || "AUMENTO";

    // Validación dura (evita proveedorId 0 / null)
    if (proveedorId == null || proveedorId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Seleccioná un proveedor válido." },
        { status: 400 }
      );
    }

    if (!["KEEP_VENTA", "RECALC_BY_MARGIN", "SET_VENTA"].includes(pricingMode)) {
      return NextResponse.json({ ok: false, error: "pricingMode inválido" }, { status: 400 });
    }

    if (!["AUMENTO", "REGLAS", "PEGADO", "MANUAL"].includes(metodo)) {
      return NextResponse.json({ ok: false, error: "metodo inválido" }, { status: 400 });
    }

    const productos = await prisma.productoBase.findMany({
      where: {
        grupoId,
        proveedor_id: proveedorId,
      },
      select: {
        id: true,
        nombre: true,
        codigo_barra: true,
        categoria_id: true,
        precio_costo: true,
        precio_venta: true,
        margen: true,
        redondeo_100: true,
      },
      orderBy: { id: "asc" },
    });

    // ✅ UX: mensaje útil si no hay productos (normalmente es data)
    if (!productos.length) {
      const proveedor = await prisma.proveedor.findFirst({
        where: { id: proveedorId },
        select: { id: true, nombre: true },
      });

      // Chequeos rápidos de diagnóstico (sin romper performance: son 2 count)
      const totalProveedorEnDB = await prisma.productoBase.count({
        where: { proveedor_id: proveedorId },
      });

      const totalGrupoEnDB = await prisma.productoBase.count({
        where: { grupoId },
      });

      const proveedorLabel = proveedor?.nombre ? `${proveedor.nombre} (#${proveedorId})` : `#${proveedorId}`;

      let hint = `No se encontraron productos para el proveedor ${proveedorLabel} en este grupo.`;

      // Si hay productos con ese proveedor en DB, pero no en tu grupo => problema grupoId
      if (totalProveedorEnDB > 0) {
        hint += ` Hay ${totalProveedorEnDB} productos en la DB con proveedor_id=${proveedorId}, pero ninguno coincide con tu grupoId=${grupoId}.`;
      } else {
        // Si no hay ninguno en DB con ese proveedor => proveedor_id no asignado a productos
        hint += ` No hay productos en la DB con proveedor_id=${proveedorId}. Probablemente falta asignar proveedor a los productos.`;
      }

      // Contexto extra: si tu grupo tiene productos en general
      hint += ` (Productos en tu grupoId=${grupoId}: ${totalGrupoEnDB}).`;

      return NextResponse.json({
        ok: true,
        items: [],
        summary: { total: 0, metodo, pricingMode },
        alertas: { criticas: 0, advertencias: 0 },
        hint, // <- esto lo podés mostrar en UI si querés
      });
    }

    const manualMap = new Map(
      (Array.isArray(body?.manualEdits) ? body.manualEdits : []).map((it) => [
        Number(it.productoBaseId),
        it,
      ])
    );
    const rules = Array.isArray(body?.rules) ? body.rules : [];
    const pastedRows = metodo === "PEGADO" ? parsePastedRows(body?.pastedText) : [];

    const pastedByBarcode = new Map();
    const pastedByName = new Map();
    for (const row of pastedRows) {
      if (row.codigo_barra) pastedByBarcode.set(row.codigo_barra, row);
      if (row.nombre) pastedByName.set(normalizedText(row.nombre), row);
    }

    const items = productos.map((p) => {
      const costoAnterior = Number(p.precio_costo);
      const ventaAnterior = Number(p.precio_venta);
      let costoNuevo = costoAnterior;
      let ventaNueva = ventaAnterior;

      if (metodo === "AUMENTO") {
        costoNuevo = applyIncrease(costoAnterior, body?.increase);
      }

      if (metodo === "REGLAS") {
        for (const rule of rules) {
          if (ruleMatches(p, rule)) {
            costoNuevo = applyIncrease(costoNuevo, rule?.increase);
            if (pricingMode === "SET_VENTA" && toNumber(rule?.setVenta) !== null) {
              ventaNueva = Number(rule.setVenta);
            }
          }
        }
      }

      if (metodo === "PEGADO") {
        const byBarcode = p.codigo_barra ? pastedByBarcode.get(p.codigo_barra) : null;
        const byName = pastedByName.get(normalizedText(p.nombre));
        const match = byBarcode || byName;
        if (match) {
          if (match.costoNuevo !== null) costoNuevo = Number(match.costoNuevo);
          if (pricingMode === "SET_VENTA" && match.ventaNueva !== null) {
            ventaNueva = Number(match.ventaNueva);
          }
        }
      }

      if (metodo === "MANUAL") {
        const row = manualMap.get(Number(p.id));
        if (row) {
          if (toNumber(row.costoNuevo) !== null) costoNuevo = Number(row.costoNuevo);
          if (pricingMode === "SET_VENTA" && toNumber(row.ventaNueva) !== null) {
            ventaNueva = Number(row.ventaNueva);
          }
        }
      }

      if (pricingMode === "RECALC_BY_MARGIN") {
        const margen = p.margen === null ? 0 : Number(p.margen);
        ventaNueva = costoNuevo * (1 + margen / 100);
      }

      if (p.redondeo_100) {
        ventaNueva = roundUpTo100(ventaNueva);
      }

      const alertas = buildAlerts({ costoAnterior, costoNuevo, ventaAnterior, ventaNueva });

      return {
        productoBaseId: p.id,
        nombre: p.nombre,
        codigoBarra: p.codigo_barra || null,
        margen: p.margen !== null ? Number(p.margen) : null,
        costoAnterior,
        costoNuevo,
        ventaAnterior,
        ventaNueva,
        alertas,
      };
    });

    const criticas = items.filter((it) => it.alertas.includes("precio_en_0")).length;
    const advertencias = items.filter((it) => it.alertas.length > 0).length;

    return NextResponse.json({
      ok: true,
      items,
      summary: { total: items.length, metodo, pricingMode },
      alertas: { criticas, advertencias },
    });
  } catch (e) {
    console.error("ERROR productos/precios/preview:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
