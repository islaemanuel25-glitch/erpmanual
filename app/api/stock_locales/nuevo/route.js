// app/api/stock_locales/nuevo/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    // --------------------------------------------
    // 0. AUTENTICACIÓN + PERMISOS
    // --------------------------------------------
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "stock.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const sessionLocalId = session.localId;

    // --------------------------------------------
    // 1. NORMALIZAR ENTRADA (camelCase → snake_case)
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

      unidadMedida: body.unidadMedida,        // cajon / pack / unidad
      factorPack: body.factorPack ?? null,    // unidades dentro del bulto

      pesoKg: body.pesoKg ?? null,
      volumenMl: body.volumenMl ?? null,

      // 🚨 precioCosto = precio DEL BULTO (no por unidad)
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
    // 2. VALIDACIONES
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

    // Si es cajón o pack, factorPack debe existir
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

    // --------------------------------------------
    // 3. Validar duplicado (código de barras)
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
    // 4. Crear productoBase + productoLocal + stockLocal
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
          factor_pack: data.factorPack, // 🚨 define unidades por bulto

          peso_kg: data.pesoKg,
          volumen_ml: data.volumenMl,

          precio_costo: data.precioCosto,  // 🚨 PRECIO DEL BULTO
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

      const locales = await tx.local.findMany({ where: { es_deposito: false }, select: { id: true } });

      for (const l of locales) {
        const pl = await tx.productoLocal.create({
          data: {
            baseId: creado.id,
            localId: l.id,
            precio_costo: creado.precio_costo, // precio del bulto
            precio_venta: creado.precio_venta,
            margen: creado.margen,
          },
        });

        await tx.stockLocal.create({
          data: {
            localId: l.id,
            productoId: pl.id,
            cantidad: 0,     // 🟢 stock inicial
            stockMin: 0,
            stockMax: 0,
          },
        });
      }

      return creado;
    });

    // --------------------------------------------
    // 5. RESPUESTA
    // --------------------------------------------
    return NextResponse.json({
      ok: true,
      item: {
        id: base.id,
        grupoId: base.grupoId,
        nombre: base.nombre,
        precioCosto: base.precio_costo,  // precio del bulto
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
