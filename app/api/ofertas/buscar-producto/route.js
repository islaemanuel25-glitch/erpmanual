import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { buscarProductosOfertables } from "@/lib/ofertas/servidor";
import { descuentoPctDesdePrecios, margenOferta } from "@/lib/ofertas/precio";

// BUSCADOR DE PRODUCTOS PARA ARMAR UNA OFERTA.
//
// Pide `ofertas.crear` o `ofertas.editar` —no `productos.ver`—: quien arma
// ofertas no tiene por qué poder entrar al catálogo, y al revés tampoco.
//
// Devuelve el precio y el COSTO de hoy. El costo es información sensible, y por
// eso esta ruta no la puede pedir cualquiera: sin él, la persona estaría fijando
// precios de oferta a ciegas, que es exactamente lo que el módulo vino a evitar.

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    const { localId, session } = scope;

    const perm = checkPerm(session, ["ofertas.crear", "ofertas.editar"]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") || "";

    const items = await buscarProductosOfertables(prisma, { localId, q });

    return NextResponse.json({
      ok: true,
      items: items.map((p) => ({
        ...p,
        // El margen que tendría hoy a precio normal. Sirve para que la persona
        // vea con cuánto aire cuenta ANTES de escribir el precio de oferta.
        margenNormal: margenOferta(p.precioNormal, p.costo).importe,
        margenNormalPct: margenOferta(p.precioNormal, p.costo).pct,
        // Un producto sin precio no se puede ofertar: se informa acá para que la
        // pantalla lo muestre deshabilitado en vez de dejar que se elija y
        // rebote al guardar.
        ofertable: p.precioNormal > 0,
        descuentoDeEjemplo: descuentoPctDesdePrecios(p.precioNormal, p.precioNormal * 0.9),
      })),
    });
  } catch (err) {
    console.error("Error buscando productos ofertables:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron buscar los productos: ${err.message}` },
      { status: 500 }
    );
  }
}
