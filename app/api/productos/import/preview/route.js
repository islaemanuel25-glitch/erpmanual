import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

const UNIDADES_VALIDAS = ["unidad", "pack", "cajon", "kg"];

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const grupoId = Number(session.grupoId);
    if (!grupoId || grupoId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Selecciona un grupo activo" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { localId, modo, productos } = body;

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    if (!modo || !["crear", "actualizar", "crear_actualizar"].includes(modo)) {
      return NextResponse.json(
        { ok: false, error: "Modo de importación inválido" },
        { status: 400 }
      );
    }

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No se recibieron productos" },
        { status: 400 }
      );
    }

    // Cargar catálogos para buscar por nombre
    const [categorias, proveedores, areas] = await Promise.all([
      prisma.categoria.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.proveedor.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.areaFisica.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    ]);

    const catMap = new Map(categorias.map((c) => [c.nombre.toLowerCase().trim(), c.id]));
    const provMap = new Map(proveedores.map((p) => [p.nombre.toLowerCase().trim(), p.id]));
    const areaMap = new Map(areas.map((a) => [a.nombre.toLowerCase().trim(), a.id]));

    // Cargar productos existentes del grupo por codigo_barra
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

    // Validar cada producto
    const items = [];
    let crear = 0;
    let actualizar = 0;
    let errores = 0;

    for (let i = 0; i < productos.length; i++) {
      const row = productos[i];
      const fila = i + 2; // +2 porque fila 1 es header
      const erroresArr = [];

      // Campos obligatorios
      const nombre = (row.nombre || "").toString().trim();
      if (!nombre) erroresArr.push(`Fila ${fila}: nombre es obligatorio`);

      const unidadMedida = (row.unidad_medida || "").toString().trim().toLowerCase();
      if (!unidadMedida) {
        erroresArr.push(`Fila ${fila}: unidad_medida es obligatorio`);
      } else if (!UNIDADES_VALIDAS.includes(unidadMedida)) {
        erroresArr.push(`Fila ${fila}: unidad_medida debe ser: ${UNIDADES_VALIDAS.join(", ")}`);
      }

      const precioCosto = Number(row.precio_costo);
      if (isNaN(precioCosto) || precioCosto <= 0) {
        erroresArr.push(`Fila ${fila}: precio_costo debe ser mayor a 0`);
      }

      const precioVenta = Number(row.precio_venta);
      if (isNaN(precioVenta) || precioVenta <= 0) {
        erroresArr.push(`Fila ${fila}: precio_venta debe ser mayor a 0`);
      }

      // factor_pack obligatorio si unidad = pack/cajon
      const factorPack = row.factor_pack ? Number(row.factor_pack) : null;
      if ((unidadMedida === "pack" || unidadMedida === "cajon") && (!factorPack || factorPack <= 0)) {
        erroresArr.push(`Fila ${fila}: factor_pack obligatorio y > 0 para ${unidadMedida}`);
      }

      // Margen
      const margen = row.margen !== undefined && row.margen !== "" ? Number(row.margen) : null;
      if (margen !== null && (isNaN(margen) || margen < 0)) {
        erroresArr.push(`Fila ${fila}: margen debe ser >= 0`);
      }

      // Resolver catálogos por nombre
      let categoriaId = null;
      if (row.categoria && String(row.categoria).trim()) {
        categoriaId = catMap.get(String(row.categoria).trim().toLowerCase()) || null;
        if (!categoriaId) {
          erroresArr.push(`Fila ${fila}: categoría "${row.categoria}" no encontrada`);
        }
      }

      let proveedorId = null;
      if (row.proveedor && String(row.proveedor).trim()) {
        proveedorId = provMap.get(String(row.proveedor).trim().toLowerCase()) || null;
        if (!proveedorId) {
          erroresArr.push(`Fila ${fila}: proveedor "${row.proveedor}" no encontrado`);
        }
      }

      let areaFisicaId = null;
      if (row.area_fisica && String(row.area_fisica).trim()) {
        areaFisicaId = areaMap.get(String(row.area_fisica).trim().toLowerCase()) || null;
        if (!areaFisicaId) {
          erroresArr.push(`Fila ${fila}: área física "${row.area_fisica}" no encontrada`);
        }
      }

      // Buscar si existe por codigo_barra
      const codigoBarra = (row.codigo_barra || "").toString().trim();
      const existente = codigoBarra ? existentesPorCodigo.get(codigoBarra) : null;

      // Clasificar acción
      let accion = "error";
      let motivoError = null;

      if (erroresArr.length > 0) {
        accion = "error";
        motivoError = erroresArr.join("; ");
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

      // Activo
      const activoRaw = row.activo;
      let activo = true;
      if (activoRaw !== undefined && activoRaw !== "") {
        const val = String(activoRaw).toLowerCase().trim();
        activo = val === "si" || val === "true" || val === "1" || val === "sí";
      }

      items.push({
        fila,
        accion,
        motivoError,
        productoBaseId: existente?.id || null,
        codigo_barra: codigoBarra,
        nombre,
        unidad_medida: unidadMedida,
        factor_pack: factorPack,
        precio_costo: precioCosto,
        precio_venta: precioVenta,
        margen,
        categoria: row.categoria || "",
        categoriaId,
        proveedor: row.proveedor || "",
        proveedorId,
        area_fisica: row.area_fisica || "",
        areaFisicaId,
        activo,
        stock_actual: row.stock_actual ? Number(row.stock_actual) : 0,
      });
    }

    return NextResponse.json({
      ok: true,
      items,
      resumen: { crear, actualizar, errores, ignorados: items.filter((i) => i.accion === "ignorar").length },
    });
  } catch (e) {
    console.error("ERROR productos/import/preview:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
