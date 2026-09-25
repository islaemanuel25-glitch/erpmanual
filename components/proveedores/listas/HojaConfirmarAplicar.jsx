"use client";

// 6 · ¿APLICAR LOS N PRECIOS?
//
// ── POR QUÉ UNA CONFIRMACIÓN Y NO UNA CASILLA ───────────────────────────────
//
// Acá había una casilla de 14 × 14 px —"entiendo que esto escribe costos"— que
// había que marcar antes de que el botón se encendiera. En un Sunmi de 360 px eso
// es un blanco que se falla, y lo que hacía no era proteger: quien la marca sin
// leer queda igual de expuesto, y quien sí lee tiene que apuntar dos veces.
//
// Lo que protege es SABER QUÉ VA A PASAR, y eso se resuelve diciéndolo: cuántos
// productos, de qué proveedor, qué pasa con el precio de venta, qué NO se toca y
// que se puede deshacer. Cuatro renglones y dos botones grandes.
//
// ── EL RENGLÓN DEL PRECIO DE VENTA ESTÁ VERIFICADO CONTRA EL CÓDIGO ─────────
//
// El diseño decía "El precio de venta se recalcula con el margen de cada local", y
// hay que leer tres archivos para saber si es cierto. Lo es, con una condición
// que el texto no tenía:
//
//   · `aplicar/route.js` resuelve el modo con `resolverModoPrecioVenta`, cuyo
//     default es RECALCULAR_POR_MARGEN. O sea: sí, se recalcula.
//   · `ventaParaModo` solo recalcula cuando el producto tiene REGLA AUTOMÁTICA
//     —un margen configurado—. Sin margen no toca la venta y no falla: la deja
//     como está.
//
// Un producto sin margen configurado, con un texto que promete el recálculo, es
// un usuario que espera un precio de venta nuevo y encuentra el viejo. Por eso el
// renglón dice las dos cosas.

import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import { MODO_PRECIO_VENTA } from "@/lib/proveedores/listas/aplicacion";

/**
 * Qué le pasa al precio de venta, según el modo con el que se va a aplicar.
 *
 * Vive afuera del JSX para poder ejercerlo en un candado: lo que se afirma es que
 * el renglón nombra la condición y no promete un recálculo incondicional.
 */
export function textoDelPrecioDeVenta(modo) {
  if (modo === MODO_PRECIO_VENTA.MANTENER_VENTA) {
    return "El precio de venta NO se toca: solo cambia el costo.";
  }
  return "El precio de venta se recalcula con el margen de cada local, en los productos que tengan margen configurado.";
}

export default function HojaConfirmarAplicar({
  cantidad,
  proveedor,
  paraRevisar = 0,
  modoPrecioVenta = MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN,
  trabajando = false,
  onAplicar,
  onVolver,
}) {
  const puntos = [
    `Se actualiza el costo de ${cantidad} ${cantidad === 1 ? "producto" : "productos"} de ${proveedor}.`,
    textoDelPrecioDeVenta(modoPrecioVenta),
    paraRevisar > 0
      ? `Los ${paraRevisar} para revisar no se tocan.`
      : "No queda nada pendiente de revisar.",
    "Si te equivocaste, lo podés deshacer.",
  ];

  // El marcado —modal, renglones y dos botones— es del kit desde que la semana
  // operativa necesitó lo mismo: `SunmiHojaDeConfirmacion` salió de acá tal cual.
  return (
    <SunmiHojaDeConfirmacion
      titulo={`¿Aplicar los ${cantidad} precios?`}
      puntos={puntos}
      textoConfirmar="Sí, aplicar"
      textoTrabajando="Aplicando…"
      colorConfirmar="cyan"
      trabajando={trabajando}
      onConfirmar={onAplicar}
      onVolver={onVolver}
    />
  );
}
