// POST /api/proveedores/listas/[id]/filas/[filaId]/confirmar
//
// Confirma la PRESENTACIÓN de una fila que quedó por revisar.
//
// ── QUÉ SE CONFIRMA, Y QUÉ NO ───────────────────────────────────────────────
//
// Se confirma qué es el producto del ERP respecto de lo que cotiza el proveedor:
// la misma presentación —el costo es el precio informado— o la unidad suelta que
// el producto agrupa —el costo es el precio por la cantidad que agrupa—.
//
// NO se confirma un multiplicador. La cantidad contenida se guarda como dato de
// la presentación y solo entra en la cuenta con POR_UNIDAD_SUELTA, que el
// servidor únicamente admite cuando el archivo dice que el precio es por unidad.
// Con display o bulto la cantidad no toca el precio: un display de $5.678 cuesta
// $5.962 con recargo, traiga 12 o traiga 18 adentro.
//
// Tampoco se toca `ProductoBase.factor_pack`: corregir la ficha del producto es
// otro flujo, con otras consecuencias sobre compras, stock y transferencias.
//
// NO TOCA COSTOS NI PRECIOS. Deja la fila lista; aplicar es un paso aparte.

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
  RELACION,
  puedeConfirmarse,
  relacionesPosibles,
  unidadesValidas,
  resultadoConfirmacion,
  TEXTO_NO_CONFIRMABLE,
  UNIDADES_MAX,
} from "@/lib/proveedores/listas/confirmarPresentacion";

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
    const relacion = String(body?.relacion ?? "");
    const unidades = body?.unidades === null || body?.unidades === undefined ? null : Number(body.unidades);

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

    // La relación tiene que ser una de las que el ARCHIVO habilita. Es acá donde
    // se impide multiplicar un display: POR_UNIDAD_SUELTA solo aparece cuando la
    // columna U.M. dice que el precio es por unidad.
    const posibles = relacionesPosibles(fila, base);
    if (!posibles.some((o) => o.relacion === relacion)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            relacion === RELACION.POR_UNIDAD_SUELTA
              ? "El proveedor no está cotizando por unidad suelta, así que el precio no se multiplica por la cantidad."
              : "Elegí qué es el producto respecto de lo que cotiza el proveedor.",
          opciones: posibles,
        },
        { status: 400 }
      );
    }

    // La cantidad es obligatoria SOLO cuando multiplica. En el resto es un dato
    // opcional de la presentación.
    if (relacion === RELACION.POR_UNIDAD_SUELTA && !unidadesValidas(unidades)) {
      return NextResponse.json(
        { ok: false, error: `Indicá cuántas unidades agrupa el producto: un entero de 1 a ${UNIDADES_MAX}.` },
        { status: 400 }
      );
    }
    if (unidades !== null && !unidadesValidas(unidades)) {
      return NextResponse.json(
        { ok: false, error: `La cantidad contenida tiene que ser un entero de 1 a ${UNIDADES_MAX}.` },
        { status: 400 }
      );
    }

    const r = resultadoConfirmacion({
      fila,
      base,
      relacion,
      unidades,
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
        select: { aplicada: true },
      });
      if (actual.aplicada) return { carrera: true };

      await tx.importacionListaFila.update({
        where: { id: filaIdNum },
        data: {
          baseConfirmada: r.relacion,
          unidadesConfirmadas: r.unidades,
          confirmadoPorUsuarioId: Number(session?.id ?? session?.userId) || null,
          confirmadoEn: new Date(),
          // `factorErp` sigue siendo el factor DEL PRODUCTO, no una decisión:
          // es la foto contra la que la aplicación detecta que la ficha cambió
          // entre confirmar y aplicar.
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
          // Queda seleccionada: la persona acaba de decidir sobre esta fila, y
          // pedirle que la marque otra vez sería pedir dos veces lo mismo.
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
      relacion: r.relacion,
      unidades: r.unidades,
      multiplico: r.relacion === RELACION.POR_UNIDAD_SUELTA,
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
      { ok: false, error: "No se pudo confirmar la presentación." },
      { status: 500 }
    );
  }
}
