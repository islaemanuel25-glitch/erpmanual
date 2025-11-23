// app/api/stock_locales/nuevo/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    // --------------------------------------------
    // 🟦 0. AUTENTICACIÓN + PERMISOS
    // --------------------------------------------
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { permisos, localId: sessionLocalId } = session;
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");

    if (!esAdmin && !permisos.includes("productos.crear")) {
      return NextResponse.json(
        { ok: false, error: "No tenés permisos para crear productos." },
        { status: 403 }
      );
    }

    // --------------------------------------------
    // 🟦 1. NORMALIZAR ENTRADA (camelCase)
    // --------------------------------------------
    const body = await req.json();

    const data = {
      grupoId: Number(body.grupoId ?? body.grupo_id),
      creadoEnLocalId:
        body.creadoEnLocalId ??
        body.creado_en_local_id ??
        sessionLocalId ??
        null,

      nombre: body.nombre,
      descripcion: body.descripcion || null,
      sku: body.sku || null,
      codigoBarra: body.codigoBarra ?? body.codigo_barra ?? null,

      categoriaId: body.categoriaId ?? body.categoria_id ?? null,
      proveedorId: body.proveedorId ?? body.proveedor_id ?? null,
      areaFisicaId: body.areaFisicaId ?? body.area_fisica_id ?? null,

      unidadMedida: body.unidadMedida,
      factorPack: body.factorPack ?? body.factor_pack ?? null,

      pesoKg: body.pesoKg ?? null,
      volumenMl: body.volumenMl ?? null,

      precioCosto: Number(body.precioCosto),
      precioVenta: Number(body.precioVenta),
      margen: body.margen ?? null,

      precioSugerido: body.precioSugerido ?? null,
      ivaPorcentaje: body.ivaPorcentaje ?? null,
      fechaVencimiento: body.fechaVencimiento ?? null,

      redondeo100: Boolean(body.redondeo100),
      activo: true,
      imagenUrl: body.imagenUrl ?? null,
      esCombo: Boolean(body.esCombo),
    };

    // --------------------------------------------
    // 🟦 2. VALIDACIONES
    // --------------------------------------------
    if (!data.nombre) {
      return NextResponse.json(
        { ok: false, error: "El nombre es obligatorio" },
        { status: 400 }
      );
    }

    if (!data.grupoId) {
      return NextResponse.json(
        { ok: false, error: "grupoId es obligatorio" },
        { status: 400 }
      );
    }

    if (!data.unidadMedida) {
      return NextResponse.json(
        { ok: false, error: "unidadMedida es obligatoria" },
        { status: 400 }
      );
    }

    if (data.unidadMedida !== "unidad" && Number(data.factorPack) <= 0) {
      return NextResponse.json(
        { ok: false, error: "factorPack debe ser mayor a 0" },
        { status: 400 }
      );
    }

    if (data.precioCosto < 0) {
      return NextResponse.json(
        { ok: false, error: "precioCosto no puede ser negativo" },
        { status: 400 }
      );
    }

    if (data.precioVenta < data.precioCosto) {
      return NextResponse.json(
        { ok: false, error: "precioVenta no puede ser menor al costo" },
        { status: 400 }
      );
    }

    // --------------------------------------------
    // 🟦 3. Validar duplicado (código de barras)
    // --------------------------------------------
    if (data.codigoBarra) {
      const repetido = await prisma.productoBase.findFirst({
        where: {
          grupoId: data.grupoId,
          codigo_barra: data.codigoBarra,
        },
      });

      if (repetido) {
        return NextResponse.json(
          { ok: false, error: "Ya existe un producto con ese código de barras" },
          { status: 400 }
        );
      }
    }

    // --------------------------------------------
    // 🟦 4. Crear en transacción
    // --------------------------------------------
    const base = await prisma.$transaction(async (tx) => {
      const creado = await tx.productoBase.create({
        data: {
          grupoId: data.grupoId,
          creadoEnLocalId: data.creadoEnLocalId,

          nombre: data.nombre,
          descripcion: data.descripcion,
          sku: data.sku,
          codigo_barra: data.codigoBarra,

          categoria_id: data.categoriaId,
          proveedor_id: data.proveedorId,
          area_fisica_id: data.areaFisicaId,

          unidad_medida: data.unidadMedida,
          factor_pack: data.factorPack,

          peso_kg: data.pesoKg,
          volumen_ml: data.volumenMl,

          precio_costo: data.precioCosto,
          precio_venta: data.precioVenta,
          margen: data.margen,

          precio_sugerido: data.precioSugerido,
          iva_porcentaje: data.ivaPorcentaje,
          fecha_vencimiento: data.fechaVencimiento,

          redondeo_100: data.redondeo100,
          activo: true,

          imagen_url: data.imagenUrl,
          es_combo: data.esCombo,
        },
      });

      const locales = await tx.local.findMany({ select: { id: true } });

      for (const l of locales) {
        const pl = await tx.productoLocal.create({
          data: {
            baseId: creado.id,
            localId: l.id,
            precio_costo: creado.precio_costo,
            precio_venta: creado.precio_venta,
          },
        });

        await tx.stockLocal.create({
          data: {
            localId: l.id,
            productoId: pl.id,
            cantidad: 0,
            stockMin: 0,
            stockMax: 0,
          },
        });
      }

      return creado;
    });

    // --------------------------------------------
    // 🟦 5. Respuesta camelCase
    // --------------------------------------------
    return NextResponse.json({
      ok: true,
      item: {
        id: base.id,
        grupoId: base.grupoId,
        nombre: base.nombre,
        precioCosto: base.precio_costo,
        precioVenta: base.precio_venta,
      },
    });

  } catch (err) {
    console.error("❌ ERROR STOCK NUEVO:", err);
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
