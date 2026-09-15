import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";
import { buscarProductosOfertables } from "@/lib/ofertas/servidor";
import { descuentoPctDesdePrecios, margenOferta } from "@/lib/ofertas/precio";
import { getConfigLocalEfectiva } from "@/lib/config/local";
import { getGrupoIdDeLocal } from "@/lib/grupos";

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

    // ── ¿ESTE LOCAL PUEDE VENDER SIN STOCK? ────────────────────────────────
    //
    // Sale de `getConfigLocalEfectiva`, que es la MISMA puerta que usa el
    // buscador del POS —y que existe porque antes se leía `ConfiguracionGrupo`
    // directo y el aviso visual divergía del enforcement real por ubicación—.
    //
    // La pantalla lo necesita para decidir si un stock en cero o negativo es una
    // ALERTA o un dato más: con venta sin stock habilitada, un negativo es
    // normal y avisar sería ruido permanente.
    const grupoIdDelLocal = await getGrupoIdDeLocal(localId);
    let permiteVenderSinStock = false;
    if (grupoIdDelLocal) {
      const eff = await getConfigLocalEfectiva(localId, grupoIdDelLocal, {});
      permiteVenderSinStock = eff.allowNegativeStock === true;
    }

    return NextResponse.json({
      ok: true,
      permiteVenderSinStock,
      items: items.map((p) => ({
        ...p,
        // Viaja EN CADA ITEM y no solo en la raíz: la pantalla monta
        // `BuscadorProductos`, que le pasa al `onAgregar` el item elegido y
        // nada más. Un campo en la raíz no llegaría nunca al producto que se
        // eligió, que es donde se necesita para decidir si el stock es una
        // alerta o un dato.
        permiteVenderSinStock,
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
