// POST /api/proveedores/listas/[id]/filas/[filaId]/vincular   { productoBaseId }
//
// "QUÉ PRODUCTO ES": UN RENGLÓN DE LA LISTA SIN PRODUCTO, Y EL PRODUCTO QUE ES.
//
// La usan las dos salidas de la hoja del paquete 3, que es la de la recepción:
// elegir uno que ya existe, o crearlo en el momento y volver acá con su id.
//
// Lo que decide vive en `lib/proveedores/listas/vincularFilaSinProducto.js`;
// esta ruta lee, valida el acceso y escribe todo en UNA transacción:
//
//   1. el código del proveedor, por `servicioIdentidad` (`persistirIdentidad`),
//      que es la memoria que comparten listas y recepción;
//   2. si el producto no tiene a este proveedor en ninguno de sus tres lugares
//      —se eligió de "todo el catálogo"—, se suma en el primer lugar libre y
//      queda anotado como sumado a esta lista, igual que el «✓ Sí» de "Pueden
//      ser de…". Sin eso, la fila quedaría vinculada a un producto que ningún
//      paquete muestra;
//   3. el renglón, con su veredicto recalculado por `conciliarFila`;
//   4. los contadores de la importación.
//
// Al volver, la fila deja de estar en el paquete 3 y aparece en el que le toca.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { getDepositoIdDeGrupo, importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { resolverParserPorId } from "@/lib/proveedores/listas/registro";
import { OPCIONES_TX, esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { recalcularContadores } from "@/lib/proveedores/listas/contadores";
import {
  CAMPOS_CABECERA_PARA_EL_MOTOR,
  CAMPOS_PRODUCTO_PARA_EL_MOTOR,
  lugarParaSumarProveedor,
  motorParaEstaLista,
  ubicacionQueJuzgaElCosto,
} from "@/lib/proveedores/listas/vincularConUnaFila";
import {
  datosDeLaFilaVinculada,
  decidirVinculoDeLaFila,
  identidadDelVinculo,
  reconciliarLaFila,
} from "@/lib/proveedores/listas/vincularFilaSinProducto";
import { persistirIdentidad } from "@/lib/proveedores/identidad/persistirIdentidad";

export async function POST(req, context) {
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
    const usuarioId = Number(acceso.session?.id ?? acceso.session?.userId) || null;

    const p = await context.params;
    const importacionId = Number(p?.id);
    const filaId = Number(p?.filaId);
    const body = await req.json().catch(() => ({}));
    const productoBaseId = Number(body?.productoBaseId);
    if (!Number.isInteger(importacionId) || !Number.isInteger(filaId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }
    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) {
      return NextResponse.json({ ok: false, error: "Elegí un producto." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId, ...importacionDeProveedorPropioWhere(localId, acceso.session.esAdmin) },
      select: CAMPOS_CABECERA_PARA_EL_MOTOR,
    });
    if (!cab) return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        { ok: false, error: "Esta lista está cerrada: no se pueden cambiar sus vínculos.", codigo: "CERRADA" },
        { status: 409 }
      );
    }
    const reg = resolverParserPorId(cab.parser);
    if (!reg.ok) return NextResponse.json({ ok: false, error: reg.error }, { status: 409 });

    const fila = await prisma.importacionListaFila.findFirst({ where: { id: filaId, importacionId } });
    if (!fila) return NextResponse.json({ ok: false, error: "Ese renglón no es de esta lista." }, { status: 404 });

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { ...CAMPOS_PRODUCTO_PARA_EL_MOTOR, proveedor_id: true, proveedor2_id: true, proveedor3_id: true },
    });
    if (!producto) return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });

    const decision = decidirVinculoDeLaFila({ fila, productoBaseId });
    if (!decision.ok) {
      return NextResponse.json({ ok: false, error: decision.error, codigo: decision.rechazo }, { status: decision.status });
    }
    // Un segundo toque —o el alta que vuelve después de un vínculo que sí
    // entró— no escribe nada: ya está.
    if (decision.yaEstaba) {
      return NextResponse.json({
        ok: true,
        accion: "YA_VINCULADA",
        filaId,
        productoBaseId,
        nombre: producto.nombre,
        mensaje: `${producto.nombre} ya estaba vinculado a este renglón.`,
      });
    }

    const lugar = lugarParaSumarProveedor(producto, cab.proveedorId);
    if (lugar.lleno) {
      return NextResponse.json(
        {
          ok: false,
          error: `${producto.nombre} ya tiene tres proveedores. Para sumarle este, sacale uno en su ficha.`,
          codigo: "SIN_LUGAR_DE_PROVEEDOR",
        },
        { status: 409 }
      );
    }

    const ahora = new Date();
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    const { config, contexto } = motorParaEstaLista({
      cab,
      reg,
      grupoId,
      operandoEnLocalId: ubicacionQueJuzgaElCosto({ producto, operandoEnLocalId: localId, depositoLocalId }),
      depositoLocalId,
    });
    const recalculada = reconciliarLaFila({ fila, producto, codigo: decision.codigo, config, contexto, ahora });
    const identidad = identidadDelVinculo({
      grupoId,
      proveedorId: cab.proveedorId,
      productoBaseId,
      fila,
      usuarioId,
      ahora,
    });

    await prisma.$transaction(async (tx) => {
      await persistirIdentidad(tx, identidad);

      if (lugar.lugar) {
        // Solo si el lugar sigue vacío: si otro lo llenó en el medio, no se pisa.
        await tx.productoBase.updateMany({
          where: { id: productoBaseId, grupoId, [lugar.lugar]: null },
          data: { [lugar.lugar]: cab.proveedorId },
        });
        await tx.productoSumadoALaLista.upsert({
          where: { sumado_unico_por_lista_y_producto: { importacionId, productoBaseId } },
          create: { grupoId, importacionId, productoBaseId, lugarDelProveedor: lugar.lugar, sumadoPorUsuarioId: usuarioId },
          update: { lugarDelProveedor: lugar.lugar },
        });
      }

      await tx.importacionListaFila.update({
        where: { id: fila.id },
        data: datosDeLaFilaVinculada(recalculada, { ahora }),
      });

      // Si alguien había dicho que no venía, ya vino.
      await tx.productoQueNoVieneEnLaLista.deleteMany({ where: { importacionId, productoBaseId } });

      await recalcularContadores(tx, importacionId);
    }, OPCIONES_TX);

    return NextResponse.json({
      ok: true,
      accion: "VINCULADA",
      filaId,
      productoBaseId,
      nombre: producto.nombre,
      estado: recalculada.estado,
      sumadoAlProveedor: Boolean(lugar.lugar),
      mensaje:
        `${producto.nombre} quedó atado al renglón «${fila.descripcionProveedor}»` +
        // Sin código, el vínculo es por el nombre: no se muestra un "código" vacío.
        `${decision.codigo ? ` (código ${fila.codigoCrudo})` : ""}. Las próximas listas de este proveedor lo van a usar solo.`,
    });
  } catch (e) {
    console.error("[listas/filas/vincular POST]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo vincular el renglón con ese producto: ${e?.message ?? "error"}` },
      { status: 500 }
    );
  }
}
