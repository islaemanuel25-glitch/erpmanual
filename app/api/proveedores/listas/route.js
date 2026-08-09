// GET /api/proveedores/listas
//
// Historial de importaciones del grupo activo. Paginado EN LA BASE: no se traen
// todas para contarlas en memoria.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { paginacion } from "@/lib/proveedores/listas/persistencia";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { filtroDeLaCola } from "@/lib/proveedores/listas/panelDecision";
import { whereDelGrupo, GRUPO_PRODUCTO } from "@/lib/proveedores/listas/gruposProducto";

export async function GET(req) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const url = new URL(req.url);
    const { page, pageSize, skip, take } = paginacion({
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    });

    // El grupo NO sale de un parámetro: sale del alcance resuelto. Un id de
    // grupo por query no cambiaría nada.
    const where = { grupoId };
    const proveedorId = Number(url.searchParams.get("proveedorId"));
    if (Number.isInteger(proveedorId) && proveedorId > 0) where.proveedorId = proveedorId;
    // Las CANCELADAS no son procesos activos: se esconden salvo que se pidan.
    // Sin esto una importación cancelada seguiría ocupando la pantalla como si
    // hubiera algo que hacer con ella.
    const estado = url.searchParams.get("estado");
    if (estado) where.estado = estado;
    else if (url.searchParams.get("incluirCanceladas") !== "1") {
      where.estado = { not: "CANCELADA" };
    }

    const [total, items] = await Promise.all([
      prisma.importacionListaProveedor.count({ where }),
      prisma.importacionListaProveedor.findMany({
        where,
        // Más nueva primero: el historial se mira para ver la última.
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          estado: true,
          archivoNombre: true,
          archivoTamano: true,
          createdAt: true,
          conciliadaEn: true,
          aplicadaEn: true,
          parser: true,
          parserVersion: true,
          recargoPct: true,
          umbralVariacionPct: true,
          totalFilas: true,
          listoParaActualizar: true,
          sinCambios: true,
          noMacheadas: true,
          codigoDuplicado: true,
          factorDudoso: true,
          excluidas: true,
          bloqueadas: true,
          errores: true,
          sugerenciasCodigoBarras: true,
          variacionAlta: true,
          faltantes: true,
          proveedor: { select: { id: true, nombre: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    // LOS MISMOS NÚMEROS QUE LA PANTALLA DE ADENTRO, Y EN PRODUCTOS.
    //
    // `listoParaActualizar` es un contador de FILAS congelado en la cabecera, y
    // aplicar no cambia el estado de la fila —marca `aplicada`—, así que las ya
    // aplicadas seguían contando: decía 287 cuando adentro quedaban 6. Dos
    // números distintos para la misma pregunta, y el de la tapa era el que se
    // veía primero.
    //
    // Se cuenta con `whereDelGrupo`, el mismo predicado que arma los grupos del
    // catálogo, así que la tapa y el detalle no pueden separarse: si cambia la
    // regla, cambian los dos.
    const conteos = await Promise.all(
      items.map(async (i) => {
        const universoWhere = { grupoId, ...productoDelProveedorWhere(i.proveedor?.id) };
        const base = { universoWhere, importacionId: i.id, proveedorId: i.proveedor?.id, filtroCola: filtroDeLaCola() };
        const [listos, actualizados] = await Promise.all([
          prisma.productoBase.count({ where: whereDelGrupo(GRUPO_PRODUCTO.LISTO_PARA_APLICAR, base) }),
          prisma.productoBase.count({ where: whereDelGrupo(GRUPO_PRODUCTO.ACTUALIZADO, base) }),
        ]);
        return { id: i.id, listos, actualizados };
      })
    );
    const porImportacion = new Map(conteos.map((c) => [c.id, c]));

    return NextResponse.json({
      ok: true,
      items: items.map((i) => ({
        ...i,
        recargoPct: Number(i.recargoPct),
        umbralVariacionPct: Number(i.umbralVariacionPct),
        productosListos: porImportacion.get(i.id)?.listos ?? 0,
        productosActualizados: porImportacion.get(i.id)?.actualizados ?? 0,
      })),
      paginacion: { page, pageSize, total, paginas: Math.ceil(total / pageSize) },
    });
  } catch (error) {
    console.error("Error listando importaciones de listas:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
