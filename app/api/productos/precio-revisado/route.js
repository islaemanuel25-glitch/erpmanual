// app/api/productos/precio-revisado/route.js
//
// "PRECIO REVISADO": confirma que un precio se miró y sigue estando bien, SIN
// cambiar el importe.
//
// ── POR QUÉ HACE FALTA UNA ACCIÓN PROPIA ───────────────────────────────────
//
// El control de la pantalla es "última revisión", no "último cambio". La mitad de
// las veces que alguien mira un precio viejo la conclusión es que sigue
// correcto — y sin esta acción la única forma de sacarlo del control sería
// modificar el importe, o sea cambiar un precio para que deje de avisar. Eso es
// exactamente lo contrario de lo que el control busca.
//
// ── NO TOCA NI UN PESO ─────────────────────────────────────────────────────
//
// Escribe una sola columna, `precioRevisadoAt`, y solo en la ubicación que opera.
// Ni el precio, ni el costo, ni el margen, ni la regla. Un candado lo verifica.
//
// ── Y SOLO EN SU PROPIA UBICACIÓN ──────────────────────────────────────────
//
// Revisar el precio del Local A no dice nada sobre el del Local B: pueden ser
// precios distintos. El `where` va acotado a `localId` resuelto por el scope, no
// a lo que mande el cliente.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Confirmar un precio es una decisión sobre precios: pide el mismo permiso
    // que editarlos, no el de solo mirar el catálogo.
    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.productoBaseIds)
      ? body.productoBaseIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Indicá al menos un producto para marcar como revisado." },
        { status: 400 }
      );
    }

    const qLocal = Number(body?.localId || 0) || null;
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { localId } = scope;

    const revisadoEn = new Date();
    const r = await prisma.productoLocal.updateMany({
      // Acotado a la ubicación del scope: nunca a un localId que venga del
      // cliente sin validar.
      where: { localId, baseId: { in: ids } },
      data: { precioRevisadoAt: revisadoEn },
    });

    return NextResponse.json({
      ok: true,
      revisados: r.count,
      // Se informa cuántos se pidieron y cuántos se tocaron: si difieren es
      // porque alguno no está habilitado en esta ubicación, y eso hay que poder
      // verlo en vez de suponer que se marcaron todos.
      pedidos: ids.length,
      localId,
      precioRevisadoAt: revisadoEn,
    });
  } catch (err) {
    console.error("productos/precio-revisado", err);
    return NextResponse.json(
      { ok: false, error: `No se pudo marcar el precio como revisado: ${err.message}` },
      { status: 500 }
    );
  }
}
