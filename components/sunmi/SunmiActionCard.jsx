// TARJETA ENTERA QUE ES UNA ACCIÓN, NO UNA NAVEGACIÓN.
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO ALCANZABA CON LO QUE HABÍA ───────────────
//
// Hay listas donde la tarjeta completa es el área clickeable: se toca en
// cualquier parte y se abre un panel, se elige un elemento, se despliega un
// detalle. Eso es un `<button>` con forma de tarjeta.
//
// El kit tenía las dos piezas de al lado y ninguna servía:
//
//   · `SunmiCard` es un `<div>` y no acepta cambiar de etiqueta, así que no
//     puede recibir el foco ni responder a la barra espaciadora.
//   · `SunmiNavCard` sí es clickeable, pero NAVEGA: pide `href`, dibuja el
//     chevron y arma un redondel con icono. Forzar una acción ahí adentro
//     prometería una navegación que no existe — que es el mismo defecto que esa
//     pieza documenta haber tenido.
//
// Por eso el contrato lo cerró Figma —archivo fYqIEZxHRb6yx6pIUrUG2h, nodo
// 14:2—, con exactamente la caja que la primera pantalla ya dibujaba a mano.
//
// ── DE DÓNDE SALEN EL FONDO Y EL BORDE ────────────────────────────────────
//
// De `.sunmi-card-surface`, que los lee de `--card-bg` y `--card-border`. No
// hay ningún color nuevo acá: la tarjeta se ve distinta en los catorce temas
// porque los tokens cambian, no porque la pieza sepa de colores.
//
// LA PRIMERA VERSIÓN DE ESTA PIEZA ESCRIBÍA `sunmi-panel`, Y ESA CLASE NO
// EXISTE. No está en ninguna hoja, no la genera ningún plugin y no aparece en el
// CSS que sirve producción. La tarjeta salía transparente y sin borde —medido:
// `rgba(0,0,0,0)` y `0px`— y nadie lo veía porque el consumidor de dominio hacía
// exactamente lo mismo antes de la extracción: la comparación contra `main` daba
// cero diferencias con los dos lados igual de mal.
//
// Lo tapaba además un candado que se llamaba "el fondo y el borde salen del
// tema" y solo comprobaba que no hubiera colores escritos a mano. Un archivo sin
// fondo ninguno pasaba igual.
//
// ── EL FOCO ES EL DEL NAVEGADOR ───────────────────────────────────────────
//
// No define anillo propio, por la misma razón que `SunmiLinkButton`: al quitarse
// las supresiones globales de `app/globals.css`, un `<button>` sin contrato de
// foco recibe el anillo nativo de `:focus-visible`. Inventar uno acá duplicaría
// la señal y podría dar doble indicador. Ver `lib/sunmi/focoVisible.test.mjs`.
//
// ── LO QUE NO HACE, Y ES EL LÍMITE ────────────────────────────────────────
//
// No sabe nada de lo que muestra. El contenido lo arma el consumidor, que sigue
// siendo un componente de dominio: `TarjetaOferta` conoce la oferta, sus fechas
// y su estado, y esta pieza solo le presta la superficie.

export default function SunmiActionCard({ children, className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      {...props}
      className={`w-full text-left sunmi-card-surface rounded-lg p-3 flex flex-col gap-1.5 ${className}`}
    >
      {children}
    </button>
  );
}
