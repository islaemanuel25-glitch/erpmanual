// app/api/stock_locales/resumen/route.js
//
// LOS CUATRO CONTADORES DE "ESTADO DEL STOCK".
//
// ── UNA SOLA CONSULTA, Y AGREGADA EN POSTGRES ─────────────────────────────
//
// No devuelve productos: devuelve cuatro números. Es deliberado y es el punto
// más delicado de esta ruta.
//
// Lo que NO se podía hacer, y estaba escrito en el encargo:
//
//   · bajar todo el catálogo para contarlo;
//   · correr cuatro listados completos;
//   · contar en el navegador.
//
// Y no es una precaución teórica. El filtro `faltantes` de `listar/route.js` ya
// traía el conjunto COMPLETO a memoria antes de paginar —lo admite su propio
// comentario—, así que cuatro cards alimentadas de esa forma habrían sido cuatro
// barridos del catálogo por cada entrada a la pantalla.
//
// Acá son cuatro `COUNT(*) FILTER (WHERE …)` en la MISMA pasada: PostgreSQL
// recorre la tabla del local una vez y devuelve los cuatro totales.
//
// ── LAS CONDICIONES NO SE ESCRIBEN ACÁ ────────────────────────────────────
//
// Salen de `lib/stock/estadosDeStock.js`, que es el mismo módulo del que las
// toma el filtro del listado. Si cada uno escribiera la suya, el número de la
// card y el total de la lista podrían separarse sin que nada fallara: la card
// diría 12 y la lista mostraría 9, las dos con cara de estar bien.
//
// ── POR QUÉ NO USA `groupBy` DE PRISMA ────────────────────────────────────
//
// Porque los cuatro estados SE SUPERPONEN: un producto sin stock y con límites
// configurados cuenta en "Sin stock" Y en "Bajo mínimo". Un `groupBy` reparte
// cada fila en un solo grupo, así que daría una partición — que es justamente lo
// que estas cards NO son.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { ESTADOS, condicionesSql } from "@/lib/stock/estadosDeStock";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Sesión no encontrada o vencida. Volvé a entrar." },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "stock.ver");
    if (!perm.ok) {
      return NextResponse.json(
        { ok: false, error: "No tenés permiso para ver el stock de esta ubicación." },
        { status: 403 }
      );
    }

    const permisos = session.permisos || [];
    const esAdmin = Array.isArray(permisos) && permisos.includes("*");
    const sessionLocalId = session.localId || null;

    // Mismo criterio de resolución de ubicación que `listar`: un admin sin local
    // fijo tiene que decir cuál, y cualquier otro usa el suyo. Si esto se
    // separara del listado, la card contaría sobre una ubicación y la lista
    // mostraría otra.
    const { searchParams } = new URL(req.url);
    let localId = null;
    if (esAdmin && !sessionLocalId) {
      localId = Number(searchParams.get("localId") || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "Falta la ubicación: un admin sin local fijo tiene que decir cuál mirar." },
          { status: 400 }
        );
      }
    } else {
      localId = Number(sessionLocalId || 0);
      if (!localId) {
        return NextResponse.json(
          { ok: false, error: "La sesión no tiene una ubicación válida para consultar stock." },
          { status: 400 }
        );
      }
    }

    const cond = condicionesSql("sl");

    // ── EL UNIVERSO ES EL DEL LISTADO, NO LA TABLA DE STOCK ────────────────
    //
    // Se cuenta sobre `ProductoLocal` con LEFT JOIN a `StockLocal`, y con los
    // mismos filtros de universo que usa `listar`: local, producto activo, base
    // activa y sin combos.
    //
    // Contar directo sobre `StockLocal` se separaba del listado por los dos
    // lados: de menos, porque un producto sin fila de stock no aparecía; y de
    // más, porque incluía filas de productos inactivos y de combos, que el
    // listado no muestra. Los combos además no tienen stock físico propio.
    //
    // Los fragmentos son constantes del módulo, no entran por la URL: lo único
    // que viene de afuera es `localId`, y va como parámetro ligado.
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE ${cond["bajo-minimo"]})           AS "bajo_minimo",
        COUNT(*) FILTER (WHERE ${cond["sin-stock"]})             AS "sin_stock",
        COUNT(*) FILTER (WHERE ${cond["limites-sin-ajustar"]})   AS "limites_sin_ajustar",
        COUNT(*) FILTER (WHERE ${cond["sobre-maximo"]})          AS "sobre_maximo",
        COUNT(*)                                                 AS "total"
      FROM "ProductoLocal" pl
      JOIN "ProductoBase" pb ON pb."id" = pl."baseId"
      LEFT JOIN "Local" cel ON cel."id" = pb."creadoEnLocalId"
      LEFT JOIN "StockLocal" sl
        ON sl."productoId" = pl."id" AND sl."localId" = pl."localId"
      WHERE pl."localId" = $1
        AND pl."activo" = true
        AND pb."activo" = true
        AND pb."es_combo" = false
        -- ── LA MISMA REGLA DE VISIBILIDAD QUE EL LISTADO ──────────────────
        --
        -- OJO: esto vive DENTRO de un template literal, así que acá adentro no
        -- pueden ir acentos graves. Poner uno cierra la cadena y el archivo deja
        -- de parsear; ya pasó al escribir este bloque, y el error que da nombra
        -- un identificador y no la comilla.
        --
        -- productoVisibleWhere(localId) esconde el producto creado en OTRO
        -- local que no sea depósito. El listado lo aplica en sus dos ramas; el
        -- resumen no lo hacía, así que contaba cáscaras de ProductoLocal que la
        -- lista nunca muestra: la card decía un número más alto y no había forma
        -- de llegar a esas filas.
        --
        -- Escrito en POSITIVO y no como un NOT (...): con creadoEnLocalId en
        -- null, el NOT da NULL y la fila se cae del conteo, que es justamente el
        -- caso más común porque el producto sin local creador lo ven todos.
        AND (
          pb."creadoEnLocalId" IS NULL
          OR cel."es_deposito" = true
          OR pb."creadoEnLocalId" = $1
        )
    `;

    const filas = await prisma.$queryRawUnsafe(sql, localId);
    const r = filas?.[0] || {};

    // `COUNT` vuelve como BigInt: `Number` explícito para que el JSON no explote
    // con "Do not know how to serialize a BigInt".
    const n = (v) => Number(v ?? 0);
    const porId = {
      "bajo-minimo": n(r.bajo_minimo),
      "sin-stock": n(r.sin_stock),
      "limites-sin-ajustar": n(r.limites_sin_ajustar),
      "sobre-maximo": n(r.sobre_maximo),
    };

    return NextResponse.json({
      ok: true,
      localId,
      // Se devuelve el ORDEN del dominio, no el que salga del objeto: el diseño
      // aprobado tiene un 2×2 con un orden concreto y decidirlo en la pantalla
      // sería repartir la misma decisión en dos lugares.
      estados: ESTADOS.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        detalle: e.detalle,
        detalleSano: e.detalleSano,
        rol: e.rol,
        cantidad: porId[e.id] ?? 0,
      })),
      total: n(r.total),
    });
  } catch (err) {
    console.error("stock_locales/resumen:", err);
    return NextResponse.json(
      { ok: false, error: `No se pudieron contar los estados de stock: ${err.message}` },
      { status: 500 }
    );
  }
}
