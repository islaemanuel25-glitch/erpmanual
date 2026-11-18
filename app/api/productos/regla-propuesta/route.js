// app/api/productos/regla-propuesta/route.js
//
// LA GANANCIA QUE EL ALTA LE PROPONE A UN PRODUCTO NUEVO, según su categoría y
// su proveedor. No escribe nada. La cuenta es `reglaPropuestaParaElAlta`
// (`lib/precios/reglaPropuesta.js`), con su porqué.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { reglaPropuestaParaElAlta } from "@/lib/precios/reglaPropuesta";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // El mismo permiso que el alta que la pide.
    const perm = checkPerm(session, "productos.crear");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const url = new URL(req.url);
    const aNumero = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
    const propuesta = await reglaPropuestaParaElAlta(prisma, {
      grupoId: scope.grupoId,
      categoriaId: aNumero(url.searchParams.get("categoriaId")),
      proveedorId: aNumero(url.searchParams.get("proveedorId")),
    });
    return NextResponse.json({ ok: true, propuesta });
  } catch (e) {
    console.error("ERROR productos/regla-propuesta:", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo calcular la ganancia propuesta: ${e?.message ?? "sin detalle"}. Elegila a mano.` },
      { status: 500 }
    );
  }
}
