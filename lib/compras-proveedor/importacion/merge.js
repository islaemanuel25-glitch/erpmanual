// Cantidad, unidad y COSTO de una línea importada, como UNA sola operación.
//
// ── POR QUÉ EL COSTO VIAJA ACÁ Y NO APARTE ─────────────────────────────────
//
// Porque la unidad y el costo son el mismo hecho contado dos veces: un PACK de
// 21 vale $2.100 el bulto y $100 la unidad, y son el MISMO dinero. Cuando la
// suma cambia la línea de BULTO a UNIDAD y el costo se queda en 2.100, la línea
// pasa a valer 47 × 2.100 = 98.700 en lugar de 47 × 100 = 4.700. No es un
// redondeo: es multiplicar por el factor. Medido con factor 21 y costo 2.100.
//
// Devolver la cantidad sin el costo era una invitación a que el llamador se
// olvidara, y se olvidó: la ruta de aplicar escribía `cantidad` y `unidad` y
// dejaba `precioCosto` como estaba.
//
// ── LA FÓRMULA NO SE ESCRIBE ACÁ ───────────────────────────────────────────
//
// `lib/compras-proveedor/calculoPedido.js` es la fuente única de la aritmética
// de Compras y ya resuelve las dos preguntas: `naturalezaLinea` dice si el
// producto es PACK, FIAMBRE o KG, y `convertirUnidadPedido` convierte el par
// cantidad/costo SIN redondear —su comentario lo dice: el costo se conserva a
// precisión completa para que Pack → Unidad → Pack no acumule centavos—.
// Este módulo traduce nombres y decide cuándo llamar; no calcula.

import { naturalezaLinea, convertirUnidadPedido } from "../calculoPedido.js";

/**
 * La base que `naturalezaLinea` espera, a partir del producto del importador.
 *
 * El catálogo de Compras entrega `modoCompra` y `naturalezaLinea` lee
 * `modoCompraProveedor`: el mismo dato con dos nombres. Traducirlo en un solo
 * lugar es lo que evita escribir una segunda clasificación al lado de la que ya
 * decide en toda la pantalla de Compras.
 */
export function baseDeProducto(producto) {
  return {
    modoCompraProveedor:
      producto?.modoCompraProveedor ?? producto?.modoCompra ?? "BULTO",
    unidad_medida: producto?.unidad_medida ?? null,
    factor_pack: producto?.factor_pack ?? null,
  };
}

/**
 * El costo que le corresponde a la línea SEGÚN LA UNIDAD EN QUE QUEDA.
 *
 *   · PACK en BULTO   → el costo maestro, tal cual.
 *   · PACK en UNIDAD  → el costo maestro dividido por `factor_pack`, completo.
 *   · FIAMBRE y KG    → el costo maestro, tal cual: el factor no entra en el
 *                       dinero de esos productos, y `calculoPedido` lo dice en
 *                       su encabezado. Un fiambre no tiene "costo por bulto".
 *
 * Devuelve `null` si no hay un costo maestro utilizable, para que el llamador
 * pueda distinguir "no hay costo" de "el costo es cero".
 */
export function costoParaUnidad({ costoMaestro, unidad, producto } = {}) {
  if (costoMaestro === null || costoMaestro === undefined || costoMaestro === "") return null;
  const costo = Number(costoMaestro);
  if (!Number.isFinite(costo)) return null;

  if (naturalezaLinea(baseDeProducto(producto)) !== "PACK") return costo;
  if (unidad !== "UNIDAD") return costo;

  const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
  // Se pide la conversión de UN bulto para quedarse solo con el costo: la
  // cantidad la resuelve la suma de abajo, y el costo sale de la misma función
  // que usa el resto de Compras.
  return convertirUnidadPedido({ unidad: "BULTO", cantidad: 1, costo, factor }).costo;
}

/**
 * Convierte un costo de la escala de una unidad a la de otra.
 *
 * Delega en `convertirUnidadPedido` en las DOS direcciones —no hay una división
 * escrita al lado— y le pasa una cantidad que hace la conversión exacta: para
 * subir de UNIDAD a BULTO pide `factor` unidades, porque esa función se niega a
 * convertir un resto y con `cantidad: 1` contestaría `needsConfirm`.
 *
 * Si el producto no es PACK el factor no entra en el dinero, así que el costo
 * vuelve intacto.
 */
export function convertirCostoDeEscala({ costo, desde, hacia, producto } = {}) {
  const c = Number(costo);
  if (!Number.isFinite(c)) return null;
  if (desde === hacia) return c;
  if (naturalezaLinea(baseDeProducto(producto)) !== "PACK") return c;

  const factor = Math.max(1, Math.floor(Number(producto?.factor_pack) || 1));
  if (factor === 1) return c;

  return desde === "BULTO"
    ? convertirUnidadPedido({ unidad: "BULTO", cantidad: 1, costo: c, factor }).costo
    : convertirUnidadPedido({ unidad: "UNIDAD", cantidad: factor, costo: c, factor }).costo;
}

/**
 * El `data` de un detalle NUEVO sobre un borrador que ya existe.
 *
 * ── EL MAESTRO SALE DE LA BASE, SIEMPRE ────────────────────────────────────
 *
 * El modal manda el costo YA CONVERTIDO a la escala de la línea: para un PACK de
 * 21 que queda en UNIDAD manda 100, no 2.100. Tomar ese 100 como maestro y
 * volver a dividirlo por 21 guardaba 4,761904… — dos conversiones sobre el mismo
 * número.
 *
 * `item.precioCosto` se ignora a propósito y no como descuido: si el costo se
 * pudiera fijar desde el cuerpo, esto se podría reproducir a mano contra la ruta.
 * La base es la única fuente y la conversión ocurre exactamente una vez.
 */
export function datosDetalleNuevo({ pedidoId, productoLocalId, item, base } = {}) {
  return {
    pedidoId,
    productoLocalId: Number(productoLocalId),
    cantidad: Number(item?.cantidad),
    unidad: item?.unidad,
    precioCosto: costoParaUnidad({
      costoMaestro: base?.precio_costo ?? null,
      unidad: item?.unidad,
      producto: base,
    }),
  };
}

/**
 * El costo que la pantalla tiene que MOSTRAR después de que el servidor
 * reconcilió una línea.
 *
 * ── LA RESPUESTA DEL SERVIDOR MANDA ────────────────────────────────────────
 *
 * Acá se hacía `anterior?.precioCosto ?? …`, así que el costo viejo le ganaba al
 * que el servidor acababa de corregir: la base quedaba en 120 y la pantalla
 * seguía mostrando 2.520. Un arreglo aplicado e invisible es indistinguible de
 * un arreglo que no ocurrió.
 *
 * Y el orden se resuelve con `??` y no con `||`: CERO es un costo válido, y con
 * `||` una línea que el servidor dejó en cero caía al costo del catálogo.
 */
export function costoVisibleDeDetalle({ detalle, anterior, producto } = {}) {
  const candidatos = [detalle?.precioCosto, anterior?.precioCosto, producto?.precio_costo];
  for (const valor of candidatos) {
    if (valor === null || valor === undefined || valor === "") continue;
    const n = Number(valor);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * Suma una línea importada sobre la que ya está en el borrador.
 *
 * @returns {{cantidad:number, unidad:"BULTO"|"UNIDAD", precioCosto:number|null, unidadCambio:boolean}}
 *   `precioCosto` es el costo que la línea tiene que quedar teniendo:
 *     · si la unidad NO cambió, el que ya tenía —no se pisa un costo negociado—;
 *     · si cambió, el que le corresponde a la unidad nueva.
 */
export function sumarCantidadesImportadas({
  actual,
  importada,
  factorPack,
  producto = null,
  costoMaestro = null,
} = {}) {
  const factor = Math.max(1, Math.floor(Number(factorPack) || 1));
  const cantidadActual = Math.floor(Number(actual?.cantidad) || 0);
  const cantidadNueva = Math.floor(Number(importada?.cantidad) || 0);
  const unidadActual = actual?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";
  const unidadNueva = importada?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";

  const sumada = (() => {
    if (unidadActual === unidadNueva) {
      return { cantidad: cantidadActual + cantidadNueva, unidad: unidadActual };
    }
    if (unidadActual === "UNIDAD") {
      return { cantidad: cantidadActual + cantidadNueva * factor, unidad: "UNIDAD" };
    }
    if (cantidadNueva % factor === 0) {
      return { cantidad: cantidadActual + cantidadNueva / factor, unidad: "BULTO" };
    }
    return { cantidad: cantidadActual * factor + cantidadNueva, unidad: "UNIDAD" };
  })();

  const unidadCambio = sumada.unidad !== unidadActual;

  // ── EL COSTO QUE SE CONVIERTE ES EL DE LA LÍNEA, NO EL DEL CATÁLOGO ───────
  //
  // `actual.precioCosto` sale del detalle guardado: es lo que se pagó de verdad
  // por esa línea, que puede no ser el maestro —una negociación, una lista vieja,
  // un precio corregido a mano—. Acá se tomaba el maestro y se lo convertía, así
  // que cambiar de unidad BORRABA la negociación en silencio: 2.520 el bulto
  // pasaba a 100 la unidad en vez de 120, y el pedido cambiaba de valor sin que
  // nadie lo pidiera.
  //
  // El maestro queda como RESPALDO, solo para cuando la línea no trae un costo
  // utilizable. Y un CERO es utilizable: es un número, no la ausencia de uno.
  const costoExistente =
    actual?.precioCosto === null || actual?.precioCosto === undefined || actual?.precioCosto === ""
      ? null
      : Number(actual.precioCosto);
  const hayCostoPropio = costoExistente !== null && Number.isFinite(costoExistente);

  const precioCosto = (() => {
    if (!unidadCambio) return hayCostoPropio ? costoExistente : null;
    if (hayCostoPropio) {
      return convertirCostoDeEscala({
        costo: costoExistente,
        desde: unidadActual,
        hacia: sumada.unidad,
        producto,
      });
    }
    return costoParaUnidad({
      costoMaestro: costoMaestro ?? producto?.precio_costo ?? null,
      unidad: sumada.unidad,
      producto,
    });
  })();

  return { ...sumada, unidadCambio, precioCosto };
}
