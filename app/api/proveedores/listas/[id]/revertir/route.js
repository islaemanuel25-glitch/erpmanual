// GET  /api/proveedores/listas/[id]/revertir → la previa. No escribe nada.
// POST /api/proveedores/listas/[id]/revertir → deshace la aplicación.
//
// DESHACER LO QUE APLICAR ESCRIBIÓ. Aplicar mueve el costo del producto y
// arrastra el precio de venta por margen; hasta acá no había vuelta atrás, y una
// tanda de 279 costos con uno mal era irreparable.
//
// El criterio de QUÉ se revierte y A QUÉ VALOR no vive acá: lo decide
// `lib/proveedores/listas/reversion.js`, que es puro y está probado contra las
// 281 filas reales. Esta ruta aporta los datos frescos de la base, compara la
// previa contra lo que la persona vio, y escribe.
//
// ── LA PREVIA VIEJA NO ESCRIBE ──────────────────────────────────────────────
//
// El POST recibe los números que mostró la previa y los vuelve a calcular antes
// de tocar nada. Si no coinciden, 409 y no se escribe una sola fila. Entre que
// se abre el modal y se aprieta el botón alguien puede editar un producto, y
// revertir sobre una foto vieja escribiría un costo que nadie aprobó.
//
// ── EL CONTEXTO DE REQUEST SE ABRE SÍ O SÍ ──────────────────────────────────
//
// `requireAdmin` llama a `getUsuarioSession`, que siembra el contexto y registra
// el volcado de la bitácora. Sin eso, los costos y las ventas volverían sin
// autor: exactamente el agujero que dejó 451 escrituras sin rastro. Va primero,
// antes de cualquier otra cosa.
//
// `ImportacionListaFila` NO está en la lista blanca de la bitácora y no hace
// falta que esté: lo que se audita es el producto —`ProductoBase` y
// `ProductoLocal`—, que es donde vive el costo. El historial de la fila queda en
// la fila misma.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { requireAdmin } from "@/lib/authorize";
import { OPCIONES_TX, esImportacionRevertible } from "@/lib/proveedores/listas/persistencia";
import { productoDelProveedorWhere } from "@/lib/proveedores/listas/cargaErp";
import { planDeReversion, TEXTO_OMISION } from "@/lib/proveedores/listas/reversion";

/** Los campos de la fila que el plan necesita, y ninguno más. */
const CAMPOS_FILA = {
  id: true,
  filaExcel: true,
  aplicada: true,
  aplicadaEn: true,
  revertidaEn: true,
  costoPrevioAplicacion: true,
  costoAplicado: true,
  ventaAnterior: true,
  ventaNueva: true,
};

const num = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * Los productos de la importación con sus filas aplicadas y sus overrides.
 *
 * Solo lectura. Es el mismo insumo para la previa y para la ejecución: pedirlo
 * dos veces con dos formas distintas es cómo una previa y su ejecución empiezan
 * a decir cosas diferentes.
 */
async function cargarProductos(db, { importacionId, grupoId, proveedorId }) {
  const filas = await db.importacionListaFila.findMany({
    where: { importacionId, aplicada: true, productoBaseId: { not: null } },
    select: { ...CAMPOS_FILA, productoBaseId: true },
    orderBy: { filaExcel: "asc" },
  });
  const ids = [...new Set(filas.map((f) => f.productoBaseId))];
  if (ids.length === 0) return [];

  const productos = await db.productoBase.findMany({
    where: { id: { in: ids }, grupoId, ...productoDelProveedorWhere(proveedorId) },
    select: { id: true, nombre: true, precio_costo: true, precio_venta: true },
  });
  const overrides = await db.productoLocal.findMany({
    where: { baseId: { in: ids } },
    select: { id: true, baseId: true, localId: true, precio_costo: true, precio_venta: true },
  });

  const filasPorProducto = new Map();
  for (const f of filas) {
    if (!filasPorProducto.has(f.productoBaseId)) filasPorProducto.set(f.productoBaseId, []);
    filasPorProducto.get(f.productoBaseId).push({
      id: f.id,
      filaExcel: f.filaExcel,
      aplicada: f.aplicada,
      aplicadaEn: f.aplicadaEn,
      revertidaEn: f.revertidaEn,
      costoPrevioAplicacion: num(f.costoPrevioAplicacion),
      costoAplicado: num(f.costoAplicado),
      ventaAnterior: num(f.ventaAnterior),
      ventaNueva: num(f.ventaNueva),
    });
  }
  const overridesPorProducto = new Map();
  for (const o of overrides) {
    if (!overridesPorProducto.has(o.baseId)) overridesPorProducto.set(o.baseId, []);
    overridesPorProducto.get(o.baseId).push({
      id: o.id,
      localId: o.localId,
      precioCosto: num(o.precio_costo),
      precioVenta: num(o.precio_venta),
    });
  }

  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precioCostoActual: num(p.precio_costo),
    precioVentaActual: num(p.precio_venta),
    filas: filasPorProducto.get(p.id) ?? [],
    overrides: overridesPorProducto.get(p.id) ?? [],
  }));
}

/** La cabecera, con la guarda de grupo. */
async function cargarImportacion(db, { importacionId, grupoId }) {
  return db.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId },
    select: { id: true, estado: true, proveedorId: true, archivoNombre: true },
  });
}

/** La previa lista para mostrar: los números y los omitidos con su texto. */
function respuestaDePrevia(plan) {
  return {
    resumen: plan.resumen,
    omitidos: plan.items
      .filter((x) => !x.revierte)
      .map((x) => ({
        productoBaseId: x.productoBaseId,
        nombre: x.nombre ?? null,
        motivo: x.motivo,
        texto: TEXTO_OMISION[x.motivo] ?? "No se puede revertir.",
      })),
    // El detalle completo viaja para poder mostrar el primer puñado sin pedirlo
    // de nuevo. La pantalla decide cuánto muestra.
    items: plan.items
      .filter((x) => x.revierte)
      .map((x) => ({
        productoBaseId: x.productoBaseId,
        nombre: x.nombre,
        costoActual: x.costoActual,
        costoDestino: x.costoDestino,
        ventaActual: x.ventaActual,
        ventaDestino: x.ventaDestino,
        ubicaciones: x.overrides.length,
        filasExcel: x.filasExcel,
      })),
  };
}

async function contexto(req, context) {
  // PRIMERO de todo: abre el contexto de request y registra el volcado de la
  // bitácora. Ver el comentario de arriba.
  const admin = requireAdmin(req);
  if (!admin.ok) return { error: NextResponse.json({ ok: false, error: admin.error }, { status: admin.status }) };

  const scope = await resolveScope(req);
  if (scope.error) {
    return {
      error: NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      ),
    };
  }

  const { id } = await context.params;
  const importacionId = Number(id);
  if (!Number.isInteger(importacionId)) {
    return { error: NextResponse.json({ ok: false, error: "Id inválido." }, { status: 400 }) };
  }

  const importacion = await cargarImportacion(prisma, { importacionId, grupoId: scope.grupoId });
  if (!importacion) {
    return { error: NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 }) };
  }

  // QUÉ IMPORTACIONES SE PUEDEN DESHACER. Las abiertas y las TERMINADAS: una
  // lista terminada es justo la que ya escribió cientos de costos, y cerrarla no
  // puede cerrar también la salida de emergencia. Una CANCELADA no entra —nunca
  // escribió un costo, el endpoint de cancelar la rechaza si estaba aplicada—,
  // así que ahí no hay nada que deshacer.
  if (!esImportacionRevertible(importacion.estado)) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error:
            "Esta importación no se puede deshacer: solo se deshacen las que están en curso o terminadas.",
        },
        { status: 409 }
      ),
    };
  }

  return { scope, importacionId, importacion };
}

// ── GET: la previa ──────────────────────────────────────────────────────────

export async function GET(req, context) {
  try {
    const ctx = await contexto(req, context);
    if (ctx.error) return ctx.error;
    const { scope, importacionId, importacion } = ctx;

    const productos = await cargarProductos(prisma, {
      importacionId,
      grupoId: scope.grupoId,
      proveedorId: importacion.proveedorId,
    });
    const plan = planDeReversion({ productos });

    return NextResponse.json({
      ok: true,
      importacionId,
      archivo: importacion.archivoNombre ?? null,
      ...respuestaDePrevia(plan),
    });
  } catch (e) {
    console.error("[listas/revertir] previa:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

// ── POST: la reversión ──────────────────────────────────────────────────────

export async function POST(req, context) {
  try {
    const ctx = await contexto(req, context);
    if (ctx.error) return ctx.error;
    const { scope, importacionId, importacion } = ctx;

    const body = await req.json().catch(() => ({}));
    const esperado = body?.confirmacion ?? null;

    const resultado = await prisma.$transaction(async (tx) => {
      const productos = await cargarProductos(tx, {
        importacionId,
        grupoId: scope.grupoId,
        proveedorId: importacion.proveedorId,
      });
      const plan = planDeReversion({ productos });
      const r = plan.resumen;

      // EL CANDADO CONTRA LA PREVIA VIEJA. Se comparan los tres números que la
      // persona vio en el modal. Si alguno cambió, alguien tocó un producto
      // mientras el modal estaba abierto y lo que se está por escribir no es lo
      // que se aprobó.
      if (esperado) {
        const difiere =
          Number(esperado.revierten) !== r.revierten ||
          Number(esperado.ventasQueSeTocan) !== r.ventasQueSeTocan ||
          Number(esperado.omitidos) !== r.omitidos;
        if (difiere) {
          return { conflicto: true, resumen: r, esperado };
        }
      }

      const ahora = new Date();
      const usuarioId = scope.session?.id ?? null;
      let productosRevertidos = 0;
      let filasRevertidas = 0;
      let ventasRevertidas = 0;
      let overridesRevertidos = 0;

      for (const item of plan.items) {
        if (!item.revierte) continue;

        // El maestro. La venta vuelve solo si el plan lo dice: cuando alguien la
        // movió a mano, `ventaDestino` viene en null y no se toca.
        const dataBase = { precio_costo: item.costoDestino };
        if (item.ventaDestino !== null) dataBase.precio_venta = item.ventaDestino;
        await tx.productoBase.update({ where: { id: item.productoBaseId }, data: dataBase });
        if (item.ventaDestino !== null) ventasRevertidas++;

        for (const ov of item.overrides) {
          const dataLocal = { precio_costo: ov.costoDestino };
          if (ov.ventaDestino !== null) dataLocal.precio_venta = ov.ventaDestino;
          await tx.productoLocal.update({ where: { id: ov.productoLocalId }, data: dataLocal });
          overridesRevertidos++;
        }

        // La fila vuelve a contar como pendiente y CONSERVA su lectura
        // confirmada: el trabajo de decidir cómo se lee el precio no se pierde
        // por deshacer la escritura. El historial de la aplicación tampoco se
        // borra: es la prueba de qué se había escrito.
        await tx.importacionListaFila.updateMany({
          where: { id: { in: item.filas }, importacionId },
          data: { aplicada: false, revertidaEn: ahora, revertidaPorUsuarioId: usuarioId },
        });
        productosRevertidos++;
        filasRevertidas += item.filas.length;
      }

      // La cabecera vuelve a estar abierta: quedaron filas sin aplicar.
      if (productosRevertidos > 0) {
        await tx.importacionListaProveedor.update({
          where: { id: importacionId },
          data: { estado: "PARCIALMENTE_APLICADA" },
        });
      }

      return {
        conflicto: false,
        resumen: r,
        escrito: {
          productos: productosRevertidos,
          filas: filasRevertidas,
          ventas: ventasRevertidas,
          overrides: overridesRevertidos,
        },
        omitidos: plan.items
          .filter((x) => !x.revierte)
          .map((x) => ({
            productoBaseId: x.productoBaseId,
            motivo: x.motivo,
            texto: TEXTO_OMISION[x.motivo] ?? "No se puede revertir.",
          })),
      };
    }, OPCIONES_TX);

    if (resultado.conflicto) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Los números cambiaron desde que se calculó la previa: alguien tocó un producto mientras tanto. " +
            "No se revirtió nada. Volvé a abrir la reversión para ver el estado de ahora.",
          resumen: resultado.resumen,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, importacionId, ...resultado });
  } catch (e) {
    console.error("[listas/revertir] ejecución:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
