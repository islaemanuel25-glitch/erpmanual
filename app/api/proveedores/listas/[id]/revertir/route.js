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
// `requirePerm` llama a `getUsuarioSession`, que siembra el contexto y registra
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
import { requirePerm } from "@/lib/authorize";
import { importacionDeProveedorPropioWhere } from "@/lib/visibilidad";
import { OPCIONES_TX, esImportacionRevertible } from "@/lib/proveedores/listas/persistencia";
// Leer, previsualizar y escribir la reversión vive en `revertirEnLaBase.js`
// desde que cancelar una lista aplicada también deshace (2026-10-24): las dos
// rutas escriben con la misma función.
import {
  difiereDeLaPrevia,
  escribirReversion,
  omitidosDelPlan,
  planDeLaImportacion,
  respuestaDePrevia,
} from "@/lib/proveedores/listas/revertirEnLaBase";

/** La cabecera, con la guarda de grupo y la de proveedor propio. */
async function cargarImportacion(db, { importacionId, grupoId, propia }) {
  return db.importacionListaProveedor.findFirst({
    where: { id: importacionId, grupoId, ...propia },
    // `archivoHash` hace falta para saber si otra importación ABIERTA del mismo
    // archivo está ocupando el índice único antes de intentar reabrir ésta.
    // Sin él la única forma de enterarse era el P2002, que se lleva puesta la
    // transacción entera.
    select: { id: true, estado: true, proveedorId: true, archivoNombre: true, archivoHash: true },
  });
}

async function contexto(req, context) {
  // PRIMERO de todo: abre el contexto de request y registra el volcado de la
  // bitácora. Ver el comentario de arriba.
  const acceso = requirePerm(req, "proveedores.listas");
  if (!acceso.ok) return { error: NextResponse.json({ ok: false, error: acceso.error }, { status: acceso.status }) };

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

  const importacion = await cargarImportacion(prisma, {
    importacionId,
    grupoId: scope.grupoId,
    propia: importacionDeProveedorPropioWhere(scope.localId, acceso.session.esAdmin),
  });
  if (!importacion) {
    return { error: NextResponse.json({ ok: false, error: "Importación no encontrada." }, { status: 404 }) };
  }

  // QUÉ IMPORTACIONES SE PUEDEN DESHACER: las que nadie cerró —abiertas y
  // APLICADA— (`esImportacionRevertible`, 2026-10-24). TERMINADA y CANCELADA
  // son las cerradas de verdad: terminar es "queda como está", y cancelar ya
  // deshizo lo aplicado. Esta misma previa es la que muestra "Cancelar la
  // lista", así que cancelar llega exactamente hasta donde llega deshacer.
  if (!esImportacionRevertible(importacion.estado)) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          error:
            "Esta lista ya está cerrada (terminada o cancelada), así que no se puede deshacer.",
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

    const plan = await planDeLaImportacion(prisma, {
      importacionId,
      grupoId: scope.grupoId,
      proveedorId: importacion.proveedorId,
    });

    return NextResponse.json({
      ok: true,
      importacionId,
      archivo: importacion.archivoNombre ?? null,
      ...respuestaDePrevia(plan),
    });
  } catch (e) {
    console.error("[listas/revertir] previa:", e);
    return NextResponse.json(
      { ok: false, error: "No se pudo calcular qué se deshace. No se tocó ningún costo. Probá de nuevo." },
      { status: 500 }
    );
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
      const plan = await planDeLaImportacion(tx, {
        importacionId,
        grupoId: scope.grupoId,
        proveedorId: importacion.proveedorId,
      });
      const r = plan.resumen;

      // La previa vieja no escribe (`difiereDeLaPrevia`).
      if (esperado && difiereDeLaPrevia(esperado, r)) {
        return { conflicto: true, resumen: r, esperado };
      }

      // Declara el origen en el Libro de Costos y escribe.
      const escrito = await escribirReversion(tx, {
        plan,
        importacionId,
        usuarioId: scope.session?.id ?? null,
      });

      // ── LA CABECERA VUELVE A ABRIRSE, SALVO QUE NO PUEDA ─────────────────
      //
      // Reabrirla la mete en el índice único `importacion_archivo_unica`, que
      // impide dos importaciones ABIERTAS del mismo archivo para el mismo
      // proveedor. Si mientras tanto alguien subió otra vez ese mismo archivo
      // —que es exactamente lo que pasa cuando se prueba subir la lista dos
      // veces— el `update` explota con un P2002 y se lleva puesta TODA la
      // transacción: los costos no se revertían y la pantalla decía "Error
      // interno".
      //
      // Deshacer es una sola cosa: devolver los costos. Eso se hace igual. Lo
      // que no se puede hacer es reabrir la lista, así que se informa en vez de
      // fallar: la lista queda cerrada, con sus costos devueltos, y el mensaje
      // dice cuál es la otra importación que ocupa el lugar.
      let noSePudoReabrir = null;
      if (escrito.productos > 0) {
        const ocupa = await tx.importacionListaProveedor.findFirst({
          where: {
            grupoId: scope.grupoId,
            proveedorId: importacion.proveedorId,
            archivoHash: importacion.archivoHash,
            estado: { in: ["BORRADOR", "CONCILIADA", "PARCIALMENTE_APLICADA"] },
            id: { not: importacionId },
          },
          select: { id: true, archivoNombre: true },
        });
        if (ocupa) {
          noSePudoReabrir = ocupa;
        } else {
          await tx.importacionListaProveedor.update({
            where: { id: importacionId },
            data: { estado: "PARCIALMENTE_APLICADA" },
          });
        }
      }

      return {
        conflicto: false,
        noSePudoReabrir,
        resumen: r,
        escrito,
        omitidos: omitidosDelPlan(plan),
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
    // El día que producción se cayó, lo único que se vio fue "Error interno".
    // Salía de un `catch` como éste. La transacción es atómica, así que se
    // puede afirmar lo que más importa saber: que no quedó nada a medias.
    console.error("[listas/revertir] ejecución:", e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "No se pudo deshacer. Ningún costo cambió: la operación es todo o nada, así que quedó como estaba. Probá de nuevo.",
      },
      { status: 500 }
    );
  }
}
