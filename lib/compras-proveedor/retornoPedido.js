// lib/compras-proveedor/retornoPedido.js
//
// IR A EDITAR UN PRODUCTO DESDE UNA LÍNEA DEL PEDIDO, Y VOLVER.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El principio: toda edición de un dato del producto —precio, código, lo que
// sea— se hace desde editar producto. Ninguna otra pantalla escribe datos del
// producto por su cuenta.
//
// El caso real que lo motiva: el proveedor canta un aumento mientras se arma el
// pedido. Antes eso se corregía tocando el costo de la línea, y ese costo se
// propagaba al catálogo como efecto lateral. Ahora se abre el producto, se le
// cambia el costo, y se vuelve al pedido.
//
// ── LA LISTA BLANCA, Y POR QUÉ NO UN `returnTo` ─────────────────────────────
//
// El destino de vuelta NO viaja como una URL en la query. Viaja como un marcador
// de un conjunto cerrado, y la ruta se arma de este lado. Un `returnTo=<url>`
// abierto es un redirect abierto: alcanza con que alguien mande un link con otro
// dominio, o con `javascript:`, para sacar a la persona del sistema desde una
// pantalla en la que confía.
//
// Es el mismo criterio de lib/reportes-ventas/returnParams.js, que ya resolvió
// esto para el listado de ventas. Se sigue el precedente en vez de inventar otro.
//
// ── POR QUÉ ACÁ VIVE TAMBIÉN UN ORIGEN QUE NO ES UN PEDIDO ──────────────────
//
// Desde el 2026-09-18 la lista blanca tiene un tercer origen —«No cambian», del
// módulo de listas de proveedor— y el nombre del archivo quedó histórico.
//
// Se agregó acá en vez de escribir una lista blanca al lado porque el ÚNICO
// consumidor de la vuelta es `app/modulos/productos/[id]/editar/page.jsx`, y esa
// pantalla ya llama a `urlRetornoPedido`. Una segunda lista blanca la obligaría a
// consultar dos, y el día que una valide distinto de la otra la pantalla de
// editar producto tendría dos criterios de a dónde puede volver. La lista de
// orígenes válidos es exactamente lo que no se duplica.
//
// Módulo puro: sin Prisma, sin next/navigation. Se puede testear en node.

import { ORDEN_NO_CAMBIAN } from "../proveedores/listas/losQueNoCambian.js";

/** Los únicos orígenes desde los que se acepta volver. Conjunto CERRADO. */
export const ORIGENES = Object.freeze({
  PEDIDO_NUEVO: "pedido-nuevo",
  PEDIDO_DETALLE: "pedido-detalle",
  /**
   * «No cambian» de una lista de proveedor, con el filtro donde estaba.
   *
   * El caso real: en «No vinieron» se toca un producto, la hoja ofrece ver su
   * ficha, y al volver hay que caer en el mismo chip —no en «Todos»— porque si
   * no hay que volver a filtrar para seguir mirando los que no vinieron.
   */
  LISTA_NO_CAMBIAN: "lista-no-cambian",
});

const ORIGENES_VALIDOS = new Set(Object.values(ORIGENES));

/** Clave del parámetro que marca el origen. */
export const PARAM_ORIGEN = "volverA";
/** Clave del id del pedido, solo para PEDIDO_DETALLE. */
export const PARAM_PEDIDO = "pedidoId";
/** Marca, al volver, que hay que restaurar el pedido en curso. */
export const PARAM_REABRIR = "reabrirPedido";
/**
 * Proveedor del pedido en curso. Viaja en la ida y vuelve en la vuelta.
 *
 * Sin esto la pantalla del pedido nuevo vuelve sin saber de qué proveedor era,
 * no carga el catálogo, y el pedido guardado no se restaura nunca: se ve vacío.
 * Lo encontró una captura del viaje completo, no un candado.
 */
export const PARAM_PROVEEDOR = "proveedorId";
/** Id de la importación, solo para LISTA_NO_CAMBIAN. */
export const PARAM_IMPORTACION = "importacionId";
/**
 * En qué chip de «No cambian» estaba, para volver al mismo.
 *
 * Es OPCIONAL: «Todos» no tiene marcador, y un filtro que no exista se descarta
 * en vez de viajar. Los válidos son los de `ORDEN_NO_CAMBIAN` y no una copia
 * escrita acá: dos listas de chips se separan el día que se agregue el cuarto.
 */
export const PARAM_FILTRO = "filtro";

const FILTROS_VALIDOS = new Set(ORDEN_NO_CAMBIAN);

const enteroPositivo = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Link a editar producto que sabe volver.
 *
 * @param {number} baseId    id del ProductoBase a editar.
 * @param {number} localId   ubicación desde la que se opera.
 * @param {string} origen    uno de ORIGENES.
 * @param {number} [pedidoId] obligatorio para PEDIDO_DETALLE.
 * @param {number} [proveedorId] obligatorio para PEDIDO_NUEVO: sin él, la vuelta
 *   no sabe qué catálogo cargar y el pedido guardado no se restaura.
 * @param {number} [importacionId] obligatorio para LISTA_NO_CAMBIAN.
 * @param {string} [filtro] opcional para LISTA_NO_CAMBIAN: el chip donde estaba.
 * @returns {string|null} ruta interna, o null si algo no valida.
 */
export function linkEditarProducto({
  baseId,
  localId,
  origen,
  pedidoId,
  proveedorId,
  importacionId,
  filtro,
} = {}) {
  const base = enteroPositivo(baseId);
  const local = enteroPositivo(localId);
  if (base === null || local === null) return null;
  if (!ORIGENES_VALIDOS.has(origen)) return null;

  const qs = new URLSearchParams();
  qs.set("localId", String(local));
  qs.set(PARAM_ORIGEN, origen);

  if (origen === ORIGENES.PEDIDO_DETALLE) {
    const ped = enteroPositivo(pedidoId);
    if (ped === null) return null; // sin pedido no hay a dónde volver
    qs.set(PARAM_PEDIDO, String(ped));
  }

  if (origen === ORIGENES.PEDIDO_NUEVO) {
    const prov = enteroPositivo(proveedorId);
    if (prov === null) return null; // sin proveedor, la vuelta muestra el pedido vacío
    qs.set(PARAM_PROVEEDOR, String(prov));
  }

  if (origen === ORIGENES.LISTA_NO_CAMBIAN) {
    const imp = enteroPositivo(importacionId);
    if (imp === null) return null; // sin importación no hay «No cambian» a dónde volver
    qs.set(PARAM_IMPORTACION, String(imp));
    // El filtro NO es obligatorio: «Todos» no tiene marcador. Uno que no esté en
    // los chips se descarta y la vuelta cae en «Todos», que es un destino real y
    // no una pantalla filtrada por algo que no existe.
    if (FILTROS_VALIDOS.has(filtro)) qs.set(PARAM_FILTRO, filtro);
  }

  return `/modulos/productos/${base}/editar?${qs.toString()}`;
}

/**
 * A dónde volver, leído de los params de la pantalla de editar producto.
 *
 * Devuelve `null` cuando no hay un origen válido: en ese caso el llamador usa su
 * comportamiento de siempre (volver al listado de productos). No inventa destino.
 *
 * @param {URLSearchParams|Map|{get:Function}} params
 * @returns {string|null} ruta interna
 */
export function urlRetornoPedido(params) {
  if (!params || typeof params.get !== "function") return null;

  const origen = params.get(PARAM_ORIGEN);
  if (!ORIGENES_VALIDOS.has(origen)) return null;

  if (origen === ORIGENES.LISTA_NO_CAMBIAN) {
    const imp = enteroPositivo(params.get(PARAM_IMPORTACION));
    if (imp === null) return null; // origen de lista sin importación: no se adivina
    const filtro = params.get(PARAM_FILTRO);
    const base = `/modulos/proveedores/listas/${imp}/no-cambian`;
    return FILTROS_VALIDOS.has(filtro) ? `${base}?${PARAM_FILTRO}=${filtro}` : base;
  }

  if (origen === ORIGENES.PEDIDO_NUEVO) {
    // El pedido en curso vive del lado del navegador; `reabrirPedido` le dice a
    // la pantalla que lo restaure en vez de arrancar vacía. El PROVEEDOR viaja
    // en la URL: sin él la pantalla no carga el catálogo y no hay qué restaurar.
    const prov = enteroPositivo(params.get(PARAM_PROVEEDOR));
    if (prov === null) return null;
    return `/modulos/compras-proveedor/nueva?${PARAM_PROVEEDOR}=${prov}&${PARAM_REABRIR}=1`;
  }

  const ped = enteroPositivo(params.get(PARAM_PEDIDO));
  if (ped === null) return null; // origen de detalle sin pedido: no se adivina
  return `/modulos/compras-proveedor/${ped}`;
}

/** ¿La pantalla del pedido tiene que restaurar lo que había en curso? */
export function debeReabrirPedido(params) {
  if (!params || typeof params.get !== "function") return false;
  return params.get(PARAM_REABRIR) === "1";
}

// ---------------------------------------------------------------------------
// El pedido en curso, guardado del lado del navegador
// ---------------------------------------------------------------------------
//
// NO se guarda como borrador en el servidor. Crear un borrador al abrir un
// producto haría aparecer un pedido en la lista de pendientes que nadie pidió
// crear, y habría que salir a limpiarlo después. Esto es invisible, vive en la
// pestaña y se descarta solo.

export const CLAVE_PEDIDO_EN_CURSO = "comprasPedidoEnCurso";

/**
 * Lo que hace falta para reconstruir el pedido al volver.
 *
 * Las CANTIDADES son del pedido y se conservan tal cual. Los COSTOS no se
 * restauran desde acá: la pantalla los vuelve a pedir al catálogo, porque el
 * motivo de haber ido a editar el producto es justamente que el costo cambió.
 * Restaurar el costo guardado mostraría el viejo.
 */
export function serializarPedidoEnCurso({ proveedorId, items, notas } = {}) {
  const prov = enteroPositivo(proveedorId);
  if (prov === null) return null;
  const lineas = (Array.isArray(items) ? items : [])
    .filter((i) => enteroPositivo(i?.productoLocalId) !== null && Number(i?.cantidad) > 0)
    .map((i) => ({
      productoLocalId: Number(i.productoLocalId),
      cantidad: Number(i.cantidad),
      unidadPedido: i.unidadPedido ?? null,
    }));
  if (lineas.length === 0) return null; // un pedido vacío no hace falta guardarlo
  return { proveedorId: prov, notas: typeof notas === "string" ? notas : "", lineas };
}

/**
 * Vuelta atrás de lo anterior. Devuelve null ante cualquier cosa que no sea lo
 * que se guardó: un JSON roto, una versión vieja o algo manipulado no puede
 * romper la pantalla del pedido.
 */
export function deserializarPedidoEnCurso(texto) {
  if (typeof texto !== "string" || texto === "") return null;
  let obj;
  try {
    obj = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const prov = enteroPositivo(obj.proveedorId);
  if (prov === null) return null;
  if (!Array.isArray(obj.lineas)) return null;

  const lineas = obj.lineas
    .filter((l) => l && enteroPositivo(l.productoLocalId) !== null && Number(l.cantidad) > 0)
    .map((l) => ({
      productoLocalId: Number(l.productoLocalId),
      cantidad: Number(l.cantidad),
      unidadPedido: typeof l.unidadPedido === "string" ? l.unidadPedido : null,
    }));
  if (lineas.length === 0) return null;

  return { proveedorId: prov, notas: typeof obj.notas === "string" ? obj.notas : "", lineas };
}
