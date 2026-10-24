// POST /api/proveedores/listas/[id]/posibles — las respuestas del paquete 2,
// "Pueden ser de <proveedor>" (Emanuel, 2026-10-24).
//
// El paquete 2 se calcula solo y se guarda (`lib/proveedores/listas/puedenSer.js`),
// y lo lee la ruta del resultado: acá no hay GET. Acá van las dos respuestas
// que no son vincular —vincular («✓ Sí», «Otro») va por `en-la-lista` con
// `sumarProveedor`, que guarda el código, recalcula el renglón con el motor de
// la lista y anota el producto como sumado (`ProductoSumadoALaLista`)—:
//
//   «No»              `{ productoBaseId, filaId }`: ese renglón no es ese
//                     producto. Se recuerda por código, para que las próximas
//                     listas no lo vuelvan a proponer, y la propuesta se borra.
//   «No es de Dab»    `{ deshacer: true, productoBaseId }`: deshace una
//                     aceptación. Saca el vínculo con este proveedor —el renglón
//                     queda sin producto y su código apagado, como «No está en
//                     la lista» de `otra-fila`, con las mismas funciones— y, si
//                     el «✓ Sí» le sumó el proveedor, vacía ESE lugar y nada
//                     más: el que tenía antes queda. Todo en una transacción, y
//                     después se recalcula el paquete 2: vuelve a «Por confirmar».

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { esImportacionAbierta, OPCIONES_TX } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import { clavesDeCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { intentarRecalcularPuedenSer } from "@/lib/proveedores/listas/puedenSer";
import {
  LUGARES_DE_PROVEEDOR,
  desactivarCodigo,
  desvinculada,
} from "@/lib/proveedores/listas/vincularConUnaFila";

async function contexto(req, context) {
  const acceso = requirePerm(req, "proveedores.listas");
  if (!acceso.ok) return { error: { ok: false, error: acceso.error }, status: acceso.status };
  const scope = await resolveScope(req);
  if (scope.error) {
    return { error: { ok: false, error: scope.error, needsContexto: scope.needsContexto }, status: scope.status };
  }
  const p = await context.params;
  const importacionId = Number(p?.id);
  if (!Number.isInteger(importacionId)) return { error: { ok: false, error: "Identificador inválido." }, status: 400 };
  const cab = await prisma.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId: scope.grupoId, ...importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin) },
    select: { id: true, estado: true, proveedorId: true, proveedor: { select: { nombre: true } } },
  });
  if (!cab) return { error: { ok: false, error: "Importación no encontrada." }, status: 404 };
  if (!esImportacionAbierta(cab.estado)) {
    return {
      error: { ok: false, error: "Esta lista está cerrada: ya no se le pueden sumar productos.", codigo: "CERRADA" },
      status: 409,
    };
  }
  return { acceso, grupoId: scope.grupoId, importacionId, cab };
}

/**
 * «No»: este renglón no es este producto. Se recuerda por el código del renglón
 * para que las próximas listas del proveedor no lo vuelvan a proponer, y la
 * propuesta de ESTA lista se borra: sale de «Por confirmar».
 */
export async function POST(req, context) {
  try {
    const ctx = await contexto(req, context);
    if (ctx.error) return NextResponse.json(ctx.error, { status: ctx.status });
    const { acceso, grupoId, importacionId, cab } = ctx;

    const body = await req.json().catch(() => ({}));
    const productoBaseId = Number(body?.productoBaseId);
    if (body?.deshacer === true) return await deshacer({ grupoId, importacionId, cab, productoBaseId });
    const filaId = Number(body?.filaId);
    if (!Number.isInteger(productoBaseId) || !Number.isInteger(filaId)) {
      return NextResponse.json({ ok: false, error: "Falta el producto o el renglón." }, { status: 400 });
    }
    const [fila, producto] = await Promise.all([
      prisma.importacionListaFila.findFirst({
        where: { id: filaId, importacionId },
        select: { codigoCrudo: true, codigoNormalizado: true, descripcionProveedor: true },
      }),
      prisma.productoBase.findFirst({ where: { id: productoBaseId, grupoId }, select: { id: true } }),
    ]);
    if (!fila || !producto) {
      return NextResponse.json({ ok: false, error: "Ese renglón o ese producto ya no están." }, { status: 404 });
    }
    const codigoInterno = clavesDeCodigo(fila.codigoNormalizado ?? fila.codigoCrudo).normalizado;
    if (!codigoInterno) {
      return NextResponse.json({ ok: false, error: "Ese renglón no tiene código." }, { status: 409 });
    }
    const quien = Number(acceso.session?.id ?? acceso.session?.userId) || null;
    await prisma.$transaction([
      prisma.renglonQueNoEsElProducto.upsert({
        where: { renglon_no_es_unico: { grupoId, proveedorId: cab.proveedorId, productoBaseId, codigoInterno } },
        create: {
          grupoId,
          proveedorId: cab.proveedorId,
          productoBaseId,
          codigoInterno,
          descripcionProveedor: fila.descripcionProveedor ?? null,
          decididoPorUsuarioId: quien,
        },
        update: { decididoPorUsuarioId: quien, decididoEn: new Date() },
      }),
      prisma.productoQuePuedeSerDeLaLista.deleteMany({ where: { importacionId, productoBaseId } }),
    ]);
    return NextResponse.json({ ok: true, accion: "NO_ES", productoBaseId, codigoInterno });
  } catch (e) {
    console.error("[listas/posibles POST]", e);
    return NextResponse.json({ ok: false, error: "No se pudo guardar la respuesta. Probá de nuevo." }, { status: 500 });
  }
}

/**
 * «Deshacer» un aceptado: vuelve a como estaba antes del «✓ Sí» o del «Otro».
 *
 *   1. Sus renglones de ESTA lista quedan sin producto, con el código apagado:
 *      `desvinculada` y `desactivarCodigo`, las mismas de «No está en la
 *      lista». Uno ya aplicado no se toca: su costo está escrito, y eso se
 *      deshace deshaciendo la aplicación.
 *   2. Si el «✓ Sí» le sumó el proveedor, ESE lugar se vacía, y solo si sigue
 *      teniendo a este proveedor. Los otros dos no se miran: el proveedor que
 *      tenía antes queda.
 *   3. La anotación de sumado se borra, y el paquete 2 se recalcula: vuelve a
 *      «Por confirmar» si sigue siendo el candidato claro de un renglón.
 */
async function deshacer({ grupoId, importacionId, cab, productoBaseId }) {
  if (!Number.isInteger(productoBaseId)) {
    return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
  }
  const sumado = await prisma.productoSumadoALaLista.findFirst({
    where: { importacionId, productoBaseId, grupoId },
    select: { id: true, lugarDelProveedor: true, productoBase: { select: { nombre: true } } },
  });
  if (!sumado) {
    return NextResponse.json(
      { ok: false, error: "Ese producto no se sumó desde esta búsqueda, así que no hay nada que deshacer." },
      { status: 404 }
    );
  }
  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId, productoBaseId },
    select: { id: true, aplicada: true, codigoCrudo: true, codigoNormalizado: true },
  });
  if (filas.some((f) => f.aplicada === true)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Su costo ya se aplicó con esta lista. Para deshacerlo, primero deshacé la aplicación.",
        codigo: "YA_APLICADA",
      },
      { status: 409 }
    );
  }
  const lugar = LUGARES_DE_PROVEEDOR.includes(sumado.lugarDelProveedor) ? sumado.lugarDelProveedor : null;

  await prisma.$transaction(async (tx) => {
    for (const f of filas) {
      await desactivarCodigo(tx, {
        grupoId,
        proveedorId: cab.proveedorId,
        productoBaseId,
        codigo: f.codigoNormalizado ?? f.codigoCrudo,
      });
      await tx.importacionListaFila.update({ where: { id: f.id }, data: desvinculada() });
    }
    if (lugar) {
      await tx.productoBase.updateMany({
        where: { id: productoBaseId, grupoId, [lugar]: cab.proveedorId },
        data: { [lugar]: null },
      });
    }
    await tx.productoSumadoALaLista.delete({ where: { id: sumado.id } });
    await recalcularContadores(tx, importacionId);
  }, OPCIONES_TX);

  // Ya sin vínculo, vuelve a ser candidato: el paquete 2 se recalcula.
  await intentarRecalcularPuedenSer(prisma, { grupoId, importacionId });

  return NextResponse.json({
    ok: true,
    accion: "DESHECHO",
    productoBaseId,
    mensaje: `${sumado.productoBase?.nombre ?? "El producto"} ya no es de ${cab.proveedor?.nombre ?? "este proveedor"}.`,
  });
}
