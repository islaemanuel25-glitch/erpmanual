// POST /api/proveedores/listas/[id]/filas/[filaId]/confirmar
//
// Confirma el producto propuesto y el armado de una fila que quedó por revisar.
//
// ── QUÉ RESUELVE ────────────────────────────────────────────────────────────
//
// Esas filas ya tienen producto identificado. Lo que les falta es el factor:
// cuántas unidades del ERP cubre el precio del proveedor. El motor se negó a
// deducirlo —el archivo dice un armado y el producto otro, o el proveedor cotiza
// por display— y sin ese número no hay costo que proponer. Sin esta acción la
// fila no tenía ninguna salida: no se podía dejar lista ni aplicar.
//
// El factor lo elige una persona mirando el costo que produce cada opción, y se
// guarda en la FILA. No se toca `ProductoBase.factor_pack`: eso reescribiría la
// ficha del producto para compras, stock y transferencias a partir de una lista
// de precios.
//
// NO TOCA COSTOS NI PRECIOS. Deja la fila lista; aplicar sigue siendo un paso
// aparte y explícito.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { getDepositoIdDeGrupo } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";
import { esComboBase } from "@/lib/combos/guards";
import { OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import {
  puedeConfirmarse,
  factorConfirmadoValido,
  resultadoConfirmacion,
  opcionesDeFactor,
  TEXTO_NO_CONFIRMABLE,
  FACTOR_MAX,
} from "@/lib/proveedores/listas/confirmarArmado";

export async function POST(req, context) {
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
    const { session, grupoId, localId } = scope;

    const { id, filaId } = await context.params;
    const importacionId = Number(id);
    const filaIdNum = Number(filaId);
    if (!Number.isInteger(importacionId) || !Number.isInteger(filaIdNum)) {
      return NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const factor = Number(body?.factorConfirmado);

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: { id: true, estado: true, recargoPct: true, umbralVariacionPct: true, localOperativoId: true },
    });
    if (!importacion) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }

    const fila = await prisma.importacionListaFila.findFirst({
      where: { id: filaIdNum, importacionId },
    });
    const permitido = puedeConfirmarse(fila, importacion);
    if (!permitido.ok) {
      return NextResponse.json(
        { ok: false, error: TEXTO_NO_CONFIRMABLE[permitido.motivo], codigo: permitido.motivo },
        { status: 409 }
      );
    }

    // El producto VIVO, con el filtro de alcance del grupo.
    const base = await prisma.productoBase.findFirst({
      where: { id: fila.productoBaseId, grupoId },
      select: {
        id: true, nombre: true, precio_costo: true, unidad_medida: true, factor_pack: true,
        modoCompraProveedor: true, pesoReferenciaKg: true, creadoEnLocalId: true, es_combo: true,
      },
    });
    if (!base) {
      return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
    }
    if (esComboBase(base)) {
      return NextResponse.json(
        { ok: false, error: "Es un combo: no tiene costo propio que actualizar." },
        { status: 409 }
      );
    }

    // Propiedad del costo: si esta ubicación no puede moverlo, dejar la fila
    // lista sería prometer algo que la aplicación después va a rechazar.
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    if (!puedeEditarCosto(Number(localId), base.creadoEnLocalId ?? null, depositoLocalId)) {
      return NextResponse.json(
        { ok: false, error: "Esta ubicación no puede editar el costo de este producto." },
        { status: 409 }
      );
    }

    if (!factorConfirmadoValido(factor)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Elegí un armado válido: un número entero entre 1 y ${FACTOR_MAX}.`,
          opciones: opcionesDeFactor(fila, base),
        },
        { status: 400 }
      );
    }

    const r = resultadoConfirmacion({
      fila,
      base,
      factor,
      recargoPct: Number(importacion.recargoPct),
      umbralVariacionPct: Number(importacion.umbralVariacionPct),
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.motivo }, { status: 409 });
    }

    const listo = r.estado === "LISTO_PARA_ACTUALIZAR";

    const salida = await prisma.$transaction(async (tx) => {
      // Se revalida dentro: entre leer y escribir la fila pudo aplicarse desde
      // otra pestaña, y confirmar sobre algo aplicado lo desharía.
      const actual = await tx.importacionListaFila.findUnique({
        where: { id: filaIdNum },
        select: { aplicada: true, estado: true },
      });
      if (actual.aplicada) return { carrera: true };

      await tx.importacionListaFila.update({
        where: { id: filaIdNum },
        data: {
          factorConfirmado: factor,
          confirmadoPorUsuarioId: Number(session?.id ?? session?.userId) || null,
          confirmadoEn: new Date(),
          // `factorErp` sigue siendo el factor DEL PRODUCTO, no el confirmado:
          // es la foto contra la que la aplicación detecta que la ficha cambió
          // entre confirmar y aplicar. La decisión de la persona vive en
          // `factorConfirmado`, que es lo que usa el cálculo.
          factorErp: base.factor_pack ?? null,
          precioConRecargo: r.precioConRecargo,
          montoRecargo: r.montoRecargo,
          costoAnterior: r.costoAnterior,
          costoMaestroPropuesto: r.costoNuevo,
          diferencia: r.diferencia,
          diferenciaPct: r.diferenciaPct,
          variacionAlta: r.variacionAlta,
          estado: r.estado,
          motivo: null,
          seleccionable: listo,
          // Queda seleccionada: el usuario acaba de decidir sobre esta fila, y
          // obligarlo a marcarla otra vez sería pedirle la misma confirmación
          // dos veces.
          seleccionada: listo,
        },
      });

      await recalcularContadores(tx, importacionId);

      const fresca = await tx.importacionListaFila.findUnique({
        where: { id: filaIdNum },
        include: { productoBase: { select: { id: true, nombre: true } } },
      });
      return { fila: fresca };
    }, OPCIONES_TX);

    if (salida.carrera) {
      return NextResponse.json(
        { ok: false, error: "La fila se aplicó mientras se confirmaba." },
        { status: 409 }
      );
    }

    const cabecera = await prisma.importacionListaProveedor.findUnique({
      where: { id: importacionId },
      select: {
        totalFilas: true, listoParaActualizar: true, sinCambios: true, noMacheadas: true,
        codigoDuplicado: true, factorDudoso: true, excluidas: true, bloqueadas: true, errores: true,
      },
    });

    const f = salida.fila;
    return NextResponse.json({
      ok: true,
      quedoLista: listo,
      factorConfirmado: factor,
      fila: {
        ...f,
        precioConIva: Number(f.precioConIva),
        costoAnterior: f.costoAnterior === null ? null : Number(f.costoAnterior),
        costoMaestroPropuesto: f.costoMaestroPropuesto === null ? null : Number(f.costoMaestroPropuesto),
        diferencia: f.diferencia === null ? null : Number(f.diferencia),
        diferenciaPct: f.diferenciaPct === null ? null : Number(f.diferenciaPct),
      },
      resumen: cabecera,
    });
  } catch (e) {
    console.error("[listas/confirmar] error:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo confirmar el armado." },
      { status: 500 }
    );
  }
}
