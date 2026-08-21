// app/api/productos/controles/route.js
//
// LOS CONTADORES DE "PARA REVISAR". Devuelve cuántos productos marca cada control
// en la ubicación activa.
//
// ── EL MISMO SCOPE QUE PRODUCTOS, Y NO UNO PARECIDO ────────────────────────
//
// `resolveScope` y `productoVisibleWhere` son exactamente los que usa
// `/api/productos/listar`. Si acá se armara un scope propio, el contador miraría
// un universo distinto del listado y el número de la card no coincidiría con el
// total de la lista que abre — que es justamente lo que hay que evitar.
//
// ── SOLO ACTIVOS ───────────────────────────────────────────────────────────
//
// Son controles de MANTENIMIENTO: sirven para arreglar lo que se vende hoy. Un
// producto dado de baja con el precio viejo no es una tarea pendiente, y contarlo
// inflaría las cards con trabajo que nadie va a hacer.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { productoVisibleWhere } from "@/lib/visibilidad";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { CONTROLES } from "@/lib/productos/controlesCalidad";
import {
  contarDesdePrisma,
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
} from "@/lib/productos/controlesDesdePrisma";

// Mismo techo que el filtro del listado: los dos clasifican en memoria y tienen
// que cortar en el mismo lugar, o el contador vería más filas que la lista.
const MAX_CONTROL = 5000;

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "productos.ver");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { searchParams } = new URL(req.url);
    const qLocal = Number(searchParams.get("localId") || 0) || null;
    const scope = await resolveScope(req, { explicitLocalId: qLocal });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { localId } = scope;

    const where = {
      AND: [
        productoVisibleWhere(localId),
        // Solo activos: ver el comentario de arriba.
        { activo: true },
      ],
    };

    const rows = await prisma.productoBase.findMany({
      where,
      take: MAX_CONTROL + 1,
      select: {
        ...SELECT_CONTROLES_BASE,
        locales: { where: { localId }, take: 1, select: SELECT_CONTROLES_LOCAL },
      },
    });

    const truncado = rows.length > MAX_CONTROL;
    const conteo = contarDesdePrisma(truncado ? rows.slice(0, MAX_CONTROL) : rows);

    return NextResponse.json({
      ok: true,
      // La definición de las cards viaja con los números: la pantalla no tiene
      // que saber cuáles son los controles ni en qué orden van. Agregar un quinto
      // es agregarlo al array del dominio.
      controles: CONTROLES.map((c) => ({ ...c, cantidad: conteo[c.id] ?? 0 })),
      localId,
      truncado,
    });
  } catch (err) {
    console.error("productos/controles", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron calcular los controles: ${err.message}` },
      { status: 500 }
    );
  }
}
