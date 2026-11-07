// lib/compras-proveedor/lecturaDelCierre.js
//
// EL CIERRE DE LA RECEPCIÓN LEE CADA RENGLÓN CON LA LECTURA DE CORREGIR.
//
// ── POR QUÉ EXISTE (Emanuel, 2026-11-07) ───────────────────────────────────
//
// Una recepción tiene que leer cada renglón UNA sola vez. Hasta acá el cierre
// volvía a calcular la escala por su cuenta: el aviso "entrarían N al stock y
// el papel factura M" con su propia deducción, y el costo maestro con
// `escalaDelCosto` sobre el costo de la línea del pedido. Corregir ya elegía
// con la regla de la menor diferencia, y con el Marlboro Fuxi la hoja y el
// aviso del cierre contaron distinto.
//
// La lectura de cada renglón es la de la conciliación —`analizarPrecioDeLinea`
// dentro de `cargarConciliacion`, la misma que dibuja la pantalla—: la ganadora
// de la menor diferencia, o la que eligió la persona. El cierre la toma de ahí
// y no deduce nada:
//
//   · el aviso sale de `laCantidadCuadraDeLaFila`, la misma función que la hoja;
//   · el costo maestro es el precio de esa lectura (`costoFactura`, que es el
//     `precioAEscribir`, en la unidad en que el DEPÓSITO cuenta: el bulto de
//     un pack, la pieza de un fiambre por pieza), llevado a la unidad del
//     catálogo, y SOLO si la persona aceptó ese precio.
//
// Módulo puro: sin React y sin Prisma.

import { costoLineaAMaestro } from "./costoMaestro.js";
import { costoDelDepositoEnLaUnidadDelCatalogo } from "../conversiones/stock.js";

/**
 * LAS FILAS DEL PAPEL DE CADA LÍNEA DEL PEDIDO, de la conciliación.
 *
 * Dos renglones pueden ir a la misma línea —las 120 y 121 del comprobante 5
 * van las dos al detalle 2565—: por eso es una lista. Las filas sin papel no
 * son renglones.
 *
 * @returns Map de id de línea del pedido → filas
 */
export function filasDelPapelPorDetalle(conciliacion) {
  const m = new Map();
  for (const g of conciliacion?.grupos ?? []) {
    for (const f of g?.filas ?? []) {
      if (f?.pedidoDetalleId == null || f?.sinPapel === true) continue;
      const lista = m.get(f.pedidoDetalleId) ?? [];
      lista.push(f);
      m.set(f.pedidoDetalleId, lista);
    }
  }
  return m;
}

/** El precio de la lectura del renglón, o null si la lectura no se decidió. */
export function precioDeLaLectura(fila) {
  if (!fila || fila.unidad == null || fila.unidad.requiereDecision === true) return null;
  if (fila.bonificado === true) return null;
  const p = Number(fila.costoFactura);
  return Number.isFinite(p) && p > 0 ? p : null;
}

/**
 * EL COSTO MAESTRO QUE ESCRIBE EL CIERRE DESDE LOS RENGLONES DEL PAPEL, o null.
 *
 * El de la fila cuya lectura la persona aceptó (`aceptado(precio)`: el mismo
 * número en el renglón y en la decisión guardada, contra el mismo catálogo).
 * Una lectura que cambió después de aceptar es otro precio y no autoriza nada.
 * Sin aceptación no se escribe: el costo maestro no se mueve solo.
 *
 * El precio de la lectura está en la unidad en que el depósito cuenta: el
 * bulto de un pack queda igual, y la pieza de un fiambre por pieza vuelve al
 * kilo que guarda el catálogo (`costoDelDepositoEnLaUnidadDelCatalogo`).
 * Hasta el 2026-11-07 se escribía tal cual: el cierre del pedido 530 guardó la
 * pieza de la Mortadela Paladini, $41.330,09, como precio del kilo.
 * `costoLineaAMaestro` con "BULTO" después solo lo redondea a centavos.
 *
 * @param filas     las filas del papel de esta línea del pedido
 * @param base      la ficha del producto
 * @param aceptado  (precio) => si la persona aceptó ese precio en esta recepción
 * @returns `{ costoMaestro, fila }` o null
 */
export function costoMaestroDeLaLectura({ filas = [], base = null, aceptado = () => false } = {}) {
  for (const fila of Array.isArray(filas) ? filas : []) {
    const precio = precioDeLaLectura(fila);
    if (precio === null || aceptado(precio) !== true) continue;
    const enElCatalogo = costoDelDepositoEnLaUnidadDelCatalogo({ base, costo: precio });
    if (enElCatalogo === null) continue;
    const costoMaestro = costoLineaAMaestro({
      precioCosto: enElCatalogo,
      unidad: "BULTO",
      factorPack: base?.factor_pack,
      modoCompraProveedor: base?.modoCompraProveedor,
      unidadMedida: base?.unidad_medida,
    });
    if (costoMaestro !== null) return { costoMaestro, fila };
  }
  return null;
}
