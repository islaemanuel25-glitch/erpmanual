// GET /api/proveedores/listas/[id]/sin-producto
//
// EL PAQUETE 3 DE UNA LISTA: LOS RENGLONES QUE NO TIENEN PRODUCTO.
//
// Qué entra y por qué, en `lib/proveedores/listas/sinProducto.js`: el `where`
// es el mismo que cuenta el botón del listado.
//
// NO ESCRIBE NADA. Vincular es `filas/[filaId]/vincular`.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { filasSinProductoWhere } from "@/lib/proveedores/listas/puedenSer";
import { CAMPOS_FILA_SIN_PRODUCTO, filaSinProductoParaLaPantalla } from "@/lib/proveedores/listas/sinProducto";

export async function GET(req, context) {
  try {
    const acceso = requirePerm(req, "proveedores.listas");
    if (!acceso.ok) return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status });
    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId, localId } = scope;
    const p = await context.params;
    const importacionId = Number(p?.id);
    if (!Number.isInteger(importacionId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId, ...importacionDeProveedorPropioWhere(localId, acceso.session.esAdmin) },
      select: {
        id: true,
        estado: true,
        archivoNombre: true,
        recargoPct: true,
        impuestoAdicionalPct: true,
        proveedor: { select: { id: true, nombre: true } },
      },
    });
    if (!cab) return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });

    const filas = await prisma.importacionListaFila.findMany({
      where: filasSinProductoWhere({ importacionId, proveedorId: cab.proveedor?.id }),
      select: CAMPOS_FILA_SIN_PRODUCTO,
      orderBy: { filaExcel: "asc" },
    });

    return NextResponse.json({
      ok: true,
      cabecera: {
        id: cab.id,
        estado: cab.estado,
        abierta: esImportacionAbierta(cab.estado),
        archivoNombre: cab.archivoNombre,
        proveedor: cab.proveedor,
        // La cuenta de aplicar sobre el precio del renglón, para el costo del
        // alta (`costoDelAltaDesdeLaLista`). Los Decimal van como número.
        cuentaDeLaLista: {
          recargoPct: cab.recargoPct === null ? 0 : Number(cab.recargoPct),
          impuestoAdicionalPct: cab.impuestoAdicionalPct === null ? null : Number(cab.impuestoAdicionalPct),
        },
      },
      total: filas.length,
      items: filas.map(filaSinProductoParaLaPantalla),
    });
  } catch (e) {
    console.error("[listas/sin-producto GET]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los renglones sin producto: ${e?.message ?? "error"}` },
      { status: 500 }
    );
  }
}
