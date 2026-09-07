// BOTÓN CON SEMÁNTICA DE ACCIÓN Y APARIENCIA DE ENLACE.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// Hay acciones que no son navegación pero que se leen como un enlace: "Ver
// menos", "Ver los 12 renglones que quedaron afuera". Un `<a href>` sería
// mentir —no llevan a ningún lado— y un `SunmiButton` las convertiría en una
// píldora con relleno, borde y radio, que es otra cosa.
//
// Hasta esta pieza, el único caso del repo lo resolvía escribiendo el `<button>`
// a mano en la pantalla. El trinquete lo contaba como elemento crudo, con razón:
// era una decisión de apariencia repetida fuera del kit.
//
// El contrato lo cerró Figma —archivo fYqIEZxHRb6yx6pIUrUG2h, nodo 13:2—.
//
// ── LO QUE LA PIEZA NO PONE, Y ES PARTE DEL CONTRATO ──────────────────────
//
// Sin fondo, sin borde, sin radio, sin píldora y SIN PADDING. Un enlace no
// reserva caja: se alinea con el texto que lo rodea, y cualquier relleno propio
// lo despegaría de su renglón.
//
// EL MARGEN EXTERIOR ES DEL CONSUMIDOR. Dónde se separa del párrafo de arriba
// depende de la pantalla, no de la pieza. Por eso el importador conserva su
// `mt-1` y esta pieza no lo conoce.
//
// ── EL FOCO ES EL DEL NAVEGADOR, A PROPÓSITO ──────────────────────────────
//
// No define anillo propio. Al quitarse las dos supresiones globales de
// `app/globals.css`, un `<button>` sin contrato de foco vuelve a recibir el
// anillo nativo de `:focus-visible`, que se pinta en dos tonos y se ve tanto
// sobre los temas claros como sobre los oscuros —medido en los cuatro—.
//
// Agregarle un anillo propio acá sería duplicar una señal que ya existe, y
// además la pondría en riesgo de convivir con la nativa: doble indicador, que es
// justo lo que el contrato de foco evita. Ver `lib/sunmi/focoVisible.test.mjs`.

export default function SunmiLinkButton({ children, className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      {...props}
      className={`text-xs sunmi-text-accent underline ${className}`}
    >
      {children}
    </button>
  );
}
