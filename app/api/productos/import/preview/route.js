import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { getContextoActivo } from "@/lib/contexto";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

const UNIDADES_VALIDAS = ["unidad", "pack", "cajon", "kg"];

// ── helpers ──────────────────────────────────────────────
function normStr(v) {
  return (v == null ? "" : String(v)).trim();
}

function normLower(v) {
  return normStr(v).toLowerCase();
}

function parseDecimal(v) {
  if (v == null || v === "") return NaN;
  const n = Number(String(v).replace(",", "."));
  return n;
}

function parseBool(v) {
  if (v === undefined || v === null || v === "") return true;
  const s = normLower(v);
  return s === "si" || s === "sí" || s === "true" || s === "1";
}

// ─────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.importar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json();
    const { modo, productos } = body;

    // Resolver localId: body → session.localId → cookie contexto
    let localId = Number(body.localId) || 0;
    if (!localId && session.localId) {
      localId = Number(session.localId);
    }
    if (!localId && session.esAdmin) {
      const ctx = getContextoActivo(req, session);
      if (ctx.localId) localId = Number(ctx.localId);
    }
    if (!localId) {
      return NextResponse.json({ ok: false, error: "Selecciona un local de trabajo" }, { status: 400 });
    }

    // Resolver grupoId: session (solo admin con cookie grupo) → derivar de localId
    let grupoId = Number(session.grupoId) || 0;
    if (!grupoId) {
      grupoId = await getGrupoIdDeLocal(localId);
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[import/preview]", { localId, grupoId, sessionGrupoId: session.grupoId, esAdmin: session.esAdmin });
    }

    if (!grupoId) {
      return NextResponse.json({ ok: false, error: "No se pudo determinar el grupo del local seleccionado" }, { status: 400 });
    }

    if (!modo || !["crear", "actualizar", "crear_actualizar"].includes(modo)) {
      return NextResponse.json({ ok: false, error: "Modo de importación inválido" }, { status: 400 });
    }

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json({ ok: false, error: "No se recibieron productos" }, { status: 400 });
    }

    // ══════════════════════════════════════════════════════
    // 0. Validar columnas obligatorias en la primera fila
    // ══════════════════════════════════════════════════════
    const COLUMNAS_OBLIGATORIAS = ["codigo_barra", "nombre", "precio_costo", "precio_venta"];
    const columnasRecibidas = Object.keys(productos[0] || {});
    const faltantes = COLUMNAS_OBLIGATORIAS.filter((c) => !columnasRecibidas.includes(c));
    if (faltantes.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Columnas obligatorias faltantes: ${faltantes.join(", ")}` },
        { status: 400 }
      );
    }

    // ══════════════════════════════════════════════════════
    // 1. Cargar catálogos para resolución por nombre
    // ══════════════════════════════════════════════════════
    const [categorias, proveedores, areas] = await Promise.all([
      prisma.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.areaFisica.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    ]);

    const catMap = new Map(categorias.map((c) => [c.nombre.toLowerCase().trim(), c.id]));
    const provMap = new Map(proveedores.map((p) => [p.nombre.toLowerCase().trim(), p.id]));
    const areaMap = new Map(areas.map((a) => [a.nombre.toLowerCase().trim(), a.id]));

    // ══════════════════════════════════════════════════════
    // 2. Cargar productos existentes del grupo por codigo_barra
    // ══════════════════════════════════════════════════════
    const existentes = await prisma.productoBase.findMany({
      where: { grupoId },
      select: { id: true, codigo_barra: true, nombre: true },
    });

    const existentesPorCodigo = new Map();
    for (const p of existentes) {
      if (p.codigo_barra) {
        existentesPorCodigo.set(p.codigo_barra.trim(), p);
      }
    }

    // ══════════════════════════════════════════════════════
    // 3. Normalizar + Validar + Deduplicar
    // ══════════════════════════════════════════════════════
    const items = [];
    const codigosVistos = new Map(); // codigo_barra → fila (para dedup intra-archivo)
    let crear = 0;
    let actualizar = 0;
    let errores = 0;

    for (let i = 0; i < productos.length; i++) {
      const row = productos[i];
      const fila = i + 2; // fila 1 = header
      const erroresArr = [];

      // ── Normalizar campos ──
      const codigoBarra = normStr(row.codigo_barra);
      const nombre = normStr(row.nombre);
      const unidadMedida = normLower(row.unidad_medida) || "unidad";
      const precioCosto = parseDecimal(row.precio_costo);
      const precioVenta = parseDecimal(row.precio_venta);
      const factorPackRaw = row.factor_pack != null && row.factor_pack !== "" ? Number(row.factor_pack) : null;
      const margenRaw = row.margen != null && row.margen !== "" ? parseDecimal(row.margen) : null;
      const stockActual = row.stock_inicial != null && row.stock_inicial !== "" ? Number(row.stock_inicial) : 0;
      const activo = parseBool(row.activo);

      // ── Campos obligatorios ──
      if (!codigoBarra) {
        erroresArr.push({ field: "codigo_barra", message: "es obligatorio" });
      }

      if (!nombre) {
        erroresArr.push({ field: "nombre", message: "es obligatorio" });
      }

      if (!UNIDADES_VALIDAS.includes(unidadMedida)) {
        erroresArr.push({ field: "unidad_medida", message: `debe ser: ${UNIDADES_VALIDAS.join(", ")}` });
      }

      if (isNaN(precioCosto) || precioCosto <= 0) {
        erroresArr.push({ field: "precio_costo", message: "debe ser mayor a 0" });
      }

      if (isNaN(precioVenta) || precioVenta <= 0) {
        erroresArr.push({ field: "precio_venta", message: "debe ser mayor a 0" });
      }

      // Margen >= 0 si se envía
      if (margenRaw !== null && (isNaN(margenRaw) || margenRaw < 0)) {
        erroresArr.push({ field: "margen", message: "debe ser >= 0" });
      }

      // ── Deduplicación intra-archivo ──
      if (codigoBarra && codigosVistos.has(codigoBarra)) {
        erroresArr.push({ field: "codigo_barra", message: `duplicado (ya en fila ${codigosVistos.get(codigoBarra)})` });
      } else if (codigoBarra) {
        codigosVistos.set(codigoBarra, fila);
      }

      // ── Resolver catálogos por nombre ──
      let categoriaId = null;
      const catNombre = normStr(row.categoria);
      if (catNombre) {
        categoriaId = catMap.get(catNombre.toLowerCase()) || null;
        if (!categoriaId) {
          erroresArr.push({ field: "categoria", message: `"${catNombre}" no encontrada` });
        }
      }

      let proveedorId = null;
      const provNombre = normStr(row.proveedor);
      if (provNombre) {
        proveedorId = provMap.get(provNombre.toLowerCase()) || null;
        if (!proveedorId) {
          erroresArr.push({ field: "proveedor", message: `"${provNombre}" no encontrado` });
        }
      }

      let areaFisicaId = null;
      const areaNombre = normStr(row.area_fisica);
      if (areaNombre) {
        areaFisicaId = areaMap.get(areaNombre.toLowerCase()) || null;
        if (!areaFisicaId) {
          erroresArr.push({ field: "area_fisica", message: `"${areaNombre}" no encontrada` });
        }
      }

      // ── Buscar existente en DB por codigo_barra ──
      const existente = codigoBarra ? existentesPorCodigo.get(codigoBarra) : null;

      // ── Clasificar acción según modo ──
      let accion = "error";
      let motivoError = null;

      if (erroresArr.length > 0) {
        accion = "error";
        motivoError = erroresArr.map((e) => `${e.field}: ${e.message}`).join("; ");
        errores++;
      } else if (existente) {
        if (modo === "crear") {
          accion = "ignorar";
        } else {
          accion = "actualizar";
          actualizar++;
        }
      } else {
        if (modo === "actualizar") {
          accion = "ignorar";
        } else {
          accion = "crear";
          crear++;
        }
      }

      // ── Calcular modo_pedido / modo_envio ──
      const esPack = unidadMedida === "pack" || unidadMedida === "cajon";
      const fp = factorPackRaw && factorPackRaw > 1 ? factorPackRaw : null;
      const modoPedido = esPack && fp ? "BULTO" : "UNIDAD";
      const modoEnvio = defaultModoEnvio(unidadMedida || "unidad");

      items.push({
        fila,
        accion,
        motivoError,
        erroresDetalle: erroresArr.length > 0 ? erroresArr : null,
        productoBaseId: existente?.id || null,
        codigo_barra: codigoBarra,
        nombre,
        unidad_medida: unidadMedida,
        factor_pack: fp,
        precio_costo: precioCosto,
        precio_venta: precioVenta,
        margen: margenRaw,
        modo_pedido: modoPedido,
        modo_envio: modoEnvio,
        categoria: catNombre,
        categoriaId,
        proveedor: provNombre,
        proveedorId,
        area_fisica: areaNombre,
        areaFisicaId,
        activo,
        stock_inicial: isNaN(stockActual) ? 0 : stockActual,
      });
    }

    return NextResponse.json({
      ok: true,
      items,
      resumen: {
        total: productos.length,
        crear,
        actualizar,
        errores,
        ignorados: items.filter((i) => i.accion === "ignorar").length,
      },
    });
  } catch (e) {
    console.error("ERROR productos/import/preview:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
