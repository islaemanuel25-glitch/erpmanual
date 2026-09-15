"use client";

// DOS SOLAPAS DE VERDAD, NO DOS TEXTOS.
//
// ── POR QUÉ NACE EN EL KIT ───────────────────────────────────────────────
//
// Porque es un control, no una decoración de una pantalla: una pastilla con las
// opciones adentro y la activa pintada. Escrita en la lista de ofertas, la
// próxima pantalla que necesite lo mismo la copia, y ahí ya son dos que se
// separan el día que una cambie. Es la regla 1 del proyecto.
//
// ── Y NACE CHICA, A PROPÓSITO ────────────────────────────────────────────
//
// Solo hace lo que la lista de ofertas necesita HOY: dos o más opciones de
// texto, una activa, un click. Sin íconos, sin badges de conteo, sin
// deshabilitadas, sin variantes de tamaño.
//
// Es lo contrario de lo que ya salió mal dos veces en este kit:
// `SunmiModalLayout` solo sabe centrar y hay dos pantallas que por eso no lo
// pueden usar, y `SunmiButtonIcon` trae tres colores fijos adentro y no acepta
// etiqueta. Las dos se escribieron adivinando casos futuros y sirven para menos
// casos de los que hay. Cuando una segunda pantalla necesite algo más, se agrega
// ACÁ con el caso real a la vista.
//
// ── NI UN NÚMERO ESCRITO ACÁ ─────────────────────────────────────────────
//
// Los tres radios y el padding viven en `styles/sunmi.css` como variables, igual
// que las medidas de la tarjeta de producto. El tamaño de letra es `text-sm3`,
// que ya son los 13 px del diseño en el config de Tailwind: un token nuevo al
// lado sería el mismo número con dos nombres.
//
// Los colores salen de `--pos-control-bg`, `--pos-accent`,
// `--pos-btn-primary-fg` y `--pos-control-text`, definidos en los catorce temas.

/**
 * @param {{opciones: Array<{valor: string, texto: string}>, valor: string, onCambiar: (v: string) => void, etiqueta?: string}} props
 */
export default function SunmiSolapas({ opciones = [], valor, onCambiar, etiqueta = null }) {
  if (!Array.isArray(opciones) || opciones.length === 0) return null;

  return (
    <div
      // `tablist` y `tab` son lo que un lector de pantalla necesita para
      // anunciar "solapa 1 de 2". Sin esto son dos botones sueltos y no se sabe
      // que son excluyentes entre sí.
      role="tablist"
      aria-label={etiqueta ?? undefined}
      className="sunmi-solapas flex w-full gap-1"
    >
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambiar?.(o.valor)}
            className={`sunmi-solapa flex-1 py-1.5 text-center text-sm3 font-medium ${
              activa ? "sunmi-solapa-activa" : ""
            }`}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
