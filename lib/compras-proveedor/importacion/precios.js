import { convertirCostoDeEscala, costoParaUnidad } from "./merge.js";

export const ORIGEN_PRECIO = Object.freeze({
  SISTEMA: "SISTEMA",
  PAPEL: "PAPEL",
});

const numeroValido = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Los dos costos comparables de una línea importada.
 *
 * El costo del catálogo ya vive en la escala maestra del producto. El papel,
 * en cambio, vive en la escala declarada por la receta del proveedor. Los dos
 * se llevan a la unidad EN QUE QUEDÓ EL PEDIDO antes de compararlos: mostrar
 * $2.100 por bulto al lado de $100 por unidad como si fueran distintos sería
 * fabricar un aumento que no existe.
 */
export function preciosComparables({ precioPapel, facturaPor, unidadPedido, producto } = {}) {
  if (!producto) {
    return {
      precioSistema: null,
      precioPapel: numeroValido(precioPapel),
      diferencia: null,
      diferenciaPct: null,
      diferentes: false,
    };
  }

  const precioSistema = costoParaUnidad({
    costoMaestro: producto.precio_costo ?? null,
    unidad: unidadPedido,
    producto,
  });
  const papelCrudo = numeroValido(precioPapel);
  const precioPapelComparable = papelCrudo === null
    ? null
    : convertirCostoDeEscala({
        costo: papelCrudo,
        desde: facturaPor === "BULTO" ? "BULTO" : "UNIDAD",
        hacia: unidadPedido,
        producto,
      });

  const diferencia = precioSistema !== null && precioPapelComparable !== null
    ? precioPapelComparable - precioSistema
    : null;
  const diferenciaPct = diferencia !== null && precioSistema !== 0
    ? (diferencia / precioSistema) * 100
    : null;
  const diferentes = diferencia !== null && Math.abs(diferencia) >= 0.005;

  return {
    precioSistema,
    precioPapel: precioPapelComparable,
    diferencia,
    diferenciaPct,
    diferentes,
  };
}
/** El costo que va a la línea del borrador, después de la decisión visible. */
export function precioElegido({ precios, origen } = {}) {
  if (origen === ORIGEN_PRECIO.PAPEL && precios?.precioPapel !== null) {
    return precios.precioPapel;
  }
  return precios?.precioSistema ?? precios?.precioPapel ?? null;
}
