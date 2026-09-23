// app/api/finanzas/pagos-proveedores/origenes/route.js
//
// DE QUÉ UBICACIONES PUEDE SALIR LA PLATA de un pago que registre quien
// pregunta. Es el selector "De dónde sale el dinero" del formulario de pago, y
// lo pide la hoja de cierre de una compra, donde todavía no hay cuenta que abrir.
//
// La lista sale de `origenesDePago`, la misma que viaja en el detalle de una
// cuenta: un local ve solo la suya, el depósito las de su grupo. Y la ruta que
// escribe vuelve a comprobar el origen con `resolverLocalPedido`, así que esta
// lista ayuda a elegir y no es la garantía.

import { NextResponse } from "next/server";

import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { PERMISO_REGISTRAR_PAGOS } from "@/lib/finanzas/pagosProveedores";
import { alcanceDePagos, origenesDePago } from "@/lib/finanzas/pagosProveedoresServer";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // El mismo permiso que el de los turnos operativos, y por el mismo motivo.
    const perm = checkPerm(session, PERMISO_REGISTRAR_PAGOS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    return NextResponse.json({ ok: true, origenes: origenesDePago(alcance) });
  } catch (e) {
    console.error("[finanzas/pagos-proveedores/origenes]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las ubicaciones de origen: ${e.message}` },
      { status: 500 }
    );
  }
}
