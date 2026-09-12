"use client";

import { forwardRef } from "react";

import { componerClaseInput } from "@/lib/sunmi/claseAncho";

// `w-full` deja de ir siempre: lo pone `componerClaseInput` solo cuando quien
// usa el componente no declaró un ancho propio. Antes iban los dos y ganaba
// `w-full` por orden de la hoja de estilos, así que el ancho pedido no se
// aplicaba nunca. El porqué completo está en el módulo.
const BASE = "sunmi-input disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * LA UNIDAD ADENTRO DEL CAMPO, A LA DERECHA.
 *
 * `sufijo` dibuja una etiqueta corta —"PACK", "CAJÓN", "UN"— dentro de la caja,
 * pegada al borde derecho. Lo pidió el rediseño del panel de corrección: con dos
 * campos de cantidad lado a lado, el rótulo de arriba no alcanza para saber en
 * qué escala se está escribiendo cada uno.
 *
 * ── POR QUÉ VA EN EL KIT Y NO EN LA PANTALLA ────────────────────────────
 *
 * Es la regla 1: si una pantalla necesita algo que el kit no tiene, se agrega al
 * kit. Componerlo allá habría significado un `<input>` crudo adentro de un
 * envoltorio, que es justo lo que el trinquete cuenta.
 *
 * ── Y POR QUÉ EL CAMINO SIN SUFIJO NO CAMBIA NI UN NODO ─────────────────
 *
 * Sin `sufijo` devuelve EXACTAMENTE el mismo `<input>` suelto de antes, sin
 * envoltorio. Las 200 y pico de pantallas que ya lo usan no ven un div nuevo, y
 * por eso ninguna se mueve un píxel. El envoltorio existe solo cuando alguien
 * pide la etiqueta.
 *
 * El relleno derecho lo pone el envoltorio sobre el input y no la pantalla:
 * si el texto pudiera meterse debajo de la etiqueta, el campo mentiría sobre lo
 * que tiene escrito.
 */
const SunmiInput = forwardRef(function SunmiInput({ className = "", sufijo = null, ...props }, ref) {
  // `pr-12` solo cuando hay etiqueta. `componerClaseInput` negocia el ANCHO y
  // nada más —lo comprobado, no lo supuesto: mira `declaraAncho` y nada de
  // padding—, así que esta utilidad le gana al `px-2` de `.sunmi-input` por el
  // orden de la hoja, que es lo que `scripts/sonda-cascada.mjs` verifica en cada
  // despliegue. Sin esto el número se mete DEBAJO de la etiqueta y el campo
  // miente sobre lo que tiene escrito.
  const pedido = sufijo ? `${className} pr-12`.trim() : className;
  const input = <input ref={ref} {...props} className={componerClaseInput(pedido, BASE)} />;
  if (!sufijo) return input;
  return (
    <span className="relative block">
      {input}
      <span className="absolute inset-y-0 right-2 flex items-center text-sm2 sunmi-text-muted pointer-events-none">
        {sufijo}
      </span>
    </span>
  );
});

export default SunmiInput;
