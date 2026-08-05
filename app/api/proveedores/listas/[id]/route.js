// GET /api/proveedores/listas/[id]
//
// Una importación: cabecera, resumen y filas PAGINADAS.
//
// Las 917 filas no se devuelven nunca de una. El grupo va en el WHERE junto al
// id, así que una importación de otro grupo no existe para esta consulta: da 404
// y no revela que existe.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resumirSeleccion } from "@/lib/proveedores/listas/seleccion";
import { textoOmision } from "@/lib/proveedores/listas/aplicacion";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { paginacion, LIMITES } from "@/lib/proveedores/listas/persistencia";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";

const numero = (v) => (v === null || v === undefined ? null : Number(v));

export async function GET(req, context) {
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

    const { id } = await context.params;
    const importacionId = Number(id);
    if (!Number.isInteger(importacionId) || importacionId <= 0) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    // grupoId en el WHERE, no en una validación posterior.
    const cabecera = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, archivoNombre: true, archivoTamano: true,
        archivoHash: true, archivoUbicacion: true, parser: true, parserVersion: true,
        recargoPct: true, umbralVariacionPct: true, modoPrecioVenta: true,
        localOperativoId: true, createdAt: true, conciliadaEn: true, aplicadaEn: true,
        totalFilas: true, listoParaActualizar: true, sinCambios: true, noMacheadas: true,
        codigoDuplicado: true, factorDudoso: true, excluidas: true, bloqueadas: true,
        errores: true, sugerenciasCodigoBarras: true, variacionAlta: true, faltantes: true,
        aplicadas: true, omitidas: true, aplicadaPorUsuarioId: true,
        proveedor: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
    if (!cabecera) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const url = new URL(req.url);
    const { page, pageSize, skip, take } = paginacion({
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize"),
    });

    const where = { importacionId };

    const estado = url.searchParams.get("estado");
    if (estado) {
      if (!Object.prototype.hasOwnProperty.call(ESTADO_LINEA, estado)) {
        return NextResponse.json({ ok: false, error: "Estado inválido." }, { status: 400 });
      }
      where.estado = estado;
    }

    // Búsqueda por código o por descripción. `insensitive` para que el cajero no
    // tenga que acordarse de cómo lo escribió el proveedor.
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q) {
      where.OR = [
        { codigoNormalizado: { contains: q.toUpperCase() } },
        { codigoCrudo: { contains: q, mode: "insensitive" } },
        { descripcionProveedor: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, filas] = await Promise.all([
      prisma.importacionListaFila.count({ where }),
      prisma.importacionListaFila.findMany({
        where,
        // Por fila del Excel: es el orden en el que el usuario ve el archivo.
        orderBy: { filaExcel: "asc" },
        skip,
        take,
        select: {
          id: true, filaExcel: true, hojaNombre: true,
          codigoCrudo: true, codigoNormalizado: true, codigoBarraProveedor: true,
          descripcionProveedor: true, categoriaCruda: true,
          unidadProveedor: true, unidadesPorBulto: true,
          precioConIva: true, precioSinIva: true,
          productoBaseId: true, tipoCoincidencia: true,
          sugerenciaProductoBaseId: true, sugerenciaCodigoBarra: true,
          costoAnterior: true, recargoPct: true, montoRecargo: true, precioConRecargo: true,
          factorErp: true, costoUnitarioCalculado: true, costoMaestroPropuesto: true,
          diferencia: true, diferenciaPct: true, variacionAlta: true,
          estado: true, motivo: true, seleccionable: true, seleccionada: true,
          aplicada: true, costoAplicado: true,
          resultadoAplicacion: true, motivoAplicacion: true,
          costoPrevioAplicacion: true, ventaAnterior: true, ventaNueva: true,
          productoBase: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    const filasParaResumen = await prisma.importacionListaFila.findMany({
      where: { importacionId },
      select: {
        id: true, estado: true, aplicada: true, seleccionada: true,
        productoBaseId: true, costoMaestroPropuesto: true,
      },
    });
    const resumenSeleccion = resumirSeleccion(filasParaResumen, cabecera);

    return NextResponse.json({
      ok: true,
      importacion: {
        ...cabecera,
        recargoPct: numero(cabecera.recargoPct),
        umbralVariacionPct: numero(cabecera.umbralVariacionPct),
      },
      filas: filas.map((f) => ({
        ...f,
        precioConIva: numero(f.precioConIva),
        precioSinIva: numero(f.precioSinIva),
        costoAnterior: numero(f.costoAnterior),
        recargoPct: numero(f.recargoPct),
        montoRecargo: numero(f.montoRecargo),
        precioConRecargo: numero(f.precioConRecargo),
        costoUnitarioCalculado: numero(f.costoUnitarioCalculado),
        costoMaestroPropuesto: numero(f.costoMaestroPropuesto),
        diferencia: numero(f.diferencia),
        diferenciaPct: numero(f.diferenciaPct),
        costoAplicado: numero(f.costoAplicado),
        costoPrevioAplicacion: numero(f.costoPrevioAplicacion),
        ventaAnterior: numero(f.ventaAnterior),
        ventaNueva: numero(f.ventaNueva),
        // El texto se resuelve en el servidor: es el mismo diccionario que usa
        // el endpoint que aplica, así que la pantalla no puede quedar diciendo
        // otra cosa que el motivo real.
        textoMotivoAplicacion: f.motivoAplicacion ? textoOmision(f.motivoAplicacion) : null,
      })),
      // El contador tiene que hablar de la importación entera: el usuario
      // selecciona en varias páginas y necesita saber cuántas lleva en total,
      // no cuántas hay marcadas en las 50 que está mirando.
      seleccion: resumenSeleccion,
      paginacion: {
        page,
        pageSize,
        total,
        paginas: Math.ceil(total / pageSize),
        pageSizeMax: LIMITES.pageSizeMax,
      },
    });
  } catch (error) {
    console.error("Error leyendo importación de lista:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
