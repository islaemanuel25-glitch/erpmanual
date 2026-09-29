// app/api/finanzas/gastos/categorias/route.js
//
// LAS CATEGORÍAS QUE SE OFRECEN AL CREAR UN GASTO: las activas, por su orden.
//
// Salen de la tabla, no de una lista escrita acá: la migración sembró las
// iniciales y el catálogo puede crecer o dar de baja una sin tocar código. Una
// categoría dada de baja no se ofrece, pero un gasto viejo la sigue mostrando
// en su detalle: eso lo resuelve `SELECT_GASTO`, no esta lista.
//
// Es un catálogo global, como `Categoria` de productos: no depende de la
// ubicación. Igual exige `finanzas.ver`, porque es parte de Finanzas.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { categoriasDeGasto } from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_VER_FINANZAS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    return NextResponse.json({ ok: true, categorias: await categoriasDeGasto(prisma) });
  } catch (e) {
    console.error("[finanzas/gastos/categorias]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las categorías de gasto: ${e.message}` },
      { status: 500 }
    );
  }
}
