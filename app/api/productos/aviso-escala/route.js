// app/api/productos/aviso-escala/route.js
//
// QUÉ PRECIOS QUEDAN MAL SI SE GUARDA ESTE CAMBIO DE ESCALA.
//
// Se consulta ANTES de guardar, desde el formulario del producto, y no escribe
// nada: devuelve el aviso para que la persona decida. La decisión de Emanuel del
// 2026-08-19 es explícita — **avisar, no convertir**: cambiar un precio
// automáticamente en cinco ubicaciones es peor que el problema, porque pisaría
// las correcciones hechas a mano sin que nadie se entere.
//
// POR QUÉ HACE FALTA UNA RUTA Y NO ALCANZA EL FORMULARIO. El aviso tiene que
// decir en QUÉ ubicaciones queda mal el precio, y el formulario solo conoce la
// suya: `productos/obtener` trae el override del local activo y nada más. Las
// otras hay que leerlas del servidor, con el mismo alcance por grupo que el
// resto — de ahí que se resuelva `scope` igual que en `obtener` y que las
// ubicaciones salgan SIEMPRE del grupo del alcance y nunca de lo que mande el
// cliente.
//
// La cuenta no vive acá: es `avisoDeCambioDeEscala`, una función pura con sus
// candados, que también usan los candados del margen implícito.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveScope } from "@/lib/grupos";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { avisoDeCambioDeEscala } from "@/lib/precios/avisoCambioDeEscala";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Mismo permiso que editar: el aviso muestra precios de otras ubicaciones, así
    // que no puede ser más laxo que la acción que lo motiva.
    const perm = checkPerm(session, "productos.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const body = await req.json().catch(() => null);
    const id = Number(body?.id || 0);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ ok: false, error: "ID inválido" }, { status: 400 });
    }
    if (!body?.despues || typeof body.despues !== "object") {
      return NextResponse.json(
        { ok: false, error: "Falta el estado de escala propuesto" },
        { status: 400 }
      );
    }

    const scope = await resolveScope(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, ...(scope.needsContexto ? { needsContexto: true } : {}) },
        { status: scope.status }
      );
    }
    const { grupoId } = scope;

    const base = await prisma.productoBase.findUnique({
      where: { id },
      select: {
        id: true,
        grupoId: true,
        unidad_medida: true,
        factor_pack: true,
        pesoReferenciaKg: true,
        pesoEsFijo: true,
        modoVentaDeposito: true,
        modoCompraProveedor: true,
        precio_venta: true,
        locales: {
          select: {
            localId: true,
            precio_venta: true,
            local: { select: { nombre: true } },
          },
        },
      },
    });

    // Igual que en `obtener`: inexistente o de otro grupo → 404, sin revelar cuál
    // de las dos cosas es.
    if (!base || base.grupoId !== grupoId) {
      return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
    }

    // El precio que se avisa es el de CADA ubicación, con el de la ficha como
    // respaldo cuando la ubicación no tiene override — que es exactamente la
    // precedencia que usa la pantalla para mostrarlo.
    const ubicaciones = (base.locales || []).map((l) => ({
      localId: l.localId,
      nombre: l.local?.nombre ?? null,
      precioVenta: l.precio_venta ?? base.precio_venta,
    }));

    const aviso = avisoDeCambioDeEscala({
      antes: {
        unidad_medida: base.unidad_medida,
        factor_pack: base.factor_pack,
        pesoReferenciaKg: base.pesoReferenciaKg,
        pesoEsFijo: base.pesoEsFijo,
        modoVentaDeposito: base.modoVentaDeposito,
        // Igual que en el formulario: el predicado compartido lo exige.
        modoCompraProveedor: base.modoCompraProveedor,
      },
      despues: body.despues,
      ubicaciones,
    });

    return NextResponse.json({ ok: true, aviso });
  } catch (err) {
    console.error("productos/aviso-escala", err);
    return NextResponse.json(
      { ok: false, error: err.message || "No se pudo calcular el aviso de cambio de escala" },
      { status: 500 }
    );
  }
}
