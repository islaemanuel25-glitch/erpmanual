// POST /api/proveedores/listas/[id]/productos/[productoBaseId]/lectura-recordada
//
// LO QUE LA TARJETA PREGUNTA PARA PODER ARMAR LA CUENTA, CONTESTADO AHÍ MISMO.
// Dos preguntas, y una sola ruta porque las dos guardan lo mismo en el mismo
// lugar (Emanuel, 2026-10-24):
//
//   { cantidad }  "¿Cuántas trae la caja?" — ALICANTE PIMENTÓN 25G: la lista de
//                 Dab cotiza la unidad, el producto cuesta la caja, y ni el
//                 catálogo ni el papel dicen cuántas trae. Con la respuesta se
//                 arma "$ 800,45 × 24".
//   { kilos }     "¿Cuántos kilos trae la pieza?" — GRANIX BOCADITO 2KG: el
//                 producto guarda el costo por kilo y la lista cotiza la pieza.
//                 Con la respuesta se arma "$ 22.105,73 ÷ 2 kg". Admite
//                 decimales: una pieza puede traer 2,5 kg.
//
// Se llamaba `caja` y solo sabía la primera; se movió acá cuando llegó la
// segunda, en vez de escribir una ruta parecida al lado.
//
// ── QUÉ GUARDA, Y QUÉ NO ──────────────────────────────────────────────────
//
// La LECTURA RECORDADA de este producto con este proveedor
// (`LecturaProductoProveedor`, ver `cajaRecordada.js`): la caja con la clave
// `CAJA_DE_<n>`, los kilos en `kilosPorPieza`. NO toca la ficha del producto
// —ni `factor_pack` ni `pesoReferenciaKg`, que son de ventas, stock y
// depósito— y NO confirma nada: la fila queda como estaba, y «✓ Usar» sigue
// siendo el que decide, con la pregunta de siempre si queda fuera de rango.
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
import {
  CLAVE_KILOS_POR_PIEZA,
  KILOS_MAX,
  cantidadDeCajaValida,
  claveDeLaCaja,
  kilosValidos,
} from "@/lib/proveedores/listas/cajaRecordada";
import { CANTIDAD_MAX } from "@/lib/proveedores/listas/confirmarPresentacion";

/** Lo que se devuelve y se restaura: la recordada, con sus cuatro datos. */
const CAMPOS_RECORDADA = { clave: true, multiplicador: true, cantidad: true, kilosPorPieza: true };

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
    (r.cantidad === null || r.cantidad === undefined || Number.isInteger(Number(r.cantidad))) &&
    (r.kilosPorPieza === null || r.kilosPorPieza === undefined || kilosValidos(r.kilosPorPieza))
  );
}

/** "2,5" o "2.5" o 2.5 → 2.5; lo que no es un número → NaN. */
function numeroConComa(v) {
  if (typeof v === "number") return v;
  return Number(String(v ?? "").trim().replace(",", "."));
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
    const tiene = (k) => Object.prototype.hasOwnProperty.call(body ?? {}, k);
    const restaurando = tiene("restaurar");
    const porKilos = !restaurando && tiene("kilos");
    const cantidad = Number(body?.cantidad);
    const kilos = numeroConComa(body?.kilos);
    if (porKilos && !kilosValidos(kilos)) {
      return NextResponse.json(
        { ok: false, error: `Escribí cuántos kilos trae la pieza: un número mayor que cero y hasta ${KILOS_MAX}, con hasta tres decimales.` },
        { status: 400 }
      );
    }
    if (!restaurando && !porKilos && !cantidadDeCajaValida(cantidad)) {
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

    const anteriorCruda = await prisma.lecturaProductoProveedor.findUnique({ where: donde, select: CAMPOS_RECORDADA });
    // El Decimal de los kilos viaja como número: es lo que el «Deshacer» manda
    // de vuelta, y `restaurable` lo valida.
    const anterior = anteriorCruda
      ? { ...anteriorCruda, kilosPorPieza: anteriorCruda.kilosPorPieza === null ? null : Number(anteriorCruda.kilosPorPieza) }
      : null;

    // ── DESHACER: VUELVE LO QUE HABÍA ─────────────────────────────────────
    if (restaurando) {
      if (body.restaurar === null) {
        await prisma.lecturaProductoProveedor.deleteMany({ where: { grupoId, proveedorId: cab.proveedorId, productoBaseId } });
      } else {
        const r = body.restaurar;
        const datos = {
          clave: r.clave,
          multiplicador: Number(r.multiplicador),
          cantidad: r.cantidad === null || r.cantidad === undefined ? null : Number(r.cantidad),
          kilosPorPieza: r.kilosPorPieza === null || r.kilosPorPieza === undefined ? null : Number(r.kilosPorPieza),
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

    // ── GUARDAR: LA PIEZA TRAE K KILOS ────────────────────────────────────
    //
    // La clave queda en `KILOS_POR_PIEZA` hasta que alguien elija una lectura
    // con «✓ Usar»; `confirmar` la reemplaza por la elegida y deja los kilos.
    if (porKilos) {
      const datos = {
        clave: CLAVE_KILOS_POR_PIEZA,
        multiplicador: 1,
        cantidad: null,
        kilosPorPieza: kilos,
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
        accion: "KILOS_GUARDADOS",
        productoBaseId,
        kilos,
        anterior,
        mensaje: `Listo: la pieza de ${producto.nombre} trae ${String(kilos).replace(".", ",")} kg. Me lo acuerdo para las próximas listas.`,
      });
    }

    // ── GUARDAR: LA CAJA TRAE N ───────────────────────────────────────────
    const datos = {
      clave: claveDeLaCaja(cantidad),
      multiplicador: cantidad,
      cantidad,
      kilosPorPieza: null,
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
    console.error("[listas/lectura-recordada POST]", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo guardar lo que contestaste. Probá de nuevo." },
      { status: 500 }
    );
  }
}
