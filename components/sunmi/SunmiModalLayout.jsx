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
import SunmiHeader from "@/components/sunmi/SunmiHeader";
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
   * A qué altura se apila. UN SOLO NÚMERO, y va en la capa.
   *
   * ── POR QUÉ UNO SOLO, Y POR QUÉ ACÁ ────────────────────────────────────
   *
   * La capa es `fixed` con `z-index`, así que crea un contexto de apilado: todo
   * lo que está adentro —el velo y el panel— se apila ENTRE SÍ y nada de afuera
   * se puede meter en el medio. El velo y el panel no llevan z propio a
   * propósito: se ordenan por el orden en que están escritos, que es el único
   * orden que hace falta.
   *
   * Si alguna vez se les pusiera un z a cada uno, ese contexto dejaría de ser
   * atómico y volvería a existir el hueco. Hay un candado que lo fija.
   *
   * El default es el de siempre. Se parametriza porque el repo tiene un
   * escalonado con intención que no se puede pisar: 40 el fondo del cajón, 50 el
   * modal, 60 el desplegable que se abre adentro del modal. Unificar se mira
   * cuando estén todas migradas y se puedan comparar al lado.
   */
  z = 9999,
  /**
   * El espaciado del CUERPO y del PIE, con el del kit por defecto.
   *
   * ── POR QUÉ SON PARÁMETRO Y NO UNA OPINIÓN DEL KIT ─────────────────────
   *
   * Emparejar los modales es emparejar la CAPA y la ESTRUCTURA —el velo, el
   * apilado, el botón de cerrar—, no repintar el interior de cada cuerpo. El
   * `gap-3` del kit no es un borde: separa TODOS los bloques del formulario
   * entre sí, así que imponerlo estira un modal de permisos con quince toggles.
   * Migrar la capa de una pantalla no puede cambiar cómo se ve su formulario.
   *
   * Es la cuarta cosa de la misma familia —el alto del cuerpo, el apilado, el
   * padding de la tarjeta y esto—: el kit tiene una opinión y las pantallas
   * tienen otra. En todas se resolvió igual, y el criterio está escrito en el
   * roadmap: el parámetro es una POSTERGACIÓN, no un perdón. Cada pantalla que
   * declare uno queda anotada ahí con qué declaró y por qué, para que al final
   * de la fase se pueda decidir qué se unifica y qué tiene razón de ser distinto.
   */
  espacioCuerpo = "mt-2 gap-3",
  espacioPie = "mt-3",
  /**
   * Una referencia al div del CUERPO.
   *
   * ── POR QUÉ EXISTE, Y NO ES DE ASPECTO ─────────────────────────────────
   *
   * `ModalProveedor` la usa para mandar el scroll arriba cuando el modal se
   * reabre. Sin eso, abrirlo para editar otro proveedor lo deja scrolleado donde
   * quedó el anterior — y eso no es un detalle: es la clase de cosa que hace que
   * alguien edite el campo equivocado.
   *
   * Hasta que la pieza se quedó con el div del cuerpo, esa pantalla no se podía
   * migrar sin perder la función. Es la quinta cosa de la misma familia y se
   * resuelve igual: sale de una pantalla que hoy funciona y queda anotada en el
   * registro.
   *
   * Cuando estén las 36 se mira si esto debería hacerlo la pieza para todos —
   * reabrir un modal arriba es razonable siempre— en vez de recibirlo de afuera.
   */
  refCuerpo,
  /**
   * Qué encabezado dibuja: `"tarjeta"` —el de siempre— o `"cinta"`.
   *
   * ── QUÉ SE VE DISTINTO, QUE ES LO QUE IMPORTA ──────────────────────────
   *
   * No es "usar otro componente": es que el título deje de ser una CINTA ÁMBAR
   * EN MAYÚSCULAS con borde y pase a ser texto blanco normal. Cinco modales del
   * sistema tienen la cinta, y perderla de golpe es un cambio que nadie pidió.
   *
   * Sexta cosa de la misma familia —el alto, el apilado, el padding de la
   * tarjeta, el espaciado, la referencia y esto— y se resuelve igual: parámetro,
   * con el del kit por defecto, y anotado en el registro quién declara qué.
   */
  encabezado = "tarjeta",
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
      style={{ zIndex: z }}
      className={`fixed inset-0 ${f.capa}`}
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
            {encabezado === "cinta" ? (
              <SunmiHeader title={title} color={color} />
            ) : (
              <SunmiCardHeader
                title={title}
                subtitle={subtitle}
                color={color}
              />
            )}

            {showCloseButton && onClose && (
              // `SunmiButton` no acepta `size`: lo desparramaba sobre el
              // `<button>` con el resto de los props, así que el botón nunca se
              // achicó y quedaba un atributo inválido en el DOM.
              <SunmiButton
                color="slate"
                onClick={onClose}
              >
                Cerrar
              </SunmiButton>
            )}
          </div>

          <div
            ref={refCuerpo}
            className={`flex flex-col max-h-[65vh] overflow-y-auto ${espacioCuerpo}`.trim()}
          >
            {children}
          </div>

          {footer && (
            <div className={`flex justify-end gap-2 ${espacioPie}`.trim()}>
              {footer}
            </div>
          )}
        </SunmiCard>
      </div>
    </div>
  );
}
