"use client";

// components/sunmi/SunmiModalLayout.jsx
//
// LAS CUATRO FORMAS QUE EL SISTEMA USA HOY, Y NINGUNA MÁS.
//
// Hasta acá solo sabía centrar, y por eso había pantallas que no lo podían usar
// y se armaban la capa a mano. Hay 54 capas de modal escritas a mano en el repo,
// medidas: 47 centradas, 4 hoja inferior, 3 cajón lateral, y de esas 47 hay dos
// que además cambian de forma con el ancho.
//
// Las cuatro salen de pantallas que HOY funcionan, y ninguna se inventó:
//
//   centrado         lo que este componente ya hacía
//   hoja             el carrito del pedido en el teléfono (CarritoPedido)
//   cajon            el mismo carrito, en pantalla grande
//   hoja-o-centrado  los dos modales de caja: pegado abajo en el teléfono y
//                    centrado de `sm` para arriba. Es UNA forma, no dos usos:
//                    es lo que esas pantallas hacen hoy y funcionan.
//
// No hay un sistema de puntos de corte configurables. El único corte que existe
// en el repo es ese `sm`, así que es el único que la pieza sabe.
//
// ── EL VELO ES UN BOTÓN, y eso deja de ser privilegio de una pantalla ───────
//
// El carrito ya lo tenía bien: su velo es un `<button type="button">` con
// `aria-label="Cerrar"`, así que se puede cerrar con el teclado y un lector de
// pantalla lo anuncia. Acá era un `<div aria-hidden>` con `onClick`, que para
// quien no usa mouse no existe. Se lleva al kit, que es para lo que está.
//
// Cuando el velo NO cierra —`destructivo`— vuelve a ser un `<div aria-hidden>`:
// un botón que no hace nada es peor que ninguno, porque recibe el foco y no
// contesta.
//
// ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
//
// La tarjeta, el encabezado, el botón de cerrar y el pie quedan como estaban:
// los cuatro usos actuales tienen que verse idénticos. Las formas nuevas cambian
// dónde se para el panel, no de qué está hecho.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { declaraAncho } from "@/lib/sunmi/claseAncho";
import { declaraAnchoMaximo } from "@/lib/sunmi/claseNegociada";

/** Dónde se para el panel, por forma. La capa y el panel se deciden juntos. */
const FORMAS = {
  centrado: { capa: "flex items-center justify-center p-3", panel: "", tarjeta: "" },
  hoja: { capa: "flex flex-col justify-end", panel: "", tarjeta: "" },
  // El cajón ocupa el alto entero: si la tarjeta quedara del alto de su
  // contenido, el panel se vería pegado arriba y no como un cajón. Se midió
  // dibujándolo — sin esto la tarjeta terminaba a los 105 píxeles.
  cajon: { capa: "flex justify-end", panel: "h-full", tarjeta: "h-full flex flex-col" },
  "hoja-o-centrado": { capa: "flex items-end sm:items-center justify-center", panel: "", tarjeta: "" },
};

export default function SunmiModalLayout({
  open,
  title,
  subtitle,
  color = "amber",
  onClose,
  children,
  footer = null,
  maxWidth = "max-w-xl",
  showCloseButton = true,
  /**
   * Una acción que escribe y no se puede deshacer sola. Con esto en true, tocar
   * el velo NO cierra: cerrar sin querer un modal de lectura no cuesta nada,
   * pero perder de vista una confirmación destructiva a mitad de camino sí.
   */
  destructivo = false,
  /** "centrado" | "hoja" | "cajon" | "hoja-o-centrado". Ver arriba de dónde sale cada una. */
  forma = "centrado",
  /**
   * Clases del panel. NEGOCIA, no concatena: si acá viene un ancho o un ancho
   * máximo, la pieza retira el suyo. Dos clases de la misma familia tienen la
   * misma especificidad y ganaría la que Tailwind haya puesto última en la hoja
   * de estilos, no la que alguien quiso. El porqué largo está en
   * `lib/sunmi/claseAncho.js`.
   */
  className = "",
  /** Cómo se anuncia. Sin `aria-label` ni `aria-labelledby`, el título alcanza. */
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  role = "dialog",
}) {
  if (!open) return null;

  const f = FORMAS[forma] ?? FORMAS.centrado;
  const pedido = typeof className === "string" ? className.trim() : "";

  const clasesDelPanel = [
    "relative",
    declaraAncho(pedido) ? "" : "w-full",
    declaraAnchoMaximo(pedido) ? "" : maxWidth,
    f.panel,
    pedido,
  ]
    .filter(Boolean)
    .join(" ");

  const cierraElVelo = !destructivo && typeof onClose === "function";

  return (
    <div
      className={`fixed inset-0 z-[9999] ${f.capa}`}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : title)}
      aria-labelledby={ariaLabelledBy}
    >
      {/* EL VELO. Oscurece lo de atrás para que el modal se lea como una
          decisión y no como un bloque más de la pantalla.
          El color sale del FONDO DEL TEMA con transparencia, no de un negro
          fijo: en un tema claro un velo negro se ve como un apagón, y el token
          ya cambia con el tema. */}
      {cierraElVelo ? (
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          style={{ background: "color-mix(in srgb, var(--app-bg) 78%, transparent)" }}
          className="absolute inset-0"
        />
      ) : (
        <div
          aria-hidden="true"
          style={{ background: "color-mix(in srgb, var(--app-bg) 78%, transparent)" }}
          className="absolute inset-0"
        />
      )}

      <div className={clasesDelPanel}>
        <SunmiCard className={f.tarjeta}>
          <div className="flex items-start justify-between gap-2">
            <SunmiCardHeader
              title={title}
              subtitle={subtitle}
              color={color}
            />

            {showCloseButton && onClose && (
              <SunmiButton
                color="slate"
                size="sm"
                onClick={onClose}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          <div className="mt-2 flex flex-col max-h-[65vh] overflow-y-auto gap-3">
            {children}
          </div>

          {footer && (
            <div className="mt-3 flex justify-end gap-2">
              {footer}
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
