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
// El costo entre unidad y bulto lo convierte la regla única de unidades
// (`lib/unidades/reglaDeUnidades.js`, `costoEnLaUnidad`): la ficha dice si el
// producto es PACK, FIAMBRE o KG, y la cuenta es `convertirUnidadPedido`, SIN
// redondear —el costo se conserva a precisión completa para que Pack → Unidad →
// Pack no acumule centavos—. Este módulo traduce nombres y decide cuándo
// llamar; no calcula.

import { bultosDe, cantidadEnUnidades, costoEnLaUnidad } from "../../unidades/reglaDeUnidades.js";

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
  // La regla única de unidades: la ficha dice si es un pack, y el costo maestro
  // —por bulto— se lleva a la unidad de la línea. Sin la ficha completa no hay
  // pack que ver: la siembra pasaba el producto sin `factor_pack` y una línea
  // por unidad salía a $38.400 en vez de $3.200 (2026-11-04).
  return costoEnLaUnidad({
    costo: costoMaestro,
    de: "BULTO",
    a: unidad === "UNIDAD" ? "UNIDAD" : "BULTO",
    base: baseDeProducto(producto),
  });
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
  // La cuenta es la de la regla única (`costoEnLaUnidad`). La dirección la
  // decide `desde`, como siempre: desde el bulto baja a la unidad; desde
  // cualquier otra cosa sube al bulto.
  const de = desde === "BULTO" ? "BULTO" : "UNIDAD";
  return costoEnLaUnidad({ costo: c, de, a: de === "BULTO" ? "UNIDAD" : "BULTO", base: baseDeProducto(producto) });
}

/**
 * El `data` de un detalle NUEVO sobre un borrador que ya existe.
 *
 * ── EL MAESTRO SALE DE LA BASE, SALVO ELECCIÓN EXPLÍCITA DEL PAPEL ─────────
 *
 * La pantalla manda el costo YA CONVERTIDO a la escala de la línea: para un PACK de
 * 21 que queda en UNIDAD manda 100, no 2.100. Tomar ese 100 como maestro y
 * volver a dividirlo por 21 guardaba 4,761904… — dos conversiones sobre el mismo
 * número.
 *
 * `item.precioCosto` solo se acepta cuando la decisión visible viaja como
 * `origenPrecio: PAPEL`. En cualquier otro caso la base es la única fuente y la
 * conversión ocurre exactamente una vez.
 */
export function datosDetalleNuevo({ pedidoId, productoLocalId, item, base } = {}) {
  const costoPapel = item?.origenPrecio === "PAPEL" ? Number(item?.precioCosto) : null;
  const usarPapel = Number.isFinite(costoPapel) && costoPapel >= 0;
  return {
    pedidoId,
    productoLocalId: Number(productoLocalId),
    cantidad: Number(item?.cantidad),
    unidad: item?.unidad,
    precioCosto: usarPapel
      ? costoPapel
      : costoParaUnidad({
          costoMaestro: base?.precio_costo ?? null,
          unidad: item?.unidad,
          producto: base,
        }),
  };
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
  usarCostoImportado = false,
} = {}) {
  const factor = Math.max(1, Math.floor(Number(factorPack) || 1));
  const cantidadActual = Math.floor(Number(actual?.cantidad) || 0);
  const cantidadNueva = Math.floor(Number(importada?.cantidad) || 0);
  const unidadActual = actual?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";
  const unidadNueva = importada?.unidad === "UNIDAD" ? "UNIDAD" : "BULTO";

  // Bultos a unidades y unidades a bultos enteros, con la pieza única. Desde la
  // tanda 12 la ficha que lee es la del PRODUCTO, cuando viene: con el
  // `factor_pack` crudo, el MANI CON CASCARA X2KG (factor 2, fiambre) sumaba 2
  // bultos del borrador más 3 unidades importadas como 7, y la pieza —igual que
  // la consolidación de la pantalla (`payload`)— no le ve bulto: son 5. Para un
  // pack la ficha da el mismo factor que se recibe. Sin producto, se lee el
  // factor que llega, como antes.
  const ficha = producto ? baseDeProducto(producto) : { factor_pack: factor };
  const enUnidades = (cantidad) => cantidadEnUnidades({ cantidad, unidad: "BULTO", base: ficha });
  const sumada = (() => {
    if (unidadActual === unidadNueva) {
      return { cantidad: cantidadActual + cantidadNueva, unidad: unidadActual };
    }
    if (unidadActual === "UNIDAD") {
      return { cantidad: cantidadActual + enUnidades(cantidadNueva), unidad: "UNIDAD" };
    }
    const nuevaEnBultos = bultosDe({ unidades: cantidadNueva, base: ficha });
    if (nuevaEnBultos.entero) {
      return { cantidad: cantidadActual + nuevaEnBultos.bultos, unidad: "BULTO" };
    }
    return { cantidad: enUnidades(cantidadActual) + cantidadNueva, unidad: "UNIDAD" };
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
  const costoImportado = Number(importada?.precioCosto);
  const hayCostoImportado =
    usarCostoImportado && Number.isFinite(costoImportado) && costoImportado >= 0;

  const precioCosto = (() => {
    if (hayCostoImportado) {
      return convertirCostoDeEscala({
        costo: costoImportado,
        desde: unidadNueva,
        hacia: sumada.unidad,
        producto,
      });
    }
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
