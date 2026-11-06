// lib/compras-proveedor/altaDesdeElPapel.js
//
// LO QUE EL ALTA DE PRODUCTO RECIBE PRECARGADO CUANDO SE CREA DESDE UN RENGLÓN.
//
// Myf #383, "HELLMANNS MAY LIVIANA DP 24X237G": el producto no existía y la hoja
// "Qué producto es" no tenía salida. Ahora ofrece "Crear producto", que abre EL
// MISMO formulario de alta (`ModalProductoFinal` → `FormProducto`) con lo que el
// sistema ya sabe, y nada más:
//
//   · nombre      — lo que dice el papel;
//   · proveedor   — el del comprobante;
//   · costo       — el de la recepción: `precioFinalDelRenglon`, con impuestos
//                   y cargos, por lo que factura el renglón;
//   · bulto       — si el renglón lo dice (`bultoDelAltaDesdeElPapel`: 24, 20),
//                   y con él "Pack" y la pregunta de si el precio es por caja
//                   o por unidad, que decide el costo (ver `precargaDelAlta`).
//
// Lo que NO se precarga, y por qué:
//
//   · SKU         — el alta no asigna ninguno: se guarda el que se escribe, o
//                   ninguno. Inventarlo a partir del papel está prohibido.
//   · venta       — el alta solo la calcula cuando hay un margen cargado, y un
//                   alta nueva no trae margen: queda vacía, como en cualquiera.
//   · código del proveedor — el alta no tiene ese campo editable: se MUESTRA
//                   fijo (`codigoDelProveedorParaElAlta`) y lo guarda el vínculo
//                   que se hace al volver (`aliasAEscribir`), con el texto del
//                   papel: el mismo motor que reconoce la próxima factura.
//
// Módulo puro: sin React, sin Prisma y sin red.

import { precioFinalDelRenglon } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { aCentavos } from "@/lib/compras-proveedor/comprobante/impuestos";
import { contenidoQueDiceElPapel, unidadesQueDiceElRenglon } from "@/lib/compras-proveedor/contenidoDelBulto";
import { cantidadPorCajaEnNombre } from "@/lib/proveedores/listas/lectura/numeroDeLista";
import {
  costoDelAltaDesdeLaLista,
  lecturaRecordadaDelAlta,
  preguntaDelPrecioDeLaLista,
} from "@/lib/proveedores/listas/costoDelAltaDesdeLaLista";

// ── POR LA CAJA O POR UNIDAD, COMO EL ALTA DE LISTAS (2026-11-06) ─────────
//
// DAS Mayorista, factura 0020-00017245: "9020 CREMA VERONA XCAJA 20", 6 cajas
// a $ 24.793,38. El alta abría sin factor y con "Costo * (por unidad)" en
// 30.743,79 —el precio de la CAJA con lo que la recepción suma al costo—, y
// guardado así cada crema quedaba a $ 30.743,79.
//
// Decisión de Emanuel: el alta desde la recepción hace lo mismo que el alta
// desde "Sin producto en tu catálogo" de Listas, con las MISMAS funciones
// (`preguntaDelPrecioDeLaLista`, `costoDelAltaDesdeLaLista`,
// `lecturaRecordadaDelAlta`) sobre el renglón puesto con la forma de una fila
// de lista (`filaComoLaDeLaLista`): el precio es el que hoy precarga la
// recepción y la cantidad por caja la del renglón. Sin recargo ni impuesto de
// lista: los impuestos ya los sumó la recepción.

/**
 * CUÁNTAS TRAE LA CAJA, SEGÚN EL RENGLÓN, o null (sin número claro, o 1).
 *
 * Primero lo que el renglón dice por su cuenta —el UxB que guarda el lector en
 * `enQueViene`, "bulto de 40"—; si no, el nombre (`cantidadPorCajaEnNombre`:
 * "24X237G" → 24, "XCAJA 20" → 20, "X 12" → 12; "X 4.5 KG" es peso y no
 * cuenta); y si no, el contenido en unidades que ya leía la recepción, "(83u)".
 */
export function bultoDelAltaDesdeElPapel(fila) {
  const texto = fila?.textoCrudo;
  for (const n of [unidadesQueDiceElRenglon(fila?.enQueViene), cantidadPorCajaEnNombre(texto), contenidoQueDiceElPapel(texto)]) {
    if (Number.isInteger(n) && n > 1) return n;
  }
  return null;
}

/** El renglón con la forma que leen las funciones del alta de Listas. */
export function filaComoLaDeLaLista(fila) {
  return { precioConIva: costoDelRenglonParaElAlta(fila), unidadesPorBulto: bultoDelAltaDesdeElPapel(fila) };
}

/** La pregunta "¿El precio de la factura es por caja o por unidad?", o null. */
export function preguntaDelAltaDesdeElPapel(fila) {
  return preguntaDelPrecioDeLaLista(filaComoLaDeLaLista(fila), { deDonde: "factura" });
}

/** El costo del alta: con caja, null hasta que se elija (`PRECIO_ES`). */
export function costoDelAltaDesdeElPapel({ fila, precioEs = null }) {
  return costoDelAltaDesdeLaLista({ fila: filaComoLaDeLaLista(fila), precioEs });
}

/** Lo elegido, como se recuerda para el producto con el proveedor, o null. */
export function lecturaRecordadaDelAltaDesdeElPapel({ fila, precioEs }) {
  return lecturaRecordadaDelAlta({ fila: { unidadesPorBulto: bultoDelAltaDesdeElPapel(fila) }, precioEs });
}

/** El costo de lo que factura el renglón, o null si el papel no lo dice. */
export function costoDelRenglonParaElAlta(fila) {
  const importe = Number(fila?.importeDelPapel);
  const cantidad = Number(fila?.cantidad);
  // Sin importe, bonificado o sin cantidad no hay costo que proponer.
  if (!Number.isFinite(importe) || importe <= 0 || !Number.isFinite(cantidad) || cantidad <= 0) return null;
  return precioFinalDelRenglon({
    costoFinalRenglon: importe,
    // La fila trae su parte de los cargos en pesos; la regla la pide en centavos.
    cargoDeLaLinea: aCentavos(Number(fila?.cargoDelRenglon) || 0),
    divisor: cantidad,
  });
}

/**
 * El `initialData` del alta: sin `id`, así el formulario sigue siendo un alta.
 * Lo que no se sabe no va, y el formulario lo deja vacío como en cualquier alta.
 */
export function precargaDelAlta({ fila, proveedorId }) {
  const precarga = {};
  const nombre = String(fila?.textoCrudo ?? "").trim();
  if (nombre) precarga.nombre = nombre;
  if (Number(proveedorId) > 0) precarga.proveedor_id = Number(proveedorId);
  const bulto = bultoDelAltaDesdeElPapel(fila);
  // ── CON BULTO, LA FICHA ES LA DEL PACK, Y EL COSTO SE PREGUNTA ────────
  //
  // En este negocio los productos se trabajan por pack: una sola ficha, la del
  // bulto. Con bulto viene "Pack" y el factor; el costo queda VACÍO hasta que
  // se conteste si el precio es por caja o por unidad (`preguntaDelAltaDesdeElPapel`),
  // igual que en Listas. Hasta el 2026-11-06 se suponía siempre "por unidad" y
  // se multiplicaba (Myf #383: 1.207,72 × 24); la CREMA VERONA XCAJA 20 cobra
  // por caja y así quedaba 20 veces más cara. Sin bulto, unidad y costo por
  // unidad, sin preguntar.
  if (bulto !== null) {
    precarga.unidad_medida = "pack";
    precarga.factor_pack = bulto;
  }
  const costo = costoDelAltaDesdeElPapel({ fila });
  if (costo !== null) precarga.precio_costo = costo;
  return precarga;
}

/**
 * El código que el proveedor le da al producto, tal como lo trae el renglón:
 * el alta lo muestra fijo y el vínculo lo guarda al crear. Null si no trae.
 */
export function codigoDelProveedorParaElAlta(fila) {
  const codigo = String(fila?.codigoProveedor ?? "").trim();
  return codigo || null;
}
