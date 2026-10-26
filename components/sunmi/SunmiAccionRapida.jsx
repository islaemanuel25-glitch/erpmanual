// LA ACCIÓN RÁPIDA DE UNA TARJETA DE PRODUCTO: "✓ COINCIDE" Y SUS PARIENTES.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// De la tarjeta de recibir una transferencia (`TarjetaRecepcionMovil`), TAL
// CUAL estaba: un `SunmiButton` con contorno de acento, arriba a la derecha de
// la tarjeta, del tamaño de un botón chico. Es el formato que Emanuel eligió
// para toda la app (2026-10-26). Hasta ese día cada pantalla lo armaba con la
// misma constante de clase, y "Recibir pedido" de compras lo dibujaba con un
// `SunmiLinkButton` —sin relleno, sin borde, sin tamaño de botón—, que se veía
// como una etiqueta chica y cuadrada.
//
// La usan todas las acciones que cierran la tarjeta en un toque sin abrir
// nada: "✓ Coincide" en las dos recepciones, "✓ Va completo" al preparar un
// pedido, "✓ Sí", "Vincular", "Listo" y "✓ Usar" en las listas de proveedor.
//
// ── LA CLASE, Y POR QUÉ VA EN `className` ─────────────────────────────────
//
// `accent-outline` trae solo el contorno y sale de `--pos-accent`: no escribe
// ningún color. Va en `className` y no como `color` de `SunmiButton` porque el
// candado del kit lee `.sunmi-btn-<una-sola-palabra>` como color, y gana sobre
// el `sunmi-btn-<color>` que el botón agrega porque `styles/sunmi.css` la define
// después (`variantesDeAccion.test.mjs`). El `className` del consumidor se
// suma detrás y lo negocia `SunmiButton`, como cualquier otro.

import SunmiButton from "./SunmiButton";

/** La clase de la acción rápida. La pieza de corregir pesa menos: ver `PiezasDeRevision`. */
export const CLASE_ACCION_RAPIDA = "sunmi-btn-accent-outline";

/** El texto del caso feliz de una recepción, el mismo en todas. */
export const TEXTO_COINCIDE = "✓ Coincide";

export default function SunmiAccionRapida({ children, className = "", ...props }) {
  return (
    <SunmiButton {...props} className={["shrink-0", CLASE_ACCION_RAPIDA, className].filter(Boolean).join(" ")}>
      {children}
    </SunmiButton>
  );
}
