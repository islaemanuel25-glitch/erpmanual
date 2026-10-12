// lib/integraciones/azul-chat/stockConsultaServer.js
//
// LAS CONSULTAS DE `stock_consulta`. Solo lee; el armado es puro y está en
// stockConsulta.js.
//
// El universo es el de la pantalla Stock Locales y su card "Bajo mínimo": el
// producto del local activo, con la ficha base activa, sin combos y visible
// para el local (`whereCatalogoLocal` con `soloActivos`). Cada fila se lee con
// el mismo `select` que el listado y se arma con `mapStockItemLocal` o
// `mapStockItemDeposito`, según el local.
//
//   · producto: la búsqueda es `buscarCatalogoLocal`, el buscador de productos
//     del ERP; después se leen las filas de stock de esos (hasta 10) productos,
//     en el orden del buscador.
//   · bajo_minimo: los productos del local con límites AJUSTADOS
//     (`limitesConfiguradosAt` y `stockMin` cargados), mapeados, y de ésos los
//     que `mapItem` marca como `faltante` —el camino "faltantes" del listado—.
//     Si el local no tiene ni uno con mínimo ajustado, no hay stock mínimo que
//     consultar: STOCK_MINIMO_NO_DISPONIBLE.
//
// La rama depósito del listado CREA las filas que le faltan al abrirse
// (`listar/route.js`, el guard self-healing). Esto no: es solo lectura, así que
// un producto del grupo que el depósito todavía no materializó no aparece hasta
// que alguien abra la pantalla.

import { mapStockItemLocal, mapStockItemDeposito } from "@/lib/stock/mapItem";
import { buscarCatalogoLocal, whereCatalogoLocal } from "@/lib/productos/buscarCatalogoLocal";
import {
  resolverPedido,
  productoDeStock,
  compararBajoMinimo,
  armarStockConsulta,
  MAX_BAJO_MINIMO,
} from "./stockConsulta.js";

/**
 * Lo que el listado de Stock Locales lee de cada producto, SIN precios ni
 * márgenes —ni del producto del local ni de su ficha base—: la capacidad no los
 * devuelve, así que tampoco los trae. `mapStockItem*` igual arma sus campos de
 * precio, en NaN, y `productoDeStock` no los copia.
 */
const SELECT_BASE = Object.freeze({
  id: true,
  nombre: true,
  codigo_barra: true,
  categoria_id: true,
  proveedor_id: true,
  area_fisica_id: true,
  unidad_medida: true,
  factor_pack: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  pesoEsFijo: true,
  modoVentaDeposito: true,
});

const selectDe = (localId) => ({
  id: true,
  localId: true,
  base: { select: SELECT_BASE },
  stock: {
    where: { localId },
    take: 1,
    select: { cantidad: true, stockMin: true, stockMax: true, limitesConfiguradosAt: true },
  },
});

/**
 * Ejecuta la capacidad para una autorización ya concedida. El local y el grupo
 * salen de la AUTORIZACIÓN, nunca del cuerpo.
 *
 * @param {{localId:number, grupoId:number}} autorizacion
 * @param {{modo:unknown, texto?:unknown}} parametros
 * @param {{db:object}} deps `db` es el cliente Prisma.
 */
export async function stockConsulta(autorizacion, parametros, { db }) {
  const pedido = resolverPedido(parametros);
  if (!pedido.ok) return pedido;

  const local = await db.local.findUnique({
    where: { id: autorizacion.localId },
    select: { id: true, nombre: true, es_deposito: true },
  });
  if (!local) {
    return { ok: false, status: 403, codigo: "LOCAL_SIN_GRUPO", error: "El local pedido no existe." };
  }
  const esDeposito = local.es_deposito === true;
  const mapear = (pl) => {
    const fila = pl.stock?.[0];
    const item = esDeposito ? mapStockItemDeposito(pl, pl.base, fila, local.id) : mapStockItemLocal(pl, pl.base, fila);
    return { item, fila };
  };
  const universo = whereCatalogoLocal(local.id, { soloActivos: true });

  if (pedido.modo === "producto") {
    const busqueda = await buscarCatalogoLocal(db, { localId: local.id, q: pedido.texto, soloActivos: true });
    const ids = busqueda.items.map((i) => i.productoLocalId);
    const filas = ids.length
      ? await db.productoLocal.findMany({ where: { ...universo, id: { in: ids } }, select: selectDe(local.id) })
      : [];
    const orden = new Map(ids.map((id, i) => [id, i]));
    filas.sort((a, b) => orden.get(a.id) - orden.get(b.id));
    const productos = filas.map(mapear).map(({ item, fila }) => productoDeStock(item, fila, esDeposito));
    return {
      ok: true,
      datos: armarStockConsulta({
        local,
        grupoId: autorizacion.grupoId,
        pedido,
        productos,
        total: null,
        hayMas: busqueda.coincidencias > ids.length,
      }),
    };
  }

  // bajo_minimo: los que tienen el mínimo ajustado, y de ésos los faltantes.
  const conMinimo = await db.productoLocal.findMany({
    where: {
      ...universo,
      stock: { some: { localId: local.id, limitesConfiguradosAt: { not: null }, stockMin: { not: null } } },
    },
    select: selectDe(local.id),
  });
  if (conMinimo.length === 0) {
    return {
      ok: false,
      status: 409,
      codigo: "STOCK_MINIMO_NO_DISPONIBLE",
      error: "Ningún producto de este local tiene el stock mínimo ajustado.",
    };
  }
  const faltantes = conMinimo
    .map(mapear)
    .filter(({ item }) => item.faltante)
    .sort((a, b) => compararBajoMinimo(a.item, b.item));
  return {
    ok: true,
    datos: armarStockConsulta({
      local,
      grupoId: autorizacion.grupoId,
      pedido,
      productos: faltantes.slice(0, MAX_BAJO_MINIMO).map(({ item, fila }) => productoDeStock(item, fila, esDeposito)),
      total: faltantes.length,
      hayMas: faltantes.length > MAX_BAJO_MINIMO,
    }),
  };
}
