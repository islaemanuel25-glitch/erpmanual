// lib/reportes-ventas/modoLineaDeposito.js
//
// Descriptor de PRESENTACIÓN del modo de venta de una línea del detalle de venta:
// ¿se vendió por Pack/Bulto, por Unidad suelta, o por Pieza (fiambre fijo)?
//
// NO calcula precios, stock ni cantidades: solo describe lo que YA quedó
// persistido en VentaDetalle. La regla Pack/Unidad no se reimplementa acá —
// se delega en inferirModo()/permiteToggleDeposito() de lib/pos-ventas/
// lineaModoDeposito, los mismos helpers que usa la corrección de ventas.
//
//   modo: "PACK" | "UNIDAD" | "PIEZA" | null
//     PACK   → cantidadStock == cantidad × factor_pack (se vendió por bulto)
//     UNIDAD → unidad suelta (incluye productos con modo_envio SOLO_UNIDAD)
//     PIEZA  → fiambre de pieza fija: el depósito cuenta PIEZAS, no unidades,
//              así que el eje Pack/Unidad no aplica
//     null   → no hay datos para afirmarlo → el frontend va NEUTRO (sin badge).
//              Pasa con líneas legacy (cantidadStock NULL), combos, servicios,
//              ventas que no son de depósito y productos sin pack.

// Import relativo (convención del resto de lib/: lineaModoDeposito importa
// ./consumoStock.js, y ese ../conversiones/stock.js).
import {
  inferirModo,
  permiteToggleDeposito,
  MODO_PACK,
} from "../pos-ventas/lineaModoDeposito.js";

const num = (v) => (v == null ? 0 : Number(v));

/**
 * @param {object} d      línea de VentaDetalle con { cantidad, cantidadStock,
 *                        esServicio, productoBase: { unidad_medida, factor_pack,
 *                        modoVentaDeposito, modo_envio } }
 * @param {boolean} ventaEnDeposito  el local de la venta es depósito
 */
export function descriptorDeposito(d, ventaEnDeposito) {
  const pb = d?.productoBase || null;
  const factorPack = Math.max(1, num(pb?.factor_pack) || 1);
  const cantidadStock = d?.cantidadStock != null ? num(d.cantidadStock) : null;
  const modoEnvio = pb?.modo_envio || null;
  const modoVentaDeposito = pb?.modoVentaDeposito || null;
  const soloUnidad = String(modoEnvio || "").toUpperCase() === "SOLO_UNIDAD";

  // Para afirmar algo hace falta: venta de depósito, consumo físico congelado y
  // que la línea no sea un servicio (los servicios no mueven stock).
  const hayDatos = ventaEnDeposito === true && !d?.esServicio && cantidadStock != null;

  let modo = null;
  if (hayDatos) {
    if (modoVentaDeposito === "PIEZA") {
      modo = "PIEZA";
    } else if (soloUnidad) {
      modo = "UNIDAD";
    } else if (permiteToggleDeposito({ esDeposito: true, factorPack, modoEnvio })) {
      modo =
        inferirModo({ cantidad: num(d.cantidad), cantidadStock, factorPack }) === MODO_PACK
          ? "PACK"
          : "UNIDAD";
    }
    // factor 1 y sin SOLO_UNIDAD: no había dos modos posibles → neutro.
  }

  return {
    esDeposito: ventaEnDeposito === true,
    modo,
    factorPack,
    cantidadStock: cantidadStock != null ? cantidadStock.toFixed(3) : null,
    unidadMedida: pb?.unidad_medida || null,
    modoVentaDeposito,
    modoEnvio,
  };
}
