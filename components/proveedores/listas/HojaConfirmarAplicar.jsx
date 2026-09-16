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

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
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

  return (
    <SunmiModalLayout
      open
      title={`¿Aplicar los ${cantidad} precios?`}
      color="amber"
      onClose={trabajando ? undefined : onVolver}
      // Los dos que el kit ya NO tiene default: los declara cada consumidor y
      // hay un censo que lo exige. Estos son los mismos valores que traían
      // `ModalRevertir` y `ModalTerminar`, que son sus hermanos de esta pantalla.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      // NO lleva `destructivo`: acá no hay nada escrito que se pueda perder
      // —son cuatro renglones de lectura y dos botones—, así que tocar el velo
      // cierra, que es lo que espera quien abre una hoja por error con el pulgar.
      // El criterio es qué se pierde al cerrar sin querer, no qué tan grave es
      // la acción; lo grave lo sostiene el botón, que hay que ir a buscar.
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="cyan"
            onClick={onAplicar}
            disabled={trabajando}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando ? "Aplicando…" : "Sí, aplicar"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onVolver}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Volver
          </SunmiButton>
        </div>
      }
    >
      <ul className="space-y-2">
        {puntos.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm3 sunmi-text-strong leading-snug">
            <span aria-hidden="true" className="sunmi-text-muted">•</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </SunmiModalLayout>
  );
}
