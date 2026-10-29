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
//   · bulto       — si el papel lo imprime (`contenidoQueDiceElPapel`: 24).
//
// Lo que NO se precarga, y por qué:
//
//   · SKU         — el alta no asigna ninguno: se guarda el que se escribe, o
//                   ninguno. Inventarlo a partir del papel está prohibido.
//   · venta       — el alta solo la calcula cuando hay un margen cargado, y un
//                   alta nueva no trae margen: queda vacía, como en cualquiera.
//   · código del proveedor — el alta no tiene ese campo. Lo guarda el vínculo
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
  if (costo != null) precarga.precio_costo = costo;
  const bulto = contenidoQueDiceElPapel(fila?.textoCrudo);
  if (bulto != null && bulto > 1) precarga.factor_pack = bulto;
  return precarga;
}
