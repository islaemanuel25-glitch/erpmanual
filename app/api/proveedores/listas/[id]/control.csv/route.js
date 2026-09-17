// GET /api/proveedores/listas/[id]/control.csv
//
// EL CONTROL ENTERO, PARA ABRIR EN UNA PLANILLA.
//
// ── POR QUÉ EXISTE, SI LA PANTALLA YA MUESTRA LOS NÚMEROS ───────────────────
//
// Porque la pantalla muestra grupos y la planilla muestra renglones. Alguien que
// controla una lista contra sus costos quiere poder ordenar por diferencia,
// filtrar por rubro y mandarle tres líneas al proveedor — y eso no se hace
// desplazándose por un teléfono.
//
// ── POR QUÉ NO SE ARMA EN EL NAVEGADOR ──────────────────────────────────────
//
// Porque la pantalla NO tiene las filas: tiene los contadores y tres ejemplos.
// Un CSV armado con lo que hay a mano habría bajado tres renglones titulados "el
// control", que es un archivo que se abre, se ve perfecto y miente por omisión
// sobre el resto de la lista.
//
// ── EL VEREDICTO SALE DE LA MISMA FUNCIÓN QUE EL DE LA PANTALLA ─────────────
//
// `compararConLaLista` y `diferenciaContraElCosto`, que son las que ya usan el
// motor y el resumen. Escribir la resta acá sería una segunda respuesta a
// "cuánto difiere este producto", y el día que una cambie el archivo bajado y la
// pantalla dirían cosas distintas de la misma lista.

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import {
  CONTROL,
  TEXTO_CONTROL,
  compararConLaLista,
  diferenciaContraElCosto,
} from "@/lib/proveedores/listas/modoDeLaLista";

const numeroONull = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Una celda de CSV.
 *
 * Se entrecomilla SIEMPRE y se duplican las comillas de adentro. Los nombres de
 * producto traen comas —"MOGUL x1 Kg CONITOS (450u)"— y traen comillas dobles
 * como marca de pulgadas; sin escapar, cada uno de esos corre las columnas de su
 * renglón y la planilla se abre desalineada a partir de ahí.
 */
const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Los números van con coma decimal: es lo que espera un Excel en español. */
const importe = (v) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

export async function GET(req, context) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) {
      return Response.json({ ok: false, error: admin.error }, { status: admin.status });
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return Response.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const params = await context.params;
    const id = Number(params?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ ok: false, error: "Importación inválida." }, { status: 400 });
    }

    // El grupo va en el WHERE junto al id: una importación de otro grupo no
    // existe para esta consulta, así que da 404 y no revela que existe.
    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id, grupoId },
      select: {
        id: true,
        archivoNombre: true,
        proveedor: { select: { nombre: true } },
      },
    });
    if (!cab) {
      return Response.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const filas = await prisma.importacionListaFila.findMany({
      where: { importacionId: id },
      select: {
        codigoCrudo: true,
        descripcionProveedor: true,
        unidadProveedor: true,
        unidadesPorBulto: true,
        costoAnterior: true,
        costoMaestroPropuesto: true,
        productoBase: { select: { nombre: true } },
      },
      orderBy: { filaExcel: "asc" },
    });

    const encabezado = [
      "Codigo", "Producto en la lista", "Tu producto", "U.M.", "Cantidad",
      "Tu costo", "Dice la lista", "Diferencia $", "Diferencia %", "Situacion",
    ];

    const renglones = filas.map((f) => {
      const costoActual = numeroONull(f.costoAnterior);
      const precio = numeroONull(f.costoMaestroPropuesto);
      const veredicto = compararConLaLista({ costoActual, precio });
      const d = diferenciaContraElCosto({ costoActual, precio });

      // SIN VEREDICTO SE DICE POR QUÉ, no se deja la celda vacía. Una celda en
      // blanco en una planilla se lee como un cero o como un error de exportación;
      // "no lo tenés" dice qué pasó.
      const situacion = veredicto
        ? veredicto === CONTROL.COINCIDE
          ? TEXTO_CONTROL.COINCIDE.titulo
          : `${TEXTO_CONTROL[veredicto].titulo} · ${TEXTO_CONTROL[veredicto].detalle}`
        : costoActual === null
          ? "no lo tenés cargado"
          : "sin precio en la lista";

      return [
        f.codigoCrudo,
        f.descripcionProveedor,
        f.productoBase?.nombre ?? "",
        f.unidadProveedor,
        f.unidadesPorBulto,
        importe(costoActual),
        importe(precio),
        importe(d.pesos),
        importe(d.pct),
        situacion,
      ].map(celda).join(",");
    });

    // EL BOM VA ADELANTE. Sin él, Excel abre el archivo en su codificación local
    // y los acentos salen rotos: "MERMELADA DURAZNO" se lee bien y "LIMÓN" no.
    const csv = "﻿" + [encabezado.map(celda).join(","), ...renglones].join("\r\n");

    const nombre = `control-${String(cab.proveedor?.nombre ?? "lista")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\w-]+/g, "-")
      .toLowerCase()}-${id}.csv`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // EL MENSAJE DICE QUÉ PASÓ Y QUÉ HACER.
    console.error("[listas/control.csv]", error);
    return Response.json(
      {
        ok: false,
        error: "No se pudo armar el archivo del control. Probá de nuevo, y si sigue avisá con el número de la lista.",
      },
      { status: 500 }
    );
  }
}
