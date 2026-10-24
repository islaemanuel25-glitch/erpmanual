// POST /api/proveedores/listas/[id]/productos/[productoBaseId]/caja
//
// "¿CUÁNTAS TRAE LA CAJA?", CONTESTADO EN LA TARJETA (Emanuel, 2026-10-24).
//
// El caso es ALICANTE PIMENTÓN 25G: la lista de Dab cotiza la unidad, el producto
// cuesta la caja, y ni el catálogo ni el papel dicen cuántas trae. Con la
// respuesta se arma la lectura "$ 800,45 × 24" y la tarjeta pasa a tener cuenta.
//
// ── QUÉ GUARDA, Y QUÉ NO ──────────────────────────────────────────────────
//
// La LECTURA RECORDADA de este producto con este proveedor
// (`LecturaProductoProveedor`), con la clave `CAJA_DE_<n>` (`cajaRecordada.js`).
// NO toca la ficha del producto —el `factor_pack` es de ventas y de stock— y NO
// confirma nada: la fila queda como estaba, y «✓ Usar» sigue siendo el que
// decide, con la pregunta de siempre si queda fuera de rango.
//
// ── Y SE DESHACE ──────────────────────────────────────────────────────────
//
// Devuelve la lectura recordada que había antes (`anterior`, o null). El
// «Deshacer» del aviso la manda de vuelta en `{ restaurar }`: con null se borra
// la recordada, con una lectura se vuelve a poner esa.
//
// Mismas guardas que las demás rutas de la lista: permiso, lista propia y
// abierta, producto del grupo, y la ubicación que administra el costo —desde
// otra, la pantalla ni pregunta, y este endpoint tampoco acepta—.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requirePerm } from "@/lib/authorize";
import { getDepositoIdDeGrupo, importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { puedeEditarCosto } from "@/lib/productos/propiedadCosto";
import { esImportacionAbierta } from "@/lib/proveedores/listas/persistencia";
import { TEXTO_SIN_PROPIEDAD_DEL_COSTO } from "@/lib/proveedores/listas/porQueNoSeConfirma";
import { cantidadDeCajaValida, claveDeLaCaja } from "@/lib/proveedores/listas/cajaRecordada";
import { CANTIDAD_MAX } from "@/lib/proveedores/listas/confirmarPresentacion";

/** Lo que se devuelve y se restaura: la recordada, con sus tres datos. */
const CAMPOS_RECORDADA = { clave: true, multiplicador: true, cantidad: true };

/** ¿Es una lectura recordada que se puede volver a poner? */
function restaurable(r) {
  return (
    r &&
    typeof r.clave === "string" &&
    r.clave.length > 0 &&
    r.clave.length <= 64 &&
    Number.isInteger(Number(r.multiplicador)) &&
    Number(r.multiplicador) >= 1 &&
    Number(r.multiplicador) <= CANTIDAD_MAX &&
    (r.cantidad === null || r.cantidad === undefined || Number.isInteger(Number(r.cantidad)))
  );
}

export async function POST(req, context) {
  try {
    const acceso = requirePerm(req, "proveedores.listas");
    if (!acceso.ok) {
      return NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status });
    }
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
    const productoBaseId = Number(p?.productoBaseId);
    if (!Number.isInteger(importacionId) || !Number.isInteger(productoBaseId)) {
      return NextResponse.json({ ok: false, error: "Identificador inválido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const restaurando = Object.prototype.hasOwnProperty.call(body ?? {}, "restaurar");
    const cantidad = Number(body?.cantidad);
    if (!restaurando && !cantidadDeCajaValida(cantidad)) {
      return NextResponse.json(
        { ok: false, error: `Escribí cuántas unidades trae la caja: un número entero de 2 a ${CANTIDAD_MAX}.` },
        { status: 400 }
      );
    }
    if (restaurando && body.restaurar !== null && !restaurable(body.restaurar)) {
      return NextResponse.json({ ok: false, error: "No se pudo deshacer: la lectura anterior no es válida." }, { status: 400 });
    }

    const cab = await prisma.importacionListaProveedor.findFirst({
      where: { id: importacionId, grupoId, ...importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin) },
      select: { id: true, estado: true, proveedorId: true },
    });
    if (!cab) {
      return NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 });
    }
    if (!esImportacionAbierta(cab.estado)) {
      return NextResponse.json(
        { ok: false, error: "Esta lista ya está cerrada: no se le pueden cambiar precios.", codigo: "CERRADA" },
        { status: 409 }
      );
    }

    const producto = await prisma.productoBase.findFirst({
      where: { id: productoBaseId, grupoId },
      select: { id: true, nombre: true, creadoEnLocalId: true },
    });
    if (!producto) {
      return NextResponse.json({ ok: false, error: "El producto ya no existe." }, { status: 404 });
    }
    const depositoLocalId = await getDepositoIdDeGrupo(grupoId);
    if (!puedeEditarCosto(Number(localId), producto.creadoEnLocalId ?? null, depositoLocalId)) {
      return NextResponse.json({ ok: false, error: TEXTO_SIN_PROPIEDAD_DEL_COSTO }, { status: 409 });
    }

    const donde = {
      lectura_unica_por_producto_y_proveedor: { grupoId, proveedorId: cab.proveedorId, productoBaseId },
    };
    const quien = Number(acceso.session?.id ?? acceso.session?.userId) || null;

    const anterior = await prisma.lecturaProductoProveedor.findUnique({ where: donde, select: CAMPOS_RECORDADA });

    // ── DESHACER: VUELVE LO QUE HABÍA ─────────────────────────────────────
    if (restaurando) {
      if (body.restaurar === null) {
        await prisma.lecturaProductoProveedor.deleteMany({ where: { grupoId, proveedorId: cab.proveedorId, productoBaseId } });
      } else {
        const datos = {
          clave: body.restaurar.clave,
          multiplicador: Number(body.restaurar.multiplicador),
          cantidad: body.restaurar.cantidad === null || body.restaurar.cantidad === undefined ? null : Number(body.restaurar.cantidad),
          confirmadaPorUsuarioId: quien,
          confirmadaEn: new Date(),
        };
        await prisma.lecturaProductoProveedor.upsert({
          where: donde,
          create: { grupoId, proveedorId: cab.proveedorId, productoBaseId, ...datos },
          update: datos,
        });
      }
      return NextResponse.json({ ok: true, accion: "RESTAURADA", productoBaseId, anterior });
    }

    // ── GUARDAR: LA CAJA TRAE N ───────────────────────────────────────────
    const datos = {
      clave: claveDeLaCaja(cantidad),
      multiplicador: cantidad,
      cantidad,
      confirmadaPorUsuarioId: quien,
      confirmadaEn: new Date(),
    };
    await prisma.lecturaProductoProveedor.upsert({
      where: donde,
      create: { grupoId, proveedorId: cab.proveedorId, productoBaseId, ...datos },
      update: datos,
    });
    return NextResponse.json({
      ok: true,
      accion: "CAJA_GUARDADA",
      productoBaseId,
      cantidad,
      anterior,
      mensaje: `Listo: ${producto.nombre} viene en cajas de ${cantidad}. Me lo acuerdo para las próximas listas.`,
    });
  } catch (e) {
    console.error("[listas/caja POST]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar cuántas trae la caja. Probá de nuevo." },
      { status: 500 }
    );
  }
}
