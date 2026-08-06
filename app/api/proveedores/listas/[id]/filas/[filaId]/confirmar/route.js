// POST /api/proveedores/listas/[id]/filas/[filaId]/confirmar
//
// Confirma la interpretación de una fila que quedó por revisar.
//
// ── QUÉ SE CONFIRMA ─────────────────────────────────────────────────────────
//
// Una HIPÓTESIS: qué es el producto del ERP respecto de lo que cotiza el
// proveedor. Con display o bulto hay una sola, sin multiplicar. Con precio por
// unidad puede haber más, y el multiplicador sale del `factor_pack` del ERP o de
// la descripción del proveedor. Nunca de UxBU, que es un nivel logístico que el
// ERP no maneja.
//
// Y un DATO: la cantidad que trae la presentación. Se guarda en la fila, sirve
// para el costo unitario y para una futura corrección de la ficha, y NO
// multiplica el precio ni toca `ProductoBase.factor_pack`.
//
// ── LO QUE EL SERVIDOR NO ACEPTA ────────────────────────────────────────────
//
// Una hipótesis que el archivo no habilita, y una hipótesis absurda —de las que
// cambian el costo de orden de magnitud—. Esas se muestran explicadas en la
// pantalla pero no se pueden confirmar.
//
// El porcentaje NO confirma nada por sí solo: una fila dentro del rango exige la
// misma acción de la persona que una fuera de rango. La diferencia es la alerta.
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
import { RANGO_POR_DEFECTO, rangoValido } from "@/lib/proveedores/listas/rangoAumento";
import {
  puedeConfirmarse,
  analizarFila,
  cantidadValida,
  resultadoConfirmacion,
  TEXTO_NO_CONFIRMABLE,
  CANTIDAD_MAX,
} from "@/lib/proveedores/listas/confirmarPresentacion";

/** El rango vigente de una importación, con el de Arcor como respaldo. */
function rangoDe(importacion) {
  const minPct = importacion.aumentoEsperadoMinPct;
  const maxPct = importacion.aumentoEsperadoMaxPct;
  if (minPct !== null && maxPct !== null && rangoValido({ minPct: Number(minPct), maxPct: Number(maxPct) })) {
    return { minPct: Number(minPct), maxPct: Number(maxPct) };
  }
  return RANGO_POR_DEFECTO;
}

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
    const clave = String(body?.clave ?? "");
    const cantidadPresentacion =
      body?.cantidadPresentacion === null || body?.cantidadPresentacion === undefined
        ? null
        : Number(body.cantidadPresentacion);

    const importacion = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId },
      select: {
        id: true, estado: true, recargoPct: true, umbralVariacionPct: true, localOperativoId: true,
        aumentoEsperadoMinPct: true, aumentoEsperadoMaxPct: true,
      },
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

    if (cantidadPresentacion !== null && !cantidadValida(cantidadPresentacion)) {
      return NextResponse.json(
        { ok: false, error: `La cantidad de la presentación tiene que ser un entero de 1 a ${CANTIDAD_MAX}.` },
        { status: 400 }
      );
    }

    const recargoPct = Number(importacion.recargoPct);
    const rango = rangoDe(importacion);

    const r = resultadoConfirmacion({
      fila, base, clave, cantidadPresentacion, recargoPct, rango,
      umbralVariacionPct: Number(importacion.umbralVariacionPct),
    });
    if (!r.ok) {
      const analisis = analizarFila({ fila, base, recargoPct, rango });
      return NextResponse.json(
        { ok: false, error: r.motivo, hipotesis: analisis.evaluadas },
        { status: 400 }
      );
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
          multiplicadorConfirmado: r.multiplicador,
          cantidadPresentacion: r.cantidadPresentacion,
          // El rango se congela con la fila: cambiarlo después no puede
          // reescribir con qué criterio se decidió esto.
          aumentoEsperadoMinPct: r.rango.minPct,
          aumentoEsperadoMaxPct: r.rango.maxPct,
          confirmadoPorUsuarioId: Number(session?.id ?? session?.userId) || null,
          confirmadoEn: new Date(),
          // `factorErp` sigue siendo el factor DEL PRODUCTO: es la foto contra la
          // que la aplicación detecta que la ficha cambió entre confirmar y
          // aplicar. No se escribe nada en ProductoBase.
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
      multiplicador: r.multiplicador,
      cantidadPresentacion: r.cantidadPresentacion,
      estadoVariacion: r.estadoVariacion,
      variacionPct: r.variacionPct,
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
      { ok: false, error: "No se pudo confirmar la interpretación." },
      { status: 500 }
    );
  }
}
