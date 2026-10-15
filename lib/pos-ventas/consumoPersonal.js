// lib/pos-ventas/consumoPersonal.js
//
// CONSUMO DEL PERSONAL: lo que el personal se lleva para comer o tomar. No se
// cobra, sale del stock y es un gasto del negocio. La parte que no toca la
// base: textos, lectura del pedido y el resumen que muestra el panel de cobro.
//
// ── POR QUÉ NO ES UNA VENTA ─────────────────────────────────────────────────
//
// Una venta en $0 sumaría tickets, entraría en Reportes → Ventas, en la
// ganancia de las ventas y en el efectivo esperado de la caja. Nada de eso es
// cierto: no se vendió nada. Lo único que comparte con la venta es CÓMO sale
// del stock —`construirLineasComerciales` → `aplicarConsumoStock`, las mismas
// funciones, con la escala, el bulto y el kilo de la venta— y lo hace en
// `consumoPersonalServer.js`. El dinero que cuesta va como Gasto, al COSTO.

import { validarIdempotencyKey } from "@/lib/caja/retiroDinero";
import { MAXIMO_CONCEPTO } from "@/lib/finanzas/gastos";

/** La categoría de gasto. La crea la migración; no se elige a mano. */
export const CATEGORIA_CONSUMO_PERSONAL = "Consumo del personal";

export const ERROR_SIN_TURNO = "No hay una caja abierta para registrar el consumo.";
export const ERROR_SIN_OPERADOR = "Elegí quién lo consume.";
export const ERROR_SIN_PRODUCTOS = "No hay productos para registrar.";
export const ERROR_ITEM_INVALIDO = "Hay un producto con cantidad inválida.";
export const ERROR_SERVICIO = (nombre) => `"${nombre}" es un servicio: no sale del stock. Sacalo del carrito.`;
export const ERROR_SIN_CATEGORIA = `No existe la categoría de gasto ${CATEGORIA_CONSUMO_PERSONAL}.`;

const redondear2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Lo que no depende de la base: el turno, quién consume, los ítems y la clave.
 * Los ítems llegan con la forma de `itemsCrearPayload`, la de la venta.
 */
export function leerPedidoDeConsumo(body = {}) {
  const turnoId = Number(body.turnoId);
  if (!Number.isInteger(turnoId) || turnoId <= 0) return { error: ERROR_SIN_TURNO };
  const operadorId = Number(body.operadorId);
  if (!Number.isInteger(operadorId) || operadorId <= 0) return { error: ERROR_SIN_OPERADOR };
  const crudos = Array.isArray(body.items) ? body.items : [];
  if (crudos.length === 0) return { error: ERROR_SIN_PRODUCTOS };
  const items = [];
  for (const i of crudos) {
    const productoBaseId = Number(i?.productoBaseId);
    const cantidad = Number(i?.cantidad);
    if (!Number.isInteger(productoBaseId) || productoBaseId <= 0 || !(cantidad > 0)) {
      return { error: ERROR_ITEM_INVALIDO };
    }
    const precioCosto = i?.precioCosto == null ? null : Number(i.precioCosto);
    items.push({
      productoBaseId,
      nombre: String(i?.nombre ?? "").trim() || `Producto ${productoBaseId}`,
      // El precio no se cobra: solo dice cuánto valía en góndola.
      precio: Number(i?.precio) > 0 ? Number(i.precio) : 0,
      cantidad,
      // El costo, igual que en la venta: el del carrito o, sin él, el del bulto.
      // Sin costo va `undefined` y no `null`: `construirLineasComerciales` lee
      // `Number(null)` como un costo de CERO y no caería al del bulto, y el
      // gasto saldría en $0.
      precioCosto: Number.isFinite(precioCosto) && precioCosto >= 0 ? precioCosto : undefined,
      modoVentaLinea: i?.modoVentaLinea ?? "NORMAL",
      // El peso ya está calculado en el carrito: el importe no se cobra, así
      // que no hay importe fijado que defender.
      subtotalFijado: null,
    });
  }
  const clave = validarIdempotencyKey(body.idempotencyKey, { de: "del consumo" });
  if (!clave.valido) return { error: clave.error };
  return { turnoId, operadorId, items, clave: clave.clave };
}

/**
 * El concepto del gasto: quién y qué. Recortado al largo del concepto, con
 * "…" si no entra; el detalle completo queda en las líneas del consumo.
 */
export function conceptoDelConsumo({ operador, lineas = [] }) {
  const productos = lineas.map((l) => `${l.nombre} x${formatearCantidad(l.cantidad)}`).join(", ");
  const texto = `${CATEGORIA_CONSUMO_PERSONAL} · ${operador}: ${productos}`;
  return texto.length <= MAXIMO_CONCEPTO ? texto : `${texto.slice(0, MAXIMO_CONCEPTO - 1)}…`;
}

function formatearCantidad(n) {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
}

/** El costo total de las líneas que armó la venta. Es lo que vale el gasto. */
export function costoDelConsumo(lineas = []) {
  return redondear2(lineas.reduce((s, l) => s + (Number(l.costoLinea) || 0), 0));
}

/**
 * LO QUE MUESTRA EL PANEL ANTES DE CONFIRMAR: cuántos productos salen y el
 * costo estimado con el costo del carrito. El definitivo lo calcula el
 * servidor con las líneas de la venta (un combo cuesta lo de sus componentes).
 */
export function resumenDelConsumo(carrito = []) {
  const lineas = (Array.isArray(carrito) ? carrito : []).filter((i) => i?.esServicio !== true);
  const costo = redondear2(
    lineas.reduce((s, i) => s + (Number(i?.precioCosto) || 0) * (Number(i?.cantidad) || 0), 0)
  );
  return { productos: lineas.length, costo, hayServicios: lineas.length !== (carrito || []).length };
}
