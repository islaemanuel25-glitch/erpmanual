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
//   · bulto       — si el papel lo imprime (`contenidoQueDiceElPapel`: 24), y
//                   con él "Pack" y el costo del bulto (ver `precargaDelAlta`).
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
import { contenidoQueDiceElPapel } from "@/lib/compras-proveedor/contenidoDelBulto";

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
  const costo = costoDelRenglonParaElAlta(fila);
  const bulto = contenidoQueDiceElPapel(fila?.textoCrudo);
  // ── CON BULTO, LA FICHA ES LA DEL PACK ────────────────────────────────
  //
  // En este negocio los productos se trabajan por pack: una sola ficha, la del
  // bulto. Myf #383 abría el alta en "Unidad" con 1.207,72 —el costo de un
  // frasco—, y al pasarla a mano a "Pack" el costo seguía siendo el de un frasco
  // como si fuera el de la caja. Así que con bulto viene "Pack", el factor del
  // papel y el costo del bulto: el de la unidad que calcula la recepción por el
  // factor (1.207,72 × 24 = 28.985,28). Sin bulto, unidad y costo por unidad.
  if (bulto != null && bulto > 1) {
    precarga.unidad_medida = "pack";
    precarga.factor_pack = bulto;
    if (costo != null) precarga.precio_costo = Math.round(costo * bulto * 100) / 100;
  } else if (costo != null) {
    precarga.precio_costo = costo;
  }
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
