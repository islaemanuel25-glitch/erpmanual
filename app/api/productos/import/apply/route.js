import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

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

    // Filtrar solo productos con acción válida
    const aCrear = productos.filter((p) => p.accion === "crear");
    const aActualizar = productos.filter((p) => p.accion === "actualizar");

    let creados = 0;
    let actualizados = 0;
    let erroresDetalle = [];

    const result = await prisma.$transaction(async (tx) => {
      // ============ CREAR NUEVOS ============
      for (const p of aCrear) {
        try {
          const baseData = {
            grupoId,
            creadoEnLocalId: localId,
            nombre: p.nombre,
            codigo_barra: p.codigo_barra || null,
            unidad_medida: p.unidad_medida,
            factor_pack: p.factor_pack || null,
            precio_costo: p.precio_costo,
            precio_venta: p.precio_venta,
            margen: p.margen,
            categoria_id: p.categoriaId || null,
            proveedor_id: p.proveedorId || null,
            area_fisica_id: p.areaFisicaId || null,
            activo: p.activo !== false,
            modo_pedido: p.unidad_medida === "unidad" || !p.factor_pack || p.factor_pack <= 1 ? "UNIDAD" : "BULTO",
          };

          // Intentar con modo_envio/modo_stock
          let base;
          try {
            base = await tx.productoBase.create({
              data: {
                ...baseData,
                modo_envio: p.unidad_medida === "cajon" ? "SOLO_BULTO" : "MIXTO",
                modo_stock: "BULTO",
              },
            });
          } catch (e) {
            if (e.message?.includes("modo_envio") || e.message?.includes("modo_stock")) {
              base = await tx.productoBase.create({ data: baseData });
            } else {
              throw e;
            }
          }

          // Crear ProductoLocal
          await tx.productoLocal.createMany({
            data: [{
              localId,
              baseId: base.id,
              precio_costo: base.precio_costo,
              precio_venta: base.precio_venta,
              margen: base.margen,
              activo: base.activo,
            }],
            skipDuplicates: true,
          });

          // Crear StockLocal
          const pl = await tx.productoLocal.findFirst({
            where: { localId, baseId: base.id },
            select: { id: true },
          });

          if (pl) {
            await tx.stockLocal.createMany({
              data: [{
                localId,
                productoId: pl.id,
                cantidad: String(p.stock_actual || 0),
                stockMin: null,
                stockMax: null,
              }],
              skipDuplicates: true,
            });
          }

          creados++;
        } catch (e) {
          erroresDetalle.push({
            fila: p.fila,
            nombre: p.nombre,
            error: e.message || "Error al crear",
          });
        }
      }

      // ============ ACTUALIZAR EXISTENTES ============
      for (const p of aActualizar) {
        try {
          if (!p.productoBaseId) {
            erroresDetalle.push({
              fila: p.fila,
              nombre: p.nombre,
              error: "No se encontró producto base para actualizar",
            });
            continue;
          }

          const updateData = {
            nombre: p.nombre,
            unidad_medida: p.unidad_medida,
            precio_costo: p.precio_costo,
            precio_venta: p.precio_venta,
            activo: p.activo !== false,
          };

          if (p.factor_pack) updateData.factor_pack = p.factor_pack;
          if (p.margen !== null && p.margen !== undefined) updateData.margen = p.margen;
          if (p.categoriaId) updateData.categoria_id = p.categoriaId;
          if (p.proveedorId) updateData.proveedor_id = p.proveedorId;
          if (p.areaFisicaId) updateData.area_fisica_id = p.areaFisicaId;

          await tx.productoBase.update({
            where: { id: p.productoBaseId },
            data: updateData,
          });

          // Actualizar o crear ProductoLocal
          const existingLocal = await tx.productoLocal.findFirst({
            where: { baseId: p.productoBaseId, localId },
          });

          if (existingLocal) {
            await tx.productoLocal.update({
              where: { id: existingLocal.id },
              data: {
                precio_costo: p.precio_costo,
                precio_venta: p.precio_venta,
                margen: p.margen,
                activo: p.activo !== false,
              },
            });
          } else {
            await tx.productoLocal.createMany({
              data: [{
                localId,
                baseId: p.productoBaseId,
                precio_costo: p.precio_costo,
                precio_venta: p.precio_venta,
                margen: p.margen,
                activo: p.activo !== false,
              }],
              skipDuplicates: true,
            });

            // Crear StockLocal si no existe
            const pl = await tx.productoLocal.findFirst({
              where: { localId, baseId: p.productoBaseId },
              select: { id: true },
            });

            if (pl) {
              await tx.stockLocal.createMany({
                data: [{
                  localId,
                  productoId: pl.id,
                  cantidad: "0",
                  stockMin: null,
                  stockMax: null,
                }],
                skipDuplicates: true,
              });
            }
          }

          actualizados++;
        } catch (e) {
          erroresDetalle.push({
            fila: p.fila,
            nombre: p.nombre,
            error: e.message || "Error al actualizar",
          });
        }
      }

      return { creados, actualizados };
    });

    return NextResponse.json({
      ok: true,
      message: `Importación completada: ${result.creados} creados, ${result.actualizados} actualizados.`,
      creados: result.creados,
      actualizados: result.actualizados,
      errores: erroresDetalle.length,
      detalles: erroresDetalle,
    });
  } catch (e) {
    console.error("ERROR productos/import/apply:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  }
}
