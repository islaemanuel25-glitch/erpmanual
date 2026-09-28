// lib/stock/libro/stockDiarioRutas.js
//
// LO QUE HACEN LAS RUTAS DE `app/api/stock_locales/diario/`, después de exigir
// la sesión y `stock.ver` —eso queda escrito en cada ruta, a la vista—.
//
//   1. La ubicación, con `resolveVistaOperativa` y `localDeLaVista`: un usuario
//      con local ve el suyo, el depósito también; un admin en vista global elige
//      uno de su grupo activo.
//   2. El período pedido (`rangoDelPedido`), con la semana de Semana Operativa.
//   3. El motor (`stockDiarioServer.js`), que responde en una instantánea de
//      solo lectura.
//   4. La forma del contrato (`stockDiarioApi.js`).
//
// Nada escribe, nada se guarda. Este módulo usa el cliente de la app y Next: la
// sonda de la terminal no lo importa.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveVistaOperativa } from "@/lib/grupos";
import {
  cadenaApi,
  conteosDeCadenas,
  leerFiltroProductos,
  leerId,
  leerPagina,
  leerPedidoDePeriodo,
  localApi,
  localDeLaVista,
  paginaDeMovimientosApi,
  paginaDeProductos,
  periodoApi,
  respuestaDeError,
  totalesApi,
} from "./stockDiarioApi.js";
import { detalleDeCadena, movimientosDelPeriodo, stockDelPeriodo } from "./stockDiarioServer.js";
import { rangoDelPedido } from "./stockDiarioPorUnidadServer.js";

const json = (body, status = 200) => NextResponse.json(body, { status });

/**
 * La ubicación que se mira, o la respuesta de error. Primero el alcance —quién
 * puede mirar qué— y recién después se lee el resto de la URL.
 */
async function ubicacionDelPedido(req, sp) {
  const vista = await resolveVistaOperativa(req);
  if (vista.error) return { respuesta: json({ ok: false, error: vista.error, needsContexto: vista.needsContexto }, vista.status) };
  const elegido = localDeLaVista(vista, sp.get("localId"));
  if (elegido.error) return { respuesta: json({ ok: false, error: elegido.error }, elegido.status) };
  const local = await prisma.local.findUnique({ where: { id: elegido.localId }, select: { id: true, nombre: true, es_deposito: true } });
  if (!local) return { respuesta: json({ ok: false, error: "Esa ubicación no existe." }, 404) };
  return { local };
}

/** El esqueleto común: alcance, lectura, armado, errores. */
async function responder(req, armar) {
  try {
    const sp = new URL(req.url).searchParams;
    const { local, respuesta } = await ubicacionDelPedido(req, sp);
    if (respuesta) return respuesta;
    const pedido = leerPedidoDePeriodo(sp);
    const rango = await rangoDelPedido(prisma, { localId: local.id, ...pedido });
    return json({ ok: true, local: localApi(local), ...(await armar({ sp, local, rango })) });
  } catch (err) {
    const { status, body } = respuestaDeError(err);
    if (status >= 500) console.error("Stock Diario:", err);
    return json(body, status);
  }
}

/** GET /api/stock_locales/diario/resumen */
export function responderResumen(req) {
  return responder(req, async ({ local, rango }) => {
    const r = await stockDelPeriodo(prisma, { localId: local.id, desde: rango.desde, hasta: rango.hasta });    const fuera = r.totales === null;
    return {
      ...periodoApi(r, rango),
      totales: totalesApi(r.totales),
      conteos: fuera ? null : conteosDeCadenas(r.cadenas),
    };
  });
}

/** GET /api/stock_locales/diario/productos */
export function responderProductos(req) {
  return responder(req, async ({ sp, local, rango }) => {
    const filtros = leerFiltroProductos(sp);
    const pagina = leerPagina(sp);
    const r = await stockDelPeriodo(prisma, { localId: local.id, desde: rango.desde, hasta: rango.hasta });
    const p = paginaDeProductos(r.cadenas, filtros, pagina);
    return { ...periodoApi(r, rango), filtros, ...p, items: p.items.map((c) => cadenaApi(c)) };
  });
}

/** GET /api/stock_locales/diario/producto — una cadena, con sus movimientos paginados. */
export function responderProducto(req) {
  return responder(req, async ({ sp, local, rango }) => {
    const productoLocalId = leerId(sp, "productoLocalId", { obligatorio: true });
    const pagina = leerPagina(sp);
    const r = await detalleDeCadena(prisma, { localId: local.id, productoLocalId, desde: rango.desde, hasta: rango.hasta, ...pagina });
    return {
      ...periodoApi(r, rango),
      producto: { ...cadenaApi(r.cadena, { conDetalle: true }), existio: r.cadena.existio },
      movimientos: paginaDeMovimientosApi(r.movimientos),
    };
  });
}

/** GET /api/stock_locales/diario/movimientos — del local, o de una cadena, paginados en la base. */
export function responderMovimientos(req) {
  return responder(req, async ({ sp, local, rango }) => {
    const productoLocalId = leerId(sp, "productoLocalId");
    const pagina = leerPagina(sp);
    const r = await movimientosDelPeriodo(prisma, { localId: local.id, desde: rango.desde, hasta: rango.hasta, productoLocalId, ...pagina });
    return { ...periodoApi(r, rango), movimientos: paginaDeMovimientosApi(r.movimientos) };
  });
}
